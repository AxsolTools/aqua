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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-[280px] skeleton rounded-lg" />
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {tokens.map((token, index) => {
        const progress = getMigrationProgress(token)
        const isLive = token.stage === "bonding"
        const isMigrated = token.stage === "migrated"
        const isPositive = (token.change_24h || 0) >= 0

        return (
          <motion.div
            key={token.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: index * 0.02 }}
          >
            <Link href={`/token/${token.mint_address}`}>
              <div className="card-interactive overflow-hidden">
                {/* Token Image */}
                <div className="relative aspect-square bg-[var(--bg-secondary)]">
                  {token.image_url ? (
                    <Image src={token.image_url || "/placeholder.svg"} alt={token.name} fill className="object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-4xl font-bold text-[var(--text-dim)]">{token.symbol?.slice(0, 2)}</span>
                    </div>
                  )}

                  {/* Badges */}
                  {isLive && <div className="absolute top-2 left-2 badge badge-live">LIVE</div>}
                  {isMigrated && <div className="absolute top-2 left-2 badge badge-migrated">MIGRATED</div>}
                </div>

                {/* Token Info */}
                <div className="p-3">
                  {/* Name & Symbol */}
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0 flex-1">
                      <h3 className="font-semibold text-sm text-[var(--text-primary)] truncate">{token.name}</h3>
                      <p className="text-xs text-[var(--text-muted)]">{token.symbol}</p>
                    </div>
                  </div>

                  {/* Creator & Time */}
                  <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] mb-2">
                    <span className="text-[var(--green)]">●</span>
                    <span className="font-mono">{formatAddress(token.creator_wallet || "")}</span>
                    <span>·</span>
                    <span>{formatTimeAgo(token.created_at)}</span>
                  </div>

                  {/* Market Cap Row */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-[var(--text-primary)]">
                      MC {formatMarketCap(token.market_cap_usd || 0)}
                    </span>
                    <span
                      className={cn("text-xs font-medium", isPositive ? "text-[var(--green)]" : "text-[var(--red)]")}
                    >
                      {formatChange(token.change_24h || 0)}
                    </span>
                  </div>

                  {/* Progress Bar */}
                  <div className="progress-bar">
                    <div
                      className={cn("progress-fill", isPositive ? "bg-[var(--green)]" : "bg-[var(--red)]")}
                      style={{ width: `${progress}%` }}
                    />
                  </div>

                  {/* Description */}
                  {token.description && (
                    <p className="text-xs text-[var(--text-muted)] mt-2 line-clamp-2">{token.description}</p>
                  )}
                </div>
              </div>
            </Link>
          </motion.div>
        )
      })}
    </div>
  )
}
