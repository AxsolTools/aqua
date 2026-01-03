/**
 * AQUA Launchpad - Jupiter Studio API Integration
 * 
 * Creates tokens on Jupiter's Dynamic Bonding Curve (DBC) pools
 * and manages post-launch fee collection.
 * 
 * API Documentation: https://dev.jup.ag/docs/studio/create-token
 * 
 * IMPORTANT: This follows the official Jupiter Studio API spec:
 * - POST /dbc-pool/create-tx - Get unsigned transaction + presigned URLs
 * - PUT presigned URLs - Upload image and metadata
 * - POST /dbc-pool/submit - Submit signed transaction (multipart/form-data)
 * - POST /dbc-pool/fee/claim-tx - Get fee claim transaction
 */

import {
  Connection,
  Keypair,
  VersionedTransaction,
  PublicKey,
} from '@solana/web3.js';
import bs58 from 'bs58';

// ============================================================================
// CONFIGURATION
// ============================================================================

const JUPITER_API_BASE = 'https://api.jup.ag';
const JUPITER_STUDIO_API = `${JUPITER_API_BASE}/studio/v1`;

// Quote mint addresses
export const JUPITER_QUOTE_MINTS = {
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  SOL: 'So11111111111111111111111111111111111111112',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
} as const;

// Preset configurations from Jupiter docs
export const JUPITER_PRESETS = {
  // Meme preset - Great for memes, similar profile to traditional meme launches
  // 16K initial MC, 69K migration MC, ~17.94K USDC raised before graduation
  MEME: {
    quoteMint: JUPITER_QUOTE_MINTS.USDC,
    initialMarketCap: 16000,
    migrationMarketCap: 69000,
    tokenQuoteDecimal: 6,
    lockedVestingParam: {
      totalLockedVestingAmount: 0,
      cliffUnlockAmount: 0,
      numberOfVestingPeriod: 0,
      totalVestingDuration: 0,
      cliffDurationFromMigrationTime: 0,
    },
  },
  // Indie preset - For projects ready to take it up a notch
  // 32K initial MC, 240K migration MC, ~57.78K USDC raised, 10% vested over 12 months
  INDIE: {
    quoteMint: JUPITER_QUOTE_MINTS.USDC,
    initialMarketCap: 32000,
    migrationMarketCap: 240000,
    tokenQuoteDecimal: 6,
    lockedVestingParam: {
      totalLockedVestingAmount: 100000000, // 10% of 1B supply
      cliffUnlockAmount: 0,
      numberOfVestingPeriod: 365,
      totalVestingDuration: 31536000, // 1 year in seconds
      cliffDurationFromMigrationTime: 0,
    },
  },
} as const;

// Get API key from environment
const getJupiterApiKey = (): string => {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) {
    throw new Error('JUPITER_API_KEY environment variable is not set');
  }
  return apiKey;
};

// ============================================================================
// TYPES
// ============================================================================

export interface JupiterTokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string; // base64 data URI or URL
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
}

export interface JupiterCurveParams {
  quoteMint: string; // USDC, SOL, or JUP mint address
  initialMarketCap: number; // In quote currency (e.g., 16000 = 16K USDC)
  migrationMarketCap: number; // When to migrate to DEX
  tokenQuoteDecimal: number; // Decimals for quote token (6 for USDC)
  lockedVestingParam: {
    totalLockedVestingAmount: number;
    cliffUnlockAmount: number;
    numberOfVestingPeriod: number;
    totalVestingDuration: number;
    cliffDurationFromMigrationTime: number;
  };
}

export interface CreateJupiterTokenParams {
  metadata: JupiterTokenMetadata;
  creatorKeypair: Keypair;
  curveParams?: JupiterCurveParams; // Uses MEME preset if not provided
  feeBps?: number; // Trading fee in basis points (default 100 = 1%)
  antiSniping?: boolean; // Enable anti-sniping protection
  isLpLocked?: boolean; // Lock LP tokens (default true)
  initialBuySol?: number; // Initial buy in SOL (converted to quote)
  slippageBps?: number;
  mintKeypair?: Keypair;
  // Optional Studio page customization
  pageContent?: string; // Description for Jupiter Studio page
  headerImage?: Buffer; // Header image for Studio page
}

