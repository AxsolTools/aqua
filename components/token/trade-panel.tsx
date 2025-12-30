"use client"

import { useState } from "react"
import type { Token } from "@/lib/types/database"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { cn } from "@/lib/utils"

interface TradePanelProps {
  token: Token
}

export function TradePanel({ token }: TradePanelProps) {
  const { isAuthenticated, activeWallet, sessionId, userId, setIsOnboarding } = useAuth()
  const [mode, setMode] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState("")
  const [slippage, setSlippage] = useState("1")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const estimatedTokens = amount ? Number(amount) / (token.price_sol || 0.0001) : 0
  const estimatedSol = amount ? Number(amount) * (token.price_sol || 0.0001) : 0

  const handleTrade = async () => {
    if (!isAuthenticated || !activeWallet || !amount) return

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    console.log('[TRADE] Executing trade:', {
      action: mode,
      token: token.mint_address?.slice(0, 8),
      amount,
      slippage,
    })

    try {
      const response = await fetch("/api/trade", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress: activeWallet.public_key,
        }),
        body: JSON.stringify({
          action: mode,
          tokenMint: token.mint_address,
          amount: parseFloat(amount),
          slippageBps: parseFloat(slippage) * 100, // Convert percentage to basis points
        }),
      })

      const data = await response.json()
      console.log('[TRADE] Response:', data)

      if (!response.ok) {
        throw new Error(data.error?.message || data.error || "Trade failed")
      }

      setSuccess(`Successfully ${mode === 'buy' ? 'bought' : 'sold'} ${token.symbol}!`)
      setAmount("")
    } catch (err) {
      console.error('[TRADE] Error:', err)
      setError(err instanceof Error ? err.message : "Trade failed")
    } finally {
      setIsLoading(false)
    }
  }

  const quickAmounts = mode === "buy" ? ["0.1", "0.5", "1", "2"] : ["25", "50", "75", "100"]

  return (
    <div className="glass-panel-elevated p-4 rounded-lg">
      {/* Header */}
      <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Swap {token.symbol}</h3>

      <div className="flex gap-2 mb-6 bg-[var(--bg-secondary)] p-1 rounded-lg border border-[var(--border-subtle)]">
        <button
          onClick={() => setMode("buy")}
          className={cn(
            "flex-1 py-2.5 rounded font-semibold text-sm transition-all",
            mode === "buy"
              ? "bg-[var(--green)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          Buy
        </button>
        <button
          onClick={() => setMode("sell")}
          className={cn(
            "flex-1 py-2.5 rounded font-semibold text-sm transition-all",
            mode === "sell"
              ? "bg-[var(--red)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]",
          )}
        >
          Sell
        </button>
      </div>

      {/* Amount Input */}
      <div className="mb-4">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase mb-2 tracking-wide">
          {mode === "buy" ? "Amount in SOL" : "Amount in " + token.symbol}
        </label>
        <div className="relative">
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="input w-full text-lg"
          />
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-muted)] font-medium">
            {mode === "buy" ? "SOL" : token.symbol}
          </div>
        </div>

        {/* Quick amounts */}
        <div className="flex gap-1 mt-2">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt)}
              className="flex-1 px-2 py-1.5 rounded text-xs font-medium border border-[var(--border-default)] text-[var(--text-muted)] hover:border-[var(--aqua-primary)] hover:text-[var(--aqua-primary)] transition-all"
            >
              {mode === "buy" ? amt : `${amt}%`}
            </button>
          ))}
        </div>
      </div>

      {/* Arrow separator */}
      <div className="flex items-center justify-center my-3 text-[var(--text-muted)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M8 2v12M4 10l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </div>

      {/* Output estimate */}
      <div className="p-3 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] mb-4">
        <div className="text-xs text-[var(--text-muted)] uppercase font-medium mb-1">You receive</div>
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold text-[var(--text-primary)]">
            {mode === "buy"
              ? estimatedTokens.toLocaleString(undefined, { maximumFractionDigits: 2 })
              : estimatedSol.toFixed(6)}
          </span>
          <span className="text-xs text-[var(--text-muted)] font-medium">{mode === "buy" ? token.symbol : "SOL"}</span>
        </div>
      </div>

      {/* Slippage */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-[var(--text-muted)] uppercase mb-2 tracking-wide">
          Slippage tolerance
        </label>
        <div className="flex gap-1">
          {["0.5", "1", "2", "5"].map((s) => (
            <button
              key={s}
              onClick={() => setSlippage(s)}
              className={cn(
                "flex-1 py-1.5 rounded text-xs font-medium border transition-all",
                slippage === s
                  ? "border-[var(--aqua-primary)] bg-[var(--aqua-bg)] text-[var(--aqua-primary)]"
                  : "border-[var(--border-subtle)] text-[var(--text-muted)] hover:border-[var(--border-default)]",
              )}
            >
              {s}%
            </button>
          ))}
        </div>
      </div>

      {/* Error/Success messages */}
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
          {success}
        </div>
      )}

      {/* Trade button */}
      {!isAuthenticated ? (
        <button onClick={() => setIsOnboarding(true)} className="btn-primary w-full">
          Connect Wallet
        </button>
      ) : (
        <button
          onClick={handleTrade}
          disabled={!amount || isLoading}
          className={cn(
            "w-full py-3 rounded-lg font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed",
            mode === "buy"
              ? "bg-[var(--green)] text-white hover:bg-[var(--green-light)] shadow-lg hover:shadow-xl hover:shadow-[var(--green)]/25"
              : "bg-[var(--red)] text-white hover:bg-[var(--red-light)] shadow-lg hover:shadow-xl hover:shadow-[var(--red)]/25",
          )}
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Processing...
            </span>
          ) : (
            `${mode === "buy" ? "Buy" : "Sell"} ${token.symbol}`
          )}
        </button>
      )}

      {/* Price info footer */}
      <div className="mt-4 pt-4 border-t border-[var(--border-subtle)] space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Price</span>
          <span className="text-[var(--text-primary)] font-medium">{token.price_sol?.toFixed(8) || "0"} SOL</span>
        </div>
        <div className="flex justify-between">
          <span className="text-[var(--text-muted)]">Price impact</span>
          <span className="text-[var(--green)]">&lt;0.01%</span>
        </div>
      </div>
    </div>
  )
}
