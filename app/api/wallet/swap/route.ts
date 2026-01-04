/**
 * AQUA Launchpad - Wallet Swap API
 * Swap SOL <-> USD1 for any wallet
 * Uses the proven Jupiter swap implementation from jupiter-studio.ts
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getAdminClient } from '@/lib/supabase/admin';
import { decryptPrivateKey, getOrCreateServiceSalt } from '@/lib/crypto';
import { executeJupiterSwap } from '@/lib/blockchain/jupiter-studio';

// USD1 and SOL mint addresses
const USD1_MINT = 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

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
      direction, // 'sol_to_usd1' or 'usd1_to_sol'
      amount,    // Amount to swap (in SOL or USD1 depending on direction)
      slippageBps = 500, // Default 5% slippage (matches /api/trade)
    } = body;

    // Validate required fields
    if (!direction || !amount) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'direction and amount are required' } },
        { status: 400 }
      );
    }

    if (!['sol_to_usd1', 'usd1_to_sol'].includes(direction)) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'direction must be sol_to_usd1 or usd1_to_sol' } },
        { status: 400 }
      );
    }

    const amountNum = parseFloat(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 4002, message: 'amount must be a positive number' } },
        { status: 400 }
      );
    }

    // Get user's wallet keypair
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
    const walletKeypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58));

    console.log(`[SWAP] ${direction}: ${amountNum} from wallet ${walletAddress.slice(0, 8)}...`);

    // Use the proven executeJupiterSwap from jupiter-studio.ts
    // This implementation handles low-liquidity tokens properly with:
    // - skipPreflight: true
    // - useSharedAccounts: false for sells
    // - restrictIntermediateTokens: true
    // - Proper on-chain error checking
    const swapResult = await executeJupiterSwap(connection, {
      walletKeypair,
      tokenMint: USD1_MINT,
      action: direction === 'sol_to_usd1' ? 'buy' : 'sell',
      amount: amountNum,
      slippageBps: Math.max(slippageBps, 1000), // Minimum 10% slippage for USD1 pairs
      tokenDecimals: 6, // USD1 has 6 decimals
    });

    if (!swapResult.success) {
      console.error(`[SWAP] Failed:`, swapResult.error);
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            code: 4001, 
            message: `Swap failed: ${swapResult.error}` 
          } 
        },
        { status: 500 }
      );
    }

    console.log(`[SWAP] ✅ Success: ${swapResult.amountSol} SOL <-> ${swapResult.amountTokens} USD1`);

    // Return output in consistent format
    const inputAmount = direction === 'sol_to_usd1' ? swapResult.amountSol : swapResult.amountTokens;
    const outputAmount = direction === 'sol_to_usd1' ? swapResult.amountTokens : swapResult.amountSol;

    return NextResponse.json({
      success: true,
      data: {
        direction,
        inputAmount,
        outputAmount,
        txSignature: swapResult.txSignature,
      },
    });

  } catch (error) {
    console.error('[SWAP] Error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          code: 5000, 
          message: error instanceof Error ? error.message : 'Swap failed' 
        } 
      },
      { status: 500 }
    );
  }
}

