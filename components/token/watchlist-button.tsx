"use client"

import { useState, useEffect } from "react"
import { motion } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

interface WatchlistButtonProps {
  tokenId: string
  className?: string
}

export function WatchlistButton({ tokenId, className }: WatchlistButtonProps) {
  const { userId, isAuthenticated, setIsOnboarding } = useAuth()
  const [isWatching, setIsWatching] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    if (userId) {
      checkWatchlist()
    }
  }, [tokenId, userId])

  const checkWatchlist = async () => {
    if (!userId) return

    const { data } = await supabase
      .from("watchlist")
      .select("id")
      .eq("user_id", userId)
      .eq("token_id", tokenId)
      .single()

    setIsWatching(!!data)
  }

  const toggleWatchlist = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!userId || isLoading) return

    setIsLoading(true)

    if (isWatching) {
      await supabase.from("watchlist").delete().eq("user_id", userId).eq("token_id", tokenId)
      setIsWatching(false)
    } else {
      await supabase.from("watchlist").insert({
        user_id: userId,
        token_id: tokenId,
      })
      setIsWatching(true)
    }

    setIsLoading(false)
  }

  return (
    <motion.button
      onClick={toggleWatchlist}
      disabled={isLoading}
      whileTap={{ scale: 0.9 }}
      className={cn(
        "p-3 rounded-xl border transition-all",
        isWatching
          ? "border-[var(--warm-orange)] bg-[var(--warm-orange)]/10"
          : "border-[var(--glass-border)] hover:border-[var(--warm-orange)]/50",
        className,
      )}
    >
      <motion.svg
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill={isWatching ? "var(--warm-orange)" : "none"}
        stroke="var(--warm-orange)"
        strokeWidth="2"
        animate={isWatching ? { scale: [1, 1.2, 1] } : {}}
        transition={{ duration: 0.3 }}
      >
        <path d="M10 2l1.5 4.5H16l-3.5 3 1.5 4.5L10 11.5 6 14l1.5-4.5L4 6.5h4.5L10 2z" />
      </motion.svg>
    </motion.button>
  )
}
