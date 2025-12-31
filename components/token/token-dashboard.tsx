"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Token, Trade } from "@/lib/types/database"
import { TokenHeader } from "@/components/token/token-header"
import { TokenChart } from "@/components/token/token-chart"
import { TradePanel } from "@/components/token/trade-panel"
import { MetricsGrid } from "@/components/token/metrics-grid"
import { LiveFeed } from "@/components/token/live-feed"
import { TokenInfo } from "@/components/token/token-info"
import { TransactionHistory } from "@/components/token/transaction-history"
import { BoostSection } from "@/components/token/boost-section"
import { VoteBoostPanel } from "@/components/token/vote-boost-panel"
import { TokenPourOverlay } from "@/components/token/token-pour-overlay"
import { TokenChat } from "@/components/token/token-chat"
import { TokenComments } from "@/components/token/token-comments"
import Link from "next/link"

interface TokenDashboardProps {
  address: string
}

export function TokenDashboard({ address }: TokenDashboardProps) {
  const [token, setToken] = useState<Token | null>(null)
  const [trades, setTrades] = useState<Trade[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let tokenId: string | null = null

    const fetchData = async (retryCount = 0) => {
      const { data: tokenData, error: tokenError } = await supabase
        .from("tokens")
        .select("*, token_parameters(*)")
        .eq("mint_address", address)
        .single()

      if (tokenError) {
        // If token not found and we haven't retried, wait and retry (token might be newly created)
        if (retryCount < 3 && tokenError.code === 'PGRST116') {
          console.log(`[TOKEN] Token not found, retrying in ${(retryCount + 1) * 1000}ms... (attempt ${retryCount + 1}/3)`)
          await new Promise(resolve => setTimeout(resolve, (retryCount + 1) * 1000))
          return fetchData(retryCount + 1)
        }
        
        setError("Token not found")
        setIsLoading(false)
        return
      }

      // Merge token_parameters metrics into token object for easy access
      const tokenWithMetrics = {
        ...tokenData,
        pour_rate: tokenData.token_parameters?.pour_rate_percent ?? 0,
        evaporation_rate: tokenData.token_parameters?.evaporation_rate_percent ?? 0,
        total_evaporated: tokenData.token_parameters?.total_evaporated ?? 0,
      } as Token
      setToken(tokenWithMetrics)
      tokenId = tokenData.id

      const { data: tradesData } = await supabase
        .from("trades")
        .select("*")
        .eq("token_id", tokenData.id)
        .order("created_at", { ascending: false })
        .limit(50)

      if (tradesData) {
        setTrades(tradesData as Trade[])
      }

      setIsLoading(false)

      // CRITICAL FIX: Set up real-time subscription AFTER token data is loaded
      // This ensures tokenId is available for the filter
      channel = supabase
        .channel(`token-dashboard-${tokenData.id}`)
        .on("postgres_changes", { 
          event: "INSERT", 
          schema: "public", 
          table: "trades",
          filter: `token_id=eq.${tokenData.id}` 
        }, (payload) => {
          const newTrade = payload.new as Trade
          setTrades((prev) => [newTrade, ...prev].slice(0, 50))
        })
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "tokens", filter: `mint_address=eq.${address}` },
          (payload) => {
            // Preserve token_parameters when updating from realtime
            setToken(prev => ({
              ...(payload.new as Token),
              token_parameters: prev?.token_parameters,
              pour_rate: prev?.pour_rate,
              evaporation_rate: prev?.evaporation_rate,
              total_evaporated: prev?.total_evaporated,
            }))
          },
        )
        // Subscribe to liquidity_history for real-time pour rate updates
        .on("postgres_changes", {
          event: "INSERT",
          schema: "public",
          table: "liquidity_history",
          filter: `token_id=eq.${tokenData.id}`
        }, () => {
          // Trigger a refresh of metrics when liquidity is added
          console.log('[DASHBOARD] Liquidity update detected')
        })
        .subscribe()
    }

    fetchData()

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [address])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner" />
      </div>
    )
  }

  if (error || !token) {
    return (
      <div className="card p-8 max-w-md mx-auto text-center">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Token Not Found</h2>
        <p className="text-sm text-[var(--text-muted)] mb-4 font-mono break-all">{address}</p>
        <Link href="/" className="btn-primary">
          Back to Discover
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Pour effect overlay */}
      <TokenPourOverlay tokenId={token.id} tokenSymbol={token.symbol} creatorWallet={token.creator_wallet || ""} />

      {/* Token Header - Compact */}
      <TokenHeader token={token} />

      {/* Main Grid: Chart + Trade Panel + Chat (3 columns on XL) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        {/* Chart - Takes most space */}
        <div className="lg:col-span-7 xl:col-span-8">
          <TokenChart mintAddress={token.mint_address} tokenSymbol={token.symbol} />
        </div>

        {/* Right Side: Trade Panel + Live Chat stacked */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-3">
          <TradePanel token={token} />
          {/* Live Chat moved up here for better visibility */}
          <TokenChat tokenAddress={token.mint_address} />
        </div>
      </div>

      {/* Second Row: Live Feed + Token Info + Community (compact row) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* Live Feed - Compact */}
        <div className="xl:col-span-1">
          <LiveFeed trades={trades} tokenSymbol={token.symbol} />
        </div>
        
        {/* Token Info - Compact */}
        <div className="xl:col-span-1">
          <TokenInfo token={token} />
        </div>

        {/* Community - Vote & Boost combined compact */}
        <div className="xl:col-span-2">
          <VoteBoostPanel tokenAddress={token.mint_address} tokenName={token.name} />
        </div>
      </div>

      {/* Metrics Row - Keep as is but more compact */}
      <MetricsGrid token={token} />

      {/* Comments & Boost Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <TokenComments tokenAddress={token.mint_address} />
        <BoostSection tokenAddress={token.mint_address} />
      </div>

      {/* Transaction History - at the bottom */}
      <TransactionHistory tokenAddress={token.mint_address} />
    </div>
  )
}

