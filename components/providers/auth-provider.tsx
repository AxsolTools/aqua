"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState, useCallback } from "react"
import { createClient } from "@/lib/supabase/client"
import type { Wallet } from "@/lib/types/database"

interface WalletAuthContextType {
  isAuthenticated: boolean
  wallets: Wallet[]
  mainWallet: Wallet | null
  activeWallet: Wallet | null
  isLoading: boolean
  isOnboarding: boolean
  userId: string | null
  setIsOnboarding: (value: boolean) => void
  refreshWallets: () => Promise<void>
  setActiveWallet: (wallet: Wallet) => Promise<void>
  setMainWallet: (wallet: Wallet) => Promise<void>
  disconnect: () => void
  setUserId: (id: string) => void
}

const WalletAuthContext = createContext<WalletAuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [wallets, setWallets] = useState<Wallet[]>([])
  const [mainWallet, setMainWalletState] = useState<Wallet | null>(null)
  const [activeWallet, setActiveWalletState] = useState<Wallet | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isOnboarding, setIsOnboarding] = useState(false)
  const [userId, setUserIdState] = useState<string | null>(null)

  const supabase = createClient()

  // Retrieve user ID from localStorage
  useEffect(() => {
    const stored = localStorage.getItem("aqua_user_id")
    if (stored) {
      setUserIdState(stored)
    } else {
      setIsLoading(false)
    }
  }, [])

  const setUserId = (id: string) => {
    localStorage.setItem("aqua_user_id", id)
    setUserIdState(id)
  }

  const refreshWallets = useCallback(async () => {
    if (!userId) {
      setIsLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from("wallets")
        .select("*")
        .eq("user_id", userId)
        .order("is_primary", { ascending: false })

      if (error) throw error

      if (data && data.length > 0) {
        setWallets(data)
        const primary = data.find((w) => w.is_primary) || data[0]
        setMainWalletState(primary)
        if (!activeWallet) {
          setActiveWalletState(primary)
        }
      } else {
        setWallets([])
        setMainWalletState(null)
        setActiveWalletState(null)
      }
    } catch (err) {
      console.error("Failed to fetch wallets:", err)
    } finally {
      setIsLoading(false)
    }
  }, [userId, supabase, activeWallet])

  useEffect(() => {
    if (userId) {
      refreshWallets()
    }
  }, [userId, refreshWallets])

  const setActiveWallet = async (wallet: Wallet) => {
    setActiveWalletState(wallet)
  }

  const setMainWallet = async (wallet: Wallet) => {
    if (!userId) return

    // Update previous main wallet
    if (mainWallet) {
      await supabase.from("wallets").update({ is_primary: false }).eq("id", mainWallet.id)
    }

    // Set new main wallet
    await supabase.from("wallets").update({ is_primary: true }).eq("id", wallet.id)

    setMainWalletState(wallet)
    await refreshWallets()
  }

  const disconnect = () => {
    localStorage.removeItem("aqua_user_id")
    setWallets([])
    setMainWalletState(null)
    setActiveWalletState(null)
    setUserIdState(null)
    window.location.reload()
  }

  const isAuthenticated = wallets.length > 0 && mainWallet !== null

  return (
    <WalletAuthContext.Provider
      value={{
        isAuthenticated,
        wallets,
        mainWallet,
        activeWallet,
        isLoading,
        isOnboarding,
        userId,
        setIsOnboarding,
        refreshWallets,
        setActiveWallet,
        setMainWallet,
        disconnect,
        setUserId,
      }}
    >
      {children}
    </WalletAuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(WalletAuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
