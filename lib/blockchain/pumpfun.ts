/**
 * AQUA Launchpad - PumpPortal Integration
 * 
 * Adapted from HelperScripts/pumpfun_complete.js
 * Handles token creation and trading on Pump.fun bonding curve
 * 
 * Features:
 * - Token creation via PumpPortal API
 * - IPFS metadata upload
 * - Buy/sell on bonding curve
 * - Bundle transactions with Jito
 * - Creator vault fee collection
 */

import { 
  Connection, 
  PublicKey, 
  Keypair, 
  Transaction, 
  VersionedTransaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
} from '@solana/web3.js';
import { solToLamports, lamportsToSol } from '@/lib/precision';
import FormDataLib from 'form-data';
import axios from 'axios';
import { buyViaSDK, sellViaSDK, isSDKAvailable } from './pumpfun-sdk';

// ============================================================================
// CONFIGURATION
// ============================================================================

const PUMP_PORTAL_API = 'https://pumpportal.fun/api';
const PUMP_IPFS_API = 'https://pump.fun/api/ipfs';
const PUMP_PORTAL_IPFS = 'https://pumpportal.fun/api/ipfs';

// Bonk.fun IPFS endpoints
const BONK_IPFS_IMAGE = 'https://nft-storage.letsbonk22.workers.dev/upload/img';
const BONK_IPFS_META = 'https://nft-storage.letsbonk22.workers.dev/upload/meta';

// Pool types
export const POOL_TYPES = {
  PUMP: 'pump',
  BONK: 'bonk',
} as const;

export type PoolType = typeof POOL_TYPES[keyof typeof POOL_TYPES];

// Quote mints (pair currencies)
export const QUOTE_MINTS = {
  WSOL: 'So11111111111111111111111111111111111111112',
  USD1: 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB',
} as const;

export type QuoteMint = typeof QUOTE_MINTS[keyof typeof QUOTE_MINTS];

const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL_ACCOUNT = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbCvr4hckAzJfj');

// ============================================================================
// TYPES
// ============================================================================

export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  image: File | string; // File object or URL
  twitter?: string;
  telegram?: string;
  website?: string;
  showName?: boolean;
}

export interface CreateTokenParams {
  metadata: TokenMetadata;
  creatorKeypair: Keypair;
  initialBuySol?: number;
  slippageBps?: number;
  priorityFee?: number;
  mintKeypair?: Keypair; // Optional pre-generated mint keypair from frontend
  pool?: PoolType; // 'pump' or 'bonk' - defaults to 'pump'
  quoteMint?: QuoteMint; // Quote currency (WSOL or USD1) - only applicable for bonk pool
}

export interface CreateTokenResult {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
  txSignature?: string;
  error?: string;
  pool?: PoolType; // Which pool was used
  quoteMint?: QuoteMint; // Which quote mint was used
}

export interface TradeParams {
  tokenMint: string;
  walletKeypair: Keypair;
  amountSol: number;
  slippageBps?: number;
  priorityFee?: number;
  tokenDecimals?: number;
  pool?: PoolType; // 'pump' or 'bonk' - defaults to 'pump'
}

export interface TradeResult {
  success: boolean;
  txSignature?: string;
  amountTokens?: number;
  amountSol?: number;
  pricePerToken?: number;
  error?: string;
}

// ============================================================================
// IPFS UPLOAD
// ============================================================================

/**
 * Upload token metadata and image to IPFS
 */
