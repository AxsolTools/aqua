/**
 * AQUA Launchpad - Raydium CPMM Pool Module
 * 
 * Ported from raydiumspltoken/raydium_sdk.js and raydium_impl.js
 * Handles:
 * - Pool creation via Raydium SDK V2
 * - Add/Remove liquidity
 * - Lock LP tokens
 * - Pool info queries
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
} from '@solana/spl-token';
import { solToLamports, lamportsToSol } from '@/lib/precision';

// ============================================================================
// TYPES
// ============================================================================

export interface CreatePoolParams {
  connection: Connection;
  ownerKeypair: Keypair;
  tokenMint: string;
  tokenAmount: string;
  solAmount: string;
  tokenDecimals: number;
  openTime?: number; // Unix timestamp
  feePercent?: string; // "0.25%" | "1%" | "2%" | "4%"
}

export interface CreatePoolResult {
  success: boolean;
  poolAddress?: string;
  lpMint?: string;
  txSignature?: string;
  allSignatures?: string[];
  error?: string;
}

export interface AddLiquidityParams {
  connection: Connection;
  ownerKeypair: Keypair;
  poolAddress: string;
  tokenMint: string;
  tokenAmount: string;
  solAmount: string;
  tokenDecimals: number;
  slippageBps?: number;
}

export interface RemoveLiquidityParams {
  connection: Connection;
  ownerKeypair: Keypair;
  poolAddress: string;
  lpTokenAmount: string;
  slippageBps?: number;
}

export interface LiquidityResult {
  success: boolean;
  txSignature?: string;
  tokenAmount?: string;
  solAmount?: string;
  lpTokenAmount?: string;
  error?: string;
}

export interface PoolInfo {
  address: string;
  lpMint: string;
  tokenMint: string;
  quoteMint: string;
  tokenReserve: string;
  quoteReserve: string;
  lpSupply: string;
  feeRate: number;
}

// ============================================================================
// CONSTANTS
// ============================================================================

// Raydium CPMM Program IDs (mainnet)
const RAYDIUM_CPMM_PROGRAM = new PublicKey('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C');
const RAYDIUM_CPMM_FEE_ACCOUNT = new PublicKey('3oE58BKVt8KuYkGxx8zBojugnymWmBiyafWgMrnb6eYy');

// Wrapped SOL
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// ============================================================================
// SDK INITIALIZATION
// ============================================================================

/**
 * Dynamically import Raydium SDK (ESM module)
 */
async function getRaydiumSDK() {
  const Raydium = await import('@raydium-io/raydium-sdk-v2');
  return Raydium;
}

/**
 * Initialize Raydium SDK instance
 */
async function initializeRaydiumSDK(connection: Connection, owner: Keypair) {
  const { Raydium } = await getRaydiumSDK();
  
  const raydium = await Raydium.load({
    connection,
    owner,
    cluster: 'mainnet',
    disableFeatureCheck: true,
    disableLoadToken: false,
  });
  
  return raydium;
}

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Create a Raydium CPMM pool
 * Ported from raydiumspltoken/raydium_sdk.js createCPMMPoolSDK()
 */
