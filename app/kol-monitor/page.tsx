"use client"

import { useState } from "react"
import { Header } from "@/components/layout/header"
import { GlobalPourEffect } from "@/components/visuals/global-pour-effect"
import { KOLLeaderboard } from "@/components/kol/kol-leaderboard"
import { KOLProfilePanel } from "@/components/kol/kol-profile-panel"
import { WallOfShame } from "@/components/kol/wall-of-shame"
import { TokenAggregator } from "@/components/kol/token-aggregator"
import type { KOL } from "@/lib/kol-data"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { Users, Skull, TrendingUp, Activity, BarChart3, Zap } from "lucide-react"

const tabs = [
  { id: "leaderboard", label: "Leaderboard", icon: TrendingUp },
  { id: "aggregator", label: "Token Aggregator", icon: BarChart3 },
  { id: "shame", label: "Wall of Shame", icon: Skull },
]

export default function KOLMonitorPage() {
  const [selectedKOL, setSelectedKOL] = useState<KOL | null>(null)
  const [activeTab, setActiveTab] = useState<"leaderboard" | "aggregator" | "shame">("leaderboard")

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <GlobalPourEffect />
      <Header />

      <div className="px-3 sm:px-4 lg:px-6 py-4">
        <div className="max-w-[1920px] mx-auto">
          {/* Page Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 rounded-lg bg-[var(--aqua-primary)]/20">
                <Users className="w-6 h-6 text-[var(--aqua-primary)]" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-[var(--text-primary)]">KOL Monitor</h1>
                <p className="text-sm text-[var(--text-muted)]">
                  Track influential traders, smart money flows, and wallet activity
                </p>
              </div>
            </div>

            {/* Stats Bar */}
            <div className="flex items-center gap-4 mt-4">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-secondary)] rounded-lg border border-[var(--border-subtle)]">
                <Activity className="w-4 h-4 text-[var(--aqua-primary)]" />
                <span className="text-xs text-[var(--text-muted)]">Live Tracking</span>
                <span className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              </div>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="mb-4">
            <div className="inline-flex gap-1 p-1 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-subtle)]">
              {tabs.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as typeof activeTab)}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
                      activeTab === tab.id
                        ? "bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {tab.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Main Content */}
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === "leaderboard" && (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Leaderboard - Takes 2 columns on large screens */}
                <div className="lg:col-span-2 bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden h-[calc(100vh-280px)]">
                  <KOLLeaderboard
                    onSelectKOL={setSelectedKOL}
                    selectedKOL={selectedKOL}
                  />
                </div>

                {/* Profile Panel or Placeholder - Takes 1 column */}
                <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden h-[calc(100vh-280px)]">
                  {selectedKOL ? (
                    <KOLProfilePanel
                      kol={selectedKOL}
                      onClose={() => setSelectedKOL(null)}
                    />
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center p-8">
                      <div className="w-16 h-16 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center mb-4">
                        <Users className="w-8 h-8 text-[var(--text-muted)]" />
                      </div>
                      <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">
                        Select a KOL
                      </h3>
                      <p className="text-sm text-[var(--text-muted)] max-w-xs">
                        Click on any KOL from the leaderboard to view their detailed profile, trading history, and analytics
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === "aggregator" && (
              <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl overflow-hidden h-[calc(100vh-280px)]">
                <TokenAggregator />
              </div>
            )}

            {activeTab === "shame" && (
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                <div className="xl:col-span-2 h-[calc(100vh-280px)]">
                  <WallOfShame />
                </div>
                <div className="bg-[var(--bg-primary)] border border-[var(--border-subtle)] rounded-xl p-6">
                  <h3 className="text-lg font-bold text-[var(--text-primary)] mb-4">About Wall of Shame</h3>
                  <div className="space-y-4 text-sm text-[var(--text-secondary)]">
                    <p>
                      The Wall of Shame highlights wallets that exhibit suspicious trading patterns, 
                      including wash trading, pump and dump schemes, and coordinated exit strategies.
                    </p>
                    <p>
                      <strong className="text-[var(--text-primary)]">Scam Score</strong> is calculated based on:
                    </p>
                    <ul className="list-disc list-inside space-y-1 text-[var(--text-muted)]">
                      <li>Frequency of dumps after announcements</li>
                      <li>Coordinated trading with other wallets</li>
                      <li>Self-trading patterns (wash trading)</li>
                      <li>Exit timing relative to followers</li>
                    </ul>
                    <div className="pt-4 border-t border-[var(--border-subtle)]">
                      <p className="text-xs text-[var(--text-dim)]">
                        This data is for educational purposes. Always DYOR before following any trader.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </main>
  )
}

