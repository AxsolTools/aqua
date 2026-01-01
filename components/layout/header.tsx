"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { WalletSidebar } from "@/components/wallet/wallet-sidebar"
import { ChevronDown, Sparkles, Coins, Dice6, Users } from "lucide-react"

const navItems = [
  { href: "/", label: "Discover" },
  { href: "/kol-monitor", label: "KOL Monitor", icon: Users },
  { href: "/launch", label: "Launch" },
  { href: "/launch22", label: "TOKEN22" },
  { href: "/dice", label: "Dice", icon: Dice6 },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/profile", label: "Profile" },
]

export function Header() {
  const pathname = usePathname()
  const { isAuthenticated, activeWallet, isLoading, setIsOnboarding } = useAuth()
  const [showWalletSidebar, setShowWalletSidebar] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const formatAddress = (address: string) => `${address.slice(0, 4)}...${address.slice(-4)}`

  return (
    <>
      <header className="sticky top-0 z-50 bg-[var(--bg-primary)]/95 backdrop-blur-sm border-b border-[var(--border-subtle)]">
        <div className="max-w-[1920px] mx-auto px-3 sm:px-4 lg:px-6">
          <div className="flex items-center justify-between h-14">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2">
              <Image src="/logo.png" alt="Aquarius" width={32} height={32} className="w-8 h-8" priority />
              <span className="text-base font-semibold text-[var(--text-primary)]">aquarius</span>
            </Link>

            {/* Center Nav */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                    pathname === item.href
                      ? "text-[var(--text-primary)] bg-[var(--bg-secondary)]"
                      : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                  } ${item.href === "/dice" ? "text-[var(--aqua-primary)]" : ""}`}
                >
                  {item.icon && <item.icon className="w-4 h-4" />}
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              {/* Launch Dropdown */}
              <div className="hidden sm:block relative group">
                <button className="flex items-center gap-1.5 btn-primary text-sm py-2 px-4">
                  Create Token
                  <ChevronDown className="w-3 h-3" />
                </button>
                <div className="absolute top-full right-0 mt-1 w-56 py-1 rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  <Link
                    href="/launch"
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors"
                  >
                    <div className="p-1.5 rounded-md bg-teal-500/10">
                      <Sparkles className="w-4 h-4 text-teal-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">Pump.fun</p>
                      <p className="text-xs text-zinc-500">Bonding curve launch</p>
                    </div>
                  </Link>
                  <Link
                    href="/launch22"
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-zinc-800 transition-colors"
                  >
                    <div className="p-1.5 rounded-md bg-emerald-500/10">
                      <Coins className="w-4 h-4 text-emerald-400" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">TOKEN22</p>
                      <p className="text-xs text-zinc-500">Raydium + Extensions</p>
                    </div>
                  </Link>
                </div>
              </div>

              {/* Wallet */}
              {isLoading ? (
                <div className="w-24 h-8 skeleton rounded-md" />
              ) : isAuthenticated && activeWallet ? (
                <button
                  onClick={() => setShowWalletSidebar(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-[var(--bg-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" />
                  <span className="text-sm font-mono text-[var(--text-primary)]">
                    {formatAddress(activeWallet.public_key)}
                  </span>
                </button>
              ) : (
                <button onClick={() => setIsOnboarding(true)} className="btn-secondary text-sm py-2 px-4">
                  Connect
                </button>
              )}

              {/* Mobile Menu */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="md:hidden p-2 rounded-md hover:bg-[var(--bg-secondary)] transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" className="text-[var(--text-secondary)]">
                  {mobileMenuOpen ? (
                    <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  ) : (
                    <path d="M2 5h14M2 9h14M2 13h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden border-t border-[var(--border-subtle)]"
            >
              <nav className="p-3 space-y-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                      pathname === item.href
                        ? "text-[var(--text-primary)] bg-[var(--bg-secondary)]"
                        : "text-[var(--text-muted)] hover:text-[var(--text-secondary)]"
                    } ${item.href === "/dice" ? "text-[var(--aqua-primary)]" : ""}`}
                  >
                    {item.icon && <item.icon className="w-4 h-4" />}
                    {item.label}
                  </Link>
                ))}
                <div className="pt-2 space-y-2">
                  <Link href="/launch" onClick={() => setMobileMenuOpen(false)} className="btn-primary w-full text-sm flex items-center justify-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    Pump.fun Launch
                  </Link>
                  <Link href="/launch22" onClick={() => setMobileMenuOpen(false)} className="btn-secondary w-full text-sm flex items-center justify-center gap-2 bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20">
                    <Coins className="w-4 h-4" />
                    TOKEN22 Launch
                  </Link>
                </div>
              </nav>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <WalletSidebar open={showWalletSidebar} onClose={() => setShowWalletSidebar(false)} />
    </>
  )
}
