import { NextResponse } from 'next/server'
import { fetchTrendingAggregated, getSourceHealth, type TokenData } from '@/lib/api/multi-source-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Server-side cache
let trendingCache: { data: TokenData[]; timestamp: number } | null = null
const CACHE_TTL = 15000 // 15 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '40'), 100)
  
  const now = Date.now()
  
  // Return cached data if fresh
  if (trendingCache && now - trendingCache.timestamp < CACHE_TTL) {
    return NextResponse.json({
      success: true,
      data: trendingCache.data.slice(0, limit),
      count: Math.min(trendingCache.data.length, limit),
      cached: true,
      cacheAge: now - trendingCache.timestamp,
    })
  }
  
  try {
    const tokens = await fetchTrendingAggregated(Math.max(limit, 50))
    
    // Calculate trending score for each token
    const scoredTokens = tokens.map(token => ({
      ...token,
      trendingScore: calculateTrendingScore(token),
    }))

    // Sort by trending score
    scoredTokens.sort((a, b) => b.trendingScore - a.trendingScore)
    
    const result = scoredTokens.slice(0, limit)
    
    // Update cache
    trendingCache = {
      data: scoredTokens,
      timestamp: now,
    }
    
    return NextResponse.json({
      success: true,
      data: result,
      count: result.length,
      sourceHealth: getSourceHealth(),
    })
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    
    // Return stale cache if available
    if (trendingCache) {
      return NextResponse.json({
        success: true,
        data: trendingCache.data.slice(0, limit),
        count: Math.min(trendingCache.data.length, limit),
        stale: true,
        cacheAge: now - trendingCache.timestamp,
      })
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trending tokens', data: [] },
      { status: 500 }
    )
  }
}

function calculateTrendingScore(token: TokenData): number {
  let score = 0
  
  // Volume score (up to 100 points)
  const volumeScore = Math.min((token.volume24h || 0) / 100000, 100)
  score += volumeScore
  
  // 1h volume is more indicative of current trend (up to 50 points)
  const volume1hScore = Math.min((token.volume1h || 0) / 10000, 50)
  score += volume1hScore
  
  // Price change score (up to 50 points for big movers)
  const changeScore = Math.min(Math.abs(token.priceChange24h || 0), 50)
  score += changeScore
  
  // 1h change is more relevant for trending (up to 30 points)
  const change1hScore = Math.min(Math.abs(token.priceChange1h || 0) * 2, 30)
  score += change1hScore
  
  // Activity score (transactions, up to 50 points)
  const txns24h = (token.txns24h?.buys || 0) + (token.txns24h?.sells || 0)
  const txns1h = (token.txns1h?.buys || 0) + (token.txns1h?.sells || 0)
  const activityScore = Math.min(txns24h / 100 + txns1h / 10, 50)
  score += activityScore
  
  // Liquidity factor (prefer tokens with reasonable liquidity)
  if (token.liquidity >= 10000 && token.liquidity <= 1000000) {
    score += 20 // Sweet spot
  } else if (token.liquidity >= 5000) {
    score += 10
  }
  
  // Recency bonus for new tokens
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 1) score += 30
  else if (ageHours < 6) score += 20
  else if (ageHours < 24) score += 10
  
  return Math.round(score)
}
