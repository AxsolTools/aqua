/**
 * AQUA Launchpad - Token Metrics API
 * 
 * Aggregates all 5 AQUA metrics from real-time sources:
 * 1. Water Level (Liquidity Depth) - Total Liquidity / Total Supply
 * 2. Evaporation Tracker - Sum of BurnChecked instructions
 * 3. Constellation Strength - (Liquidity / Market Cap) * 100
 * 4. Pour Rate - Live feed from liquidity_history
 * 5. Tide Harvest - On-chain creator-vault PDA balance
 * 
 * Uses caching to handle 100+ simultaneous users
 */

import { type NextRequest, NextResponse } from 'next/server';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAdminClient } from '@/lib/supabase/admin';
import { getBurnedTokens, calculateEvaporationRate } from '@/lib/blockchain/burn-tracker';
import { getCreatorVaultBalance } from '@/lib/blockchain/pumpfun';
import {
  getCachedMetrics,
  setCachedMetrics,
  getCachedLiquidity,
  setCachedLiquidity,
  getCachedBurn,
  setCachedBurn,
  getCachedVaultBalance,
  setCachedVaultBalance,
  getCachedPrice,
  setCachedPrice,
  type CachedMetrics,
} from '@/lib/cache/metrics-cache';

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com';
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch token liquidity from multiple sources
 */
async function fetchLiquidity(mintAddress: string): Promise<number> {
  // Check cache first
  const cached = getCachedLiquidity(mintAddress);
  if (cached !== null) return cached;

  let liquidity = 0;

  try {
    // Try Jupiter Price API (includes liquidity info)
    const jupiterResponse = await fetch(
      `https://price.jup.ag/v6/price?ids=${mintAddress}&vsToken=So11111111111111111111111111111111111111112`,
      { next: { revalidate: 10 } }
    );

    if (jupiterResponse.ok) {
      const jupiterData = await jupiterResponse.json();
      const tokenData = jupiterData.data?.[mintAddress];
      if (tokenData?.extraInfo?.quotedPrice?.buyPrice) {
        // Estimate liquidity from price depth
        liquidity = tokenData.extraInfo?.depth?.buyPriceImpactRatio?.depth || 0;
      }
    }
  } catch (error) {
    console.warn('[METRICS] Jupiter liquidity fetch failed:', error);
  }

  // Fallback: Query DeFi Llama or Birdeye
  if (liquidity === 0) {
    try {
      const birdeyeResponse = await fetch(
        `https://public-api.birdeye.so/public/token_overview?address=${mintAddress}`,
        {
          headers: {
            'X-API-KEY': process.env.BIRDEYE_API_KEY || '',
          },
        }
      );

      if (birdeyeResponse.ok) {
        const birdeyeData = await birdeyeResponse.json();
        liquidity = birdeyeData.data?.liquidity || 0;
      }
    } catch {
      console.warn('[METRICS] Birdeye liquidity fetch failed');
    }
  }

  setCachedLiquidity(mintAddress, liquidity);
  return liquidity;
}

/**
 * Fetch token price and market cap
 */
async function fetchPriceAndMarketCap(
  mintAddress: string
): Promise<{ price: number; marketCap: number }> {
  // Check cache first
  const cached = getCachedPrice(mintAddress);
  if (cached !== null) return cached;

  let price = 0;
  let marketCap = 0;

  try {
    // Jupiter Price API
    const response = await fetch(
      `https://price.jup.ag/v6/price?ids=${mintAddress}`,
      { next: { revalidate: 10 } }
    );

    if (response.ok) {
      const data = await response.json();
      const tokenPrice = data.data?.[mintAddress];
      if (tokenPrice) {
        price = tokenPrice.price || 0;
      }
    }
  } catch (error) {
    console.warn('[METRICS] Price fetch failed:', error);
  }

  // Try to get market cap from database or calculate
  try {
    const adminClient = getAdminClient();
    const { data: token } = await adminClient
      .from('tokens')
      .select('total_supply, decimals, market_cap')
      .eq('mint_address', mintAddress)
      .single();

    if (token) {
      if (token.market_cap && token.market_cap > 0) {
        marketCap = token.market_cap;
      } else if (price > 0 && token.total_supply) {
        // Calculate market cap from price * supply
        const supply = token.total_supply / Math.pow(10, token.decimals || 9);
        marketCap = price * supply;
      }
    }
  } catch {
    console.warn('[METRICS] Market cap calculation failed');
  }

  const result = { price, marketCap };
  setCachedPrice(mintAddress, result);
  return result;
}

/**
 * Fetch burn data with caching
 */
async function fetchBurnData(
  mintAddress: string
): Promise<{ total: number; rate: number }> {
  // Check cache first
  const cached = getCachedBurn(mintAddress);
  if (cached !== null) return cached;

  try {
    const burnData = await getBurnedTokens(mintAddress);
    const result = {
      total: Number(burnData.totalBurned),
      rate: burnData.burnCount > 0 ? Number(burnData.totalBurned) / burnData.burnCount : 0,
    };
    setCachedBurn(mintAddress, result);
    return result;
  } catch (error) {
    console.error('[METRICS] Burn data fetch failed:', error);
    return { total: 0, rate: 0 };
  }
}

