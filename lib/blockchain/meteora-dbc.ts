/**
 * Meteora Dynamic Bonding Curve Integration
 * 
 * Creates tokens on Meteora's DBC with customizable curves
 * Program: dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  SYSVAR_RENT_PUBKEY,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  MINT_SIZE,
  getMinimumBalanceForRentExemptMint,
} from '@solana/spl-token';

// ============================================================================
// CONSTANTS
// ============================================================================

export const METEORA_DBC_PROGRAM_ID = new PublicKey('dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN');

// Config keys for different migration options (from Meteora docs)
export const METEORA_CONFIG_KEYS = {
  // DAMM v2 configs (recommended)
  DAMM_V2_025: new PublicKey('7F6dnUcRuyM2TwR8myT1dYypFXpPSxqwKNSFNkxyNESd'), // 0.25% fee
  DAMM_V2_030: new PublicKey('2nHK1kju6XjphBLbNxpM5XRGFj7p9U8vvNzyZiha1z6k'), // 0.3% fee
  DAMM_V2_100: new PublicKey('Hv8Lmzmnju6m7kcokVKvwqz7QPmdX9XfKjJsXz8RXcjp'), // 1% fee
  DAMM_V2_200: new PublicKey('2c4cYd4reUYVRAB9kUUkrq55VPyy2FNQ3FDL4o12JXmq'), // 2% fee
  
  // DAMM v1 configs (legacy)
  DAMM_V1_025: new PublicKey('8f848CEy8eY6PhJ3VcemtBDzPPSD4Vq7aJczLZ3o8MmX'),
  DAMM_V1_030: new PublicKey('HBxB8Lf14Yj8pqeJ8C4qDb5ryHL7xwpuykz31BLNYr7S'),
} as const;

export const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');
export const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');

// ============================================================================
// TYPES
// ============================================================================

export interface CurveRange {
  sqrtPrice: bigint;
  liquidity: bigint;
}

export interface MeteoraTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface MeteoraCreateParams {
  metadata: MeteoraTokenMetadata;
  creatorKeypair: Keypair;
  quoteMint?: PublicKey; // Default: WSOL
  configKey?: PublicKey; // Default: DAMM_V2_100
  
  // Curve configuration
  sqrtStartPrice: bigint;
  curveRanges: CurveRange[];
  migrationQuoteThreshold: bigint; // In quote token lamports
  
  // Token settings
  decimals?: number; // Default: 6
  totalSupply?: bigint; // Optional fixed supply
  
  // Fee settings
  tradingFeeBps?: number; // Default: 100 (1%)
  creatorFeePercentage?: number; // Default: 80 (creator gets 80% of fees)
  
  // LP distribution after migration
  creatorLpPercentage?: number; // Default: 90
  creatorLockedLpPercentage?: number; // Default: 0
  
  // Initial buy
  initialBuySol?: number;
}

export interface MeteoraCreateResult {
  success: boolean;
  mintAddress?: string;
  poolAddress?: string;
  txSignature?: string;
  metadataUri?: string;
  imageUrl?: string;
  error?: string;
}

// ============================================================================
// CURVE PRESETS
// ============================================================================

/**
 * Calculate square root price from regular price
 * Formula: sqrt(price) * 2^64
 */
export function calculateSqrtPrice(price: number): bigint {
  const Q64 = BigInt(2) ** BigInt(64);
  const sqrtPrice = Math.sqrt(price);
  return BigInt(Math.floor(sqrtPrice * Number(Q64)));
}

/**
 * Preset curve configurations
 */
export const PROPEL_CURVE_PRESETS = {
  // Smooth growth - evenly distributed liquidity
  SMOOTH: {
    name: 'Smooth Operator',
    description: 'Steady growth with minimal volatility',
    ranges: [
      { price: 0.00001, liquidity: 1000 },
      { price: 0.0001, liquidity: 1000 },
      { price: 0.001, liquidity: 1000 },
      { price: 0.01, liquidity: 1000 },
    ],
    migrationThresholdSol: 85,
  },
  
  // Explosive pump - low liquidity in middle
  EXPLOSIVE: {
    name: 'Rocket Fuel',
    description: 'Low middle liquidity = explosive price action',
    ranges: [
      { price: 0.00001, liquidity: 2000 },
      { price: 0.0001, liquidity: 500 },  // Low liquidity = big pumps
      { price: 0.001, liquidity: 500 },
      { price: 0.01, liquidity: 2000 },
    ],
    migrationThresholdSol: 85,
  },
  
  // Whale trap - easy entry, hard exit
  WHALE_TRAP: {
    name: 'Whale Trap',
    description: 'Easy to buy, harder to sell',
    ranges: [
      { price: 0.00001, liquidity: 3000 },  // High liquidity = easy entry
      { price: 0.0001, liquidity: 1500 },
      { price: 0.001, liquidity: 800 },
      { price: 0.01, liquidity: 500 },     // Low liquidity = hard to exit
    ],
    migrationThresholdSol: 85,
  },
  
  // Diamond hands - rewards holders
  DIAMOND_HANDS: {
    name: 'Diamond Hands',
    description: 'Rewards long-term holders',
    ranges: [
      { price: 0.00001, liquidity: 800 },
      { price: 0.0001, liquidity: 1200 },
      { price: 0.001, liquidity: 1800 },
      { price: 0.01, liquidity: 2500 },    // More liquidity at top = stability
    ],
    migrationThresholdSol: 85,
  },
} as const;

