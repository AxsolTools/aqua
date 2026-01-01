"use client"

import Image from "next/image"
import type { KOL } from "@/lib/kol-data"
import { formatUSD } from "@/lib/kol-data"
import { cn } from "@/lib/utils"
import {
  X,
  Copy,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Target,
  Zap,
  Clock,
  Users,
  AlertTriangle,
  Shield,
  Twitter,
  Eye,
  BarChart2,
  Activity,
  Percent,
  DollarSign,
  Calendar,
  Flame,
} from "lucide-react"

interface Props {
  kol: KOL
  onClose: () => void
}

export function KOLProfilePanel({ kol, onClose }: Props) {
  const copyWallet = () => {
    navigator.clipboard.writeText(kol.wallet)
  }

  return (
    <div className="h-full flex flex-col bg-[var(--bg-primary)] border-l border-[var(--border-subtle)] overflow-y-auto">
      {/* Header */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <Image
                src={kol.avatar}
                alt={kol.name}
                width={64}
                height={64}
                className="rounded-full border-2 border-[var(--border-subtle)] object-cover"
                unoptimized
              />
              {kol.verified && (
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-[#1d9bf0] rounded-full flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl font-bold text-[var(--text-primary)]">{kol.name}</h3>
              <a
                href={`https://twitter.com/${kol.twitter}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-[#1d9bf0] hover:underline flex items-center gap-1"
              >
                <Twitter className="w-3 h-3" />@{kol.twitter}
              </a>
              <div className="text-xs text-[var(--text-muted)] mt-1">{kol.tradingStyle}</div>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 hover:bg-[var(--bg-secondary)] rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Wallet */}
        <div className="mt-4 flex items-center gap-2 bg-[var(--bg-secondary)] rounded-lg p-2">
          <code className="text-xs text-[var(--text-muted)] flex-1 truncate">{kol.wallet}</code>
          <button 
            onClick={copyWallet} 
            className="p-1.5 hover:bg-[var(--bg-elevated)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <Copy className="w-4 h-4" />
          </button>
          <a
            href={`https://solscan.io/account/${kol.wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-[var(--bg-elevated)] rounded text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>

        {/* Wash Trader Warning */}
        {kol.isWashTrader && (
          <div className="mt-3 bg-[var(--red)]/10 border border-[var(--red)]/30 rounded-lg p-3">
            <div className="flex items-center gap-2 text-[var(--red)] font-medium">
              <AlertTriangle className="w-4 h-4" />
              Wash Trading Detected
            </div>
            <p className="text-xs text-[var(--red)]/80 mt-1">
              This wallet shows patterns consistent with wash trading. Confidence: {kol.washScore.toFixed(0)}%
            </p>
          </div>
        )}
      </div>

      <div className="p-4 border-b border-[var(--border-subtle)]">
        <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Performance</h4>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)] mb-1">Total PNL</div>
            <div className={cn(
              "text-xl font-bold",
              kol.pnl >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
            )}>
              {kol.pnl >= 0 ? "+" : ""}
              {formatUSD(kol.pnl)}
            </div>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)] mb-1">7D PNL</div>
            <div
              className={cn(
                "text-xl font-bold flex items-center gap-1",
                kol.pnl7d >= 0 ? "text-[var(--green)]" : "text-[var(--red)]"
              )}
            >
              {kol.pnl7d >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {kol.pnl7d >= 0 ? "+" : ""}
              {formatUSD(kol.pnl7d)}
            </div>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)] mb-1">Win Rate</div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--aqua-primary)]" />
              <span className="text-xl font-bold text-[var(--text-primary)]">{kol.winRate.toFixed(1)}%</span>
            </div>
            <div className="mt-2 h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
              <div 
                className="h-full bg-[var(--aqua-primary)] rounded-full" 
                style={{ width: `${kol.winRate}%` }} 
              />
            </div>
          </div>
          <div className="bg-[var(--bg-secondary)] rounded-lg p-3">
            <div className="text-xs text-[var(--text-muted)] mb-1">Total Trades</div>
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-xl font-bold text-[var(--text-primary)]">{kol.totalTrades.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 border-b border-[var(--border-subtle)]">
        <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Advanced Analytics</h4>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <BarChart2 className="w-4 h-4" />
              <span className="text-sm">Sharpe Ratio</span>
            </div>
            <span
              className={cn(
                "font-medium",
                kol.sharpeRatio >= 1.5 ? "text-[var(--green)]" : kol.sharpeRatio >= 1 ? "text-yellow-400" : "text-[var(--red)]"
              )}
            >
              {kol.sharpeRatio.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Percent className="w-4 h-4" />
              <span className="text-sm">Max Drawdown</span>
            </div>
            <span className="text-[var(--red)] font-medium">-{kol.maxDrawdown.toFixed(1)}%</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Activity className="w-4 h-4" />
              <span className="text-sm">Profit Factor</span>
            </div>
            <span className={cn(
              "font-medium",
              kol.profitFactor >= 1.5 ? "text-[var(--green)]" : "text-yellow-400"
            )}>
              {kol.profitFactor.toFixed(2)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <DollarSign className="w-4 h-4" />
              <span className="text-sm">Avg Trade Size</span>
            </div>
            <span className="text-[var(--text-primary)] font-medium">{formatUSD(kol.avgTradeSize)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <TrendingUp className="w-4 h-4" />
              <span className="text-sm">Best Trade</span>
            </div>
            <span className="text-[var(--green)] font-medium">+{formatUSD(kol.bestTrade)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <TrendingDown className="w-4 h-4" />
              <span className="text-sm">Worst Trade</span>
            </div>
            <span className="text-[var(--red)] font-medium">{formatUSD(kol.worstTrade)}</span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-[var(--text-muted)]">
              <Flame className="w-4 h-4" />
              <span className="text-sm">Win Streak</span>
            </div>
            <span className="text-[var(--green)] font-medium">{kol.consecutiveWins}</span>
          </div>
        </div>
      </div>

      {/* Trading Info */}
      <div className="p-4 border-b border-[var(--border-subtle)] space-y-3">
        <h4 className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-3">Trading Info</h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Clock className="w-4 h-4" />
            <span className="text-sm">Avg Hold Time</span>
          </div>
          <span className="text-[var(--text-primary)] font-medium">{kol.avgHoldTime}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Calendar className="w-4 h-4" />
            <span className="text-sm">Active Hours</span>
          </div>
          <span className="text-[var(--text-primary)] font-medium text-xs">{kol.activeHours}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Users className="w-4 h-4" />
            <span className="text-sm">Copy Traders</span>
          </div>
          <span className="text-[var(--text-primary)] font-medium">{kol.copyTraders.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Eye className="w-4 h-4" />
            <span className="text-sm">Followers</span>
          </div>
          <span className="text-[var(--text-primary)] font-medium">{kol.followers.toLocaleString()}</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-[var(--text-muted)]">
            <Shield className="w-4 h-4" />
            <span className="text-sm">Risk Level</span>
          </div>
          <span
            className={cn(
              "font-medium capitalize",
              kol.riskLevel === "low"
                ? "text-[var(--green)]"
                : kol.riskLevel === "medium"
                  ? "text-yellow-400"
                  : kol.riskLevel === "high"
                    ? "text-orange-500"
                    : "text-[var(--red)]"
            )}
          >
            {kol.riskLevel}
          </span>
        </div>
      </div>

      {/* Favorite Tokens */}
      <div className="p-4 border-b border-[var(--border-subtle)]">
        <div className="text-xs text-[var(--text-muted)] mb-2">FAVORITE TOKENS</div>
        <div className="flex flex-wrap gap-2">
          {kol.favoriteTokens.map((token) => (
            <span 
              key={token} 
              className="px-2 py-1 bg-[var(--bg-secondary)] border border-[var(--border-subtle)] rounded text-sm text-[var(--text-primary)]"
            >
              {token}
            </span>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="p-4 mt-auto space-y-2">
        <a
          href={`https://birdeye.so/profile/${kol.wallet}?chain=solana`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--aqua-primary)] text-[var(--ocean-deep)] font-bold rounded-lg hover:bg-[var(--aqua-secondary)] transition-colors"
        >
          View on Birdeye
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={`https://dexscreener.com/solana?maker=${kol.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium rounded-lg border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors"
        >
          View on DexScreener
          <ExternalLink className="w-4 h-4" />
        </a>
        <a
          href={`https://gmgn.ai/sol/address/${kol.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-[var(--bg-secondary)] text-[var(--text-primary)] font-medium rounded-lg border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-colors"
        >
          View on GMGN
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>
    </div>
  )
}

