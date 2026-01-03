"use client"

import { useState, useEffect, useRef } from "react"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"

interface EarnStats {
  totalTvlUsd: number
  totalPropelDeposited: number
  totalYieldEarnedUsd: number
  activePositions: number
  totalUniqueUsers: number
  volume24hUsd: number
  avgApy: number
  activity24h: number
  lastUpdated: string
}

interface TickerItem {
  id: string
  icon: string
  label: string
  value: string
  color: string
}

export function EarnTicker() {
  const [stats, setStats] = useState<EarnStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isPaused, setIsPaused] = useState(false)
  const tickerRef = useRef<HTMLDivElement>(null)

  // Fetch stats
  const fetchStats = async () => {
    try {
      const response = await fetch('/api/earn/stats')
      const data = await response.json()
      
      if (data.success) {
        setStats(data.data)
      }
    } catch (err) {
      console.debug('[EARN-TICKER] Failed to fetch stats:', err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    
    // Poll every 30 seconds
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [])

  // Format numbers
  const formatUsd = (num: number) => {
    if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
    return `$${num.toFixed(2)}`
  }

  const formatNumber = (num: number) => {
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toLocaleString()
  }

  // Build ticker items
  const tickerItems: TickerItem[] = stats ? [
    {
      id: 'tvl',
      icon: '🔒',
      label: 'TVL',
      value: formatUsd(stats.totalTvlUsd),
      color: 'text-[var(--aqua-primary)]',
    },
    {
      id: 'apy',
      icon: '📈',
      label: 'Avg APY',
      value: `${stats.avgApy.toFixed(2)}%`,
      color: 'text-[var(--green)]',
    },
    {
      id: 'propel',
      icon: '🚀',
      label: 'PROPEL Deposited',
      value: formatNumber(stats.totalPropelDeposited),
      color: 'text-[var(--warm-pink)]',
    },
    {
      id: 'positions',
      icon: '⚡',
      label: 'Active Positions',
      value: stats.activePositions.toLocaleString(),
      color: 'text-amber-400',
    },
    {
      id: 'earned',
      icon: '✨',
      label: 'Total Earned',
      value: formatUsd(stats.totalYieldEarnedUsd),
      color: 'text-[var(--green)]',
    },
    {
      id: 'volume',
      icon: '💰',
      label: '24h Volume',
      value: formatUsd(stats.volume24hUsd),
      color: 'text-purple-400',
    },
    {
      id: 'users',
      icon: '👥',
      label: 'Users',
      value: stats.totalUniqueUsers.toLocaleString(),
      color: 'text-blue-400',
    },
  ] : []

  // Duplicate items for seamless loop
  const duplicatedItems = [...tickerItems, ...tickerItems, ...tickerItems]

  if (isLoading) {
    return (
      <div className="h-10 bg-[var(--bg-card)]/50 border-b border-[var(--border-subtle)] flex items-center justify-center">
        <div className="flex items-center gap-2 text-[var(--text-muted)] text-xs">
          <div className="w-3 h-3 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
          <span>Loading stats...</span>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  return (
    <div 
      className="relative h-10 bg-gradient-to-r from-[var(--bg-card)] via-[var(--bg-elevated)] to-[var(--bg-card)] border-b border-[var(--border-subtle)] overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Gradient overlays for fade effect */}
      <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />
      <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-[var(--bg-card)] to-transparent z-10 pointer-events-none" />
      
      {/* Live indicator */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--green)]/10 border border-[var(--green)]/20">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)] animate-pulse" />
        <span className="text-[9px] font-medium text-[var(--green)] uppercase tracking-wider">Live</span>
      </div>
      
      {/* Scrolling ticker */}
      <div 
        ref={tickerRef}
        className={cn(
          "flex items-center h-full pl-24",
          !isPaused && "animate-ticker"
        )}
        style={{
          animationPlayState: isPaused ? 'paused' : 'running',
        }}
      >
        {duplicatedItems.map((item, index) => (
          <div
            key={`${item.id}-${index}`}
            className="flex items-center gap-2 px-6 whitespace-nowrap"
          >
            <span className="text-sm">{item.icon}</span>
            <span className="text-xs text-[var(--text-muted)]">{item.label}:</span>
            <span className={cn("text-sm font-semibold tabular-nums", item.color)}>
              {item.value}
            </span>
            <span className="text-[var(--border-subtle)] mx-2">•</span>
          </div>
        ))}
      </div>
      
      {/* CSS for ticker animation */}
      <style jsx>{`
        @keyframes ticker {
          0% {
            transform: translateX(0);
          }
          100% {
            transform: translateX(-33.333%);
          }
        }
        .animate-ticker {
          animation: ticker 40s linear infinite;
        }
      `}</style>
    </div>
  )
}