export interface CreateJupiterTokenResult {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
  imageUrl?: string;
  txSignature?: string;
  dbcPoolAddress?: string;
  error?: string;
}

export interface JupiterPoolInfo {
  dbcPoolAddress: string;
  mintAddress: string;
  creatorWallet: string;
}

export interface JupiterFeeInfo {
  totalFees: number;
  unclaimedFees: number;
  claimedFees: number;
  poolAddress: string;
}

export interface ClaimFeesResult {
  success: boolean;
  txSignature?: string;
  claimedAmount?: number;
  error?: string;
}

// Response types from Jupiter API (matching official docs)
interface CreateTxResponse {
  transaction: string; // base64 encoded unsigned transaction
  mint: string; // The mint address of the token being created
  imagePresignedUrl: string; // PUT request endpoint to upload token image
  metadataPresignedUrl: string; // PUT request endpoint to upload token metadata
  imageUrl: string; // The token's static image URL to use in metadata
}

interface SubmitResponse {
  txSignature: string;
  mint: string;
  poolAddress?: string;
}

interface PoolAddressResponse {
  data: {
    dbcPoolAddress: string;
    meteoraDammV2PoolAddress?: string;
    configKey?: string;
  };
}

interface FeeInfoResponse {
  data: {
    totalFee: number;
    unclaimedFee: number;
    claimedFee?: number;
  };
}

interface ClaimTxResponse {
  transaction: string; // base64 encoded unsigned transaction
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Make authenticated request to Jupiter Studio API
 */
async function jupiterRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const apiKey = getJupiterApiKey();
  
  const url = `${JUPITER_STUDIO_API}${endpoint}`;
  console.log(`[JUPITER] API Request: ${options.method || 'GET'} ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[JUPITER] API error: ${response.status} - ${errorText}`);
    throw new Error(`Jupiter API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Submit signed transaction to Jupiter (multipart/form-data)
 */
async function jupiterSubmit(
  signedTransaction: string,
  owner: string,
  pageContent?: string,
  headerImage?: Buffer
): Promise<SubmitResponse> {
  const apiKey = getJupiterApiKey();
  
  const formData = new FormData();
  formData.append('transaction', signedTransaction);
  formData.append('owner', owner);
  
  if (pageContent) {
    formData.append('content', pageContent);
  }
  
  if (headerImage) {
    // Convert Buffer to Uint8Array for Blob compatibility
    const uint8Array = new Uint8Array(headerImage);
    formData.append(
      'headerImage',
      new Blob([uint8Array], { type: 'image/jpeg' }),
      'header.jpeg'
    );
  }

  const url = `${JUPITER_STUDIO_API}/dbc-pool/submit`;
  console.log(`[JUPITER] Submit Request: POST ${url}`);
  
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: {
      'x-api-key': apiKey,
      // Note: Don't set Content-Type for FormData, browser sets it with boundary
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[JUPITER] Submit error: ${response.status} - ${errorText}`);
    throw new Error(`Jupiter submit error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

/**
 * Convert base64 data URI to Buffer
 */
function dataUriToBuffer(dataUri: string): { buffer: Buffer; mimeType: string } {
  if (!dataUri.startsWith('data:')) {
    throw new Error('Invalid data URI');
  }
  
  const [header, base64Data] = dataUri.split(',');
  const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
  const buffer = Buffer.from(base64Data, 'base64');
  
  return { buffer, mimeType };
}

/**
 * Get content type from mime type
 */
function getImageContentType(mimeType: string): string {
  const typeMap: Record<string, string> = {
    'image/png': 'image/png',
    'image/jpeg': 'image/jpeg',
    'image/jpg': 'image/jpeg',
    'image/gif': 'image/gif',
    'image/webp': 'image/webp',
  };
  return typeMap[mimeType] || 'image/jpeg';
}

/**
 * Upload file to presigned URL
 */
async function uploadToPresignedUrl(
  url: string,
  data: Buffer | string,
  contentType: string
): Promise<void> {
  console.log(`[JUPITER] Uploading to presigned URL (${contentType})...`);
  
  // Convert Buffer to Uint8Array for fetch compatibility
  const body = typeof data === 'string' ? data : new Uint8Array(data);
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to presigned URL: ${response.status} - ${errorText}`);
  }
  
  console.log(`[JUPITER] ✅ Upload successful`);
}

