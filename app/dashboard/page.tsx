"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
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
  Activity
} from "lucide-react"

export default function DashboardPage() {
  const { isAuthenticated, isLoading, mainWallet, setIsOnboarding } = useAuth()
  const [createdTokens, setCreatedTokens] = useState<(Token & { harvest?: TideHarvest })[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [totalRewards, setTotalRewards] = useState(0)

  const supabase = createClient()

  useEffect(() => {
    if (isAuthenticated && mainWallet) {
      fetchCreatorData()
    }
  }, [isAuthenticated, mainWallet])

  const fetchCreatorData = async () => {
    if (!mainWallet) return
    setDataLoading(true)

    try {
      const { data: tokens } = await supabase
        .from("tokens")
        .select("*")
        .eq("creator_wallet", mainWallet.public_key)
        .order("created_at", { ascending: false })

      if (tokens) {
        let rewards = 0
        const tokensWithHarvest = await Promise.all(
          tokens.map(async (token) => {
            const { data: harvest } = await supabase.from("tide_harvests").select("*").eq("token_id", token.id).single()

            if (harvest) {
              rewards += harvest.total_accumulated - harvest.total_claimed
            }

            return { ...token, harvest }
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

      <div className="relative z-10 pt-24 pb-12 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto">
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
                <p className="text-zinc-500">Manage your tokens and track rewards</p>
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
                className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8"
              >
                <MetricCard
                  label="Tokens Created"
                  value={createdTokens.length}
                  icon={<Coins className="w-4 h-4" />}
                />
                <MetricCard
                  label="Total Liquidity"
                  value={formatNumber(createdTokens.reduce((sum, t) => sum + t.current_liquidity, 0))}
                  suffix="SOL"
                  color="teal"
                  icon={<Droplets className="w-4 h-4" />}
                />
                <MetricCard
                  label="24h Volume"
                  value={formatNumber(createdTokens.reduce((sum, t) => sum + t.volume_24h, 0))}
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
                    subtitle="Real-time metrics for your token ecosystem"
                  />
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {/* Water Level */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Droplets className="w-4 h-4 text-teal-400" />
                        <span className="text-xs font-medium text-zinc-400">Water Level</span>
                      </div>
                      <div className="relative h-24 rounded-lg bg-zinc-900 border border-zinc-700 overflow-hidden">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${createdTokens[0]?.water_level || 75}%` }}
                          transition={{ duration: 1, ease: "easeOut" }}
                          className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-teal-600/60 to-teal-400/30"
                        />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-xl font-bold text-teal-400">
                            {createdTokens[0]?.water_level || 75}%
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 text-center">Liquidity Depth</p>
                    </div>

                    {/* Pour Rate */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-3">
                        <TrendingUp className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-medium text-zinc-400">Pour Rate</span>
                      </div>
                      <div className="h-24 flex items-center justify-center">
                        <span className="text-3xl font-bold text-cyan-400">
                          {createdTokens[0]?.pour_rate || 1.5}%
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 text-center">Per Hour</p>
                    </div>

                    {/* Evaporation */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Flame className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-medium text-zinc-400">Evaporation</span>
                      </div>
                      <div className="h-24 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold text-amber-400">
                          {createdTokens[0]?.evaporation_rate || 0.5}%
                        </span>
                        <div className="flex gap-0.5 mt-2">
                          <span className="text-amber-400/60">▲</span>
                          <span className="text-amber-400/80">▲</span>
                          <span className="text-amber-400">▲</span>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 text-center">Burn Rate</p>
                    </div>

                    {/* Constellation */}
                    <div className="p-4 rounded-lg bg-zinc-800/50 border border-zinc-700">
                      <div className="flex items-center gap-2 mb-3">
                        <Star className="w-4 h-4 text-purple-400" />
                        <span className="text-xs font-medium text-zinc-400">Health Score</span>
                      </div>
                      <div className="h-24 flex items-center justify-center">
                        <span className="text-3xl font-bold text-purple-400">
                          {createdTokens[0]?.constellation_score || 85}
                        </span>
                      </div>
                      <p className="text-xs text-zinc-500 mt-2 text-center">Constellation</p>
                    </div>

                    {/* Tide Harvest */}
                    <div className="p-4 rounded-lg bg-amber-500/5 border border-amber-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Gift className="w-4 h-4 text-amber-400" />
                        <span className="text-xs font-medium text-amber-400">Harvest</span>
                      </div>
                      <div className="h-24 flex flex-col items-center justify-center">
                        <span className="text-2xl font-bold text-amber-400">
                          {formatNumber(totalRewards)}
                        </span>
                        <span className="text-xs text-zinc-500 mt-1">SOL</span>
                      </div>
                      <ActionButton variant="outline" size="sm" className="w-full mt-2 text-amber-400 border-amber-500/30 hover:bg-amber-500/10">
                        Claim
                      </ActionButton>
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
                    title="No Tokens Yet"
                    description="Deploy your first token to start earning creator rewards through Tide Harvest"
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
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/20 flex items-center justify-center">
                              <span className="text-lg font-bold text-teal-400">
                                {token.symbol.slice(0, 2)}
                              </span>
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
                            <p className="font-semibold text-zinc-200">{formatNumber(token.market_cap)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <p className="text-xs text-zinc-500 mb-1">24h Volume</p>
                            <p className="font-semibold text-zinc-200">{formatNumber(token.volume_24h)}</p>
                          </div>
                          <div className="p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                            <p className="text-xs text-zinc-500 mb-1">Holders</p>
                            <p className="font-semibold text-zinc-200">{token.holders}</p>
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
                          <ActionButton variant="secondary" className="flex-1">
                            <Settings className="w-4 h-4" />
                            Manage
                          </ActionButton>
                        </div>
                      </FintechCard>
                    </motion.div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <FintechCard>
              <EmptyState
                icon={<Wallet className="w-8 h-8" />}
                title="Connect Your Wallet"
                description="Connect your wallet to access your creator dashboard and manage your tokens"
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
