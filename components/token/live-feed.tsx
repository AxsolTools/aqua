"use client"

import type { Trade } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface LiveFeedProps {
  trades: Trade[]
  tokenSymbol: string
}

export function LiveFeed({ trades, tokenSymbol }: LiveFeedProps) {
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)

    if (diffMins < 1) return "Just now"
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`
    return `${Math.floor(diffMins / 1440)}d ago`
  }

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--text-secondary)]">Live Feed</h3>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-[var(--text-muted)]">Real-time</span>
        </div>
      </div>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {trades.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-sm text-[var(--text-muted)]">No trades yet</p>
          </div>
        ) : (
          trades.map((trade) => (
            <div
              key={trade.id}
              className={cn(
                "flex items-center justify-between p-3 rounded-lg",
                trade.type === "buy" ? "bg-emerald-500/10" : "bg-red-500/10",
              )}
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium",
                    trade.type === "buy" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400",
                  )}
                >
                  {trade.type === "buy" ? "B" : "S"}
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">
                    {trade.amount_tokens?.toLocaleString(undefined, { maximumFractionDigits: 0 })} {tokenSymbol}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatAddress(trade.wallet_address)}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={cn("text-sm font-mono", trade.type === "buy" ? "text-emerald-400" : "text-red-400")}>
                  {trade.amount_sol?.toFixed(4)} SOL
                </p>
                <p className="text-xs text-[var(--text-muted)]">{formatTime(trade.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </GlassPanel>
  )
}
