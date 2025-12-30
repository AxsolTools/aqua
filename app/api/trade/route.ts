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

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Wallet connection required' } },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { action, tokenMint, amount, slippageBps = 500 } = body;

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
    const userKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    // Get token info
    const { data: token } = await adminClient
      .from('tokens')
      .select('id, stage, creator_wallet')
      .eq('mint_address', tokenMint)
      .single();

    // ========== BALANCE VALIDATION ==========
    const operationLamports = action === 'buy' ? solToLamports(amount) : 0n;
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

    if (action === 'buy') {
      tradeResult = await buyOnBondingCurve(connection, {
        tokenMint,
        walletKeypair: userKeypair,
        amountSol: amount,
        slippageBps,
      });
    } else {
      // For sells, amount is in tokens
      tradeResult = await sellOnBondingCurve(connection, {
        tokenMint,
        walletKeypair: userKeypair,
        amountSol: 0, // Not used for sells
        amountTokens: amount,
        slippageBps,
      });
    }

    if (!tradeResult.success) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: tradeResult.error || 'Trade failed' } },
        { status: 500 }
      );
    }

    // ========== COLLECT PLATFORM FEE ==========
    const tradedSol = tradeResult.amountSol || amount;
    const platformFeeLamports = calculatePlatformFee(solToLamports(tradedSol));
    
    // Check if user was referred
    const referrerUserId = userId ? await getReferrer(userId) : null;
    let referrerWallet: PublicKey | undefined;

    if (referrerUserId) {
      const { data: referrerData } = await adminClient
        .from('users')
        .select('main_wallet_address')
        .eq('id', referrerUserId)
        .single();

      if (referrerData?.main_wallet_address) {
        referrerWallet = new PublicKey(referrerData.main_wallet_address);
      }
    }

    // Collect fee
    const feeResult = await collectPlatformFee(
      connection,
      userKeypair,
      solToLamports(tradedSol),
      referrerWallet
    );

    // Add referral earnings if applicable
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || 'anonymous',
        `token_${action}`
      );
    }

    // ========== LOG TRADE ==========
    if (token) {
      await adminClient.from('trades').insert({
        token_id: token.id,
        user_id: userId,
        wallet_address: walletAddress,
        trade_type: action,
        amount_sol: tradedSol,
        amount_tokens: tradeResult.amountTokens || amount,
        price_per_token_sol: tradeResult.pricePerToken || 0,
        platform_fee_lamports: Number(platformFeeLamports),
        tx_signature: tradeResult.txSignature,
        status: 'confirmed',
      });
    }

    // Log platform fee
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
    });

    return NextResponse.json({
      success: true,
      data: {
        action,
        tokenMint,
        amountSol: tradedSol,
        amountTokens: tradeResult.amountTokens,
        txSignature: tradeResult.txSignature,
        platformFee: lamportsToSol(platformFeeLamports),
        feeTxSignature: feeResult.signature,
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

