/**
 * Industrial-Grade Multi-Source Solana Token Feed
 * 
 * Aggregates tokens from ALL available sources:
 * - DexScreener: Active trading pairs, volume, liquidity
 * - Jupiter: Verified tokens, price data
 * - Helius: On-chain data, new tokens, DAS API
 * - Birdeye: Token analytics, trending data
 * - Pump.fun: Pre-migration bonding curve tokens
 * 
 * Features:
 * - Buy/Sell signal detection algorithms
 * - Momentum and risk scoring
 * - Real-time updates
 * - No artificial limits
 */

// ============================================================================
// TYPES
// ============================================================================

export interface TokenData {
  address: string
  symbol: string
  name: string
  price: number
  priceChange24h: number
  priceChange1h: number
  priceChange5m: number
  volume24h: number
  volume6h: number
  volume1h: number
  volume5m: number
  liquidity: number
  marketCap: number
  fdv: number
  pairCreatedAt: number
  pairAddress: string
  logo: string
  dexId: string
  txns24h: { buys: number; sells: number }
  txns6h: { buys: number; sells: number }
  txns1h: { buys: number; sells: number }
  txns5m: { buys: number; sells: number }
  holders?: number
  source: string
  trendingScore?: number
  buySignal?: number           // 0-100 buy opportunity score
  sellSignal?: number          // 0-100 sell warning score
  riskScore?: number           // 0-100 risk assessment
  momentumScore?: number       // 0-100 momentum indicator
  isPumpFun?: boolean          // Pump.fun token (pre or post migration)
  isMigrated?: boolean         // Has migrated from Pump.fun
  bondingCurveProgress?: number // 0-100 progress on bonding curve
  
  // DexScreener Enhancement Flags
  hasDexScreenerProfile?: boolean  // Has token profile on DexScreener
  hasDexScreenerBoost?: boolean    // Has active boost on DexScreener
  boostAmount?: number             // Number of boosts
  hasEnhancedProfile?: boolean     // Has enhanced/paid profile
  profileUpdatedAt?: number        // Last profile update timestamp
  
  // Advanced Metrics
  volumeToMcapRatio?: number       // Volume/Market Cap ratio
  buyPressure?: number             // 0-100 buy vs sell ratio
  holderGrowth24h?: number         // Holder count change 24h
  liquidityScore?: number          // Liquidity quality score
  smartMoneyInflow?: number        // Smart money activity
  volatility24h?: number           // Price volatility
  accumulationScore?: number       // Whale accumulation detection
}