export async function uploadToIPFS(metadata: TokenMetadata): Promise<{
  success: boolean;
  metadataUri?: string;
  error?: string;
}> {
  try {
    // Create form data using Node.js form-data package
    const form = new FormDataLib();
    
    // Handle image - support File, URL, or base64 data URI
    let imageBuffer: Buffer | null = null;
    
    if (metadata.image instanceof File) {
      // Convert File to Buffer (Node.js environment)
      const arrayBuffer = await metadata.image.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else if (typeof metadata.image === 'string') {
      if (metadata.image.startsWith('http')) {
        // Fetch and convert URL to buffer
        try {
          const response = await fetch(metadata.image);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        } catch (e) {
          console.warn('[IPFS] Failed to fetch image from URL, skipping image upload');
        }
      } else if (metadata.image.startsWith('data:')) {
        // Handle base64 data URI
        try {
          const base64Data = metadata.image.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
          console.warn('[IPFS] Failed to process base64 image, skipping image upload');
        }
      }
    }
    
    // Add image file if available (OFFICIAL format matching your working code)
    if (imageBuffer) {
      form.append('file', imageBuffer, {
        filename: 'image.png',
        contentType: 'image/png'
      });
    }
    
    // Add metadata fields (OFFICIAL format)
    form.append('name', metadata.name);
    form.append('symbol', metadata.symbol);
    form.append('description', metadata.description || '');
    form.append('showName', 'true'); // FIXED: Missing from original code
    
    if (metadata.twitter) form.append('twitter', metadata.twitter);
    if (metadata.telegram) form.append('telegram', metadata.telegram);
    if (metadata.website) form.append('website', metadata.website);

    // Try official Pump.fun endpoint first (using axios like your working code)
    let lastError: Error | null = null;
    try {
      console.log('[IPFS] Attempting upload to pump.fun endpoint...');
      const officialResponse = await axios.post(PUMP_IPFS_API, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });
      
      if (officialResponse.data && officialResponse.data.metadataUri) {
        console.log(`✅ Uploaded to OFFICIAL pump.fun: ${officialResponse.data.metadataUri}`);
        return {
          success: true,
          metadataUri: officialResponse.data.metadataUri,
        };
      }
    } catch (officialError: any) {
      console.warn('[IPFS] Official API failed, trying PumpPortal...', officialError?.response?.status || officialError?.message);
      lastError = officialError instanceof Error ? officialError : new Error('Official API failed');
    }

    // Fallback to PumpPortal IPFS
    try {
      console.log('[IPFS] Attempting upload to PumpPortal endpoint...');
      const pumpPortalResponse = await axios.post(`${PUMP_PORTAL_API}/ipfs`, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 30000
      });
      
      if (!pumpPortalResponse.data || !pumpPortalResponse.data.metadataUri) {
        throw new Error('Failed to upload metadata');
      }
      
      console.log(`✅ Metadata uploaded via PumpPortal: ${pumpPortalResponse.data.metadataUri}`);
      
      return {
        success: true,
        metadataUri: pumpPortalResponse.data.metadataUri,
      };
    } catch (e: any) {
      console.error('[IPFS] PumpPortal endpoint failed:', e?.response?.status || e?.message);
      const errorDetail = e?.response?.data || e?.message || 'Unknown error';
      throw lastError || new Error(`PumpPortal IPFS upload failed: ${errorDetail}`);
    }

  } catch (error) {
    console.error('[IPFS] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'IPFS upload failed',
    };
  }
}

/**
 * Upload token metadata and image to Bonk IPFS (for bonk.fun tokens)
 * Uses different endpoints than pump.fun
 */