/**
 * Build Metaplex-compatible metadata JSON for Jupiter
 */
function buildJupiterMetadata(
  metadata: JupiterTokenMetadata,
  imageUrl: string
): object {
  return {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: imageUrl,
    // Optional social links
    ...(metadata.website && { website: metadata.website }),
    ...(metadata.twitter && { twitter: metadata.twitter }),
    ...(metadata.telegram && { telegram: metadata.telegram }),
  };
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a new token on Jupiter's Dynamic Bonding Curve
 * 
 * Flow (per official docs):
 * 1. POST /dbc-pool/create-tx - Get unsigned tx + presigned URLs
 * 2. PUT imagePresignedUrl - Upload token image
 * 3. PUT metadataPresignedUrl - Upload token metadata JSON
 * 4. Sign transaction with creator + mint keypairs
 * 5. POST /dbc-pool/submit - Submit signed transaction (multipart/form-data)
 */
export async function createJupiterToken(
  connection: Connection,
  params: CreateJupiterTokenParams
): Promise<CreateJupiterTokenResult> {
  const {
    metadata,
    creatorKeypair,
    curveParams = JUPITER_PRESETS.MEME,
    feeBps = 100, // 1% trading fee
    antiSniping = false,
    isLpLocked = true,
    initialBuySol = 0,
    slippageBps = 500,
    mintKeypair: providedMintKeypair,
    pageContent,
    headerImage,
  } = params;

  try {
    console.log(`[JUPITER] Creating token: ${metadata.name} (${metadata.symbol})`);
    console.log(`[JUPITER] Curve: ${curveParams.initialMarketCap} -> ${curveParams.migrationMarketCap} (${curveParams.quoteMint.slice(0, 8)}...)`);

    // Determine image content type
    let imageContentType = 'image/jpeg';
    if (metadata.image.startsWith('data:')) {
      const parsed = dataUriToBuffer(metadata.image);
      imageContentType = getImageContentType(parsed.mimeType);
    }

    // Step 1: Request create transaction from Jupiter
    console.log('[JUPITER] Step 1: Requesting create transaction...');
    
    const createTxBody = {
      buildCurveByMarketCapParam: {
        quoteMint: curveParams.quoteMint,
        initialMarketCap: curveParams.initialMarketCap,
        migrationMarketCap: curveParams.migrationMarketCap,
        tokenQuoteDecimal: curveParams.tokenQuoteDecimal,
        lockedVestingParam: curveParams.lockedVestingParam,
      },
      antiSniping,
      fee: { feeBps },
      isLpLocked,
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
      tokenImageContentType: imageContentType,
      creator: creatorKeypair.publicKey.toBase58(),
    };

    console.log('[JUPITER] Create TX body:', JSON.stringify(createTxBody, null, 2));

    const createTxResponse = await jupiterRequest<CreateTxResponse>('/dbc-pool/create-tx', {
      method: 'POST',
      body: JSON.stringify(createTxBody),
    });

    const { 
      transaction: txBase64, 
      mint: mintAddress,
      imagePresignedUrl, 
      metadataPresignedUrl,
      imageUrl 
    } = createTxResponse;

    console.log(`[JUPITER] Received mint address: ${mintAddress}`);
    console.log(`[JUPITER] Image URL will be: ${imageUrl}`);

    // Step 2: Upload image to presigned URL
    console.log('[JUPITER] Step 2: Uploading image...');
    
    let imageBuffer: Buffer;
    let imageMimeType: string;
    
    if (metadata.image.startsWith('data:')) {
      // Base64 data URI
      const parsed = dataUriToBuffer(metadata.image);
      imageBuffer = parsed.buffer;
      imageMimeType = parsed.mimeType;
    } else if (metadata.image.startsWith('http')) {
      // URL - fetch and convert
      const imageResponse = await fetch(metadata.image);
      if (!imageResponse.ok) {
        throw new Error(`Failed to fetch image: ${imageResponse.status}`);
      }
      const arrayBuffer = await imageResponse.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
      imageMimeType = imageResponse.headers.get('content-type') || 'image/png';
    } else {
      throw new Error('Invalid image format. Must be data URI or URL.');
    }

    await uploadToPresignedUrl(imagePresignedUrl, imageBuffer, getImageContentType(imageMimeType));
    console.log('[JUPITER] ✅ Image uploaded');

    // Step 3: Upload metadata JSON to presigned URL
    console.log('[JUPITER] Step 3: Uploading metadata...');
    
    const metadataJson = buildJupiterMetadata(metadata, imageUrl);
    console.log('[JUPITER] Metadata:', JSON.stringify(metadataJson, null, 2));
    
    await uploadToPresignedUrl(
      metadataPresignedUrl,
      JSON.stringify(metadataJson),
      'application/json'
    );
    console.log('[JUPITER] ✅ Metadata uploaded');

    // Step 4: Deserialize and sign transaction
    console.log('[JUPITER] Step 4: Signing transaction...');
    
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(txBase64, 'base64')
    );
    
    // Sign with creator keypair
    // Note: Jupiter's create-tx generates the mint internally, we don't need to sign with mint keypair
    transaction.sign([creatorKeypair]);
    
    const signedTransaction = Buffer.from(transaction.serialize()).toString('base64');

    // Step 5: Submit via Jupiter's submit endpoint
    console.log('[JUPITER] Step 5: Submitting to Jupiter...');
    
    const submitResult = await jupiterSubmit(
      signedTransaction,
      creatorKeypair.publicKey.toBase58(),
      pageContent,
      headerImage
    );

    console.log(`[JUPITER] ✅ Token created successfully!`);
    console.log(`[JUPITER] Mint: ${mintAddress}`);
    console.log(`[JUPITER] TX: ${submitResult.txSignature}`);
    if (submitResult.poolAddress) {
      console.log(`[JUPITER] Pool: ${submitResult.poolAddress}`);
    }

    // Extract metadata URI from presigned URL
    const metadataUri = metadataPresignedUrl.split('?')[0];

    return {
      success: true,
      mintAddress,
      metadataUri,
      imageUrl,
      txSignature: submitResult.txSignature,
      dbcPoolAddress: submitResult.poolAddress,
    };

  } catch (error) {
    console.error('[JUPITER] Create token error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token creation failed',
    };
  }
}

