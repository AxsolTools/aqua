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
  Users, 
  Droplets, 
  Flame, 
  Star,
  Gift,
  ExternalLink,
  Settings,
  Plus,
  BarChart3,
  Activity,
  X
} from "lucide-react"
import { TokenParametersPanel } from "@/components/dashboard/token-parameters-panel"
import { WaterLevelMeter } from "@/components/metrics/water-level-meter"
import { PourRateVisualizer } from "@/components/metrics/pour-rate-visualizer"
import { EvaporationTracker } from "@/components/metrics/evaporation-tracker"
import { ConstellationGauge } from "@/components/metrics/constellation-gauge"
import { TideHarvestCard } from "@/components/metrics/tide-harvest-card"

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
            const { data: harvest } = await supabase.from("tide_harvests").select("*").eq("token_id", token.id).single()

            if (harvest) {
              rewards += harvest.total_accumulated - harvest.total_claimed
            }

            // Merge token_parameters metrics into token for easy access
            return { 
              ...token, 
              harvest,
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

  const formatNumber = (num: number) => {
    if (num >= 1e9) return `${(num / 1e9).toFixed(2)}B`
    if (num >= 1e6) return `${(num / 1e6).toFixed(2)}M`
    if (num >= 1e3) return `${(num / 1e3).toFixed(2)}K`
    return num.toFixed(4)
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

              {/* Aqua Metrics */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                className="mb-8"
              >
                <FintechCard>
                  <FintechHeader 
                    title="Liquidity Health" 
                    subtitle="Live stats from your active tokens"
                  />
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {/* Water Level - Animated */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 overflow-hidden">
                      <div className="flex items-center gap-2 mb-3">
                        <Droplets className="w-4 h-4 text-teal-400" />
                        <span className="text-xs font-medium text-zinc-400">Water Level</span>
                      </div>
                      <WaterLevelMeter 
                        level={createdTokens[0]?.water_level || 75} 
                        size="md" 
                        showLabel={true}
                      />
                      <p className="text-xs text-zinc-500 mt-2 text-center">Liquidity Depth</p>
                    </div>

                    {/* Pour Rate - Animated */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 overflow-hidden">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-medium text-zinc-400">Pour Rate</span>
                      </div>
                      <PourRateVisualizer rate={createdTokens[0]?.pour_rate || 1.5} />
                    </div>

                    {/* Evaporation - Animated */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 overflow-hidden">
                      <div className="flex items-center gap-2 mb-3">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-medium text-zinc-400">Evaporation</span>
                      </div>
                      <EvaporationTracker 
                        totalEvaporated={createdTokens[0]?.total_evaporated || 0}
                        evaporationRate={createdTokens[0]?.evaporation_rate || 0.5}
                        symbol={createdTokens[0]?.symbol || "TOKEN"}
                      />
                    </div>

                    {/* Constellation - Animated */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700 overflow-hidden">
                      <div className="flex items-center gap-2 mb-3">
                        <Star className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-medium text-zinc-400">Health Score</span>
                      </div>
                      <div className="h-28">
                        <ConstellationGauge strength={createdTokens[0]?.constellation_strength || 85} />
                      </div>
                    </div>

                    {/* Tide Harvest - Animated */}
                    <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 overflow-hidden">
                      <div className="flex items-center gap-2 mb-3">
                        <Gift className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-medium text-amber-400">Harvest</span>
                      </div>
                      {createdTokens[0] ? (
                        <TideHarvestCard 
                          tokenId={createdTokens[0].id}
                          creatorId={createdTokens[0].creator_id || ""}
                          tokenAddress={createdTokens[0].mint_address}
                        />
                      ) : (
                        <div className="h-32 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-amber-400">
                            {formatNumber(totalRewards)}
                          </span>
                          <span className="text-xs text-zinc-500 mt-1">SOL</span>
                          <ActionButton variant="outline" size="sm" className="w-full mt-3 text-amber-400 border-amber-500/30 hover:bg-amber-500/10">
                            Claim
                          </ActionButton>
                        </div>
                      )}
                    </div>
                  </div>
                </FintechCard>
              </motion.div>

              {/* Token List */}
              {dataLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="flex items-center gap-3 text-zinc-500">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Loading tokens...</span>
                  </div>
                </div>
              ) : createdTokens.length === 0 ? (
                <FintechCard>
                  <EmptyState
                    icon={<Coins className="w-8 h-8" />}
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {createdTokens.map((token, index) => (
                    <motion.div
                      key={token.id}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.2 + index * 0.1 }}
                    >
                      <FintechCard hover>
                        {/* Token Header */}
                        <div className="flex items-start justify-between mb-5">
                          <div className="flex items-center gap-3">
                            <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/20 overflow-hidden">
                              {token.image_url ? (
                                <Image
                                  src={token.image_url}
                                  alt={token.name}
                                  fill
                                  className="object-cover"
                                />
                              ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <span className="text-lg font-bold text-teal-400">
                                    {token.symbol.slice(0, 2)}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div>
                              <h3 className="font-semibold text-zinc-100">{token.name}</h3>
                              <p className="text-sm text-teal-400">${token.symbol}</p>
                            </div>
                          </div>
                          <span
                            className={cn(
                              "px-2.5 py-1 rounded-full text-xs font-medium",
                              token.stage === "bonding"
                                ? "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                                : "bg-green-500/10 text-green-400 border border-green-500/20"
                            )}
                          >
                            {token.stage === "bonding" ? "Bonding" : "Migrated"}
                          </span>
                        </div>

                        {/* Token Metrics */}
                        <div className="grid grid-cols-3 gap-3 mb-5">
                          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <p className="text-xs text-zinc-500 mb-1">Market Cap</p>
                            <p className="font-semibold text-teal-400">${formatNumber(token.market_cap || 0)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <p className="text-xs text-zinc-500 mb-1">24h Volume</p>
                            <p className="font-semibold text-zinc-200">{formatNumber(token.volume_24h || 0)} SOL</p>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <p className="text-xs text-zinc-500 mb-1">Holders</p>
                            <p className="font-semibold text-zinc-200">{token.holders || 0}</p>
                          </div>
                        </div>

                        {/* Water Level */}
                        <div className="mb-5">
                          <ProgressBar
                            value={token.water_level}
                            label="Water Level"
                            color="teal"
                          />
                        </div>

                        {/* Claimable Rewards */}
                        {token.harvest && (
                          <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20 mb-5">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-xs text-zinc-500 mb-1">Claimable Rewards</p>
                                <p className="text-xl font-bold text-amber-400">
                                  {formatNumber(token.harvest.total_accumulated - token.harvest.total_claimed)} SOL
                                </p>
                              </div>
                              <ActionButton size="sm" className="bg-amber-500 hover:bg-amber-400">
                                Harvest
                              </ActionButton>
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-3">
                          <Link href={`/token/${token.mint_address}`} className="flex-1">
                            <ActionButton variant="outline" className="w-full">
                              <ExternalLink className="w-4 h-4" />
                              View
                            </ActionButton>
                          </Link>
                          <ActionButton 
                            variant="secondary" 
                            className="flex-1"
                            onClick={() => setSelectedTokenForManage(token.mint_address)}
                          >
                            <Settings className="w-4 h-4" />
                            Manage
                          </ActionButton>
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
