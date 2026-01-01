"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Image from "next/image"
import { 
  getInitialKOLDatabase, 
  type KOL, 
  formatUSD, 
  getKolAvatar, 
  getKolAvatarFallback,
  formatTimeAgo 
} from "@/lib/kol-data"
import { cn } from "@/lib/utils"
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  Copy,
  ExternalLink,
  Star,
  StarOff,
  Clock,
  ChevronUp,
  ChevronDown,
  Search,
  Crown,
  Award,
  Medal,
  Zap,
  Target,
  BarChart2,
  Users,
  RefreshCw,
  Wifi,
  WifiOff,
  Sparkles,
} from "lucide-react"

interface Props {
  onSelectKOL: (kol: KOL) => void
  selectedKOL: KOL | null
}

const REFRESH_INTERVAL = 30000 // 30 seconds
const PER_PAGE = 25

export function KOLLeaderboard({ onSelectKOL, selectedKOL }: Props) {
  const [kols, setKols] = useState<KOL[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [liveDataEnabled, setLiveDataEnabled] = useState(true)
  const [sortBy, setSortBy] = useState<"pnl" | "winRate" | "trades" | "followers" | "roi7d" | "tier">("tier")
  const [sortDir, setSortDir] = useState<"desc" | "asc">("asc")
  const [search, setSearch] = useState("")
  const [filterTier, setFilterTier] = useState<string>("all")
  const [filterCategory, setFilterCategory] = useState<string>("all")
  const [showOnlyVerified, setShowOnlyVerified] = useState(false)
  const [watchlist, setWatchlist] = useState<Set<string>>(new Set())
  const [countdown, setCountdown] = useState(30)
  const [copiedWallet, setCopiedWallet] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [avatarErrors, setAvatarErrors] = useState<Map<string, number>>(new Map())
  const lastFetchRef = useRef<number>(0)

  // Initial load from database
  useEffect(() => {
    const initialKols = getInitialKOLDatabase()
    setKols(initialKols)
    setIsLoading(false)
  }, [])

  // Fetch live data from API
  const fetchLiveData = useCallback(async (showRefresh = false) => {
    if (!liveDataEnabled) return
    
    // Prevent too frequent fetches
    const now = Date.now()
    if (now - lastFetchRef.current < 10000 && !showRefresh) return
    lastFetchRef.current = now

    if (showRefresh) setIsRefreshing(true)

    try {
      const res = await fetch('/api/kol/activity?action=list', {
        cache: 'no-store',
      })
      
      if (!res.ok) throw new Error('Failed to fetch KOL data')
      
      const data = await res.json()
      
      if (data.success && data.data) {
        // Merge live data with current KOLs
        setKols(prevKols => {
          const liveDataMap = new Map(
            data.data.map((item: { address: string; stats?: { 
              estimatedPnl?: number
              totalTransactions?: number
              winRate?: number
              lastActive?: number
              favoriteTokens?: string[]
            }; isActive?: boolean }) => [item.address, item])
          )
          
          return prevKols.map(kol => {
            const liveData = liveDataMap.get(kol.wallet) as {
              stats?: {
                estimatedPnl?: number
                totalTransactions?: number
                winRate?: number
                lastActive?: number
                favoriteTokens?: string[]
              }
              isActive?: boolean
            } | undefined
            
            if (liveData?.stats) {
              const stats = liveData.stats
              const solPrice = 170 // Approximate SOL price
              return {
                ...kol,
                pnl: (stats.estimatedPnl || 0) * solPrice,
                totalTrades: stats.totalTransactions || kol.totalTrades,
                winRate: stats.winRate || kol.winRate,
                lastActive: stats.lastActive ? formatTimeAgo(stats.lastActive) : kol.lastActive,
                favoriteTokens: stats.favoriteTokens || kol.favoriteTokens,
                isLive: liveData.isActive,
                lastFetched: Date.now(),
              }
            }
            return kol
          })
        })
      }
    } catch (error) {
      console.error('Failed to fetch live KOL data:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [liveDataEnabled])

  // Initial fetch and polling
  useEffect(() => {
    fetchLiveData()
    
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          fetchLiveData()
          return 30
        }
        return prev - 1
      })
    }, 1000)
    
    return () => clearInterval(timer)
  }, [fetchLiveData])

  const toggleWatchlist = (id: string) => {
    setWatchlist(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const copyWallet = (wallet: string, e: React.MouseEvent) => {
    e.stopPropagation()
    navigator.clipboard.writeText(wallet)
    setCopiedWallet(wallet)
    setTimeout(() => setCopiedWallet(null), 2000)
  }

  const handleAvatarError = (kolId: string) => {
    setAvatarErrors(prev => {
      const newMap = new Map(prev)
      const current = newMap.get(kolId) || 0
      newMap.set(kolId, current + 1)
      return newMap
    })
  }

  const getAvatarSrc = (kol: KOL) => {
    const errorCount = avatarErrors.get(kol.id) || 0
    if (errorCount === 0) {
      return getKolAvatar(kol.twitter)
    }
    return getKolAvatarFallback(kol.twitter, errorCount)
  }

  // Filter and sort
  const filteredKols = [...kols]
    .filter(kol => {
      if (search) {
        const q = search.toLowerCase()
        if (!kol.name.toLowerCase().includes(q) && 
            !kol.twitter.toLowerCase().includes(q) &&
            !kol.wallet.toLowerCase().includes(q)) {
          return false
        }
      }
      if (filterTier !== "all" && kol.tier !== filterTier) return false
      if (filterCategory !== "all" && kol.category !== filterCategory) return false
      if (showOnlyVerified && !kol.verified) return false
      return true
    })
    .sort((a, b) => {
      const multiplier = sortDir === "desc" ? -1 : 1
      const tierOrder = { legendary: 0, diamond: 1, gold: 2, silver: 3, bronze: 4 }
      
      switch (sortBy) {
        case "tier":
          return (tierOrder[a.tier] - tierOrder[b.tier]) * multiplier
        case "pnl":
          return (a.pnl - b.pnl) * -multiplier
        case "winRate":
          return (a.winRate - b.winRate) * -multiplier
        case "trades":
          return (a.totalTrades - b.totalTrades) * -multiplier
        case "followers":
          return (a.followers - b.followers) * -multiplier
        case "roi7d":
          return (a.roi7d - b.roi7d) * -multiplier
        default:
          return 0
      }
    })

  const paginatedKols = filteredKols.slice((page - 1) * PER_PAGE, page * PER_PAGE)
  const totalPages = Math.ceil(filteredKols.length / PER_PAGE)

  const categories = [...new Set(kols.map(k => k.category).filter(Boolean))]

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case "legendary":
        return <Sparkles className="w-4 h-4 text-purple-400" />
      case "diamond":
        return <Crown className="w-4 h-4 text-cyan-400" />
      case "gold":
        return <Award className="w-4 h-4 text-yellow-400" />
      case "silver":
        return <Medal className="w-4 h-4 text-neutral-400" />
      default:
        return <Medal className="w-4 h-4 text-amber-700" />
    }
  }

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      legendary: "bg-purple-500/20 text-purple-400 border-purple-500/30",
      diamond: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
      gold: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
      silver: "bg-neutral-400/20 text-neutral-300 border-neutral-400/30",
      bronze: "bg-amber-700/20 text-amber-600 border-amber-700/30",
    }
    return colors[tier] || colors.bronze
  }

  const getRankDisplay = (globalIndex: number) => {
    if (globalIndex === 0)
      return (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center text-[var(--ocean-deep)] font-black text-xs">
          1
        </div>
      )
    if (globalIndex === 1)
      return (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-neutral-300 to-neutral-500 flex items-center justify-center text-[var(--ocean-deep)] font-black text-xs">
          2
        </div>
      )
    if (globalIndex === 2)
      return (
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 flex items-center justify-center text-white font-black text-xs">
          3
        </div>
      )
    return (
      <div className="w-7 h-7 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center text-[var(--text-muted)] font-bold text-xs">
        {globalIndex + 1}
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-[var(--aqua-primary)] animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b border-[var(--border-subtle)]">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[var(--aqua-primary)]" />
            <h2 className="text-base font-bold text-[var(--text-primary)]">KOL LEADERBOARD</h2>
            <span className="text-xs bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] px-2 py-0.5 rounded">
              {filteredKols.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLiveDataEnabled(!liveDataEnabled)}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-xs transition-all",
                liveDataEnabled 
                  ? "bg-[var(--green)]/10 text-[var(--green)]" 
                  : "bg-[var(--bg-secondary)] text-[var(--text-muted)]"
              )}
            >
              {liveDataEnabled ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {liveDataEnabled ? 'Live' : 'Off'}
            </button>
            
            <span className="text-xs text-[var(--aqua-primary)] font-mono tabular-nums">
              {countdown}s
            </span>
            
            <button
              onClick={() => {
                setCountdown(30)
                fetchLiveData(true)
              }}
              disabled={isRefreshing}
              className="p-1.5 rounded bg-[var(--bg-secondary)] hover:bg-[var(--bg-elevated)] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={cn("w-3.5 h-3.5 text-[var(--text-muted)]", isRefreshing && "animate-spin")} />
            </button>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="flex gap-2 mb-2">
          <div className="flex-1 relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-muted)]" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
              placeholder="Search KOL..."
              className="w-full pl-8 pr-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)]/50"
            />
          </div>
          <select
            value={filterTier}
            onChange={(e) => { setFilterTier(e.target.value); setPage(1) }}
            className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
          >
            <option value="all">All Tiers</option>
            <option value="legendary">Legendary</option>
            <option value="diamond">Diamond</option>
            <option value="gold">Gold</option>
            <option value="silver">Silver</option>
            <option value="bronze">Bronze</option>
          </select>
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setPage(1) }}
            className="px-2 py-1.5 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs text-[var(--text-primary)]"
          >
            <option value="all">All Types</option>
            {categories.map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Sort Tabs */}
        <div className="flex gap-1 flex-wrap">
          {[
            { key: "tier", label: "Tier", icon: Crown },
            { key: "pnl", label: "PNL", icon: TrendingUp },
            { key: "winRate", label: "Win%", icon: Target },
            { key: "trades", label: "Trades", icon: Zap },
            { key: "followers", label: "Followers", icon: Users },
          ].map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => {
                if (sortBy === key) setSortDir(d => d === "desc" ? "asc" : "desc")
                else { setSortBy(key as typeof sortBy); setSortDir("desc") }
              }}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium transition-colors",
                sortBy === key 
                  ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]" 
                  : "bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              )}
            >
              <Icon className="w-3 h-3" />
              {label}
              {sortBy === key && (sortDir === "desc" ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />)}
            </button>
          ))}
          <label className="flex items-center gap-1 text-[10px] text-[var(--text-muted)] cursor-pointer ml-2">
            <input
              type="checkbox"
              checked={showOnlyVerified}
              onChange={(e) => { setShowOnlyVerified(e.target.checked); setPage(1) }}
              className="rounded w-3 h-3"
            />
            Verified
          </label>
        </div>
      </div>

      {/* KOL List */}
      <div className="flex-1 overflow-y-auto">
        {paginatedKols.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)]">
            <Search className="w-8 h-8 mb-2" />
            <p className="text-sm">No KOLs found</p>
          </div>
        ) : (
          paginatedKols.map((kol, index) => {
            const globalIndex = (page - 1) * PER_PAGE + index
            return (
              <div
                key={kol.id}
                onClick={() => onSelectKOL(kol)}
                className={cn(
                  "p-3 border-b border-[var(--border-subtle)] cursor-pointer transition-all hover:bg-[var(--bg-secondary)]",
                  selectedKOL?.id === kol.id && "bg-[var(--aqua-primary)]/5 border-l-2 border-l-[var(--aqua-primary)]"
                )}
              >
                <div className="flex items-center gap-2.5">
                  {getRankDisplay(globalIndex)}

                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <Image
                      src={getAvatarSrc(kol)}
                      alt={kol.name}
                      width={40}
                      height={40}
                      className="rounded-full border border-[var(--border-subtle)] object-cover bg-[var(--bg-secondary)]"
                      unoptimized
                      onError={() => handleAvatarError(kol.id)}
                    />
                    {kol.verified && (
                      <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-[#1d9bf0] rounded-full flex items-center justify-center">
                        <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                        </svg>
                      </div>
                    )}
                    {kol.isLive && (
                      <div className="absolute -top-0.5 -left-0.5 w-2.5 h-2.5 bg-[var(--green)] rounded-full border border-[var(--bg-primary)] animate-pulse" />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-[var(--text-primary)] truncate">{kol.name}</span>
                      {getTierIcon(kol.tier)}
                      <span className={cn("text-[9px] px-1.5 py-0.5 rounded border", getTierBadge(kol.tier))}>
                        {kol.tier.toUpperCase()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <a
                        href={`https://x.com/${kol.twitter}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] text-[var(--text-muted)] hover:text-[#1d9bf0]"
                      >
                        @{kol.twitter}
                      </a>
                      {kol.category && (
                        <>
                          <span className="text-[var(--text-dim)]">•</span>
                          <span className="text-[10px] text-[var(--text-dim)]">{kol.category}</span>
                        </>
                      )}
                    </div>
                    {kol.followers > 0 && (
                      <div className="flex items-center gap-1 mt-1">
                        <Users className="w-3 h-3 text-[var(--text-muted)]" />
                        <span className="text-[10px] text-[var(--text-muted)]">
                          {kol.followers >= 1000 ? `${(kol.followers / 1000).toFixed(0)}K` : kol.followers}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="text-right flex-shrink-0">
                    {kol.pnl !== 0 && (
                      <div className={cn(
                        "text-sm font-bold",
                        kol.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
                      )}>
                        {kol.pnl >= 0 ? "+" : ""}{formatUSD(kol.pnl)}
                      </div>
                    )}
                    {kol.winRate > 0 && (
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {kol.winRate.toFixed(1)}% win
                      </div>
                    )}
                    {kol.totalTrades > 0 && (
                      <div className="text-[10px] text-[var(--text-dim)]">
                        {kol.totalTrades} trades
                      </div>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-0.5 flex-shrink-0">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleWatchlist(kol.id) }}
                      className={cn(
                        "p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors",
                        watchlist.has(kol.id) ? "text-yellow-400" : "text-[var(--text-dim)]"
                      )}
                    >
                      {watchlist.has(kol.id) ? <Star className="w-3.5 h-3.5 fill-current" /> : <StarOff className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => copyWallet(kol.wallet, e)}
                      className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-dim)] hover:text-[var(--text-primary)]"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={`https://solscan.io/account/${kol.wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors text-[var(--text-dim)] hover:text-[var(--text-primary)]"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="p-2 border-t border-[var(--border-subtle)] flex items-center justify-between">
          <div className="text-[10px] text-[var(--text-muted)]">
            {(page - 1) * PER_PAGE + 1}-{Math.min(page * PER_PAGE, filteredKols.length)} of {filteredKols.length}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs disabled:opacity-50 hover:bg-[var(--bg-elevated)]"
            >
              Prev
            </button>
            <span className="text-xs text-[var(--text-muted)] px-2">{page}/{totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-xs disabled:opacity-50 hover:bg-[var(--bg-elevated)]"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Toast */}
      {copiedWallet && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] px-4 py-2 rounded-lg text-sm font-medium animate-in fade-in slide-in-from-bottom-2 z-50">
          Wallet copied!
        </div>
      )}
    </div>
  )
}
