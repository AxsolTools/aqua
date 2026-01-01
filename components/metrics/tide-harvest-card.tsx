"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"

interface TideHarvestCardProps {
  tokenId: string
  creatorId: string | null
  tokenAddress?: string
}

interface RewardsData {
  balance: number
  pumpBalance: number
  migrationBalance: number
  vaultAddress: string
  hasRewards: boolean
  stage: string
  isCreator: boolean
  claimUrl?: string
}

export function TideHarvestCard({ tokenId, creatorId, tokenAddress }: TideHarvestCardProps) {
  const { userId, activeWallet, mainWallet } = useAuth()
  const [rewards, setRewards] = useState<RewardsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key
  const isCreator = userId === creatorId

  // Fetch creator rewards from API
  const fetchRewards = useCallback(async () => {
    if (!tokenAddress || !walletAddress) {
      setIsLoading(false)
      return
    }

    try {
      const response = await fetch(
        `/api/creator-rewards?tokenMint=${tokenAddress}&creatorWallet=${walletAddress}`
      )
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          setRewards(data.data)
        }
      }
    } catch (error) {
      console.debug("[TIDE-HARVEST] Failed to fetch rewards:", error)
    } finally {
      setIsLoading(false)
    }
  }, [tokenAddress, walletAddress])

  useEffect(() => {
    fetchRewards()

    // Poll every 30 seconds for real-time updates
    const interval = setInterval(fetchRewards, 30_000)
    return () => clearInterval(interval)
  }, [fetchRewards])

  // Wave animation
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvas.offsetWidth * dpr
    canvas.height = canvas.offsetHeight * dpr
    ctx.scale(dpr, dpr)

    const width = canvas.offsetWidth
    const height = canvas.offsetHeight

    let animationId: number
    let time = 0

    const animate = () => {
      ctx.clearRect(0, 0, width, height)

      for (let layer = 0; layer < 3; layer++) {
        ctx.beginPath()
        ctx.moveTo(0, height)

        for (let x = 0; x <= width; x++) {
          const y =
            height -
            15 -
            layer * 8 +
            Math.sin((x / width) * Math.PI * 2 + time * 0.002 + layer * 0.5) * 4 +
            Math.sin((x / width) * Math.PI * 4 + time * 0.003) * 2

          ctx.lineTo(x, y)
        }

        ctx.lineTo(width, height)
        ctx.closePath()

        const opacity = 0.15 - layer * 0.04
        ctx.fillStyle = `rgba(0, 242, 255, ${opacity})`
        ctx.fill()
      }

      time += 16
      animationId = requestAnimationFrame(animate)
    }

    animate()

    return () => cancelAnimationFrame(animationId)
  }, [])

  const handleClaim = async () => {
    if (!rewards?.hasRewards || !tokenAddress || !walletAddress) return

    setIsClaiming(true)
    setClaimMessage(null)

    try {
      const response = await fetch("/api/creator-rewards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenMint: tokenAddress,
          walletAddress,
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setClaimMessage(`Successfully claimed ${rewards.balance.toFixed(6)} SOL!`)
        await fetchRewards()
      } else {
        // If claiming failed but we have a claim URL, show that
        if (data.data?.claimUrl) {
          setClaimMessage(data.error)
          // Open Pump.fun in new tab
          window.open(data.data.claimUrl, "_blank")
        } else {
          setClaimMessage(data.error || "Failed to claim rewards")
        }
      }
    } catch (error) {
      console.error("[TIDE-HARVEST] Claim failed:", error)
      setClaimMessage("Failed to claim rewards")
    }

    setIsClaiming(false)
  }

  const openPumpFun = () => {
    if (tokenAddress) {
      window.open(`https://pump.fun/coin/${tokenAddress}`, "_blank")
    }
  }

  const formatSol = (amount: number) => {
    if (amount >= 1) return amount.toFixed(4)
    if (amount >= 0.001) return amount.toFixed(6)
    return amount.toFixed(8)
  }

  const balance = rewards?.balance || 0
  const hasRewards = balance > 0

  if (isLoading) {
    return (
      <div className="h-32 flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative h-32 rounded-lg overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full">
        <div className="flex items-baseline gap-1 mb-1">
          <motion.span
            key={balance}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-2xl font-bold text-[var(--aqua-primary)] font-mono aqua-text-glow"
          >
            {formatSol(balance)}
          </motion.span>
          <span className="text-sm text-[var(--text-secondary)]">SOL</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {hasRewards ? "available to harvest" : "creator rewards"}
        </p>

        {claimMessage && (
          <p className="text-[10px] text-center max-w-[220px] mb-2 px-2 py-1 rounded bg-[var(--bg-secondary)]">
            {claimMessage}
          </p>
        )}

        {isCreator && hasRewards ? (
          <div className="flex items-center gap-2">
            <motion.button
              onClick={handleClaim}
              disabled={isClaiming}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] text-xs font-semibold hover:shadow-[0_0_20px_rgba(0,242,255,0.3)] transition-all disabled:opacity-50"
            >
              {isClaiming ? (
                <span className="flex items-center gap-1.5">
                  <div className="w-3 h-3 border-2 border-[var(--ocean-deep)] border-t-transparent rounded-full animate-spin" />
                  Claiming...
                </span>
              ) : (
                "Harvest"
              )}
            </motion.button>
            <button
              onClick={openPumpFun}
              className="px-3 py-1.5 rounded-lg border border-[var(--aqua-primary)]/30 text-[var(--aqua-primary)] text-xs font-medium hover:bg-[var(--aqua-primary)]/10 transition-colors"
            >
              Pump.fun
            </button>
          </div>
        ) : hasRewards ? (
          <button
            onClick={openPumpFun}
            className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] text-xs font-semibold hover:shadow-[0_0_20px_rgba(0,242,255,0.3)] transition-all"
          >
            Claim on Pump.fun
          </button>
        ) : (
          <div className="px-3 py-1.5 rounded-full bg-[var(--ocean-surface)]/50 border border-[var(--glass-border)]">
            <span className="text-xs text-[var(--text-muted)]">
              {isCreator ? "No rewards yet" : "Creator rewards"}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
