"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

interface VoteBoostPanelProps {
  tokenAddress: string
  tokenName: string
}

export function VoteBoostPanel({ tokenAddress, tokenName }: VoteBoostPanelProps) {
  const { activeWallet, isAuthenticated, setIsOnboarding } = useAuth()
  const [voteCount, setVoteCount] = useState(0)
  const [boostCount, setBoostCount] = useState(0)
  const [hasVoted, setHasVoted] = useState(false)
  const [isVoting, setIsVoting] = useState(false)
  const [boostAmount, setBoostAmount] = useState(1)
  const [showBoostModal, setShowBoostModal] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    fetchCounts()
    if (activeWallet) {
      checkUserVote()
    }
  }, [tokenAddress, activeWallet])

  const fetchCounts = async () => {
    try {
      // Use API to avoid direct database queries that may fail if tables don't exist
      const response = await fetch(`/api/votes?tokenAddress=${tokenAddress}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setVoteCount(data.votes || 0)
          setBoostCount(data.boosts || 0)
        }
      }
    } catch (err) {
      // Silently handle - vote/boost feature may not be enabled
      console.debug('[VOTE-BOOST] API unavailable:', err)
    }
  }

  const checkUserVote = async () => {
    if (!activeWallet) return

    try {
      const response = await fetch(`/api/votes?tokenAddress=${tokenAddress}&walletAddress=${activeWallet.public_key}`)
      if (response.ok) {
        const data = await response.json()
        setHasVoted(data.hasVoted || false)
      }
    } catch (err) {
      console.debug('[VOTES] Vote check unavailable:', err)
      setHasVoted(false)
    }
  }

  const handleVote = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!activeWallet || isVoting) return

    setIsVoting(true)

    try {
      const response = await fetch('/api/votes', {
        method: hasVoted ? 'DELETE' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenAddress,
          walletAddress: activeWallet.public_key,
        }),
      })

      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          if (hasVoted) {
            setHasVoted(false)
            setVoteCount((prev) => Math.max(0, prev - 1))
          } else {
            setHasVoted(true)
            setVoteCount((prev) => prev + 1)
          }
        }
      }
    } catch (err) {
      console.debug('[VOTES] Vote operation failed:', err)
    }

    setIsVoting(false)
  }

  return (
    <div className="glass-panel rounded-xl p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Community</h3>
        <span className="text-[10px] text-[var(--text-muted)]">Show your support</span>
      </div>

      {/* Horizontal layout for wider space */}
      <div className="flex items-center gap-4">
        {/* Vote Button - Compact horizontal */}
        <motion.button
          onClick={handleVote}
          disabled={isVoting}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex-1 flex items-center justify-center gap-3 p-3 rounded-xl border transition-all",
            hasVoted
              ? "border-[var(--warm-coral)] bg-[var(--warm-coral)]/10"
              : "border-[var(--glass-border)] hover:border-[var(--warm-coral)]/50",
          )}
        >
          <motion.div animate={hasVoted ? { scale: [1, 1.2, 1] } : {}} transition={{ duration: 0.3 }}>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill={hasVoted ? "var(--warm-coral)" : "none"}
              stroke="var(--warm-coral)"
              strokeWidth="2"
            >
              <path d="M12 2l2.5 5 5.5.8-4 3.9.9 5.3-4.9-2.6-4.9 2.6.9-5.3-4-3.9 5.5-.8L12 2z" />
            </svg>
          </motion.div>
          <div className="text-left">
            <span className="text-lg font-bold text-[var(--text-primary)] font-mono block">{voteCount}</span>
            <span className="text-[10px] text-[var(--text-muted)]">{hasVoted ? "Voted!" : "Vote"}</span>
          </div>
        </motion.button>

        {/* Boost Button - Compact horizontal */}
        <motion.button
          onClick={() => setShowBoostModal(true)}
          whileTap={{ scale: 0.95 }}
          className="flex-1 flex items-center justify-center gap-3 p-3 rounded-xl border border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50 transition-all"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aqua-primary)" strokeWidth="2">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div className="text-left">
            <span className="text-lg font-bold text-[var(--text-primary)] font-mono block">{boostCount}</span>
            <span className="text-[10px] text-[var(--text-muted)]">Boost</span>
          </div>
        </motion.button>
      </div>

      {/* Boost Modal */}
      <AnimatePresence>
        {showBoostModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--ocean-abyss)]/80 backdrop-blur-sm"
            onClick={() => setShowBoostModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md glass-panel-elevated rounded-2xl p-6"
            >
              <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Boost {tokenName}</h3>
              <p className="text-sm text-[var(--text-secondary)] mb-6">
                Boost this token to increase its visibility and show your support.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-sm text-[var(--text-muted)] mb-2 block">Boost Amount (SOL)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {[0.1, 0.5, 1, 5].map((amount) => (
                      <button
                        key={amount}
                        onClick={() => setBoostAmount(amount)}
                        className={cn(
                          "py-3 rounded-xl text-sm font-medium transition-all",
                          boostAmount === amount
                            ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                            : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] hover:bg-[var(--ocean-surface)]/80",
                        )}
                      >
                        {amount} SOL
                      </button>
                    ))}
                  </div>
                </div>

                <button className="w-full py-4 rounded-xl btn-primary text-base">Boost with {boostAmount} SOL</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