/**
 * Create token with initial buy
 * 
 * Note: For initial buys, we need to create the token first, then buy separately
 * because Jupiter's create-tx doesn't support initial buy in the same transaction
 */
export async function createJupiterTokenWithBuy(
  connection: Connection,
  params: CreateJupiterTokenParams
): Promise<CreateJupiterTokenResult> {
  const { initialBuySol = 0 } = params;
  
  // First create the token
  const createResult = await createJupiterToken(connection, params);
  
  if (!createResult.success || !createResult.mintAddress) {
    return createResult;
  }

  // If initial buy is requested, perform it after token creation
  if (initialBuySol > 0) {
    console.log(`[JUPITER] Performing initial buy of ${initialBuySol} SOL...`);
    
    try {
      // Use Jupiter swap API for the initial buy
      const buyResult = await performJupiterBuy(
        connection,
        params.creatorKeypair,
        createResult.mintAddress,
        initialBuySol,
        params.slippageBps || 500
      );
      
      if (!buyResult.success) {
        console.warn(`[JUPITER] Initial buy failed: ${buyResult.error}`);
        // Token was created but buy failed - still return success with warning
        return {
          ...createResult,
          error: `Token created but initial buy failed: ${buyResult.error}`,
        };
      }
      
      console.log(`[JUPITER] ✅ Initial buy successful: ${buyResult.txSignature}`);
    } catch (buyError) {
      console.warn('[JUPITER] Initial buy error:', buyError);
      // Token was created but buy failed
      return {
        ...createResult,
        error: `Token created but initial buy failed: ${buyError instanceof Error ? buyError.message : 'Unknown error'}`,
      };
    }
  }

  return createResult;
}

