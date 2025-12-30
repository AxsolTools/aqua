"use client"

import { useEffect, useState, useRef } from "react"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import type { TideHarvest } from "@/lib/types/database"

interface TideHarvestCardProps {
  tokenId: string
  creatorId: string
}

export function TideHarvestCard({ tokenId, creatorId }: TideHarvestCardProps) {
  const { userId } = useAuth()
  const [harvest, setHarvest] = useState<TideHarvest | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isClaiming, setIsClaiming] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const isCreator = userId === creatorId

  useEffect(() => {
    const fetchHarvest = async () => {
      const supabase = createClient()

      const { data } = await supabase.from("tide_harvests").select("*").eq("token_id", tokenId).single()

      if (data) {
        setHarvest(data as TideHarvest)
      }

      setIsLoading(false)
    }

    fetchHarvest()
  }, [tokenId])

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

  const claimable = harvest ? harvest.total_accumulated - harvest.total_claimed : 0

  const handleClaim = async () => {
    if (!isCreator || claimable <= 0) return

    setIsClaiming(true)

    // Claim logic would interact with Creator Vault PDA
    setTimeout(() => {
      setIsClaiming(false)
    }, 2000)
  }

  const formatSol = (amount: number) => {
    return amount.toFixed(4)
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
            key={claimable}
            initial={{ scale: 1.2, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="text-2xl font-bold text-[var(--aqua-primary)] font-mono aqua-text-glow"
          >
            {formatSol(claimable)}
          </motion.span>
          <span className="text-sm text-[var(--text-secondary)]">SOL</span>
        </div>
        <p className="text-xs text-[var(--text-muted)] mb-3">available to harvest</p>

        {isCreator && claimable > 0 ? (
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
            <span className="text-xs text-[var(--text-muted)]">{isCreator ? "No rewards yet" : "Creator rewards"}</span>
          </div>
        )}
      </div>
    </div>
  )
}
