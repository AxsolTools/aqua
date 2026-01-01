"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import {
  TrendingUp,
  TrendingDown,
  Activity,
  Zap,
  Target,
  AlertTriangle,
  Crown,
  ChevronUp,
  ChevronDown,
  Search,
  Filter,
  RefreshCw,
  ExternalLink,
  Copy,
  Eye,
  Users,
  BarChart3,
  Flame,
  Clock,
  DollarSign,
  Percent,
  ArrowUpRight,
  ArrowDownRight,
  Shield,
  Sparkles,
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
  // Computed metrics
  kolBuyers?: number
  smartMoneyFlow?: number
  riskScore?: number
  momentumScore?: number
  trendingScore?: number
}

interface AggregatorFilters {
  minLiquidity: number
  minVolume: number
  maxAge: number // hours
  showKolBuys: boolean
  hideRugs: boolean
  sortBy: 'trending' | 'volume' | 'priceChange' | 'kolBuyers' | 'smartMoney' | 'new'
  sortDir: 'desc' | 'asc'
}

const DEFAULT_FILTERS: AggregatorFilters = {
  minLiquidity: 5000,
  minVolume: 1000,
  maxAge: 168, // 7 days
  showKolBuys: false,
  hideRugs: true,
  sortBy: 'trending',
  sortDir: 'desc',
}