export async function uploadToBonkIPFS(metadata: TokenMetadata): Promise<{
  success: boolean;
  metadataUri?: string;
  imageUri?: string;
  error?: string;
}> {
  try {
    // Handle image - support File, URL, or base64 data URI
    let imageBuffer: Buffer | null = null;
    
    if (metadata.image instanceof File) {
      const arrayBuffer = await metadata.image.arrayBuffer();
      imageBuffer = Buffer.from(arrayBuffer);
    } else if (typeof metadata.image === 'string') {
      if (metadata.image.startsWith('http')) {
        try {
          const response = await fetch(metadata.image);
          if (!response.ok) {
            throw new Error(`Failed to fetch image: ${response.status}`);
          }
          const arrayBuffer = await response.arrayBuffer();
          imageBuffer = Buffer.from(arrayBuffer);
        } catch (e) {
          console.warn('[BONK-IPFS] Failed to fetch image from URL');
        }
      } else if (metadata.image.startsWith('data:')) {
        try {
          const base64Data = metadata.image.split(',')[1];
          imageBuffer = Buffer.from(base64Data, 'base64');
        } catch (e) {
          console.warn('[BONK-IPFS] Failed to process base64 image');
        }
      }
    }

    if (!imageBuffer) {
      return {
        success: false,
        error: 'Image is required for Bonk token creation',
      };
    }

    // Step 1: Upload image to Bonk IPFS
    console.log('[BONK-IPFS] Uploading image...');
    const imageForm = new FormDataLib();
    imageForm.append('image', imageBuffer, {
      filename: 'image.png',
      contentType: 'image/png'
    });

    const imgResponse = await axios.post(BONK_IPFS_IMAGE, imageForm, {
      headers: { ...imageForm.getHeaders() },
      timeout: 30000,
    });

    const imageUri = imgResponse.data;
    if (!imageUri || typeof imageUri !== 'string') {
      throw new Error('Failed to get image URI from Bonk IPFS');
    }
    console.log(`[BONK-IPFS] ✅ Image uploaded: ${imageUri}`);

    // Step 2: Upload metadata to Bonk IPFS
    console.log('[BONK-IPFS] Uploading metadata...');
    const metadataPayload = {
      createdOn: 'https://bonk.fun',
      description: metadata.description || '',
      image: imageUri,
      name: metadata.name,
      symbol: metadata.symbol,
      website: metadata.website || '',
      twitter: metadata.twitter || '',
      telegram: metadata.telegram || '',
    };

    const metaResponse = await axios.post(BONK_IPFS_META, metadataPayload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    });

    const metadataUri = metaResponse.data;
    if (!metadataUri || typeof metadataUri !== 'string') {
      throw new Error('Failed to get metadata URI from Bonk IPFS');
    }
    console.log(`[BONK-IPFS] ✅ Metadata uploaded: ${metadataUri}`);

    return {
      success: true,
      metadataUri,
      imageUri,
    };

  } catch (error) {
    console.error('[BONK-IPFS] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Bonk IPFS upload failed',
    };
  }
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a new token on Pump.fun or Bonk.fun via PumpPortal
 * Supports both SOL and USD1 quote currencies for Bonk pools
 */
