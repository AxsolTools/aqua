"use client"

import { useEffect, useState, useRef } from "react"
import { useAuth } from "@/components/providers/auth-provider"
import { Token22Wizard } from "@/components/launch22/token22-wizard"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { FintechCard, FeatureCard, ActionButton, EmptyState } from "@/components/ui/fintech-card"
import { Wallet, Coins, TrendingUp, ChevronDown, Check, Sparkles } from "lucide-react"
import Link from "next/link"

export default function Launch22Page() {
  const { isAuthenticated, isLoading, wallets, activeWallet, setActiveWallet, mainWallet, setIsOnboarding } = useAuth()
  const [showWalletSelector, setShowWalletSelector] = useState(false)
  const selectorRef = useRef<HTMLDivElement>(null)
  
  // Close wallet selector when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setShowWalletSelector(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
      {/* Gradient background - emerald theme for Token-2022 */}
      <div className="fixed inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-emerald-950/20 pointer-events-none" />
      
      <Header />

      <div className="relative z-10 px-3 sm:px-4 lg:px-6 py-6 max-w-[1400px] mx-auto">
        {/* Page Header */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-8"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <Coins className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-zinc-100">TOKEN22 Launch</h1>
                <p className="text-sm text-emerald-400">Powered by Token-2022 Standard</p>
              </div>
            </div>
            
            {/* Switch to Classic */}
            <Link
              href="/launch"
              className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 transition-colors text-sm text-zinc-400 hover:text-zinc-200"
            >
              <Sparkles className="w-4 h-4" />
              <span>Switch to Pump.fun</span>
            </Link>
          </div>
          <p className="text-zinc-500 max-w-2xl">
            Full control. Transfer fees. Authority revocation. Raydium liquidity.
            This is how degens launch tokens in 2024.
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
            title="Transfer Fees"
            description="Earn on every transaction. Built into the token, not a contract."
            color="amber"
          />
          <FeatureCard
            title="Authority Control"
            description="Revoke mint/freeze authorities. Prove you can't rug."
            color="teal"
          />
          <FeatureCard
            title="Raydium Launch"
            description="Skip bonding curves. Launch straight to real liquidity."
            color="purple"
          />
        </motion.div>

        {/* Token-2022 Benefits Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-8 p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 to-cyan-500/10 border border-emerald-500/20"
        >
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-sm text-white/80">Token-2022 Standard</span>
            </div>
            <div className="h-4 w-px bg-white/10 hidden sm:block" />
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="px-2 py-1 rounded bg-white/5 text-white/60">MetadataPointer</span>
              <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-400">TransferFee</span>
              <span className="px-2 py-1 rounded bg-red-500/10 text-red-400">MintClose</span>
              <span className="px-2 py-1 rounded bg-blue-500/10 text-blue-400">FreezeRevoke</span>
            </div>
          </div>
        </motion.div>

        {/* Main Content */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.2 }}
        >
          {isAuthenticated && (activeWallet || mainWallet) ? (
            <FintechCard glow>
              {/* Wallet Selector for Token Creation */}
              {wallets.length > 1 && (
                <div className="mb-6 pb-4 border-b border-zinc-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Wallet className="w-4 h-4 text-emerald-400" />
                      <span className="text-sm text-zinc-400">Creating with wallet:</span>
                    </div>
                    <div className="relative" ref={selectorRef}>
                      <button
                        onClick={() => setShowWalletSelector(!showWalletSelector)}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 transition-colors"
                      >
                        <span className="text-sm font-medium text-zinc-200">
                          {activeWallet?.label || `${(activeWallet || mainWallet)?.public_key.slice(0, 6)}...${(activeWallet || mainWallet)?.public_key.slice(-4)}`}
                        </span>
                        <ChevronDown className="w-3 h-3 text-zinc-500" />
                      </button>
                      
                      {showWalletSelector && (
                        <div className="absolute top-full right-0 mt-1 w-56 py-1 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl z-50">
                          {wallets.map((wallet) => (
                            <button
                              key={wallet.id}
                              onClick={() => {
                                setActiveWallet(wallet)
                                setShowWalletSelector(false)
                              }}
                              className="flex items-center justify-between w-full px-3 py-2 text-sm hover:bg-zinc-800 transition-colors"
                            >
                              <span className={activeWallet?.id === wallet.id ? "text-emerald-400 font-medium" : "text-zinc-300"}>
                                {wallet.label || `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`}
                              </span>
                              {activeWallet?.id === wallet.id && (
                                <Check className="w-4 h-4 text-emerald-400" />
                              )}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <Token22Wizard creatorWallet={(activeWallet || mainWallet)!.public_key} />
            </FintechCard>
          ) : (
            <FintechCard>
              <EmptyState
                icon={<Wallet className="w-8 h-8" />}
                title="Connect Wallet"
                description="Set up your wallet to launch a Token-2022."
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
            <div className="p-2 rounded-lg bg-emerald-500/10 shrink-0">
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-200 mb-1">Why Token-2022?</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                Token-2022 is Solana's next-gen token standard. Features are built into the token itself, not a wrapper contract.
                Transfer fees, authority controls, and metadata are all native. This means lower gas, more trust, and full control over your tokenomics.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Comparison Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4"
        >
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <h4 className="text-sm font-medium text-zinc-300 mb-3">Token-2022 ✓</h4>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Transfer fees (up to 5%)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Raydium liquidity from day 1
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Control your supply distribution
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Native metadata on-chain
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-400">✓</span> Provable authority revocation
              </li>
            </ul>
          </div>
          <div className="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
            <h4 className="text-sm font-medium text-zinc-300 mb-3">vs Pump.fun</h4>
            <ul className="space-y-2 text-sm text-zinc-500">
              <li className="flex items-center gap-2">
                <span className="text-zinc-500">—</span> No transfer fees possible
              </li>
              <li className="flex items-center gap-2">
                <span className="text-zinc-500">—</span> Bonding curve, slow migration
              </li>
              <li className="flex items-center gap-2">
                <span className="text-zinc-500">—</span> Fixed 1B supply, 0 control
              </li>
              <li className="flex items-center gap-2">
                <span className="text-zinc-500">—</span> Metadata via their servers
              </li>
              <li className="flex items-center gap-2">
                <span className="text-zinc-500">—</span> Trust their migration
              </li>
            </ul>
          </div>
        </motion.div>
      </div>
    </main>
  )
}

