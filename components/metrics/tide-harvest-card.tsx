"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"

interface TideHarvestCardProps {
  tokenId: string
  creatorId: string
  tokenAddress?: string // Mint address for on-chain queries
}

export function TideHarvestCard({ tokenId, creatorId, tokenAddress }: TideHarvestCardProps) {
  const { userId, activeWallet, mainWallet } = useAuth()
  const [rewardsBalance, setRewardsBalance] = useState<number>(0)
  const [vaultAddress, setVaultAddress] = useState<string>("")
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimError, setClaimError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key
  const isCreator = userId === creatorId || walletAddress === tokenAddress

  // Fetch creator rewards from on-chain
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
          setRewardsBalance(data.data.balance || 0)
          setVaultAddress(data.data.vaultAddress || "")
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

    // Poll every 30 seconds
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

      // Draw waves
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
    if (!isCreator || rewardsBalance <= 0 || !tokenAddress || !walletAddress) return

    setIsClaiming(true)
    setClaimError(null)

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
        // Refresh balance after claim
        await fetchRewards()
      } else {
        setClaimError(data.error || "Failed to claim rewards")
      }
    } catch (error) {
      console.error("[TIDE-HARVEST] Claim failed:", error)
      setClaimError("Failed to claim rewards")
    }

    setIsClaiming(false)
  }

  const formatSol = (amount: number | null | undefined) => {
    return (amount || 0).toFixed(4)
  }

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
            key={rewardsBalance}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-2xl font-bold text-[var(--aqua-primary)] font-mono aqua-text-glow"
          >
            {formatSol(rewardsBalance)}
          </motion.span>
          <span className="text-sm text-[var(--text-secondary)]">SOL</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">
          {rewardsBalance > 0 ? "available to harvest" : "creator rewards"}
        </p>

        {claimError && (
          <p className="text-[10px] text-[var(--red)] mb-2 text-center max-w-[200px]">{claimError}</p>
        )}

        {isCreator && rewardsBalance > 0 ? (
          <motion.button
            onClick={handleClaim}
            disabled={isClaiming}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="px-5 py-2 rounded-xl bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] text-xs font-semibold hover:shadow-[0_0_25px_rgba(0,242,255,0.4)] transition-all disabled:opacity-50"
          >
            {isClaiming ? (
              <span className="flex items-center gap-2">
                <div className="w-3 h-3 border-2 border-[var(--ocean-deep)] border-t-transparent rounded-full animate-spin" />
                Harvesting...
              </span>
            ) : (
              "Harvest Tide"
            )}
          </motion.button>
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
