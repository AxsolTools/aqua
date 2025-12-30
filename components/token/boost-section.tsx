"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"

interface BoostSectionProps {
  tokenAddress: string
}

export function BoostSection({ tokenAddress }: BoostSectionProps) {
  const { activeWallet, isAuthenticated } = useAuth()
  const [totalBoosts, setTotalBoosts] = useState(0)
  const [userBoost, setUserBoost] = useState(0)
  const [boostAmount, setBoostAmount] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [topBoosters, setTopBoosters] = useState<{ wallet_address: string; total: number }[]>([])

  useEffect(() => {
    const fetchBoosts = async () => {
      const supabase = createClient()

      // Get total boosts
      const { data: boostsData } = await supabase
        .from("boosts")
        .select("amount, wallet_address")
        .eq("token_address", tokenAddress)

      if (boostsData) {
        const total = boostsData.reduce((sum, b) => sum + (b.amount || 0), 0)
        setTotalBoosts(total)

        // Calculate top boosters
        const byWallet: Record<string, number> = {}
        boostsData.forEach((b) => {
          byWallet[b.wallet_address] = (byWallet[b.wallet_address] || 0) + b.amount
        })
        const sorted = Object.entries(byWallet)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([wallet_address, total]) => ({ wallet_address, total }))
        setTopBoosters(sorted)

        // User's boost
        if (activeWallet) {
          const userTotal = boostsData
            .filter((b) => b.wallet_address === activeWallet.public_key)
            .reduce((sum, b) => sum + (b.amount || 0), 0)
          setUserBoost(userTotal)
        }
      }
    }

    fetchBoosts()
  }, [tokenAddress, activeWallet])

  const handleBoost = async () => {
    if (!activeWallet || !boostAmount || isLoading) return

    setIsLoading(true)
    const supabase = createClient()

    const { error } = await supabase.from("boosts").insert({
      token_address: tokenAddress,
      wallet_address: activeWallet.public_key,
      amount: Number.parseInt(boostAmount),
      tx_signature: `boost_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    })

    if (!error) {
      setTotalBoosts((prev) => prev + Number.parseInt(boostAmount))
      setUserBoost((prev) => prev + Number.parseInt(boostAmount))
      setBoostAmount("")
    }

    setIsLoading(false)
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Boost This Token</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Help this token rise in the rankings</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gradient-warm">{totalBoosts.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-muted)]">Total Boosts</p>
        </div>
      </div>

      {/* Boost Input */}
      {isAuthenticated ? (
        <div className="mb-6">
          <div className="flex gap-2">
            <input
              type="number"
              value={boostAmount}
              onChange={(e) => setBoostAmount(e.target.value)}
              placeholder="Enter boost amount"
              className="flex-1 px-4 py-3 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--aqua-primary)] transition-colors"
            />
            <motion.button
              onClick={handleBoost}
              disabled={isLoading || !boostAmount}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="btn-warm px-6 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M8 2v12M4 6l4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Boost
                </>
              )}
            </motion.button>
          </div>
          {userBoost > 0 && (
            <p className="text-sm text-[var(--aqua-primary)] mt-2">Your total boost: {userBoost.toLocaleString()}</p>
          )}
        </div>
      ) : (
        <div className="mb-6 p-4 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-center">
          <p className="text-sm text-[var(--text-muted)]">Connect your wallet to boost this token</p>
        </div>
      )}

      {/* Top Boosters */}
      {topBoosters.length > 0 && (
        <div>
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Top Boosters</h4>
          <div className="space-y-2">
            {topBoosters.map((booster, i) => (
              <div
                key={booster.wallet_address}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--ocean-surface)]/30"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                      i === 0
                        ? "bg-gradient-to-br from-yellow-400 to-orange-500 text-white"
                        : i === 1
                          ? "bg-gradient-to-br from-gray-300 to-gray-400 text-gray-800"
                          : i === 2
                            ? "bg-gradient-to-br from-amber-600 to-amber-700 text-white"
                            : "bg-[var(--ocean-elevated)] text-[var(--text-muted)]"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span className="text-sm font-mono text-[var(--text-primary)]">
                    {formatAddress(booster.wallet_address)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-[var(--warm-orange)]">
                  {booster.total.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
