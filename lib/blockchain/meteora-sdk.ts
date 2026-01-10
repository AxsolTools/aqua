/**
 * Meteora DBC SDK Integration - OFFICIAL SDK
 * 
 * Uses @meteora-ag/dynamic-bonding-curve-sdk
 * Documentation: https://github.com/MeteoraAg/dynamic-bonding-curve-sdk
 */

import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js';
import BN from 'bn.js';

// Types from Meteora SDK (will be imported once SDK is installed)
export interface MeteoraSDKConfig {
  quoteMint: PublicKey;
  sqrtStartPrice: BN;
  curve: Array<{ sqrtPrice: BN; liquidity: BN }>;
  migrationQuoteThreshold: BN;
  poolFees: {
    baseFee: {
      cliffFeeNumerator: BN;
      firstFactor: number;
      secondFactor: BN;
      thirdFactor: BN;
      baseFeeMode: number;
    };
    dynamicFee?: {
      binStep: number;
      binStepU128: BN;
      baseFactor: number;
      filterPeriod: number;
      decayPeriod: number;
      reductionFactor: number;
      variableFeeControl: number;
      maxVolatilityAccumulator: number;
      minBinId: number;
      maxBinId: number;
      protocolShare: number;
    };
  };
  collectFeeMode: number; // 0 = quote only, 1 = both tokens
  migrationOption: number; // 0 = DAMM v1, 1 = DAMM v2
  activationType: number; // 0 = slot, 1 = timestamp
  tokenType: number; // 0 = SPL, 1 = Token2022
  tokenDecimal: number;
  partnerLpPercentage: number;
  partnerLockedLpPercentage: number;
  creatorLpPercentage: number;
  creatorLockedLpPercentage: number;
  feeClaimer: PublicKey;
  leftoverReceiver: PublicKey;
  lockedVesting?: {
    totalLockedVestingAmount: BN;
    cliffUnlockAmount: BN;
    numberOfVestingPeriod: BN;
    totalVestingDuration: BN;
    cliffDurationFromMigrationTime: BN;
  };
  migrationFeeOption: number;
  migrationFee?: BN;
  creatorTradingFeePercentage: number;
  tokenUpdateAuthority: number;
  tokenSupply?: BN;
}

// Re-export existing types
export * from './meteora-dbc';

/**
 * Create a pool using the official Meteora SDK
 * 
 * This is the CORRECT way to integrate with Meteora DBC
 */
