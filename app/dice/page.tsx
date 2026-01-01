"use client"

import dynamic from 'next/dynamic'
import { Suspense } from 'react'
import { Gamepad2 } from 'lucide-react'
import { SolanaWalletProvider } from '@/components/dice/SolanaWalletContext'

// Dynamic imports to avoid SSR issues
const DiceGame = dynamic(() => import('@/components/dice/DiceGame'), { 
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-8 animate-pulse">
      <div className="h-64 flex items-center justify-center">
        <div className="text-muted-foreground">Loading game...</div>
      </div>
    </div>
  )
})

const LiveChat = dynamic(() => import('@/components/dice/LiveChat'), { 
  ssr: false,
  loading: () => (
    <div className="bg-card rounded-xl border border-border p-8 animate-pulse">
      <div className="h-48"></div>
    </div>
  )
})

export default function DicePage() {
  return (
    <SolanaWalletProvider>
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-3 mb-4">
              <Gamepad2 className="h-10 w-10 text-primary" />
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Dice Game
              </h1>
            </div>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Provably fair on-chain dice game. Place your bets, roll the dice, and win big!
              All bets are settled directly on the Solana blockchain.
            </p>
          </div>

          {/* Main Content */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Game Area - Takes 2 columns on large screens */}
            <div className="lg:col-span-2 space-y-8">
              <Suspense fallback={<div className="h-64 animate-pulse bg-card rounded-xl" />}>
                <DiceGame />
              </Suspense>
            </div>

            {/* Sidebar - Chat */}
            <div className="space-y-8">
              <Suspense fallback={<div className="h-48 animate-pulse bg-card rounded-xl" />}>
                <LiveChat />
              </Suspense>
            </div>
          </div>

          {/* Provably Fair Info */}
          <div className="mt-12 bg-card rounded-xl border border-border p-6">
            <h3 className="text-lg font-semibold text-foreground mb-4">
              🎲 Provably Fair Gaming
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm text-muted-foreground">
              <div>
                <h4 className="font-medium text-foreground mb-2">How It Works</h4>
                <p>
                  Each roll is determined by combining your client seed with our server seed.
                  The server seed is hashed before the game starts, ensuring we can't manipulate results.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">Verification</h4>
                <p>
                  After each roll, you receive the server seed. You can verify that the outcome
                  was calculated correctly using our verification tool.
                </p>
              </div>
              <div>
                <h4 className="font-medium text-foreground mb-2">On-Chain Settlement</h4>
                <p>
                  All bets are settled directly on the Solana blockchain. Winnings are automatically
                  transferred to your wallet. View every transaction on the explorer.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SolanaWalletProvider>
  )
}
