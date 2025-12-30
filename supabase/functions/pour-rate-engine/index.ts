/**
 * AQUA Launchpad - Pour Rate Engine
 * 
 * Supabase Edge Function for automated liquidity addition
 * Triggered by pg_cron at regular intervals
 * 
 * This function:
 * 1. Fetches tokens with pour_enabled = true
 * 2. Checks if enough time has passed since last pour
 * 3. Calculates pour amount based on token parameters
 * 4. Executes liquidity addition via PumpPortal/Jupiter
 * 5. Logs results and updates token state
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { Connection, PublicKey, Keypair, Transaction, SystemProgram } from 'https://esm.sh/@solana/web3.js@1.87.6';

// ============================================================================
// CONFIGURATION
// ============================================================================

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const HELIUS_RPC_URL = Deno.env.get('HELIUS_RPC_URL') || 'https://api.mainnet-beta.solana.com';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const connection = new Connection(HELIUS_RPC_URL, 'confirmed');

// ============================================================================
// TYPES
// ============================================================================

interface TokenWithParams {
  id: string;
  mint_address: string;
  name: string;
  symbol: string;
  stage: string;
  current_liquidity: number;
  token_parameters: {
    pour_enabled: boolean;
    pour_rate_percent: number;
    pour_interval_seconds: number;
    pour_source: string;
    pour_max_per_interval_sol: number;
    pour_min_trigger_sol: number;
    pour_last_executed_at: string | null;
    pour_total_added_sol: number;
    treasury_wallet: string | null;
    treasury_balance_sol: number;
    dev_wallet_address: string | null;
  };
}

interface PourResult {
  tokenId: string;
  success: boolean;
  amountSol: number;
  txSignature?: string;
  error?: string;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req: Request) => {
  try {
    // Verify request (can add auth check here)
    const authHeader = req.headers.get('Authorization');
    if (authHeader !== `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`) {
      // Allow cron trigger without auth
      console.log('[POUR] Running as cron job');
    }

    console.log('[POUR] Starting pour rate engine cycle');

    // Fetch eligible tokens
    const eligibleTokens = await getEligibleTokens();
    console.log(`[POUR] Found ${eligibleTokens.length} eligible tokens`);

    if (eligibleTokens.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No tokens to process', processed: 0 }),
        { headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Process each token
    const results: PourResult[] = [];
    for (const token of eligibleTokens) {
      const result = await processPourForToken(token);
      results.push(result);
      
      // Small delay between tokens to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Summary
    const successful = results.filter(r => r.success).length;
    const totalPouredSol = results.reduce((sum, r) => sum + (r.success ? r.amountSol : 0), 0);

    console.log(`[POUR] Cycle complete: ${successful}/${results.length} successful, ${totalPouredSol.toFixed(6)} SOL total`);

    return new Response(
      JSON.stringify({
        success: true,
        processed: results.length,
        successful,
        totalPouredSol,
        results,
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[POUR] Engine error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});

// ============================================================================
// TOKEN FETCHING
// ============================================================================

async function getEligibleTokens(): Promise<TokenWithParams[]> {
  const { data: tokens, error } = await supabase
    .from('tokens')
    .select(`
      id,
      mint_address,
      name,
      symbol,
      stage,
      current_liquidity,
      token_parameters!inner (
        pour_enabled,
        pour_rate_percent,
        pour_interval_seconds,
        pour_source,
        pour_max_per_interval_sol,
        pour_min_trigger_sol,
        pour_last_executed_at,
        pour_total_added_sol,
        treasury_wallet,
        treasury_balance_sol,
        dev_wallet_address
      )
    `)
    .eq('token_parameters.pour_enabled', true)
    .in('stage', ['bonding', 'migrated']);

  if (error) {
    console.error('[POUR] Failed to fetch tokens:', error);
    return [];
  }

  // Filter tokens that are ready for pour (enough time passed)
  const now = Date.now();
  const eligible: TokenWithParams[] = [];

  for (const token of tokens || []) {
    const params = Array.isArray(token.token_parameters) 
      ? token.token_parameters[0] 
      : token.token_parameters;
    
    if (!params) continue;

    const lastPour = params.pour_last_executed_at 
      ? new Date(params.pour_last_executed_at).getTime() 
      : 0;
    const intervalMs = params.pour_interval_seconds * 1000;
    
    if (now - lastPour >= intervalMs) {
      eligible.push({
        ...token,
        token_parameters: params,
      } as TokenWithParams);
    }
  }

  return eligible;
}

// ============================================================================
// POUR PROCESSING
// ============================================================================

async function processPourForToken(token: TokenWithParams): Promise<PourResult> {
  const params = token.token_parameters;
  
  try {
    console.log(`[POUR] Processing ${token.symbol} (${token.mint_address.slice(0, 8)}...)`);

    // Calculate pour amount
    let pourAmountSol = 0;

    switch (params.pour_source) {
      case 'fees':
        // Calculate from accumulated fees (would need fee tracking)
        // For now, use a percentage of treasury
        pourAmountSol = params.treasury_balance_sol * (params.pour_rate_percent / 100);
        break;
      
      case 'treasury':
        pourAmountSol = params.treasury_balance_sol * (params.pour_rate_percent / 100);
        break;
      
      case 'both':
        pourAmountSol = params.treasury_balance_sol * (params.pour_rate_percent / 100);
        break;
    }

    // Apply limits
    pourAmountSol = Math.min(pourAmountSol, params.pour_max_per_interval_sol);

    // Check minimum
    if (pourAmountSol < params.pour_min_trigger_sol) {
      console.log(`[POUR] ${token.symbol}: Amount ${pourAmountSol.toFixed(6)} SOL below minimum ${params.pour_min_trigger_sol}`);
      
      // Update last executed time anyway to prevent continuous attempts
      await updatePourTimestamp(token.id);
      
      return {
        tokenId: token.id,
        success: true,
        amountSol: 0,
        error: 'Below minimum trigger',
      };
    }

    // Execute pour based on token stage
    let txSignature: string;
    
    if (token.stage === 'bonding') {
      // For bonding curve tokens, execute buy via PumpPortal
      txSignature = await executePumpPortalBuy(token.mint_address, pourAmountSol, params.dev_wallet_address!);
    } else {
      // For migrated tokens, add liquidity via Jupiter/Raydium
      txSignature = await executePostMigrationPour(token.mint_address, pourAmountSol, params.dev_wallet_address!);
    }

    // Log success
    await logPourExecution(token.id, pourAmountSol, params.pour_source, txSignature, 'success');
    
    // Update parameters
    await supabase
      .from('token_parameters')
      .update({
        pour_last_executed_at: new Date().toISOString(),
        pour_total_added_sol: params.pour_total_added_sol + pourAmountSol,
        treasury_balance_sol: params.treasury_balance_sol - pourAmountSol,
      })
      .eq('token_id', token.id);

    // Update token liquidity
    await supabase
      .from('tokens')
      .update({
        current_liquidity: token.current_liquidity + pourAmountSol,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.id);

    console.log(`[POUR] ${token.symbol}: Poured ${pourAmountSol.toFixed(6)} SOL (TX: ${txSignature.slice(0, 8)}...)`);

    return {
      tokenId: token.id,
      success: true,
      amountSol: pourAmountSol,
      txSignature,
    };

  } catch (error) {
    console.error(`[POUR] ${token.symbol} error:`, error);
    
    // Log failure
    await logPourExecution(token.id, 0, params.pour_source, null, 'failed', error.message);
    
    // Update timestamp to avoid immediate retry
    await updatePourTimestamp(token.id);

    return {
      tokenId: token.id,
      success: false,
      amountSol: 0,
      error: error.message,
    };
  }
}

// ============================================================================
// TRANSACTION EXECUTION (STUBS - Implement with actual logic)
// ============================================================================

async function executePumpPortalBuy(
  mintAddress: string,
  amountSol: number,
  devWalletAddress: string
): Promise<string> {
  // TODO: Implement actual PumpPortal buy
  // This would:
  // 1. Load dev wallet keypair from encrypted storage
  // 2. Call PumpPortal API to create buy transaction
  // 3. Sign and send transaction
  // 4. Wait for confirmation
  
  console.log(`[POUR] Executing PumpPortal buy: ${amountSol} SOL for ${mintAddress}`);
  
  // Placeholder - return simulated signature
  return `sim_pour_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function executePostMigrationPour(
  mintAddress: string,
  amountSol: number,
  devWalletAddress: string
): Promise<string> {
  // TODO: Implement actual post-migration liquidity addition
  // This would:
  // 1. Determine which DEX the token migrated to (Raydium/Meteora)
  // 2. Use appropriate SDK to add liquidity
  // 3. Sign and send transaction
  
  console.log(`[POUR] Executing post-migration pour: ${amountSol} SOL for ${mintAddress}`);
  
  // Placeholder - return simulated signature
  return `sim_pour_post_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

// ============================================================================
// HELPERS
// ============================================================================

async function updatePourTimestamp(tokenId: string): Promise<void> {
  await supabase
    .from('token_parameters')
    .update({
      pour_last_executed_at: new Date().toISOString(),
    })
    .eq('token_id', tokenId);
}

async function logPourExecution(
  tokenId: string,
  amountSol: number,
  source: string,
  txSignature: string | null,
  status: 'pending' | 'success' | 'failed',
  errorMessage?: string
): Promise<void> {
  await supabase
    .from('pour_rate_logs')
    .insert({
      token_id: tokenId,
      amount_sol: amountSol,
      source,
      tx_signature: txSignature,
      status,
      error_message: errorMessage,
    });
}

