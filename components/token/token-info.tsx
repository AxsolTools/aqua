"use client"

import type { Token } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"

interface TokenInfoProps {
  token: Token
}

export function TokenInfo({ token }: TokenInfoProps) {
  const formatNumber = (num: number | null | undefined) => {
    const n = num || 0
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(2)}K`
    return n.toFixed(0)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  }

  const migrationProgress = token.migration_threshold
    ? Math.min(100, ((token.current_liquidity || 0) / (token.migration_threshold || 1)) * 100)
    : 0

  return (
    <GlassPanel className="p-4 h-full">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Token Info</h3>

      {/* Compact grid layout */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Supply</span>
          <span className="font-medium text-[var(--text-primary)]">{formatNumber(token.total_supply || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Holders</span>
          <span className="font-medium text-[var(--aqua-primary)]">{formatNumber(token.holders || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Liquidity</span>
          <span className="font-medium text-[var(--text-primary)]">${formatNumber(token.current_liquidity || 0)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Created</span>
          <span className="font-medium text-[var(--text-primary)]">{formatDate(token.created_at)}</span>
        </div>
      </div>

      {/* Migration Progress (if bonding stage) - compact */}
      {token.stage === "bonding" && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-[var(--text-secondary)]">Migration</span>
            <span className="text-xs font-medium text-[var(--aqua-primary)]">{(migrationProgress || 0).toFixed(0)}%</span>
          </div>
          <div className="h-1.5 bg-[var(--ocean-surface)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--warm-pink)] transition-all duration-500"
              style={{ width: `${migrationProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Description - truncated */}
      {token.description && (
        <div className="mt-3 pt-3 border-t border-[var(--glass-border)]">
          <p className="text-xs text-[var(--text-primary)] leading-relaxed line-clamp-3">{token.description}</p>
        </div>
      )}
    </GlassPanel>
  )
}
