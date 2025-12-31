/**
 * AQUA Launchpad - Token Price API
 * Fetches token prices from multiple sources (Jupiter, DexScreener)
 */

import { NextRequest, NextResponse } from "next/server"

const JUPITER_PRICE_API = "https://api.jup.ag/price/v2"
const SOL_MINT = "So11111111111111111111111111111111111111112"

interface PriceData {
  mint: string
  priceUsd: number
  priceSol: number
  source: string
  marketCap?: number
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mintAddress = searchParams.get("mint")
    const totalSupplyStr = searchParams.get("supply")
    const decimalsStr = searchParams.get("decimals")

    if (!mintAddress) {
      return NextResponse.json(
        { error: "mint address is required" },
        { status: 400 }
      )
    }

    const totalSupply = totalSupplyStr ? parseFloat(totalSupplyStr) : 0
    const decimals = decimalsStr ? parseInt(decimalsStr) : 6

    let priceUsd = 0
    let solPriceUsd = 0
    let source = "none"

    // Try Jupiter first
    try {
      const [solRes, tokenRes] = await Promise.all([
        fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`, {
          headers: { "Accept": "application/json" },
        }),
        fetch(`${JUPITER_PRICE_API}?ids=${mintAddress}`, {
          headers: { "Accept": "application/json" },
        }),
      ])

      if (solRes.ok) {
        const solData = await solRes.json()
        solPriceUsd = solData.data?.[SOL_MINT]?.price || 0
      }

      if (tokenRes.ok) {
        const tokenData = await tokenRes.json()
        priceUsd = tokenData.data?.[mintAddress]?.price || 0
        if (priceUsd > 0) source = "jupiter"
      }
    } catch (err) {
      console.warn("[TOKEN-PRICE] Jupiter failed:", err)
    }

    // Fallback to DexScreener
    if (priceUsd === 0) {
      try {
        const dexRes = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`,
          { headers: { "Accept": "application/json" } }
        )

        if (dexRes.ok) {
          const dexData = await dexRes.json()
          const pair = dexData.pairs?.find(
            (p: { priceUsd?: string; fdv?: number }) => 
              p.priceUsd && parseFloat(p.priceUsd) > 0
          )
          if (pair) {
            priceUsd = parseFloat(pair.priceUsd)
            source = "dexscreener"
            // DexScreener also provides market cap
            if (pair.fdv && !totalSupply) {
              // Use FDV as market cap if no supply provided
            }
          }
        }
      } catch (err) {
        console.warn("[TOKEN-PRICE] DexScreener failed:", err)
      }
    }

    // Fallback SOL price if Jupiter failed
    if (solPriceUsd === 0) {
      try {
        const fallbackRes = await fetch(
          `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/price/sol`
        )
        const fallbackData = await fallbackRes.json()
        solPriceUsd = fallbackData.data?.price || 150
      } catch {
        solPriceUsd = 150 // Ultimate fallback
      }
    }

    // Calculate price in SOL
    const priceSol = solPriceUsd > 0 ? priceUsd / solPriceUsd : 0

    // Calculate market cap
    let marketCap = 0
    if (totalSupply > 0 && priceUsd > 0) {
      const circulatingSupply = totalSupply / Math.pow(10, decimals)
      marketCap = priceUsd * circulatingSupply
    }

    const result: PriceData = {
      mint: mintAddress,
      priceUsd,
      priceSol,
      source,
      marketCap,
    }

    return NextResponse.json({
      success: true,
      data: result,
      solPriceUsd,
    })
  } catch (error) {
    console.error("[TOKEN-PRICE] Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch token price" },
      { status: 500 }
    )
  }
}

// POST for batch price fetching
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { mints } = body

    if (!mints || !Array.isArray(mints) || mints.length === 0) {
      return NextResponse.json(
        { error: "mints array is required" },
        { status: 400 }
      )
    }

    if (mints.length > 100) {
      return NextResponse.json(
        { error: "Maximum 100 mints per request" },
        { status: 400 }
      )
    }

    // Fetch SOL price first
    let solPriceUsd = 0
    try {
      const solRes = await fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`)
      if (solRes.ok) {
        const solData = await solRes.json()
        solPriceUsd = solData.data?.[SOL_MINT]?.price || 0
      }
    } catch {
      solPriceUsd = 150 // Fallback
    }

    // Batch fetch from Jupiter
    const ids = mints.join(",")
    const prices: Record<string, PriceData> = {}

    try {
      const res = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`)
      if (res.ok) {
        const data = await res.json()
        for (const mint of mints) {
          const priceUsd = data.data?.[mint]?.price || 0
          const priceSol = solPriceUsd > 0 ? priceUsd / solPriceUsd : 0
          prices[mint] = {
            mint,
            priceUsd,
            priceSol,
            source: priceUsd > 0 ? "jupiter" : "none",
          }
        }
      }
    } catch (err) {
      console.warn("[TOKEN-PRICE] Batch Jupiter failed:", err)
      // Fill with zeros
      for (const mint of mints) {
        prices[mint] = { mint, priceUsd: 0, priceSol: 0, source: "none" }
      }
    }

    return NextResponse.json({
      success: true,
      data: prices,
      solPriceUsd,
    })
  } catch (error) {
    console.error("[TOKEN-PRICE] POST Error:", error)
    return NextResponse.json(
      { error: "Failed to fetch token prices" },
      { status: 500 }
    )
  }
}