export async function createCPMMPool(params: CreatePoolParams): Promise<CreatePoolResult> {
  const {
    connection,
    ownerKeypair,
    tokenMint,
    tokenAmount,
    solAmount,
    tokenDecimals,
    openTime = 0,
  } = params;

  try {
    console.log('[RAYDIUM] Creating CPMM pool...');
    console.log(`[RAYDIUM] Token: ${tokenMint}`);
    console.log(`[RAYDIUM] Amount: ${tokenAmount} tokens, ${solAmount} SOL`);

    const { Raydium, TxVersion } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;
    const Decimal = (await import('decimal.js')).default;

    // Initialize Raydium SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Token mints
    const baseMint = new PublicKey(tokenMint);
    const quoteMint = WSOL_MINT;

    // Determine if Token-2022
    const mintAccountInfo = await connection.getAccountInfo(baseMint);
    const isToken2022 = mintAccountInfo && mintAccountInfo.owner.equals(TOKEN_2022_PROGRAM_ID);
    const tokenProgramId = isToken2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

    console.log(`[RAYDIUM] Token program: ${isToken2022 ? 'Token-2022' : 'SPL Token'}`);

    // Convert amounts
    const baseAmount = new Decimal(tokenAmount).mul(new Decimal(10).pow(tokenDecimals));
    const quoteAmount = new Decimal(solAmount).mul(new Decimal(10).pow(9));

    // Ensure WSOL ATA exists
    const quoteAta = getAssociatedTokenAddressSync(
      quoteMint,
      ownerKeypair.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );

    const quoteAtaInfo = await connection.getAccountInfo(quoteAta);
    if (!quoteAtaInfo) {
      console.log('[RAYDIUM] Creating WSOL ATA...');
      const createWsolAtaTx = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          ownerKeypair.publicKey,
          quoteAta,
          ownerKeypair.publicKey,
          quoteMint,
          TOKEN_PROGRAM_ID
        )
      );

      const { blockhash } = await connection.getLatestBlockhash();
      createWsolAtaTx.recentBlockhash = blockhash;
      createWsolAtaTx.feePayer = ownerKeypair.publicKey;
      createWsolAtaTx.sign(ownerKeypair);

      const wsolSig = await connection.sendRawTransaction(createWsolAtaTx.serialize());
      await connection.confirmTransaction(wsolSig, 'confirmed');
      console.log(`[RAYDIUM] WSOL ATA created: ${wsolSig}`);
    }

    // Fetch CPMM configs
    console.log('[RAYDIUM] Fetching CPMM configs...');
    const configs = await raydium.api.getCpmmConfigs();
    
    if (!configs || configs.length === 0) {
      throw new Error('No CPMM configs available from Raydium API');
    }

    const feeConfig = configs[0];
    console.log(`[RAYDIUM] Using fee config: ${feeConfig.id}`);

    // Prepare mint info
    const mintAInfo = {
      address: baseMint.toBase58(),
      decimals: tokenDecimals,
      programId: tokenProgramId.toBase58(),
    };

    const mintBInfo = {
      address: quoteMint.toBase58(),
      decimals: 9,
      programId: TOKEN_PROGRAM_ID.toBase58(),
    };

    // Convert to BN
    const mintAAmount = new BN(baseAmount.toFixed(0));
    const mintBAmount = new BN(quoteAmount.toFixed(0));
    const startTime = new BN(openTime || Math.floor(Date.now() / 1000));

    console.log('[RAYDIUM] Creating pool transaction...');

    // Create pool
    const poolResult = await raydium.cpmm.createPool({
      programId: RAYDIUM_CPMM_PROGRAM,
      poolFeeAccount: RAYDIUM_CPMM_FEE_ACCOUNT,
      mintA: mintAInfo,
      mintB: mintBInfo,
      mintAAmount,
      mintBAmount,
      startTime,
      feeConfig,
      associatedOnly: false,
      ownerInfo: {
        useSOLBalance: true,
      },
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 600000,
        microLamports: 100000000,
      },
    });

    const { execute, extInfo } = poolResult;

    if (!execute || typeof execute !== 'function') {
      throw new Error('SDK did not return execute function');
    }

    console.log('[RAYDIUM] Executing pool creation...');

    // Execute transaction
    const txIds = await execute({
      sendAndConfirm: true,
      sequentially: true,
    });

    if (!txIds || txIds.length === 0) {
      throw new Error('No transaction IDs returned');
    }

    console.log(`[RAYDIUM] Pool created: ${txIds[0]}`);

    // Extract pool address - handle multiple possible SDK response formats
    let poolAddress = '';
    let lpMint: string | undefined;

    if (extInfo) {
      console.log('[RAYDIUM] extInfo keys:', Object.keys(extInfo));
      
      // Try different possible locations for pool address
      const addressCandidates = [
        extInfo.address?.poolId,
        extInfo.address?.id,
        extInfo.address?.pool,
        extInfo.poolId,
        extInfo.address,
      ];
      
      for (const candidate of addressCandidates) {
        if (candidate) {
          poolAddress = typeof candidate.toBase58 === 'function' 
            ? candidate.toBase58() 
            : String(candidate);
          if (poolAddress && poolAddress.length >= 32) {
            console.log('[RAYDIUM] Found pool address:', poolAddress);
            break;
          }
        }
      }

      // Try different possible locations for LP mint
      const lpMintCandidates = [
        extInfo.address?.lpMint,
        extInfo.lpMint,
      ];
      
      for (const candidate of lpMintCandidates) {
        if (candidate) {
          lpMint = typeof candidate.toBase58 === 'function' 
            ? candidate.toBase58() 
            : String(candidate);
          if (lpMint && lpMint.length >= 32) {
            console.log('[RAYDIUM] Found LP mint:', lpMint);
            break;
          }
        }
      }
    }

    // Fallback to transaction ID if no pool address found
    if (!poolAddress) {
      console.warn('[RAYDIUM] Could not extract pool address from extInfo, using tx signature');
      poolAddress = txIds[0];
    }

    return {
      success: true,
      poolAddress,
      lpMint,
      txSignature: txIds[0],
      allSignatures: txIds,
    };

  } catch (error) {
    console.error('[RAYDIUM] Pool creation error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Pool creation failed',
    };
  }
}

