"use client"

import { useEffect } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { LaunchWizard } from "@/components/launch/launch-wizard"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { FintechCard, FeatureCard, ActionButton, EmptyState } from "@/components/ui/fintech-card"
import { Droplets, Flame, Gift, Wallet, Sparkles, TrendingUp } from "lucide-react"

export default function LaunchPage() {
  const { isAuthenticated, isLoading, mainWallet, setIsOnboarding } = useAuth()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setIsOnboarding(true)
    }
  }, [isLoading, isAuthenticated, setIsOnboarding])

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-zinc-950">
        <div className="flex items-center gap-3 text-zinc-500">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading...</span>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-zinc-950">
      {/* Subtle gradient background */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-teal-950/20 pointer-events-none" />
      
      <Header />

      <div className="relative z-10 px-4 sm:px-6 py-8 max-w-6xl mx-auto">
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-8"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 rounded-lg bg-teal-500/10 border border-teal-500/20">
              <Sparkles className="w-5 h-5 text-teal-400" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-100">Launch Token</h1>
          </div>
          <p className="text-zinc-500 max-w-2xl">
            Drop your token and watch liquidity flow in automatically. 
            No more rug pulls, no more dead pools - just pure upside.
          </p>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8"
        >
          <FeatureCard
            icon={<Droplets className="w-6 h-6" />}
            title="Pour Rate"
            description="Liquidity keeps flowing in. Your token stays tradeable 24/7."
            color="teal"
          />
          <FeatureCard
            icon={<Flame className="w-5 h-5" />}
            title="Evaporation"
            description="Burns on every trade. Less supply = more value. Simple math."
            color="amber"
          />
          <FeatureCard
            icon={<Gift className="w-5 h-5" />}
            title="Tide Harvest"
            description="Collect SOL from trading fees. Get paid while you sleep."
            color="purple"
          />
        </motion.div>

        {/* Main Content */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.2 }}
        >
          {isAuthenticated && mainWallet ? (
            <FintechCard glow>
              <LaunchWizard creatorWallet={mainWallet.public_key} />
            </FintechCard>
          ) : (
            <FintechCard>
              <EmptyState
                icon={<Wallet className="w-8 h-8" />}
                title="Connect Wallet"
                description="Quick setup, then you're ready to launch."
                action={
                  <ActionButton onClick={() => setIsOnboarding(true)} icon={<Wallet className="w-4 h-4" />}>
                    Let's Go
                  </ActionButton>
                }
              />
            </FintechCard>
          )}
        </motion.div>

        {/* Info Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-8 p-5 rounded-xl bg-zinc-900/50 border border-zinc-800"
        >
          <div className="flex items-start gap-4">
            <div className="p-2 rounded-lg bg-teal-500/10 shrink-0">
              <TrendingUp className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-200 mb-1">Why This Works</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Every trade adds liquidity back to the pool. No dev can drain it. 
                Your holders can always sell. That's the AQUA difference.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