/**
 * Fetch creator vault balance (Tide Harvest)
 */
async function fetchVaultBalance(
  mintAddress: string,
  creatorWallet: string
): Promise<number> {
  // Check cache first
  const cached = getCachedVaultBalance(mintAddress);
  if (cached !== null) return cached;

  try {
    const connection = new Connection(HELIUS_RPC_URL, 'confirmed');
    const { balance } = await getCreatorVaultBalance(
      connection,
      mintAddress,
      creatorWallet
    );
    setCachedVaultBalance(mintAddress, balance);
    return balance;
  } catch (error) {
    console.error('[METRICS] Vault balance fetch failed:', error);
    return 0;
  }
}

/**
 * Fetch pour rate data from liquidity_history
 */
async function fetchPourRateData(
  tokenId: string
): Promise<{ total: number; last24h: number }> {
  try {
    const adminClient = getAdminClient();
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get total pour amount
    const { data: totalData } = await adminClient
      .from('liquidity_history')
      .select('liquidity_sol')
      .eq('token_id', tokenId)
      .eq('source', 'pour');

    const total = totalData?.reduce((sum, row) => sum + (row.liquidity_sol || 0), 0) || 0;

    // Get last 24h pour amount
    const { data: recentData } = await adminClient
      .from('liquidity_history')
      .select('liquidity_sol')
      .eq('token_id', tokenId)
      .eq('source', 'pour')
      .gte('timestamp', yesterday.toISOString());

    const last24h = recentData?.reduce((sum, row) => sum + (row.liquidity_sol || 0), 0) || 0;

    return { total, last24h };
  } catch (error) {
    console.error('[METRICS] Pour rate fetch failed:', error);
    return { total: 0, last24h: 0 };
  }
}

// ============================================================================
// HANDLER
// ============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ address: string }> }
) {
  const { address } = await params;

  try {
    // Check full metrics cache first
    const cachedMetrics = getCachedMetrics(address);
    if (cachedMetrics) {
      return NextResponse.json({
        success: true,
        data: cachedMetrics,
        cached: true,
      });
    }

    const adminClient = getAdminClient();

    // Get token from database
    const { data: token, error: tokenError } = await adminClient
      .from('tokens')
      .select('*')
      .eq('mint_address', address)
      .single();

    if (tokenError || !token) {
      return NextResponse.json(
        { success: false, error: 'Token not found' },
        { status: 404 }
      );
    }

    // Fetch all metrics in parallel for speed
    const [
      liquidityData,
      priceData,
      burnData,
      vaultBalance,
      pourRateData,
    ] = await Promise.all([
      fetchLiquidity(address),
      fetchPriceAndMarketCap(address),
      fetchBurnData(address),
      fetchVaultBalance(address, token.creator_wallet),
      fetchPourRateData(token.id),
    ]);

    // Calculate derived metrics
    const totalSupply = token.total_supply || 1_000_000_000;
    const decimals = token.decimals || 9;
    const adjustedSupply = totalSupply / Math.pow(10, decimals);

    // Water Level = (Liquidity / Total Supply) * 100
    // Normalized to 0-100 scale
    const waterLevel = Math.min(100, Math.max(0, 
      liquidityData > 0 && adjustedSupply > 0
        ? (liquidityData / adjustedSupply) * 100
        : token.water_level || 50
    ));

    // Evaporation Rate = Burned / Total Supply
    const evaporationRate = calculateEvaporationRate(
      BigInt(burnData.total),
      BigInt(totalSupply),
      decimals
    );

    // Constellation Strength = (Liquidity / Market Cap) * 100
    const constellationStrength = Math.min(100, Math.max(0,
      priceData.marketCap > 0
        ? (liquidityData / priceData.marketCap) * 100
        : token.constellation_strength || 50
    ));

    // Build metrics response
    const metrics: CachedMetrics = {
      waterLevel,
      evaporated: burnData.total,
      evaporationRate,
      constellationStrength,
      tideHarvest: vaultBalance,
      pourRateTotal: pourRateData.total,
      pourRateLast24h: pourRateData.last24h,
      liquidity: liquidityData,
      marketCap: priceData.marketCap,
      totalSupply,
      timestamp: Date.now(),
    };

    // Cache the metrics
    setCachedMetrics(address, metrics);

    // Update database with fresh values (async, don't wait)
    adminClient
      .from('tokens')
      .update({
        water_level: waterLevel,
        constellation_strength: constellationStrength,
        total_evaporated: burnData.total,
        market_cap: priceData.marketCap,
        current_liquidity: liquidityData,
        price_sol: priceData.price,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.id)
      .then(() => {
        console.log(`[METRICS] Updated DB for ${token.symbol}`);
      })
      .catch((err) => {
        console.warn('[METRICS] DB update failed:', err);
      });

    return NextResponse.json({
      success: true,
      data: metrics,
      cached: false,
    });

  } catch (error) {
    console.error('[METRICS] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch metrics',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