// ============================================================================
// LIQUIDITY MANAGEMENT
// ============================================================================

/**
 * Add liquidity to an existing CPMM pool
 */
export async function addLiquidity(params: AddLiquidityParams): Promise<LiquidityResult> {
  const {
    connection,
    ownerKeypair,
    poolAddress,
    tokenMint,
    tokenAmount,
    solAmount,
    tokenDecimals,
    slippageBps = 100,
  } = params;

  try {
    console.log('[RAYDIUM] Adding liquidity...');
    console.log(`[RAYDIUM] Pool: ${poolAddress}`);
    console.log(`[RAYDIUM] Amount: ${tokenAmount} tokens, ${solAmount} SOL`);

    const { Raydium, TxVersion } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;
    const Decimal = (await import('decimal.js')).default;

    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    // Calculate amounts
    const inputAmount = new BN(
      new Decimal(tokenAmount).mul(new Decimal(10).pow(tokenDecimals)).toFixed(0)
    );

    // Add liquidity
    const result = await raydium.cpmm.addLiquidity({
      poolInfo: poolInfo.poolInfo,
      poolKeys: poolInfo.poolKeys,
      inputAmount,
      slippage: slippageBps / 10000, // Convert bps to decimal
      baseIn: true, // Using base token as input
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 400000,
        microLamports: 50000000,
      },
    });

    const { execute } = result;
    const txIds = await execute({
      sendAndConfirm: true,
    });

    console.log(`[RAYDIUM] Liquidity added: ${txIds[0]}`);

    return {
      success: true,
      txSignature: txIds[0],
      tokenAmount,
      solAmount,
    };

  } catch (error) {
    console.error('[RAYDIUM] Add liquidity error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Add liquidity failed',
    };
  }
}

/**
 * Remove liquidity from a CPMM pool
 */
export async function removeLiquidity(params: RemoveLiquidityParams): Promise<LiquidityResult> {
  const {
    connection,
    ownerKeypair,
    poolAddress,
    lpTokenAmount,
    slippageBps = 100,
  } = params;

  try {
    console.log('[RAYDIUM] Removing liquidity...');
    console.log(`[RAYDIUM] Pool: ${poolAddress}`);
    console.log(`[RAYDIUM] LP Amount: ${lpTokenAmount}`);

    const { Raydium, TxVersion } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;

    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    // LP token amount
    const lpAmount = new BN(lpTokenAmount);

    // Remove liquidity
    const result = await raydium.cpmm.withdrawLiquidity({
      poolInfo: poolInfo.poolInfo,
      poolKeys: poolInfo.poolKeys,
      lpAmount,
      slippage: slippageBps / 10000,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 400000,
        microLamports: 50000000,
      },
    });

    const { execute } = result;
    const txIds = await execute({
      sendAndConfirm: true,
    });

    console.log(`[RAYDIUM] Liquidity removed: ${txIds[0]}`);

    return {
      success: true,
      txSignature: txIds[0],
      lpTokenAmount,
    };

  } catch (error) {
    console.error('[RAYDIUM] Remove liquidity error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Remove liquidity failed',
    };
  }
}

