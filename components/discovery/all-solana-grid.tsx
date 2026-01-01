"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { RefreshCw, Clock, TrendingUp, TrendingDown, ExternalLink, Copy, Flame } from "lucide-react"
import { cn } from "@/lib/utils"

interface LiveToken {
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

interface AllSolanaGridProps {
  source?: 'all' | 'pumpfun' | 'trending' | 'latest'
}

export function AllSolanaGrid({ source = 'all' }: AllSolanaGridProps) {
  const [tokens, setTokens] = useState<LiveToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(30)

  const fetchTokens = useCallback(async () => {
    try {
      const res = await fetch(`/api/tokens/live?source=${source}&limit=24`)
      const data = await res.json()
      
      if (data.success) {
        setTokens(data.data)
        setLastUpdate(new Date())
      }
    } catch (error) {
      console.error('Error fetching tokens:', error)
    } finally {
      setIsLoading(false)
    }
  }, [source])

  useEffect(() => {
    fetchTokens()
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(() => {
      fetchTokens()
      setCountdown(30)
    }, 30000)

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setCountdown(prev => prev > 0 ? prev - 1 : 30)
    }, 1000)

    return () => {
      clearInterval(interval)
      clearInterval(countdownInterval)
    }
  }, [fetchTokens])

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const formatPrice = (price: number) => {
    if (price < 0.00001) return price.toExponential(2)
    if (price < 0.001) return price.toFixed(6)
    if (price < 1) return price.toFixed(4)
    if (price < 100) return price.toFixed(2)
    return price.toFixed(0)
  }

  const formatMarketCap = (mc: number) => {
    if (mc >= 1_000_000_000) return `$${(mc / 1_000_000_000).toFixed(2)}B`
    if (mc >= 1_000_000) return `$${(mc / 1_000_000).toFixed(2)}M`
    if (mc >= 1_000) return `$${(mc / 1_000).toFixed(0)}K`
    return `$${mc.toFixed(0)}`
  }

  const formatVolume = (vol: number) => {
    if (vol >= 1_000_000) return `$${(vol / 1_000_000).toFixed(2)}M`
    if (vol >= 1_000) return `$${(vol / 1_000).toFixed(1)}K`
    return `$${vol.toFixed(0)}`
  }

  const getTokenAge = (createdAt: number) => {
    const diff = Date.now() - createdAt
    const minutes = Math.floor(diff / 60000)
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(diff / 86400000)
    
    if (minutes < 60) return `${minutes}m`
    if (hours < 24) return `${hours}h`
    if (days < 7) return `${days}d`
    return `${Math.floor(days / 7)}w`
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="h-6 w-40 skeleton rounded" />
          <div className="h-6 w-24 skeleton rounded" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-[160px] skeleton rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
            <span className="text-sm text-[var(--text-secondary)]">
              {tokens.length} tokens • Live from DexScreener
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--text-muted)]">
            Refresh in {countdown}s
          </span>
          <button
            onClick={() => {
              fetchTokens()
              setCountdown(30)
            }}
            className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all"
          >
            <RefreshCw className={cn("w-4 h-4 text-[var(--text-muted)]", isLoading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Token Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {tokens.map((token, index) => {
          const isPositive = token.priceChange24h >= 0
          const age = token.pairCreatedAt ? getTokenAge(token.pairCreatedAt) : ''
          const isNew = token.pairCreatedAt && (Date.now() - token.pairCreatedAt) < 3600000 // Less than 1 hour
          const buyRatio = token.txns24h.buys + token.txns24h.sells > 0 
            ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100 
            : 50

          return (
            <motion.div
              key={token.address}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: index * 0.02 }}
            >
              <Link href={`/token/${token.address}`}>
                <div className="card-interactive overflow-hidden group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/50 transition-all p-3">
                  {/* Header Row */}
                  <div className="flex items-start gap-3 mb-3">
                    {/* Token Logo */}
                    <div className="relative w-12 h-12 rounded-xl bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
                      <img
                        src={token.logo}
                        alt={token.symbol}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 
                            `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff&bold=true`
                        }}
                      />
                      {isNew && (
                        <div className="absolute -top-1 -right-1 p-0.5 bg-orange-500 rounded-full">
                          <Flame className="w-2.5 h-2.5 text-white" />
                        </div>
                      )}
                    </div>

                    {/* Token Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-sm text-[var(--text-primary)] truncate">
                          ${token.symbol}
                        </h3>
                        {token.isPumpFun && (
                          <span className="px-1.5 py-0.5 text-[8px] font-bold rounded bg-purple-500/20 text-purple-400 flex-shrink-0">
                            PUMP
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] truncate">{token.name}</p>
                      {age && (
                        <div className="flex items-center gap-1 mt-0.5 text-[10px] text-[var(--text-dim)]">
                          <Clock className="w-3 h-3" />
                          <span>{age} old</span>
                        </div>
                      )}
                    </div>

                    {/* Price Change */}
                    <div className="text-right flex-shrink-0">
                      <div className={cn(
                        "text-sm font-bold",
                        isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
                      )}>
                        {isPositive ? '+' : ''}{token.priceChange24h.toFixed(1)}%
                      </div>
                      <div className="flex items-center justify-end gap-0.5">
                        {isPositive ? (
                          <TrendingUp className="w-3 h-3 text-[var(--green)]" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-[var(--red)]" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats Row */}
                  <div className="grid grid-cols-3 gap-2 mb-3 text-[10px]">
                    <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
                      <div className="text-[var(--text-dim)]">Price</div>
                      <div className="text-[var(--text-primary)] font-medium">${formatPrice(token.price)}</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
                      <div className="text-[var(--text-dim)]">MC</div>
                      <div className="text-[var(--text-primary)] font-medium">{formatMarketCap(token.marketCap)}</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded-lg p-2">
                      <div className="text-[var(--text-dim)]">Vol 24h</div>
                      <div className="text-[var(--text-primary)] font-medium">{formatVolume(token.volume24h)}</div>
                    </div>
                  </div>

                  {/* Buy Pressure Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-[10px] mb-1">
                      <span className="text-[var(--green)]">{token.txns24h.buys} buys</span>
                      <span className="text-[var(--red)]">{token.txns24h.sells} sells</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                      <div 
                        className="h-full bg-[var(--green)] transition-all"
                        style={{ width: `${buyRatio}%` }}
                      />
                      <div 
                        className="h-full bg-[var(--red)]"
                        style={{ width: `${100 - buyRatio}%` }}
                      />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => copyAddress(token.address, e)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-medium transition-all",
                        copiedAddress === token.address
                          ? "bg-[var(--green)] text-[var(--ocean-deep)]"
                          : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                      )}
                    >
                      <Copy className="w-3 h-3" />
                      {copiedAddress === token.address ? 'Copied!' : 'CA'}
                    </button>
                    <a
                      href={`https://dexscreener.com/solana/${token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-medium bg-[var(--aqua-primary)] text-[var(--ocean-deep)] hover:bg-[var(--aqua-secondary)] transition-all"
                    >
                      Chart
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>

      {tokens.length === 0 && !isLoading && (
        <div className="card p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
            <RefreshCw className="w-8 h-8 text-[var(--text-muted)]" />
          </div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No tokens found</h3>
          <p className="text-sm text-[var(--text-muted)] mb-4">Try refreshing or check back later</p>
          <button 
            onClick={fetchTokens}
            className="btn-primary"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}

