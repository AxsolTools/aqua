/**
 * AQUA Launchpad - Multi-Source Price Aggregator
 * 
 * Aggregates prices from multiple sources for reliability:
 * - Binance (SOL/USDT) - Free API, highest weight
 * - CoinGecko (SOL/USD) - Free API, no key required
 * - Jupiter Quote API (token prices)
 * - Helius (real-time token prices)
 * 
 * Features:
 * - Weighted average for accuracy
 * - Automatic fallback on source failure
 * - Health tracking per source
 * - Caching to reduce API calls
 */

// ============================================================================
// TYPES
// ============================================================================

export interface PriceResult {
  price: number;
  source: string;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface SourceHealth {
  lastSuccess: number;
  lastError: string | null;
  consecutiveFailures: number;
}

interface PriceSource {
  name: string;
  weight: number;
  fetch: () => Promise<number>;
}

// ============================================================================
// CACHE & STATE
// ============================================================================

// Price cache with TTL
const priceCache = new Map<string, { price: number; timestamp: number }>();
const CACHE_TTL_MS = 10_000; // 10 seconds

// Source health tracking
const sourceHealth = new Map<string, SourceHealth>();

// Token decimal cache
const decimalCache = new Map<string, number>();

// SOL mint address
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

// ============================================================================
// SOURCE HEALTH TRACKING
// ============================================================================

function recordSourceHealth(source: string, success: boolean, error?: string): void {
  const current = sourceHealth.get(source) || {
    lastSuccess: 0,
    lastError: null,
    consecutiveFailures: 0,
  };
  
  if (success) {
    sourceHealth.set(source, {
      lastSuccess: Date.now(),
      lastError: null,
      consecutiveFailures: 0,
    });
  } else {
    sourceHealth.set(source, {
      ...current,
      lastError: error || 'Unknown error',
      consecutiveFailures: current.consecutiveFailures + 1,
    });
  }
}

export function getSourceHealth(): Record<string, SourceHealth> {
  const result: Record<string, SourceHealth> = {};
  sourceHealth.forEach((health, source) => {
    result[source] = { ...health };
  });
  return result;
}

// ============================================================================
// SOL PRICE SOURCES (Free APIs - No Keys Required)
// ============================================================================

/**
 * Fetch SOL price from Binance (free public API)
 */
async function fetchBinanceSolPrice(): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = parseFloat(data.price);
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from Binance');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Binance API timeout');
    }
    throw error;
  }
}

/**
 * Fetch SOL price from CoinGecko (free public API - no key required)
 */
async function fetchCoinGeckoSolPrice(): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { 
        next: { revalidate: 30 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.solana?.usd;
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from CoinGecko');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('CoinGecko API timeout');
    }
    throw error;
  }
}

/**
 * Fetch SOL price from Jupiter (free public API)
 */
async function fetchJupiterSolPrice(): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${SOL_MINT}`,
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.data?.[SOL_MINT]?.price;
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid price from Jupiter');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Jupiter API timeout');
    }
    throw error;
  }
}

// ============================================================================
// AGGREGATED SOL PRICE
// ============================================================================

/**
 * Get SOL/USD price aggregated from multiple sources
 * Uses weighted average for accuracy
 * 
 * @returns Aggregated price result
 */
export async function getSolPrice(): Promise<PriceResult> {
  // Check cache first
  const cached = priceCache.get('SOL');
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      price: cached.price,
      source: 'cache',
      timestamp: cached.timestamp,
      confidence: 'high',
    };
  }
  
  const sources: PriceSource[] = [
    { name: 'binance', weight: 3, fetch: fetchBinanceSolPrice },
    { name: 'coingecko', weight: 2, fetch: fetchCoinGeckoSolPrice },
    { name: 'jupiter', weight: 2, fetch: fetchJupiterSolPrice },
  ];
  
  const results = await Promise.allSettled(
    sources.map(async (source) => {
      try {
        const price = await source.fetch();
        recordSourceHealth(source.name, true);
        return { source: source.name, price, weight: source.weight };
      } catch (error) {
        recordSourceHealth(source.name, false, error instanceof Error ? error.message : 'Unknown');
        throw error;
      }
    })
  );
  
  // Collect successful results with weights
  const validPrices: number[] = [];
  let successSource = '';
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      const { price, weight, source } = result.value;
      // Add price multiple times based on weight
      for (let i = 0; i < weight; i++) {
        validPrices.push(price);
      }
      if (!successSource) successSource = source;
    }
  });
  
  if (validPrices.length === 0) {
    // Fallback to a reasonable default price if all sources fail
    // This prevents complete failure - USD conversion will use this fallback
    const fallbackPrice = 150; // Approximate SOL price fallback
    console.warn('[PRICE] All SOL price sources failed, using fallback price:', fallbackPrice);
    
    // Cache the fallback with low confidence
    priceCache.set('SOL', { price: fallbackPrice, timestamp: Date.now() });
    
    return {
      price: fallbackPrice,
      source: 'fallback',
      timestamp: Date.now(),
      confidence: 'low',
    };
  }
  
  // Calculate weighted average
  const avgPrice = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
  
  // Determine confidence based on number of successful sources
  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const confidence: PriceResult['confidence'] = 
    successCount >= 3 ? 'high' : 
    successCount >= 2 ? 'medium' : 'low';
  
  // Cache the result
  priceCache.set('SOL', { price: avgPrice, timestamp: Date.now() });
  
  return {
    price: avgPrice,
    source: successCount > 1 ? 'aggregated' : successSource,
    timestamp: Date.now(),
    confidence,
  };
}

// ============================================================================
// TOKEN PRICE
// ============================================================================

/**
 * Fetch token price from Jupiter
 */
async function fetchJupiterTokenPrice(mint: string): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://api.jup.ag/price/v2?ids=${mint}`,
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }
    
    const data = await response.json();
    const price = data.data?.[mint]?.price;
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Token price not available');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Jupiter API timeout');
    }
    throw error;
  }
}

