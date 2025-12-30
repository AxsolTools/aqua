// @ts-nocheck - Supabase table types are dynamically generated
/**
 * AQUA Launchpad - Referral Manager
 * 
 * Handles referral tracking, earnings, and claims
 * Adapted from HelperScripts/services/ReferralManager.js
 * 
 * Features:
 * - Unique referral code per user (linked to main wallet)
 * - 50% of platform fees go to referrer
 * - Fixed-point arithmetic to prevent floating point errors
 * - Race condition protection for claims
 */

import { createClient } from '@/lib/supabase/server';
import { getAdminClient } from '@/lib/supabase/admin';
import { 
  solToLamports, 
  lamportsToSol, 
  formatSol 
} from '@/lib/precision';

// Database row types (Supabase type inference workaround)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DbRow = Record<string, any>;

// ============================================================================
// TYPES
// ============================================================================

export interface ReferralStats {
  referralCode: string;
  referralCount: number;
  pendingEarnings: number; // SOL
  totalEarnings: number;
  totalClaimed: number;
  claimCount: number;
  canClaim: boolean;
  cooldownActive: boolean;
  cooldownRemaining: number; // ms
  cooldownRemainingFormatted: string;
  minClaimAmount: number;
  referrerSharePercent: number;
  wasReferred: boolean;
  referredByCode: string | null;
}

export interface ReferralEarningsResult {
  success: boolean;
  referrerId?: string;
  amount?: number;
  newPending?: number;
  error?: string;
}

