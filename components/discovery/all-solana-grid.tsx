"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import { motion } from "framer-motion"
import { RefreshCw, TrendingUp, TrendingDown, ExternalLink, Copy } from "lucide-react"
import { cn } from "@/lib/utils"

interface LiveToken {
  symbol: string
  name: string
  address: string
  price: number
  priceChange24h: number
  priceChange1h?: number
  volume24h: number
  volume1h?: number
  liquidity: number
  marketCap: number
  pairCreatedAt: number
  logo: string
  txns24h: { buys: number; sells: number }
  txns1h?: { buys: number; sells: number }
  source?: string
}

interface AllSolanaGridProps {
  source?: 'all' | 'trending'
}

const POLL_INTERVAL = 15000 // 15 seconds for live feel
const MAX_TOKENS = 40

export function AllSolanaGrid({ source = 'all' }: AllSolanaGridProps) {
  const [tokens, setTokens] = useState<LiveToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(15)
  const lastFetchRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  const fetchTokens = useCallback(async (showRefresh = false) => {
    // Prevent too frequent fetches
    const now = Date.now()
    if (now - lastFetchRef.current < 5000 && tokens.length > 0) {
      return
    }
    lastFetchRef.current = now

    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    if (showRefresh) setIsRefreshing(true)

    try {
      const endpoint = source === 'trending' 
        ? '/api/tokens/trending' 
        : '/api/tokens/live?limit=40'
      
      const res = await fetch(endpoint, {
        signal: abortControllerRef.current.signal,
        cache: 'no-store',
      })
      
      if (!res.ok) throw new Error('Failed to fetch')
      
      const data = await res.json()
      
      if (data.success && data.data) {
        setTokens(data.data.slice(0, MAX_TOKENS))
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return // Ignore abort errors
      }
      console.error('Error fetching tokens:', error)
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [source, tokens.length])

  useEffect(() => {
    // Initial fetch
    fetchTokens()
    
    // Set up polling
    const pollInterval = setInterval(() => {
      fetchTokens()
      setCountdown(15)
    }, POLL_INTERVAL)

    // Countdown timer
    const countdownInterval = setInterval(() => {
      setCountdown(prev => prev > 0 ? prev - 1 : 15)
    }, 1000)

    return () => {
      clearInterval(pollInterval)
      clearInterval(countdownInterval)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchTokens])

  // Re-fetch when source changes
  useEffect(() => {
    setIsLoading(true)
    setTokens([])
    fetchTokens()
  }, [source])

  const handleManualRefresh = () => {
    setCountdown(15)
    fetchTokens(true)
  }

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 1500)
  }

  const formatPrice = (price: number) => {
    if (!price || price === 0) return '$0'
    if (price < 0.0000001) return `$${price.toExponential(1)}`
    if (price < 0.00001) return `$${price.toExponential(2)}`
    if (price < 0.001) return `$${price.toFixed(6)}`
    if (price < 1) return `$${price.toFixed(4)}`
    if (price < 100) return `$${price.toFixed(2)}`
    return `$${price.toFixed(0)}`
  }

  const formatCompact = (num: number) => {
    if (!num || num === 0) return '$0'
    if (num >= 1_000_000_000) return `$${(num / 1_000_000_000).toFixed(1)}B`
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(1)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(0)}K`
    return `$${num.toFixed(0)}`
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
        {[...Array(18)].map((_, i) => (
          <div key={i} className="h-[120px] skeleton rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {/* Minimal Header */}
      <div className="flex items-center justify-end gap-3">
        <span className="text-[10px] text-[var(--text-dim)] tabular-nums">
          {countdown}s
        </span>
        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="p-1.5 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all disabled:opacity-50"
        >
          <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-muted)]", isRefreshing && "animate-spin")} />
        </button>
      </div>

      {/* Compact Token Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-2">
        {tokens.map((token, index) => {
          const isPositive = token.priceChange24h >= 0
          const buyRatio = token.txns24h.buys + token.txns24h.sells > 0 
            ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100 
            : 50

          return (
            <motion.div
              key={`${token.address}-${index}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.3) }}
            >
              <Link href={`/token/${token.address}`}>
                <div className="group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/40 rounded-lg p-2.5 transition-all cursor-pointer">
                  {/* Header */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="w-8 h-8 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
                      <img
                        src={token.logo}
                        alt={token.symbol}
                        className="w-full h-full object-cover"
                        loading="lazy"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 
                            `https://ui-avatars.com/api/?name=${token.symbol}&background=1a1a1a&color=fff&size=32`
                        }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className="font-bold text-xs text-[var(--text-primary)] truncate">
                          ${token.symbol}
                        </span>
                      </div>
                      <div className={cn(
                        "text-xs font-semibold flex items-center gap-0.5",
                        isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
                      )}>
                        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {isPositive ? '+' : ''}{token.priceChange24h?.toFixed(1) || '0'}%
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-2 gap-1.5 mb-2 text-[9px]">
                    <div className="bg-[var(--bg-secondary)] rounded px-1.5 py-1">
                      <div className="text-[var(--text-dim)]">Price</div>
                      <div className="text-[var(--text-primary)] font-medium truncate">{formatPrice(token.price)}</div>
                    </div>
                    <div className="bg-[var(--bg-secondary)] rounded px-1.5 py-1">
                      <div className="text-[var(--text-dim)]">MC</div>
                      <div className="text-[var(--text-primary)] font-medium">{formatCompact(token.marketCap)}</div>
                    </div>
                  </div>

                  {/* Buy/Sell Pressure */}
                  <div className="mb-2">
                    <div className="flex items-center justify-between text-[8px] mb-0.5">
                      <span className="text-[var(--green)]">{token.txns24h.buys || 0}</span>
                      <span className="text-[var(--red)]">{token.txns24h.sells || 0}</span>
                    </div>
                    <div className="h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                      <div className="h-full bg-[var(--green)]" style={{ width: `${buyRatio}%` }} />
                      <div className="h-full bg-[var(--red)]" style={{ width: `${100 - buyRatio}%` }} />
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-1">
                    <button
                      onClick={(e) => copyAddress(token.address, e)}
                      className={cn(
                        "flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-medium transition-all",
                        copiedAddress === token.address
                          ? "bg-[var(--green)] text-[var(--ocean-deep)]"
                          : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
                      )}
                    >
                      <Copy className="w-2.5 h-2.5" />
                      {copiedAddress === token.address ? '✓' : 'CA'}
                    </button>
                    <a
                      href={`https://dexscreener.com/solana/${token.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="flex-1 flex items-center justify-center gap-0.5 py-1 rounded text-[9px] font-medium bg-[var(--aqua-primary)] text-[var(--ocean-deep)] hover:bg-[var(--aqua-secondary)] transition-all"
                    >
                      Chart
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              </Link>
            </motion.div>
          )
        })}
      </div>

      {tokens.length === 0 && !isLoading && (
        <div className="card p-8 text-center">
          <RefreshCw className="w-8 h-8 mx-auto mb-3 text-[var(--text-muted)]" />
          <p className="text-sm text-[var(--text-muted)] mb-3">No tokens found</p>
          <button onClick={handleManualRefresh} className="btn-primary text-sm">
            Refresh
          </button>
        </div>
      )}
    </div>
  )
}
