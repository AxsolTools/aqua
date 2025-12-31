"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { Header } from "@/components/layout/header"
import { LiquidBackground } from "@/components/visuals/liquid-background"
import { GlassPanel } from "@/components/ui/glass-panel"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Token, Trade } from "@/lib/types/database"
import Link from "next/link"
import Image from "next/image"
import { motion } from "framer-motion"
import { ReferralPanel } from "@/components/profile/referral-panel"
import { PnLPanel } from "@/components/profile/pnl-panel"

type TabType = "portfolio" | "pnl" | "created" | "activity" | "referrals" | "settings"

export default function ProfilePage() {
  const { isAuthenticated, isLoading, wallets, mainWallet, activeWallet, setIsOnboarding } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>("portfolio")
  const [createdTokens, setCreatedTokens] = useState<Token[]>([])
  const [trades, setTrades] = useState<Trade[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({})
  const [balancesLoading, setBalancesLoading] = useState(false)
  
  // Settings state
  const [slippage, setSlippage] = useState<number>(1)
  const [customSlippage, setCustomSlippage] = useState<string>("")
  const [isCustomSlippage, setIsCustomSlippage] = useState(false)
  const [priorityFee, setPriorityFee] = useState<string>("medium")
  const [customPriorityFee, setCustomPriorityFee] = useState<string>("")
  const [isCustomPriorityFee, setIsCustomPriorityFee] = useState(false)

  const supabase = createClient()
  
  // Load settings from localStorage on mount
  useEffect(() => {
    const savedSlippage = localStorage.getItem("aqua_slippage")
    const savedPriorityFee = localStorage.getItem("aqua_priority_fee")
    const savedCustomSlippage = localStorage.getItem("aqua_custom_slippage")
    const savedCustomPriorityFee = localStorage.getItem("aqua_custom_priority_fee")
    
    if (savedSlippage) {
      const slippageValue = parseFloat(savedSlippage)
      if ([0.5, 1, 2, 5].includes(slippageValue)) {
        setSlippage(slippageValue)
        setIsCustomSlippage(false)
      } else {
        setSlippage(slippageValue)
        setCustomSlippage(savedSlippage)
        setIsCustomSlippage(true)
      }
    }
    
    if (savedPriorityFee) {
      if (["low", "medium", "high"].includes(savedPriorityFee)) {
        setPriorityFee(savedPriorityFee)
        setIsCustomPriorityFee(false)
        setCustomPriorityFee("")
      } else {
        setPriorityFee("custom")
        setCustomPriorityFee(savedPriorityFee)
        setIsCustomPriorityFee(true)
      }
    }
    
    if (savedCustomPriorityFee) {
      setCustomPriorityFee(savedCustomPriorityFee)
      setIsCustomPriorityFee(true)
      setPriorityFee("custom")
    }
  }, [])
  
  // Save slippage to localStorage
  const handleSlippageChange = (value: number) => {
    setSlippage(value)
    setIsCustomSlippage(false)
    setCustomSlippage("")
    localStorage.setItem("aqua_slippage", value.toString())
    localStorage.removeItem("aqua_custom_slippage")
  }
  
  // Save custom slippage to localStorage
  const handleCustomSlippageChange = (value: string) => {
    setCustomSlippage(value)
    if (value && !isNaN(parseFloat(value)) && parseFloat(value) > 0) {
      const numValue = parseFloat(value)
      setSlippage(numValue)
      setIsCustomSlippage(true)
      localStorage.setItem("aqua_slippage", numValue.toString())
      localStorage.setItem("aqua_custom_slippage", value)
    }
  }
  
  // Save priority fee to localStorage
  const handlePriorityFeeChange = (value: string) => {
    if (value === "custom") {
      setPriorityFee("custom")
      setIsCustomPriorityFee(true)
      // Keep existing custom value if available
      if (!customPriorityFee) {
        setCustomPriorityFee("")
      }
    } else {
      setPriorityFee(value)
      setIsCustomPriorityFee(false)
      setCustomPriorityFee("")
      localStorage.setItem("aqua_priority_fee", value)
      localStorage.removeItem("aqua_custom_priority_fee")
    }
  }
  
  // Save custom priority fee to localStorage
  const handleCustomPriorityFeeChange = (value: string) => {
    setCustomPriorityFee(value)
    if (value && !isNaN(parseFloat(value)) && parseFloat(value) >= 0) {
      setIsCustomPriorityFee(true)
      setPriorityFee("custom")
      localStorage.setItem("aqua_priority_fee", value)
      localStorage.setItem("aqua_custom_priority_fee", value)
    }
  }

  useEffect(() => {
    if (isAuthenticated && activeWallet) {
      fetchUserData()
    }
  }, [isAuthenticated, activeWallet])

  const fetchWalletBalances = useCallback(async () => {
    if (wallets.length === 0) return
    setBalancesLoading(true)
    try {
      const addresses = wallets.map(w => w.public_key)
      const response = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      })
      const data = await response.json()
      if (data.success && data.data?.balances) {
        const newBalances: Record<string, number> = {}
        data.data.balances.forEach((balance: { address: string; balanceSol: number }) => {
          const wallet = wallets.find(w => w.public_key === balance.address)
          if (wallet) {
            newBalances[wallet.id] = balance.balanceSol || 0
          }
        })
        setWalletBalances(newBalances)
      }
    } catch (error) {
      console.error("[PROFILE] Failed to fetch wallet balances:", error)
    } finally {
      setBalancesLoading(false)
    }
  }, [wallets])

  // Fetch wallet balances
  useEffect(() => {
    if (isAuthenticated && wallets.length > 0) {
      fetchWalletBalances()
      
      // Refresh balances every 30 seconds
      const interval = setInterval(fetchWalletBalances, 30000)
      return () => clearInterval(interval)
    }
  }, [isAuthenticated, wallets, fetchWalletBalances])

  // Calculate total balance
  const totalBalance = Object.values(walletBalances).reduce((sum, balance) => sum + balance, 0)

  const fetchUserData = async () => {
    if (!activeWallet) return
    setDataLoading(true)

    try {
      const { data: created } = await supabase
        .from("tokens")
        .select("*")
        .eq("creator_wallet", activeWallet.public_key)
        .order("created_at", { ascending: false })

      if (created) {
        // Fetch live market caps for created tokens
        const tokensWithLiveData = await Promise.all(
          created.map(async (token) => {
            try {
              const priceResponse = await fetch(`/api/price/token?mint=${token.mint_address}&supply=${token.total_supply}&decimals=${token.decimals || 6}`)
              if (priceResponse.ok) {
                const priceData = await priceResponse.json()
                if (priceData.success && priceData.data?.marketCap) {
                  return { ...token, market_cap: priceData.data.marketCap }
                }
              }
            } catch {
              // Use DB market cap as fallback
            }
            return token
          })
        )
        setCreatedTokens(tokensWithLiveData)
      }

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

        <div className="pt-20 pb-12 px-3 sm:px-4 lg:px-6">
          <div className="max-w-[1920px] mx-auto">
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
                  {(["portfolio", "pnl", "created", "activity", "referrals", "settings"] as TabType[]).map((tab) => (
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
                      {tab === "pnl" ? "P&L" : tab.charAt(0).toUpperCase() + tab.slice(1)}
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
                  {activeTab === "pnl" && (
                    <PnLPanel />
                  )}

                  {activeTab === "portfolio" && (
                    <div className="space-y-6">
                      {/* Wallet Overview */}
                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                        <GlassPanel className="p-6">
                          <p className="text-sm text-[var(--text-muted)] mb-1">Total Wallets</p>
                          <p className="text-3xl font-bold text-[var(--text-primary)]">{wallets.length}</p>
                        </GlassPanel>
                        <GlassPanel className="p-6" glow="aqua">
                          <p className="text-sm text-[var(--text-muted)] mb-1">Total Balance</p>
                          {balancesLoading ? (
                            <p className="text-3xl font-bold text-[var(--aqua-primary)]">...</p>
                          ) : (
                            <p className="text-3xl font-bold text-[var(--aqua-primary)]">
                              {totalBalance.toFixed(4)} SOL
                            </p>
                          )}
                        </GlassPanel>
                        <GlassPanel className="p-6">
                          <p className="text-sm text-[var(--text-muted)] mb-1">Tokens Created</p>
                          <p className="text-3xl font-bold text-[var(--text-primary)]">{createdTokens.length}</p>
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
                                <div className="flex-1">
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
                                  <p className="text-sm font-mono text-[var(--text-secondary)] mb-2">
                                    {formatAddress(wallet.public_key)}
                                  </p>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-[var(--text-muted)]">Balance:</span>
                                    {balancesLoading ? (
                                      <span className="text-xs text-[var(--text-secondary)]">Loading...</span>
                                    ) : (
                                      <span className="text-sm font-semibold text-[var(--aqua-primary)]">
                                        {walletBalances[wallet.id] !== undefined 
                                          ? `${walletBalances[wallet.id].toFixed(4)} SOL`
                                          : "—"
                                        }
                                      </span>
                                    )}
                                  </div>
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
                                  <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] overflow-hidden">
                                    {token.image_url ? (
                                      <Image
                                        src={token.image_url}
                                        alt={token.name}
                                        fill
                                        className="object-cover"
                                      />
                                    ) : (
                                      <div className="absolute inset-0 flex items-center justify-center">
                                        <span className="text-[var(--ocean-deep)] font-bold">
                                          {token.symbol.slice(0, 2)}
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <h3 className="font-semibold text-[var(--text-primary)]">{token.name}</h3>
                                    <div className="flex items-center gap-2">
                                      <p className="text-sm text-[var(--text-secondary)]">${token.symbol}</p>
                                      <span className="text-[10px] text-[var(--text-muted)]">•</span>
                                      <p className="text-[10px] text-[var(--aqua-primary)]">
                                        MCap: ${formatNumber(token.market_cap || 0)}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {formatNumber(token.market_cap)} SOL
                                  </p>
                                  <p
                                    className={cn(
                                      "text-xs",
                                      (token.change_24h || 0) >= 0 ? "text-[var(--success)]" : "text-[var(--error)]",
                                    )}
                                  >
                                    {(token.change_24h || 0) >= 0 ? "+" : ""}
                                    {(token.change_24h || 0).toFixed(2)}%
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
                                    trade.trade_type === "buy" ? "bg-[var(--success)]/20" : "bg-[var(--error)]/20",
                                  )}
                                >
                                  <svg
                                    width="14"
                                    height="14"
                                    viewBox="0 0 14 14"
                                    fill="none"
                                    stroke={trade.trade_type === "buy" ? "var(--success)" : "var(--error)"}
                                    strokeWidth="2"
                                  >
                                    <path
                                      d={trade.trade_type === "buy" ? "M7 11V3M3 7l4-4 4 4" : "M7 3v8M3 7l4 4 4-4"}
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                    />
                                  </svg>
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {trade.trade_type === "buy" ? "Bought" : "Sold"}
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
                          <div className="flex gap-2 mb-3">
                            {[0.5, 1, 2, 5].map((value) => (
                              <button
                                key={value}
                                onClick={() => handleSlippageChange(value)}
                                className={cn(
                                  "px-4 py-2 rounded-lg border text-sm transition-colors",
                                  !isCustomSlippage && slippage === value
                                    ? "border-[var(--aqua-primary)] bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]"
                                    : "border-[var(--glass-border)] text-[var(--text-primary)] hover:border-[var(--aqua-primary)]/50"
                                )}
                              >
                                {value}%
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="number"
                              min="0"
                              max="100"
                              step="0.1"
                              value={isCustomSlippage ? customSlippage : ""}
                              onChange={(e) => handleCustomSlippageChange(e.target.value)}
                              onFocus={() => setIsCustomSlippage(true)}
                              placeholder="Custom %"
                              className="flex-1 px-4 py-2 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]"
                            />
                            <span className="text-sm text-[var(--text-secondary)]">%</span>
                          </div>
                          {isCustomSlippage && customSlippage && (
                            <p className="text-xs text-[var(--text-muted)] mt-1">
                              Current: {parseFloat(customSlippage) || slippage}%
                            </p>
                          )}
                        </div>

                        <div>
                          <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                            Priority Fee
                          </label>
                          <select
                            value={priorityFee}
                            onChange={(e) => handlePriorityFeeChange(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)] mb-3"
                          >
                            <option value="low">Low (0.0001 SOL)</option>
                            <option value="medium">Medium (0.0005 SOL)</option>
                            <option value="high">High (0.001 SOL)</option>
                            <option value="custom">Custom</option>
                          </select>
                          {priorityFee === "custom" && (
                            <div className="flex items-center gap-2">
                              <input
                                type="number"
                                min="0"
                                step="0.0001"
                                value={isCustomPriorityFee ? customPriorityFee : ""}
                                onChange={(e) => handleCustomPriorityFeeChange(e.target.value)}
                                onFocus={() => setIsCustomPriorityFee(true)}
                                placeholder="0.0001"
                                className="flex-1 px-4 py-2 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)]"
                              />
                              <span className="text-sm text-[var(--text-secondary)]">SOL</span>
                            </div>
                          )}
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