/**
 * Perform a buy on Jupiter DBC token
 * 
 * Note: Newly created tokens may take a few seconds to be indexed by Jupiter.
 * This function includes retry logic with delays to handle this.
 */
async function performJupiterBuy(
  connection: Connection,
  buyerKeypair: Keypair,
  mintAddress: string,
  amountSol: number,
  slippageBps: number
): Promise<{ success: boolean; txSignature?: string; error?: string }> {
  const maxRetries = 3;
  const retryDelayMs = 5000; // 5 seconds between retries
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const amountLamports = Math.floor(amountSol * 1e9);
      
      // Use Jupiter's swap API
      const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${mintAddress}&amount=${amountLamports}&slippageBps=${slippageBps}`;
      
      console.log(`[JUPITER] Getting quote for ${amountSol} SOL -> ${mintAddress.slice(0, 8)}... (attempt ${attempt}/${maxRetries})`);
      
      const quoteResponse = await fetch(quoteUrl, {
        headers: { 'Accept': 'application/json' },
      });
      
      if (!quoteResponse.ok) {
        const errorText = await quoteResponse.text();
        // If no route found, token might not be indexed yet
        if (quoteResponse.status === 400 && errorText.includes('No route')) {
          if (attempt < maxRetries) {
            console.log(`[JUPITER] Token not indexed yet, waiting ${retryDelayMs}ms before retry...`);
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));
            continue;
          }
        }
        throw new Error(`Quote failed: ${quoteResponse.status} - ${errorText}`);
      }
      
      const quoteData = await quoteResponse.json();
      
      if (!quoteData || quoteData.error) {
        if (attempt < maxRetries) {
          console.log(`[JUPITER] Quote returned error, waiting ${retryDelayMs}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, retryDelayMs));
          continue;
        }
        throw new Error(`Quote error: ${quoteData?.error || 'No quote data'}`);
      }

      // Get swap transaction
      const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: buyerKeypair.publicKey.toBase58(),
          wrapAndUnwrapSol: true,
        }),
      });

      if (!swapResponse.ok) {
        const swapError = await swapResponse.text();
        throw new Error(`Swap transaction failed: ${swapResponse.status} - ${swapError}`);
      }

      const { swapTransaction } = await swapResponse.json();
      
      if (!swapTransaction) {
        throw new Error('No swap transaction returned');
      }
      
      // Deserialize and sign
      const transaction = VersionedTransaction.deserialize(
        Buffer.from(swapTransaction, 'base64')
      );
      transaction.sign([buyerKeypair]);

      // Send transaction
      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        maxRetries: 3,
      });

      // Confirm
      const confirmation = await connection.confirmTransaction(signature, 'confirmed');
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log(`[JUPITER] ✅ Buy successful: ${signature}`);
      return { success: true, txSignature: signature };
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Buy failed';
      console.warn(`[JUPITER] Buy attempt ${attempt} failed: ${errorMessage}`);
      
      if (attempt < maxRetries) {
        console.log(`[JUPITER] Waiting ${retryDelayMs}ms before retry...`);
        await new Promise(resolve => setTimeout(resolve, retryDelayMs));
        continue;
      }
      
      return {
        success: false,
        error: errorMessage,
      };
    }
  }
  
  return {
    success: false,
    error: 'Max retries exceeded',
  };
}

