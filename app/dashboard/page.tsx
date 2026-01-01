"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/providers/auth-provider"
import { Header } from "@/components/layout/header"
import { 
  FintechCard, 
  FintechHeader, 
  MetricCard, 
  ProgressBar, 
  StatusBadge, 
  ActionButton,
  EmptyState 
} from "@/components/ui/fintech-card"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Token, TideHarvest } from "@/lib/types/database"
import { motion } from "framer-motion"
import { 
  Wallet, 
  Coins, 
  TrendingUp, 
  Droplets, 
  ExternalLink,
  Settings,
  Plus,
  BarChart3,
  Activity,
  Gift,
  X
} from "lucide-react"
import { TokenParametersPanel } from "@/components/dashboard/token-parameters-panel"
import { WaterLevelMeter } from "@/components/metrics/water-level-meter"
import { PourRateVisualizer } from "@/components/metrics/pour-rate-visualizer"
import { EvaporationTracker } from "@/components/metrics/evaporation-tracker"
import { ConstellationGauge } from "@/components/metrics/constellation-gauge"

export default function DashboardPage() {
  const { isAuthenticated, isLoading, mainWallet, sessionId, setIsOnboarding } = useAuth()
  const [createdTokens, setCreatedTokens] = useState<(Token & { harvest?: TideHarvest })[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [totalRewards, setTotalRewards] = useState(0)
  const [selectedTokenForManage, setSelectedTokenForManage] = useState<string | null>(null)

  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    console.log('[DASHBOARD] Auth state:', { 
      isAuthenticated, 
      hasMainWallet: !!mainWallet,
      sessionId: sessionId?.slice(0, 8)
    })
    
    if (isAuthenticated && mainWallet) {
      fetchCreatorData()
    } else if (!isLoading) {
      setDataLoading(false)
    }
  }, [isAuthenticated, mainWallet, sessionId, isLoading])

  // Refresh data when returning to dashboard (e.g., after token creation)
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthenticated && mainWallet) {
        console.log('[DASHBOARD] Window focused, refreshing data')
        fetchCreatorData()
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated, mainWallet])

  // Refresh data when returning to dashboard (e.g., after token creation)
  useEffect(() => {
    const handleFocus = () => {
      if (isAuthenticated && mainWallet) {
        console.log('[DASHBOARD] Window focused, refreshing data')
        fetchCreatorData()
      }
    }
    
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [isAuthenticated, mainWallet])

  const fetchCreatorData = async () => {
    if (!mainWallet) return
    setDataLoading(true)

    console.log('[DASHBOARD] Fetching tokens for wallet:', mainWallet.public_key?.slice(0, 8))

    try {
      const { data: tokens, error } = await supabase
        .from("tokens")
        .select("*, token_parameters(*)")
        .eq("creator_wallet", mainWallet.public_key)
        .order("created_at", { ascending: false })
      
      if (error) {
        console.error('[DASHBOARD] Token query error:', error)
      }
      
      console.log('[DASHBOARD] Tokens found:', tokens?.length || 0)

      if (tokens) {
        let rewards = 0
        const tokensWithHarvest = await Promise.all(
          tokens.map(async (token) => {
            let harvest = null
            let liveMarketCap = token.market_cap || 0
            
            // Fetch live market cap
            try {
              const priceResponse = await fetch(`/api/price/token?mint=${token.mint_address}&supply=${token.total_supply}&decimals=${token.decimals || 6}`)
              if (priceResponse.ok) {
                const priceData = await priceResponse.json()
                if (priceData.success && priceData.data?.marketCap) {
                  liveMarketCap = priceData.data.marketCap
                }
              }
            } catch {
              // Use DB market cap as fallback
            }
            
            // Fetch creator rewards from on-chain
            try {
              const rewardsResponse = await fetch(`/api/creator-rewards?tokenMint=${token.mint_address}&creatorWallet=${mainWallet.public_key}`)
              if (rewardsResponse.ok) {
                const rewardsData = await rewardsResponse.json()
                if (rewardsData.success && rewardsData.data?.balance > 0) {
                  rewards += rewardsData.data.balance
                  harvest = { 
                    total_accumulated: rewardsData.data.balance, 
                    total_claimed: 0,
                    vault_address: rewardsData.data.vaultAddress
                  }
                }
              }
            } catch (err) {
              console.debug('[DASHBOARD] Failed to fetch creator rewards:', err)
            }

            // Merge token_parameters metrics into token for easy access
            return { 
              ...token, 
              harvest,
              market_cap: liveMarketCap,
              pour_rate: token.token_parameters?.pour_rate_percent ?? 0,
              evaporation_rate: token.token_parameters?.evaporation_rate_percent ?? 0,
              total_evaporated: token.token_parameters?.total_evaporated ?? 0,
            }
          }),
        )

        setCreatedTokens(tokensWithHarvest)
        setTotalRewards(rewards)
      }
    } catch (err) {
      console.error("Failed to fetch creator data:", err)
    } finally {
      setDataLoading(false)
    }
  }

  const formatNumber = (num: number | null | undefined) => {
    const n = num || 0
    if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`
    if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`
    if (n >= 1e3) return `${(n / 1e3).toFixed(2)}K`
    return n.toFixed(4)
  }

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading dashboard...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-teal-950/20 pointer-events-none" />

      <Header />

      <div className="relative z-10 pt-20 pb-12 px-3 sm:px-4 lg:px-6">
        <div className="max-w-[1920px] mx-auto">
          {/* Dashboard Header */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
                    <BarChart3 className="w-5 h-5 text-teal-400" />
                  </div>
                  <h1 className="text-2xl font-bold text-zinc-100">Creator Dashboard</h1>
                </div>
                <p className="text-zinc-500">Your tokens. Your rewards. Real-time data.</p>
              </div>
              {mainWallet && (
                <div className="flex items-center gap-3">
                  <StatusBadge status="online" label="Connected" />
                  <span className="text-sm text-zinc-500 font-mono">
                    {mainWallet.public_key.slice(0, 6)}...{mainWallet.public_key.slice(-4)}
                  </span>
                </div>
              )}
            </div>
          </motion.div>

          {isAuthenticated && mainWallet ? (
            <>
              {/* Stats Overview */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8"
              >
                <MetricCard
                  label="Tokens Created"
                  value={createdTokens.length}
                  icon={<Coins className="w-4 h-4" />}
                />
                <MetricCard
                  label="Total Market Cap"
                  value={`$${formatNumber(createdTokens.reduce((sum, t) => sum + (t.market_cap || 0), 0))}`}
                  color="teal"
                  icon={<TrendingUp className="w-4 h-4" />}
                />
                <MetricCard
                  label="Total Liquidity"
                  value={formatNumber(createdTokens.reduce((sum, t) => sum + (t.current_liquidity || 0), 0))}
                  suffix="SOL"
                  icon={<Droplets className="w-4 h-4" />}
                />
                <MetricCard
                  label="24h Volume"
                  value={formatNumber(createdTokens.reduce((sum, t) => sum + (t.volume_24h || 0), 0))}
                  suffix="SOL"
                  icon={<Activity className="w-4 h-4" />}
                />
                <MetricCard
                  label="Claimable Rewards"
                  value={formatNumber(totalRewards)}
                  suffix="SOL"
                  color="amber"
                  icon={<Gift className="w-4 h-4" />}
                />
              </motion.div>

              {/* Aqua Metrics - Compact with Inline Animated Elements */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mb-6"
              >
                <FintechCard>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-semibold text-zinc-300">Liquidity Health</h3>
                    <span className="text-[10px] text-zinc-500">Live metrics</span>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    {/* Water Level - Compact */}
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-teal-400">💧</span>
                        <span className="text-[10px] text-zinc-400">Level</span>
                      </div>
                      <div className="h-16">
                        <WaterLevelMeter level={createdTokens[0]?.water_level || 75} size="sm" showLabel={true} />
                      </div>
                    </div>

                    {/* Pour Rate - Compact */}
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-cyan-400">💦</span>
                        <span className="text-[10px] text-zinc-400">Pour</span>
                      </div>
                      <div className="h-16">
                        <PourRateVisualizer rate={createdTokens[0]?.pour_rate || 1.5} />
                      </div>
                    </div>

                    {/* Evaporation - Compact */}
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-amber-400">🔥</span>
                        <span className="text-[10px] text-zinc-400">Burn</span>
                      </div>
                      <div className="h-16">
                        <EvaporationTracker 
                          totalEvaporated={createdTokens[0]?.total_evaporated || 0}
                          evaporationRate={createdTokens[0]?.evaporation_rate || 0.5}
                          symbol={createdTokens[0]?.symbol || "TOKEN"}
                        />
                      </div>
                    </div>

                    {/* Health Score - Compact */}
                    <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-purple-400">⭐</span>
                        <span className="text-[10px] text-zinc-400">Health</span>
                      </div>
                      <div className="h-16">
                        <ConstellationGauge strength={createdTokens[0]?.constellation_strength || 85} />
                      </div>
                    </div>

                    {/* Harvest - Compact */}
                    <div className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-amber-400">🎁</span>
                        <span className="text-[10px] text-amber-400">Harvest</span>
                      </div>
                      <div className="h-16 flex flex-col items-center justify-center">
                        <span className="text-lg font-bold text-amber-400">{formatNumber(totalRewards)}</span>
                        <span className="text-[10px] text-zinc-500">SOL</span>
                      </div>
                    </div>
                  </div>
                </FintechCard>
              </motion.div>

              {/* Token List - Compact */}
              {dataLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="flex items-center gap-2 text-zinc-500 text-sm">
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading tokens...</span>
                  </div>
                </div>
              ) : createdTokens.length === 0 ? (
                <FintechCard>
                  <EmptyState
                    icon={<Coins className="w-6 h-6" />}
                    title="Ready to Launch?"
                    description="Drop your first token and start collecting rewards."
                    action={
                      <Link href="/launch">
                        <ActionButton icon={<Plus className="w-4 h-4" />}>
                          Launch Token
                        </ActionButton>
                      </Link>
                    }
                  />
                </FintechCard>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {createdTokens.map((token, index) => (
                    <motion.div
                      key={token.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.1 + index * 0.05 }}
                    >
                      <FintechCard hover className="!p-4">
                        {/* Compact Header */}
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="relative w-8 h-8 rounded-lg bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/20 overflow-hidden flex-shrink-0">
                              {token.image_url ? (
                                <Image src={token.image_url} alt={token.name} fill className="object-cover" />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-xs font-bold text-teal-400">{token.symbol.slice(0, 2)}</span>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-semibold text-sm text-zinc-100 truncate">{token.name}</h3>
                              <p className="text-xs text-teal-400">${token.symbol}</p>
                            </div>
                          </div>
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium flex-shrink-0",
                            token.stage === "bonding" ? "bg-amber-500/10 text-amber-400" : "bg-green-500/10 text-green-400"
                          )}>
                            {token.stage === "bonding" ? "Bonding" : "DEX"}
                          </span>
                        </div>

                        {/* Compact Metrics Row */}
                        <div className="flex items-center gap-2 mb-3 text-xs">
                          <div className="flex-1 p-2 rounded bg-zinc-800/50 text-center">
                            <p className="text-zinc-500 text-[10px]">MCap</p>
                            <p className="font-semibold text-teal-400">${formatNumber(token.market_cap || 0)}</p>
                          </div>
                          <div className="flex-1 p-2 rounded bg-zinc-800/50 text-center">
                            <p className="text-zinc-500 text-[10px]">Vol 24h</p>
                            <p className="font-semibold text-zinc-200">{formatNumber(token.volume_24h || 0)}</p>
                          </div>
                          <div className="flex-1 p-2 rounded bg-zinc-800/50 text-center">
                            <p className="text-zinc-500 text-[10px]">Holders</p>
                            <p className="font-semibold text-zinc-200">{token.holders || 0}</p>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="mb-3">
                          <ProgressBar value={token.water_level} label="Water Level" color="teal" />
                        </div>

                        {/* Rewards + Actions Row */}
                        <div className="flex items-center gap-2">
                          {token.harvest && (
                            <div className="flex-1 p-2 rounded bg-amber-500/5 border border-amber-500/20 flex items-center justify-between">
                              <div>
                                <p className="text-[10px] text-zinc-500">Rewards</p>
                                <p className="text-sm font-bold text-amber-400">{formatNumber(token.harvest.total_accumulated - token.harvest.total_claimed)} SOL</p>
                              </div>
                              <button className="px-2 py-1 rounded bg-amber-500 text-[10px] font-semibold text-zinc-900 hover:bg-amber-400">Claim</button>
                            </div>
                          )}
                          <Link href={`/token/${token.mint_address}`} className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors">
                            <ExternalLink className="w-4 h-4 text-zinc-400" />
                          </Link>
                          <button 
                            onClick={() => setSelectedTokenForManage(token.mint_address)}
                            className="p-2 rounded bg-zinc-800 hover:bg-zinc-700 transition-colors"
                          >
                            <Settings className="w-4 h-4 text-zinc-400" />
                          </button>
                        </div>
                      </FintechCard>
                    </motion.div>
                  ))}
                </div>
              )}

              {/* Token Parameters Modal */}
              {selectedTokenForManage && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
                  onClick={() => setSelectedTokenForManage(null)}
                >
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="relative">
                      <button
                        onClick={() => setSelectedTokenForManage(null)}
                        className="absolute -top-2 -right-2 z-10 p-2 rounded-full bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                      >
                        <X className="w-4 h-4 text-zinc-400" />
                      </button>
                      <TokenParametersPanel tokenAddress={selectedTokenForManage} />
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </>
          ) : (
            <FintechCard>
              <EmptyState
                icon={<Wallet className="w-8 h-8" />}
                title="Connect Wallet"
                description="Link up to see your tokens and rewards."
                action={
                  <ActionButton onClick={() => setIsOnboarding(true)} icon={<Wallet className="w-4 h-4" />}>
                    Connect Wallet
                  </ActionButton>
                }
              />
            </FintechCard>
          )}
        </div>
      </div>
    </main>
  )
}
