import { NextResponse } from 'next/server'
import { 
  getAllKnownKOLs, 
  getKOLStats, 
  getWalletTransactions,
  detectKOLConvergence,
  type KOLWallet,
  type KOLStats,
  type WalletActivity 
} from '@/lib/api/kol-monitor'

export const dynamic = 'force-dynamic'
export const revalidate = 0

// Cache for KOL data
let kolStatsCache: Map<string, { stats: KOLStats; timestamp: number }> = new Map()
let convergenceCache: { data: Map<string, { kols: KOLWallet[]; buyCount: number }>; timestamp: number } | null = null
const STATS_CACHE_TTL = 60000 // 1 minute
const CONVERGENCE_CACHE_TTL = 120000 // 2 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'
  const wallet = searchParams.get('wallet')
  
  const heliusApiKey = process.env.HELIUS_API_KEY
  
  if (!heliusApiKey) {
    return NextResponse.json({
      success: false,
      error: 'Helius API key not configured',
      data: null,
    }, { status: 500 })
  }
  
  try {
    switch (action) {
      case 'list': {
        // Return list of known KOLs with basic info
        const kols = getAllKnownKOLs()
        
        // Try to get cached stats for each
        const enrichedKols = await Promise.all(
          kols.map(async (kol) => {
            const cached = kolStatsCache.get(kol.address)
            if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
              return {
                ...kol,
                stats: cached.stats,
                isActive: Date.now() - cached.stats.lastActive < 3600000, // Active in last hour
              }
            }
            
            // Fetch fresh stats (in background, don't block)
            getKOLStats(kol.address, heliusApiKey).then(stats => {
              if (stats) {
                kolStatsCache.set(kol.address, { stats, timestamp: Date.now() })
              }
            }).catch(() => {})
            
            return {
              ...kol,
              stats: cached?.stats || null,
              isActive: cached ? Date.now() - (cached.stats?.lastActive || 0) < 3600000 : undefined,
            }
          })
        )
        
        return NextResponse.json({
          success: true,
          data: enrichedKols,
          count: enrichedKols.length,
        })
      }
      
      case 'stats': {
        if (!wallet) {
          return NextResponse.json({
            success: false,
            error: 'Wallet address required',
          }, { status: 400 })
        }
        
        // Check cache first
        const cached = kolStatsCache.get(wallet)
        if (cached && Date.now() - cached.timestamp < STATS_CACHE_TTL) {
          return NextResponse.json({
            success: true,
            data: cached.stats,
            cached: true,
            cacheAge: Date.now() - cached.timestamp,
          })
        }
        
        const stats = await getKOLStats(wallet, heliusApiKey)
        
        if (stats) {
          kolStatsCache.set(wallet, { stats, timestamp: Date.now() })
        }
        
        return NextResponse.json({
          success: true,
          data: stats,
        })
      }
      
      case 'transactions': {
        if (!wallet) {
          return NextResponse.json({
            success: false,
            error: 'Wallet address required',
          }, { status: 400 })
        }
        
        const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50)
        const transactions = await getWalletTransactions(wallet, heliusApiKey, limit)
        
        return NextResponse.json({
          success: true,
          data: transactions,
          count: transactions.length,
        })
      }
      
      case 'convergence': {
        // Check cache
        if (convergenceCache && Date.now() - convergenceCache.timestamp < CONVERGENCE_CACHE_TTL) {
          const result = Array.from(convergenceCache.data.entries()).map(([token, data]) => ({
            token,
            kols: data.kols.map(k => ({ name: k.name, twitter: k.twitter, tier: k.tier })),
            buyCount: data.buyCount,
          }))
          
          return NextResponse.json({
            success: true,
            data: result,
            cached: true,
            cacheAge: Date.now() - convergenceCache.timestamp,
          })
        }
        
        const lookbackMinutes = parseInt(searchParams.get('lookback') || '60')
        const convergence = await detectKOLConvergence(heliusApiKey, lookbackMinutes)
        
        // Update cache
        convergenceCache = { data: convergence, timestamp: Date.now() }
        
        const result = Array.from(convergence.entries()).map(([token, data]) => ({
          token,
          kols: data.kols.map(k => ({ name: k.name, twitter: k.twitter, tier: k.tier })),
          buyCount: data.buyCount,
        }))
        
        return NextResponse.json({
          success: true,
          data: result,
          count: result.length,
        })
      }
      
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`,
        }, { status: 400 })
    }
  } catch (error) {
    console.error('KOL API error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 })
  }
}

