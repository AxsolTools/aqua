"use client"

import { useState, useRef, useEffect } from "react"
import type { Token } from "@/lib/types/database"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { FeeBreakdown } from "@/components/ui/fee-breakdown"
import { cn } from "@/lib/utils"

interface TradePanelProps {
  token: Token
}

// Error code to user-friendly message mapping
const ERROR_MESSAGES: Record<number, string> = {
  1001: "Please connect your wallet first",
  1002: "Session expired - please reconnect wallet",
  2001: "Not enough SOL in your wallet",
  2002: "Not enough tokens to sell",
  2003: "Invalid amount entered",
  3001: "Trade failed on-chain - try again",
  3002: "Transaction timed out - check Solscan",
  3003: "Slippage too high - increase tolerance",
  4001: "Token not found or delisted",
  4002: "Bonding curve locked",
}

export function TradePanel({ token }: TradePanelProps) {
  const { isAuthenticated, wallets, activeWallet, setActiveWallet, sessionId, userId, setIsOnboarding } = useAuth()
  const [mode, setMode] = useState<"buy" | "sell">("buy")
  const [amount, setAmount] = useState("")
  const [slippage, setSlippage] = useState("1")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [showWalletSelector, setShowWalletSelector] = useState(false)
  const selectorRef = useRef<HTMLDivElement>(null)

  const estimatedTokens = amount ? Number(amount) / (token.price_sol || 0.0001) : 0
  const estimatedSol = amount ? Number(amount) * (token.price_sol || 0.0001) : 0

  // Close wallet selector when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (selectorRef.current && !selectorRef.current.contains(event.target as Node)) {
        setShowWalletSelector(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

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
      wallet: activeWallet.public_key?.slice(0, 8),
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
          slippageBps: parseFloat(slippage) * 100,
        }),
      })

      const data = await response.json()
      console.log('[TRADE] Response:', data)

      if (!response.ok) {
        // Use specific error message if available
        const errorCode = data.error?.code
        const friendlyMessage = errorCode && ERROR_MESSAGES[errorCode] 
          ? ERROR_MESSAGES[errorCode]
          : data.error?.message || data.error || "Trade failed - please try again"
        throw new Error(friendlyMessage)
      }

      setSuccess(`Successfully ${mode === 'buy' ? 'bought' : 'sold'} ${token.symbol}! 🎉`)
      setAmount("")
    } catch (err) {
      console.error('[TRADE] Error:', err)
      setError(err instanceof Error ? err.message : "Trade failed - please try again")
    } finally {
      setIsLoading(false)
    }
  }

  const quickAmounts = mode === "buy" ? ["0.1", "0.5", "1", "2"] : ["25", "50", "75", "100"]

  const truncateAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`
  }

  return (
    <div className="glass-panel-elevated p-4 rounded-lg">
      {/* Active Wallet Indicator */}
      {isAuthenticated && activeWallet && (
        <div className="mb-4 relative" ref={selectorRef}>
          <div 
            onClick={() => wallets.length > 1 && setShowWalletSelector(!showWalletSelector)}
            className={cn(
              "flex items-center justify-between p-3 rounded-lg border transition-all",
              "bg-[var(--bg-secondary)] border-[var(--border-subtle)]",
              wallets.length > 1 && "cursor-pointer hover:border-[var(--aqua-primary)]"
            )}
          >
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
              <span className="text-xs text-[var(--text-muted)]">Trading with:</span>
              <span className="text-sm font-mono font-medium text-[var(--text-primary)]">
                {activeWallet.label || truncateAddress(activeWallet.public_key)}
              </span>
              {activeWallet.is_primary && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]">
                  Main
                </span>
              )}
            </div>
            {wallets.length > 1 && (
              <svg 
                className={cn("w-4 h-4 text-[var(--text-muted)] transition-transform", showWalletSelector && "rotate-180")} 
                fill="none" 
                stroke="currentColor" 
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </div>

          {/* Wallet Selector Dropdown */}
          {showWalletSelector && wallets.length > 1 && (
            <div className="absolute top-full left-0 right-0 mt-1 z-20 bg-[var(--bg-elevated)] border border-[var(--border-default)] rounded-lg shadow-xl overflow-hidden">
              <div className="p-2 border-b border-[var(--border-subtle)]">
                <span className="text-xs text-[var(--text-muted)]">Select wallet for trading</span>
              </div>
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => {
                    setActiveWallet(wallet)
                    setShowWalletSelector(false)
                  }}
                  className={cn(
                    "w-full flex items-center justify-between p-3 text-left transition-all",
                    "hover:bg-[var(--bg-secondary)]",
                    wallet.id === activeWallet.id && "bg-[var(--aqua-primary)]/10"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-mono text-[var(--text-primary)]">
                      {wallet.label || truncateAddress(wallet.public_key)}
                    </span>
                    {wallet.is_primary && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--aqua-primary)]/20 text-[var(--aqua-primary)]">
                        Main
                      </span>
                    )}
                  </div>
                  {wallet.id === activeWallet.id && (
                    <svg className="w-4 h-4 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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
        <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="text-red-400 text-sm">{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-green-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="text-green-400 text-sm">{success}</span>
          </div>
        </div>
      )}

      {/* Trade button */}
      {!isAuthenticated ? (
        <button onClick={() => setIsOnboarding(true)} className="btn-primary w-full">
          Connect Wallet to Trade
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

      {/* Fee breakdown */}
      {amount && parseFloat(amount) > 0 && (
        <div className="mt-4">
          <FeeBreakdown
            operationType={mode}
            amount={mode === "buy" ? parseFloat(amount) : estimatedSol}
            tokenSymbol={token.symbol}
          />
        </div>
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
