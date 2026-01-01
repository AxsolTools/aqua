import { NextResponse } from 'next/server'
import { getTrendingTokens, getBoostedTokens, getTokenPairs, getDexScreenerLogoUrl } from '@/lib/api/dexscreener'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  try {
    // Fetch trending and boosted tokens in parallel
    const [trendingPairs, boostedTokens] = await Promise.all([
      getTrendingTokens(),
      getBoostedTokens(),
    ])

    // Create a map of boosted tokens for quick lookup
    const boostedMap = new Map(boostedTokens.map(t => [t.tokenAddress, t]))

    // Process trending pairs
    const tokens = trendingPairs.map((pair) => {
      const boosted = boostedMap.get(pair.baseToken.address)
      
      return {
        address: pair.baseToken.address,
        symbol: pair.baseToken.symbol,
        name: pair.baseToken.name,
        logoURI: pair.info?.imageUrl || boosted?.icon || getDexScreenerLogoUrl('solana', pair.baseToken.address),
        price: parseFloat(pair.priceUsd) || 0,
        priceChange24h: pair.priceChange?.h24 || 0,
        volume24h: pair.volume?.h24 || 0,
        marketCap: pair.marketCap || pair.fdv || 0,
        liquidity: pair.liquidity?.usd || 0,
        pairAddress: pair.pairAddress,
        dexUrl: pair.url || `https://dexscreener.com/solana/${pair.baseToken.address}`,
        boosts: boosted?.amount || 0,
        txns: pair.txns?.h24 || { buys: 0, sells: 0 },
        pairCreatedAt: pair.pairCreatedAt,
      }
    })

    // Sort by volume
    tokens.sort((a, b) => b.volume24h - a.volume24h)

    return NextResponse.json({
      success: true,
      tokens: tokens.slice(0, 20),
    })
  } catch (error) {
    console.error('Error fetching trending tokens:', error)
    return NextResponse.json(
      { success: false, error: 'Failed to fetch trending tokens', tokens: [] },
      { status: 500 }
    )
  }
}

