"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Copy,
  BarChart3,
  Flame,
  Clock,
  Zap,
  Shield,
  Activity,
  Droplets,
  DollarSign,
  ArrowUpDown,
  Sparkles,
  Target,
  Gauge,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"

interface TokenData {
  address: string
  symbol: string
  name: string
  price: number
  priceChange24h: number
  priceChange1h: number
  volume24h: number
  volume1h: number
  liquidity: number
  marketCap: number
  fdv: number
  pairCreatedAt: number
  logo: string
  txns24h: { buys: number; sells: number }
  txns1h: { buys: number; sells: number }
  holders?: number
  source?: string
  smartMoneyFlow?: number
  riskScore?: number
  momentumScore?: number
  trendingScore?: number
}

interface AggregatorFilters {
  minLiquidity: number
  minVolume: number
  minMarketCap: number
  maxAge: number
  hideHighRisk: boolean
  sortBy: 'trending' | 'volume' | 'priceChange' | 'marketCap' | 'liquidity' | 'new' | 'momentum'
  sortDir: 'desc' | 'asc'
}

const DEFAULT_FILTERS: AggregatorFilters = {
  minLiquidity: 0,
  minVolume: 0,
  minMarketCap: 0,
  maxAge: 720, // 30 days
  hideHighRisk: false,
  sortBy: 'trending',
  sortDir: 'desc',
}

const TOKENS_PER_PAGE = 20
const MAX_TOKENS = 100
const POLL_INTERVAL = 15000

