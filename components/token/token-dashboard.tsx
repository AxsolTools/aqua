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
    const fetchData = async () => {
      const supabase = createClient()

      const { data: tokenData, error: tokenError } = await supabase
        .from("tokens")
        .select("*")
        .eq("mint_address", address)
        .single()

      if (tokenError) {
        setError("Token not found")
        setIsLoading(false)
        return
      }

      setToken(tokenData as Token)

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
    }

    fetchData()

    const supabase = createClient()
    const channel = supabase
      .channel("trades-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "trades" }, (payload) => {
        const newTrade = payload.new as Trade
        setTrades((prev) => [newTrade, ...prev].slice(0, 50))
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "tokens", filter: `mint_address=eq.${address}` },
        (payload) => {
          setToken(payload.new as Token)
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
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
    <div className="space-y-4">
      {/* Pour effect overlay */}
      <TokenPourOverlay tokenId={token.id} tokenSymbol={token.symbol} creatorWallet={token.creator_wallet || ""} />

      {/* Token Header */}
      <TokenHeader token={token} />

      {/* Main Grid: Chart + Trade Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Chart & Live Feed */}
        <div className="xl:col-span-2 space-y-4">
          <TokenChart tokenId={token.id} />
          <LiveFeed trades={trades} tokenSymbol={token.symbol} />
        </div>

        {/* Trade Panel & Token Info */}
        <div className="space-y-4">
          <TradePanel token={token} />
          <TokenInfo token={token} />
        </div>
      </div>

      {/* Metrics */}
      <MetricsGrid token={token} />

      {/* Community */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VoteBoostPanel tokenAddress={token.mint_address} />
        <BoostSection tokenAddress={token.mint_address} />
      </div>

      {/* Transaction History */}
      <TransactionHistory tokenAddress={token.mint_address} />
    </div>
  )
}
