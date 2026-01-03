/**
 * AQUA Launchpad - Jupiter Studio API Integration
 * 
 * Creates tokens on Jupiter's Dynamic Bonding Curve (DBC) pools
 * and manages post-launch fee collection.
 * 
 * API Documentation: https://dev.jup.ag/docs/studio-api/create-token
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

export interface CreateJupiterTokenParams {
  metadata: JupiterTokenMetadata;
  creatorKeypair: Keypair;
  initialBuySol?: number;
  slippageBps?: number;
  mintKeypair?: Keypair;
}

export interface CreateJupiterTokenResult {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
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

// Response types from Jupiter API
interface CreateTxResponse {
  transaction: string; // base64 encoded
  mint: string;
  imageUploadUrl: string;
  metadataUploadUrl: string;
}

interface PoolAddressResponse {
  data: {
    dbcPoolAddress: string;
  };
}

interface FeeResponse {
  data: {
    totalFee: number;
    unclaimedFee: number;
    claimedFee: number;
  };
}

interface ClaimTxResponse {
  transaction: string; // base64 encoded
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
  
  const response = await fetch(`${JUPITER_STUDIO_API}${endpoint}`, {
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
 * Upload file to presigned URL
 */
async function uploadToPresignedUrl(
  url: string,
  data: Buffer | string,
  contentType: string
): Promise<void> {
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
    },
    body: data,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to upload to presigned URL: ${response.status} - ${errorText}`);
  }
}

/**
 * Build Metaplex-compatible metadata JSON
 */
function buildMetaplexMetadata(
  metadata: JupiterTokenMetadata,
  imageUrl: string
): object {
  return {
    name: metadata.name,
    symbol: metadata.symbol,
    description: metadata.description,
    image: imageUrl,
    showName: true,
    createdOn: 'https://aqua.launchpad',
    ...(metadata.website && { external_url: metadata.website }),
    properties: {
      files: [
        {
          uri: imageUrl,
          type: 'image/png',
        },
      ],
      category: 'image',
    },
    attributes: [
      ...(metadata.twitter ? [{ trait_type: 'twitter', value: metadata.twitter }] : []),
      ...(metadata.telegram ? [{ trait_type: 'telegram', value: metadata.telegram }] : []),
      ...(metadata.discord ? [{ trait_type: 'discord', value: metadata.discord }] : []),
      ...(metadata.website ? [{ trait_type: 'website', value: metadata.website }] : []),
    ],
  };
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a new token on Jupiter's Dynamic Bonding Curve
 * 
 * Flow:
 * 1. Request create-tx from Jupiter (returns unsigned tx + presigned URLs)
 * 2. Upload image to presigned URL
 * 3. Upload metadata JSON to presigned URL
 * 4. Sign and submit transaction
 */
export async function createJupiterToken(
  connection: Connection,
  params: CreateJupiterTokenParams
): Promise<CreateJupiterTokenResult> {
  const {
    metadata,
    creatorKeypair,
    initialBuySol = 0,
    slippageBps = 500,
    mintKeypair: providedMintKeypair,
  } = params;

  try {
    console.log(`[JUPITER] Creating token: ${metadata.name} (${metadata.symbol})`);

    // Step 1: Use provided mint keypair or generate new one
    const mintKeypair = providedMintKeypair || Keypair.generate();
    console.log(`[JUPITER] Mint address: ${mintKeypair.publicKey.toBase58()}`);

    // Step 2: Request create transaction from Jupiter
    console.log('[JUPITER] Requesting create transaction...');
    
    const createTxResponse = await jupiterRequest<CreateTxResponse>('/create-tx', {
      method: 'POST',
      body: JSON.stringify({
        publicKey: creatorKeypair.publicKey.toBase58(),
        mint: mintKeypair.publicKey.toBase58(),
        name: metadata.name,
        symbol: metadata.symbol,
        description: metadata.description,
        // Initial buy amount in lamports
        ...(initialBuySol > 0 && {
          buyAmount: Math.floor(initialBuySol * 1e9),
          slippageBps,
        }),
      }),
    });

    const { transaction: txBase64, imageUploadUrl, metadataUploadUrl } = createTxResponse;

    // Step 3: Upload image to presigned URL
    console.log('[JUPITER] Uploading image...');
    
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

    await uploadToPresignedUrl(imageUploadUrl, imageBuffer, imageMimeType);
    console.log('[JUPITER] ✅ Image uploaded');

    // Step 4: Upload metadata JSON to presigned URL
    console.log('[JUPITER] Uploading metadata...');
    
    // Extract the image URL from the presigned URL (remove query params)
    const imageUrl = imageUploadUrl.split('?')[0];
    const metadataJson = buildMetaplexMetadata(metadata, imageUrl);
    
    await uploadToPresignedUrl(
      metadataUploadUrl,
      JSON.stringify(metadataJson),
      'application/json'
    );
    console.log('[JUPITER] ✅ Metadata uploaded');

    // Step 5: Deserialize, sign, and submit transaction
    console.log('[JUPITER] Signing and submitting transaction...');
    
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(txBase64, 'base64')
    );
    
    // Sign with both creator and mint keypairs
    transaction.sign([creatorKeypair, mintKeypair]);
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[JUPITER] Transaction submitted: ${signature}`);

    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[JUPITER] ✅ Token created successfully: ${mintKeypair.publicKey.toBase58()}`);

    // Get the DBC pool address
    let dbcPoolAddress: string | undefined;
    try {
      dbcPoolAddress = await getJupiterPoolAddress(mintKeypair.publicKey.toBase58());
    } catch (poolError) {
      console.warn('[JUPITER] Could not fetch pool address immediately:', poolError);
    }

    // Extract metadata URI from presigned URL
    const metadataUri = metadataUploadUrl.split('?')[0];

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      metadataUri,
      txSignature: signature,
      dbcPoolAddress,
    };

  } catch (error) {
    console.error('[JUPITER] Create token error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token creation failed',
    };
  }
}

// ============================================================================
// POOL & FEE MANAGEMENT
// ============================================================================

/**
 * Get the DBC pool address for a token
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
 */
export async function getJupiterFeeInfo(poolAddress: string): Promise<JupiterFeeInfo> {
  console.log(`[JUPITER] Fetching fee info for pool: ${poolAddress}`);
  
  const response = await jupiterRequest<FeeResponse>('/dbc/fee', {
    method: 'POST',
    body: JSON.stringify({
      poolAddress,
    }),
  });
  
  return {
    totalFees: response.data.totalFee,
    unclaimedFees: response.data.unclaimedFee,
    claimedFees: response.data.claimedFee,
    poolAddress,
  };
}

/**
 * Claim fees from a Jupiter DBC pool
 */
export async function claimJupiterFees(
  connection: Connection,
  creatorKeypair: Keypair,
  poolAddress: string,
  maxQuoteAmount: number = 1_000_000_000_000 // Default to very high to claim all
): Promise<ClaimFeesResult> {
  try {
    console.log(`[JUPITER] Creating claim transaction for pool: ${poolAddress}`);

    // Step 1: Get the claim transaction
    const claimTxResponse = await jupiterRequest<ClaimTxResponse>('/dbc/fee/create-tx', {
      method: 'POST',
      body: JSON.stringify({
        ownerWallet: creatorKeypair.publicKey.toBase58(),
        poolAddress,
        maxQuoteAmount,
      }),
    });

    const { transaction: txBase64 } = claimTxResponse;

    // Step 2: Deserialize and sign
    const transaction = VersionedTransaction.deserialize(
      Buffer.from(txBase64, 'base64')
    );
    
    transaction.sign([creatorKeypair]);

    // Step 3: Submit transaction
    console.log('[JUPITER] Submitting claim transaction...');
    
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 0,
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
// EXPORTS
// ============================================================================

export {
  JUPITER_API_BASE,
  JUPITER_STUDIO_API,
};

