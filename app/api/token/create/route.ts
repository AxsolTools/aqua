/**
 * AQUA Launchpad - Token Creation API
 * 
 * Creates a new token on Pump.fun via PumpPortal
 * Includes:
 * - IPFS metadata upload
 * - Token creation on bonding curve
 * - Optional initial buy
 * - Fee collection
 * - Database record creation
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee } from '@/lib/fees';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { createToken, uploadToIPFS, type TokenMetadata } from '@/lib/blockchain';
import { getReferrer, addReferralEarnings } from '@/lib/referral';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const MIN_CREATE_BALANCE_SOL = 0.05; // Minimum SOL needed to create token

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get auth headers
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
      image, // Base64 or URL
      
      // Social links
      website,
      twitter,
      telegram,
      discord,
      
      // Token settings
      totalSupply = 1_000_000_000,
      decimals = 9,
      
      // AQUA parameters
      pourRate = 50,
      pourEnabled = true,
      evaporationRate = 0,
      evaporationEnabled = false,
      migrationThreshold = 85,
      migrationTarget = 'raydium',
      
      // Fee distribution
      feeToLiquidity = 25,
      feeToCreator = 75,
      
      // Launch options
      initialBuySol = 0,
      slippageBps = 500,
      
      // Pre-generated mint keypair from frontend
      mintSecretKey,
      mintAddress: preGeneratedMintAddress,
    } = body;

    // Validate required fields
    if (!name || !symbol || !description) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Name, symbol, and description are required' } },
        { status: 400 }
      );
    }

    if (symbol.length > 10) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'Symbol must be 10 characters or less' } },
        { status: 400 }
      );
    }

    // Get user's wallet keypair
    const { data: wallet, error: walletError } = await adminClient
      .from('wallets')
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
    const estimatedCostSol = MIN_CREATE_BALANCE_SOL + initialBuySol;
    const operationLamports = solToLamports(estimatedCostSol);
    const priorityFeeLamports = solToLamports(0.001);

    const validation = await validateBalanceForTransaction(
      connection,
      walletAddress,
      operationLamports,
      priorityFeeLamports
    );

    if (!validation.sufficient) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 2001,
            message: validation.error || 'Insufficient balance',
            breakdown: {
              currentBalance: lamportsToSol(validation.currentBalance).toFixed(9),
              required: lamportsToSol(validation.requiredTotal).toFixed(9),
              shortfall: validation.shortfall ? lamportsToSol(validation.shortfall).toFixed(9) : undefined,
            },
          },
        },
        { status: 400 }
      );
    }

    // ========== CREATE TOKEN ON CHAIN ==========
    console.log(`[TOKEN] Creating token: ${name} (${symbol})`);

    // Decode pre-generated mint keypair from frontend if provided
    let mintKeypair: Keypair | undefined;
    if (mintSecretKey) {
      try {
        mintKeypair = Keypair.fromSecretKey(bs58.decode(mintSecretKey));
        console.log(`[TOKEN] Using pre-generated mint: ${mintKeypair.publicKey.toBase58()}`);
        
        // Verify it matches the claimed address
        if (preGeneratedMintAddress && mintKeypair.publicKey.toBase58() !== preGeneratedMintAddress) {
          console.warn(`[TOKEN] Mint address mismatch! Frontend: ${preGeneratedMintAddress}, Decoded: ${mintKeypair.publicKey.toBase58()}`);
        }
      } catch (decodeError) {
        console.warn('[TOKEN] Failed to decode mint keypair, will generate new one');
        mintKeypair = undefined;
      }
    }

    // Prepare metadata
    const metadata: TokenMetadata = {
      name,
      symbol,
      description,
      image: image || 'https://aqua.launchpad/placeholder.png',
      website,
      twitter,
      telegram,
      showName: true,
    };

    // Create token via PumpPortal
    const createResult = await createToken(connection, {
      metadata,
      creatorKeypair,
      initialBuySol,
      slippageBps,
      priorityFee: 0.001,
      mintKeypair, // Pass pre-generated mint keypair if available
    });

    if (!createResult.success || !createResult.mintAddress) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4000, 
            message: createResult.error || 'Token creation failed on chain' 
          } 
        },
        { status: 500 }
      );
    }

    // ========== COLLECT PLATFORM FEE ==========
    const feeBaseSol = MIN_CREATE_BALANCE_SOL + initialBuySol;
    const platformFeeLamports = calculatePlatformFee(solToLamports(feeBaseSol));

    // Check for referrer
    const referrerUserId = userId ? await getReferrer(userId) : null;
    let referrerWallet;

    if (referrerUserId) {
      const { data: referrerData } = await adminClient
        .from('users')
        .select('main_wallet_address')
        .eq('id', referrerUserId)
        .single();

      if (referrerData?.main_wallet_address) {
        const { PublicKey } = await import('@solana/web3.js');
        referrerWallet = new PublicKey(referrerData.main_wallet_address);
      }
    }

    const feeResult = await collectPlatformFee(
      connection,
      creatorKeypair,
      solToLamports(feeBaseSol),
      referrerWallet
    );

    // Add referral earnings
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || 'anonymous',
        'token_create'
      );
    }

    // ========== CREATE DATABASE RECORDS ==========
    
    // Ensure user exists in users table (upsert by wallet address)
    let finalUserId = userId;
    if (userId) {
      // First check if user exists by ID
      const { data: existingUserById } = await adminClient
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();
      
      if (existingUserById) {
        finalUserId = existingUserById.id;
      } else {
        // User doesn't exist by ID, check by wallet address
        const { data: existingUserByWallet } = await adminClient
          .from('users')
          .select('id')
          .eq('main_wallet_address', walletAddress)
          .single();
        
        if (existingUserByWallet) {
          // User exists with this wallet, use that ID
          finalUserId = existingUserByWallet.id;
        } else {
          // Create new user with the provided userId
          const { data: newUser, error: userError } = await adminClient
            .from('users')
            .insert({
              id: userId,
              main_wallet_address: walletAddress,
            })
            .select('id')
            .single();
          
          if (userError || !newUser) {
            // If insert fails (e.g., duplicate wallet), try to get existing user
            const { data: existingUser } = await adminClient
              .from('users')
              .select('id')
              .eq('main_wallet_address', walletAddress)
              .single();
            
            if (existingUser) {
              finalUserId = existingUser.id;
            } else {
              console.warn('[TOKEN] Failed to create/find user record, proceeding with NULL creator_id:', userError);
              finalUserId = null; // Set to null if user creation fails
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
    const { data: token, error: insertError } = await adminClient
      .from('tokens')
      .insert({
        creator_id: finalUserId, // Use finalUserId which may be null
        creator_wallet: walletAddress,
        mint_address: createResult.mintAddress,
        name,
        symbol,
        description,
        image_url: metadata.image,
        metadata_uri: createResult.metadataUri,
        total_supply: totalSupply,
        decimals,
        stage: 'bonding',
        migration_threshold: migrationThreshold,
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
      })
      .select('id')
      .single();

    if (insertError || !token) {
      console.error('[TOKEN] Database insert error:', insertError);
      // Token was created on chain but DB insert failed - log for recovery
      return NextResponse.json({
        success: true,
        data: {
          mintAddress: createResult.mintAddress,
          txSignature: createResult.txSignature,
          warning: 'Token created on chain but database record may need recovery',
        },
      });
    }

    // Create token parameters with AQUA settings
    await adminClient.from('token_parameters').insert({
      token_id: token.id,
      creator_wallet: walletAddress,
      pour_enabled: pourEnabled,
      pour_rate_percent: pourRate,
      pour_interval_seconds: 3600,
      pour_source: 'fees',
      evaporation_enabled: evaporationEnabled,
      evaporation_rate_percent: evaporationRate,
      fee_to_liquidity_percent: feeToLiquidity,
      fee_to_creator_percent: feeToCreator,
      migration_target: migrationTarget,
      dev_wallet_address: walletAddress,
      dev_wallet_auto_enabled: true,
    });

    // Create tide harvest record
    await adminClient.from('tide_harvest_logs').insert({
      token_id: token.id,
      creator_id: userId,
      amount_sol: 0,
      destination_wallet: walletAddress,
      status: 'pending',
    });

    // Log platform fee
    await adminClient.from('platform_fees').insert({
      user_id: userId,
      wallet_address: walletAddress,
      source_tx_signature: createResult.txSignature,
      operation_type: 'token_create',
      transaction_amount_lamports: Number(solToLamports(feeBaseSol)),
      fee_amount_lamports: Number(platformFeeLamports),
      fee_percentage: 2,
      referral_split_lamports: feeResult.referralShare ? Number(feeResult.referralShare) : 0,
      referrer_id: referrerUserId,
      fee_tx_signature: feeResult.signature,
      fee_collected_at: feeResult.success ? new Date().toISOString() : null,
      status: feeResult.success ? 'collected' : 'pending',
    });

    console.log(`[TOKEN] Created successfully: ${createResult.mintAddress}`);

    return NextResponse.json({
      success: true,
      data: {
        tokenId: token.id,
        mintAddress: createResult.mintAddress,
        metadataUri: createResult.metadataUri,
        txSignature: createResult.txSignature,
        platformFee: lamportsToSol(platformFeeLamports),
      },
    });

  } catch (error) {
    console.error('[TOKEN] Create error:', error);
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
