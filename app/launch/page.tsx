"use client"

import { useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { LaunchWizard } from "@/components/launch/launch-wizard"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"

export default function LaunchPage() {
  const { isAuthenticated, isLoading, mainWallet, setIsOnboarding } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setIsOnboarding(true)
    }
  }, [isLoading, isAuthenticated, setIsOnboarding])

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen relative overflow-hidden">
      <Header />

      <div className="px-4 sm:px-6 py-6 max-w-7xl mx-auto">
        {/* Page Header - Terminal Style */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="font-mono text-[var(--aqua-primary)] terminal-glow-aqua text-xl">$ deploy_token --new</div>
          <div className="font-mono text-sm text-[var(--text-muted)]">
            {">"} Create token with infinite liquidity mechanics
          </div>
          <div className="font-mono text-sm text-[var(--text-muted)]">
            {">"} Pour Rate technology ensures eternal liquidity flow
            <span className="cursor-blink" />
          </div>
        </motion.div>

        {/* Features Preview - Terminal Cards */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8"
        >
          <div className="terminal-panel rounded-lg p-4">
            <div className="font-mono text-xs text-[var(--text-muted)] mb-2">{">"} FEATURE_01</div>
            <div className="font-mono text-sm text-[var(--aqua-primary)]">POUR_RATE</div>
            <div className="font-mono text-xs text-[var(--text-muted)] mt-1">Continuous liquidity injection</div>
          </div>

          <div className="terminal-panel rounded-lg p-4">
            <div className="font-mono text-xs text-[var(--text-muted)] mb-2">{">"} FEATURE_02</div>
            <div className="font-mono text-sm text-[var(--warm-orange)]">EVAPORATION</div>
            <div className="font-mono text-xs text-[var(--text-muted)] mt-1">Deflationary burn mechanism</div>
          </div>

          <div className="terminal-panel rounded-lg p-4">
            <div className="font-mono text-xs text-[var(--text-muted)] mb-2">{">"} FEATURE_03</div>
            <div className="font-mono text-sm text-[var(--warm-pink)]">TIDE_HARVEST</div>
            <div className="font-mono text-xs text-[var(--text-muted)] mt-1">Creator reward distribution</div>
          </div>
        </motion.div>

        {/* Launch Wizard */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          {isAuthenticated && mainWallet ? (
            <LaunchWizard creatorWallet={mainWallet.public_key} />
          ) : (
            <div className="text-center py-8">
              <div className="w-16 h-16 mx-auto mb-4 rounded border-2 border-[var(--aqua-primary)] flex items-center justify-center bg-black/30">
                <span className="font-mono text-2xl text-[var(--aqua-primary)] terminal-glow-aqua">◇</span>
              </div>
              <div className="font-mono text-[var(--terminal-amber)] mb-2">ERROR: WALLET_NOT_CONNECTED</div>
              <div className="font-mono text-xs text-[var(--text-muted)] mb-6">
                {">"} Authentication required to deploy token
              </div>
              <button
                onClick={() => setIsOnboarding(true)}
                className="bg-[var(--aqua-primary)] text-white px-4 py-2 rounded"
              >
                CONNECT_WALLET
              </button>
            </div>
          )}
        </motion.div>
      </div>
    </main>
  )
}