/**
 * Fetch token price using Jupiter Quote API (more reliable for new tokens)
 */
async function fetchJupiterQuotePrice(mint: string): Promise<number> {
  // Get token decimals (assume 9 if unknown)
  const decimals = decimalCache.get(mint) ?? 9;
  const inputAmount = BigInt(10) ** BigInt(decimals);
  
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://quote-api.jup.ag/v6/quote?inputMint=${mint}&outputMint=${USDC_MINT}&amount=${inputAmount}&slippageBps=50`,
      { 
        next: { revalidate: 10 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`Jupiter Quote API error: ${response.status}`);
    }
    
    const data = await response.json();
    const outAmount = data.outAmount;
    
    if (!outAmount) {
      throw new Error('No quote available');
    }
    
    // Calculate price (USDC has 6 decimals)
    const price = Number(outAmount) / 1_000_000;
    
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Invalid quote price');
    }
    
    return price;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Jupiter Quote API timeout');
    }
    throw error;
  }
}

/**
 * Fetch token price from DexScreener (backup source)
 */
async function fetchDexScreenerPrice(mint: string): Promise<number> {
  // Create timeout manually for Node.js compatibility
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  
  try {
    const response = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${mint}`,
      { 
        next: { revalidate: 30 },
        signal: controller.signal,
      }
    );
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`DexScreener API error: ${response.status}`);
    }
    
    const data = await response.json();
    const pair = data.pairs?.find((p: any) => 
      Number.isFinite(parseFloat(p.priceUsd)) && parseFloat(p.priceUsd) > 0
    );
    
    if (!pair) {
      throw new Error('No pair found on DexScreener');
    }
    
    return parseFloat(pair.priceUsd);
  } catch (error) {
    clearTimeout(timeoutId);
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('DexScreener API timeout');
    }
    throw error;
  }
}

/**
 * Get token price in USD
 * 
 * @param mint - Token mint address
 * @returns Price result
 */
export async function getTokenPrice(mint: string): Promise<PriceResult> {
  // Check cache first
  const cached = priceCache.get(mint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return {
      price: cached.price,
      source: 'cache',
      timestamp: cached.timestamp,
      confidence: 'high',
    };
  }
  
  // Special case: SOL
  if (mint === SOL_MINT || mint.toLowerCase() === 'sol') {
    return getSolPrice();
  }
  
  // Try sources in order
  const sources: Array<{ name: string; fetch: () => Promise<number> }> = [
    { name: 'jupiter_price', fetch: () => fetchJupiterTokenPrice(mint) },
    { name: 'jupiter_quote', fetch: () => fetchJupiterQuotePrice(mint) },
    { name: 'dexscreener', fetch: () => fetchDexScreenerPrice(mint) },
  ];
  
  for (const source of sources) {
    try {
      const price = await source.fetch();
      recordSourceHealth(source.name, true);
      
      // Cache the result
      priceCache.set(mint, { price, timestamp: Date.now() });
      
      return {
        price,
        source: source.name,
        timestamp: Date.now(),
        confidence: source.name === 'jupiter_price' ? 'high' : 'medium',
      };
    } catch (error) {
      recordSourceHealth(source.name, false, error instanceof Error ? error.message : 'Unknown');
      continue;
    }
  }
  
  throw new Error(`Could not fetch price for ${mint} from any source`);
}

/**
 * Get token price in SOL
 * 
 * @param mint - Token mint address
 * @returns Price in SOL
 */
export async function getTokenPriceInSol(mint: string): Promise<PriceResult> {
  const [tokenPrice, solPrice] = await Promise.all([
    getTokenPrice(mint),
    getSolPrice(),
  ]);
  
  const priceInSol = tokenPrice.price / solPrice.price;
  
  return {
    price: priceInSol,
    source: `${tokenPrice.source}+sol`,
    timestamp: Date.now(),
    confidence: tokenPrice.confidence === 'high' && solPrice.confidence === 'high' 
      ? 'high' 
      : 'medium',
  };
}

// ============================================================================
// BATCH PRICE FETCHING
// ============================================================================

/**
 * Get prices for multiple tokens efficiently
 * 
 * @param mints - Array of token mint addresses
 * @returns Map of mint to price result
 */
export async function getTokenPrices(
  mints: string[]
): Promise<Map<string, PriceResult | null>> {
  const results = await Promise.allSettled(
    mints.map(mint => getTokenPrice(mint))
  );
  
  const priceMap = new Map<string, PriceResult | null>();
  
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      priceMap.set(mints[index], result.value);
    } else {
      priceMap.set(mints[index], null);
    }
  });
  
  return priceMap;
}

// ============================================================================
// UTILITY
// ============================================================================

/**
 * Set token decimals in cache (for accurate quote pricing)
 */
export function setTokenDecimals(mint: string, decimals: number): void {
  decimalCache.set(mint, decimals);
}

/**
 * Clear all price caches
 */
export function clearPriceCache(): void {
  priceCache.clear();
}