export function TokenAggregator() {
  const [tokens, setTokens] = useState<TokenData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AggregatorFilters>(DEFAULT_FILTERS)
  const [search, setSearch] = useState("")
  const [countdown, setCountdown] = useState(15)
  const [showFilters, setShowFilters] = useState(false)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [viewMode, setViewMode] = useState<'grid' | 'compact'>('grid')
  const lastFetchRef = useRef<number>(0)
  const abortControllerRef = useRef<AbortController | null>(null)

  // Fetch tokens from API
  const fetchTokens = useCallback(async (showRefresh = false) => {
    const now = Date.now()
    if (now - lastFetchRef.current < 5000 && tokens.length > 0 && !showRefresh) {
      return
    }
    lastFetchRef.current = now

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    abortControllerRef.current = new AbortController()

    if (showRefresh) setIsRefreshing(true)
    if (tokens.length === 0) setIsLoading(true)

    try {
      const res = await fetch(`/api/tokens/trending?limit=${MAX_TOKENS}`, {
        signal: abortControllerRef.current.signal,
        cache: 'no-store',
      })

      if (!res.ok) throw new Error('Failed to fetch tokens')
      
      const data = await res.json()

      if (data.success && data.data) {
        const enrichedTokens = data.data.map((token: TokenData) => ({
          ...token,
          smartMoneyFlow: calculateSmartMoneyFlow(token),
          riskScore: calculateRiskScore(token),
          momentumScore: calculateMomentumScore(token),
          trendingScore: token.trendingScore || calculateTrendingScore(token),
        }))
        
        setTokens(enrichedTokens)
        setError(null)
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens')
    } finally {
      setIsLoading(false)
      setIsRefreshing(false)
    }
  }, [tokens.length])

  // Initial fetch and polling
  useEffect(() => {
    fetchTokens()
    
    const pollTimer = setInterval(() => {
      fetchTokens()
      setCountdown(15)
    }, POLL_INTERVAL)

    const countdownTimer = setInterval(() => {
      setCountdown(prev => prev > 0 ? prev - 1 : 15)
    }, 1000)

    return () => {
      clearInterval(pollTimer)
      clearInterval(countdownTimer)
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [fetchTokens])

  // Filter and sort tokens
  const filteredTokens = useMemo(() => {
    let result = [...tokens]

    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      )
    }

    result = result.filter(t => {
      if (filters.minLiquidity > 0 && t.liquidity < filters.minLiquidity) return false
      if (filters.minVolume > 0 && t.volume24h < filters.minVolume) return false
      if (filters.minMarketCap > 0 && t.marketCap < filters.minMarketCap) return false
      
      const ageHours = (Date.now() - t.pairCreatedAt) / 3600000
      if (ageHours > filters.maxAge) return false
      
      if (filters.hideHighRisk && (t.riskScore || 0) > 70) return false
      
      return true
    })

    result.sort((a, b) => {
      const dir = filters.sortDir === 'desc' ? 1 : -1
      
      switch (filters.sortBy) {
        case 'trending':
          return ((b.trendingScore || 0) - (a.trendingScore || 0)) * dir
        case 'volume':
          return (b.volume24h - a.volume24h) * dir
        case 'priceChange':
          return (b.priceChange24h - a.priceChange24h) * dir
        case 'marketCap':
          return (b.marketCap - a.marketCap) * dir
        case 'liquidity':
          return (b.liquidity - a.liquidity) * dir
        case 'momentum':
          return ((b.momentumScore || 0) - (a.momentumScore || 0)) * dir
        case 'new':
          return (b.pairCreatedAt - a.pairCreatedAt) * dir
        default:
          return 0
      }
    })

    return result
  }, [tokens, search, filters])

  // Pagination
  const totalPages = Math.ceil(filteredTokens.length / TOKENS_PER_PAGE)
  const paginatedTokens = filteredTokens.slice((currentPage - 1) * TOKENS_PER_PAGE, currentPage * TOKENS_PER_PAGE)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filters])

  // Stats
  const stats = useMemo(() => {
    const now = Date.now()
    const oneHourAgo = now - 3600000
    
    return {
      totalTokens: filteredTokens.length,
      newTokens1h: filteredTokens.filter(t => t.pairCreatedAt > oneHourAgo).length,
      highMomentum: filteredTokens.filter(t => (t.momentumScore || 0) > 70).length,
      totalVolume: filteredTokens.reduce((sum, t) => sum + t.volume24h, 0),
      avgLiquidity: filteredTokens.length > 0 ? filteredTokens.reduce((sum, t) => sum + t.liquidity, 0) / filteredTokens.length : 0,
      positiveTokens: filteredTokens.filter(t => t.priceChange24h > 0).length,
    }
  }, [filteredTokens])

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 1500)
  }

  const getAgeDisplay = (timestamp: number) => {
    if (!timestamp) return ''
    const hours = (Date.now() - timestamp) / 3600000
    if (hours < 1) return `${Math.floor(hours * 60)}m`
    if (hours < 24) return `${Math.floor(hours)}h`
    return `${Math.floor(hours / 24)}d`
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

  const handlePageChange = (page: number) => {
    setCurrentPage(page)
  }

  const handleManualRefresh = () => {
    setCountdown(15)
    fetchTokens(true)
  }

  if (isLoading && tokens.length === 0) {
    return (
      <div className="h-full flex flex-col">
        <div className="p-4 border-b border-[var(--border-subtle)]">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--aqua-primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">Loading tokens...</h2>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 p-4">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="h-[160px] skeleton rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with Stats */}
      <div className="p-3 border-b border-[var(--border-subtle)] flex-shrink-0">
        {/* Top Bar */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xs bg-[var(--green)]/20 text-[var(--green)] px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
              LIVE
            </span>
            <span className="text-sm font-bold text-[var(--text-primary)]">{filteredTokens.length} tokens</span>
          </div>
          <div className="flex items-center gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-0.5 bg-[var(--bg-secondary)] rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-1.5 rounded text-xs transition-all",
                  viewMode === 'grid' ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]" : "text-[var(--text-muted)]"
                )}
              >
                <BarChart3 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('compact')}
                className={cn(
                  "p-1.5 rounded text-xs transition-all",
                  viewMode === 'compact' ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]" : "text-[var(--text-muted)]"
                )}
              >
                <Activity className="w-3.5 h-3.5" />
              </button>
            </div>
            <span className="text-[10px] text-[var(--text-dim)] tabular-nums">{countdown}s</span>
            <button
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-muted)]", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-6 gap-2 mb-3">
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1"><Target className="w-3 h-3" /> Total</div>
            <div className="text-sm font-bold text-[var(--text-primary)]">{stats.totalTokens}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1"><Sparkles className="w-3 h-3" /> New 1h</div>
            <div className="text-sm font-bold text-[var(--aqua-primary)]">{stats.newTokens1h}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1"><Flame className="w-3 h-3" /> Hot</div>
            <div className="text-sm font-bold text-orange-400">{stats.highMomentum}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Green</div>
            <div className="text-sm font-bold text-[var(--green)]">{stats.positiveTokens}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1"><DollarSign className="w-3 h-3" /> Vol</div>
            <div className="text-sm font-bold text-[var(--text-primary)]">${(stats.totalVolume / 1000000).toFixed(1)}M</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-[9px] text-[var(--text-muted)] flex items-center gap-1"><Droplets className="w-3 h-3" /> Avg Liq</div>
            <div className="text-sm font-bold text-[var(--text-primary)]">{formatCompact(stats.avgLiquidity)}</div>
          </div>
        </div>

        {/* Search and Filter Row */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search tokens..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)]/50"
            />
          </div>
          
          {/* Quick Sort Buttons */}
          <div className="flex items-center gap-1">
            {[
              { key: 'trending', label: 'Hot', icon: Flame },
              { key: 'volume', label: 'Vol', icon: DollarSign },
              { key: 'priceChange', label: '%', icon: TrendingUp },
              { key: 'new', label: 'New', icon: Sparkles },
            ].map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                onClick={() => setFilters(f => ({ 
                  ...f, 
                  sortBy: key as AggregatorFilters['sortBy'],
                  sortDir: f.sortBy === key ? (f.sortDir === 'desc' ? 'asc' : 'desc') : 'desc'
                }))}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded text-[10px] font-medium transition-all",
                  filters.sortBy === key 
                    ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]"
                    : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                )}
              >
                <Icon className="w-3 h-3" />
                {label}
                {filters.sortBy === key && (
                  <ArrowUpDown className="w-2.5 h-2.5" />
                )}
              </button>
            ))}
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-colors",
              showFilters 
                ? "bg-[var(--aqua-primary)]/20 border-[var(--aqua-primary)]/50 text-[var(--aqua-primary)]"
                : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]"
            )}
          >
            <Filter className="w-4 h-4" />
          </button>
        </div>

        {/* Advanced Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap gap-2">
                <select
                  value={filters.minLiquidity}
                  onChange={(e) => setFilters(f => ({ ...f, minLiquidity: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={0}>Any Liquidity</option>
                  <option value={5000}>$5K+ Liq</option>
                  <option value={10000}>$10K+ Liq</option>
                  <option value={50000}>$50K+ Liq</option>
                  <option value={100000}>$100K+ Liq</option>
                </select>
                <select
                  value={filters.minVolume}
                  onChange={(e) => setFilters(f => ({ ...f, minVolume: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={0}>Any Volume</option>
                  <option value={10000}>$10K+ Vol</option>
                  <option value={50000}>$50K+ Vol</option>
                  <option value={100000}>$100K+ Vol</option>
                </select>
                <select
                  value={filters.minMarketCap}
                  onChange={(e) => setFilters(f => ({ ...f, minMarketCap: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={0}>Any MC</option>
                  <option value={10000}>$10K+ MC</option>
                  <option value={100000}>$100K+ MC</option>
                  <option value={1000000}>$1M+ MC</option>
                </select>
                <select
                  value={filters.maxAge}
                  onChange={(e) => setFilters(f => ({ ...f, maxAge: parseInt(e.target.value) }))}
                  className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
                >
                  <option value={6}>6 hours</option>
                  <option value={24}>24 hours</option>
                  <option value={72}>3 days</option>
                  <option value={168}>7 days</option>
                  <option value={720}>30 days</option>
                </select>
                <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)] cursor-pointer px-2">
                  <input
                    type="checkbox"
                    checked={filters.hideHighRisk}
                    onChange={(e) => setFilters(f => ({ ...f, hideHighRisk: e.target.checked }))}
                    className="rounded w-3 h-3"
                  />
                  Hide High Risk
                </label>
                <button
                  onClick={() => setFilters(DEFAULT_FILTERS)}
                  className="px-2 py-1.5 text-[10px] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                >
                  Reset
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Token Grid */}
      <div className="flex-1 overflow-y-auto p-3">
        {error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <AlertTriangle className="w-8 h-8 mb-2 text-[var(--red)]" />
            <p>{error}</p>
            <button onClick={handleManualRefresh} className="mt-4 px-4 py-2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] rounded-lg text-sm font-medium">
              Retry
            </button>
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <Search className="w-8 h-8 mb-2" />
            <p>No tokens match your filters</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className={cn(
              "grid gap-3",
              viewMode === 'grid' 
                ? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"
                : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            )}>
              {paginatedTokens.map((token, index) => (
                <TokenCard
                  key={token.address}
                  token={token}
                  index={index}
                  viewMode={viewMode}
                  copiedAddress={copiedAddress}
                  onCopy={copyAddress}
                  formatPrice={formatPrice}
                  formatCompact={formatCompact}
                  getAgeDisplay={getAgeDisplay}
                />
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4">
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    currentPage === 1 ? "text-white/20" : "text-white/60 hover:bg-white/10"
                  )}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <ChevronLeft className="w-4 h-4 -ml-2" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                    currentPage === 1 ? "bg-white/5 text-white/30" : "bg-white/10 text-white/70 hover:bg-white/20"
                  )}
                >
                  Prev
                </button>
                
                <div className="flex items-center gap-1">
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    let pageNum: number
                    if (totalPages <= 7) {
                      pageNum = i + 1
                    } else if (currentPage <= 4) {
                      pageNum = i + 1
                    } else if (currentPage >= totalPages - 3) {
                      pageNum = totalPages - 6 + i
                    } else {
                      pageNum = currentPage - 3 + i
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
                    currentPage === totalPages ? "bg-white/5 text-white/30" : "bg-white/10 text-white/70 hover:bg-white/20"
                  )}
                >
                  Next
                </button>
                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className={cn(
                    "p-2 rounded-lg transition-all",
                    currentPage === totalPages ? "text-white/20" : "text-white/60 hover:bg-white/10"
                  )}
                >
                  <ChevronRight className="w-4 h-4" />
                  <ChevronRight className="w-4 h-4 -ml-2" />
                </button>
                
                <span className="ml-4 text-xs text-white/40">
                  Page {currentPage} of {totalPages}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Copy Toast */}
      <AnimatePresence>
        {copiedAddress && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] px-4 py-2 rounded-lg text-sm font-medium z-50"
          >
            Address copied!
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Token Card Component
function TokenCard({
  token,
  index,
  viewMode,
  copiedAddress,
  onCopy,
  formatPrice,
  formatCompact,
  getAgeDisplay,
}: {
  token: TokenData
  index: number
  viewMode: 'grid' | 'compact'
  copiedAddress: string | null
  onCopy: (address: string, e: React.MouseEvent) => void
  formatPrice: (price: number) => string
  formatCompact: (num: number) => string
  getAgeDisplay: (timestamp: number) => string
}) {
  const isPositive = token.priceChange24h >= 0
  const buyRatio = token.txns24h.buys + token.txns24h.sells > 0 
    ? (token.txns24h.buys / (token.txns24h.buys + token.txns24h.sells)) * 100 
    : 50
  const age = getAgeDisplay(token.pairCreatedAt)

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.15, delay: Math.min(index * 0.015, 0.2) }}
    >
      <Link href={`/token/${token.address}`}>
        <div className="card-interactive overflow-hidden group bg-[var(--bg-primary)] border border-[var(--border-subtle)] hover:border-[var(--aqua-primary)]/50 transition-all">
          {/* Horizontal layout matching Aquarius */}
          <div className="flex gap-3 p-3">
            {/* Token Image */}
            <div className="relative w-16 h-16 rounded-lg bg-[var(--bg-secondary)] flex-shrink-0 overflow-hidden">
              <Image
                src={token.logo || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.address}.png`}
                alt={token.symbol}
                fill
                className="object-cover"
                unoptimized
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 
                    `https://ui-avatars.com/api/?name=${token.symbol}&background=0a0a0a&color=00d9ff&size=64`
                }}
              />
              {token.momentumScore && token.momentumScore > 70 && (
                <div className="absolute top-0.5 right-0.5 w-4 h-4 bg-orange-500 rounded-full flex items-center justify-center">
                  <Flame className="w-2.5 h-2.5 text-white" />
                </div>
              )}
            </div>

            {/* Token Info */}
            <div className="flex-1 min-w-0 flex flex-col justify-between">
              {/* Top: Name + Badges */}
              <div>
                <div className="flex items-center gap-1.5">
                  <h3 className="font-bold text-sm text-[var(--text-primary)] truncate">{token.symbol}</h3>
                  {token.riskScore && token.riskScore > 60 && (
                    <Shield className="w-3 h-3 text-yellow-500 flex-shrink-0" title="Medium Risk" />
                  )}
                  {age && (
                    <span className="flex items-center gap-0.5 px-1 py-0.5 text-[8px] font-medium rounded bg-[var(--bg-secondary)] text-[var(--text-dim)] flex-shrink-0">
                      {age}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[var(--text-muted)] truncate">{token.name}</p>
              </div>

              {/* Middle: Price + Change */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[var(--text-primary)]">{formatPrice(token.price)}</span>
                <span className={cn(
                  "flex items-center gap-0.5 text-xs font-semibold",
                  isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
                )}>
                  {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                  {isPositive ? '+' : ''}{token.priceChange24h?.toFixed(1) || '0'}%
                </span>
              </div>

              {/* Bottom: MC + Liq + Progress */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-[var(--text-dim)]">MC</span>
                  <span className="text-[11px] font-bold text-[var(--aqua-primary)]">{formatCompact(token.marketCap)}</span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[9px] text-[var(--text-dim)]">Liq</span>
                  <span className="text-[11px] font-medium text-[var(--text-muted)]">{formatCompact(token.liquidity)}</span>
                </div>
                
                {/* Buy/Sell Bar */}
                <div className="flex-1 h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden flex">
                  <div className="h-full bg-[var(--green)]" style={{ width: `${buyRatio}%` }} />
                  <div className="h-full bg-[var(--red)]" style={{ width: `${100 - buyRatio}%` }} />
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="px-3 pb-2 flex gap-1">
            <button
              onClick={(e) => onCopy(token.address, e)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-medium transition-all",
                copiedAddress === token.address
                  ? "bg-[var(--green)] text-[var(--ocean-deep)]"
                  : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]"
              )}
            >
              <Copy className="w-3 h-3" />
              {copiedAddress === token.address ? '✓' : 'Copy'}
            </button>
            <a
              href={`https://dexscreener.com/solana/${token.address}`}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-[10px] font-medium bg-[var(--aqua-primary)] text-[var(--ocean-deep)] hover:bg-[var(--aqua-secondary)] transition-all"
            >
              Chart <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </Link>
    </motion.div>
  )
}

// ============== ANALYTICS ALGORITHMS ==============

function calculateSmartMoneyFlow(token: TokenData): number {
  const buyRatio = token.txns24h.buys / Math.max(token.txns24h.buys + token.txns24h.sells, 1)
  const volumeToMcap = token.marketCap > 0 ? token.volume24h / token.marketCap : 0
  
  const score = (
    buyRatio * 40 +
    Math.min(volumeToMcap * 100, 30) +
    Math.min(token.liquidity / 50000, 30)
  )
  
  return Math.round(Math.min(100, Math.max(0, score)))
}

function calculateRiskScore(token: TokenData): number {
  let risk = 0
  
  if (token.liquidity < 1000) risk += 40
  else if (token.liquidity < 5000) risk += 25
  else if (token.liquidity < 10000) risk += 10
  
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 1) risk += 30
  else if (ageHours < 6) risk += 20
  else if (ageHours < 24) risk += 10
  
  const sellRatio = token.txns24h.sells / Math.max(token.txns24h.buys + token.txns24h.sells, 1)
  if (sellRatio > 0.7) risk += 20
  else if (sellRatio > 0.6) risk += 10
  
  if (token.volume24h < 1000) risk += 15
  
  return Math.min(100, risk)
}