export function TokenAggregator() {
  const [tokens, setTokens] = useState<TokenData[]>([])
  const [kolConvergence, setKolConvergence] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<AggregatorFilters>(DEFAULT_FILTERS)
  const [search, setSearch] = useState("")
  const [countdown, setCountdown] = useState(15)
  const [showFilters, setShowFilters] = useState(false)
  const [selectedToken, setSelectedToken] = useState<TokenData | null>(null)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)

  // Fetch tokens from aggregated feed
  const fetchTokens = useCallback(async () => {
    try {
      setIsLoading(true)
      
      // Fetch tokens and KOL convergence in parallel
      const [tokensRes, kolRes] = await Promise.all([
        fetch(`/api/tokens/trending?limit=100`),
        fetch(`/api/kol/activity?action=convergence&lookback=24`).catch(() => null),
      ])

      if (!tokensRes.ok) throw new Error('Failed to fetch tokens')
      
      const tokensData = await tokensRes.json()
      
      // Process KOL convergence data
      if (kolRes) {
        const kolData = await kolRes.json()
        if (kolData.success && kolData.data) {
          const convergenceMap = new Map<string, number>()
          for (const item of kolData.data) {
            convergenceMap.set(item.token, item.kols?.length || 0)
          }
          setKolConvergence(convergenceMap)
        }
      }

      if (tokensData.success && tokensData.data) {
        // Enrich tokens with computed metrics
        const enrichedTokens = tokensData.data.map((token: TokenData) => ({
          ...token,
          kolBuyers: kolConvergence.get(token.address) || 0,
          smartMoneyFlow: calculateSmartMoneyFlow(token),
          riskScore: calculateRiskScore(token),
          momentumScore: calculateMomentumScore(token),
          trendingScore: token.trendingScore || calculateTrendingScore(token),
        }))
        
        setTokens(enrichedTokens)
        setError(null)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tokens')
    } finally {
      setIsLoading(false)
    }
  }, [kolConvergence])

  // Initial fetch and polling
  useEffect(() => {
    fetchTokens()
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchTokens()
          return 15
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [fetchTokens])

  // Filter and sort tokens
  const filteredTokens = useMemo(() => {
    let result = [...tokens]

    // Apply search filter
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.address.toLowerCase().includes(q)
      )
    }

    // Apply filters
    result = result.filter(t => {
      if (t.liquidity < filters.minLiquidity) return false
      if (t.volume24h < filters.minVolume) return false
      
      const ageHours = (Date.now() - t.pairCreatedAt) / 3600000
      if (ageHours > filters.maxAge) return false
      
      if (filters.showKolBuys && (t.kolBuyers || 0) < 1) return false
      if (filters.hideRugs && (t.riskScore || 0) > 80) return false
      
      return true
    })

    // Sort
    result.sort((a, b) => {
      const multiplier = filters.sortDir === 'desc' ? -1 : 1
      
      switch (filters.sortBy) {
        case 'trending':
          return ((a.trendingScore || 0) - (b.trendingScore || 0)) * multiplier
        case 'volume':
          return (a.volume24h - b.volume24h) * multiplier
        case 'priceChange':
          return (a.priceChange24h - b.priceChange24h) * multiplier
        case 'kolBuyers':
          return ((a.kolBuyers || 0) - (b.kolBuyers || 0)) * multiplier
        case 'smartMoney':
          return ((a.smartMoneyFlow || 0) - (b.smartMoneyFlow || 0)) * multiplier
        case 'new':
          return (a.pairCreatedAt - b.pairCreatedAt) * multiplier
        default:
          return 0
      }
    })

    return result
  }, [tokens, search, filters])

  // Stats
  const stats = useMemo(() => {
    const now = Date.now()
    const oneHourAgo = now - 3600000
    
    return {
      totalTokens: filteredTokens.length,
      newTokens1h: filteredTokens.filter(t => t.pairCreatedAt > oneHourAgo).length,
      kolBuySignals: filteredTokens.filter(t => (t.kolBuyers || 0) >= 2).length,
      highMomentum: filteredTokens.filter(t => (t.momentumScore || 0) > 70).length,
      totalVolume: filteredTokens.reduce((sum, t) => sum + t.volume24h, 0),
    }
  }, [filteredTokens])

  const copyAddress = (address: string) => {
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 2000)
  }

  const getAgeDisplay = (timestamp: number) => {
    const hours = (Date.now() - timestamp) / 3600000
    if (hours < 1) return `${Math.floor(hours * 60)}m`
    if (hours < 24) return `${Math.floor(hours)}h`
    return `${Math.floor(hours / 24)}d`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[var(--aqua-primary)]" />
            <h2 className="text-lg font-bold text-[var(--text-primary)]">TOKEN AGGREGATOR</h2>
            <span className="text-xs bg-[var(--green)]/20 text-[var(--green)] px-2 py-0.5 rounded flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
              LIVE
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs">
              <Clock className="w-3 h-3 text-[var(--text-muted)]" />
              <span className="text-[var(--aqua-primary)] font-mono tabular-nums">{countdown}s</span>
            </div>
            <button
              onClick={fetchTokens}
              disabled={isLoading}
              className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] transition-colors"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-muted)]", isLoading && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-5 gap-2 mb-4">
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-muted)]">Tokens</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">{stats.totalTokens}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-muted)]">New (1h)</div>
            <div className="text-lg font-bold text-[var(--aqua-primary)]">{stats.newTokens1h}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-muted)]">KOL Signals</div>
            <div className="text-lg font-bold text-yellow-400">{stats.kolBuySignals}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-muted)]">High Mom.</div>
            <div className="text-lg font-bold text-[var(--green)]">{stats.highMomentum}</div>
          </div>
          <div className="p-2 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
            <div className="text-xs text-[var(--text-muted)]">24h Vol</div>
            <div className="text-lg font-bold text-[var(--text-primary)]">
              ${(stats.totalVolume / 1000000).toFixed(1)}M
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, symbol, or address..."
              className="w-full pl-9 pr-3 py-2 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded-lg text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)]/50"
            />
          </div>
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors",
              showFilters 
                ? "bg-[var(--aqua-primary)]/20 border-[var(--aqua-primary)]/50 text-[var(--aqua-primary)]"
                : "bg-[var(--bg-secondary)] border-[var(--border-subtle)] text-[var(--text-muted)]"
            )}
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>
        </div>

        {/* Filter Panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">Min Liquidity</label>
                  <select
                    value={filters.minLiquidity}
                    onChange={(e) => setFilters(f => ({ ...f, minLiquidity: parseInt(e.target.value) }))}
                    className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)]"
                  >
                    <option value={0}>Any</option>
                    <option value={1000}>$1K+</option>
                    <option value={5000}>$5K+</option>
                    <option value={10000}>$10K+</option>
                    <option value={50000}>$50K+</option>
                    <option value={100000}>$100K+</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">Min Volume</label>
                  <select
                    value={filters.minVolume}
                    onChange={(e) => setFilters(f => ({ ...f, minVolume: parseInt(e.target.value) }))}
                    className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)]"
                  >
                    <option value={0}>Any</option>
                    <option value={1000}>$1K+</option>
                    <option value={10000}>$10K+</option>
                    <option value={50000}>$50K+</option>
                    <option value={100000}>$100K+</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">Max Age</label>
                  <select
                    value={filters.maxAge}
                    onChange={(e) => setFilters(f => ({ ...f, maxAge: parseInt(e.target.value) }))}
                    className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)]"
                  >
                    <option value={1}>1 hour</option>
                    <option value={6}>6 hours</option>
                    <option value={24}>24 hours</option>
                    <option value={72}>3 days</option>
                    <option value={168}>7 days</option>
                    <option value={720}>30 days</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[var(--text-muted)] mb-1 block">Sort By</label>
                  <select
                    value={filters.sortBy}
                    onChange={(e) => setFilters(f => ({ ...f, sortBy: e.target.value as AggregatorFilters['sortBy'] }))}
                    className="w-full px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)]"
                  >
                    <option value="trending">Trending Score</option>
                    <option value="volume">Volume</option>
                    <option value="priceChange">Price Change</option>
                    <option value="kolBuyers">KOL Buyers</option>
                    <option value="smartMoney">Smart Money</option>
                    <option value="new">Newest</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-4 mt-3">
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.showKolBuys}
                    onChange={(e) => setFilters(f => ({ ...f, showKolBuys: e.target.checked }))}
                    className="rounded"
                  />
                  KOL Buys Only
                </label>
                <label className="flex items-center gap-2 text-xs text-[var(--text-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={filters.hideRugs}
                    onChange={(e) => setFilters(f => ({ ...f, hideRugs: e.target.checked }))}
                    className="rounded"
                  />
                  Hide High Risk
                </label>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Token List */}
      <div className="flex-1 overflow-y-auto">
        {isLoading && tokens.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 text-[var(--aqua-primary)] animate-spin" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <AlertTriangle className="w-8 h-8 mb-2 text-[var(--red)]" />
            <p>{error}</p>
            <button
              onClick={fetchTokens}
              className="mt-4 px-4 py-2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] rounded-lg text-sm font-medium"
            >
              Retry
            </button>
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <Search className="w-8 h-8 mb-2" />
            <p>No tokens match your filters</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-subtle)]">
            {filteredTokens.map((token, index) => (
              <TokenRow 
                key={token.address} 
                token={token}
                rank={index + 1}
                onCopy={copyAddress}
                isCopied={copiedAddress === token.address}
                kolBuyers={kolConvergence.get(token.address) || 0}
                getAgeDisplay={getAgeDisplay}
              />
            ))}
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

