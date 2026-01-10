"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import { Header } from "@/components/layout/header"
import { useAuth } from "@/components/providers/auth-provider"
import { PropelCurveWizard } from "@/components/launch/propel-curve-wizard"
import Link from "next/link"

export default function PropelCurvePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading, wallets, activeWallet, mainWallet, setIsOnboarding } = useAuth()
  const [showWizard, setShowWizard] = useState(false)

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setIsOnboarding(true)
    }
  }, [isLoading, isAuthenticated, setIsOnboarding])

  if (isLoading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-[var(--bg-primary)]">
        <div className="flex items-center gap-3 text-[var(--text-muted)]">
          <div className="spinner" />
          <span>Loading...</span>
        </div>
      </main>
    )
  }

  // If user is authenticated and clicks "Get Started", show wizard
  if (showWizard && isAuthenticated && (activeWallet || mainWallet)) {
    return (
      <main className="min-h-screen bg-[var(--bg-primary)]">
        <Header />
        <div className="relative z-10 px-4 lg:px-6 py-6 max-w-[1400px] mx-auto">
          <PropelCurveWizard creatorWallet={(activeWallet || mainWallet)!.public_key} />
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[var(--bg-primary)]">
      <Header />

      <div className="relative z-10 px-4 lg:px-6 py-8 max-w-[1400px] mx-auto">
        {/* Hero Section */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="mb-12"
        >
          {/* Protocol Badge */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/30 w-fit mb-6">
            <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="text-xs font-semibold text-cyan-400 uppercase tracking-wider">Meteora DBC</span>
          </div>

          {/* Title */}
          <h1 className="text-5xl font-bold mb-4 text-white">
            Propel Curve
          </h1>
          
          <p className="text-xl text-white/80 mb-2 max-w-3xl">
            Launch your token with a <span className="text-cyan-400 font-semibold">custom bonding curve</span>.
          </p>
          <p className="text-lg text-white/60 max-w-3xl">
            Design your own price action, choose your quote token, and control exactly how your token trades.
          </p>

          {/* CTA Buttons */}
          <div className="flex items-center gap-4 mt-8">
            {isAuthenticated ? (
              <button
                onClick={() => setShowWizard(true)}
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
              >
                Get Started →
              </button>
            ) : (
              <button
                onClick={() => setIsOnboarding(true)}
                className="px-6 py-3 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white font-semibold hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
              >
                Connect Wallet to Start
              </button>
            )}
            
            <Link
              href="/launch-jupiter"
              className="px-6 py-3 rounded-lg bg-white/5 border border-white/10 text-white/80 font-medium hover:bg-white/10 hover:border-white/20 transition-all"
            >
              Compare with Jupiter DBC
            </Link>
          </div>
        </motion.div>

        {/* Complete Flow Explanation */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-6">The Complete Flow</h2>
          
          {/* Step 1: Basics - EXPANDED */}
          <div className="mb-6 p-6 rounded-xl bg-white/5 border border-cyan-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center text-xl font-bold text-cyan-400">
                1
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Token Identity</h3>
                <p className="text-sm text-cyan-400">Basic information about your token</p>
              </div>
            </div>
            
            <div className="pl-15 space-y-3">
              <div className="p-4 rounded-lg bg-black/20 border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">What You Fill Out:</h4>
                <ul className="space-y-1 text-sm text-white/70">
                  <li>• <span className="text-white">Name:</span> Your token's full name (e.g., "My Cool Token")</li>
                  <li>• <span className="text-white">Symbol:</span> Ticker symbol (e.g., "COOL")</li>
                  <li>• <span className="text-white">Description:</span> What's your token about?</li>
                  <li>• <span className="text-white">Image:</span> Upload your token logo</li>
                  <li>• <span className="text-white">Social Links:</span> Twitter, Telegram, Website (optional but builds trust)</li>
                  <li>• <span className="text-white">Total Supply:</span> How many tokens (default: 1 billion)</li>
                  <li>• <span className="text-white">Initial Buy:</span> How much SOL to buy at launch (creates initial liquidity)</li>
                </ul>
              </div>
              
              <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <h4 className="text-sm font-semibold text-cyan-400 mb-2">Behind The Scenes:</h4>
                <ul className="space-y-1 text-sm text-white/60">
                  <li>• Fetches your wallet balance from Solana blockchain</li>
                  <li>• Calculates total cost: 0.1 SOL (creation fee) + initial buy + gas (~0.001 SOL)</li>
                  <li>• Validates you have enough SOL before letting you continue</li>
                  <li>• Shows you exactly how much you'll spend</li>
                  <li>• Everything stored in browser memory (not saved to database yet)</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 2: Curve Design - EXPANDED */}
          <div className="mb-6 p-6 rounded-xl bg-white/5 border border-cyan-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center text-xl font-bold text-cyan-400">
                2
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Design Your Bonding Curve</h3>
                <p className="text-sm text-cyan-400">This is where the magic happens - control your price action</p>
              </div>
            </div>
            
            <div className="pl-15 space-y-3">
              <div className="p-4 rounded-lg bg-black/20 border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Choose Your Strategy:</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                  <div className="p-3 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                    <p className="text-sm font-medium text-white mb-1">Smooth Operator</p>
                    <p className="text-xs text-white/60">Even liquidity at all prices = steady, predictable growth</p>
                  </div>
                  <div className="p-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
                    <p className="text-sm font-medium text-white mb-1">Rocket Fuel</p>
                    <p className="text-xs text-white/60">Low liquidity in middle = explosive price jumps</p>
                  </div>
                  <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <p className="text-sm font-medium text-white mb-1">Whale Trap</p>
                    <p className="text-xs text-white/60">High liquidity at start, low at end = easy buy, hard sell</p>
                  </div>
                  <div className="p-3 rounded-lg bg-purple-500/5 border border-purple-500/20">
                    <p className="text-sm font-medium text-white mb-1">Diamond Hands</p>
                    <p className="text-xs text-white/60">Low at start, high at top = rewards holders</p>
                  </div>
                </div>
                <p className="text-xs text-white/50 italic">Or build your own custom curve with up to 20 price ranges</p>
              </div>
              
              <div className="p-4 rounded-lg bg-black/20 border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Configure Settings:</h4>
                <ul className="space-y-1 text-sm text-white/70">
                  <li>• <span className="text-white">Quote Token:</span> SOL (traditional) or USDC (stable pricing)</li>
                  <li>• <span className="text-white">Migration Threshold:</span> How much to raise before graduating (default: 85 SOL)</li>
                  <li>• <span className="text-white">Trading Fee:</span> Fee per trade (default: 1%)</li>
                  <li>• <span className="text-white">Creator LP:</span> Your % of liquidity pool after migration (default: 90%)</li>
                  <li>• <span className="text-white">Locked LP:</span> % that gets locked/vested (default: 0%)</li>
                </ul>
              </div>
              
              <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <h4 className="text-sm font-semibold text-cyan-400 mb-2">What You See:</h4>
                <ul className="space-y-1 text-sm text-white/60">
                  <li>• Live chart preview using Recharts (your existing chart library)</li>
                  <li>• Visual representation of liquidity distribution</li>
                  <li>• Each price range shown with its liquidity amount</li>
                  <li>• Chart updates instantly when you change settings</li>
                  <li>• Can add/remove ranges if building custom curve</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Step 3: Launch - EXPANDED */}
          <div className="p-6 rounded-xl bg-white/5 border border-cyan-500/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-lg bg-cyan-500/20 flex items-center justify-center text-xl font-bold text-cyan-400">
                3
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">Review & Deploy</h3>
                <p className="text-sm text-cyan-400">Final check before going live</p>
              </div>
            </div>
            
            <div className="pl-15 space-y-3">
              <div className="p-4 rounded-lg bg-black/20 border border-white/10">
                <h4 className="text-sm font-semibold text-white mb-2">Final Review Shows:</h4>
                <ul className="space-y-1 text-sm text-white/70">
                  <li>• All your token details summarized</li>
                  <li>• Your chosen curve preset and settings</li>
                  <li>• Pre-generated mint address (can regenerate if you want different address)</li>
                  <li>• Total cost breakdown (creation fee + initial buy + gas)</li>
                  <li>• Estimated fees you'll earn from trading</li>
                </ul>
              </div>
              
              <div className="p-4 rounded-lg bg-cyan-500/5 border border-cyan-500/20">
                <h4 className="text-sm font-semibold text-cyan-400 mb-2">When You Click "Launch Token":</h4>
                <div className="space-y-2 text-sm text-white/60">
                  <p><span className="text-cyan-400">→</span> Frontend sends all data to /api/meteora/create</p>
                  <p><span className="text-cyan-400">→</span> Backend authenticates your session</p>
                  <p><span className="text-cyan-400">→</span> Decrypts your wallet private key from encrypted database</p>
                  <p><span className="text-cyan-400">→</span> Validates your SOL balance on-chain</p>
                  <p><span className="text-cyan-400">→</span> Uploads image to Arweave (permanent decentralized storage)</p>
                  <p><span className="text-cyan-400">→</span> Uploads metadata JSON to Arweave</p>
                  <p><span className="text-cyan-400">→</span> Creates SPL token mint account on Solana</p>
                  <p><span className="text-cyan-400">→</span> Creates Meteora DBC pool with your custom curve</p>
                  <p><span className="text-cyan-400">→</span> Performs initial buy via Jupiter aggregator (if you set one)</p>
                  <p><span className="text-cyan-400">→</span> Collects platform fee (0.1 SOL + 2% of initial buy)</p>
                  <p><span className="text-cyan-400">→</span> Saves token to database (tokens table, pool_type: 'meteora')</p>
                  <p><span className="text-cyan-400">→</span> Saves AQUA parameters (pour rate, evaporation, auto-claim)</p>
                  <p><span className="text-cyan-400">→</span> Records fee payment and referral splits</p>
                  <p><span className="text-white font-medium">✓</span> <span className="text-green-400">Token is LIVE! Redirects you to token page</span></p>
                </div>
              </div>
              
              <div className="p-4 rounded-lg bg-green-500/5 border border-green-500/20">
                <h4 className="text-sm font-semibold text-green-400 mb-2">After Launch:</h4>
                <ul className="space-y-1 text-sm text-white/60">
                  <li>• Token immediately tradeable on bonding curve</li>
                  <li>• Every buy/sell generates trading fees</li>
                  <li>• You earn your configured % of all fees (default: 80%)</li>
                  <li>• Fees accumulate in the pool</li>
                  <li>• Visit your profile anytime to claim fees (one-click withdrawal)</li>
                  <li>• When threshold hit, Meteora migrates to DAMM (automated)</li>
                  <li>• After migration, you get LP tokens to claim ongoing fees</li>
                </ul>
              </div>
            </div>
          </div>
        </motion.div>

        {/* The 4 Curve Presets */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-2">The 4 Curve Presets</h2>
          <p className="text-white/60 mb-6">Battle-tested strategies for different launch goals</p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Smooth Operator */}
            <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20 hover:border-cyan-500/40 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Smooth Operator</h3>
                  <p className="text-xs text-cyan-400">Steady growth with minimal volatility</p>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.00001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-cyan-400">1000 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.0001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-cyan-400">1000 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-cyan-400">1000 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.01</span>
                  <span className="text-white/60">→</span>
                  <span className="text-cyan-400">1000 liquidity</span>
                </div>
              </div>
              <p className="text-sm text-white/60">
                <span className="text-white font-medium">Use for:</span> Utility tokens, serious projects
              </p>
            </div>

            {/* Rocket Fuel */}
            <div className="p-5 rounded-xl bg-white/5 border border-orange-500/20 hover:border-orange-500/40 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Rocket Fuel</h3>
                  <p className="text-xs text-orange-400">Low middle liquidity = explosive price action</p>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.00001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-orange-400">2000 liquidity</span>
                  <span className="text-xs text-green-400">HIGH</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.0001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-orange-400">500 liquidity</span>
                  <span className="text-xs text-red-400">LOW 🚀</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-orange-400">500 liquidity</span>
                  <span className="text-xs text-red-400">LOW 🚀</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.01</span>
                  <span className="text-white/60">→</span>
                  <span className="text-orange-400">2000 liquidity</span>
                  <span className="text-xs text-green-400">HIGH</span>
                </div>
              </div>
              <p className="text-sm text-white/60">
                <span className="text-white font-medium">Use for:</span> Meme coins, viral launches
              </p>
            </div>

            {/* Whale Trap */}
            <div className="p-5 rounded-xl bg-white/5 border border-blue-500/20 hover:border-blue-500/40 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Whale Trap</h3>
                  <p className="text-xs text-blue-400">Easy to buy, harder to sell</p>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.00001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-blue-400">3000 liquidity</span>
                  <span className="text-xs text-green-400">Easy buy</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.0001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-blue-400">1500 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-blue-400">800 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.01</span>
                  <span className="text-white/60">→</span>
                  <span className="text-blue-400">500 liquidity</span>
                  <span className="text-xs text-red-400">Hard sell</span>
                </div>
              </div>
              <p className="text-sm text-white/60">
                <span className="text-white font-medium">Use for:</span> Community tokens, encourage holding
              </p>
            </div>

            {/* Diamond Hands */}
            <div className="p-5 rounded-xl bg-white/5 border border-purple-500/20 hover:border-purple-500/40 transition-all">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white">Diamond Hands</h3>
                  <p className="text-xs text-purple-400">Rewards long-term holders</p>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.00001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-purple-400">800 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.0001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-purple-400">1200 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.001</span>
                  <span className="text-white/60">→</span>
                  <span className="text-purple-400">1800 liquidity</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/40">$0.01</span>
                  <span className="text-white/60">→</span>
                  <span className="text-purple-400">2500 liquidity</span>
                  <span className="text-xs text-green-400">Stable top</span>
                </div>
              </div>
              <p className="text-sm text-white/60">
                <span className="text-white font-medium">Use for:</span> Strong fundamentals, long-term projects
              </p>
            </div>
          </div>
        </motion.div>

        {/* How Liquidity Works */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mb-12 p-6 rounded-xl bg-gradient-to-br from-cyan-500/5 to-teal-500/5 border border-cyan-500/20"
        >
          <h2 className="text-2xl font-bold text-white mb-4">Understanding Liquidity</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center text-green-400 font-bold">
                  ↑
                </div>
                <h3 className="font-semibold text-white">High Liquidity (3000)</h3>
              </div>
              <p className="text-white/70 mb-2">Think of liquidity like <span className="text-cyan-400 font-medium">water in a pool</span>:</p>
              <ul className="space-y-1 text-sm text-white/60">
                <li>• Buy 1 SOL → Price moves a little 📈</li>
                <li>• Smooth, predictable growth</li>
                <li>• Good for: Building confidence</li>
              </ul>
            </div>

            <div>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-red-500/20 flex items-center justify-center text-red-400 font-bold">
                  ↓
                </div>
                <h3 className="font-semibold text-white">Low Liquidity (500)</h3>
              </div>
              <p className="text-white/70 mb-2">Less water = <span className="text-orange-400 font-medium">bigger splashes</span>:</p>
              <ul className="space-y-1 text-sm text-white/60">
                <li>• Buy 1 SOL → Price EXPLODES 🚀📈📈📈</li>
                <li>• Creates excitement and FOMO</li>
                <li>• Good for: Viral growth</li>
              </ul>
            </div>
          </div>
        </motion.div>

        {/* The Curve Magic */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-2">The Curve Magic</h2>
          <p className="text-white/60 mb-6">See how different curves create different price action</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Example 1: Rocket Fuel */}
            <div className="p-6 rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/30">
              <h3 className="text-lg font-semibold text-white mb-4">Rocket Fuel Example</h3>
              
              <div className="space-y-3 mb-4">
                <div className="p-3 rounded-lg bg-black/20 border border-white/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white/60">Stage 1: Early Buyers</span>
                    <span className="text-xs text-green-400">HIGH LIQUIDITY</span>
                  </div>
                  <p className="text-xs text-white/50">
                    $0.00001 - $0.0001 • Easy to buy, price stable • Builds initial holders
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-orange-500/10 border border-orange-500/30">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white font-medium">Stage 2: The Pump Zone</span>
                    <span className="text-xs text-red-400 font-bold">LOW LIQUIDITY 🚀</span>
                  </div>
                  <p className="text-xs text-white/70">
                    $0.0001 - $0.001 • Small buys = HUGE price jumps • Creates FOMO
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-black/20 border border-white/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white/60">Stage 3: The Top</span>
                    <span className="text-xs text-green-400">HIGH LIQUIDITY</span>
                  </div>
                  <p className="text-xs text-white/50">
                    $0.001 - $0.01 • Stable, handles big trades • Ready for migration
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/70">
                <span className="text-orange-400 font-semibold">Result:</span> Your chart explodes in the middle. Small buys create massive price jumps, generating viral excitement and FOMO.
              </p>
            </div>

            {/* Example 2: Whale Trap */}
            <div className="p-6 rounded-xl bg-gradient-to-br from-blue-500/10 to-cyan-500/10 border border-blue-500/30">
              <h3 className="text-lg font-semibold text-white mb-4">Whale Trap Example</h3>
              
              <div className="space-y-3 mb-4">
                <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white font-medium">Stage 1: Easy Entry</span>
                    <span className="text-xs text-green-400 font-bold">VERY HIGH</span>
                  </div>
                  <p className="text-xs text-white/70">
                    $0.00001 - $0.0001 • 3000 liquidity • Everyone can buy easily
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-black/20 border border-white/10">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white/60">Stage 2: Building</span>
                    <span className="text-xs text-yellow-400">MEDIUM</span>
                  </div>
                  <p className="text-xs text-white/50">
                    $0.0001 - $0.001 • 1500 → 800 liquidity • Getting harder
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm text-white font-medium">Stage 3: The Trap</span>
                    <span className="text-xs text-red-400 font-bold">LOW 🐋</span>
                  </div>
                  <p className="text-xs text-white/70">
                    $0.001 - $0.01 • 500 liquidity • Hard to sell = people hold
                  </p>
                </div>
              </div>

              <p className="text-sm text-white/70">
                <span className="text-blue-400 font-semibold">Result:</span> Large holders get trapped at the top. They can't dump easily without massive slippage, encouraging long-term holding.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-6">Why Propel Curve?</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">Custom Curves</h3>
              <p className="text-sm text-white/60">
                Design your own price ranges. Up to 20 different liquidity zones.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">Multi-Quote</h3>
              <p className="text-sm text-white/60">
                Launch with SOL or USDC. Stable pricing or traditional pairs.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">Visual Designer</h3>
              <p className="text-sm text-white/60">
                See your curve in real-time. No coding needed, just click and design.
              </p>
            </div>

            <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center mb-3">
                <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="font-semibold text-white mb-2">LP Control</h3>
              <p className="text-sm text-white/60">
                Choose your LP %, lock percentages, and vesting schedule.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-6">How It Compares</h2>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-3 px-4 text-sm font-semibold text-white/80">Feature</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-white/80">Pump.fun</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-white/80">Jupiter DBC</th>
                  <th className="text-center py-3 px-4 text-sm font-semibold text-cyan-400">Propel Curve</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <tr className="border-b border-white/5">
                  <td className="py-3 px-4 text-white/70">Custom Curves</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-green-400 font-bold">✓</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-4 text-white/70">Visual Designer</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-green-400 font-bold">✓</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-4 text-white/70">Preset Templates</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-yellow-400">2</td>
                  <td className="py-3 px-4 text-center text-green-400 font-bold">4</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-4 text-white/70">Multi-Quote</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-green-400">✓</td>
                  <td className="py-3 px-4 text-center text-green-400 font-bold">✓</td>
                </tr>
                <tr className="border-b border-white/5">
                  <td className="py-3 px-4 text-white/70">LP Locking</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-green-400">✓</td>
                  <td className="py-3 px-4 text-center text-green-400 font-bold">✓</td>
                </tr>
                <tr>
                  <td className="py-3 px-4 text-white/70">AQUA Features</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-red-400">✗</td>
                  <td className="py-3 px-4 text-center text-green-400 font-bold">✓</td>
                </tr>
              </tbody>
            </table>
          </div>
        </motion.div>

        {/* Launch CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="text-center p-12 rounded-xl bg-gradient-to-br from-cyan-500/10 to-teal-500/10 border border-cyan-500/30"
        >
          <h2 className="text-3xl font-bold text-white mb-3">Ready to Launch?</h2>
          <p className="text-lg text-white/70 mb-6 max-w-2xl mx-auto">
            Create your token with a custom bonding curve in 3 simple steps. No coding required.
          </p>
          
          {isAuthenticated ? (
            <button
              onClick={() => setShowWizard(true)}
              className="px-8 py-4 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-lg font-semibold hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
            >
              Launch Your Token →
            </button>
          ) : (
            <button
              onClick={() => setIsOnboarding(true)}
              className="px-8 py-4 rounded-lg bg-gradient-to-r from-cyan-500 to-teal-500 text-white text-lg font-semibold hover:from-cyan-400 hover:to-teal-400 transition-all shadow-lg shadow-cyan-500/20"
            >
              Connect Wallet to Start
            </button>
          )}
          
          <p className="text-sm text-white/50 mt-4">
            Creation fee: 0.1 SOL + 2% of initial buy
          </p>
        </motion.div>
      </div>
    </main>
  )
}
