"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import Link from "next/link"
import Image from "next/image"
import { motion, AnimatePresence } from "framer-motion"
import { cn } from "@/lib/utils"
import { Zap, Sparkles, ExternalLink, Copy, Check, ChevronRight, RefreshCw, Bell } from "lucide-react"

interface DexUpdate {
  type: 'boost' | 'profile'
  data: {
    tokenAddress: string
    chainId: string
    amount?: number
    totalAmount?: number
    name?: string
    description?: string
    url: string
    icon?: string
    timestamp?: number
  }
  tokenName?: string
  tokenSymbol?: string
  tokenLogo?: string
}

interface DexAlertsTickerProps {
  className?: string
  maxAlerts?: number
}

const DEXSCREENER_LOGO = "https://dexscreener.com/favicon.png"
const POLL_INTERVAL = 5000 // 5 seconds

export function DexAlertsTicker({ className, maxAlerts = 10 }: DexAlertsTickerProps) {
  const [updates, setUpdates] = useState<DexUpdate[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasNewAlerts, setHasNewAlerts] = useState(false)
  const previousCountRef = useRef(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchUpdates = useCallback(async () => {
    try {
      const res = await fetch('/api/dexscreener/updates?type=all&limit=20', {
        cache: 'no-store',
      })
      
      if (!res.ok) return
      
      const data = await res.json()
      
      if (data.success && data.data) {
        // Check for new alerts
        if (data.data.length > previousCountRef.current && previousCountRef.current > 0) {
          setHasNewAlerts(true)
          // Clear notification after 3 seconds
          setTimeout(() => setHasNewAlerts(false), 3000)
        }
        previousCountRef.current = data.data.length
        
        setUpdates(data.data.slice(0, maxAlerts))
      }
    } catch (error) {
      console.error('Failed to fetch DexScreener updates:', error)
    } finally {
      setIsLoading(false)
    }
  }, [maxAlerts])

  useEffect(() => {
    fetchUpdates()
    const interval = setInterval(fetchUpdates, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchUpdates])

  const copyAddress = (address: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    navigator.clipboard.writeText(address)
    setCopiedAddress(address)
    setTimeout(() => setCopiedAddress(null), 1500)
  }

  const formatTimeAgo = (timestamp?: number) => {
    if (!timestamp) return 'now'
    const seconds = Math.floor((Date.now() - timestamp) / 1000)
    if (seconds < 60) return `${seconds}s`
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
    return `${Math.floor(seconds / 3600)}h`
  }

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  if (isLoading && updates.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)]/50 rounded-lg border border-[var(--border-subtle)]", className)}>
        <RefreshCw className="w-3.5 h-3.5 text-[var(--aqua-primary)] animate-spin" />
        <span className="text-xs text-[var(--text-muted)]">Loading DexScreener alerts...</span>
      </div>
    )
  }

  if (updates.length === 0) {
    return (
      <div className={cn("flex items-center gap-2 px-3 py-2 bg-[var(--bg-secondary)]/50 rounded-lg border border-[var(--border-subtle)]", className)}>
        <Bell className="w-3.5 h-3.5 text-[var(--text-muted)]" />
        <span className="text-xs text-[var(--text-muted)]">No recent DexScreener updates</span>
      </div>
    )
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "relative bg-gradient-to-r from-[var(--bg-secondary)] to-[var(--bg-primary)] rounded-lg border overflow-hidden transition-all duration-300",
        hasNewAlerts ? "border-[var(--aqua-primary)] shadow-[0_0_10px_rgba(0,217,255,0.3)]" : "border-[var(--border-subtle)]",
        isExpanded ? "max-h-[300px]" : "max-h-[42px]",
        className
      )}
    >
      {/* Header Row - Always visible */}
      <div 
        className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--bg-elevated)]/30 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {/* DexScreener Badge */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <img 
            src={DEXSCREENER_LOGO} 
            alt="DexScreener" 
            className="w-4 h-4 rounded"
          />
          <span className="text-[10px] font-semibold text-[var(--text-muted)] uppercase tracking-wider">Live</span>
          {hasNewAlerts && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-2 h-2 rounded-full bg-[var(--aqua-primary)] animate-pulse"
            />
          )}
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-[var(--border-subtle)]" />

        {/* Scrolling Ticker Container */}
        <div className="flex-1 overflow-hidden relative">
          <div className="flex items-center gap-3 animate-none">
            <AnimatePresence mode="popLayout">
              {updates.slice(0, isExpanded ? maxAlerts : 5).map((update, index) => (
                <motion.div
                  key={`${update.data.tokenAddress}-${update.type}-${index}`}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  className="flex-shrink-0"
                >
                  <AlertItem
                    update={update}
                    copiedAddress={copiedAddress}
                    onCopy={copyAddress}
                    formatTimeAgo={formatTimeAgo}
                    truncateAddress={truncateAddress}
                    compact={!isExpanded}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Expand/Collapse Button */}
        <button className="flex-shrink-0 p-1 rounded hover:bg-[var(--bg-elevated)] transition-colors">
          <ChevronRight 
            className={cn(
              "w-4 h-4 text-[var(--text-muted)] transition-transform duration-200",
              isExpanded && "rotate-90"
            )} 
          />
        </button>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3 space-y-1.5 max-h-[250px] overflow-y-auto">
              {updates.map((update, index) => (
                <ExpandedAlertItem
                  key={`expanded-${update.data.tokenAddress}-${update.type}-${index}`}
                  update={update}
                  copiedAddress={copiedAddress}
                  onCopy={copyAddress}
                  formatTimeAgo={formatTimeAgo}
                  truncateAddress={truncateAddress}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// Compact Alert Item
function AlertItem({
  update,
  copiedAddress,
  onCopy,
  formatTimeAgo,
  truncateAddress,
  compact,
}: {
  update: DexUpdate
  copiedAddress: string | null
  onCopy: (address: string, e: React.MouseEvent) => void
  formatTimeAgo: (timestamp?: number) => string
  truncateAddress: (address: string) => string
  compact: boolean
}) {
  const isBoost = update.type === 'boost'
  
  return (
    <Link 
      href={`/token/${update.data.tokenAddress}`}
      className={cn(
        "flex items-center gap-1.5 px-2 py-1 rounded-md transition-all group",
        isBoost 
          ? "bg-yellow-500/10 hover:bg-yellow-500/20 border border-yellow-500/30"
          : "bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30"
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Type Icon */}
      {isBoost ? (
        <Zap className="w-3 h-3 text-yellow-400 flex-shrink-0" />
      ) : (
        <Sparkles className="w-3 h-3 text-purple-400 flex-shrink-0" />
      )}

      {/* Token Logo */}
      <div className="relative w-4 h-4 rounded-full overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)]">
        <Image
          src={update.tokenLogo || update.data.icon || `https://dd.dexscreener.com/ds-data/tokens/solana/${update.data.tokenAddress}.png`}
          alt={update.tokenSymbol || '?'}
          fill
          className="object-cover"
          unoptimized
          onError={(e) => {
            (e.target as HTMLImageElement).src = 
              `https://ui-avatars.com/api/?name=${update.tokenSymbol || '?'}&background=0a0a0a&color=00d9ff&size=32`
          }}
        />
      </div>

      {/* Token Symbol */}
      <span className="text-[10px] font-bold text-[var(--text-primary)] max-w-[60px] truncate">
        {update.tokenSymbol || truncateAddress(update.data.tokenAddress)}
      </span>

      {/* Boost Amount (for boosts only) */}
      {isBoost && (update.data as any).amount > 1 && (
        <span className="text-[8px] font-bold text-yellow-300 bg-yellow-500/20 px-1 rounded">
          x{(update.data as any).amount}
        </span>
      )}

      {/* Time */}
      {!compact && (
        <span className="text-[8px] text-[var(--text-dim)]">
          {formatTimeAgo(update.data.timestamp)}
        </span>
      )}
    </Link>
  )
}

// Expanded Alert Item
function ExpandedAlertItem({
  update,
  copiedAddress,
  onCopy,
  formatTimeAgo,
  truncateAddress,
}: {
  update: DexUpdate
  copiedAddress: string | null
  onCopy: (address: string, e: React.MouseEvent) => void
  formatTimeAgo: (timestamp?: number) => string
  truncateAddress: (address: string) => string
}) {
  const isBoost = update.type === 'boost'
  
  return (
    <div className={cn(
      "flex items-center gap-3 p-2 rounded-lg transition-all",
      isBoost 
        ? "bg-yellow-500/5 hover:bg-yellow-500/10 border border-yellow-500/20"
        : "bg-purple-500/5 hover:bg-purple-500/10 border border-purple-500/20"
    )}>
      {/* Type Badge */}
      <div className={cn(
        "flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase",
        isBoost ? "bg-yellow-500/20 text-yellow-400" : "bg-purple-500/20 text-purple-400"
      )}>
        {isBoost ? (
          <>
            <Zap className="w-2.5 h-2.5" />
            Boost
          </>
        ) : (
          <>
            <Sparkles className="w-2.5 h-2.5" />
            Profile
          </>
        )}
      </div>

      {/* Token Logo */}
      <div className="relative w-6 h-6 rounded-full overflow-hidden flex-shrink-0 bg-[var(--bg-secondary)]">
        <Image
          src={update.tokenLogo || update.data.icon || `https://dd.dexscreener.com/ds-data/tokens/solana/${update.data.tokenAddress}.png`}
          alt={update.tokenSymbol || '?'}
          fill
          className="object-cover"
          unoptimized
          onError={(e) => {
            (e.target as HTMLImageElement).src = 
              `https://ui-avatars.com/api/?name=${update.tokenSymbol || '?'}&background=0a0a0a&color=00d9ff&size=32`
          }}
        />
      </div>

      {/* Token Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[var(--text-primary)] truncate">
            {update.tokenSymbol || 'Unknown'}
          </span>
          {update.tokenName && (
            <span className="text-[10px] text-[var(--text-muted)] truncate hidden sm:block">
              {update.tokenName}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[9px] text-[var(--text-dim)] font-mono">
            {truncateAddress(update.data.tokenAddress)}
          </span>
          <button
            onClick={(e) => onCopy(update.data.tokenAddress, e)}
            className="p-0.5 rounded hover:bg-[var(--bg-elevated)] transition-colors"
          >
            {copiedAddress === update.data.tokenAddress ? (
              <Check className="w-2.5 h-2.5 text-[var(--green)]" />
            ) : (
              <Copy className="w-2.5 h-2.5 text-[var(--text-muted)]" />
            )}
          </button>
        </div>
      </div>

      {/* Boost Amount */}
      {isBoost && (
        <div className="text-right flex-shrink-0">
          <div className="text-xs font-bold text-yellow-400">
            +{(update.data as any).amount || 1}
          </div>
          <div className="text-[8px] text-[var(--text-muted)]">
            Total: {(update.data as any).totalAmount || (update.data as any).amount || 1}
          </div>
        </div>
      )}

      {/* Time */}
      <span className="text-[9px] text-[var(--text-dim)] flex-shrink-0">
        {formatTimeAgo(update.data.timestamp)}
      </span>

      {/* Actions */}
      <div className="flex items-center gap-1 flex-shrink-0">
        <Link
          href={`/token/${update.data.tokenAddress}`}
          className="p-1.5 rounded bg-[var(--aqua-primary)]/10 hover:bg-[var(--aqua-primary)]/20 transition-colors"
          title="View Token"
        >
          <ExternalLink className="w-3 h-3 text-[var(--aqua-primary)]" />
        </Link>
        <a
          href={update.data.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 rounded bg-[var(--bg-elevated)] hover:bg-[var(--bg-secondary)] transition-colors"
          title="View on DexScreener"
          onClick={(e) => e.stopPropagation()}
        >
          <img src="https://dexscreener.com/favicon.png" alt="DS" className="w-3 h-3" />
        </a>
      </div>
    </div>
  )
}

export default DexAlertsTicker

