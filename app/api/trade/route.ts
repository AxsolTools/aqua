/**
 * AQUA Launchpad - Trade API
 * 
 * Unified trading endpoint for buy/sell operations
 * Includes balance validation, fee collection, and referral tracking
 * 
 * POST /api/trade
 * {
 *   action: 'buy' | 'sell',
 *   tokenMint: string,
 *   amount: number,
 *   slippageBps?: number,
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { validateBalanceForTransaction, collectPlatformFee, getEstimatedFeesForDisplay } from '@/lib/fees';
import { getReferrer, addReferralEarnings, calculateReferrerShare } from '@/lib/referral';
import { solToLamports, lamportsToSol, calculatePlatformFee } from '@/lib/precision';
import { buyOnBondingCurve, sellOnBondingCurve } from '@/lib/blockchain';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Get auth headers
    const sessionId = request.headers.get('x-session-id');
    const walletAddress = request.headers.get('x-wallet-address');
    const userId = request.headers.get('x-user-id');

    console.log('[TRADE] Request received:', {
      hasSessionId: !!sessionId,
      sessionIdPrefix: sessionId?.slice(0, 8),
      hasWalletAddress: !!walletAddress,
      walletPrefix: walletAddress?.slice(0, 8),
      hasUserId: !!userId,
    });

    if (!sessionId || !walletAddress) {
      console.error('[TRADE] Missing auth headers:', { sessionId: !!sessionId, walletAddress: !!walletAddress });
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action, tokenMint, amount, slippageBps = 500, tokenDecimals = 6 } = body;
    
    console.log('[TRADE] Request body:', { action, tokenMint: tokenMint?.slice(0, 8), amount, slippageBps, tokenDecimals });

    // Validate action
    if (!['buy', 'sell'].includes(action)) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: 'Invalid action. Use "buy" or "sell"' } },
        { status: 400 }
      );
    }

    // Validate amount
    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: 'Invalid amount' } },
        { status: 400 }
      );
    }

    // Validate token mint
    if (!tokenMint || tokenMint.length < 32) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Invalid token mint address' } },
        { status: 400 }
      );
    }

    const adminClient = getAdminClient();
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

    // Get user's wallet keypair
    console.log('[TRADE] Looking up wallet:', { sessionId: sessionId.slice(0, 8), walletAddress: walletAddress.slice(0, 8) });
    
    const { data: wallet, error: walletError } = await adminClient
      .from('wallets')
      .select('encrypted_private_key')
      .eq('session_id', sessionId)
      .eq('public_key', walletAddress)
      .single();

    if (walletError || !wallet) {
      console.error('[TRADE] Wallet lookup failed:', {
        error: walletError?.message || 'No wallet found',
        code: walletError?.code,
        sessionId: sessionId.slice(0, 8),
        walletAddress: walletAddress.slice(0, 8),
      });
      
      // Check if any wallet exists for this session
      const { data: allWallets, error: listError } = await adminClient
        .from('wallets')
        .select('public_key')
        .eq('session_id', sessionId);
      
      console.log('[TRADE] Wallets for this session:', allWallets?.map((w: any) => w.public_key?.slice(0, 8)) || 'none');
      
      return NextResponse.json(
        { success: false, error: { code: 1003, message: 'Wallet not found. Please reconnect your wallet.' } },
        { status: 404 }
      );
    }
    
    console.log('[TRADE] Wallet found, decrypting private key...');

    // Decrypt private key
    let userKeypair: Keypair;
    try {
      const serviceSalt = await getOrCreateServiceSalt(adminClient);
      const privateKeyBase58 = decryptPrivateKey((wallet as any).encrypted_private_key, sessionId, serviceSalt);
      userKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));
      console.log('[TRADE] Private key decrypted successfully for wallet:', userKeypair.publicKey.toBase58().slice(0, 8));
    } catch (decryptError) {
      console.error('[TRADE] Failed to decrypt private key:', decryptError);
      return NextResponse.json(
        { success: false, error: { code: 1002, message: 'Session invalid. Please reconnect your wallet.' } },
        { status: 401 }
      );
    }

    // Get token info including pool_type for routing
    const { data: token } = await adminClient
      .from('tokens')
      .select('id, stage, creator_wallet, pool_type, dbc_pool_address, decimals')
      .eq('mint_address', tokenMint)
      .single();

    // Determine if this is a Jupiter DBC token
    const isJupiterToken = (token as any)?.pool_type === 'jupiter';
    
    // Use token decimals from DB if available, otherwise use request value
    const effectiveDecimals = (token as any)?.decimals ?? tokenDecimals;
    
    if (isJupiterToken) {
      console.log('[TRADE] Detected Jupiter DBC token, using Jupiter swap API');
      console.log('[TRADE] Token info:', {
        poolType: (token as any)?.pool_type,
        dbcPoolAddress: (token as any)?.dbc_pool_address?.slice(0, 12),
        decimals: effectiveDecimals,
      });
    }

    // ========== BALANCE VALIDATION ==========
    const operationLamports = action === 'buy' ? solToLamports(amount) : BigInt(0);
    const priorityFeeLamports = solToLamports(0.0001); // Small priority fee

    if (action === 'buy') {
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
    }

    // ========== EXECUTE TRADE ==========
    let tradeResult;

    console.log('[TRADE] Executing trade:', {
      isJupiterToken,
      poolType: (token as any)?.pool_type,
      action,
      amount,
      slippageBps,
      tokenDecimals,
      wallet: userKeypair.publicKey.toBase58().slice(0, 12),
    });

    if (isJupiterToken) {
      // Use Jupiter swap API for Jupiter DBC tokens
      console.log('[TRADE] ========== JUPITER SWAP START ==========');
      
      // Jupiter DBC tokens use USDC as quote currency, so sells go Token -> USDC -> SOL
      // This multi-hop routing compounds slippage significantly
      // Use 30% for sells to handle complex multi-hop routes, 5% for buys
      const minSlippageForJupiter = action === 'sell' ? 3000 : 500; // 30% for sells, 5% for buys
      const effectiveSlippageBps = Math.max(slippageBps, minSlippageForJupiter);
      
      // DEBUG: Detailed logging for Jupiter trades
      console.log('[TRADE] ===== JUPITER DEBUG START =====');
      console.log('[TRADE] Action:', action);
      console.log('[TRADE] Token mint:', tokenMint);
      console.log('[TRADE] Amount (raw from request):', amount);
      console.log('[TRADE] Amount type:', typeof amount);
      console.log('[TRADE] Token decimals from request:', tokenDecimals);
      console.log('[TRADE] Token decimals from DB:', (token as any)?.decimals);
      console.log('[TRADE] Effective decimals:', effectiveDecimals);
      console.log('[TRADE] Slippage from request:', slippageBps);
      console.log('[TRADE] Effective slippage:', effectiveSlippageBps);
      console.log('[TRADE] Pool type:', (token as any)?.pool_type);
      console.log('[TRADE] DBC pool address:', (token as any)?.dbc_pool_address);
      console.log('[TRADE] Wallet:', userKeypair.publicKey.toBase58());
      
      if (action === 'sell') {
        const expectedRawAmount = Math.floor(amount * Math.pow(10, effectiveDecimals));
        console.log('[TRADE] SELL - Expected raw amount to Jupiter:', expectedRawAmount);
        console.log('[TRADE] SELL - Calculation: ', amount, '*', Math.pow(10, effectiveDecimals), '=', expectedRawAmount);
      }
      console.log('[TRADE] ===== JUPITER DEBUG END =====');
      
      console.log('[TRADE] Jupiter token detected:', {
        tokenMint: tokenMint.slice(0, 12),
        poolType: (token as any)?.pool_type,
        dbcPoolAddress: (token as any)?.dbc_pool_address?.slice(0, 12),
        action,
        amount,
        requestedSlippageBps: slippageBps,
        effectiveSlippageBps,
        tokenDecimals,
        walletAddress: userKeypair.publicKey.toBase58().slice(0, 12),
      });
      
      const { executeJupiterSwap } = await import('@/lib/blockchain/jupiter-studio');
      
      const startTime = Date.now();
      tradeResult = await executeJupiterSwap(connection, {
        walletKeypair: userKeypair,
        tokenMint,
        action,
        amount, // SOL for buy, tokens for sell
        slippageBps: effectiveSlippageBps, // Use higher slippage for Jupiter tokens
        tokenDecimals: effectiveDecimals,
      });
      const duration = Date.now() - startTime;
      
      console.log('[TRADE] Jupiter swap result:', {
        success: tradeResult.success,
        txSignature: tradeResult.txSignature?.slice(0, 12),
        amountSol: tradeResult.amountSol,
        amountTokens: tradeResult.amountTokens,
        pricePerToken: tradeResult.pricePerToken,
        error: tradeResult.error,
        durationMs: duration,
      });
      console.log('[TRADE] ========== JUPITER SWAP END ==========');
    } else {
      // Use Pump.fun for standard bonding curve tokens
      console.log('[TRADE] Using Pump.fun bonding curve...');
      if (action === 'buy') {
        console.log('[TRADE] Executing buy on bonding curve:', { tokenMint: tokenMint.slice(0, 12), amountSol: amount });
        tradeResult = await buyOnBondingCurve(connection, {
          tokenMint,
          walletKeypair: userKeypair,
          amountSol: amount,
          slippageBps,
        });
      } else {
        // For sells, amount is in tokens
        console.log('[TRADE] Executing sell on bonding curve:', { tokenMint: tokenMint.slice(0, 12), amountTokens: amount });
        tradeResult = await sellOnBondingCurve(connection, {
          tokenMint,
          walletKeypair: userKeypair,
          amountSol: 0, // Not used for sells
          amountTokens: amount,
          slippageBps,
          tokenDecimals,
        });
      }
      console.log('[TRADE] Bonding curve trade result:', tradeResult);
    }

    if (!tradeResult.success) {
      // Map error messages to user-friendly descriptions
      let userMessage = tradeResult.error || 'Trade failed';
      let errorCode = 3001;
      const errorLower = (tradeResult.error || '').toLowerCase();
      
      if (errorLower.includes('insufficient') || errorLower.includes('not enough')) {
        userMessage = 'Insufficient balance for this trade';
        errorCode = 2001;
      } else if (errorLower.includes('slippage')) {
        userMessage = 'Price moved too much. Try increasing slippage tolerance.';
        errorCode = 3002;
      } else if (errorLower.includes('pumpportal')) {
        userMessage = 'Trading service temporarily unavailable. Please try again.';
        errorCode = 5001;
      } else if (errorLower.includes('sdk')) {
        userMessage = 'Backup trading service also failed. Please try again later.';
        errorCode = 5002;
      } else if (errorLower.includes('on-chain') || errorLower.includes('transaction failed')) {
        userMessage = 'Transaction failed on the blockchain. Please try again.';
        errorCode = 3003;
      } else if (errorLower.includes('quote failed') || errorLower.includes('no route')) {
        userMessage = 'Jupiter could not find a route. Token may not be indexed yet - try again in a few seconds.';
        errorCode = 3004;
      } else if (errorLower.includes('timeout') || errorLower.includes('fetch failed') || 
                 errorLower.includes('expired') || errorLower.includes('blockhash not found')) {
        userMessage = 'Transaction timed out or expired. Network may be congested - please try again.';
        errorCode = 5003;
      } else if (errorLower.includes('swap request failed') || errorLower.includes('swap failed')) {
        userMessage = 'Jupiter swap failed. Please try again with higher slippage.';
        errorCode = 3004;
      } else if (isJupiterToken) {
        // For Jupiter tokens, provide more specific message
        userMessage = `Jupiter swap failed: ${tradeResult.error}. Try again or increase slippage.`;
        errorCode = 3004;
      }
      
      console.error('[TRADE] Trade failed:', {
        action,
        tokenMint: tokenMint?.slice(0, 12),
        amount,
        isJupiterToken,
        error: tradeResult.error,
        mappedError: userMessage,
        errorCode,
        wallet: walletAddress?.slice(0, 8),
      });
      
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: errorCode, 
            message: userMessage,
            technical: tradeResult.error, // Include technical details for debugging
          } 
        },
        { status: 500 }
      );
    }

    // ========== PREPARE RESPONSE DATA ==========
    const tradedSol = tradeResult.amountSol || amount;
    const platformFeeLamports = calculatePlatformFee(solToLamports(tradedSol));

    // ========== ASYNC FEE COLLECTION (non-blocking) ==========
    // Run fee collection and logging in background - don't make user wait
    // This saves 2-5 seconds per trade while still collecting all fees
    const collectFeesAsync = async () => {
      try {
        // Check if user was referred
        const referrerUserId = userId ? await getReferrer(userId) : null;
        let referrerWallet: PublicKey | undefined;

        if (referrerUserId) {
          const { data: referrerData } = await adminClient
            .from('users')
            .select('main_wallet_address')
            .eq('id', referrerUserId)
            .single();

          if ((referrerData as any)?.main_wallet_address) {
            referrerWallet = new PublicKey((referrerData as any).main_wallet_address);
          }
        }

        // Collect fee (this is the slow part - another on-chain transaction)
        const feeResult = await collectPlatformFee(
          connection,
          userKeypair,
          solToLamports(tradedSol),
          referrerWallet
        );

        console.log('[TRADE] Async fee collection:', {
          success: feeResult.success,
          signature: feeResult.signature?.slice(0, 12),
          tradeSol: tradedSol.toFixed(4),
        });

        // Add referral earnings if applicable
        if (feeResult.success && referrerUserId && feeResult.referralShare) {
          await addReferralEarnings(
            referrerUserId,
            lamportsToSol(feeResult.referralShare),
            userId || 'anonymous',
            `token_${action}`
          );
        }

        // Log platform fee to database
        await adminClient.from('platform_fees').insert({
          user_id: userId,
          wallet_address: walletAddress,
          source_tx_signature: tradeResult.txSignature,
          operation_type: `token_${action}`,
          transaction_amount_lamports: Number(solToLamports(tradedSol)),
          fee_amount_lamports: Number(platformFeeLamports),
          fee_percentage: 2,
          referral_split_lamports: feeResult.referralShare ? Number(feeResult.referralShare) : 0,
          referrer_id: referrerUserId,
          fee_tx_signature: feeResult.signature,
          fee_collected_at: feeResult.success ? new Date().toISOString() : null,
          status: feeResult.success ? 'collected' : 'failed',
        } as any);

      } catch (error) {
        console.error('[TRADE] Async fee collection error:', error);
        // Fee collection failed but user trade succeeded - log for manual review
        try {
          await adminClient.from('platform_fees').insert({
            user_id: userId,
            wallet_address: walletAddress,
            source_tx_signature: tradeResult.txSignature,
            operation_type: `token_${action}`,
            transaction_amount_lamports: Number(solToLamports(tradedSol)),
            fee_amount_lamports: Number(platformFeeLamports),
            fee_percentage: 2,
            status: 'pending', // Mark as pending for retry
            error_message: error instanceof Error ? error.message : 'Unknown error',
          } as any);
        } catch {
          // Ignore DB errors in error handler
        }
      }
    };

    // Start async fee collection (don't await - runs in background)
    collectFeesAsync();

    // ========== LOG TRADE (async but fast - just DB insert) ==========
    if (token) {
      // This is fast (~50ms) - run async but don't block response
      (async () => {
        try {
          await adminClient.from('trades').insert({
            token_id: (token as any).id,
            token_address: tokenMint, // Required for entry-price/PNL calculations
            user_id: userId,
            wallet_address: walletAddress,
            trade_type: action,
            amount_sol: tradedSol,
            amount_tokens: tradeResult.amountTokens || amount,
            price_per_token_sol: tradeResult.pricePerToken || 0,
            platform_fee_lamports: Number(platformFeeLamports),
            tx_signature: tradeResult.txSignature,
            status: 'confirmed',
          } as any);
        } catch (err) {
          console.error('[TRADE] Failed to log trade:', err);
        }
      })();
    }

    // ========== RETURN SUCCESS IMMEDIATELY ==========
    // User doesn't need to wait for fee collection (saves 2-5 seconds)
    return NextResponse.json({
      success: true,
      data: {
        action,
        tokenMint,
        amountSol: tradedSol,
        amountTokens: tradeResult.amountTokens,
        txSignature: tradeResult.txSignature,
        platformFee: lamportsToSol(platformFeeLamports),
        // feeTxSignature not available yet - collected async
      },
    });

  } catch (error) {
    console.error('[TRADE] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 3000,
          message: 'Trade failed',
          details: error instanceof Error ? error.message : 'Unknown error',
        },
      },
      { status: 500 }
    );
  }
}

// ========== GET - Fee Estimation ==========
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const amount = parseFloat(searchParams.get('amount') || '0');

    if (!amount || amount <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: 'Invalid amount' } },
        { status: 400 }
      );
    }

    const fees = getEstimatedFeesForDisplay(solToLamports(amount));

    return NextResponse.json({
      success: true,
      data: fees,
    });

  } catch (error) {
    console.error('[TRADE] Fee estimation error:', error);
    return NextResponse.json(
      { success: false, error: { code: 3000, message: 'Failed to estimate fees' } },
      { status: 500 }
    );
  }
}

