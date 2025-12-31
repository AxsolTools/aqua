"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

interface VoteBoostPanelProps {
  tokenAddress: string
  tokenName: string
}

export function VoteBoostPanel({ tokenAddress, tokenName }: VoteBoostPanelProps) {
  const { wallets, activeWallet, isAuthenticated, setIsOnboarding, sessionId } = useAuth()
  const [voteCount, setVoteCount] = useState(0)
  const [boostCount, setBoostCount] = useState(0)
  const [hasVoted, setHasVoted] = useState(false)
  const [isVoting, setIsVoting] = useState(false)
  const [boostAmount, setBoostAmount] = useState(1)
  const [showBoostModal, setShowBoostModal] = useState(false)
  const [selectedWalletId, setSelectedWalletId] = useState<string>("")
  const [isBoosting, setIsBoosting] = useState(false)
  const [boostError, setBoostError] = useState<string | null>(null)
  const [boostSuccess, setBoostSuccess] = useState(false)
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({})

  // Set default wallet when modal opens
  useEffect(() => {
    if (showBoostModal && activeWallet && !selectedWalletId) {
      setSelectedWalletId(activeWallet.id)
    }
  }, [showBoostModal, activeWallet, selectedWalletId])

  // Fetch wallet balances when modal opens
  useEffect(() => {
    if (showBoostModal && wallets.length > 0) {
      fetchWalletBalances()
    }
  }, [showBoostModal, wallets])

  useEffect(() => {
    fetchCounts()
    if (activeWallet) {
      checkUserVote()
    }
  }, [tokenAddress, activeWallet])

  const fetchWalletBalances = async () => {
    try {
      const addresses = wallets.map(w => w.public_key)
      const response = await fetch("/api/wallet/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ addresses }),
      })
      const data = await response.json()
      if (data.success && data.data?.balances) {
        const balances: Record<string, number> = {}
        data.data.balances.forEach((b: { address: string; balanceSol: number }) => {
          const wallet = wallets.find(w => w.public_key === b.address)
          if (wallet) {
            balances[wallet.id] = b.balanceSol || 0
          }
        })
        setWalletBalances(balances)
      }
    } catch (error) {
      console.debug('[BOOST] Failed to fetch balances:', error)
    }
  }

  const fetchCounts = async () => {
    try {
      const response = await fetch(`/api/votes?tokenAddress=${tokenAddress}`)
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setVoteCount(data.votes || 0)
          setBoostCount(data.boosts || 0)
        }
      }
    } catch (err) {
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

  const handleBoost = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!selectedWalletId || isBoosting) return

    const selectedWallet = wallets.find(w => w.id === selectedWalletId)
    if (!selectedWallet) {
      setBoostError("Please select a wallet")
      return
    }

    const balance = walletBalances[selectedWalletId] || 0
    if (balance < boostAmount) {
      setBoostError(`Insufficient balance. You have ${balance.toFixed(4)} SOL`)
      return
    }

    setIsBoosting(true)
    setBoostError(null)

    try {
      const response = await fetch('/api/boosts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-session-id': sessionId || '',
          'x-wallet-address': selectedWallet.public_key,
        },
        body: JSON.stringify({
          tokenAddress,
          walletAddress: selectedWallet.public_key,
          amount: boostAmount,
        }),
      })

      const data = await response.json()

      if (data.success) {
        setBoostSuccess(true)
        setBoostCount((prev) => prev + 1)
        // Refresh balances
        fetchWalletBalances()
        // Close modal after 2 seconds
        setTimeout(() => {
          setShowBoostModal(false)
          setBoostSuccess(false)
        }, 2000)
      } else {
        setBoostError(data.error || "Failed to boost")
      }
    } catch (err) {
      console.error('[BOOST] Boost failed:', err)
      setBoostError("Failed to process boost payment")
    }

    setIsBoosting(false)
  }

  const openBoostModal = () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }
    setBoostError(null)
    setBoostSuccess(false)
    setShowBoostModal(true)
  }

  return (
    <div className="glass-panel rounded-xl p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Community</h3>
        <span className="text-[10px] text-[var(--text-muted)]">Show your support</span>
      </div>

      {/* Horizontal layout for wider space */}
      <div className="flex items-center gap-4">
        {/* Vote Button */}
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

        {/* Boost Button */}
        <motion.button
          onClick={openBoostModal}
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
              {boostSuccess ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-[var(--green)]/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-[var(--green)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Boost Successful!</h3>
                  <p className="text-sm text-[var(--text-secondary)]">
                    You boosted {tokenName} with {boostAmount} SOL
                  </p>
                </div>
              ) : (
                <>
                  <h3 className="text-xl font-bold text-[var(--text-primary)] mb-2">Boost {tokenName}</h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-6">
                    Boost this token to increase its visibility and show your support.
                  </p>

                  <div className="space-y-4">
                    {/* Boost Amount Selection */}
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

                    {/* Wallet Selection */}
                    <div>
                      <label className="text-sm text-[var(--text-muted)] mb-2 block">Pay from Wallet</label>
                      <div className="space-y-2">
                        {wallets.map((wallet) => {
                          const balance = walletBalances[wallet.id] || 0
                          const hasEnough = balance >= boostAmount
                          return (
                            <button
                              key={wallet.id}
                              onClick={() => setSelectedWalletId(wallet.id)}
                              disabled={!hasEnough}
                              className={cn(
                                "w-full flex items-center justify-between p-3 rounded-xl border transition-all",
                                selectedWalletId === wallet.id
                                  ? "border-[var(--aqua-primary)] bg-[var(--aqua-primary)]/10"
                                  : hasEnough
                                    ? "border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50"
                                    : "border-[var(--glass-border)] opacity-50 cursor-not-allowed",
                              )}
                            >
                              <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-[var(--ocean-surface)] flex items-center justify-center">
                                  <svg className="w-4 h-4 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                                  </svg>
                                </div>
                                <div className="text-left">
                                  <p className="text-sm font-medium text-[var(--text-primary)]">
                                    {wallet.label || `${wallet.public_key.slice(0, 6)}...${wallet.public_key.slice(-4)}`}
                                  </p>
                                  <p className={cn(
                                    "text-xs",
                                    hasEnough ? "text-[var(--text-muted)]" : "text-[var(--red)]"
                                  )}>
                                    {balance.toFixed(4)} SOL {!hasEnough && "(insufficient)"}
                                  </p>
                                </div>
                              </div>
                              {selectedWalletId === wallet.id && (
                                <svg className="w-5 h-5 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              )}
                            </button>
                          )
                        })}
                      </div>
                    </div>

                    {/* Error Message */}
                    {boostError && (
                      <div className="p-3 rounded-xl bg-[var(--red)]/10 border border-[var(--red)]/30">
                        <p className="text-sm text-[var(--red)]">{boostError}</p>
                      </div>
                    )}

                    {/* Boost Button */}
                    <button
                      onClick={handleBoost}
                      disabled={isBoosting || !selectedWalletId}
                      className="w-full py-4 rounded-xl btn-primary text-base disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isBoosting ? (
                        <span className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                          Processing...
                        </span>
                      ) : (
                        `Boost with ${boostAmount} SOL`
                      )}
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
