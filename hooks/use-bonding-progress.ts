"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { getPumpPortalMonitor, TradeEvent } from "@/lib/pumpportal/migration-monitor"

interface BondingProgressData {
  progress: number
  vSolInBondingCurve: number
  lastUpdated: number
}

/**
 * Hook to get real-time bonding curve progress for Pump.fun tokens
 * Uses PumpPortal WebSocket to subscribe to token trades and track vSolInBondingCurve
 * Also fetches initial state from pump.fun API
 */
export function useBondingProgress(mintAddresses: string[]) {
  const [progressMap, setProgressMap] = useState<Record<string, BondingProgressData>>({})
  const subscribedRef = useRef<Set<string>>(new Set())
  const fetchedInitialRef = useRef<Set<string>>(new Set())
  const monitorRef = useRef<ReturnType<typeof getPumpPortalMonitor> | null>(null)

  // Handle trade events to update bonding progress
  const handleTrade = useCallback((event: TradeEvent) => {
    if (event.vSolInBondingCurve !== undefined) {
      const migrationThreshold = 85 // SOL threshold for migration
      const progress = Math.min((event.vSolInBondingCurve / migrationThreshold) * 100, 100)
      
      setProgressMap(prev => ({
        ...prev,
        [event.mint]: {
          progress,
          vSolInBondingCurve: event.vSolInBondingCurve!,
          lastUpdated: Date.now(),
        }
      }))
    }
  }, [])

  // Fetch initial bonding curve state from pump.fun API
  const fetchInitialProgress = useCallback(async (mints: string[]) => {
    const mintsToFetch = mints.filter(m => !fetchedInitialRef.current.has(m))
    if (mintsToFetch.length === 0) return

    for (const mint of mintsToFetch) {
      try {
        const response = await fetch(`https://frontend-api.pump.fun/coins/${mint}`)
        if (response.ok) {
          const coin = await response.json()
          if (coin && coin.virtual_sol_reserves !== undefined) {
            const vSol = coin.virtual_sol_reserves || 0
            const migrationThreshold = 85
            const progress = Math.min((vSol / migrationThreshold) * 100, 100)
            
            setProgressMap(prev => ({
              ...prev,
              [mint]: {
                progress,
                vSolInBondingCurve: vSol,
                lastUpdated: Date.now(),
              }
            }))
          }
        }
        fetchedInitialRef.current.add(mint)
      } catch (error) {
        console.debug(`[BONDING-PROGRESS] Failed to fetch initial state for ${mint}:`, error)
        fetchedInitialRef.current.add(mint) // Mark as fetched to avoid retrying
      }
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return // Server-side guard
    
    // Filter to only valid mint addresses
    const validMints = mintAddresses.filter(m => m && m.length > 0)
    if (validMints.length === 0) return

    // Fetch initial progress from pump.fun API
    fetchInitialProgress(validMints)

    // Get or create monitor instance
    if (!monitorRef.current) {
      monitorRef.current = getPumpPortalMonitor()
    }
    const monitor = monitorRef.current

    // Connect if not already connected
    if (!monitor.getIsConnected()) {
      monitor.connect()
    }

    // Register trade handler
    const unsubscribeTrade = monitor.onTrade(handleTrade)

    // Find new mints to subscribe to
    const newMints = validMints.filter(mint => !subscribedRef.current.has(mint))
    
    if (newMints.length > 0) {
      monitor.subscribeTokenTrades(newMints)
      newMints.forEach(mint => subscribedRef.current.add(mint))
    }

    // Cleanup function
    return () => {
      unsubscribeTrade()
      
      // Unsubscribe from tokens we no longer need
      const mintsToUnsubscribe = Array.from(subscribedRef.current).filter(
        mint => !validMints.includes(mint)
      )
      
      if (mintsToUnsubscribe.length > 0) {
        monitor.unsubscribeTokenTrades(mintsToUnsubscribe)
        mintsToUnsubscribe.forEach(mint => subscribedRef.current.delete(mint))
      }
    }
  }, [mintAddresses, handleTrade, fetchInitialProgress])

  // Get progress for a specific mint
  const getProgress = useCallback((mint: string): number | undefined => {
    return progressMap[mint]?.progress
  }, [progressMap])

  return {
    progressMap,
    getProgress,
  }
}

/**
 * Hook for a single token's bonding progress
 */
export function useSingleBondingProgress(mintAddress: string | null) {
  const mints = mintAddress ? [mintAddress] : []
  const { progressMap } = useBondingProgress(mints)
  
  return mintAddress ? progressMap[mintAddress] : undefined
}

