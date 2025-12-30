/**
 * AQUA Launchpad - Supabase Vault Integration
 * Auto-managed service salt storage using Supabase Vault
 * 
 * The service salt is automatically generated on first use and stored
 * securely in Supabase Vault. No manual configuration required.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { generateServiceSalt, validateEncryption } from './key-manager';

// ============================================================================
// TYPES
// ============================================================================

interface VaultSecret {
  id: string;
  name: string;
  secret: string;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// SINGLETON SERVICE SALT MANAGER
// ============================================================================

const SALT_SECRET_NAME = 'aqua_wallet_encryption_salt';

// Cache the salt in memory to avoid repeated Vault calls
let cachedServiceSalt: string | null = null;
let saltInitialized = false;

/**
 * Get or create the service-level encryption salt
 * 
 * This function:
 * 1. Checks memory cache first
 * 2. Tries to retrieve from Supabase Vault
 * 3. If not found, generates new salt and stores it
 * 
 * @param supabaseAdmin - Supabase client with service role key
 * @returns Service salt string
 */
export async function getOrCreateServiceSalt(
  supabaseAdmin: SupabaseClient
): Promise<string> {
  // Return cached salt if available
  if (cachedServiceSalt && saltInitialized) {
    return cachedServiceSalt;
  }
  
  try {
    // Try to read existing salt from Vault
    const { data: existingSecret, error: readError } = await supabaseAdmin
      .from('vault.secrets')
      .select('secret')
      .eq('name', SALT_SECRET_NAME)
      .single();
    
    if (!readError && existingSecret?.secret) {
      cachedServiceSalt = existingSecret.secret;
      saltInitialized = true;
      
      // Validate encryption is working
      if (!validateEncryption(cachedServiceSalt)) {
        throw new Error('Encryption validation failed with existing salt');
      }
      
      console.log('[VAULT] Service salt loaded from Vault');
      return cachedServiceSalt;
    }
    
    // Salt doesn't exist - generate new one
    console.log('[VAULT] No existing salt found, generating new one...');
    const newSalt = generateServiceSalt();
    
    // Store in Vault using RPC function (Supabase Vault API)
    const { error: insertError } = await supabaseAdmin.rpc('vault.create_secret', {
      new_secret: newSalt,
      new_name: SALT_SECRET_NAME,
      new_description: 'AQUA wallet encryption salt - DO NOT DELETE'
    });
    
    if (insertError) {
      // Fallback: try direct insert if RPC not available
      const { error: directInsertError } = await supabaseAdmin
        .from('vault.secrets')
        .insert({
          name: SALT_SECRET_NAME,
          secret: newSalt,
          description: 'AQUA wallet encryption salt - DO NOT DELETE'
        });
      
      if (directInsertError) {
        throw new Error(`Failed to store salt in Vault: ${directInsertError.message}`);
      }
    }
    
    cachedServiceSalt = newSalt;
    saltInitialized = true;
    
    // Validate encryption is working with new salt
    if (!validateEncryption(cachedServiceSalt)) {
      throw new Error('Encryption validation failed with new salt');
    }
    
    console.log('[VAULT] New service salt generated and stored');
    return cachedServiceSalt;
    
  } catch (error) {
    // If Vault is not available, use fallback mechanism
    console.warn('[VAULT] Vault access failed, using fallback:', error);
    return getOrCreateFallbackSalt(supabaseAdmin);
  }
}

/**
 * Fallback salt storage using a regular encrypted table
 * Used when Supabase Vault extension is not available
 */
async function getOrCreateFallbackSalt(
  supabaseAdmin: SupabaseClient
): Promise<string> {
  const FALLBACK_TABLE = 'system_config';
  const FALLBACK_KEY = 'encryption_salt';
  
  try {
    // Ensure fallback table exists
    await supabaseAdmin.rpc('create_system_config_if_not_exists');
  } catch {
    // Table might already exist or RPC not available
  }
  
  // Try to read existing salt
  const { data: existing } = await supabaseAdmin
    .from(FALLBACK_TABLE)
    .select('value')
    .eq('key', FALLBACK_KEY)
    .single();
  
  if (existing?.value) {
    cachedServiceSalt = existing.value;
    saltInitialized = true;
    console.log('[VAULT] Service salt loaded from fallback storage');
    return cachedServiceSalt;
  }
  
  // Generate and store new salt
  const newSalt = generateServiceSalt();
  
  await supabaseAdmin
    .from(FALLBACK_TABLE)
    .upsert({
      key: FALLBACK_KEY,
      value: newSalt,
      description: 'AQUA wallet encryption salt - DO NOT DELETE'
    });
  
  cachedServiceSalt = newSalt;
  saltInitialized = true;
  
  console.log('[VAULT] New service salt stored in fallback storage');
  return cachedServiceSalt;
}

/**
 * Clear the cached salt (for testing purposes only)
 */
export function clearSaltCache(): void {
  cachedServiceSalt = null;
  saltInitialized = false;
}

/**
 * Check if salt is initialized
 */
export function isSaltInitialized(): boolean {
  return saltInitialized && cachedServiceSalt !== null;
}

/**
 * Get the cached salt without making a database call
 * Returns null if not initialized
 */
export function getCachedSalt(): string | null {
  return cachedServiceSalt;
}

