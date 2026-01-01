import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface DexToken {
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
  isPumpFun: boolean
}

async function fetchTokenFromDexScreener(address: string): Promise<DexToken | null> {
  try {
    const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`, {
      next: { revalidate: 30 },
    })
    const data = await res.json()
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0]
      const isPumpFun = pair.dexId === 'pumpfun' || 
                        address.endsWith('pump') || 
                        pair.url?.includes('pump.fun')
      
      return {
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        address: pair.baseToken.address,
        price: Number.parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        liquidity: pair.liquidity?.usd || 0,
        marketCap: pair.marketCap || pair.fdv || 0,
        pairCreatedAt: pair.pairCreatedAt,
        logo: `https://dd.dexscreener.com/ds-data/tokens/solana/${address}.png`,
        txns24h: {
          buys: pair.txns?.h24?.buys || 0,
          sells: pair.txns?.h24?.sells || 0,
        },
        isPumpFun,
      }
    }
    return null
  } catch (error) {
    console.error("DexScreener fetch error:", error)
    return null
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const source = searchParams.get('source') || 'all' // 'all', 'pumpfun', 'trending', 'latest'
  const limit = parseInt(searchParams.get('limit') || '20')
  
  try {
    let tokens: DexToken[] = []
    
    if (source === 'trending' || source === 'all') {
      // Fetch trending/boosted tokens
      const boostedRes = await fetch("https://api.dexscreener.com/token-boosts/top/v1", {
        next: { revalidate: 30 },
      })
      const boostedData = await boostedRes.json()
      const solanaBoosts = (boostedData || [])
        .filter((t: any) => t.chainId === "solana")
        .slice(0, limit)
        .map((t: any) => t.tokenAddress)
      
      const boostedTokens = await Promise.all(
        solanaBoosts.map((addr: string) => fetchTokenFromDexScreener(addr))
      )
      tokens.push(...boostedTokens.filter((t): t is DexToken => t !== null))
    }
    
    if (source === 'latest' || source === 'all') {
      // Fetch latest token profiles
      const latestRes = await fetch("https://api.dexscreener.com/token-profiles/latest/v1", {
        next: { revalidate: 30 },
      })
      const latestData = await latestRes.json()
      const solanaLatest = (latestData || [])
        .filter((t: any) => t.chainId === "solana")
        .slice(0, limit)
        .map((t: any) => t.tokenAddress)
      
      const latestTokens = await Promise.all(
        solanaLatest.map((addr: string) => fetchTokenFromDexScreener(addr))
      )
      tokens.push(...latestTokens.filter((t): t is DexToken => t !== null))
    }
    
    // Deduplicate by address
    const uniqueTokens = tokens.reduce((acc: DexToken[], token) => {
      if (!acc.find(t => t.address === token.address)) {
        acc.push(token)
      }
      return acc
    }, [])
    
    // Filter for pump.fun if requested
    let filteredTokens = uniqueTokens
    if (source === 'pumpfun') {
      filteredTokens = uniqueTokens.filter(t => t.isPumpFun)
    }
    
    // Sort by creation time (newest first)
    filteredTokens.sort((a, b) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
    
    return NextResponse.json({
      success: true,
      data: filteredTokens.slice(0, limit),
      count: filteredTokens.length,
      source,
    })
  } catch (error) {
    console.error('Error fetching live tokens:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch tokens' },
      { status: 500 }
    )
  }
}

