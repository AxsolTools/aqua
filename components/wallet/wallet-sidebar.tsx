"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { cn, formatAddress } from "@/lib/utils"

interface WalletSidebarProps {
  open: boolean
  onClose: () => void
}

export function WalletSidebar({ open, onClose }: WalletSidebarProps) {
  const { wallets, mainWallet, activeWallet, setActiveWallet, setMainWallet, setIsOnboarding, disconnect } = useAuth()
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const copyAddress = (address: string, id: string) => {
    navigator.clipboard.writeText(address)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  return (
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

                      <p className="text-sm text-[var(--text-muted)] font-mono mb-4">
                        {formatAddress(wallet.public_key, 8)}
                      </p>

                      <div className="flex items-center gap-2">
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
                        <button
                          onClick={() => copyAddress(wallet.public_key, wallet.id)}
                          className="p-2 rounded-lg border border-[var(--glass-border)] text-[var(--text-muted)] hover:text-[var(--aqua-primary)] hover:border-[var(--aqua-border)] transition-colors"
                        >
                          {copiedId === wallet.id ? (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                            >
                              <path d="M3 8l3 3 7-7" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          ) : (
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 16 16"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.5"
                            >
                              <rect x="5" y="5" width="8" height="8" rx="1.5" />
                              <path d="M3 11V4a1.5 1.5 0 0 1 1.5-1.5H11" />
                            </svg>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="p-6 border-t border-[var(--glass-border)] space-y-3">
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
                  Add Wallet
                </button>
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
  )
}