/**
 * Convert preset to curve ranges
 */
export function presetToCurveRanges(preset: typeof PROPEL_CURVE_PRESETS[keyof typeof PROPEL_CURVE_PRESETS]): CurveRange[] {
  return preset.ranges.map(range => ({
    sqrtPrice: calculateSqrtPrice(range.price),
    liquidity: BigInt(range.liquidity * 1e9), // Convert to lamports
  }));
}

// ============================================================================
// POOL CREATION
// ============================================================================

/**
 * Create a token on Meteora DBC with custom curve
 * 
 * Note: This is a simplified implementation. For production, you should use
 * the official Meteora SDK or build complete Anchor instructions.
 */
export async function createMeteoraToken(
  connection: Connection,
  params: MeteoraCreateParams
): Promise<MeteoraCreateResult> {
  try {
    const {
      metadata,
      creatorKeypair,
      quoteMint = WSOL_MINT,
      configKey = METEORA_CONFIG_KEYS.DAMM_V2_100,
      sqrtStartPrice,
      curveRanges,
      migrationQuoteThreshold,
      decimals = 6,
      totalSupply,
      tradingFeeBps = 100,
      creatorFeePercentage = 80,
      creatorLpPercentage = 90,
      creatorLockedLpPercentage = 0,
      initialBuySol = 0,
    } = params;

    console.log('[METEORA-DBC] Creating token:', metadata.name);
    console.log('[METEORA-DBC] Quote mint:', quoteMint.toBase58());
    console.log('[METEORA-DBC] Config key:', configKey.toBase58());
    console.log('[METEORA-DBC] Curve ranges:', curveRanges.length);

    // Generate mint keypair
    const mintKeypair = Keypair.generate();
    console.log('[METEORA-DBC] Mint address:', mintKeypair.publicKey.toBase58());

    // For now, return a placeholder result
    // In production, you would:
    // 1. Upload metadata to Arweave/IPFS
    // 2. Create mint account
    // 3. Call Meteora DBC program to create pool
    // 4. Optionally perform initial buy

    console.log('[METEORA-DBC] ⚠️ Using placeholder implementation');
    console.log('[METEORA-DBC] To complete: Integrate Meteora SDK or build Anchor instructions');

    return {
      success: false,
      error: 'Meteora DBC integration requires SDK installation or Anchor instruction building. Use Jupiter DBC for now.',
    };

  } catch (error) {
    console.error('[METEORA-DBC] Error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create Meteora token',
    };
  }
}

/**
 * Get pool address for a token mint
 */
export async function getMeteoraPoolAddress(
  mintAddress: string,
  configKey: PublicKey = METEORA_CONFIG_KEYS.DAMM_V2_100
): Promise<string | null> {
  try {
    const mintPubkey = new PublicKey(mintAddress);
    
    // Derive pool PDA
    const [poolPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('pool'),
        configKey.toBuffer(),
        mintPubkey.toBuffer(),
      ],
      METEORA_DBC_PROGRAM_ID
    );
    
    return poolPDA.toBase58();
  } catch (error) {
    console.error('[METEORA-DBC] Error deriving pool address:', error);
    return null;
  }
}

/**
 * Get pool fee info
 */
export async function getMeteoraPoolFees(
  connection: Connection,
  poolAddress: string
): Promise<{ totalFees: number; unclaimedFees: number }> {
  try {
    const poolPubkey = new PublicKey(poolAddress);
    const accountInfo = await connection.getAccountInfo(poolPubkey);
    
    if (!accountInfo) {
      return { totalFees: 0, unclaimedFees: 0 };
    }
    
    // Parse pool account data to get fee info
    // This requires knowing the exact account structure from Meteora
    // For now, return placeholder
    
    return { totalFees: 0, unclaimedFees: 0 };
  } catch (error) {
    console.error('[METEORA-DBC] Error fetching pool fees:', error);
    return { totalFees: 0, unclaimedFees: 0 };
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

export function validateMeteoraParams(params: {
  name: string;
  symbol: string;
  curveRanges: CurveRange[];
  migrationThreshold: bigint;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!params.name || params.name.length === 0) {
    errors.push('Token name is required');
  }
  
  if (!params.symbol || params.symbol.length === 0) {
    errors.push('Token symbol is required');
  }
  
  if (params.curveRanges.length === 0) {
    errors.push('At least one curve range is required');
  }
  
  if (params.curveRanges.length > 20) {
    errors.push('Maximum 20 curve ranges allowed');
  }
  
  if (params.migrationThreshold <= 0) {
    errors.push('Migration threshold must be positive');
  }

  return { valid: errors.length === 0, errors };
}
