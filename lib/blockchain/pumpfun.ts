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

// ============================================================================
// CONFIGURATION
// ============================================================================

const PUMP_PORTAL_API = 'https://pumpportal.fun/api';
const PUMP_IPFS_API = 'https://pump.fun/api/ipfs';
const PUMP_PORTAL_IPFS = 'https://pumpportal.fun/api/ipfs';

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
}

export interface CreateTokenResult {
  success: boolean;
  mintAddress?: string;
  metadataUri?: string;
  txSignature?: string;
  error?: string;
}

export interface TradeParams {
  tokenMint: string;
  walletKeypair: Keypair;
  amountSol: number;
  slippageBps?: number;
  priorityFee?: number;
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
    // Create form data
    const formData = new FormData();
    
    // Handle image
    if (metadata.image instanceof File) {
      formData.append('file', metadata.image);
    } else if (typeof metadata.image === 'string' && metadata.image.startsWith('http')) {
      // Fetch and convert URL to blob
      const response = await fetch(metadata.image);
      const blob = await response.blob();
      formData.append('file', blob, 'image.png');
    }
    
    formData.append('name', metadata.name);
    formData.append('symbol', metadata.symbol);
    formData.append('description', metadata.description);
    
    if (metadata.twitter) formData.append('twitter', metadata.twitter);
    if (metadata.telegram) formData.append('telegram', metadata.telegram);
    if (metadata.website) formData.append('website', metadata.website);
    formData.append('showName', String(metadata.showName ?? true));

    // Try official Pump.fun endpoint first
    try {
      const response = await fetch(PUMP_IPFS_API, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        return {
          success: true,
          metadataUri: data.metadataUri,
        };
      }
    } catch (e) {
      console.warn('[IPFS] Official endpoint failed, trying PumpPortal fallback');
    }

    // Fallback to PumpPortal IPFS
    const fallbackResponse = await fetch(PUMP_PORTAL_IPFS, {
      method: 'POST',
      body: formData,
    });

    if (!fallbackResponse.ok) {
      throw new Error(`IPFS upload failed: ${fallbackResponse.status}`);
    }

    const fallbackData = await fallbackResponse.json();
    return {
      success: true,
      metadataUri: fallbackData.metadataUri,
    };

  } catch (error) {
    console.error('[IPFS] Upload error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'IPFS upload failed',
    };
  }
}

// ============================================================================
// TOKEN CREATION
// ============================================================================

/**
 * Create a new token on Pump.fun via PumpPortal
 */
export async function createToken(
  connection: Connection,
  params: CreateTokenParams
): Promise<CreateTokenResult> {
  try {
    const { metadata, creatorKeypair, initialBuySol = 0, slippageBps = 500, priorityFee = 0.001 } = params;

    // Step 1: Upload metadata to IPFS
    console.log('[PUMP] Uploading metadata to IPFS...');
    const ipfsResult = await uploadToIPFS(metadata);
    
    if (!ipfsResult.success || !ipfsResult.metadataUri) {
      return {
        success: false,
        error: ipfsResult.error || 'Failed to upload metadata',
      };
    }

    // Step 2: Generate mint keypair
    const mintKeypair = Keypair.generate();
    console.log(`[PUMP] Mint address: ${mintKeypair.publicKey.toBase58()}`);

    // Step 3: Request create transaction from PumpPortal
    console.log('[PUMP] Requesting create transaction...');
    
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
      pool: 'pump',
    };

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
    console.log(`[PUMP] Confirming transaction: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Token created successfully: ${mintKeypair.publicKey.toBase58()}`);

    return {
      success: true,
      mintAddress: mintKeypair.publicKey.toBase58(),
      metadataUri: ipfsResult.metadataUri,
      txSignature: signature,
    };

  } catch (error) {
    console.error('[PUMP] Create token error:', error);
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
 * Buy tokens on Pump.fun bonding curve
 */
export async function buyOnBondingCurve(
  connection: Connection,
  params: TradeParams
): Promise<TradeResult> {
  try {
    const { tokenMint, walletKeypair, amountSol, slippageBps = 500, priorityFee = 0.0001 } = params;

    console.log(`[PUMP] Buying ${amountSol} SOL worth of ${tokenMint.slice(0, 8)}...`);

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: walletKeypair.publicKey.toBase58(),
        action: 'buy',
        mint: tokenMint,
        amount: amountSol,
        denominatedInSol: 'true',
        slippage: slippageBps,
        priorityFee: priorityFee,
        pool: 'pump',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([walletKeypair]);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Buy successful: ${signature}`);

    return {
      success: true,
      txSignature: signature,
      amountSol,
    };

  } catch (error) {
    console.error('[PUMP] Buy error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Buy failed',
    };
  }
}

/**
 * Sell tokens on Pump.fun bonding curve
 */
export async function sellOnBondingCurve(
  connection: Connection,
  params: TradeParams & { amountTokens: number }
): Promise<TradeResult> {
  try {
    const { tokenMint, walletKeypair, amountTokens, slippageBps = 500, priorityFee = 0.0001 } = params;

    console.log(`[PUMP] Selling ${amountTokens} tokens of ${tokenMint.slice(0, 8)}...`);

    const response = await fetch(`${PUMP_PORTAL_API}/trade-local`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: walletKeypair.publicKey.toBase58(),
        action: 'sell',
        mint: tokenMint,
        amount: amountTokens,
        denominatedInSol: 'false',
        slippage: slippageBps,
        priorityFee: priorityFee,
        pool: 'pump',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`PumpPortal API error: ${response.status} - ${errorText}`);
    }

    const txData = await response.arrayBuffer();
    const tx = VersionedTransaction.deserialize(new Uint8Array(txData));
    
    tx.sign([walletKeypair]);

    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    });

    const confirmation = await connection.confirmTransaction(signature, 'confirmed');

    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }

    console.log(`[PUMP] Sell successful: ${signature}`);

    return {
      success: true,
      txSignature: signature,
      amountTokens,
    };

  } catch (error) {
    console.error('[PUMP] Sell error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Sell failed',
    };
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
};