export async function createToken(
  connection: Connection,
  params: CreateTokenParams
): Promise<CreateTokenResult> {
  try {
    const { 
      metadata, 
      creatorKeypair, 
      initialBuySol = 0, 
      slippageBps = 500, 
      priorityFee = 0.001, 
      mintKeypair: providedMintKeypair,
      pool = POOL_TYPES.PUMP,
      quoteMint = QUOTE_MINTS.WSOL,
    } = params;

    const logPrefix = pool === POOL_TYPES.BONK ? '[BONK]' : '[PUMP]';

    // Step 1: Upload metadata to appropriate IPFS
    console.log(`${logPrefix} Uploading metadata to IPFS...`);
    
    let ipfsResult: { success: boolean; metadataUri?: string; error?: string };
    
    if (pool === POOL_TYPES.BONK) {
      // Use Bonk IPFS for bonk.fun tokens
      ipfsResult = await uploadToBonkIPFS(metadata);
    } else {
      // Use Pump.fun IPFS for pump.fun tokens
      ipfsResult = await uploadToIPFS(metadata);
    }
    
    if (!ipfsResult.success || !ipfsResult.metadataUri) {
      console.error(`${logPrefix} IPFS upload failed:`, ipfsResult.error);
      return {
        success: false,
        error: `IPFS upload failed: ${ipfsResult.error}. Please check that the IPFS service is available or try again later.`,
      };
    }

    // Step 2: Use provided mint keypair or generate new one
    const mintKeypair = providedMintKeypair || Keypair.generate();
    const mintSource = providedMintKeypair ? 'pre-generated (frontend)' : 'generated (backend)';
    console.log(`${logPrefix} Mint address: ${mintKeypair.publicKey.toBase58()} (${mintSource})`);

    // Step 3: Request create transaction from PumpPortal
    console.log(`${logPrefix} Requesting create transaction (pool: ${pool}, quoteMint: ${quoteMint === QUOTE_MINTS.USD1 ? 'USD1' : 'SOL'})...`);
    
    const createParams: Record<string, any> = {
      publicKey: creatorKeypair.publicKey.toBase58(),
      action: 'create',
      tokenMetadata: {
        name: metadata.name,
        symbol: metadata.symbol,
        uri: ipfsResult.metadataUri,
      },
      mint: mintKeypair.publicKey.toBase58(),
      denominatedInSol: 'true',
      slippage: slippageBps,
      priorityFee: priorityFee,
      pool: pool,
    };

    // Add quoteMint for bonk pool (USD1 or SOL pairing)
    if (pool === POOL_TYPES.BONK) {
      createParams.quoteMint = quoteMint;
    }

    // Add initial buy if specified
    if (initialBuySol > 0) {
      createParams.amount = initialBuySol;
    }

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createParams),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
    }

    // Step 4: Sign and send transaction
    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([creatorKeypair, mintKeypair]);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    // Step 5: Confirm transaction
    console.log(`${logPrefix} Confirming transaction: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`${logPrefix} Token created successfully: ${mintKeypair.publicKey.toBase58()}`);

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      metadataUri: ipfsResult.metadataUri,
      txSignature: signature,
      pool,
      quoteMint,
    };

  } catch (error) {
    console.error('[CREATE] Create token error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Token creation failed',
    };
  }
}

// ============================================================================
// TRADING
// ============================================================================

/**
 * Format SOL amount to string (matching working implementation)
 */
function formatSolAmount(amount: number): string {
  // Ensure proper precision for SOL amounts
  if (amount >= 1) {
    return amount.toFixed(4);
  } else if (amount >= 0.1) {
    return amount.toFixed(5);
  } else if (amount >= 0.01) {
    return amount.toFixed(6);
  } else {
    return amount.toFixed(9);
  }
}

/**
 * Buy tokens on Pump.fun or Bonk.fun bonding curve
 */
export async function buyOnBondingCurve(
  connection: Connection,
  params: TradeParams
): Promise<TradeResult> {
  const { tokenMint, walletKeypair, amountSol, slippageBps = 500, priorityFee = 0.0001, pool = POOL_TYPES.PUMP } = params;
  
  // Format the amount properly (matching working implementation)
  const formattedAmount = formatSolAmount(amountSol);
  // Convert slippageBps to percentage (500 bps = 5%)
  const slippagePercent = slippageBps / 100;
  const logPrefix = pool === POOL_TYPES.BONK ? '[BONK]' : '[PUMP]';
  
  // Try PumpPortal API first
  try {
    console.log(`${logPrefix} Buying ${formattedAmount} SOL worth of ${tokenMint.slice(0, 8)}... via PumpPortal`);

    const requestBody = {
      publicKey: walletKeypair.publicKey.toBase58(),
      action: 'buy',
      mint: tokenMint,
      amount: formattedAmount,
      denominatedInSol: 'true',
      slippage: slippagePercent,
      priorityFee: priorityFee,
      pool: pool,
      jitoOnly: 'true',
      skipPreflight: 'false',
    };
    
    console.log(`${logPrefix} Buy request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PUMP] PumpPortal buy error details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        mint: tokenMint,
        amount: amountSol,
        wallet: walletKeypair.publicKey.toBase58().slice(0, 8),
      });
      throw new Error(`PumpPortal: ${response.status} - ${errorText}`);
    }

    const txData = await response.arrayBuffer();
    
    if (txData.byteLength === 0) {
      throw new Error('PumpPortal returned empty transaction data');
    }
    
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([walletKeypair]);

    console.log(`[PUMP] Sending buy transaction...`);
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[PUMP] Confirming transaction: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      console.error('[PUMP] Transaction confirmation error:', confirmation.value.err);
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Buy successful: ${signature}`);

    return {
      success: true,
      txSignature: signature,
      amountSol,
    };

  } catch (apiError) {
    const apiErrorMessage = apiError instanceof Error ? apiError.message : 'PumpPortal API failed';
    console.warn(`[PUMP] PumpPortal API failed, attempting SDK fallback:`, apiErrorMessage);
    
    // Fallback to PumpDotFun SDK
    try {
      const sdkAvailable = await isSDKAvailable();
      if (!sdkAvailable) {
        console.error('[PUMP] SDK fallback not available');
        return {
          success: false,
          error: `${apiErrorMessage} (SDK fallback unavailable)`,
        };
      }
      
      console.log('[PUMP] Using SDK fallback for buy...');
      const sdkResult = await buyViaSDK(
        connection,
        tokenMint,
        walletKeypair,
        amountSol,
        slippageBps
      );
      
      if (sdkResult.success) {
        console.log('[PUMP] SDK fallback buy successful');
      }
      
      return sdkResult;
      
    } catch (sdkError) {
      const sdkErrorMessage = sdkError instanceof Error ? sdkError.message : 'SDK fallback failed';
      console.error('[PUMP] SDK fallback also failed:', sdkErrorMessage);
      return {
        success: false,
        error: `API: ${apiErrorMessage} | SDK: ${sdkErrorMessage}`,
      };
    }
  }
}

/**
 * Format token amount to string with proper decimals
 */
function formatTokenAmount(amount: number, decimals: number = 6): string {
  // Ensure proper precision for token amounts
  return amount.toFixed(decimals);
}

/**
 * Get associated token account address for a wallet and mint
 */
async function getTokenAccountAddress(
  connection: Connection,
  walletPubkey: PublicKey,
  mintPubkey: PublicKey
): Promise<string | null> {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(walletPubkey, {
      mint: mintPubkey,
    });
    
    if (tokenAccounts.value.length > 0) {
      return tokenAccounts.value[0].pubkey.toBase58();
    }
    return null;
  } catch (error) {
    console.error('[PUMP] Error getting token account:', error);
    return null;
  }
}

/**
 * Sell tokens on Pump.fun or Bonk.fun bonding curve
 */
export async function sellOnBondingCurve(
  connection: Connection,
  params: TradeParams & { amountTokens: number; tokenDecimals?: number }
): Promise<TradeResult> {
  const { tokenMint, walletKeypair, amountTokens, slippageBps = 500, priorityFee = 0.0001, tokenDecimals = 6, pool = POOL_TYPES.PUMP } = params;

  // Format the amount properly (Pump.fun uses 6 decimals)
  const formattedAmount = formatTokenAmount(amountTokens, tokenDecimals);
  // Convert slippageBps to percentage (500 bps = 5%)
  const slippagePercent = slippageBps / 100;
  const logPrefix = pool === POOL_TYPES.BONK ? '[BONK]' : '[PUMP]';
  
  // Get the token account address (required for sells)
  const tokenAccountAddress = await getTokenAccountAddress(
    connection,
    walletKeypair.publicKey,
    new PublicKey(tokenMint)
  );
  
  if (!tokenAccountAddress) {
    return {
      success: false,
      error: 'No token account found. You may not hold this token.',
    };
  }

  // Try PumpPortal API first
  try {
    console.log(`${logPrefix} Selling ${formattedAmount} tokens of ${tokenMint.slice(0, 8)}... via PumpPortal`);

    const requestBody = {
      publicKey: walletKeypair.publicKey.toBase58(),
      action: 'sell',
      mint: tokenMint,
      amount: formattedAmount,
      denominatedInSol: 'false',
      slippage: slippagePercent,
      priorityFee: priorityFee,
      pool: pool,
      tokenAccount: tokenAccountAddress,
      skipPreflight: 'false',
      jitoOnly: 'false',
    };
    
    console.log(`${logPrefix} Sell request body:`, JSON.stringify(requestBody, null, 2));

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[PUMP] PumpPortal sell error details:', {
        status: response.status,
        statusText: response.statusText,
        body: errorText,
        mint: tokenMint,
        amount: amountTokens,
        wallet: walletKeypair.publicKey.toBase58().slice(0, 8),
      });
      throw new Error(`PumpPortal: ${response.status} - ${errorText}`);
    }

    const txData = await response.arrayBuffer();
    
    if (txData.byteLength === 0) {
      throw new Error('PumpPortal returned empty transaction data');
    }
    
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([walletKeypair]);

    console.log(`[PUMP] Sending sell transaction...`);
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`[PUMP] Confirming transaction: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      console.error('[PUMP] Transaction confirmation error:', confirmation.value.err);
      throw new Error(`Transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Sell successful: ${signature}`);

    return {
      success: true,
      txSignature: signature,
      amountTokens,
    };

  } catch (apiError) {
    const apiErrorMessage = apiError instanceof Error ? apiError.message : 'PumpPortal API failed';
    console.warn(`[PUMP] PumpPortal API failed, attempting SDK fallback:`, apiErrorMessage);
    
    // Fallback to PumpDotFun SDK
    try {
      const sdkAvailable = await isSDKAvailable();
      if (!sdkAvailable) {
        console.error('[PUMP] SDK fallback not available');
        return {
          success: false,
          error: `${apiErrorMessage} (SDK fallback unavailable)`,
        };
      }
      
      console.log('[PUMP] Using SDK fallback for sell...');
      const sdkResult = await sellViaSDK(
        connection,
        tokenMint,
        walletKeypair,
        amountTokens,
        slippageBps
      );
      
      if (sdkResult.success) {
        console.log('[PUMP] SDK fallback sell successful');
      }
      
      return sdkResult;
      
    } catch (sdkError) {
      const sdkErrorMessage = sdkError instanceof Error ? sdkError.message : 'SDK fallback failed';
      console.error('[PUMP] SDK fallback also failed:', sdkErrorMessage);
      return {
        success: false,
        error: `API: ${apiErrorMessage} | SDK: ${sdkErrorMessage}`,
      };
    }
  }
}

