import { NextResponse } from 'next/server'
import { fetchMasterTokenFeed, type TokenData } from '@/lib/api/solana-token-feed'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Server-side cache
let serverCache: { 
  data: TokenData[]
  timestamp: number
  page: number
  sort: string
} | null = null
const SERVER_CACHE_TTL = 8000 // 8 seconds

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  
  // NO LIMIT - return as many tokens as available
  // Frontend handles pagination
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '200') // Default 200, no max cap
  const sort = (searchParams.get('sort') || 'trending') as 'trending' | 'new' | 'volume' | 'gainers' | 'losers'
  
  const cacheKey = `${page}-${sort}`
  const now = Date.now()
  
  // Check server cache
  if (serverCache && 
      serverCache.page === page && 
      serverCache.sort === sort &&
      now - serverCache.timestamp < SERVER_CACHE_TTL) {
    return NextResponse.json({
      success: true,
      data: serverCache.data.slice(0, limit),
      count: serverCache.data.length,
      total: serverCache.data.length,
      page,
      hasMore: serverCache.data.length >= limit,
      cached: true,
      cacheAge: now - serverCache.timestamp,
    })
  }
  
  try {
    const result = await fetchMasterTokenFeed({
      page,
      limit,
      sort,
    })
    
    // Update server cache
    serverCache = {
      data: result.tokens,
      timestamp: now,
      page,
      sort,
    }
    
    return NextResponse.json({
      success: true,
      data: result.tokens,
      count: result.tokens.length,
      total: result.total,
      page,
      hasMore: result.hasMore,
      sources: result.sources,
    })
  } catch (error) {
    console.error('Error fetching live tokens:', error)
    
    // Return stale cache if available
    if (serverCache) {
      return NextResponse.json({
        success: true,
        data: serverCache.data.slice(0, limit),
        count: serverCache.data.length,
        page,
        hasMore: true,
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
