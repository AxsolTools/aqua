import { NextResponse } from 'next/server'
import { fetchTrendingSolanaPairs, fetchMasterTokenFeed, type TokenData } from '@/lib/api/solana-token-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Server-side cache
let trendingCache: { data: TokenData[]; timestamp: number } | null = null
const CACHE_TTL = 10000 // 10 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  // NO LIMIT CAP - return all available trending tokens
  const limit = parseInt(searchParams.get('limit') || '200')
  const page = parseInt(searchParams.get('page') || '1')
  
  const now = Date.now()
  
  // Return cached data if fresh
  if (trendingCache && now - trendingCache.timestamp < CACHE_TTL) {
    const startIdx = (page - 1) * limit
    const pageData = trendingCache.data.slice(startIdx, startIdx + limit)
    
    return NextResponse.json({
      success: true,
      data: pageData,
      count: pageData.length,
      total: trendingCache.data.length,
      page,
      hasMore: startIdx + limit < trendingCache.data.length,
      cached: true,
      cacheAge: now - trendingCache.timestamp,
    })
  }
  
  try {
    // Get trending tokens - no artificial limit
    const result = await fetchMasterTokenFeed({
      page: 1,
      limit: 500, // Fetch as many as possible
      sort: 'trending',
    })
    
    // Additional trending-specific scoring
    const scoredTokens = result.tokens.map(token => ({
      ...token,
      trendingScore: calculateEnhancedTrendingScore(token),
    }))

    // Sort by enhanced trending score
    scoredTokens.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
    
    // Update cache with all tokens
    trendingCache = {
      data: scoredTokens,
      timestamp: now,
    }
    
    // Return requested page
    const startIdx = (page - 1) * limit
    const pageData = scoredTokens.slice(startIdx, startIdx + limit)
    
    return NextResponse.json({
      success: true,
      data: pageData,
      count: pageData.length,
      total: scoredTokens.length,
      page,
      hasMore: startIdx + limit < scoredTokens.length,
    })
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    
    // Return stale cache if available
    if (trendingCache) {
      const startIdx = (page - 1) * limit
      return NextResponse.json({
        success: true,
        data: trendingCache.data.slice(startIdx, startIdx + limit),
        total: trendingCache.data.length,
        page,
        hasMore: startIdx + limit < trendingCache.data.length,
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

function calculateEnhancedTrendingScore(token: TokenData): number {
  let score = token.trendingScore || 0
  
  // Boost for very recent high activity
  const txns5m = (token.txns5m?.buys || 0) + (token.txns5m?.sells || 0)
  if (txns5m > 50) score += 100
  else if (txns5m > 20) score += 50
  else if (txns5m > 10) score += 25
  
  // Volume spike detection
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h > avgHourlyVol * 5) score += 80
  else if (token.volume1h > avgHourlyVol * 3) score += 40
  else if (token.volume1h > avgHourlyVol * 2) score += 20
  
  // Price momentum multiplier
  if (token.priceChange5m > 10) score *= 1.5
  else if (token.priceChange5m > 5) score *= 1.3
  else if (token.priceChange5m < -20) score *= 0.5
  
  // Fresh token bonus
  const ageMinutes = (Date.now() - token.pairCreatedAt) / 60000
  if (ageMinutes < 10) score += 150
  else if (ageMinutes < 30) score += 100
  else if (ageMinutes < 60) score += 50
  
  return Math.round(score)
}
