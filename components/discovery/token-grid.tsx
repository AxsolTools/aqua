"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import type { Token } from "@/lib/types/database"
import { cn, formatTimeAgo } from "@/lib/utils"

export function TokenGrid() {
  const [tokens, setTokens] = useState<Token[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      const supabase = createClient()
      const { data: tokenData } = await supabase
        .from("tokens")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(24)

      if (tokenData) {
        setTokens(tokenData as Token[])
      }
      setIsLoading(false)
    }

    fetchData()

    // Real-time subscription
    const supabase = createClient()
    const channel = supabase
      .channel("tokens-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "tokens" }, (payload) => {
        if (payload.eventType === "INSERT") {
          setTokens((prev) => [payload.new as Token, ...prev].slice(0, 24))
        } else if (payload.eventType === "UPDATE") {
          setTokens((prev) => prev.map((t) => (t.id === (payload.new as Token).id ? (payload.new as Token) : t)))
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const formatMarketCap = (mc: number) => {
    if (mc >= 1000000) return `$${(mc / 1000000).toFixed(2)}M`
    if (mc >= 1000) return `$${(mc / 1000).toFixed(1)}K`
    return `$${mc.toFixed(0)}`
  }

  const formatChange = (change: number) => {
    const prefix = change >= 0 ? "+" : ""
    return `${prefix}${change.toFixed(2)}%`
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}`

  const getMigrationProgress = (token: Token) => {
    const threshold = token.migration_threshold || 69000
    const current = token.market_cap_usd || 0
    return Math.min((current / threshold) * 100, 100)
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
        {[...Array(16)].map((_, i) => (
          <div key={i} className="h-[160px] skeleton rounded-lg" />
        ))}
      </div>
    )
  }

  if (tokens.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
          <svg
            className="w-8 h-8 text-[var(--text-muted)]"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          >
            <path d="M12 2C12 2 6 10 6 14C6 18 8.7 22 12 22C15.3 22 18 18 18 14C18 10 12 2 12 2Z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No tokens yet</h3>
        <p className="text-sm text-[var(--text-muted)] mb-6">Be the first to launch a token</p>
        <Link href="/launch" className="btn-primary">
          Launch Token
        </Link>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-2">
      {tokens.map((token, index) => {
        const progress = getMigrationProgress(token)
        const isLive = token.stage === "bonding"
        const isMigrated = token.stage === "migrated"
        const isPositive = (token.change_24h || 0) >= 0

        return (
          <motion.div
            key={token.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2, delay: index * 0.01 }}
          >
            <Link href={`/token/${token.mint_address}`}>
              <div className="card-interactive overflow-hidden group">
                {/* Token Image - Compact */}
                <div className="relative aspect-[4/3] bg-[var(--bg-secondary)]">
                  {token.image_url ? (
                    <Image src={token.image_url || "/placeholder.svg"} alt={token.name} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-2xl font-bold text-[var(--text-dim)]">{token.symbol?.slice(0, 2)}</span>
                    </div>
                  )}

                  {/* Badges - Smaller */}
                  {isLive && <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-[var(--green)] text-white">LIVE</div>}
                  {isMigrated && <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[9px] font-bold rounded bg-[var(--aqua-primary)] text-white">DEX</div>}
                  
                  {/* Change Badge on Image */}
                  <div className={cn(
                    "absolute top-1 right-1 px-1.5 py-0.5 text-[9px] font-bold rounded",
                    isPositive ? "bg-[var(--green)]/90 text-white" : "bg-[var(--red)]/90 text-white"
                  )}>
                    {formatChange(token.change_24h || 0)}
                  </div>
                </div>

                {/* Token Info - Compact */}
                <div className="p-2">
                  {/* Name & Market Cap */}
                  <div className="flex items-center justify-between gap-1 mb-0.5">
                    <h3 className="font-semibold text-xs text-[var(--text-primary)] truncate flex-1">{token.name}</h3>
                    <span className="text-[10px] font-medium text-[var(--aqua-primary)] whitespace-nowrap">
                      {formatMarketCap(token.market_cap_usd || 0)}
                    </span>
                  </div>

                  {/* Symbol & Creator */}
                  <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
                    <span className="font-medium">${token.symbol}</span>
                    <span className="font-mono opacity-70">{formatAddress(token.creator_wallet || "")}</span>
                  </div>

                  {/* Progress Bar - Thinner */}
                  <div className="mt-1.5 h-0.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
                    <div
                      className={cn("h-full transition-all", isPositive ? "bg-[var(--green)]" : "bg-[var(--red)]")}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