// ============================================================================
// CREATOR VAULT (Tide Harvest)
// ============================================================================

/**
 * Get creator vault balance for a token
 */
export async function getCreatorVaultBalance(
  connection: Connection,
  tokenMint: string,
  creatorWallet: string
): Promise<{
  balance: number;
  vaultAddress: string;
}> {
  try {
    // Derive creator vault PDA
    const [vaultPda] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('creator-vault'),
        new PublicKey(tokenMint).toBuffer(),
        new PublicKey(creatorWallet).toBuffer(),
      ],
      PUMP_PROGRAM_ID
    );

    const balance = await connection.getBalance(vaultPda);

    return {
      balance: lamportsToSol(BigInt(balance)),
      vaultAddress: vaultPda.toBase58(),
    };

  } catch (error) {
    console.error('[PUMP] Get creator vault error:', error);
    return { balance: 0, vaultAddress: '' };
  }
}

/**
 * Claim creator rewards from vault
 */
export async function claimCreatorRewards(
  connection: Connection,
  tokenMint: string,
  creatorKeypair: Keypair
): Promise<{
  success: boolean;
  amount?: number;
  txSignature?: string;
  error?: string;
}> {
  try {
    // Get current balance
    const { balance, vaultAddress } = await getCreatorVaultBalance(
      connection,
      tokenMint,
      creatorKeypair.publicKey.toBase58()
    );

    if (balance <= 0) {
      return {
        success: false,
        error: 'No rewards to claim',
      };
    }

    console.log(`[PUMP] Claiming ${balance} SOL from vault ${vaultAddress}`);

    // Use PumpPortal API for creator reward claims
    const response = await fetch('https://pumpportal.fun/api/creator-claim', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mint: tokenMint,
        creatorPublicKey: creatorKeypair.publicKey.toBase58(),
        amount: Math.floor(balance * LAMPORTS_PER_SOL),
      }),
    });

    if (!response.ok) {
      // Fallback: Direct vault withdrawal if PumpPortal API unavailable
      const vaultPubkey = new PublicKey(vaultAddress);
      
      // Create withdrawal transaction
      const transaction = new Transaction();
      
      // Get recent blockhash
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = creatorKeypair.publicKey;

      // Add transfer instruction from vault to creator
      // Note: This only works if the vault is a regular account owned by creator
      // For PDA vaults, the program must sign the transfer
      transaction.add(
        SystemProgram.transfer({
          fromPubkey: vaultPubkey,
          toPubkey: creatorKeypair.publicKey,
          lamports: Math.floor(balance * LAMPORTS_PER_SOL),
        })
      );

      transaction.sign(creatorKeypair);

      const signature = await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });

      await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        'confirmed'
      );

      console.log(`[PUMP] Claim executed (direct): ${signature}`);
      return {
        success: true,
        amount: balance,
        txSignature: signature,
      };
    }

    // Process PumpPortal response
    const txData = await response.arrayBuffer();
    const tx = Transaction.from(Buffer.from(txData));
    tx.sign(creatorKeypair);

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
      maxRetries: 3,
    });

    await connection.confirmTransaction(signature, 'confirmed');
    
    console.log(`[PUMP] Claim executed via PumpPortal: ${signature}`);
    return {
      success: true,
      amount: balance,
      txSignature: signature,
    };

  } catch (error) {
    console.error('[PUMP] Claim error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Claim failed',
    };
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export {
  PUMP_PROGRAM_ID,
  PUMP_GLOBAL_ACCOUNT,
  PUMP_FEE_RECIPIENT,
  POOL_TYPES,
  QUOTE_MINTS,
  uploadToBonkIPFS,
};