// ============================================================================
// POOL & FEE MANAGEMENT
// ============================================================================

/**
 * Get the DBC pool address for a token
 * 
 * Per docs: GET /dbc-pool/addresses/{mint}
 * Returns: { data: { dbcPoolAddress, meteoraDammV2PoolAddress, configKey } }
 */
export async function getJupiterPoolAddress(mintAddress: string): Promise<string> {
  console.log(`[JUPITER] Fetching pool address for mint: ${mintAddress}`);
  
  const response = await jupiterRequest<PoolAddressResponse>(
    `/dbc-pool/addresses/${mintAddress}`
  );
  
  return response.data.dbcPoolAddress;
}

/**
 * Get unclaimed fees for a Jupiter DBC pool
 * 
 * Per docs: POST /dbc/fee with body { poolAddress }
 * Returns: { data: { totalFee, unclaimedFee } }
 */
export async function getJupiterFeeInfo(
  poolAddress: string
): Promise<JupiterFeeInfo> {
  console.log(`[JUPITER] Fetching fee info for pool: ${poolAddress}`);
  
  const response = await jupiterRequest<FeeInfoResponse>('/dbc/fee', {
    method: 'POST',
    body: JSON.stringify({ poolAddress }),
  });
  
  return {
    totalFees: response.data.totalFee || 0,
    unclaimedFees: response.data.unclaimedFee || 0,
    claimedFees: response.data.claimedFee || 0,
    poolAddress,
  };
}

/**
 * Claim fees from a Jupiter DBC pool
 * 
 * Per docs: POST /dbc/fee/create-tx with body { ownerWallet, poolAddress, maxQuoteAmount }
 * Returns: { transaction } - unsigned transaction to sign and submit
 */
