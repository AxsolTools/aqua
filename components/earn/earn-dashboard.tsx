"use client"

import { useState, useEffect, useCallback } from "react"
import { cn } from "@/lib/utils"
import { useAuth } from "@/components/providers/auth-provider"
import { VaultCard } from "./vault-card"
import { PositionCard } from "./position-card"
import { EarningsSummary } from "./earnings-summary"
import { DepositModal } from "./deposit-modal"
import { WithdrawModal } from "./withdraw-modal"

interface Vault {
  id: number
  address: string
  name: string
  symbol: string
  decimals: number
  asset: {
    address: string
    symbol: string
    name: string
    decimals: number
    logoUrl: string
    priceUsd: number
  }
  apy: number
  apyFormatted: string
  tvlUsd: number
  tvlFormatted: string
  availableLiquidity: number
  supplyRate: number
  rewardsRate: number
}

interface Position {
  vaultAddress: string
  vaultSymbol: string
  assetSymbol: string
  shares: string
  sharesFormatted: number
  underlyingAssets: string
  underlyingAssetsFormatted: number
  underlyingValueUsd: number
  logoUrl: string
  walletAddress: string
}

interface Earnings {
  positionAddress: string
  vaultSymbol: string
  assetSymbol: string
  earnedAmount: string
  earnedAmountFormatted: number
  earnedValueUsd: number
  walletAddress: string
}

// PROPEL token mint from environment
const PROPEL_MINT = process.env.NEXT_PUBLIC_PROPEL_TOKEN_MINT || ''

