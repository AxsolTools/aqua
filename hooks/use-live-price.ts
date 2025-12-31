"use client"

import { useState, useEffect, useCallback } from "react"

// ============================================================================
// TYPES
// ============================================================================

export interface LivePriceResult {
  priceSol: number
  priceUsd: number
  solPriceUsd: number
  marketCap: number
  isLoading: boolean
  error: string | null
  lastUpdated: number
  source: string
}

interface JupiterPriceResponse {
  data: {
    [mint: string]: {
      id: string
      price: number
    }
  }
}

// ============================================================================
// CONSTANTS
// ============================================================================

const SOL_MINT = "So11111111111111111111111111111111111111112"
const JUPITER_PRICE_API = "https://api.jup.ag/price/v2"
const POLL_INTERVAL = 30_000 // 30 seconds

// ============================================================================
// HOOK: useLivePrice
// ============================================================================

/**
 * Hook for fetching real-time token prices with 30-second polling
 * 
 * @param mintAddress - Token mint address
 * @param totalSupply - Total supply for market cap calculation
 * @param decimals - Token decimals (default 6 for pump.fun tokens)
 * @returns LivePriceResult with prices and market cap
 */
export function useLivePrice(
  mintAddress: string | null,
  totalSupply?: number,
  decimals: number = 6
): LivePriceResult {
  const [priceSol, setPriceSol] = useState(0)
  const [priceUsd, setPriceUsd] = useState(0)
  const [solPriceUsd, setSolPriceUsd] = useState(0)
  const [marketCap, setMarketCap] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState(0)
  const [source, setSource] = useState("none")

  const fetchPrices = useCallback(async () => {
    if (!mintAddress) {
      setIsLoading(false)
      return
    }

    try {
      // Fetch SOL price and token price in parallel
      const [solResponse, tokenResponse] = await Promise.all([
        fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`),
        fetch(`${JUPITER_PRICE_API}?ids=${mintAddress}`),
      ])

      // Parse SOL price
      let fetchedSolPrice = 0
      if (solResponse.ok) {
        const solData: JupiterPriceResponse = await solResponse.json()
        fetchedSolPrice = solData.data?.[SOL_MINT]?.price || 0
        setSolPriceUsd(fetchedSolPrice)
      }

      // If Jupiter SOL price failed, try our internal API
      if (fetchedSolPrice === 0) {
        try {
          const fallbackResponse = await fetch("/api/price/sol")
          const fallbackData = await fallbackResponse.json()
          fetchedSolPrice = fallbackData.data?.price || 150 // Fallback
          setSolPriceUsd(fetchedSolPrice)
        } catch {
          fetchedSolPrice = 150 // Ultimate fallback
          setSolPriceUsd(fetchedSolPrice)
        }
      }

      // Parse token price (in USD)
      let tokenPriceUsd = 0
      let priceSource = "jupiter"
      
      if (tokenResponse.ok) {
        const tokenData: JupiterPriceResponse = await tokenResponse.json()
        tokenPriceUsd = tokenData.data?.[mintAddress]?.price || 0
      }

      // Fallback to DexScreener if Jupiter fails
      if (tokenPriceUsd === 0) {
        try {
          const dexResponse = await fetch(
            `https://api.dexscreener.com/latest/dex/tokens/${mintAddress}`
          )
          if (dexResponse.ok) {
            const dexData = await dexResponse.json()
            const pair = dexData.pairs?.find(
              (p: { priceUsd?: string }) => p.priceUsd && parseFloat(p.priceUsd) > 0
            )
            if (pair) {
              tokenPriceUsd = parseFloat(pair.priceUsd)
              priceSource = "dexscreener"
            }
          }
        } catch {
          // Silently fail
        }
      }

      // Calculate token price in SOL
      const tokenPriceSol = fetchedSolPrice > 0 ? tokenPriceUsd / fetchedSolPrice : 0

      // Calculate market cap
      const circulatingSupply = totalSupply
        ? totalSupply / Math.pow(10, decimals)
        : 0
      const calculatedMarketCap = tokenPriceUsd * circulatingSupply

      // Update state
      setPriceSol(tokenPriceSol)
      setPriceUsd(tokenPriceUsd)
      setMarketCap(calculatedMarketCap)
      setSource(priceSource)
      setLastUpdated(Date.now())
      setError(null)
    } catch (err) {
      console.warn("[useLivePrice] Failed to fetch prices:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch prices")
    } finally {
      setIsLoading(false)
    }
  }, [mintAddress, totalSupply, decimals])

  // Initial fetch and polling
  useEffect(() => {
    fetchPrices()

    const interval = setInterval(fetchPrices, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchPrices])

  return {
    priceSol,
    priceUsd,
    solPriceUsd,
    marketCap,
    isLoading,
    error,
    lastUpdated,
    source,
  }
}

