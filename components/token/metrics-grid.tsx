"use client"

import { motion } from "framer-motion"
import type { Token } from "@/lib/types/database"
import { GlassPanel } from "@/components/ui/glass-panel"
import { WaterLevelMeter } from "@/components/metrics/water-level-meter"
import { EvaporationTracker } from "@/components/metrics/evaporation-tracker"
import { ConstellationGauge } from "@/components/metrics/constellation-gauge"
import { PourRateVisualizer } from "@/components/metrics/pour-rate-visualizer"
import { TideHarvestCard } from "@/components/metrics/tide-harvest-card"

interface MetricsGridProps {
  token: Token
}

const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1,
    },
  },
}

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0 },
}

export function MetricsGrid({ token }: MetricsGridProps) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Liquidity Metrics</h2>
          <p className="text-sm text-[var(--text-muted)]">Real-time token health indicators</p>
        </div>
      </div>

      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4"
      >
        {/* Water Level */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-5 h-full" glow="aqua">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Water Level</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Liquidity Depth</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[var(--aqua-subtle)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2C12 2 6 10 6 14C6 18 8.7 22 12 22C15.3 22 18 18 18 14C18 10 12 2 12 2Z"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
            <WaterLevelMeter level={token.water_level || 0} size="lg" />
          </GlassPanel>
        </motion.div>

        {/* Evaporation Tracker */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-5 h-full" glow="orange">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Evaporation</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Tokens Burned</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[var(--warm-orange)]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[var(--warm-orange)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2v4M4.93 4.93l2.83 2.83M2 12h4M4.93 19.07l2.83-2.83M12 18v4M16.24 16.24l2.83 2.83M18 12h4M16.24 7.76l2.83-2.83"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <EvaporationTracker
              totalEvaporated={token.total_evaporated || 0}
              evaporationRate={token.evaporation_rate || 0}
              symbol={token.symbol}
            />
          </GlassPanel>
        </motion.div>

        {/* Constellation Strength */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-5 h-full" glow="pink">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Constellation</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Health Score</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[var(--warm-pink)]/10 flex items-center justify-center">
                <svg className="w-4 h-4 text-[var(--warm-pink)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
            <ConstellationGauge strength={token.constellation_strength || 0} />
          </GlassPanel>
        </motion.div>

        {/* Pour Rate */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-5 h-full" glow="aqua">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Pour Rate</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Liquidity Flow</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[var(--aqua-subtle)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M7 10l5-5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
            </div>
            <PourRateVisualizer rate={token.pour_rate || 0} />
          </GlassPanel>
        </motion.div>

        {/* Tide Harvest */}
        <motion.div variants={itemVariants}>
          <GlassPanel className="p-5 h-full" glow="aqua">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">Tide Harvest</h3>
                <p className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">Creator Rewards</p>
              </div>
              <div className="w-8 h-8 rounded-lg bg-[var(--aqua-subtle)] flex items-center justify-center">
                <svg className="w-4 h-4 text-[var(--aqua-primary)]" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 8v4l3 3M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>
            <TideHarvestCard tokenId={token.id} creatorId={token.creator_id} />
          </GlassPanel>
        </motion.div>
      </motion.div>
    </div>
  )
}