export async function claimJupiterFees(
  connection: Connection,
  creatorKeypair: Keypair,
  poolAddress: string,
  maxQuoteAmount?: number
): Promise<ClaimFeesResult> {
  try {
    console.log(`[JUPITER] Creating claim transaction for pool: ${poolAddress}`);

    // Step 1: Get the claim transaction from Jupiter
    const claimBody: Record<string, unknown> = {
      ownerWallet: creatorKeypair.publicKey.toBase58(),
      poolAddress,
    };
    
    if (maxQuoteAmount !== undefined) {
      claimBody.maxQuoteAmount = maxQuoteAmount;
    }

    const claimTxResponse = await jupiterRequest<ClaimTxResponse>('/dbc/fee/create-tx', {
      method: 'POST',
      body: JSON.stringify(claimBody),
    });

    const { transaction: txBase64 } = claimTxResponse;

    // Step 2: Deserialize and sign
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(txBase64, 'base64')
    );
    
    transaction.sign([creatorKeypair]);

    // Step 3: Submit transaction directly to RPC
    console.log('[JUPITER] Submitting claim transaction...');
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[JUPITER] Claim transaction submitted: ${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Claim transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[JUPITER] ✅ Fees claimed successfully: ${signature}`);

    return {
      success: true,
      txSignature: signature,
    };

  } catch (error) {
    console.error('[JUPITER] Claim fees error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Fee claim failed',
    };
  }
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate Jupiter token parameters
 */
export function validateJupiterTokenParams(params: {
  name: string;
  symbol: string;
  decimals?: number;
}): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Name validation
  if (!params.name || params.name.trim().length === 0) {
    errors.push('Token name is required');
  } else if (params.name.length > 32) {
    errors.push('Token name must be 32 characters or less');
  }

  // Symbol validation
  if (!params.symbol || params.symbol.trim().length === 0) {
    errors.push('Token symbol is required');
  } else if (params.symbol.length > 10) {
    errors.push('Token symbol must be 10 characters or less');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// TRADING
// ============================================================================

interface JupiterSwapParams {
  walletKeypair: Keypair;
  tokenMint: string;
  action: 'buy' | 'sell';
  amount: number; // SOL for buy, tokens for sell
  slippageBps: number;
  tokenDecimals?: number;
}

interface JupiterSwapResult {
  success: boolean;
  txSignature?: string;
  amountSol?: number;
  amountTokens?: number;
  pricePerToken?: number;
  error?: string;
}

/**
 * Execute a swap on Jupiter
 * Used for trading Jupiter DBC tokens
 */
export async function executeJupiterSwap(
  connection: Connection,
  params: JupiterSwapParams
): Promise<JupiterSwapResult> {
  const { walletKeypair, tokenMint, action, amount, slippageBps, tokenDecimals = 6 } = params;
  
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  
  try {
    let inputMint: string;
    let outputMint: string;
    let amountRaw: number;
    
    if (action === 'buy') {
      // Buy: SOL -> Token
      inputMint = SOL_MINT;
      outputMint = tokenMint;
      amountRaw = Math.floor(amount * 1e9); // SOL has 9 decimals
    } else {
      // Sell: Token -> SOL
      inputMint = tokenMint;
      outputMint = SOL_MINT;
      amountRaw = Math.floor(amount * Math.pow(10, tokenDecimals));
    }
    
    console.log(`[JUPITER] ${action.toUpperCase()}: ${inputMint.slice(0, 8)} -> ${outputMint.slice(0, 8)}, amount: ${amountRaw}`);
    
    // Get quote
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountRaw}&slippageBps=${slippageBps}`;
    
    const quoteResponse = await fetch(quoteUrl, {
      headers: { 'Accept': 'application/json' },
    });
    
    if (!quoteResponse.ok) {
      const errorText = await quoteResponse.text();
      throw new Error(`Quote failed: ${quoteResponse.status} - ${errorText}`);
    }
    
    const quoteData = await quoteResponse.json();
    
    if (!quoteData || quoteData.error) {
      throw new Error(`Quote error: ${quoteData?.error || 'No quote data'}`);
    }
    
    // Get swap transaction
    const swapResponse = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quoteData,
        userPublicKey: walletKeypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
      }),
    });
    
    if (!swapResponse.ok) {
      const swapError = await swapResponse.text();
      throw new Error(`Swap failed: ${swapResponse.status} - ${swapError}`);
    }
    
    const { swapTransaction } = await swapResponse.json();
    
    if (!swapTransaction) {
      throw new Error('No swap transaction returned');
    }
    
    // Deserialize and sign
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(swapTransaction, 'base64')
    );
    transaction.sign([walletKeypair]);
    
    // Send transaction
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
    
    // Confirm
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    // Calculate amounts from quote
    const inAmount = Number(quoteData.inAmount);
    const outAmount = Number(quoteData.outAmount);
    
    let amountSol: number;
    let amountTokens: number;
    
    if (action === 'buy') {
      amountSol = inAmount / 1e9;
      amountTokens = outAmount / Math.pow(10, tokenDecimals);
    } else {
      amountTokens = inAmount / Math.pow(10, tokenDecimals);
      amountSol = outAmount / 1e9;
    }
    
    const pricePerToken = amountSol / amountTokens;
    
    console.log(`[JUPITER] ✅ Swap successful: ${signature}`);
    console.log(`[JUPITER] Amount SOL: ${amountSol}, Tokens: ${amountTokens}, Price: ${pricePerToken}`);
    
    return {
      success: true,
      txSignature: signature,
      amountSol,
      amountTokens,
      pricePerToken,
    };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Swap failed';
    console.error('[JUPITER] Swap error:', errorMessage);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  JUPITER_API_BASE,
  JUPITER_STUDIO_API,
};