function calculateMomentumScore(token: TokenData): number {
  let score = 50
  
  if (token.priceChange1h > 20) score += 25
  else if (token.priceChange1h > 10) score += 15
  else if (token.priceChange1h > 5) score += 10
  else if (token.priceChange1h < -20) score -= 25
  else if (token.priceChange1h < -10) score -= 15
  else if (token.priceChange1h < -5) score -= 10
  
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h > avgHourlyVol * 3) score += 20
  else if (token.volume1h > avgHourlyVol * 2) score += 10
  else if (token.volume1h < avgHourlyVol * 0.5) score -= 10
  
  const buyRatio1h = token.txns1h.buys / Math.max(token.txns1h.buys + token.txns1h.sells, 1)
  if (buyRatio1h > 0.7) score += 15
  else if (buyRatio1h > 0.6) score += 10
  else if (buyRatio1h < 0.3) score -= 15
  else if (buyRatio1h < 0.4) score -= 10
  
  return Math.min(100, Math.max(0, score))
}

function calculateTrendingScore(token: TokenData): number {
  let score = 0
  
  score += Math.min((token.volume24h / 100000) * 30, 30)
  score += Math.min((token.volume1h / 10000) * 20, 20)
  
  const totalTxns = token.txns24h.buys + token.txns24h.sells
  score += Math.min(totalTxns / 100, 20)
  
  score += Math.min(Math.abs(token.priceChange24h), 15)
  score += Math.min(Math.abs(token.priceChange1h) * 2, 15)
  
  return Math.round(score)
}
