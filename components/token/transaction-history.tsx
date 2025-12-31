"use client"

import { useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { GlassPanel } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface Transaction {
  id: string
  type: string
  wallet_address: string
  amount_sol: number
  tx_signature: string
  status: string
  created_at: string
}

interface TransactionHistoryProps {
  tokenAddress: string
  tokenId?: string
}

export function TransactionHistory({ tokenAddress, tokenId }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [resolvedTokenId, setResolvedTokenId] = useState<string | null>(tokenId || null)

  useEffect(() => {
    const fetchTransactions = async () => {
      try {
        const supabase = createClient()
        
        // First, get the token_id if not provided
        let effectiveTokenId = tokenId
        if (!effectiveTokenId && tokenAddress) {
          const { data: tokenData } = await supabase
            .from("tokens")
            .select("id")
            .eq("mint_address", tokenAddress)
            .single()
          
          if (tokenData) {
            effectiveTokenId = tokenData.id
            setResolvedTokenId(tokenData.id)
          }
        }
        
        if (!effectiveTokenId) {
          console.warn('[TRANSACTIONS] No token_id found for address:', tokenAddress)
          setIsLoading(false)
          return
        }
        
        // Query trades table using token_id (this is the correct table/column)
        const { data, error } = await supabase
          .from("trades")
          .select("id, token_id, wallet_address, trade_type, amount_sol, tx_signature, status, created_at")
          .eq("token_id", effectiveTokenId)
          .order("created_at", { ascending: false })
          .limit(50)

        if (error) {
          console.warn('[TRANSACTIONS] Query error:', error)
        } else if (data) {
          // Map trades data to Transaction format
          const mappedData = data.map(trade => ({
            id: trade.id,
            type: trade.trade_type,
            wallet_address: trade.wallet_address,
            amount_sol: trade.amount_sol,
            tx_signature: trade.tx_signature,
            status: trade.status,
            created_at: trade.created_at
          }))
          setTransactions(mappedData)
        }
      } catch (err) {
        console.warn('[TRANSACTIONS] Failed to fetch:', err)
      }
      setIsLoading(false)
    }

    fetchTransactions()
  }, [tokenAddress, tokenId])
  
  // Real-time subscription (separate effect to handle resolved token ID)
  useEffect(() => {
    if (!resolvedTokenId) return

    const supabase = createClient()
    const channel = supabase
      .channel(`txns-${resolvedTokenId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "trades", filter: `token_id=eq.${resolvedTokenId}` },
        (payload) => {
          const trade = payload.new as { id: string; trade_type: string; wallet_address: string; amount_sol: number; tx_signature: string; status: string; created_at: string }
          const newTx: Transaction = {
            id: trade.id,
            type: trade.trade_type,
            wallet_address: trade.wallet_address,
            amount_sol: trade.amount_sol,
            tx_signature: trade.tx_signature,
            status: trade.status,
            created_at: trade.created_at
          }
          setTransactions((prev) => [newTx, ...prev].slice(0, 50))
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [resolvedTokenId])

  const formatAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`
  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000

    if (diff < 60) return `${Math.floor(diff)}s ago`
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  if (isLoading) {
    return (
      <GlassPanel className="p-6">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Recent Transactions</h3>
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 skeleton rounded-lg" />
          ))}
        </div>
      </GlassPanel>
    )
  }

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Recent Transactions</h3>
        <span className="text-xs text-[var(--text-muted)]">{transactions.length} transactions</span>
      </div>

      {transactions.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-[var(--text-muted)]">No transactions yet</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          <AnimatePresence>
            {transactions.map((tx, index) => (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ delay: index * 0.02 }}
                className="flex items-center justify-between p-3 rounded-lg bg-[var(--ocean-surface)]/50 hover:bg-[var(--ocean-surface)] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-lg flex items-center justify-center",
                      tx.type === "buy" ? "bg-[var(--success)]/10" : "bg-[var(--error)]/10",
                    )}
                  >
                    {tx.type === "buy" ? (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--success)]">
                        <path
                          d="M7 11V3M3 7l4-4 4 4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-[var(--error)]">
                        <path
                          d="M7 3v8M11 7l-4 4-4-4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--text-primary)]">
                      {tx.type === "buy" ? "Buy" : "Sell"}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] font-mono">{formatAddress(tx.wallet_address)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "text-sm font-semibold font-mono",
                      tx.type === "buy" ? "text-[var(--success)]" : "text-[var(--error)]",
                    )}
                  >
                    {tx.type === "buy" ? "+" : "-"}
                    {(Number(tx.amount_sol) || 0).toFixed(4)} SOL
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">{formatTime(tx.created_at)}</p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </GlassPanel>
  )
}
