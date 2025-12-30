"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { Header } from "@/components/layout/header"
import { LiquidBackground } from "@/components/visuals/liquid-background"
import { GlassPanel } from "@/components/ui/glass-panel"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Token, Trade } from "@/lib/types/database"
import Link from "next/link"
import { motion } from "framer-motion"
import { ReferralPanel } from "@/components/profile/referral-panel"

type TabType = "portfolio" | "created" | "activity" | "referrals" | "settings"

export default function ProfilePage() {
  const { isAuthenticated, isLoading, wallets, mainWallet, activeWallet, setIsOnboarding } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>("portfolio")
  const [createdTokens, setCreatedTokens] = useState<Token[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const supabase = createClient()

  useEffect(() => {
    if (isAuthenticated && activeWallet) {
      fetchUserData()
    }
  }, [isAuthenticated, activeWallet])

  const fetchUserData = async () => {
    if (!activeWallet) return
    setDataLoading(true)

    try {
      const { data: created } = await supabase
        .from("tokens")
        .select("*")
        .eq("creator_wallet", activeWallet.public_key)
        .order("created_at", { ascending: false })

      if (created) setCreatedTokens(created)

      const { data: tradeHistory } = await supabase
        .from("trades")
        .select("*")
        .eq("wallet_address", activeWallet.public_key)
        .order("created_at", { ascending: false })
        .limit(50)

      if (tradeHistory) setTrades(tradeHistory)
    } catch (err) {
      console.error("Failed to fetch user data:", err)
    } finally {
      setDataLoading(false)
    }
  }

  const formatAddress = (address: string) => `${address.slice(0, 6)}...${address.slice(-6)}`
  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return num.toFixed(2)
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
      </main>
    )
  }

  return (
    <main className="min-h-screen relative overflow-hidden">
      <LiquidBackground />

      <div className="relative z-10">
        <Header />

        <div className="pt-28 pb-12 px-4 sm:px-6">
          <div className="max-w-6xl mx-auto">
            {/* Profile Header */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center shadow-lg shadow-[var(--aqua-primary)]/20">
                    <svg width="32" height="32" viewBox="0 0 32 32" fill="var(--ocean-deep)">
                      <path d="M16 4C16 4 8 14 8 20C8 24.4 11.6 28 16 28C20.4 28 24 24.4 24 20C24 14 16 4 16 4Z" />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-[var(--text-primary)]">Harbor</h1>
                    {mainWallet && (
                      <p className="text-sm font-mono text-[var(--text-secondary)]">
                        {formatAddress(mainWallet.public_key)}
                      </p>
                    )}
                  </div>
                </div>

                {!isAuthenticated && (
                  <button onClick={() => setIsOnboarding(true)} className="btn-primary">
                    Connect Wallet
                  </button>
                )}
              </div>
            </motion.div>

            {isAuthenticated ? (
              <>
                {/* Tabs */}
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="flex gap-2 mb-6 overflow-x-auto pb-2 scrollbar-hide"
                >
                  {(["portfolio", "created", "activity", "referrals", "settings"] as TabType[]).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveTab(tab)}
                      className={cn(
                        "px-5 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all",
                        activeTab === tab
                          ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)] shadow-lg shadow-[var(--aqua-primary)]/30"
                          : "glass-panel text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
                      )}
                    >
                      {tab.charAt(0).toUpperCase() + tab.slice(1)}
                    </button>
                  ))}
                </motion.div>

                {/* Tab Content */}
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "portfolio" && (
                    <div className="space-y-6">
                      {/* Wallet Overview */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <GlassPanel className="p-6">
                          <p className="text-sm text-[var(--text-muted)] mb-1">Total Wallets</p>
                          <p className="text-3xl font-bold text-[var(--text-primary)]">{wallets.length}</p>
                        </GlassPanel>
                        <GlassPanel className="p-6" glow="aqua">
                          <p className="text-sm text-[var(--text-muted)] mb-1">Tokens Created</p>
                          <p className="text-3xl font-bold text-[var(--aqua-primary)]">{createdTokens.length}</p>
                        </GlassPanel>
                        <GlassPanel className="p-6">
                          <p className="text-sm text-[var(--text-muted)] mb-1">Total Trades</p>
                          <p className="text-3xl font-bold text-[var(--text-primary)]">{trades.length}</p>
                        </GlassPanel>
                      </div>

                      {/* Connected Wallets */}
                      <GlassPanel className="p-6">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Connected Wallets</h2>
                        <div className="space-y-3">
                          {wallets.map((wallet) => (
                            <div
                              key={wallet.id}
                              className={cn(
                                "p-4 rounded-xl border transition-all",
                                wallet.is_primary
                                  ? "border-[var(--aqua-primary)]/50 bg-[var(--aqua-subtle)]/20"
                                  : "border-[var(--glass-border)] bg-[var(--ocean-surface)]/30",
                              )}
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-sm font-medium text-[var(--text-primary)]">
                                      {wallet.label || "Wallet"}
                                    </span>
                                    {wallet.is_primary && (
                                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] font-medium uppercase">
                                        Main
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-mono text-[var(--text-secondary)]">
                                    {formatAddress(wallet.public_key)}
                                  </p>
                                </div>
                                <button
                                  onClick={() => navigator.clipboard.writeText(wallet.public_key)}
                                  className="p-2 rounded-lg hover:bg-[var(--ocean-surface)] transition-colors"
                                  title="Copy address"
                                >
                                  <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 16 16"
                                    fill="none"
                                    stroke="var(--text-muted)"
                                    strokeWidth="2"
                                  >
                                    <rect x="5" y="5" width="9" height="9" rx="1" />
                                    <path d="M11 5V3a1 1 0 00-1-1H3a1 1 0 00-1 1v7a1 1 0 001 1h2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </GlassPanel>
                    </div>
                  )}

                  {activeTab === "created" && (
                    <div className="space-y-4">
                      {dataLoading ? (
                        <div className="text-center py-12">
                          <div className="w-6 h-6 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                      ) : createdTokens.length === 0 ? (
                        <GlassPanel className="p-12 text-center">
                          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--ocean-surface)] flex items-center justify-center">
                            <svg
                              width="24"
                              height="24"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="var(--text-muted)"
                              strokeWidth="2"
                            >
                              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                            </svg>
                          </div>
                          <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">No tokens yet</h3>
                          <p className="text-sm text-[var(--text-secondary)] mb-6">
                            Launch your first token with AQUA liquidity mechanics
                          </p>
                          <Link href="/launch" className="btn-primary inline-flex">
                            Launch Token
                          </Link>
                        </GlassPanel>
                      ) : (
                        createdTokens.map((token) => (
                          <Link key={token.id} href={`/token/${token.mint_address}`}>
                            <GlassPanel className="p-5 hover:border-[var(--aqua-primary)]/50 transition-all cursor-pointer">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center text-[var(--ocean-deep)] font-bold">
                                    {token.symbol.slice(0, 2)}
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-[var(--text-primary)]">{token.name}</h3>
                                    <p className="text-sm text-[var(--text-secondary)]">${token.symbol}</p>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {formatNumber(token.market_cap)} SOL
                                  </p>
                                  <p
                                    className={cn(
                                      "text-xs",
                                      token.change_24h >= 0 ? "text-[var(--success)]" : "text-[var(--error)]",
                                    )}
                                  >
                                    {token.change_24h >= 0 ? "+" : ""}
                                    {token.change_24h.toFixed(2)}%
                                  </p>
                                </div>
                              </div>
                            </GlassPanel>
                          </Link>
                        ))
                      )}
                    </div>
                  )}

                  {activeTab === "activity" && (
                    <GlassPanel className="p-6">
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-4">Recent Activity</h2>
                      {dataLoading ? (
                        <div className="text-center py-8">
                          <div className="w-6 h-6 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin mx-auto" />
                        </div>
                      ) : trades.length === 0 ? (
                        <p className="text-center py-8 text-[var(--text-muted)]">No trading activity yet</p>
                      ) : (
                        <div className="space-y-2">
                          {trades.map((trade) => (
                            <div
                              key={trade.id}
                              className="flex items-center justify-between py-3 border-b border-[var(--glass-border)] last:border-0"
                            >
                              <div className="flex items-center gap-3">
                                <div
                                  className={cn(
                                    "w-8 h-8 rounded-lg flex items-center justify-center",
                                    trade.type === "buy" ? "bg-[var(--success)]/20" : "bg-[var(--error)]/20",
                                  )}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    stroke={trade.type === "buy" ? "var(--success)" : "var(--error)"}
                                    strokeWidth="2"
                                  >
                                    <path
                                      d={trade.type === "buy" ? "M7 11V3M3 7l4-4 4 4" : "M7 3v8M3 7l4 4 4-4"}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {trade.type === "buy" ? "Bought" : "Sold"}
                                  </p>
                                  <p className="text-xs text-[var(--text-muted)]">
                                    {new Date(trade.created_at).toLocaleDateString()}
                                  </p>
                                </div>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-medium text-[var(--text-primary)]">
                                  {formatNumber(trade.amount_tokens)}
                                </p>
                                <p className="text-xs text-[var(--text-secondary)]">
                                  {trade.amount_sol.toFixed(4)} SOL
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </GlassPanel>
                  )}

                  {activeTab === "referrals" && (
                    <ReferralPanel />
                  )}

                  {activeTab === "settings" && (
                    <GlassPanel className="p-6">
                      <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-6">Settings</h2>
                      <div className="space-y-6">
                        <div>
                          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                            Default Slippage
                          </label>
                          <div className="flex gap-2">
                            {[0.5, 1, 2, 5].map((value) => (
                              <button
                                key={value}
                                className="px-4 py-2 rounded-lg border border-[var(--glass-border)] text-sm text-[var(--text-primary)] hover:border-[var(--aqua-primary)]/50 transition-colors"
                              >
                                {value}%
                              </button>
                            ))}
                          </div>
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                            Priority Fee
                          </label>
                          <select className="w-full px-4 py-3 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]">
                            <option value="low">Low (0.0001 SOL)</option>
                            <option value="medium">Medium (0.0005 SOL)</option>
                            <option value="high">High (0.001 SOL)</option>
                          </select>
                        </div>
                      </div>
                    </GlassPanel>
                  )}
                </motion.div>
              </>
            ) : (
              <GlassPanel className="p-12 text-center max-w-lg mx-auto">
                <div className="w-20 h-20 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--warm-coral)]/20 flex items-center justify-center">
                  <svg
                    width="32"
                    height="32"
                    viewBox="0 0 32 32"
                    fill="none"
                    stroke="var(--aqua-primary)"
                    strokeWidth="2"
                  >
                    <rect x="4" y="8" width="24" height="16" rx="3" />
                    <circle cx="18" cy="16" r="2" fill="var(--aqua-primary)" stroke="none" />
                  </svg>
                </div>
                <h2 className="text-xl font-bold text-[var(--text-primary)] mb-2">Connect Your Wallet</h2>
                <p className="text-[var(--text-secondary)] mb-6">View your portfolio, created tokens, and activity</p>
                <button onClick={() => setIsOnboarding(true)} className="btn-primary">
                  Connect Wallet
                </button>
              </GlassPanel>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
