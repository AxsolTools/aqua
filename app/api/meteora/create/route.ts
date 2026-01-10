/**
 * Propel Curve - Meteora DBC Token Creation API
 * 
 * Creates tokens on Meteora's Dynamic Bonding Curve with custom curves
 * Uses existing AQUA infrastructure for wallet management and fees
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { 
  validateBalanceForTransaction, 
  collectPlatformFee, 
  TOKEN_CREATION_FEE_LAMPORTS, 
  TOKEN_CREATION_FEE_SOL 
} from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { getReferrer, addReferralEarnings } from '@/lib/referral';
import {
  createMeteoraTokenComplete,
  validateMeteoraParams,
  PROPEL_CURVE_PRESETS,
  presetToCurveRanges,
  calculateSqrtPrice,
  METEORA_CONFIG_KEYS,
  WSOL_MINT,
  USDC_MINT,
  type CurveRange,
} from '@/lib/blockchain/meteora-dbc-complete';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MIN_CREATE_BALANCE_SOL = 0.1; // Minimum SOL needed

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Auth headers
    const sessionId = request.headers.get('x-session-id');
    const walletAddress = request.headers.get('x-wallet-address');
    const userId = request.headers.get('x-user-id');

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }

    const adminClient = getAdminClient();
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

    // Parse request body
    const body = await request.json();
    const {
      // Basic info
      name,
      symbol,
      description,
      image,
      website,
      twitter,
      telegram,
      discord,
      
      // Token settings
      decimals = 6,
      totalSupply,
      
      // Curve configuration
      preset, // 'smooth', 'explosive', 'whale_trap', 'diamond_hands', or 'custom'
      customCurveRanges, // For custom curves
      quoteMint = 'sol', // 'sol' or 'usdc'
      migrationThresholdSol = 85,
      
      // Fee settings
      tradingFeeBps = 100,
      creatorFeePercentage = 80,
      creatorLpPercentage = 90,
      creatorLockedLpPercentage = 0,
      
      // Launch options
      initialBuySol = 0,
      
      // AQUA parameters (reuse existing)
      pourEnabled = true,
      pourRate = 2,
      pourInterval = 'hourly',
      pourSource = 'fees',
      evaporationEnabled = false,
      evaporationRate = 1,
      feeToLiquidity = 25,
      feeToCreator = 75,
      autoClaimEnabled = true,
      claimThreshold = 0.1,
      claimInterval = 'daily',
    } = body;

    console.log('[PROPEL-CURVE] Creating token:', name, symbol);
    console.log('[PROPEL-CURVE] Preset:', preset);
    console.log('[PROPEL-CURVE] Quote mint:', quoteMint);

    // ========== VALIDATION ==========
    if (!name || !symbol || !description) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Name, symbol, and description are required' } },
        { status: 400 }
      );
    }

    // Get wallet keypair
    const { data: wallet, error: walletError } = await (adminClient
      .from('wallets') as any)
      .select('encrypted_private_key')
      .eq('session_id', sessionId)
      .eq('public_key', walletAddress)
      .single();

    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: 'Wallet not found' } },
        { status: 404 }
      );
    }

    // Decrypt private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient);
    const privateKeyBase58 = decryptPrivateKey(wallet.encrypted_private_key, sessionId, serviceSalt);
    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // ========== BALANCE VALIDATION ==========
    const estimatedCostSol = MIN_CREATE_BALANCE_SOL + initialBuySol + TOKEN_CREATION_FEE_SOL;
    const operationLamports = solToLamports(estimatedCostSol);
    const priorityFeeLamports = solToLamports(0.001);

    const balanceValidation = await validateBalanceForTransaction(
      connection,
      walletAddress,
      operationLamports,
      priorityFeeLamports
    );

    if (!balanceValidation.sufficient) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 2001,
            message: balanceValidation.error || 'Insufficient balance',
            breakdown: {
              currentBalance: lamportsToSol(balanceValidation.currentBalance).toFixed(9),
              required: lamportsToSol(balanceValidation.requiredTotal).toFixed(9),
              shortfall: balanceValidation.shortfall ? lamportsToSol(balanceValidation.shortfall).toFixed(9) : undefined,
            },
          },
        },
        { status: 400 }
      );
    }

    // ========== BUILD CURVE CONFIGURATION ==========
    let curveRanges: CurveRange[];
    
    if (preset && preset !== 'custom') {
      // Use preset
      const presetKey = preset.toUpperCase() as keyof typeof PROPEL_CURVE_PRESETS;
      const presetConfig = PROPEL_CURVE_PRESETS[presetKey];
      
      if (!presetConfig) {
        return NextResponse.json(
          { success: false, error: { code: 4003, message: 'Invalid preset' } },
          { status: 400 }
        );
      }
      
      curveRanges = presetToCurveRanges(presetConfig);
    } else if (customCurveRanges && Array.isArray(customCurveRanges)) {
      // Use custom curve
      curveRanges = customCurveRanges.map((range: any) => ({
        sqrtPrice: calculateSqrtPrice(range.price),
        liquidity: BigInt(Math.floor(range.liquidity * 1e9)),
      }));
    } else {
      // Default to smooth preset
      curveRanges = presetToCurveRanges(PROPEL_CURVE_PRESETS.SMOOTH);
    }

    // Determine quote mint
    const selectedQuoteMint = quoteMint === 'usdc' ? USDC_MINT : WSOL_MINT;
    
    // Calculate migration threshold in lamports
    const migrationThreshold = BigInt(Math.floor(migrationThresholdSol * 1e9));
    
    // Calculate start price (first range)
    const sqrtStartPrice = curveRanges[0].sqrtPrice;

    // Validate curve parameters
    const validation = validateMeteoraParams({
      name,
      symbol,
      curveRanges,
      migrationThreshold,
    });

    if (!validation.valid) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4002, 
            message: 'Validation failed', 
            details: validation.errors 
          } 
        },
        { status: 400 }
      );
    }

    // ========== CREATE TOKEN ON METEORA DBC ==========
    console.log('[PROPEL-CURVE] Creating token on Meteora DBC...');
    
    // Select config key based on migration fee option (default to 1% fee on DAMM v2)
    const selectedConfigKey = METEORA_CONFIG_KEYS.DAMM_V2_100;
    
    const createResult = await createMeteoraTokenComplete(connection, {
      metadata: {
        name,
        symbol,
        description,
        image: image || 'https://aqua.launchpad/placeholder.png',
        website,
        twitter,
        telegram,
      },
      creatorKeypair,
      quoteMint: selectedQuoteMint,
      configKey: selectedConfigKey,
      sqrtStartPrice,
      curveRanges,
      migrationQuoteThreshold: migrationThreshold,
      decimals,
      totalSupply: totalSupply ? BigInt(totalSupply) : undefined,
      tradingFeeBps,
      creatorFeePercentage,
      creatorLpPercentage,
      creatorLockedLpPercentage,
      initialBuySol,
    });

    if (!createResult.success || !createResult.mintAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: createResult.error || 'Meteora token creation failed' 
          } 
        },
        { status: 500 }
      );
    }

    console.log('[PROPEL-CURVE] ✅ Token created successfully!');
    console.log('[PROPEL-CURVE] Mint:', createResult.mintAddress);
    console.log('[PROPEL-CURVE] Pool:', createResult.poolAddress);
    console.log('[PROPEL-CURVE] TX:', createResult.txSignature);

    // ========== COLLECT PLATFORM FEE ==========
    const feeBaseSol = initialBuySol;
    const percentageFeeLamports = calculatePlatformFee(solToLamports(feeBaseSol));
    const totalFeeLamports = percentageFeeLamports + TOKEN_CREATION_FEE_LAMPORTS;

    const referrerUserId = userId ? await getReferrer(userId) : null;
    let referrerWallet;

    if (referrerUserId) {
      const { data: referrerData } = await (adminClient
        .from('users') as any)
        .select('main_wallet_address')
        .eq('id', referrerUserId)
        .single();

      if (referrerData?.main_wallet_address) {
        referrerWallet = new PublicKey(referrerData.main_wallet_address);
      }
    }

    const feeResult = await collectPlatformFee(
      connection,
      creatorKeypair,
      solToLamports(feeBaseSol),
      referrerWallet,
      5000,
      TOKEN_CREATION_FEE_LAMPORTS
    );

    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || 'anonymous',
        'meteora_create'
      );
    }

    // ========== CREATE DATABASE RECORDS ==========
    
    // Ensure user exists
    let finalUserId: string | null = userId || null;
    if (userId) {
      const { data: existingUserById } = await (adminClient
        .from('users') as any)
        .select('id')
        .eq('id', userId)
        .single();
      
      if (existingUserById) {
        finalUserId = existingUserById.id;
      } else {
        const { data: existingUserByWallet } = await (adminClient
          .from('users') as any)
          .select('id')
          .eq('main_wallet_address', walletAddress)
          .single();
        
        if (existingUserByWallet) {
          finalUserId = existingUserByWallet.id;
        } else {
          const { data: newUser, error: userError } = await (adminClient
            .from('users') as any)
            .insert({
              id: userId,
              main_wallet_address: walletAddress,
            })
            .select('id')
            .single();
          
          if (userError || !newUser) {
            const { data: existingUser } = await (adminClient
              .from('users') as any)
              .select('id')
              .eq('main_wallet_address', walletAddress)
              .single();
            
            if (existingUser) {
              finalUserId = existingUser.id;
            } else {
              console.warn('[PROPEL-CURVE] Failed to create/find user record, proceeding with NULL creator_id:', userError);
              finalUserId = null;
            }
          } else {
            finalUserId = newUser.id;
          }
        }
      }
    } else {
      finalUserId = null;
    }
    
    // Create token record
    const { data: token, error: insertError } = await (adminClient
      .from('tokens') as any)
      .insert({
        creator_id: finalUserId,
        creator_wallet: walletAddress,
        mint_address: createResult.mintAddress,
        name,
        symbol,
        description,
        image_url: createResult.imageUrl || '',
        metadata_uri: createResult.metadataUri || '',
        total_supply: totalSupply,
        decimals,
        stage: 'bonding',
        migration_threshold: migrationThresholdSol,
        website,
        twitter,
        telegram,
        discord,
        launch_tx_signature: createResult.txSignature,
        initial_buy_sol: initialBuySol,
        price_sol: 0,
        price_usd: 0,
        market_cap: 0,
        current_liquidity: initialBuySol,
        volume_24h: initialBuySol,
        change_24h: 0,
        holders: 1,
        water_level: 50,
        constellation_strength: 50,
        // Meteora specific
        pool_type: 'meteora',
        dbc_pool_address: createResult.poolAddress || null,
        // Mark as created on our platform
        is_platform_token: true,
      })
      .select('id')
      .single();

    if (insertError || !token) {
      console.error('[PROPEL-CURVE] Database insert error:', insertError);
      return NextResponse.json({
        success: true,
        data: {
          mintAddress: createResult.mintAddress,
          txSignature: createResult.txSignature,
          poolAddress: createResult.poolAddress,
          warning: 'Token created on chain but database record may need recovery',
        },
      });
    }

    // Convert intervals to seconds
    const pourIntervalSeconds = pourInterval === 'hourly' ? 3600 : 86400;
    const claimIntervalSeconds = claimInterval === 'hourly' ? 3600 : claimInterval === 'daily' ? 86400 : 604800;

    // Create token parameters with AQUA settings
    await (adminClient.from('token_parameters') as any).insert({
      token_id: token.id,
      creator_wallet: walletAddress,
      
      // Pour Rate settings
      pour_enabled: pourEnabled,
      pour_rate_percent: pourRate,
      pour_interval_seconds: pourIntervalSeconds,
      pour_source: pourSource,
      pour_max_per_interval_sol: 1.0,
      pour_min_trigger_sol: 0.01,
      
      // Evaporation settings
      evaporation_enabled: evaporationEnabled,
      evaporation_rate_percent: evaporationRate,
      evaporation_interval_seconds: 86400,
      evaporation_source: 'fees',
      
      // Fee distribution
      fee_to_liquidity_percent: feeToLiquidity,
      fee_to_creator_percent: feeToCreator,
      
      // Auto-harvest settings
      auto_claim_enabled: autoClaimEnabled,
      claim_threshold_sol: claimThreshold,
      claim_interval_seconds: claimIntervalSeconds,
      claim_destination_wallet: walletAddress,
      
      // Advanced settings
      migration_target: 'meteora',
      treasury_wallet: walletAddress,
      dev_wallet_address: walletAddress,
      dev_wallet_auto_enabled: true,
    });

    // Create tide harvest record
    await (adminClient.from('tide_harvest_logs') as any).insert({
      token_id: token.id,
      creator_id: userId,
      amount_sol: 0,
      destination_wallet: walletAddress,
      status: 'pending',
    });

    // Log platform fee
    await (adminClient.from('platform_fees') as any).insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: createResult.txSignature,
      operation_type: 'meteora_create',
      transaction_amount_lamports: Number(solToLamports(feeBaseSol)),
      fee_amount_lamports: Number(totalFeeLamports),
      fee_percentage: 2,
      referral_split_lamports: feeResult.referralShare ? Number(feeResult.referralShare) : 0,
      referrer_id: referrerUserId,
      fee_tx_signature: feeResult.signature,
      fee_collected_at: feeResult.success ? new Date().toISOString() : null,
      status: feeResult.success ? 'collected' : 'pending',
    });

    console.log('[PROPEL-CURVE] ✅ Database records created');

    return NextResponse.json({
      success: true,
      data: {
        tokenId: token.id,
        mintAddress: createResult.mintAddress,
        poolAddress: createResult.poolAddress,
        metadataUri: createResult.metadataUri,
        txSignature: createResult.txSignature,
        platformFee: lamportsToSol(totalFeeLamports),
        pool: 'meteora',
        preset: preset || 'custom',
        curveParams: {
          quoteMint: quoteMint,
          migrationThreshold: migrationThresholdSol,
          ranges: curveRanges.length,
        },
      },
    });

  } catch (error) {
    console.error('[PROPEL-CURVE] Create error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 4000,
          message: 'Token creation failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}
