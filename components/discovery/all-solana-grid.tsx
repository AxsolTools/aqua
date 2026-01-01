"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { RefreshCw, TrendingUp, TrendingDown, ExternalLink, Copy, Clock } from "lucide-react"
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
const MAX_TOKENS = 100 // Increased to 100
const TOKENS_PER_PAGE = 20

export function AllSolanaGrid({ source = 'all' }: AllSolanaGridProps) {
  const [tokens, setTokens] = useState<LiveToken[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [countdown, setCountdown] = useState(15)
  const [currentPage, setCurrentPage] = useState(1)
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
        ? `/api/tokens/trending?limit=${MAX_TOKENS}` 
        : `/api/tokens/live?limit=${MAX_TOKENS}`
      
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
    setCurrentPage(1)
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

  const getTokenAge = (timestamp: number) => {
    if (!timestamp) return ''
    const diff = Date.now() - timestamp
    const hours = Math.floor(diff / 3600000)
    const days = Math.floor(hours / 24)
    
    if (days > 0) return `${days}d`
    if (hours > 0) return `${hours}h`
    return `${Math.floor(diff / 60000)}m`
  }

  // Pagination
  const totalPages = Math.ceil(tokens.length / TOKENS_PER_PAGE)
  const paginatedTokens = tokens.slice((currentPage - 1) * TOKENS_PER_PAGE, currentPage * TOKENS_PER_PAGE)

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {[...Array(15)].map((_, i) => (
          <div key={i} className="h-[140px] skeleton rounded-lg" />
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Minimal Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--text-muted)]">
          {tokens.length} tokens
        </span>
        <div className="flex items-center gap-3">
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
      </div>

      {/* Token Grid - Matching Aquarius Tab Layout */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        {paginatedTokens.map((token, index) => {
          const isPositive = token.priceChange24h >= 0
          const buyRatio = token.txns24h.buys + token.txns24h.sells > 0 
            ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100 
            : 50
          const age = getTokenAge(token.pairCreatedAt)

          return (
            <motion.div
              key={`${token.address}-${index}`}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.15, delay: Math.min(index * 0.02, 0.3) }}
            >
              <Link href={`/token/${token.address}`}>
                <div className="card-interactive overflow-hidden group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/50 transition-all">
                  {/* Horizontal layout: Image on left, info on right - matching Aquarius */}
                  <div className="flex gap-3 p-3">
                    {/* Token Image - Square, left side */}
                    <div className="relative w-20 h-20 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
                      <Image
                        src={token.logo}
                        alt={token.symbol}
                        fill
                        className="object-cover"
                        unoptimized
                        onError={(e) => {
                          (e.target as HTMLImageElement).src = 
                            `https://ui-avatars.com/api/?name=${token.symbol}&background=0a0a0a&color=00d9ff&size=80`
                        }}
                      />
                    </div>

                    {/* Token Info - Right side */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      {/* Top: Name + Symbol + Age */}
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-bold text-sm text-[var(--text-primary)] truncate">{token.name}</h3>
                          {age && (
                            <span className="flex items-center gap-0.5 px-1.5 py-0.5 text-[8px] font-medium rounded bg-[var(--bg-secondary)] text-[var(--text-dim)] flex-shrink-0">
                              <Clock className="w-2.5 h-2.5" />
                              {age}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--text-muted)]">${token.symbol}</p>
                      </div>

                      {/* Middle: Price + Change */}
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-[var(--text-primary)] font-medium">{formatPrice(token.price)}</span>
                        <span className={cn(
                          "flex items-center gap-0.5 font-semibold",
                          isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
                        )}>
                          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                          {isPositive ? '+' : ''}{token.priceChange24h?.toFixed(1) || '0'}%
                        </span>
                      </div>

                      {/* Bottom: Market Cap + Volume + Buy/Sell Bar */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-muted)]">MC</span>
                        <span className="text-sm font-bold text-[var(--aqua-primary)]">
                          {formatCompact(token.marketCap)}
                        </span>
                        
                        {/* Buy/Sell Pressure Bar */}
                        <div className="flex-1 h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                          <div className="h-full bg-[var(--green)]" style={{ width: `${buyRatio}%` }} />
                          <div className="h-full bg-[var(--red)]" style={{ width: `${100 - buyRatio}%` }} />
                        </div>
                        
                        {/* Txns */}
                        <span className="text-[10px] text-[var(--text-dim)]">
                          {token.txns24h.buys + token.txns24h.sells}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Quick Actions - Bottom */}
                  <div className="px-3 pb-2 flex gap-1">
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
                      {copiedAddress === token.address ? 'Copied!' : 'Copy CA'}
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

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              currentPage === 1
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
          >
            ← Prev
          </button>
          
          <div className="flex items-center gap-1">
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              let pageNum: number
              if (totalPages <= 5) {
                pageNum = i + 1
              } else if (currentPage <= 3) {
                pageNum = i + 1
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i
              } else {
                pageNum = currentPage - 2 + i
              }
              
              return (
                <button
                  key={pageNum}
                  onClick={() => handlePageChange(pageNum)}
                  className={cn(
                    "w-8 h-8 rounded-lg text-sm font-medium transition-all",
                    currentPage === pageNum
                      ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                      : "bg-white/5 text-white/60 hover:bg-white/10"
                  )}
                >
                  {pageNum}
                </button>
              )
            })}
          </div>
          
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
              currentPage === totalPages
                ? "bg-white/5 text-white/30 cursor-not-allowed"
                : "bg-white/10 text-white/70 hover:bg-white/20"
            )}
          >
            Next →
          </button>
          
          <span className="ml-4 text-xs text-white/40">
            {tokens.length} tokens
          </span>
        </div>
      )}

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