export async function createMeteoraPoolWithSDK(
  connection: Connection,
  params: {
    creator: Keypair;
    mint: Keypair;
    config: PublicKey;
    metadata: {
      name: string;
      symbol: string;
      uri: string;
    };
  }
): Promise<{ success: boolean; poolAddress?: string; txSignature?: string; error?: string }> {
  try {
    console.log('[METEORA-SDK] Creating pool with official SDK...');
    
    // Import the SDK (will work once installed)
    const { DynamicBondingCurveClient } = await import('@meteora-ag/dynamic-bonding-curve-sdk');
    
    const client = new DynamicBondingCurveClient(connection, 'confirmed');
    
    // Create pool transaction
    const createPoolTx = await client.createPool({
      payer: params.creator.publicKey,
      config: params.config,
      mint: params.mint.publicKey,
      name: params.metadata.name,
      symbol: params.metadata.symbol,
      uri: params.metadata.uri,
    });
    
    // Sign and send
    createPoolTx.sign([params.creator, params.mint]);
    
    const signature = await connection.sendRawTransaction(createPoolTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    // Derive pool address
    const poolAddress = await client.deriveDbcPoolAddress(params.config, params.mint.publicKey);
    
    console.log('[METEORA-SDK] ✅ Pool created:', poolAddress.toBase58());
    
    return {
      success: true,
      poolAddress: poolAddress.toBase58(),
      txSignature: signature,
    };
    
  } catch (error) {
    console.error('[METEORA-SDK] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pool creation failed',
    };
  }
}

/**
 * Perform a swap on Meteora DBC pool
 */
export async function swapMeteoraPool(
  connection: Connection,
  params: {
    wallet: Keypair;
    pool: PublicKey;
    action: 'buy' | 'sell';
    amount: BN;
    minAmountOut: BN;
  }
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  try {
    const { DynamicBondingCurveClient } = await import('@meteora-ag/dynamic-bonding-curve-sdk');
    
    const client = new DynamicBondingCurveClient(connection, 'confirmed');
    
    // Get swap quote first
    const quote = await client.swapQuote({
      poolAddress: params.pool,
      inAmount: params.amount,
      swapForY: params.action === 'buy', // true = buy base token, false = sell
    });
    
    console.log('[METEORA-SDK] Swap quote:', {
      inAmount: quote.inAmount.toString(),
      outAmount: quote.outAmount.toString(),
      fee: quote.fee.toString(),
    });
    
    // Execute swap
    const swapTx = await client.swap({
      user: params.wallet.publicKey,
      poolAddress: params.pool,
      inAmount: params.amount,
      minAmountOut: params.minAmountOut,
      swapForY: params.action === 'buy',
    });
    
    swapTx.sign([params.wallet]);
    
    const signature = await connection.sendRawTransaction(swapTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log('[METEORA-SDK] ✅ Swap successful:', signature);
    
    return { success: true, txSignature: signature };
    
  } catch (error) {
    console.error('[METEORA-SDK] Swap error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Swap failed',
    };
  }
}

/**
 * Claim creator trading fees
 */
export async function claimMeteoraCreatorFees(
  connection: Connection,
  creator: Keypair,
  pool: PublicKey
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  try {
    const { DynamicBondingCurveClient } = await import('@meteora-ag/dynamic-bonding-curve-sdk');
    
    const client = new DynamicBondingCurveClient(connection, 'confirmed');
    
    // Claim fees
    const claimTx = await client.claimCreatorTradingFee({
      creator: creator.publicKey,
      poolAddress: pool,
    });
    
    claimTx.sign([creator]);
    
    const signature = await connection.sendRawTransaction(claimTx.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log('[METEORA-SDK] ✅ Fees claimed:', signature);
    
    return { success: true, txSignature: signature };
    
  } catch (error) {
    console.error('[METEORA-SDK] Claim error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fee claim failed',
    };
  }
}

/**
 * Get pool fee metrics
 */
export async function getMeteoraPoolFeeMetrics(
  connection: Connection,
  pool: PublicKey
): Promise<{
  totalFees: number;
  unclaimedCreatorFees: number;
  unclaimedPartnerFees: number;
}> {
  try {
    const { DynamicBondingCurveClient } = await import('@meteora-ag/dynamic-bonding-curve-sdk');
    
    const client = new DynamicBondingCurveClient(connection, 'confirmed');
    
    const feeMetrics = await client.getPoolFeeMetrics(pool);
    
    return {
      totalFees: feeMetrics.totalFee.toNumber(),
      unclaimedCreatorFees: feeMetrics.unclaimedCreatorFee.toNumber(),
      unclaimedPartnerFees: feeMetrics.unclaimedPartnerFee.toNumber(),
    };
    
  } catch (error) {
    console.error('[METEORA-SDK] Error fetching fee metrics:', error);
    return {
      totalFees: 0,
      unclaimedCreatorFees: 0,
      unclaimedPartnerFees: 0,
    };
  }
}

/**
 * Helper to build curve using market cap targets
 */
export function buildCurveWithMarketCap(params: {
  tokenSupply: BN;
  quoteMint: PublicKey;
  initialMarketCap: number; // In quote currency
  migrationMarketCap: number;
  tokenQuoteDecimal: number;
}): { sqrtStartPrice: BN; curve: Array<{ sqrtPrice: BN; liquidity: BN }>; migrationQuoteThreshold: BN } {
  // This will use the SDK's buildCurveWithMarketCap function once installed
  // For now, return placeholder that will be replaced
  throw new Error('Install @meteora-ag/dynamic-bonding-curve-sdk to use this function');
}
