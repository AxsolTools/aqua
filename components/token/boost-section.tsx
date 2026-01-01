"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { createClient } from "@/lib/supabase/client"
import { GlassPanel } from "@/components/ui/glass-panel"
import { useAuth } from "@/components/providers/auth-provider"
import { cn } from "@/lib/utils"

interface VouchSectionProps {
  tokenAddress: string
}

export function BoostSection({ tokenAddress }: VouchSectionProps) {
  const { activeWallet, isAuthenticated, setIsOnboarding } = useAuth()
  const [totalVouches, setTotalVouches] = useState(0)
  const [hasVouched, setHasVouched] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [topVouchers, setTopVouchers] = useState<{ wallet_address: string; vouched_at: string }[]>([])

  useEffect(() => {
    fetchVouches()
  }, [tokenAddress, activeWallet])

  const fetchVouches = async () => {
    try {
      const supabase = createClient()

      // Get all vouches for this token
      const { data: vouchesData } = await supabase
        .from("vouches")
        .select("wallet_address, created_at")
        .eq("token_address", tokenAddress)
        .order("created_at", { ascending: false })

      if (vouchesData) {
        setTotalVouches(vouchesData.length)
        setTopVouchers(vouchesData.slice(0, 5).map(v => ({
          wallet_address: v.wallet_address,
          vouched_at: v.created_at
        })))

        // Check if user has vouched
        if (activeWallet) {
          const userVouch = vouchesData.find(v => v.wallet_address === activeWallet.public_key)
          setHasVouched(!!userVouch)
        }
      }
    } catch (error) {
      console.debug('[VOUCH] Failed to fetch vouches:', error)
    }
  }

  const handleVouch = async () => {
    if (!isAuthenticated) {
      setIsOnboarding(true)
      return
    }

    if (!activeWallet || isLoading) return

    setIsLoading(true)

    try {
      const supabase = createClient()

      if (hasVouched) {
        // Remove vouch
        await supabase
          .from("vouches")
          .delete()
          .eq("token_address", tokenAddress)
          .eq("wallet_address", activeWallet.public_key)

        setHasVouched(false)
        setTotalVouches(prev => Math.max(0, prev - 1))
      } else {
        // Add vouch
        await supabase
          .from("vouches")
          .insert({
            token_address: tokenAddress,
            wallet_address: activeWallet.public_key,
          })

        setHasVouched(true)
        setTotalVouches(prev => prev + 1)
      }

      // Refresh data
      fetchVouches()
    } catch (error) {
      console.error('[VOUCH] Failed to vouch:', error)
    }

    setIsLoading(false)
  }

  const formatAddress = (addr: string) => `${addr.slice(0, 4)}...${addr.slice(-4)}`
  
  const formatTime = (date: string) => {
    const d = new Date(date)
    const now = new Date()
    const diff = (now.getTime() - d.getTime()) / 1000

    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return d.toLocaleDateString()
  }

  return (
    <GlassPanel className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Vouch For This Token</h3>
          <p className="text-sm text-[var(--text-muted)] mt-1">Show your trust in this project</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-[var(--aqua-primary)]">{totalVouches.toLocaleString()}</p>
          <p className="text-xs text-[var(--text-muted)]">Total Vouches</p>
        </div>
      </div>

      {/* Vouch Button */}
      <motion.button
        onClick={handleVouch}
        disabled={isLoading}
        whileHover={{ scale: 1.01 }}
        whileTap={{ scale: 0.99 }}
        className={cn(
          "w-full py-4 rounded-xl font-semibold transition-all flex items-center justify-center gap-3",
          hasVouched
            ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
            : "border-2 border-dashed border-[var(--aqua-primary)]/40 text-[var(--aqua-primary)] hover:border-[var(--aqua-primary)] hover:bg-[var(--aqua-primary)]/10"
        )}
      >
        {isLoading ? (
          <div className="w-5 h-5 border-2 border-current/30 border-t-current rounded-full animate-spin" />
        ) : (
          <>
            <svg 
              width="20" 
              height="20" 
              viewBox="0 0 24 24" 
              fill={hasVouched ? "currentColor" : "none"} 
              stroke="currentColor" 
              strokeWidth="2"
            >
              <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
            </svg>
            {hasVouched ? "Vouched!" : "Vouch for this token"}
          </>
        )}
      </motion.button>

      {hasVouched && (
        <p className="text-sm text-[var(--aqua-primary)] mt-3 text-center">
          You&apos;re vouching for this token ✓
        </p>
      )}

      {/* Recent Vouchers */}
      {topVouchers.length > 0 && (
        <div className="mt-6">
          <h4 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Recent Vouchers</h4>
          <div className="space-y-2">
            <AnimatePresence>
              {topVouchers.map((voucher, i) => (
                <motion.div
                  key={voucher.wallet_address}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-[var(--ocean-surface)]/30"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/20 flex items-center justify-center">
                      <svg className="w-3.5 h-3.5 text-[var(--aqua-primary)]" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                      </svg>
                    </div>
                    <span className="text-sm font-mono text-[var(--text-primary)]">
                      {formatAddress(voucher.wallet_address)}
                    </span>
                  </div>
                  <span className="text-xs text-[var(--text-muted)]">
                    {formatTime(voucher.vouched_at)}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}
    </GlassPanel>
  )
}