export function EarnDashboard() {
  const { sessionId, activeWallet, wallets, isAuthenticated } = useAuth()
  
  const [vaults, setVaults] = useState<Vault[]>([])
  const [positions, setPositions] = useState<Position[]>([])
  const [earnings, setEarnings] = useState<Earnings[]>([])
  const [propelBalance, setPropelBalance] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Modal states
  const [selectedVault, setSelectedVault] = useState<Vault | null>(null)
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null)
  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false)
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false)

  // Fetch vaults
  const fetchVaults = useCallback(async () => {
    try {
      const response = await fetch('/api/earn/vaults')
      const data = await response.json()
      
      if (data.success) {
        setVaults(data.data)
      } else {
        console.error('Failed to fetch vaults:', data.error)
      }
    } catch (err) {
      console.error('Vaults fetch error:', err)
    }
  }, [])

  // Fetch positions
  const fetchPositions = useCallback(async () => {
    if (!sessionId) return
    
    try {
      const response = await fetch('/api/earn/positions', {
        headers: {
          'x-session-id': sessionId,
        },
      })
      const data = await response.json()
      
      if (data.success) {
        setPositions(data.data.positions)
      }
    } catch (err) {
      console.error('Positions fetch error:', err)
    }
  }, [sessionId])

  // Fetch earnings
  const fetchEarnings = useCallback(async () => {
    if (!sessionId) return
    
    try {
      const response = await fetch('/api/earn/earnings', {
        headers: {
          'x-session-id': sessionId,
        },
      })
      const data = await response.json()
      
      if (data.success) {
        setEarnings(data.data.earnings)
      }
    } catch (err) {
      console.error('Earnings fetch error:', err)
    }
  }, [sessionId])

  // Fetch PROPEL balance
  const fetchPropelBalance = useCallback(async () => {
    if (!activeWallet || !PROPEL_MINT) return
    
    try {
      // Use existing balance API or token balance endpoint
      const response = await fetch(`/api/token/balance?wallet=${activeWallet.publicKey}&mint=${PROPEL_MINT}`)
      const data = await response.json()
      
      if (data.success) {
        setPropelBalance(data.balance || 0)
      }
    } catch (err) {
      console.error('PROPEL balance fetch error:', err)
      // Set a mock balance for now if API doesn't exist
      setPropelBalance(0)
    }
  }, [activeWallet])

  // Initial data load
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true)
      setError(null)
      
      try {
        await Promise.all([
          fetchVaults(),
          fetchPositions(),
          fetchEarnings(),
          fetchPropelBalance(),
        ])
      } catch (err) {
        setError('Failed to load earn data')
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [fetchVaults, fetchPositions, fetchEarnings, fetchPropelBalance])

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      fetchPositions()
      fetchEarnings()
    }, 30000) // Every 30 seconds

    return () => clearInterval(interval)
  }, [fetchPositions, fetchEarnings])

  // Calculate summary stats
  const totalDeposited = positions.reduce((sum, p) => sum + p.underlyingValueUsd, 0)
  const totalEarnings = earnings.reduce((sum, e) => sum + e.earnedValueUsd, 0)
  const averageApy = positions.length > 0
    ? positions.reduce((sum, p) => {
        const vault = vaults.find(v => v.address === p.vaultAddress)
        return sum + (vault?.apy || 0)
      }, 0) / positions.length
    : 0

  const handleDepositClick = (vault: Vault) => {
    setSelectedVault(vault)
    setIsDepositModalOpen(true)
  }

  const handleWithdrawClick = (position: Position) => {
    setSelectedPosition(position)
    setIsWithdrawModalOpen(true)
  }

  const handleSuccess = () => {
    // Refresh data after successful transaction
    fetchPositions()
    fetchEarnings()
    fetchPropelBalance()
  }

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-16 h-16">
            <div className="absolute inset-0 rounded-full border-4 border-[var(--aqua-primary)]/20" />
            <div className="absolute inset-0 rounded-full border-4 border-[var(--aqua-primary)] border-t-transparent animate-spin" />
          </div>
          <p className="text-[var(--text-muted)]">Loading earn data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-[var(--text-primary)]">
            PROPEL <span className="text-[var(--aqua-primary)]">Earn</span>
          </h1>
          <p className="text-[var(--text-muted)] mt-1">
            Swap PROPEL tokens into yield-bearing positions powered by Jupiter
          </p>
        </div>
        
        {/* PROPEL Balance Badge */}
        {activeWallet && PROPEL_MINT && (
          <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r from-[var(--aqua-primary)]/10 to-[var(--warm-pink)]/10 border border-[var(--aqua-border)]">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center shadow-lg">
              <span className="text-xs font-bold text-white">P</span>
            </div>
            <div>
              <p className="text-xs text-[var(--text-muted)]">Your PROPEL</p>
              <p className="text-lg font-semibold text-[var(--text-primary)] tabular-nums">
                {propelBalance.toLocaleString()}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Earnings Summary - Only show if user has positions */}
      {positions.length > 0 && (
        <EarningsSummary
          totalDeposited={totalDeposited}
          totalEarnings={totalEarnings}
          averageApy={averageApy}
          positionCount={positions.length}
        />
      )}

      {/* Your Positions */}
      {positions.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-[var(--text-primary)]">Your Positions</h2>
            <span className="text-sm text-[var(--text-muted)]">{positions.length} active</span>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {positions.map((position, index) => {
              const vault = vaults.find(v => v.address === position.vaultAddress)
              const positionEarnings = earnings.find(
                e => e.vaultSymbol === position.vaultSymbol && e.walletAddress === position.walletAddress
              )
              
              return (
                <PositionCard
                  key={`${position.vaultAddress}-${position.walletAddress}-${index}`}
                  position={position}
                  earnings={positionEarnings}
                  apy={vault?.apy}
                  onWithdraw={() => handleWithdrawClick(position)}
                />
              )
            })}
          </div>
        </div>
      )}

      {/* Available Vaults */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-[var(--text-primary)]">Available Vaults</h2>
          <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
            <div className="w-2 h-2 rounded-full bg-[var(--green)] animate-pulse" />
            <span>Live rates from Jupiter</span>
          </div>
        </div>

        {vaults.length === 0 ? (
          <div className="p-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] text-center">
            <p className="text-[var(--text-muted)]">No vaults available at this time</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vaults.map((vault) => (
              <VaultCard
                key={vault.id}
                vault={vault}
                onDeposit={isAuthenticated ? () => handleDepositClick(vault) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Info Section */}
      <div className="p-6 rounded-2xl bg-gradient-to-br from-[var(--bg-card)] to-[var(--bg-elevated)] border border-[var(--border-subtle)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-4">How PROPEL Earn Works</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 flex items-center justify-center">
              <span className="text-lg font-bold text-[var(--aqua-primary)]">1</span>
            </div>
            <div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Swap PROPEL</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Your PROPEL tokens are automatically swapped to the vault's underlying asset (USDC or SOL)
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 flex items-center justify-center">
              <span className="text-lg font-bold text-[var(--aqua-primary)]">2</span>
            </div>
            <div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Deposit & Earn</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Assets are deposited into Jupiter Earn vaults, earning yield from lending and rewards
              </p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)]/20 to-[var(--aqua-secondary)]/10 flex items-center justify-center">
              <span className="text-lg font-bold text-[var(--aqua-primary)]">3</span>
            </div>
            <div>
              <h4 className="font-medium text-[var(--text-primary)] mb-1">Withdraw Anytime</h4>
              <p className="text-sm text-[var(--text-muted)]">
                Withdraw your position plus earnings whenever you want, subject to available liquidity
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Connect Wallet CTA */}
      {!isAuthenticated && (
        <div className="p-8 rounded-2xl bg-gradient-to-br from-[var(--aqua-primary)]/10 via-[var(--bg-card)] to-[var(--warm-pink)]/10 border border-[var(--aqua-border)] text-center">
          <h3 className="text-xl font-semibold text-[var(--text-primary)] mb-2">
            Connect Your Wallet to Start Earning
          </h3>
          <p className="text-[var(--text-muted)] mb-4">
            Swap your PROPEL tokens into yield-bearing positions with one click
          </p>
          <button className={cn(
            "px-6 py-3 rounded-xl font-semibold text-sm transition-all",
            "bg-gradient-to-r from-[var(--aqua-primary)] to-[var(--aqua-secondary)]",
            "text-white shadow-lg shadow-[var(--aqua-primary)]/25",
            "hover:shadow-xl hover:shadow-[var(--aqua-primary)]/30 hover:scale-[1.02]"
          )}>
            Connect Wallet
          </button>
        </div>
      )}

      {/* Modals */}
      {selectedVault && (
        <DepositModal
          isOpen={isDepositModalOpen}
          onClose={() => {
            setIsDepositModalOpen(false)
            setSelectedVault(null)
          }}
          vault={selectedVault}
          propelBalance={propelBalance}
          propelMint={PROPEL_MINT}
          onSuccess={handleSuccess}
        />
      )}

      {selectedPosition && (
        <WithdrawModal
          isOpen={isWithdrawModalOpen}
          onClose={() => {
            setIsWithdrawModalOpen(false)
            setSelectedPosition(null)
          }}
          position={selectedPosition}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