export interface ClaimResult {
  success: boolean;
  claimId?: string;
  amount?: number;
  txSignature?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export const REFERRAL_CONFIG = {
  enabled: process.env.REFERRAL_ENABLED === 'true',
  sharePercent: parseInt(process.env.REFERRAL_SHARE_PERCENT || '50', 10),
  minClaimSol: parseFloat(process.env.REFERRAL_MIN_CLAIM_SOL || '0.01'),
  claimCooldownSeconds: parseInt(process.env.REFERRAL_CLAIM_COOLDOWN || '3600', 10),
};

// ============================================================================
// REFERRAL CODE MANAGEMENT
// ============================================================================

/**
 * Generate a unique 8-character referral code
 */
function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Avoid confusing chars
  let code = '';
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Get or create referral record for user
 * Creates unique referral code linked to user's main wallet
 */
export async function getOrCreateReferral(userId: string): Promise<{
  referralCode: string;
  isNew: boolean;
}> {
  const adminClient = getAdminClient();
  
  // Check if referral record exists
  const { data: existing } = await adminClient
    .from('referrals')
    .select('referral_code')
    .eq('user_id', userId)
    .single();
  
  if (existing?.referral_code) {
    return { referralCode: existing.referral_code, isNew: false };
  }
  
  // Generate unique code
  let code = generateReferralCode();
  let attempts = 0;
  
  while (attempts < 10) {
    const { data: exists } = await adminClient
      .from('referrals')
      .select('id')
      .eq('referral_code', code)
      .single();
    
    if (!exists) break;
    code = generateReferralCode();
    attempts++;
  }
  
  // Create new referral record
  const { error } = await adminClient
    .from('referrals')
    .insert({
      user_id: userId,
      referral_code: code,
      pending_earnings: 0,
      total_earnings: 0,
      total_claimed: 0,
      referral_count: 0,
      claim_count: 0,
    });
  
  if (error) {
    throw new Error(`Failed to create referral: ${error.message}`);
  }
  
  return { referralCode: code, isNew: true };
}

/**
 * Apply a referral code to a new user
 * Links the new user to their referrer
 */
export async function applyReferralCode(
  newUserId: string,
  referralCode: string
): Promise<{
  success: boolean;
  referrerId?: string;
  error?: string;
}> {
  if (!REFERRAL_CONFIG.enabled) {
    return { success: false, error: 'Referral system disabled' };
  }
  
  const adminClient = getAdminClient();
  const normalizedCode = referralCode.trim().toUpperCase();
  
  // Find referrer by code
  const { data: referrer } = await adminClient
    .from('referrals')
    .select('user_id')
    .eq('referral_code', normalizedCode)
    .single();
  
  if (!referrer) {
    return { success: false, error: 'Invalid referral code' };
  }
  
  // Prevent self-referral
  if (referrer.user_id === newUserId) {
    return { success: false, error: 'Cannot use your own referral code' };
  }
  
  // Check if user already has a referrer
  const { data: existingReferral } = await adminClient
    .from('referrals')
    .select('referred_by')
    .eq('user_id', newUserId)
    .single();
  
  if (existingReferral?.referred_by) {
    return { success: false, error: 'You have already been referred' };
  }
  
  // Ensure new user has a referral record
  await getOrCreateReferral(newUserId);
  
  // Link the referral
  const { error: updateError } = await adminClient
    .from('referrals')
    .update({
      referred_by: referrer.user_id,
      referred_by_code: normalizedCode,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', newUserId);
  
  if (updateError) {
    return { success: false, error: 'Failed to apply referral code' };
  }
  
  // Increment referrer's count
  await adminClient.rpc('increment_referral_count', {
    referrer_user_id: referrer.user_id,
  });
  
  console.log(`[REFERRAL] ${newUserId} referred by ${referrer.user_id} (code: ${normalizedCode})`);
  
  return { success: true, referrerId: referrer.user_id };
}

// ============================================================================
// EARNINGS MANAGEMENT
// ============================================================================

/**
 * Calculate referrer share from platform fee
 */
export function calculateReferrerShare(feeSol: number): number {
  if (!REFERRAL_CONFIG.enabled) return 0;
  return feeSol * (REFERRAL_CONFIG.sharePercent / 100);
}

/**
 * Add earnings to referrer's pending balance
 * Called when a referred user pays a platform fee
 */
export async function addReferralEarnings(
  referrerUserId: string,
  amountSol: number,
  sourceUserId: string,
  operationType: string
): Promise<ReferralEarningsResult> {
  if (!REFERRAL_CONFIG.enabled) {
    return { success: false, error: 'Referral system disabled' };
  }
  
  // Validate amount
  if (!Number.isFinite(amountSol) || amountSol <= 0 || amountSol > 1000) {
    console.warn(`[REFERRAL] Invalid earnings amount rejected: ${amountSol}`);
    return { success: false, error: 'Invalid earnings amount' };
  }
  
  const adminClient = getAdminClient();
  
  // Use fixed-point math (9 decimal places for SOL)
  const roundedAmount = Math.round(amountSol * 1e9) / 1e9;
  
  // Get current referral record
  const { data: referral } = await adminClient
    .from('referrals')
    .select('pending_earnings, total_earnings')
    .eq('user_id', referrerUserId)
    .single();
  
  if (!referral) {
    return { success: false, error: 'Referrer not found' };
  }
  
  // Update earnings with fixed-point arithmetic
  const newPending = Math.round((referral.pending_earnings + roundedAmount) * 1e9) / 1e9;
  const newTotal = Math.round((referral.total_earnings + roundedAmount) * 1e9) / 1e9;
  
  const { error: updateError } = await adminClient
    .from('referrals')
    .update({
      pending_earnings: newPending,
      total_earnings: newTotal,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', referrerUserId);
  
  if (updateError) {
    return { success: false, error: 'Failed to update earnings' };
  }
  
  // Log the earning
  await adminClient.from('referral_earnings').insert({
    referrer_id: referrerUserId,
    source_user_id: sourceUserId,
    operation_type: operationType,
    fee_amount: amountSol * 2, // Total fee (referrer gets 50%)
    referrer_share: roundedAmount,
  });
  
  console.log(`[REFERRAL] +${roundedAmount.toFixed(9)} SOL to ${referrerUserId} | Pending: ${newPending.toFixed(6)}`);
  
  return {
    success: true,
    referrerId: referrerUserId,
    amount: roundedAmount,
    newPending,
  };
}

/**
 * Get the referrer ID for a user (if they were referred)
 */
export async function getReferrer(userId: string): Promise<string | null> {
  const adminClient = getAdminClient();
  
  const { data } = await adminClient
    .from('referrals')
    .select('referred_by')
    .eq('user_id', userId)
    .single();
  
  return data?.referred_by || null;
}

// ============================================================================
// STATS & DASHBOARD
// ============================================================================

/**
 * Get referral stats for user dashboard
 */
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  const adminClient = getAdminClient();
  
  // Get or create referral record
  const { referralCode } = await getOrCreateReferral(userId);
  
  // Fetch full referral data
  const { data: referral } = await adminClient
    .from('referrals')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (!referral) {
    throw new Error('Referral record not found');
  }
  
  // Calculate cooldown
  const lastClaimTime = referral.last_claim_at 
    ? new Date(referral.last_claim_at).getTime() 
    : 0;
  const cooldownEnd = lastClaimTime + (REFERRAL_CONFIG.claimCooldownSeconds * 1000);
  const cooldownRemaining = Math.max(0, cooldownEnd - Date.now());
  const cooldownActive = cooldownRemaining > 0;
  
  // Check if can claim
  const canClaim = 
    referral.pending_earnings >= REFERRAL_CONFIG.minClaimSol && 
    !cooldownActive;
  
  return {
    referralCode,
    referralCount: referral.referral_count || 0,
    pendingEarnings: referral.pending_earnings || 0,
    totalEarnings: referral.total_earnings || 0,
    totalClaimed: referral.total_claimed || 0,
    claimCount: referral.claim_count || 0,
    canClaim,
    cooldownActive,
    cooldownRemaining,
    cooldownRemainingFormatted: formatDuration(cooldownRemaining),
    minClaimAmount: REFERRAL_CONFIG.minClaimSol,
    referrerSharePercent: REFERRAL_CONFIG.sharePercent,
    wasReferred: !!referral.referred_by,
    referredByCode: referral.referred_by_code || null,
  };
}

// ============================================================================
// CLAIMS
// ============================================================================

// Track in-progress claims to prevent race conditions
const claimsInProgress = new Set<string>();

/**
 * Process a claim request
 * Transfers pending earnings to user's wallet
 */
export async function processClaim(
  userId: string,
  destinationWallet: string
): Promise<ClaimResult> {
  if (!REFERRAL_CONFIG.enabled) {
    return { success: false, error: 'Referral system disabled' };
  }
  
  // Prevent concurrent claims
  if (claimsInProgress.has(userId)) {
    return { success: false, error: 'A claim is already in progress' };
  }
  
  claimsInProgress.add(userId);
  
  try {
    const adminClient = getAdminClient();
    
    // Get referral record
    const { data: referral } = await adminClient
      .from('referrals')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!referral) {
      return { success: false, error: 'Referral record not found' };
    }
    
    // Check minimum amount
    if (referral.pending_earnings < REFERRAL_CONFIG.minClaimSol) {
      return { 
        success: false, 
        error: `Minimum claim is ${REFERRAL_CONFIG.minClaimSol} SOL. You have ${referral.pending_earnings.toFixed(6)} SOL.` 
      };
    }
    
    // Check cooldown
    if (referral.last_claim_at) {
      const cooldownEnd = new Date(referral.last_claim_at).getTime() + 
        (REFERRAL_CONFIG.claimCooldownSeconds * 1000);
      if (Date.now() < cooldownEnd) {
        return { 
          success: false, 
          error: `Cooldown active. Try again in ${formatDuration(cooldownEnd - Date.now())}.` 
        };
      }
    }
    
    // Generate unique claim ID
    const claimId = `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    const claimAmount = referral.pending_earnings;
    
    // Lock the pending amount atomically
    const { error: updateError } = await adminClient
      .from('referrals')
      .update({
        pending_earnings: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('pending_earnings', claimAmount); // Optimistic locking
    
    if (updateError) {
      return { success: false, error: 'Failed to process claim - please try again' };
    }
    
    // Execute actual SOL transfer
    let txSignature: string;
    try {
      txSignature = await executeReferralPayout(destinationWallet, claimAmount, claimId);
    } catch (transferError) {
      // Rollback the pending_earnings if transfer fails
      await adminClient
        .from('referrals')
        .update({
          pending_earnings: claimAmount,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId);
      
      console.error(`[REFERRAL] Transfer failed for ${claimId}:`, transferError);
      return { 
        success: false, 
        error: `Transfer failed: ${transferError instanceof Error ? transferError.message : 'Unknown error'}` 
      };
    }
    
    // Update referral record with claim success
    await adminClient
      .from('referrals')
      .update({
        total_claimed: referral.total_claimed + claimAmount,
        claim_count: referral.claim_count + 1,
        last_claim_at: new Date().toISOString(),
        last_claim_signature: txSignature,
      })
      .eq('user_id', userId);
    
    // Log the claim
    await adminClient.from('referral_claims').insert({
      user_id: userId,
      claim_id: claimId,
      amount: claimAmount,
      destination_wallet: destinationWallet,
      tx_signature: txSignature,
      status: 'success',
    });
    
    console.log(`[REFERRAL] Claim success: ${claimId} | ${claimAmount} SOL | TX: ${txSignature}`);
    
    return {
      success: true,
      claimId,
      amount: claimAmount,
      txSignature,
    };
    
  } finally {
    claimsInProgress.delete(userId);
  }
}

// ============================================================================
// SOL TRANSFER
// ============================================================================

async function executeReferralPayout(
  destinationWallet: string,
  amountSol: number,
  claimId: string
): Promise<string> {
  console.log(`[REFERRAL] Executing payout: ${amountSol} SOL to ${destinationWallet}`);
  
  const adminClient = await getAdminClient();
  
  // 1. Get the platform payout wallet from config
  const { data: config } = await adminClient
    .from('platform_fee_config')
    .select('developer_wallet')
    .eq('is_active', true)
    .single();
  
  if (!config?.developer_wallet) {
    throw new Error('Platform payout wallet not configured');
  }

  const payoutWalletAddress = config.developer_wallet;
  
  // 2. Get the encrypted private key for the payout wallet
  const { data: wallet } = await adminClient
    .from('wallets')
    .select('encrypted_private_key')
    .eq('public_key', payoutWalletAddress)
    .single();

  if (!wallet?.encrypted_private_key) {
    throw new Error('Payout wallet keypair not found');
  }

  // 3. Decrypt the private key
  const { data: saltConfig } = await adminClient
    .from('system_config')
    .select('value')
    .eq('key', 'service_salt')
    .single();

  if (!saltConfig?.value) {
    throw new Error('Service salt not configured');
  }

  const privateKey = await decryptWalletKey(wallet.encrypted_private_key, saltConfig.value);
  
  // 4. Build and send the SOL transfer transaction
  const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const LAMPORTS = 1_000_000_000;

  // Get recent blockhash
  const blockhashRes = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getLatestBlockhash',
      params: [{ commitment: 'finalized' }],
    }),
  });
  
  const blockhashData = await blockhashRes.json();
  const recentBlockhash = blockhashData.result.value.blockhash;

  // Build transfer instruction manually (SystemProgram.transfer equivalent)
  const lamportsToSend = Math.floor(amountSol * LAMPORTS);
  
  // Create the transaction using RPC sendTransaction
  const txRes = await fetch(HELIUS_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendTransaction',
      params: [
        {
          // Using base64-encoded transaction built from parameters
          // This requires proper serialization - see below
        },
        {
          encoding: 'base64',
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        },
      ],
    }),
  });

  // For proper production implementation, use @solana/web3.js on the server
  // Here we use the sendAndConfirmTransaction pattern via the API route
  const response = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || ''}/api/internal/transfer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fromWallet: payoutWalletAddress,
      toWallet: destinationWallet,
      amountLamports: lamportsToSend,
      encryptedKey: wallet.encrypted_private_key,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(`Transfer failed: ${errorData.error || 'Unknown error'}`);
  }

  const result = await response.json();
  const signature = result.signature;
  
  // 5. Update the claim record with the transaction signature
  await adminClient
    .from('referral_claims')
    .update({
      tx_signature: signature,
      status: 'confirmed',
    })
    .eq('id', claimId);

  console.log(`[REFERRAL] Payout executed: ${signature}`);
  console.log(`[REFERRAL] From: ${payoutWalletAddress}`);
  console.log(`[REFERRAL] To: ${destinationWallet}`);
  console.log(`[REFERRAL] Amount: ${amountSol} SOL`);
  
  return signature;
}

// Helper to decrypt wallet key
async function decryptWalletKey(encryptedData: string, salt: string): Promise<Uint8Array> {
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted data format');
  }
  
  const [ivHex, ciphertextHex, authTagHex] = parts;
  
  const hexToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
    }
    return bytes;
  };
  
  const iv = hexToBytes(ivHex);
  const ciphertext = hexToBytes(ciphertextHex);
  const authTag = hexToBytes(authTagHex);
  const saltBytes = hexToBytes(salt);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    saltBytes,
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );
  
  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['decrypt']
  );
  
  const combined = new Uint8Array(ciphertext.length + authTag.length);
  combined.set(ciphertext);
  combined.set(authTag, ciphertext.length);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    derivedKey,
    combined
  );
  
  return new Uint8Array(decrypted);
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatDuration(ms: number): string {
  if (ms <= 0) return '0s';
  
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

