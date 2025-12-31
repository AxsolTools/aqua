"use client"

import { useState } from "react"
import Link from "next/link"
import type { Token } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useLivePrice } from "@/hooks/use-live-price"

interface Creator {
  id: string
  username: string | null
  avatar_url: string | null
  wallet_address: string
}

interface TokenHeaderProps {
  token: Token
  creator?: Creator | null
}

export function TokenHeader({ token, creator }: TokenHeaderProps) {
  const { activeWallet, isAuthenticated } = useAuth()
  const [copied, setCopied] = useState(false)
  const [isWatchlisted, setIsWatchlisted] = useState(false)

  // Fetch live prices with 30-second polling
  const { priceUsd, marketCap, isLoading: priceLoading, source: priceSource } = useLivePrice(
    token.mint_address,
    token.total_supply,
    token.decimals || 6
  )

  // Use live prices if available, fallback to database values
  const displayPrice = priceUsd > 0 ? priceUsd : (token.price_usd || (token.price_sol || 0) * 150)
  const displayMarketCap = marketCap > 0 ? marketCap : (token.market_cap || 0)

  const copyAddress = () => {
    navigator.clipboard.writeText(token.mint_address)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const toggleWatchlist = async () => {
    if (!activeWallet) return

    const supabase = createClient()

    if (isWatchlisted) {
      await supabase.from("watchlist").delete().eq("session_id", activeWallet.session_id).eq("token_id", token.id)
    } else {
      await supabase.from("watchlist").insert({ 
        session_id: activeWallet.session_id, 
        token_id: token.id,
        token_address: token.mint_address
      })
    }

    setIsWatchlisted(!isWatchlisted)
  }

  const formatPrice = (price: number | null | undefined) => {
    const p = price || 0
    if (p < 0.0001) return `$${p.toExponential(2)}`
    if (p < 1) return `$${p.toFixed(6)}`
    return `$${p.toFixed(4)}`
  }

  const formatMarketCap = (mc: number | null | undefined) => {
    const m = mc || 0
    if (m >= 1_000_000) return `$${(m / 1_000_000).toFixed(2)}M`
    if (m >= 1_000) return `$${(m / 1_000).toFixed(2)}K`
    return `$${m.toFixed(2)}`
  }

  const formatWallet = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`

  return (
    <GlassPanel className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        {/* Token Identity */}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center overflow-hidden">
            {token.image_url ? (
              <img
                src={token.image_url || "/placeholder.svg"}
                alt={token.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-2xl font-bold text-[var(--ocean-deep)]">{token.symbol?.charAt(0)}</span>
            )}
          </div>
          <div>
            <div className="flex items-center gap-3 mb-1">
              <h1 className="text-2xl font-bold text-[var(--text-primary)]">{token.name}</h1>
              <span
                className={cn(
                  "px-2 py-1 rounded text-xs font-medium",
                  token.stage === "migrated"
                    ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]"
                    : "bg-[var(--warm-orange)]/20 text-[var(--warm-orange)]",
                )}
              >
                {token.stage === "migrated" ? "Migrated" : "Bonding"}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-[var(--text-secondary)]">${token.symbol}</span>
              <button
                onClick={copyAddress}
                className="flex items-center gap-1 px-2 py-1 rounded bg-[var(--ocean-surface)] text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
              >
                <span className="font-mono">
                  {token.mint_address.slice(0, 4)}...{token.mint_address.slice(-4)}
                </span>
                {copied ? (
                  <svg className="w-3 h-3 text-[var(--aqua-primary)]" viewBox="0 0 16 16" fill="currentColor">
                    <path d="M13.78 4.22a.75.75 0 010 1.06l-7.25 7.25a.75.75 0 01-1.06 0L2.22 9.28a.75.75 0 011.06-1.06L6 10.94l6.72-6.72a.75.75 0 011.06 0z" />
                  </svg>
                ) : (
                  <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="5" y="5" width="8" height="8" rx="1" />
                    <path d="M3 11V3h8" strokeLinecap="round" />
                  </svg>
                )}
              </button>
              {creator && (
                <>
                  <span className="text-[var(--text-muted)]">•</span>
                  <Link
                    href={`/profile/${creator.wallet_address}`}
                    className="flex items-center gap-1.5 px-2 py-1 rounded bg-[var(--ocean-surface)] hover:bg-[var(--ocean-surface)]/80 transition-colors group"
                  >
                    <Avatar className="w-4 h-4">
                      <AvatarImage src={creator.avatar_url || undefined} alt={creator.username || "Creator"} />
                      <AvatarFallback className="text-[8px] bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] text-white">
                        {creator.username?.charAt(0).toUpperCase() || creator.wallet_address.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-[var(--text-muted)] group-hover:text-[var(--text-primary)] transition-colors">
                      {creator.username || formatWallet(creator.wallet_address)}
                    </span>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Price & Stats */}
        <div className="flex items-center gap-6 flex-wrap">
          {/* Price - LIVE */}
          <div>
            <div className="flex items-center gap-2">
              <p className="text-2xl md:text-3xl font-bold text-[var(--text-primary)]">{formatPrice(displayPrice)}</p>
              {priceLoading && (
                <div className="w-3 h-3 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
              )}
              {!priceLoading && priceUsd > 0 && (
                <span className="px-1.5 py-0.5 rounded text-[9px] font-medium bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] uppercase">
                  Live
                </span>
              )}
            </div>
            <p
              className={cn("text-sm font-medium", (token.change_24h || 0) >= 0 ? "text-emerald-400" : "text-red-400")}
            >
              {(token.change_24h || 0) >= 0 ? "+" : ""}
              {(token.change_24h || 0).toFixed(2)}% (24h)
            </p>
          </div>

          <div className="h-10 w-px bg-[var(--glass-border)] hidden md:block" />

          {/* Key Stats Grid */}
          <div className="grid grid-cols-4 gap-4 md:gap-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Market Cap</p>
              <p className="text-sm md:text-base font-bold text-[var(--aqua-primary)]">
                {formatMarketCap(displayMarketCap)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Holders</p>
              <p className="text-sm md:text-base font-bold text-[var(--warm-pink)]">
                {(token.holders || 0).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Volume 24h</p>
              <p className="text-sm md:text-base font-semibold text-[var(--text-primary)]">
                {formatMarketCap(token.volume_24h || 0)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-0.5">Liquidity</p>
              <p className="text-sm md:text-base font-semibold text-[var(--text-primary)]">
                {formatMarketCap(token.current_liquidity || 0)}
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {isAuthenticated && (
              <button
                onClick={toggleWatchlist}
                className={cn(
                  "p-2 rounded-lg border transition-colors",
                  isWatchlisted
                    ? "border-[var(--aqua-primary)] bg-[var(--aqua-subtle)]"
                    : "border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50",
                )}
              >
                <svg
                  className={cn(
                    "w-5 h-5",
                    isWatchlisted ? "text-[var(--aqua-primary)]" : "text-[var(--text-secondary)]",
                  )}
                  viewBox="0 0 20 20"
                  fill={isWatchlisted ? "currentColor" : "none"}
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <path d="M10 3l2.5 5 5.5.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.5-.8z" />
                </svg>
              </button>
            )}

            {/* Social Links - accessed as direct properties */}
            {(token.twitter || token.telegram || token.website) && (
              <div className="flex items-center gap-1">
                {token.twitter && (
                  <a
                    href={token.twitter}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                    </svg>
                  </a>
                )}
                {token.telegram && (
                  <a
                    href={token.telegram}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50 transition-colors"
                  >
                    <svg className="w-5 h-5 text-[var(--text-secondary)]" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 00-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z" />
                    </svg>
                  </a>
                )}
                {token.website && (
                  <a
                    href={token.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg border border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50 transition-colors"
                  >
                    <svg
                      className="w-5 h-5 text-[var(--text-secondary)]"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                    </svg>
                  </a>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </GlassPanel>
  )
}