/**
 * Lock LP tokens (using Raydium's lockLp function)
 */
export async function lockLpTokens(
  connection: Connection,
  ownerKeypair: Keypair,
  poolAddress: string,
  lpAmount: string,
  lockDurationSeconds: number
): Promise<LiquidityResult> {
  try {
    console.log('[RAYDIUM] Locking LP tokens...');
    console.log(`[RAYDIUM] Pool: ${poolAddress}`);
    console.log(`[RAYDIUM] Amount: ${lpAmount}`);
    console.log(`[RAYDIUM] Duration: ${lockDurationSeconds}s`);

    const { Raydium, TxVersion } = await getRaydiumSDK();
    const BN = (await import('bn.js')).default;

    // Initialize SDK
    const raydium = await Raydium.load({
      connection,
      owner: ownerKeypair,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: false,
    });

    // Get pool info
    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      throw new Error('Pool not found');
    }

    // Lock LP
    const result = await raydium.cpmm.lockLp({
      poolInfo: poolInfo.poolInfo,
      lpAmount: new BN(lpAmount),
      withMetadata: true,
      txVersion: TxVersion.V0,
      computeBudgetConfig: {
        units: 400000,
        microLamports: 50000000,
      },
    });

    const { execute } = result;
    const txIds = await execute({
      sendAndConfirm: true,
    });

    console.log(`[RAYDIUM] LP tokens locked: ${txIds[0]}`);

    return {
      success: true,
      txSignature: txIds[0],
      lpTokenAmount: lpAmount,
    };

  } catch (error) {
    console.error('[RAYDIUM] Lock LP error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Lock LP failed',
    };
  }
}

// ============================================================================
// POOL QUERIES
// ============================================================================

/**
 * Get pool information
 */
export async function getPoolInfo(
  connection: Connection,
  poolAddress: string
): Promise<PoolInfo | null> {
  try {
    const { Raydium } = await getRaydiumSDK();

    // Initialize SDK (no owner needed for read-only)
    const raydium = await Raydium.load({
      connection,
      cluster: 'mainnet',
      disableFeatureCheck: true,
      disableLoadToken: true,
    });

    const poolId = new PublicKey(poolAddress);
    const poolInfo = await raydium.cpmm.getPoolInfoFromRpc(poolId.toBase58());

    if (!poolInfo) {
      return null;
    }

    const info = poolInfo.poolInfo;

    return {
      address: poolAddress,
      lpMint: info.lpMint?.toBase58() || '',
      tokenMint: info.mintA?.toBase58() || '',
      quoteMint: info.mintB?.toBase58() || '',
      tokenReserve: info.vaultAAmount?.toString() || '0',
      quoteReserve: info.vaultBAmount?.toString() || '0',
      lpSupply: info.lpSupply?.toString() || '0',
      feeRate: info.configInfo?.tradeFeeRate || 0,
    };

  } catch (error) {
    console.error('[RAYDIUM] Get pool info error:', error);
    return null;
  }
}

/**
 * Calculate price from pool reserves
 */
export function calculatePriceFromReserves(
  tokenReserve: string,
  quoteReserve: string,
  tokenDecimals: number
): number {
  const tokenAmount = parseFloat(tokenReserve) / Math.pow(10, tokenDecimals);
  const solAmount = parseFloat(quoteReserve) / 1e9;
  
  if (tokenAmount === 0) return 0;
  return solAmount / tokenAmount;
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  RAYDIUM_CPMM_PROGRAM,
  RAYDIUM_CPMM_FEE_ACCOUNT,
  WSOL_MINT,
};

