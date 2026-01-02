"use client"

import { useEffect, useState, useRef, useCallback } from "react"
import { motion } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"

interface TideHarvestCardProps {
  tokenId: string
  creatorId: string | null
  tokenAddress?: string
  creatorWallet?: string  // The token creator's wallet address
}

interface RewardsData {
  balance: number
  pumpBalance: number
  migrationBalance: number
  vaultAddress: string
  hasRewards: boolean
  stage: string
  isCreator: boolean
  canClaimViaPumpPortal?: boolean
  claimUrl?: string
}

export function TideHarvestCard({ 
  tokenId, 
  creatorId, 
  tokenAddress,
  creatorWallet 
}: TideHarvestCardProps) {
  const { userId, sessionId, activeWallet, mainWallet } = useAuth()
  const [rewards, setRewards] = useState<RewardsData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const [claimMessage, setClaimMessage] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const walletAddress = activeWallet?.public_key || mainWallet?.public_key
  
  // User is the creator if their wallet matches the token's creator wallet
  const isCreator = !!(
    walletAddress && 
    creatorWallet && 
    walletAddress.toLowerCase() === creatorWallet.toLowerCase()
  )

  // Fetch creator rewards from API (only if user is creator)
  const fetchRewards = useCallback(async () => {
    // Only fetch if user is the creator
    if (!tokenAddress || !walletAddress || !isCreator) {
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
  }, [tokenAddress, walletAddress, isCreator])

  useEffect(() => {
    fetchRewards()

    // Poll every 30 seconds for real-time updates (only if creator)
    if (isCreator) {
      const interval = setInterval(fetchRewards, 30_000)
      return () => clearInterval(interval)
    }
  }, [fetchRewards, isCreator])

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
    if (!rewards?.hasRewards || !tokenAddress || !walletAddress || !sessionId) return

    setIsClaiming(true)
    setClaimMessage(null)

    try {
      const response = await fetch("/api/creator-rewards", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress,
          userId,
        }),
        body: JSON.stringify({
          tokenMint: tokenAddress,
          walletAddress,
        }),
      })

      const data = await response.json()
      
      if (data.success) {
        setClaimMessage(`Successfully claimed ${data.data?.amountClaimed?.toFixed(6) || rewards.balance.toFixed(6)} SOL!`)
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

  // If user is not the creator, don't show the component
  if (!isCreator) {
    return null
  }

  const balance = rewards?.balance || 0
  const hasRewards = balance > 0

  if (isLoading) {
    return (
      <div className="h-20 flex items-center justify-center">
        <div className="w-4 h-4 border-2 border-[var(--aqua-primary)] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="relative h-20 rounded-lg overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      <div className="relative z-10 flex flex-col items-center justify-center h-full py-1">
        <div className="flex items-baseline gap-1">
          <motion.span
            key={balance}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-lg font-bold text-[var(--aqua-primary)] font-mono aqua-text-glow"
          >
            {formatSol(balance)}
          </motion.span>
          <span className="text-xs text-[var(--text-secondary)]">SOL</span>
        </div>
        <p className="text-[10px] text-[var(--text-muted)] mb-1">
          {hasRewards ? "available" : "no rewards yet"}
        </p>

        {claimMessage && (
          <p className="text-[9px] text-center max-w-[180px] px-1 py-0.5 rounded bg-[var(--bg-secondary)]">
            {claimMessage}
          </p>
        )}

        {hasRewards ? (
          <div className="flex items-center gap-1">
            <motion.button
              onClick={handleClaim}
              disabled={isClaiming}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="px-2 py-1 rounded-md bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)] text-[var(--ocean-deep)] text-[10px] font-semibold hover:shadow-[0_0_20px_rgba(0,242,255,0.3)] transition-all disabled:opacity-50"
            >
              {isClaiming ? "..." : "Harvest"}
            </motion.button>
            <button
              onClick={openPumpFun}
              className="px-2 py-1 rounded-md border border-[var(--aqua-primary)]/30 text-[var(--aqua-primary)] text-[10px] font-medium hover:bg-[var(--aqua-primary)]/10 transition-colors"
            >
              Pump.fun
            </button>
          </div>
        ) : (
          <div className="px-2 py-0.5 rounded-full bg-[var(--ocean-surface)]/50 border border-[var(--glass-border)]">
            <span className="text-[9px] text-[var(--text-muted)]">
              From trading fees
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
