import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface TokenPair {
  chainId: string
  dexId: string
  url: string
  pairAddress: string
  baseToken: {
    address: string
    name: string
    symbol: string
  }
  priceUsd: string
  txns: {
    h24: { buys: number; sells: number }
  }
  volume: {
    h24: number
    h6: number
    h1: number
  }
  priceChange: {
    h24: number
    h6: number
    h1: number
  }
  liquidity: {
    usd: number
  }
  fdv: number
  marketCap: number
  pairCreatedAt: number
  info?: {
    imageUrl?: string
  }
  boosts?: {
    active: number
  }
}

interface FormattedToken {
  symbol: string
  name: string
  address: string
  price: number
  priceChange24h: number
  volume24h: number
  liquidity: number
  marketCap: number
  pairCreatedAt: number
  logo: string
  txns24h: { buys: number; sells: number }
  trendingScore: number
}

// Cache for rate limiting
const cache: Map<string, { data: unknown; timestamp: number }> = new Map()
const CACHE_TTL = 15000 // 15 seconds

function getCached<T>(key: string): T | null {
  const cached = cache.get(key)
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data as T
  }
  return null
}

function setCache(key: string, data: unknown) {
  cache.set(key, { data, timestamp: Date.now() })
}

function formatPair(pair: TokenPair): FormattedToken {
  // Calculate trending score based on volume, price change, and activity
  const volumeScore = Math.min((pair.volume?.h24 || 0) / 100000, 100)
  const changeScore = Math.min(Math.abs(pair.priceChange?.h24 || 0), 100)
  const activityScore = Math.min(((pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0)) / 100, 100)
  const boostScore = (pair.boosts?.active || 0) * 10
  const trendingScore = volumeScore + changeScore + activityScore + boostScore
  
  return {
    symbol: pair.baseToken?.symbol || 'UNKNOWN',
    name: pair.baseToken?.name || 'Unknown Token',
    address: pair.baseToken?.address || pair.pairAddress,
    price: Number.parseFloat(pair.priceUsd) || 0,
    priceChange24h: pair.priceChange?.h24 || 0,
    volume24h: pair.volume?.h24 || 0,
    liquidity: pair.liquidity?.usd || 0,
    marketCap: pair.marketCap || pair.fdv || 0,
    pairCreatedAt: pair.pairCreatedAt || Date.now(),
    logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${pair.baseToken?.address}.png`,
    txns24h: {
      buys: pair.txns?.h24?.buys || 0,
      sells: pair.txns?.h24?.sells || 0,
    },
    trendingScore,
  }
}

async function fetchWithTimeout(url: string, timeout = 8000): Promise<Response> {
  const controller = new AbortController()
  const id = setTimeout(() => controller.abort(), timeout)
  
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    clearTimeout(id)
    return response
  } catch (error) {
    clearTimeout(id)
    throw error
  }
}

export async function GET() {
  const cacheKey = 'trending-tokens'
  const cached = getCached<FormattedToken[]>(cacheKey)
  if (cached) {
    return NextResponse.json({
      success: true,
      data: cached,
      count: cached.length,
      cached: true,
    })
  }
  
  try {
    const tokens: FormattedToken[] = []
    const seenAddresses = new Set<string>()
    
    // Fetch top boosted tokens (most promoted = trending indicator)
    try {
      const topBoostRes = await fetchWithTimeout('https://api.dexscreener.com/token-boosts/top/v1')
      if (topBoostRes.ok) {
        const boostData = await topBoostRes.json()
        const solanaBoosts = (boostData || [])
          .filter((t: { chainId: string }) => t.chainId === 'solana')
          .slice(0, 30)
        
        const addresses = solanaBoosts.map((t: { tokenAddress: string }) => t.tokenAddress)
        if (addresses.length > 0) {
          const batchRes = await fetchWithTimeout(
            `https://api.dexscreener.com/tokens/v1/solana/${addresses.join(',')}`
          )
          if (batchRes.ok) {
            const pairsData: TokenPair[] = await batchRes.json()
            for (const pair of pairsData || []) {
              if (pair?.baseToken?.address && !seenAddresses.has(pair.baseToken.address)) {
                seenAddresses.add(pair.baseToken.address)
                tokens.push(formatPair(pair))
              }
            }
          }
        }
      }
    } catch (e) {
      console.error('Top boost fetch error:', e)
    }
    
    // Also fetch high volume Solana pairs
    try {
      const searchRes = await fetchWithTimeout('https://api.dexscreener.com/latest/dex/search?q=solana')
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const highVolumePairs = ((searchData?.pairs || []) as TokenPair[])
          .filter((p) => p.chainId === 'solana' && !seenAddresses.has(p.baseToken?.address))
          .filter((p) => (p.volume?.h24 || 0) > 50000) // Min $50k volume
          .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
          .slice(0, 20)
        
        for (const pair of highVolumePairs) {
          if (pair?.baseToken?.address && !seenAddresses.has(pair.baseToken.address)) {
            seenAddresses.add(pair.baseToken.address)
            tokens.push(formatPair(pair))
          }
        }
      }
    } catch (e) {
      console.error('Search fetch error:', e)
    }
    
    // Sort by trending score
    const trendingTokens = tokens
      .filter(t => t.marketCap > 0 && t.price > 0)
      .sort((a, b) => b.trendingScore - a.trendingScore)
      .slice(0, 40)
    
    setCache(cacheKey, trendingTokens)
    
    return NextResponse.json({
      success: true,
      data: trendingTokens,
      count: trendingTokens.length,
    })
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trending tokens', data: [] },
      { status: 500 }
    )
  }
}