export interface FeedResult {
  tokens: TokenData[]
  total: number
  hasMore: boolean
  sources: string[]
  fetchTime: number
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''
const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
const BIRDEYE_API_KEY = process.env.BIRDEYE_API_KEY || ''

// Rate limiting
const rateLimitState: Record<string, { lastCall: number; backoff: number }> = {}
const MIN_CALL_INTERVAL: Record<string, number> = {
  dexscreener: 200,
  jupiter: 300,
  helius: 100,
  birdeye: 500,
  pumpfun: 300,
}

// Cache
interface CacheEntry {
  data: TokenData[]
  timestamp: number
  source: string
}
const tokenCache = new Map<string, CacheEntry>()
const CACHE_TTL = 8000 // 8 seconds

// ============================================================================
// UTILITIES
// ============================================================================

function checkRateLimit(source: string): boolean {
  const state = rateLimitState[source]
  if (!state) return true
  
  const now = Date.now()
  const minInterval = MIN_CALL_INTERVAL[source] || 200
  return now - state.lastCall >= minInterval + state.backoff
}

function recordCall(source: string, success: boolean) {
  const now = Date.now()
  const state = rateLimitState[source] || { lastCall: 0, backoff: 0 }
  
  rateLimitState[source] = {
    lastCall: now,
    backoff: success ? Math.max(0, state.backoff - 100) : Math.min(state.backoff + 500, 5000),
  }
}

async function fetchWithTimeout(url: string, options: RequestInit = {}, timeout = 10000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, { ...options, signal: controller.signal })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

function getCached(key: string): TokenData[] | null {
  const cached = tokenCache.get(key)
  if (!cached) return null
  if (Date.now() - cached.timestamp > CACHE_TTL) return null
  return cached.data
}

function setCache(key: string, data: TokenData[], source: string) {
  tokenCache.set(key, { data, timestamp: Date.now(), source })
}

// ============================================================================
// DEXSCREENER - Active Trading Pairs
// ============================================================================

async function fetchDexScreenerTokens(): Promise<TokenData[]> {
  const cacheKey = 'dexscreener-all'
  const cached = getCached(cacheKey)
  if (cached) return cached

  if (!checkRateLimit('dexscreener')) return []

  const tokens: TokenData[] = []
  const seenAddresses = new Set<string>()
  const boostedTokens = new Map<string, any>() // Track which tokens have boosts
  const profileTokens = new Map<string, any>() // Track which tokens have profiles

  try {
    // Fetch from multiple endpoints for maximum coverage
    const [boostsLatest, boostsTop, profiles, searchRes] = await Promise.allSettled([
      fetchWithTimeout('https://api.dexscreener.com/token-boosts/latest/v1').then(r => r.json()),
      fetchWithTimeout('https://api.dexscreener.com/token-boosts/top/v1').then(r => r.json()),
      fetchWithTimeout('https://api.dexscreener.com/token-profiles/latest/v1').then(r => r.json()),
      fetchWithTimeout('https://api.dexscreener.com/latest/dex/search?q=solana').then(r => r.json()),
    ])

    const addresses: string[] = []

    // Process boosted tokens (these have ⚡ lightning boost)
    if (boostsLatest.status === 'fulfilled' && Array.isArray(boostsLatest.value)) {
      for (const item of boostsLatest.value) {
        if (item.chainId === 'solana' && item.tokenAddress) {
          boostedTokens.set(item.tokenAddress, { amount: item.amount || 1, type: 'latest' })
          if (!seenAddresses.has(item.tokenAddress)) {
            seenAddresses.add(item.tokenAddress)
            addresses.push(item.tokenAddress)
          }
        }
      }
    }

    // Process top boosted tokens
    if (boostsTop.status === 'fulfilled' && Array.isArray(boostsTop.value)) {
      for (const item of boostsTop.value) {
        if (item.chainId === 'solana' && item.tokenAddress) {
          const existing = boostedTokens.get(item.tokenAddress)
          boostedTokens.set(item.tokenAddress, { 
            amount: Math.max(existing?.amount || 0, item.amount || 1), 
            type: 'top' 
          })
          if (!seenAddresses.has(item.tokenAddress)) {
            seenAddresses.add(item.tokenAddress)
            addresses.push(item.tokenAddress)
          }
        }
      }
    }

    // Process profile tokens (these have DexScreener profile/icon)
    if (profiles.status === 'fulfilled' && Array.isArray(profiles.value)) {
      for (const item of profiles.value) {
        if (item.chainId === 'solana' && item.tokenAddress) {
          profileTokens.set(item.tokenAddress, {
            icon: item.icon,
            header: item.header,
            description: item.description,
            links: item.links,
          })
          if (!seenAddresses.has(item.tokenAddress)) {
            seenAddresses.add(item.tokenAddress)
            addresses.push(item.tokenAddress)
          }
        }
      }
    }

    // Process search results
    if (searchRes.status === 'fulfilled' && searchRes.value?.pairs) {
      for (const pair of searchRes.value.pairs) {
        if (pair.chainId === 'solana' && pair.baseToken?.address) {
          const addr = pair.baseToken.address
          if (!seenAddresses.has(addr)) {
            seenAddresses.add(addr)
            const boostData = boostedTokens.get(addr)
            const profileData = profileTokens.get(addr)
            tokens.push(parseDexScreenerPair(pair, boostData, profileData))
          }
        }
      }
    }

    // Batch fetch token data for collected addresses
    const chunks: string[][] = []
    for (let i = 0; i < addresses.length; i += 30) {
      chunks.push(addresses.slice(i, i + 30))
    }

    for (const chunk of chunks.slice(0, 15)) { // Max 450 tokens
      try {
        const res = await fetchWithTimeout(
          `https://api.dexscreener.com/tokens/v1/solana/${chunk.join(',')}`
        )
        if (res.ok) {
          const pairs = await res.json()
          for (const pair of pairs || []) {
            const addr = pair.baseToken?.address
            if (addr && !tokens.some(t => t.address === addr)) {
              const boostData = boostedTokens.get(addr)
              const profileData = profileTokens.get(addr)
              tokens.push(parseDexScreenerPair(pair, boostData, profileData))
            }
          }
        }
      } catch (e) {
        continue
      }
    }

    recordCall('dexscreener', true)
    setCache(cacheKey, tokens, 'dexscreener')
    return tokens
  } catch (error) {
    recordCall('dexscreener', false)
    console.error('[FEED] DexScreener error:', error)
    return []
  }
}

function parseDexScreenerPair(pair: any, boostData?: any, profileData?: any): TokenData {
  const isPumpFun = pair.dexId === 'pumpfun' || pair.url?.includes('pump.fun')
  const address = pair.baseToken?.address || ''
  
  // Calculate advanced metrics
  const volume24h = pair.volume?.h24 || 0
  const marketCap = pair.marketCap || pair.fdv || 0
  const volumeToMcapRatio = marketCap > 0 ? (volume24h / marketCap) * 100 : 0
  
  const txns24h = { buys: pair.txns?.h24?.buys || 0, sells: pair.txns?.h24?.sells || 0 }
  const totalTxns = txns24h.buys + txns24h.sells
  const buyPressure = totalTxns > 0 ? (txns24h.buys / totalTxns) * 100 : 50
  
  // Calculate volatility from price changes
  const priceChange24h = pair.priceChange?.h24 || 0
  const priceChange1h = pair.priceChange?.h1 || 0
  const priceChange5m = pair.priceChange?.m5 || 0
  const volatility24h = Math.abs(priceChange24h) + Math.abs(priceChange1h * 24) / 24
  
  // Liquidity quality score (healthy liquidity relative to market cap)
  const liquidity = pair.liquidity?.usd || 0
  let liquidityScore = 50
  if (marketCap > 0) {
    const liqRatio = liquidity / marketCap
    if (liqRatio > 0.3) liquidityScore = 90
    else if (liqRatio > 0.15) liquidityScore = 75
    else if (liqRatio > 0.05) liquidityScore = 60
    else if (liqRatio > 0.02) liquidityScore = 40
    else liquidityScore = 20
  }
  
  return {
    address,
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    price: parseFloat(pair.priceUsd) || 0,
    priceChange24h,
    priceChange1h,
    priceChange5m,
    volume24h,
    volume6h: pair.volume?.h6 || 0,
    volume1h: pair.volume?.h1 || 0,
    volume5m: pair.volume?.m5 || 0,
    liquidity,
    marketCap,
    fdv: pair.fdv || 0,
    pairCreatedAt: pair.pairCreatedAt || Date.now(),
    pairAddress: pair.pairAddress || '',
    logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png`,
    dexId: pair.dexId || 'unknown',
    txns24h,
    txns6h: { buys: pair.txns?.h6?.buys || 0, sells: pair.txns?.h6?.sells || 0 },
    txns1h: { buys: pair.txns?.h1?.buys || 0, sells: pair.txns?.h1?.sells || 0 },
    txns5m: { buys: pair.txns?.m5?.buys || 0, sells: pair.txns?.m5?.sells || 0 },
    source: 'dexscreener',
    isPumpFun,
    isMigrated: isPumpFun && pair.dexId !== 'pumpfun',
    
    // DexScreener enhancement flags (set from boost/profile data)
    hasDexScreenerProfile: !!pair.info?.imageUrl || !!profileData,
    hasDexScreenerBoost: !!boostData,
    boostAmount: boostData?.amount || 0,
    hasEnhancedProfile: !!pair.info?.websites?.length || !!pair.info?.socials?.length,
    profileUpdatedAt: pair.info?.updatedAt || undefined,
    
    // Advanced metrics
    volumeToMcapRatio,
    buyPressure,
    liquidityScore,
    volatility24h,
  }
}

// ============================================================================
// JUPITER - Verified Tokens + Prices
// ============================================================================

async function fetchJupiterTokens(): Promise<TokenData[]> {
  const cacheKey = 'jupiter-all'
  const cached = getCached(cacheKey)
  if (cached) return cached

  if (!checkRateLimit('jupiter')) return []

  const tokens: TokenData[] = []

  try {
    // Get all verified tokens from Jupiter
    const listRes = await fetchWithTimeout('https://token.jup.ag/all')
    if (!listRes.ok) throw new Error('Jupiter token list failed')

    const allTokens = await listRes.json()
    
    // Filter to Solana tokens with recent activity (has tags or is verified)
    const activeTokens = allTokens
      .filter((t: any) => t.address && t.symbol)
      .slice(0, 500) // Take top 500

    // Get prices in batches
    const addresses = activeTokens.map((t: any) => t.address)
    const priceChunks: string[][] = []
    for (let i = 0; i < addresses.length; i += 100) {
      priceChunks.push(addresses.slice(i, i + 100))
    }

    const priceData: Record<string, any> = {}
    
    for (const chunk of priceChunks.slice(0, 5)) { // Max 500 tokens
      try {
        const priceRes = await fetchWithTimeout(
          `https://api.jup.ag/price/v2?ids=${chunk.join(',')}`
        )
        if (priceRes.ok) {
          const data = await priceRes.json()
          Object.assign(priceData, data.data || {})
        }
      } catch (e) {
        continue
      }
    }

    for (const token of activeTokens) {
      const price = priceData[token.address]?.price || 0
      
      tokens.push({
        address: token.address,
        symbol: token.symbol,
        name: token.name || token.symbol,
        price,
        priceChange24h: 0, // Jupiter doesn't provide this
        priceChange1h: 0,
        priceChange5m: 0,
        volume24h: 0,
        volume6h: 0,
        volume1h: 0,
        volume5m: 0,
        liquidity: 0,
        marketCap: 0,
        fdv: 0,
        pairCreatedAt: Date.now(),
        pairAddress: '',
        logo: token.logoURI || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.address}.png`,
        dexId: 'jupiter',
        txns24h: { buys: 0, sells: 0 },
        txns6h: { buys: 0, sells: 0 },
        txns1h: { buys: 0, sells: 0 },
        txns5m: { buys: 0, sells: 0 },
        source: 'jupiter',
      })
    }

    recordCall('jupiter', true)
    setCache(cacheKey, tokens, 'jupiter')
    return tokens
  } catch (error) {
    recordCall('jupiter', false)
    console.error('[FEED] Jupiter error:', error)
    return []
  }
}

// ============================================================================
// HELIUS - On-Chain Data, New Tokens via DAS
// ============================================================================

async function fetchHeliusTokens(): Promise<TokenData[]> {
  if (!HELIUS_API_KEY) return []

  const cacheKey = 'helius-all'
  const cached = getCached(cacheKey)
  if (cached) return cached

  if (!checkRateLimit('helius')) return []

  const tokens: TokenData[] = []

  try {
    // Use Helius DAS to find recently created fungible tokens
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    
    const response = await fetchWithTimeout(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'searchAssets',
        params: {
          ownerAddress: null,
          tokenType: 'fungible',
          displayOptions: { showFungible: true },
          sortBy: { sortBy: 'created', sortDirection: 'desc' },
          limit: 100,
        },
      }),
    })

    if (response.ok) {
      const data = await response.json()
      const assets = data.result?.items || []
      
      for (const asset of assets) {
        if (!asset.id) continue
        
        tokens.push({
          address: asset.id,
          symbol: asset.content?.metadata?.symbol || 'NEW',
          name: asset.content?.metadata?.name || 'New Token',
          price: 0,
          priceChange24h: 0,
          priceChange1h: 0,
          priceChange5m: 0,
          volume24h: 0,
          volume6h: 0,
          volume1h: 0,
          volume5m: 0,
          liquidity: 0,
          marketCap: 0,
          fdv: 0,
          pairCreatedAt: Date.now(),
          pairAddress: '',
          logo: asset.content?.links?.image || asset.content?.files?.[0]?.uri || '',
          dexId: 'helius',
          txns24h: { buys: 0, sells: 0 },
          txns6h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          txns5m: { buys: 0, sells: 0 },
          source: 'helius',
        })
      }
    }

    recordCall('helius', true)
    setCache(cacheKey, tokens, 'helius')
    return tokens
  } catch (error) {
    recordCall('helius', false)
    console.error('[FEED] Helius error:', error)
    return []
  }
}

// ============================================================================
// BIRDEYE - Token Analytics
// ============================================================================

async function fetchBirdeyeTokens(): Promise<TokenData[]> {
  if (!BIRDEYE_API_KEY) return []

  const cacheKey = 'birdeye-all'
  const cached = getCached(cacheKey)
  if (cached) return cached

  if (!checkRateLimit('birdeye')) return []

  const tokens: TokenData[] = []

  try {
    // Fetch trending tokens from Birdeye
    const response = await fetchWithTimeout(
      'https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=100',
      {
        headers: {
          'X-API-KEY': BIRDEYE_API_KEY,
          'x-chain': 'solana',
        },
      }
    )

    if (response.ok) {
      const data = await response.json()
      const tokenList = data.data?.tokens || []
      
      for (const token of tokenList) {
        tokens.push({
          address: token.address,
          symbol: token.symbol || 'UNKNOWN',
          name: token.name || 'Unknown',
          price: token.price || 0,
          priceChange24h: token.priceChange24hPercent || 0,
          priceChange1h: token.priceChange1hPercent || 0,
          priceChange5m: 0,
          volume24h: token.v24hUSD || 0,
          volume6h: 0,
          volume1h: token.v1hUSD || 0,
          volume5m: 0,
          liquidity: token.liquidity || 0,
          marketCap: token.mc || 0,
          fdv: token.fdv || 0,
          pairCreatedAt: Date.now(),
          pairAddress: '',
          logo: token.logoURI || '',
          dexId: 'birdeye',
          txns24h: { buys: 0, sells: 0 },
          txns6h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          txns5m: { buys: 0, sells: 0 },
          holders: token.holder || 0,
          source: 'birdeye',
        })
      }
    }

    recordCall('birdeye', true)
    setCache(cacheKey, tokens, 'birdeye')
    return tokens
  } catch (error) {
    recordCall('birdeye', false)
    console.error('[FEED] Birdeye error:', error)
    return []
  }
}

// ============================================================================
// PUMP.FUN - Pre-Migration Tokens on Bonding Curve
// ============================================================================

async function fetchPumpFunTokens(): Promise<TokenData[]> {
  const cacheKey = 'pumpfun-all'
  const cached = getCached(cacheKey)
  if (cached) return cached

  if (!checkRateLimit('pumpfun')) return []

  const tokens: TokenData[] = []

  try {
    // Fetch from Pump.fun API for pre-migration tokens
    const response = await fetchWithTimeout(
      'https://frontend-api.pump.fun/coins?limit=100&sort=created_timestamp&order=desc&includeNsfw=false'
    )

    if (response.ok) {
      const coins = await response.json()
      
      for (const coin of coins || []) {
        // Calculate bonding curve progress
        const bondingProgress = coin.bonding_curve 
          ? Math.min(100, (coin.virtual_sol_reserves / 85) * 100) // 85 SOL to complete
          : 0

        tokens.push({
          address: coin.mint || coin.address,
          symbol: coin.symbol || 'PUMP',
          name: coin.name || 'Pump.fun Token',
          price: coin.usd_market_cap ? coin.usd_market_cap / (coin.total_supply || 1000000000) : 0,
          priceChange24h: 0,
          priceChange1h: 0,
          priceChange5m: 0,
          volume24h: coin.volume_24h || 0,
          volume6h: 0,
          volume1h: 0,
          volume5m: 0,
          liquidity: coin.virtual_sol_reserves * 150 || 0, // Approximate SOL price
          marketCap: coin.usd_market_cap || 0,
          fdv: coin.usd_market_cap || 0,
          pairCreatedAt: coin.created_timestamp || Date.now(),
          pairAddress: coin.bonding_curve || '',
          logo: coin.image_uri || coin.uri || '',
          dexId: 'pumpfun',
          txns24h: { buys: 0, sells: 0 },
          txns6h: { buys: 0, sells: 0 },
          txns1h: { buys: 0, sells: 0 },
          txns5m: { buys: 0, sells: 0 },
          source: 'pumpfun',
          isPumpFun: true,
          isMigrated: false,
          bondingCurveProgress: bondingProgress,
        })
      }
    }

    recordCall('pumpfun', true)
    setCache(cacheKey, tokens, 'pumpfun')
    return tokens
  } catch (error) {
    recordCall('pumpfun', false)
    console.error('[FEED] Pump.fun error:', error)
    return []
  }
}

// ============================================================================
// SIGNAL ALGORITHMS - Buy/Sell Opportunity Detection
// ============================================================================

function calculateBuySignal(token: TokenData): number {
  let score = 50 // Neutral baseline

  // === VOLUME MOMENTUM ===
  // High recent volume relative to market cap = buying pressure
  const volumeToMcap = token.marketCap > 0 ? token.volume1h / token.marketCap : 0
  if (volumeToMcap > 0.1) score += 15
  else if (volumeToMcap > 0.05) score += 10
  else if (volumeToMcap > 0.02) score += 5

  // 5m volume spike detection
  const avgHourlyVol = token.volume24h / 24
  if (token.volume5m > avgHourlyVol * 5 / 60) score += 20 // 5m vol > expected
  else if (token.volume5m > avgHourlyVol * 3 / 60) score += 10

  // === BUY PRESSURE ===
  // More buys than sells = accumulation
  const txns5m = token.txns5m.buys + token.txns5m.sells
  const buyRatio5m = txns5m > 0 ? token.txns5m.buys / txns5m : 0.5
  if (buyRatio5m > 0.7) score += 15
  else if (buyRatio5m > 0.6) score += 8
  else if (buyRatio5m < 0.3) score -= 15

  const txns1h = token.txns1h.buys + token.txns1h.sells
  const buyRatio1h = txns1h > 0 ? token.txns1h.buys / txns1h : 0.5
  if (buyRatio1h > 0.65) score += 10

  // === PRICE MOMENTUM ===
  // Positive momentum = continuation likely
  if (token.priceChange5m > 5 && token.priceChange5m < 50) score += 10
  if (token.priceChange1h > 10 && token.priceChange1h < 100) score += 8
  
  // Recovery after dip
  if (token.priceChange1h > 0 && token.priceChange24h < -20) score += 12 // Dip recovery

  // === LIQUIDITY ===
  // Sweet spot liquidity (tradeable but not too established)
  if (token.liquidity >= 10000 && token.liquidity <= 200000) score += 10
  else if (token.liquidity >= 5000 && token.liquidity <= 500000) score += 5
  else if (token.liquidity < 2000) score -= 15 // Too low = rug risk

  // === NEWNESS ===
  // New tokens with momentum = opportunity
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 1 && txns5m > 10) score += 15
  else if (ageHours < 6 && txns1h > 50) score += 10
  else if (ageHours < 24 && token.volume1h > 5000) score += 5

  // === PUMP.FUN BONDING ===
  // Near completion = migration opportunity
  if (token.isPumpFun && !token.isMigrated) {
    if (token.bondingCurveProgress && token.bondingCurveProgress > 80) score += 20
    else if (token.bondingCurveProgress && token.bondingCurveProgress > 60) score += 10
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

function calculateSellSignal(token: TokenData): number {
  let score = 20 // Low baseline (most tokens aren't immediate sells)

  // === DUMP DETECTION ===
  // Large negative price change
  if (token.priceChange5m < -20) score += 30
  else if (token.priceChange5m < -10) score += 15
  else if (token.priceChange1h < -30) score += 25
  else if (token.priceChange1h < -15) score += 12

  // === SELL PRESSURE ===
  const txns5m = token.txns5m.buys + token.txns5m.sells
  const sellRatio5m = txns5m > 0 ? token.txns5m.sells / txns5m : 0.5
  if (sellRatio5m > 0.75) score += 25
  else if (sellRatio5m > 0.65) score += 15
  else if (sellRatio5m > 0.55) score += 8

  const txns1h = token.txns1h.buys + token.txns1h.sells
  const sellRatio1h = txns1h > 0 ? token.txns1h.sells / txns1h : 0.5
  if (sellRatio1h > 0.7) score += 15

  // === LIQUIDITY DRAIN ===
  // Very low liquidity = exit risk
  if (token.liquidity < 1000) score += 20
  else if (token.liquidity < 3000) score += 10

  // === OVEREXTENSION ===
  // Too pumped = correction likely
  if (token.priceChange1h > 200) score += 20
  else if (token.priceChange1h > 100) score += 10
  if (token.priceChange24h > 500) score += 15

  // === VOLUME COLLAPSE ===
  // Volume dying = interest fading
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h < avgHourlyVol * 0.2) score += 15
  else if (token.volume1h < avgHourlyVol * 0.5) score += 8

  return Math.max(0, Math.min(100, Math.round(score)))
}

function calculateRiskScore(token: TokenData): number {
  let risk = 20 // Base risk

  // Liquidity risk
  if (token.liquidity < 1000) risk += 35
  else if (token.liquidity < 5000) risk += 25
  else if (token.liquidity < 10000) risk += 15

  // Age risk (new = higher risk)
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 0.5) risk += 25
  else if (ageHours < 2) risk += 18
  else if (ageHours < 6) risk += 10
  else if (ageHours < 24) risk += 5

  // Sell pressure risk
  const txns24h = token.txns24h.buys + token.txns24h.sells
  const sellRatio = txns24h > 0 ? token.txns24h.sells / txns24h : 0.5
  if (sellRatio > 0.65) risk += 15
  else if (sellRatio > 0.55) risk += 8

  // Market cap to liquidity ratio (high = potential rug)
  if (token.marketCap > 0 && token.liquidity > 0) {
    const mcToLiq = token.marketCap / token.liquidity
    if (mcToLiq > 50) risk += 20
    else if (mcToLiq > 20) risk += 10
  }

  // Pre-migration pump.fun (higher risk)
  if (token.isPumpFun && !token.isMigrated) risk += 10

  return Math.max(0, Math.min(100, Math.round(risk)))
}

function calculateMomentumScore(token: TokenData): number {
  let score = 50

  // Price momentum
  if (token.priceChange5m > 15) score += 20
  else if (token.priceChange5m > 5) score += 12
  else if (token.priceChange5m > 2) score += 6
  else if (token.priceChange5m < -10) score -= 15
  else if (token.priceChange5m < -5) score -= 8

  if (token.priceChange1h > 30) score += 15
  else if (token.priceChange1h > 10) score += 8
  else if (token.priceChange1h < -20) score -= 12

  // Volume momentum
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h > avgHourlyVol * 3) score += 20
  else if (token.volume1h > avgHourlyVol * 2) score += 12
  else if (token.volume1h > avgHourlyVol * 1.5) score += 6
  else if (token.volume1h < avgHourlyVol * 0.3) score -= 15

  // Transaction momentum
  const txns5m = token.txns5m.buys + token.txns5m.sells
  if (txns5m > 50) score += 15
  else if (txns5m > 20) score += 10
  else if (txns5m > 10) score += 5

  // Buy pressure bonus
  const buyRatio = txns5m > 0 ? token.txns5m.buys / txns5m : 0.5
  if (buyRatio > 0.7) score += 10
  else if (buyRatio < 0.3) score -= 10

  return Math.max(0, Math.min(100, Math.round(score)))
}

function calculateTrendingScore(token: TokenData): number {
  let score = 0

  // Volume metrics (heavily weighted)
  score += Math.min((token.volume5m || 0) / 500, 50) * 3
  score += Math.min((token.volume1h || 0) / 5000, 50) * 2
  score += Math.min((token.volume24h || 0) / 50000, 50)

  // Transaction activity
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  const txns1h = (token.txns1h?.buys || 0) + (token.txns1h?.sells || 0)
  score += Math.min(txns5m * 3, 60)
  score += Math.min(txns1h / 2, 30)

  // Price momentum
  score += Math.min(Math.abs(token.priceChange5m || 0) * 2, 40)
  score += Math.min(Math.abs(token.priceChange1h || 0), 30)

  // Recency bonus
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 0.5) score += 60
  else if (ageHours < 1) score += 40
  else if (ageHours < 3) score += 25
  else if (ageHours < 12) score += 10

  // Buy pressure bonus
  const buyRatio = txns5m > 0 ? token.txns5m.buys / txns5m : 0.5
  if (buyRatio > 0.65) score += 20

  return Math.round(score)
}

// ============================================================================
// MASTER AGGREGATOR - Combines All Sources
// ============================================================================

export async function fetchMasterTokenFeed(options: {
  page?: number
  limit?: number
  sort?: 'trending' | 'new' | 'volume' | 'gainers' | 'losers' | 'buy_signal' | 'risk'
} = {}): Promise<FeedResult> {
  const { page = 1, limit = 200, sort = 'trending' } = options
  const startTime = Date.now()

  const cacheKey = `master-${page}-${sort}`
  const cached = getCached(cacheKey)
  if (cached) {
    return {
      tokens: cached.slice(0, limit),
      total: cached.length,
      hasMore: cached.length >= limit,
      sources: ['cache'],
      fetchTime: Date.now() - startTime,
    }
  }

  // Fetch from ALL sources in parallel
  const [dexTokens, jupTokens, heliusTokens, birdeyeTokens, pumpTokens] = await Promise.allSettled([
    fetchDexScreenerTokens(),
    fetchJupiterTokens(),
    fetchHeliusTokens(),
    fetchBirdeyeTokens(),
    fetchPumpFunTokens(),
  ])

  // Merge all tokens with deduplication
  const allTokens: TokenData[] = []
  const seenAddresses = new Set<string>()
  const sources: string[] = []

  const sourceResults = [
    { result: dexTokens, name: 'dexscreener', priority: 1 },
    { result: birdeyeTokens, name: 'birdeye', priority: 2 },
    { result: pumpTokens, name: 'pumpfun', priority: 3 },
    { result: jupTokens, name: 'jupiter', priority: 4 },
    { result: heliusTokens, name: 'helius', priority: 5 },
  ]

  // Process sources by priority (DexScreener data is most complete)
  for (const { result, name } of sourceResults) {
    if (result.status !== 'fulfilled') continue
    
    const tokens = result.value
    if (tokens.length > 0) sources.push(name)

    for (const token of tokens) {
      if (seenAddresses.has(token.address)) {
        // Merge data from lower priority source if we have more info
        const existing = allTokens.find(t => t.address === token.address)
        if (existing) {
          // Keep better data
          if (!existing.logo && token.logo) existing.logo = token.logo
          if (!existing.holders && token.holders) existing.holders = token.holders
          if (existing.volume24h === 0 && token.volume24h > 0) {
            existing.volume24h = token.volume24h
          }
        }
        continue
      }

      seenAddresses.add(token.address)

      // Calculate all scores
      token.trendingScore = calculateTrendingScore(token)
      token.buySignal = calculateBuySignal(token)
      token.sellSignal = calculateSellSignal(token)
      token.riskScore = calculateRiskScore(token)
      token.momentumScore = calculateMomentumScore(token)

      allTokens.push(token)
    }
  }

  // Sort based on requested order
  switch (sort) {
    case 'trending':
      allTokens.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
      break
    case 'new':
      allTokens.sort((a, b) => b.pairCreatedAt - a.pairCreatedAt)
      break
    case 'volume':
      allTokens.sort((a, b) => b.volume24h - a.volume24h)
      break
    case 'gainers':
      allTokens.sort((a, b) => b.priceChange24h - a.priceChange24h)
      break
    case 'losers':
      allTokens.sort((a, b) => a.priceChange24h - b.priceChange24h)
      break
    case 'buy_signal':
      allTokens.sort((a, b) => (b.buySignal || 0) - (a.buySignal || 0))
      break
    case 'risk':
      allTokens.sort((a, b) => (a.riskScore || 0) - (b.riskScore || 0)) // Lower risk first
      break
  }

  // Cache results
  setCache(cacheKey, allTokens, 'aggregated')

  const fetchTime = Date.now() - startTime
  console.log(`[FEED] Fetched ${allTokens.length} tokens from ${sources.join(', ')} in ${fetchTime}ms`)

  return {
    tokens: allTokens.slice(0, limit),
    total: allTokens.length,
    hasMore: allTokens.length > limit,
    sources,
    fetchTime,
  }
}

// Convenience exports
export async function fetchTrendingSolanaPairs(): Promise<TokenData[]> {
  const result = await fetchMasterTokenFeed({ sort: 'trending', limit: 300 })
  return result.tokens
}

export async function fetchNewSolanaTokens(): Promise<TokenData[]> {
  const result = await fetchMasterTokenFeed({ sort: 'new', limit: 200 })
  return result.tokens
}

export async function fetchAllSolanaPairs(page: number = 1): Promise<{ tokens: TokenData[]; hasMore: boolean; total: number }> {
  const result = await fetchMasterTokenFeed({ page, limit: 200, sort: 'trending' })
  return { tokens: result.tokens, hasMore: result.hasMore, total: result.total }
}

export function clearTokenCache() {
  tokenCache.clear()
}
