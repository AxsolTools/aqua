"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { cn, formatAddress } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { 
  Wallet as WalletIcon,
  Send, 
  Trash2, 
  Copy, 
  Check, 
  X, 
  AlertTriangle,
  ExternalLink,
  Plus,
  ArrowUpRight
} from "lucide-react"

interface WalletSidebarProps {
  open: boolean
  onClose: () => void
}

// Withdrawal Modal Component
function WithdrawModal({ 
  wallet, 
  balance, 
  onClose, 
  onWithdraw 
}: { 
  wallet: { id: string; public_key: string; session_id: string };
  balance: number;
  onClose: () => void;
  onWithdraw: (destination: string, amount: number) => Promise<void>;
}) {
  const [destination, setDestination] = useState("")
  const [amount, setAmount] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")

  const handleWithdraw = async () => {
    if (!destination || !amount) {
      setError("Please enter destination address and amount")
      return
    }

    // Validate Solana address (base58, 32-44 chars)
    if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(destination)) {
      setError("Invalid Solana address")
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      setError("Invalid amount")
      return
    }

    if (amountNum > balance) {
      setError("Insufficient balance")
      return
    }

    setIsProcessing(true)
    setError("")

    try {
      await onWithdraw(destination, amountNum)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdrawal failed")
    } finally {
      setIsProcessing(false)
    }
  }

  const setMaxAmount = () => {
    // Leave some for fees
    const maxAmount = Math.max(0, balance - 0.001)
    setAmount(maxAmount.toFixed(9))
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md bg-slate-900 rounded-2xl border border-slate-700 overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-teal-500/10 to-cyan-500/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
                <Send className="w-5 h-5 text-teal-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Withdraw SOL</h3>
                <p className="text-sm text-slate-400">From {formatAddress(wallet.public_key, 6)}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-800 transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </div>

        {/* Balance */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center justify-between">
            <span className="text-sm text-slate-400">Available Balance</span>
            <span className="text-lg font-semibold text-white">{balance.toFixed(4)} SOL</span>
          </div>
        </div>

        {/* Form */}
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Destination Address
            </label>
            <Input
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Enter Solana wallet address..."
              className="h-12 bg-slate-800/50 border-slate-700 font-mono text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Amount (SOL)
            </label>
            <div className="relative">
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                step="0.001"
                min="0"
                max={balance}
                className="h-12 bg-slate-800/50 border-slate-700 pr-16"
              />
              <button
                onClick={setMaxAmount}
                className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-1 text-xs font-medium text-teal-400 hover:text-teal-300 bg-teal-500/10 rounded"
              >
                MAX
              </button>
            </div>
          </div>

          {/* Fee Info */}
          <div className="p-3 rounded-lg bg-slate-800/50 border border-slate-700">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Network Fee</span>
              <span className="text-slate-300">~0.000005 SOL</span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2 text-red-400 text-sm">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            onClick={handleWithdraw}
            disabled={isProcessing || !destination || !amount}
            className="w-full h-12 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold hover:from-teal-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isProcessing ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <ArrowUpRight className="w-4 h-4" />
                Withdraw
              </>
            )}
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export function WalletSidebar({ open, onClose }: WalletSidebarProps) {
  const { wallets, mainWallet, activeWallet, setActiveWallet, setMainWallet, setIsOnboarding, disconnect, refreshWallets } = useAuth()
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [balances, setBalances] = useState<Record<string, number>>({})
  const [withdrawWallet, setWithdrawWallet] = useState<{ id: string; public_key: string; session_id: string } | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  // Fetch balances for all wallets
  useEffect(() => {
    if (!open || wallets.length === 0) return

    const fetchBalances = async () => {
      const newBalances: Record<string, number> = {}
      for (const wallet of wallets) {
        try {
          const response = await fetch(`/api/wallet/balance?address=${wallet.public_key}`)
          const data = await response.json()
          if (data.success && data.data) {
            newBalances[wallet.id] = data.data.balanceSol || 0
          }
        } catch (error) {
          console.error(`[WALLET] Balance fetch error for ${wallet.public_key}:`, error)
        }
      }
      setBalances(newBalances)
    }

    fetchBalances()
    // Refresh balances every 30 seconds while sidebar is open
    const interval = setInterval(fetchBalances, 30000)
    return () => clearInterval(interval)
  }, [open, wallets])

  const handleWithdraw = async (destination: string, amount: number) => {
    if (!withdrawWallet) return

    const response = await fetch("/api/wallet/withdraw", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-wallet-address": withdrawWallet.public_key,
        "x-session-id": withdrawWallet.session_id,
      },
      body: JSON.stringify({
        destination,
        amount,
      }),
    })

    const data = await response.json()
    if (!response.ok) {
      throw new Error(data.error?.message || "Withdrawal failed")
    }

    // Refresh balances after withdrawal
    const balanceResponse = await fetch(`/api/wallet/balance?address=${withdrawWallet.public_key}`)
    const balanceData = await balanceResponse.json()
    if (balanceData.success && balanceData.data) {
      setBalances(prev => ({ ...prev, [withdrawWallet.id]: balanceData.data.balanceSol || 0 }))
    }
  }

  const handleRemoveWallet = async (walletId: string) => {
    if (confirmDelete !== walletId) {
      setConfirmDelete(walletId)
      return
    }

    setIsDeleting(true)
    try {
      const wallet = wallets.find(w => w.id === walletId)
      if (!wallet) return

      const response = await fetch("/api/wallet/remove", {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": wallet.session_id,
        },
        body: JSON.stringify({ walletId }),
      })

      if (response.ok) {
        await refreshWallets()
        setConfirmDelete(null)
      }
    } catch (error) {
      console.error("[WALLET] Remove error:", error)
    } finally {
      setIsDeleting(false)
    }
  }

  const copyAddress = (address: string, id: string) => {
    navigator.clipboard.writeText(address)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
    <>
    {/* Withdraw Modal */}
    <AnimatePresence>
      {withdrawWallet && (
        <WithdrawModal
          wallet={withdrawWallet}
          balance={balances[withdrawWallet.id] || 0}
          onClose={() => setWithdrawWallet(null)}
          onWithdraw={handleWithdraw}
        />
      )}
    </AnimatePresence>

    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[var(--ocean-abyss)]/80 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed top-0 right-0 bottom-0 z-50 w-full max-w-md"
          >
            <div className="h-full glass-panel-elevated border-l border-[var(--glass-border)] flex flex-col rounded-none">
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-[var(--glass-border)]">
                <div>
                  <h2 className="text-lg font-semibold text-[var(--text-primary)]">Wallet Manager</h2>
                  <p className="text-sm text-[var(--text-muted)]">
                    {wallets.length} wallet{wallets.length !== 1 ? "s" : ""} connected
                  </p>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-[var(--glass-bg)] transition-colors">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M5 5l10 10M15 5L5 15" strokeLinecap="round" />
                  </svg>
                </button>
              </div>

              {/* Main Identity Wallet */}
              {mainWallet && (
                <div className="p-6 border-b border-[var(--glass-border)] bg-gradient-to-r from-[var(--aqua-subtle)] to-transparent">
                  <p className="text-xs uppercase tracking-wider text-[var(--aqua-primary)] mb-3 font-medium">
                    Main Identity
                  </p>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--aqua-secondary)] flex items-center justify-center">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="text-[var(--ocean-deep)]">
                        <path
                          d="M19 7h-1V6a3 3 0 0 0-3-3H9a3 3 0 0 0-3 3v1H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z"
                          fill="currentColor"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--text-primary)]">{mainWallet.label || "Main Wallet"}</p>
                      <p className="text-sm text-[var(--aqua-primary)] font-mono">
                        {formatAddress(mainWallet.public_key, 6)}
                      </p>
                    </div>
                    <button
                      onClick={() => copyAddress(mainWallet.public_key, mainWallet.id)}
                      className="p-2 rounded-lg hover:bg-[var(--glass-bg)] transition-colors text-[var(--text-muted)] hover:text-[var(--aqua-primary)]"
                    >
                      {copiedId === mainWallet.id ? (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path d="M4 9l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 18 18"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                        >
                          <rect x="6" y="6" width="9" height="9" rx="2" />
                          <path d="M3 12V5a2 2 0 0 1 2-2h7" />
                        </svg>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Wallet List */}
              <div className="flex-1 overflow-y-auto p-6">
                <p className="text-xs uppercase tracking-wider text-[var(--text-muted)] mb-4 font-medium">
                  All Wallets
                </p>
                <div className="space-y-3">
                  {wallets.map((wallet, index) => (
                    <motion.div
                      key={wallet.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.05 }}
                      className={cn(
                        "p-4 rounded-xl border transition-all",
                        activeWallet?.id === wallet.id
                          ? "border-[var(--aqua-primary)] bg-[var(--aqua-subtle)]"
                          : "border-[var(--glass-border)] bg-[var(--glass-bg)] hover:border-[var(--glass-border-highlight)]",
                      )}
                    >
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-[var(--text-primary)]">{wallet.label || "Wallet"}</span>
                          {wallet.is_primary && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)] font-medium">
                              MAIN
                            </span>
                          )}
                        </div>
                        {activeWallet?.id === wallet.id && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[var(--success)]" />
                            <span className="text-xs text-[var(--success)]">Active</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-between mb-4">
                        <p className="text-sm text-[var(--text-muted)] font-mono">
                          {formatAddress(wallet.public_key, 8)}
                        </p>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {balances[wallet.id]?.toFixed(4) || "..."} SOL
                        </p>
                      </div>

                      {/* Actions Row 1: Main Controls */}
                      <div className="flex items-center gap-2 mb-2">
                        {activeWallet?.id !== wallet.id && (
                          <button
                            onClick={() => setActiveWallet(wallet)}
                            className="flex-1 py-2 rounded-lg text-sm font-medium text-[var(--text-primary)] bg-[var(--ocean-surface)] hover:bg-[var(--ocean-elevated)] transition-colors"
                          >
                            Activate
                          </button>
                        )}
                        {!wallet.is_primary && (
                          <button
                            onClick={() => setMainWallet(wallet)}
                            className="flex-1 py-2 rounded-lg text-sm font-medium text-[var(--aqua-primary)] border border-[var(--aqua-border)] hover:bg-[var(--aqua-subtle)] transition-colors"
                          >
                            Set as Main
                          </button>
                        )}
                      </div>

                      {/* Actions Row 2: Withdraw, Copy, Remove */}
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setWithdrawWallet(wallet)}
                          className="flex-1 py-2 rounded-lg text-sm font-medium text-teal-400 bg-teal-500/10 hover:bg-teal-500/20 transition-colors flex items-center justify-center gap-1.5"
                        >
                          <Send className="w-3.5 h-3.5" />
                          Withdraw
                        </button>
                        <button
                          onClick={() => copyAddress(wallet.public_key, wallet.id)}
                          className="p-2 rounded-lg border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] hover:border-[var(--aqua-border)] transition-colors"
                          title="Copy Address"
                        >
                          {copiedId === wallet.id ? (
                            <Check className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                        {!wallet.is_primary && (
                          <button
                            onClick={() => handleRemoveWallet(wallet.id)}
                            disabled={isDeleting}
                            className={cn(
                              "p-2 rounded-lg border transition-colors",
                              confirmDelete === wallet.id
                                ? "border-red-500 bg-red-500/20 text-red-400"
                                : "border-[var(--glass-border)] text-[var(--text-muted)] hover:text-red-400 hover:border-red-500/50"
                            )}
                            title={confirmDelete === wallet.id ? "Click again to confirm" : "Remove Wallet"}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        <a
                          href={`https://solscan.io/account/${wallet.public_key}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-2 rounded-lg border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] hover:border-[var(--aqua-border)] transition-colors"
                          title="View on Solscan"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-[var(--glass-border)] space-y-3">
                {wallets.length >= 25 ? (
                  <div className="text-center py-2 px-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <p className="text-sm text-amber-400">Maximum 25 wallets reached</p>
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      onClose()
                      setIsOnboarding(true)
                    }}
                    className="w-full btn-primary"
                  >
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                    </svg>
                    Add Wallet ({wallets.length}/25)
                  </button>
                )}
                <button
                  onClick={disconnect}
                  className="w-full py-3 rounded-xl text-sm font-medium text-[var(--text-muted)] hover:text-[var(--error)] hover:bg-[var(--error)]/10 transition-all"
                >
                  Disconnect All
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
    </>
  )
}
