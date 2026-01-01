"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"
import { useLogsSubscription, useHeliusWebSocketState } from "@/hooks/use-helius-websocket"

interface Transaction {
  signature: string
  type: "buy" | "sell" | "transfer" | "unknown"
  walletAddress: string
  amountSol: number
  amountTokens: number
  timestamp: number
  status: "confirmed" | "pending" | "failed"
}

interface TransactionHistoryProps {
  tokenAddress: string
  tokenId?: string
}

export function TransactionHistory({ tokenAddress, tokenId }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const pendingSignatures = useRef<Set<string>>(new Set())
  
  // WebSocket state for UI indicator
  const wsState = useHeliusWebSocketState()

  // Fetch transactions from API (combines on-chain + database)
  const fetchTransactions = useCallback(async () => {
    try {
      setError(null)
      const response = await fetch(`/api/token/${tokenAddress}/transactions?limit=50`)
      
      if (response.ok) {
        const data = await response.json()
        if (data.success) {
          setTransactions(data.data?.transactions || [])
        }
      } else {
        console.warn('[TRANSACTIONS] API error:', response.status)
      }
    } catch (err) {
      console.warn('[TRANSACTIONS] Fetch error:', err)
      setError("Failed to load transactions")
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress])

  // Initial fetch
  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  // WebSocket subscription for real-time updates (replaces 5s polling when connected)
  // This is much more efficient - only fetches when there's actually a new transaction
  useLogsSubscription(
    wsState.isConnected ? tokenAddress : null,
    useCallback((logs) => {
      // New transaction detected via WebSocket!
      const signature = logs.signature
      
      // Avoid duplicate fetches for the same signature
      if (pendingSignatures.current.has(signature)) return
      pendingSignatures.current.add(signature)
      
      // Fetch the new transaction details
      setTimeout(() => {
        fetchTransactions()
        pendingSignatures.current.delete(signature)
      }, 1000) // Small delay to ensure transaction is indexed
    }, [fetchTransactions])
  )

  // Fallback polling when WebSocket is not connected (less frequent)
  useEffect(() => {
    // If WebSocket is connected, use less frequent polling as backup
    // If not connected, poll every 5 seconds
    const interval = wsState.isConnected ? 30_000 : 5_000
    const timer = setInterval(fetchTransactions, interval)
    return () => clearInterval(timer)
  }, [fetchTransactions, wsState.isConnected])

  // Real-time subscription for platform trades
  useEffect(() => {
    if (!tokenId || tokenId.startsWith('external-')) return

    const supabase = createClient()
    const channel = supabase
      .channel(`txns-${tokenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades", filter: `token_id=eq.${tokenId}` },
        (payload) => {
          const trade = payload.new as {
            tx_signature: string
            trade_type: string
            wallet_address: string
            amount_sol: number
            amount_tokens: number
            created_at: string
            status: string
          }
          
          const newTx: Transaction = {
            signature: trade.tx_signature || "",
            type: trade.trade_type as "buy" | "sell",
            walletAddress: trade.wallet_address,
            amountSol: trade.amount_sol || 0,
            amountTokens: trade.amount_tokens || 0,
            timestamp: new Date(trade.created_at).getTime(),
            status: trade.status === "completed" ? "confirmed" : "pending",
          }
          
          setTransactions((prev) => {
            // Avoid duplicates
            if (prev.some(t => t.signature === newTx.signature)) return prev
            return [newTx, ...prev].slice(0, 50)
          })
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tokenId])

  const formatAddress = (addr: string) => {
    if (!addr || addr.length < 8) return addr || "..."
    return `${addr.slice(0, 4)}...${addr.slice(-4)}`
  }

  const formatSolAmount = (amount: number) => {
    if (!amount || amount === 0) return "0.0000"
    if (amount < 0.0001) return "<0.0001"
    if (amount < 0.01) return amount.toFixed(6)
    if (amount < 1) return amount.toFixed(4)
    return amount.toFixed(2)
  }
  
  const formatTime = (timestamp: number) => {
    const now = Date.now()
    const diff = (now - timestamp) / 1000

    if (diff < 60) return `${Math.floor(diff)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(timestamp).toLocaleDateString()
  }

  const openExplorer = (signature: string) => {
    if (signature) {
      window.open(`https://solscan.io/tx/${signature}`, "_blank")
    }
  }

  if (isLoading) {
    return (
      <GlassPanel className="p-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Recent Trades</h3>
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 skeleton rounded-lg" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Trades</h3>
          <div className="flex items-center gap-1.5">
            <span 
              className={cn(
                "w-2 h-2 rounded-full",
                wsState.isConnected 
                  ? "bg-[var(--success)] animate-pulse" 
                  : "bg-[var(--warning)]"
              )} 
            />
            <span className="text-xs text-[var(--text-muted)]">
              {wsState.isConnected ? "Live" : "Polling"}
            </span>
          </div>
        </div>
        <button
          onClick={fetchTransactions}
          className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="text-center py-4 mb-2 rounded-lg bg-[var(--error)]/10 border border-[var(--error)]/20">
          <p className="text-sm text-[var(--error)]">{error}</p>
          <button
            onClick={fetchTransactions}
            className="text-xs text-[var(--aqua-primary)] hover:underline mt-1"
          >
            Try again
          </button>
        </div>
      )}

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[var(--bg-secondary)] flex items-center justify-center">
            <svg className="w-6 h-6 text-[var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <p className="text-sm text-[var(--text-muted)]">No transactions yet</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Trades will appear here in real-time</p>
        </div>
      ) : (
        <div className="space-y-1.5 max-h-80 overflow-y-auto custom-scrollbar">
          <AnimatePresence mode="popLayout">
            {transactions.map((tx, index) => (
              <motion.div
                key={tx.signature || `tx-${index}`}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.02 }}
                onClick={() => openExplorer(tx.signature)}
                className="flex items-center justify-between p-2.5 rounded-lg bg-[var(--bg-secondary)]/50 hover:bg-[var(--bg-secondary)] transition-colors cursor-pointer group"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={cn(
                      "w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0",
                      tx.type === "buy" ? "bg-[var(--success)]/10" 
                        : tx.type === "sell" ? "bg-[var(--error)]/10" 
                        : "bg-[var(--text-muted)]/10",
                    )}
                  >
                    {tx.type === "buy" ? (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-[var(--success)]">
                        <path
                          d="M7 11V3M3 7l4-4 4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : tx.type === "sell" ? (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-[var(--error)]">
                        <path
                          d="M7 3v8M11 7l-4 4-4-4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="12" height="12" viewBox="0 0 14 14" fill="none" className="text-[var(--text-muted)]">
                        <path
                          d="M7 3v8M3 7h8"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={cn(
                        "text-sm font-medium",
                        tx.type === "buy" ? "text-[var(--success)]" 
                          : tx.type === "sell" ? "text-[var(--error)]" 
                          : "text-[var(--text-muted)]"
                      )}>
                        {tx.type === "buy" ? "Buy" : tx.type === "sell" ? "Sell" : "Trade"}
                      </span>
                      <svg 
                        className="w-3 h-3 text-[var(--text-muted)] opacity-0 group-hover:opacity-100 transition-opacity" 
                        fill="none" 
                        viewBox="0 0 24 24" 
                        stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </div>
                    <p className="text-xs text-[var(--text-muted)] font-mono">{formatAddress(tx.walletAddress)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold font-mono",
                      tx.type === "buy" ? "text-[var(--success)]" 
                        : tx.type === "sell" ? "text-[var(--error)]"
                        : "text-[var(--text-secondary)]",
                    )}
                  >
                    {tx.type === "buy" ? "+" : tx.type === "sell" ? "-" : ""}
                    {formatSolAmount(tx.amountSol)} SOL
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatTime(tx.timestamp)}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </GlassPanel>
  )
}
