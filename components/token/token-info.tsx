"use client"

import type { Token } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"

interface TokenInfoProps {
  token: Token
}

export function TokenInfo({ token }: TokenInfoProps) {
  const formatNumber = (num: number) => {
    if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
    if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
    return num.toFixed(0)
  }

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
  }

  const migrationProgress = token.migration_threshold
    ? Math.min(100, ((token.current_liquidity || 0) / token.migration_threshold) * 100)
    : 0

  const infoItems = [
    { label: "Total Supply", value: formatNumber(token.total_supply || 0) },
    { label: "Holders", value: formatNumber(token.holders || 0) },
    { label: "Decimals", value: token.decimals?.toString() || "9" },
    { label: "Created", value: formatDate(token.created_at) },
    { label: "Liquidity", value: `$${formatNumber(token.current_liquidity || 0)}` },
    { label: "Bonding Curve", value: token.bonding_curve_type || "Linear" },
  ]

  return (
    <GlassPanel className="p-6">
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Token Information</h3>

      <div className="space-y-3">
        {infoItems.map((item, index) => (
          <div key={index} className="flex items-center justify-between">
            <span className="text-sm text-[var(--text-muted)]">{item.label}</span>
            <span className="text-sm font-medium text-[var(--text-primary)]">{item.value}</span>
          </div>
        ))}
      </div>

      {/* Migration Progress (if bonding stage) */}
      {token.stage === "bonding" && (
        <div className="mt-6 pt-4 border-t border-[var(--glass-border)]">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-[var(--text-secondary)]">Migration Progress</span>
            <span className="text-sm font-medium text-[var(--aqua-primary)]">{migrationProgress.toFixed(1)}%</span>
          </div>
          <div className="h-2 bg-[var(--ocean-surface)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--warm-pink)] transition-all duration-500"
              style={{ width: `${migrationProgress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            {formatNumber(token.current_liquidity || 0)} / {formatNumber(token.migration_threshold || 0)} SOL to migrate
          </p>
        </div>
      )}

      {/* Description */}
      {token.description && (
        <div className="mt-6 pt-4 border-t border-[var(--glass-border)]">
          <h4 className="text-sm text-[var(--text-secondary)] mb-2">About</h4>
          <p className="text-sm text-[var(--text-primary)] leading-relaxed">{token.description}</p>
        </div>
      )}
    </GlassPanel>
  )
}