// ============================================================================
// HOOK: useBatchLivePrices
// ============================================================================

interface BatchPriceResult {
  prices: Map<string, { priceSol: number; priceUsd: number }>
  solPriceUsd: number
  isLoading: boolean
  error: string | null
  lastUpdated: number
}

/**
 * Hook for fetching live prices for multiple tokens at once
 * Useful for P&L calculations across holdings
 * 
 * @param mintAddresses - Array of token mint addresses
 * @returns BatchPriceResult with prices map
 */
export function useBatchLivePrices(mintAddresses: string[]): BatchPriceResult {
  const [prices, setPrices] = useState<Map<string, { priceSol: number; priceUsd: number }>>(
    new Map()
  )
  const [solPriceUsd, setSolPriceUsd] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState(0)

  const fetchBatchPrices = useCallback(async () => {
    if (mintAddresses.length === 0) {
      setIsLoading(false)
      return
    }

    try {
      // Fetch SOL price first
      const solResponse = await fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`)
      let fetchedSolPrice = 0
      
      if (solResponse.ok) {
        const solData: JupiterPriceResponse = await solResponse.json()
        fetchedSolPrice = solData.data?.[SOL_MINT]?.price || 0
      }

      // Fallback for SOL price
      if (fetchedSolPrice === 0) {
        try {
          const fallbackResponse = await fetch("/api/price/sol")
          const fallbackData = await fallbackResponse.json()
          fetchedSolPrice = fallbackData.data?.price || 150
        } catch {
          fetchedSolPrice = 150
        }
      }
      
      setSolPriceUsd(fetchedSolPrice)

      // Batch fetch token prices (max 100 per request)
      const batchSize = 100
      const priceMap = new Map<string, { priceSol: number; priceUsd: number }>()

      for (let i = 0; i < mintAddresses.length; i += batchSize) {
        const batch = mintAddresses.slice(i, i + batchSize)
        const ids = batch.join(",")
        
        try {
          const response = await fetch(`${JUPITER_PRICE_API}?ids=${ids}`)
          
          if (response.ok) {
            const data: JupiterPriceResponse = await response.json()
            
            for (const mint of batch) {
              const priceUsd = data.data?.[mint]?.price || 0
              const priceSol = fetchedSolPrice > 0 ? priceUsd / fetchedSolPrice : 0
              priceMap.set(mint, { priceSol, priceUsd })
            }
          }
        } catch (err) {
          console.warn("[useBatchLivePrices] Batch fetch failed:", err)
          // Set zeros for failed batch
          for (const mint of batch) {
            priceMap.set(mint, { priceSol: 0, priceUsd: 0 })
          }
        }
      }

      setPrices(priceMap)
      setLastUpdated(Date.now())
      setError(null)
    } catch (err) {
      console.warn("[useBatchLivePrices] Failed:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch prices")
    } finally {
      setIsLoading(false)
    }
  }, [mintAddresses])

  // Fetch on mount and when addresses change
  useEffect(() => {
    fetchBatchPrices()

    const interval = setInterval(fetchBatchPrices, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchBatchPrices])

  return {
    prices,
    solPriceUsd,
    isLoading,
    error,
    lastUpdated,
  }
}

// ============================================================================
// HOOK: useSolPrice
// ============================================================================

interface SolPriceResult {
  price: number
  isLoading: boolean
  error: string | null
  source: string
}

/**
 * Simple hook for just SOL price
 * 
 * @returns SolPriceResult with current SOL/USD price
 */
export function useSolPrice(): SolPriceResult {
  const [price, setPrice] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [source, setSource] = useState("none")

  const fetchSolPrice = useCallback(async () => {
    try {
      // Try internal API first (uses aggregated sources)
      const response = await fetch("/api/price/sol")
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data?.price) {
          setPrice(data.data.price)
          setSource(data.data.source || "aggregated")
          setError(null)
          return
        }
      }

      // Fallback to Jupiter direct
      const jupResponse = await fetch(`${JUPITER_PRICE_API}?ids=${SOL_MINT}`)
      if (jupResponse.ok) {
        const jupData: JupiterPriceResponse = await jupResponse.json()
        const jupPrice = jupData.data?.[SOL_MINT]?.price
        if (jupPrice) {
          setPrice(jupPrice)
          setSource("jupiter")
          setError(null)
          return
        }
      }

      throw new Error("All price sources failed")
    } catch (err) {
      console.warn("[useSolPrice] Failed:", err)
      setError(err instanceof Error ? err.message : "Failed to fetch SOL price")
      // Keep last known price
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSolPrice()

    const interval = setInterval(fetchSolPrice, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchSolPrice])

  return { price, isLoading, error, source }
}

