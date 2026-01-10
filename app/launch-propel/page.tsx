"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassPanel } from "@/components/ui/glass-panel"
import { PropelCurveWizard } from "@/components/launch/propel-curve-wizard"

export default function LaunchPropelPage() {
  const router = useRouter()
  const { userId, sessionId, wallets } = useAuth()
  const [selectedWallet, setSelectedWallet] = useState<string>("")

  // Get first wallet as default
  const defaultWallet = wallets && wallets.length > 0 ? wallets[0].public_key : ""

  if (!userId || !sessionId) {
    return (
      <div className="container mx-auto px-4 py-12">
        <GlassPanel className="max-w-2xl mx-auto text-center p-12">
          <h2 className="text-2xl font-bold mb-4">Connect Wallet Required</h2>
          <p className="text-[var(--text-muted)] mb-6">
            Please connect your wallet to launch a token on Propel Curve
          </p>
          <button
            onClick={() => router.push("/")}
            className="px-6 py-3 rounded-lg bg-[var(--aqua-primary)] text-[var(--ocean-deep)] font-semibold hover:bg-[var(--aqua-secondary)] transition-colors"
          >
            Go Home
          </button>
        </GlassPanel>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-4">
          <span className="text-5xl">🌊</span>
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] bg-clip-text text-transparent">
            Propel Curve
          </h1>
        </div>
        <p className="text-lg text-[var(--text-muted)] max-w-2xl mx-auto">
          Launch your token with a <span className="text-[var(--aqua-primary)] font-semibold">custom bonding curve</span>.
          Design your own price action, choose your quote token, and configure advanced features.
        </p>
      </div>

      {/* Features Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <GlassPanel className="p-4 text-center">
          <div className="text-3xl mb-2">📊</div>
          <h3 className="font-semibold mb-1">Custom Curves</h3>
          <p className="text-sm text-[var(--text-muted)]">Design your own price ranges</p>
        </GlassPanel>
        
        <GlassPanel className="p-4 text-center">
          <div className="text-3xl mb-2">💰</div>
          <h3 className="font-semibold mb-1">Multi-Quote</h3>
          <p className="text-sm text-[var(--text-muted)]">Launch with SOL or USDC</p>
        </GlassPanel>
        
        <GlassPanel className="p-4 text-center">
          <div className="text-3xl mb-2">🛡️</div>
          <h3 className="font-semibold mb-1">Anti-Sniper</h3>
          <p className="text-sm text-[var(--text-muted)]">Built-in protection</p>
        </GlassPanel>
        
        <GlassPanel className="p-4 text-center">
          <div className="text-3xl mb-2">🔒</div>
          <h3 className="font-semibold mb-1">LP Locking</h3>
          <p className="text-sm text-[var(--text-muted)]">Configurable vesting</p>
        </GlassPanel>
      </div>

      {/* Wizard */}
      <PropelCurveWizard 
        creatorWallet={selectedWallet || defaultWallet}
      />
    </div>
  )
}
