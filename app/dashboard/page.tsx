"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useAuth } from "@/components/providers/auth-provider"
import { Header } from "@/components/layout/header"
import { LiquidBackground } from "@/components/visuals/liquid-background"
import { TerminalPanel, TerminalButton, StatusIndicator } from "@/components/ui/terminal-panel"
import { createClient } from "@/lib/supabase/client"
import { cn } from "@/lib/utils"
import type { Token, TideHarvest } from "@/lib/types/database"
import { motion } from "framer-motion"

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
      <main className="min-h-screen flex items-center justify-center bg-[var(--ocean-abyss)]">
        <div className="font-mono text-[var(--aqua-primary)] terminal-glow-aqua animate-pulse">
          {">"} LOADING_DASHBOARD...
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen relative overflow-hidden">
      <LiquidBackground />

      <div className="relative z-10">
        <Header />

        <div className="pt-28 pb-12 px-4 sm:px-6">
          <div className="max-w-7xl mx-auto">
            {/* Dashboard Header - Terminal Style */}
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
              <TerminalPanel title="CREATOR_DASHBOARD" className="rounded-lg">
                <div className="font-mono space-y-2">
                  <div className="text-[var(--aqua-primary)] terminal-glow-aqua text-xl">$ stats --creator</div>
                  <div className="text-xs text-[var(--text-muted)]">
                    {">"} Manage tokens and harvest rewards
                    <span className="cursor-blink" />
                  </div>
                  {mainWallet && (
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[var(--terminal-border)]">
                      <StatusIndicator status="online" label="CONNECTED" />
                      <span className="text-xs text-[var(--text-muted)]">
                        WALLET: {mainWallet.public_key.slice(0, 8)}...{mainWallet.public_key.slice(-6)}
                      </span>
                    </div>
                  )}
                </div>
              </TerminalPanel>
            </motion.div>

            {isAuthenticated && mainWallet ? (
              <>
                {/* Stats Overview - Terminal Metrics */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 }}
                  className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
                >
                  <div className="terminal-panel rounded-lg p-4">
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">TOKENS_CREATED</div>
                    <div className="font-mono text-2xl text-[var(--text-primary)]">{createdTokens.length}</div>
                    <div className="font-mono text-[10px] text-[var(--terminal-green)] mt-1">● ACTIVE</div>
                  </div>

                  <div className="terminal-panel rounded-lg p-4 border-[var(--aqua-primary)]/30">
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">TOTAL_LIQUIDITY</div>
                    <div className="font-mono text-2xl text-[var(--aqua-primary)] terminal-glow-aqua">
                      {formatNumber(createdTokens.reduce((sum, t) => sum + t.current_liquidity, 0))}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] mt-1">SOL</div>
                  </div>

                  <div className="terminal-panel rounded-lg p-4">
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">VOLUME_24H</div>
                    <div className="font-mono text-2xl text-[var(--text-primary)]">
                      {formatNumber(createdTokens.reduce((sum, t) => sum + t.volume_24h, 0))}
                    </div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] mt-1">SOL</div>
                  </div>

                  <div className="terminal-panel rounded-lg p-4 border-[var(--warm-orange)]/30">
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">CLAIMABLE</div>
                    <div className="font-mono text-2xl text-[var(--warm-orange)]">{formatNumber(totalRewards)}</div>
                    <div className="font-mono text-[10px] text-[var(--warm-orange)] mt-1">● HARVEST_READY</div>
                  </div>
                </motion.div>

                {/* 5 Thematic Metrics - Terminal Style */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="mb-8"
                >
                  <TerminalPanel title="AQUA_METRICS" className="rounded-lg">
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      {/* Water Level */}
                      <div className="p-3 rounded border border-[var(--terminal-border)] bg-black/20">
                        <div className="font-mono text-[10px] text-[var(--aqua-primary)] mb-2">WATER_LEVEL</div>
                        <div className="h-16 rounded bg-black/30 border border-[var(--terminal-border)] overflow-hidden relative">
                          <div
                            className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-[var(--aqua-primary)]/60 to-[var(--aqua-primary)]/20 transition-all"
                            style={{ height: `${createdTokens[0]?.water_level || 75}%` }}
                          />
                          <div className="absolute inset-0 flex items-center justify-center font-mono text-xs text-[var(--aqua-primary)]">
                            {createdTokens[0]?.water_level || 75}%
                          </div>
                        </div>
                        <div className="font-mono text-[9px] text-[var(--text-muted)] mt-1">LIQUIDITY_DEPTH</div>
                      </div>

                      {/* Pour Rate */}
                      <div className="p-3 rounded border border-[var(--terminal-border)] bg-black/20">
                        <div className="font-mono text-[10px] text-[var(--aqua-secondary)] mb-2">POUR_RATE</div>
                        <div className="h-16 flex items-center justify-center">
                          <div className="font-mono text-2xl text-[var(--aqua-secondary)]">
                            {createdTokens[0]?.pour_rate || 1.5}%
                          </div>
                        </div>
                        <div className="font-mono text-[9px] text-[var(--text-muted)] mt-1">PER_HOUR</div>
                      </div>

                      {/* Evaporation */}
                      <div className="p-3 rounded border border-[var(--terminal-border)] bg-black/20">
                        <div className="font-mono text-[10px] text-[var(--warm-orange)] mb-2">EVAPORATION</div>
                        <div className="h-16 flex flex-col items-center justify-center">
                          <div className="font-mono text-lg text-[var(--warm-orange)]">
                            {createdTokens[0]?.evaporation_rate || 0.5}%
                          </div>
                          <div className="text-xs mt-1">{"▲".repeat(3)}</div>
                        </div>
                        <div className="font-mono text-[9px] text-[var(--text-muted)] mt-1">BURN_RATE</div>
                      </div>

                      {/* Constellation */}
                      <div className="p-3 rounded border border-[var(--terminal-border)] bg-black/20">
                        <div className="font-mono text-[10px] text-[var(--warm-pink)] mb-2">CONSTELLATION</div>
                        <div className="h-16 flex items-center justify-center">
                          <div className="font-mono text-2xl text-[var(--warm-pink)]">
                            {createdTokens[0]?.constellation_score || 85}
                          </div>
                        </div>
                        <div className="font-mono text-[9px] text-[var(--text-muted)] mt-1">HEALTH_SCORE</div>
                      </div>

                      {/* Tide Harvest */}
                      <div className="p-3 rounded border border-[var(--warm-orange)]/30 bg-[var(--warm-orange)]/5">
                        <div className="font-mono text-[10px] text-[var(--warm-orange)] mb-2">TIDE_HARVEST</div>
                        <div className="h-16 flex flex-col items-center justify-center">
                          <div className="font-mono text-lg text-[var(--warm-orange)]">
                            {formatNumber(totalRewards)}
                          </div>
                          <div className="text-[10px] text-[var(--text-muted)]">SOL</div>
                        </div>
                        <div className="font-mono text-[9px] text-[var(--warm-orange)] mt-1">● READY</div>
                      </div>
                    </div>
                  </TerminalPanel>
                </motion.div>

                {/* Token Cards - Terminal Style */}
                {dataLoading ? (
                  <div className="text-center py-12 font-mono text-[var(--aqua-primary)] animate-pulse">
                    {">"} FETCHING_TOKEN_DATA...
                  </div>
                ) : createdTokens.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.2 }}
                  >
                    <TerminalPanel title="NO_TOKENS" className="rounded-lg">
                      <div className="text-center py-8">
                        <div className="font-mono text-[var(--terminal-amber)] mb-4">{">"} ERROR: NO_TOKENS_FOUND</div>
                        <div className="font-mono text-xs text-[var(--text-muted)] mb-6">
                          Deploy your first token to start earning rewards
                        </div>
                        <Link href="/launch">
                          <TerminalButton>DEPLOY_TOKEN</TerminalButton>
                        </Link>
                      </div>
                    </TerminalPanel>
                  </motion.div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {createdTokens.map((token, index) => (
                      <motion.div
                        key={token.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 + index * 0.1 }}
                      >
                        <TerminalPanel title={`TOKEN_${token.symbol}`} className="rounded-lg">
                          {/* Token Header */}
                          <div className="flex items-start justify-between mb-4">
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 rounded border border-[var(--aqua-primary)] bg-black/30 flex items-center justify-center font-mono text-[var(--aqua-primary)]">
                                {token.symbol.slice(0, 2)}
                              </div>
                              <div className="font-mono">
                                <div className="text-sm text-[var(--text-primary)]">{token.name}</div>
                                <div className="text-xs text-[var(--aqua-primary)]">${token.symbol}</div>
                              </div>
                            </div>
                            <span
                              className={cn(
                                "font-mono text-[10px] px-2 py-1 rounded",
                                token.stage === "bonding"
                                  ? "bg-[var(--terminal-amber)]/20 text-[var(--terminal-amber)]"
                                  : "bg-[var(--terminal-green)]/20 text-[var(--terminal-green)]",
                              )}
                            >
                              {token.stage === "bonding" ? "BONDING" : "MIGRATED"}
                            </span>
                          </div>

                          {/* Token Metrics */}
                          <div className="grid grid-cols-3 gap-3 mb-4 font-mono text-xs">
                            <div className="p-2 rounded bg-black/20 border border-[var(--terminal-border)]">
                              <div className="text-[9px] text-[var(--text-muted)]">MCAP</div>
                              <div className="text-[var(--text-primary)]">{formatNumber(token.market_cap)}</div>
                            </div>
                            <div className="p-2 rounded bg-black/20 border border-[var(--terminal-border)]">
                              <div className="text-[9px] text-[var(--text-muted)]">VOL_24H</div>
                              <div className="text-[var(--text-primary)]">{formatNumber(token.volume_24h)}</div>
                            </div>
                            <div className="p-2 rounded bg-black/20 border border-[var(--terminal-border)]">
                              <div className="text-[9px] text-[var(--text-muted)]">HOLDERS</div>
                              <div className="text-[var(--text-primary)]">{token.holders}</div>
                            </div>
                          </div>

                          {/* Water Level Progress */}
                          <div className="mb-4">
                            <div className="flex justify-between font-mono text-[10px] mb-1">
                              <span className="text-[var(--text-muted)]">WATER_LEVEL</span>
                              <span className="text-[var(--aqua-primary)]">{token.water_level}%</span>
                            </div>
                            <div className="h-2 rounded bg-black/30 border border-[var(--terminal-border)] overflow-hidden">
                              <div
                                className="h-full bg-[var(--aqua-primary)]"
                                style={{ width: `${token.water_level}%` }}
                              />
                            </div>
                          </div>

                          {/* Tide Harvest */}
                          {token.harvest && (
                            <div className="p-3 rounded border border-[var(--warm-orange)]/30 bg-[var(--warm-orange)]/5 mb-4">
                              <div className="flex items-center justify-between">
                                <div className="font-mono">
                                  <div className="text-[10px] text-[var(--text-muted)]">CLAIMABLE_REWARDS</div>
                                  <div className="text-lg text-[var(--warm-orange)]">
                                    {formatNumber(token.harvest.total_accumulated - token.harvest.total_claimed)} SOL
                                  </div>
                                </div>
                                <TerminalButton className="text-xs px-3 py-1.5">HARVEST</TerminalButton>
                              </div>
                            </div>
                          )}

                          {/* Actions */}
                          <div className="flex gap-2 font-mono text-xs">
                            <Link
                              href={`/token/${token.mint_address}`}
                              className="flex-1 py-2 rounded border border-[var(--terminal-border)] text-center text-[var(--text-muted)] hover:text-[var(--aqua-primary)] hover:border-[var(--aqua-primary)] transition-colors"
                            >
                              [VIEW]
                            </Link>
                            <button className="flex-1 py-2 rounded border border-[var(--aqua-primary)]/30 text-center text-[var(--aqua-primary)] hover:bg-[var(--aqua-subtle)] transition-colors">
                              [MANAGE]
                            </button>
                          </div>
                        </TerminalPanel>
                      </motion.div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
                <TerminalPanel title="AUTH_REQUIRED" className="rounded-lg max-w-lg mx-auto">
                  <div className="text-center py-8">
                    <div className="w-16 h-16 mx-auto mb-4 rounded border-2 border-[var(--aqua-primary)] flex items-center justify-center bg-black/30">
                      <span className="font-mono text-2xl text-[var(--aqua-primary)] terminal-glow-aqua">◇</span>
                    </div>
                    <div className="font-mono text-[var(--terminal-amber)] mb-2">ERROR: WALLET_NOT_CONNECTED</div>
                    <div className="font-mono text-xs text-[var(--text-muted)] mb-6">
                      {">"} Connect wallet to access dashboard
                    </div>
                    <TerminalButton onClick={() => setIsOnboarding(true)}>CONNECT_WALLET</TerminalButton>
                  </div>
                </TerminalPanel>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