// Token Row Component
function TokenRow({ 
  token, 
  rank, 
  onCopy, 
  isCopied,
  kolBuyers,
  getAgeDisplay,
}: { 
  token: TokenData
  rank: number
  onCopy: (address: string) => void
  isCopied: boolean
  kolBuyers: number
  getAgeDisplay: (ts: number) => string
}) {
  const isPositive = token.priceChange24h >= 0
  
  return (
    <div className="p-3 hover:bg-[var(--bg-secondary)]/50 transition-colors group">
      <div className="flex items-center gap-3">
        {/* Rank */}
        <div className={cn(
          "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold",
          rank === 1 ? "bg-yellow-500/20 text-yellow-500" :
          rank === 2 ? "bg-gray-400/20 text-gray-400" :
          rank === 3 ? "bg-amber-600/20 text-amber-600" :
          "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
        )}>
          {rank}
        </div>

        {/* Logo */}
        <div className="relative">
          <Image
            src={token.logo || `https://dd.dexscreener.com/ds-data/tokens/solana/${token.address}.png`}
            alt={token.symbol}
            width={36}
            height={36}
            className="rounded-full bg-[var(--bg-secondary)]"
            unoptimized
          />
          {kolBuyers >= 2 && (
            <div className="absolute -top-1 -right-1 w-4 h-4 bg-yellow-500 rounded-full flex items-center justify-center">
              <Crown className="w-2.5 h-2.5 text-[var(--ocean-deep)]" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-bold text-[var(--text-primary)] truncate">{token.symbol}</span>
            {token.momentumScore && token.momentumScore > 70 && (
              <Flame className="w-3.5 h-3.5 text-orange-500" />
            )}
            {token.riskScore && token.riskScore > 60 && (
              <AlertTriangle className="w-3.5 h-3.5 text-[var(--red)]" />
            )}
            <span className="text-xs text-[var(--text-dim)]">
              {getAgeDisplay(token.pairCreatedAt)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <span className="truncate">{token.name}</span>
          </div>
        </div>

        {/* Price & Change */}
        <div className="text-right">
          <div className="text-sm font-medium text-[var(--text-primary)]">
            ${token.price < 0.0001 ? token.price.toExponential(2) : token.price.toFixed(6)}
          </div>
          <div className={cn(
            "text-xs flex items-center justify-end gap-0.5",
            isPositive ? "text-[var(--green)]" : "text-[var(--red)]"
          )}>
            {isPositive ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(token.priceChange24h).toFixed(1)}%
          </div>
        </div>

        {/* Metrics */}
        <div className="hidden md:flex items-center gap-4 text-xs text-[var(--text-muted)]">
          <div className="text-center">
            <div className="text-[var(--text-dim)]">Vol</div>
            <div className="text-[var(--text-primary)] font-medium">
              ${token.volume24h >= 1000000 
                ? `${(token.volume24h / 1000000).toFixed(1)}M`
                : `${(token.volume24h / 1000).toFixed(0)}K`
              }
            </div>
          </div>
          <div className="text-center">
            <div className="text-[var(--text-dim)]">Liq</div>
            <div className="text-[var(--text-primary)] font-medium">
              ${token.liquidity >= 1000000 
                ? `${(token.liquidity / 1000000).toFixed(1)}M`
                : `${(token.liquidity / 1000).toFixed(0)}K`
              }
            </div>
          </div>
          <div className="text-center">
            <div className="text-[var(--text-dim)]">Txns</div>
            <div className="text-[var(--text-primary)] font-medium">
              {token.txns24h.buys + token.txns24h.sells}
            </div>
          </div>
          {kolBuyers > 0 && (
            <div className="text-center">
              <div className="text-[var(--text-dim)]">KOLs</div>
              <div className="text-yellow-500 font-bold">{kolBuyers}</div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onCopy(token.address)}
            className="p-1.5 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-dim)] hover:text-[var(--text-primary)]"
            title="Copy address"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <a
            href={`https://dexscreener.com/solana/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded hover:bg-[var(--bg-elevated)] text-[var(--text-dim)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Momentum Bar */}
      {token.momentumScore !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-[var(--text-dim)]">Momentum</span>
          <div className="flex-1 h-1 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
            <div 
              className={cn(
                "h-full rounded-full transition-all",
                token.momentumScore > 70 ? "bg-[var(--green)]" :
                token.momentumScore > 40 ? "bg-yellow-500" :
                "bg-[var(--red)]"
              )}
              style={{ width: `${Math.min(100, token.momentumScore)}%` }}
            />
          </div>
          <span className="text-xs font-medium text-[var(--text-muted)]">{token.momentumScore}</span>
        </div>
      )}
    </div>
  )
}

// ============== ANALYTICS ALGORITHMS ==============

function calculateSmartMoneyFlow(token: TokenData): number {
  // Algorithm: Analyze buy/sell ratio and volume concentration
  const buyRatio = token.txns24h.buys / Math.max(token.txns24h.buys + token.txns24h.sells, 1)
  const volumeToMcap = token.marketCap > 0 ? token.volume24h / token.marketCap : 0
  
  // Higher smart money score for:
  // - More buys than sells
  // - High volume relative to market cap
  // - Good liquidity
  const score = (
    buyRatio * 40 +
    Math.min(volumeToMcap * 100, 30) +
    Math.min(token.liquidity / 50000, 30)
  )
  
  return Math.round(Math.min(100, Math.max(0, score)))
}

function calculateRiskScore(token: TokenData): number {
  let risk = 0
  
  // Low liquidity = high risk
  if (token.liquidity < 1000) risk += 40
  else if (token.liquidity < 5000) risk += 25
  else if (token.liquidity < 10000) risk += 10
  
  // Very new = higher risk
  const ageHours = (Date.now() - token.pairCreatedAt) / 3600000
  if (ageHours < 1) risk += 30
  else if (ageHours < 6) risk += 20
  else if (ageHours < 24) risk += 10
  
  // Sell pressure
  const sellRatio = token.txns24h.sells / Math.max(token.txns24h.buys + token.txns24h.sells, 1)
  if (sellRatio > 0.7) risk += 20
  else if (sellRatio > 0.6) risk += 10
  
  // Very low volume = suspicious
  if (token.volume24h < 1000) risk += 15
  
  return Math.min(100, risk)
}

function calculateMomentumScore(token: TokenData): number {
  let score = 50 // Neutral base
  
  // Price momentum
  if (token.priceChange1h > 20) score += 25
  else if (token.priceChange1h > 10) score += 15
  else if (token.priceChange1h > 5) score += 10
  else if (token.priceChange1h < -20) score -= 25
  else if (token.priceChange1h < -10) score -= 15
  else if (token.priceChange1h < -5) score -= 10
  
  // Volume momentum (1h vs 24h average)
  const avgHourlyVol = token.volume24h / 24
  if (token.volume1h > avgHourlyVol * 3) score += 20
  else if (token.volume1h > avgHourlyVol * 2) score += 10
  else if (token.volume1h < avgHourlyVol * 0.5) score -= 10
  
  // Buy pressure
  const buyRatio1h = token.txns1h.buys / Math.max(token.txns1h.buys + token.txns1h.sells, 1)
  if (buyRatio1h > 0.7) score += 15
  else if (buyRatio1h > 0.6) score += 10
  else if (buyRatio1h < 0.3) score -= 15
  else if (buyRatio1h < 0.4) score -= 10
  
  return Math.min(100, Math.max(0, score))
}

function calculateTrendingScore(token: TokenData): number {
  let score = 0
  
  // Volume factor
  score += Math.min((token.volume24h / 100000) * 30, 30)
  score += Math.min((token.volume1h / 10000) * 20, 20)
  
  // Activity factor
  const totalTxns = token.txns24h.buys + token.txns24h.sells
  score += Math.min(totalTxns / 100, 20)
  
  // Price change factor
  score += Math.min(Math.abs(token.priceChange24h), 15)
  score += Math.min(Math.abs(token.priceChange1h) * 2, 15)
  
  return Math.round(score)
}

