import { NextResponse } from 'next/server'
import { 
  fetchAggregatedFeed, 
  fetchDexScreenerTokens,
  getSourceHealth,
  type TokenData 
} from '@/lib/api/multi-source-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Server-side cache to reduce API calls
let serverCache: { data: TokenData[]; timestamp: number; sources: string[] } | null = null
const SERVER_CACHE_TTL = 12000 // 12 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const limit = Math.min(parseInt(searchParams.get('limit') || '40'), 100)
  const sources = searchParams.get('sources')?.split(',') || ['dexscreener', 'jupiter', 'helius']
  
  // Check server cache
  const now = Date.now()
  if (serverCache && now - serverCache.timestamp < SERVER_CACHE_TTL) {
    return NextResponse.json({
      success: true,
      data: serverCache.data.slice(0, limit),
      count: Math.min(serverCache.data.length, limit),
      sources: serverCache.sources,
      cached: true,
      cacheAge: now - serverCache.timestamp,
    })
  }
  
  try {
    // Determine which sources to use based on health
    const health = getSourceHealth()
    const healthySources = (sources as ('dexscreener' | 'jupiter' | 'helius' | 'birdeye')[])
      .filter(s => health[s]?.healthy !== false)

    // If all sources are unhealthy, try DexScreener anyway as fallback
    if (healthySources.length === 0) {
      healthySources.push('dexscreener')
    }

    let tokens: TokenData[] = []

    // Use aggregated feed for best results
    if (healthySources.length > 1) {
      tokens = await fetchAggregatedFeed({
        sources: healthySources,
        limit: Math.max(limit, 50), // Fetch more for better sorting
        minLiquidity: 1000,
        minVolume: 100,
      })
    } else {
      // Fallback to single source
      tokens = await fetchDexScreenerTokens(limit)
    }

    // Sort by activity score
    tokens.sort((a, b) => {
      // Prioritize tokens with high activity relative to size
      const aActivity = (a.txns1h.buys + a.txns1h.sells) * 2 + (a.txns24h.buys + a.txns24h.sells) / 10
      const bActivity = (b.txns1h.buys + b.txns1h.sells) * 2 + (b.txns24h.buys + b.txns24h.sells) / 10
      
      // Also factor in volume/mcap ratio (higher = more interesting)
      const aRatio = a.marketCap > 0 ? a.volume24h / a.marketCap : 0
      const bRatio = b.marketCap > 0 ? b.volume24h / b.marketCap : 0
      
      return (bActivity + bRatio * 100) - (aActivity + aRatio * 100)
    })

    const result = tokens.slice(0, limit)
    
    // Update server cache
    serverCache = {
      data: tokens,
      timestamp: now,
      sources: healthySources,
    }
    
    return NextResponse.json({
      success: true,
      data: result,
      count: result.length,
      sources: healthySources,
      sourceHealth: health,
    })
  } catch (error) {
    console.error('Error fetching live tokens:', error)
    
    // Try to return stale cache if available
    if (serverCache) {
      return NextResponse.json({
        success: true,
        data: serverCache.data.slice(0, limit),
        count: Math.min(serverCache.data.length, limit),
        sources: serverCache.sources,
        stale: true,
        cacheAge: now - serverCache.timestamp,
      })
    }
    
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tokens', data: [] },
      { status: 500 }
    )
  }
}
