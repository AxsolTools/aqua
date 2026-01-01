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
  quoteToken: {
    address: string
    name: string
    symbol: string
  }
  priceNative: string
  priceUsd: string
  txns: {
    m5: { buys: number; sells: number }
    h1: { buys: number; sells: number }
    h6: { buys: number; sells: number }
    h24: { buys: number; sells: number }
  }
  volume: {
    h24: number
    h6: number
    h1: number
    m5: number
  }
  priceChange: {
    m5: number
    h1: number
    h6: number
    h24: number
  }
  liquidity: {
    usd: number
    base: number
    quote: number
  }
  fdv: number
  marketCap: number
  pairCreatedAt: number
  info?: {
    imageUrl?: string
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
}

// In-memory cache with short TTL for rate limit protection
const cache: Map<string, { data: unknown; timestamp: number }> = new Map()
const CACHE_TTL = 10000 // 10 seconds

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = parseInt(searchParams.get('limit') || '40')
  
  const cacheKey = `live-tokens-${limit}`
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
    
    // Strategy 1: Fetch latest boosted tokens (most active/promoted)
    try {
      const boostedRes = await fetchWithTimeout('https://api.dexscreener.com/token-boosts/latest/v1')
      if (boostedRes.ok) {
        const boostedData = await boostedRes.json()
        const solanaBoosts = (boostedData || [])
          .filter((t: { chainId: string }) => t.chainId === 'solana')
          .slice(0, 20)
        
        // Batch fetch token data
        const addresses = solanaBoosts.map((t: { tokenAddress: string }) => t.tokenAddress)
        if (addresses.length > 0) {
          const batchRes = await fetchWithTimeout(
            `https://api.dexscreener.com/tokens/v1/solana/${addresses.slice(0, 30).join(',')}`
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
      console.error('Boosted fetch error:', e)
    }
    
    // Strategy 2: Fetch latest token profiles (newly listed with metadata)
    try {
      const profilesRes = await fetchWithTimeout('https://api.dexscreener.com/token-profiles/latest/v1')
      if (profilesRes.ok) {
        const profilesData = await profilesRes.json()
        const solanaProfiles = (profilesData || [])
          .filter((t: { chainId: string }) => t.chainId === 'solana')
          .slice(0, 20)
        
        const addresses = solanaProfiles
          .map((t: { tokenAddress: string }) => t.tokenAddress)
          .filter((addr: string) => !seenAddresses.has(addr))
        
        if (addresses.length > 0) {
          const batchRes = await fetchWithTimeout(
            `https://api.dexscreener.com/tokens/v1/solana/${addresses.slice(0, 30).join(',')}`
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
      console.error('Profiles fetch error:', e)
    }
    
    // Strategy 3: Search for active Solana pairs
    try {
      const searchRes = await fetchWithTimeout('https://api.dexscreener.com/latest/dex/search?q=solana')
      if (searchRes.ok) {
        const searchData = await searchRes.json()
        const solanaPairs = ((searchData?.pairs || []) as TokenPair[])
          .filter((p) => p.chainId === 'solana' && !seenAddresses.has(p.baseToken?.address))
          .sort((a, b) => (b.volume?.h24 || 0) - (a.volume?.h24 || 0))
          .slice(0, 15)
        
        for (const pair of solanaPairs) {
          if (pair?.baseToken?.address && !seenAddresses.has(pair.baseToken.address)) {
            seenAddresses.add(pair.baseToken.address)
            tokens.push(formatPair(pair))
          }
        }
      }
    } catch (e) {
      console.error('Search fetch error:', e)
    }
    
    // Sort by a combination of recency and activity
    const sortedTokens = tokens
      .filter(t => t.marketCap > 0 && t.price > 0)
      .sort((a, b) => {
        // Prioritize newer tokens with activity
        const aScore = (a.volume24h / Math.max(a.marketCap, 1)) * 1000 + 
                       (Date.now() - a.pairCreatedAt < 86400000 ? 100 : 0)
        const bScore = (b.volume24h / Math.max(b.marketCap, 1)) * 1000 + 
                       (Date.now() - b.pairCreatedAt < 86400000 ? 100 : 0)
        return bScore - aScore
      })
      .slice(0, limit)
    
    setCache(cacheKey, sortedTokens)
    
    return NextResponse.json({
      success: true,
      data: sortedTokens,
      count: sortedTokens.length,
    })
  } catch (error) {
    console.error('Error fetching live tokens:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tokens', data: [] },
      { status: 500 }
    )
  }
}
