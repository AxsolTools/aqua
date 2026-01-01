/**
 * KOL Data Types and Avatar Utilities
 * 
 * This file provides interfaces and utilities for KOL display.
 * Real KOL data is fetched from the API which uses lib/api/kol-database.ts
 */

import { UNIQUE_KOL_DATABASE, type KOLProfile, getTopKOLs, getVerifiedInfluencers } from './api/kol-database'

// Re-export database functions
export { getTopKOLs, getVerifiedInfluencers, UNIQUE_KOL_DATABASE }
export type { KOLProfile }

// Extended KOL interface for frontend display (combines profile + live stats)
export interface KOL {
  id: string
  name: string
  twitter: string
  wallet: string
  avatar: string
  pnl: number
  pnl7d: number
  pnl30d: number
  winRate: number
  totalTrades: number
  avgHoldTime: string
  tradingStyle: string
  tier: "legendary" | "diamond" | "gold" | "silver" | "bronze"
  isWashTrader: boolean
  washScore: number
  favoriteTokens: string[]
  followers: number
  copyTraders: number
  lastActive: string
  verified: boolean
  earlyEntryScore: number
  dumpOnFollowers: number
  avgEntryTiming: number
  coordinationScore: number
  alphaAccuracy: number
  roi7d: number
  roi30d: number
  sharpeRatio: number
  maxDrawdown: number
  profitFactor: number
  avgTradeSize: number
  bestTrade: number
  worstTrade: number
  consecutiveWins: number
  activeHours: string
  riskLevel: "low" | "medium" | "high" | "extreme"
  category?: string
  isLive?: boolean
  lastFetched?: number
}

// Token interface
export interface Token {
  symbol: string
  name: string
  logo: string
  address: string
  price: number
  change24h: number
  age?: string
  marketCap?: number
}

/**
 * Multi-strategy avatar fetching for X/Twitter profiles
 * Tries multiple methods to ensure we always get an avatar
 */
const AVATAR_STRATEGIES = [
  // Strategy 1: Unavatar.io (most reliable, handles X API changes)
  (handle: string) => `https://unavatar.io/twitter/${handle}`,
  // Strategy 2: Direct pbs.twimg.com (works for some profiles)
  (handle: string) => `https://unavatar.io/x/${handle}`,
  // Strategy 3: UI Avatars fallback (always works)
  (handle: string) => `https://ui-avatars.com/api/?name=${encodeURIComponent(handle)}&background=0a0a0a&color=00d9ff&bold=true&size=128`,
]

// Known direct avatar URLs for major KOLs (cache busted)
const KNOWN_AVATARS: Record<string, string> = {
  'blknoiz06': 'https://pbs.twimg.com/profile_images/1768802747840204800/KgpBpIrP_400x400.jpg',
  'MustStopMurad': 'https://pbs.twimg.com/profile_images/1844398975566684161/JkqvGxGd_400x400.jpg',
  'GiganticRebirth': 'https://pbs.twimg.com/profile_images/1529152551261650944/tW8FE9wW_400x400.jpg',
  'HsakaTrades': 'https://pbs.twimg.com/profile_images/1760328497768923136/oqIyRuP5_400x400.jpg',
  'Pentosh1': 'https://pbs.twimg.com/profile_images/1674477997039812608/7T0ej1lS_400x400.jpg',
  'coaborblabs': 'https://pbs.twimg.com/profile_images/1632007691989569537/Mw8dI8DG_400x400.jpg',
  'CL207': 'https://pbs.twimg.com/profile_images/1655595282219569152/RH_NfnXO_400x400.jpg',
  'loomdart': 'https://pbs.twimg.com/profile_images/1797350847710339073/3_hFBTmY_400x400.jpg',
  '0xSunNFT': 'https://pbs.twimg.com/profile_images/1676960789111742464/Jx6UJlS4_400x400.jpg',
  'DegenSpartan': 'https://pbs.twimg.com/profile_images/1676908029091622913/hVb3D8tJ_400x400.jpg',
  'A1lon9': 'https://pbs.twimg.com/profile_images/1686064012649050112/XuJtDd67_400x400.jpg',
  'aeyakovenko': 'https://pbs.twimg.com/profile_images/1692698556/Solana-Toly_400x400.jpg',
  '0xMert_': 'https://pbs.twimg.com/profile_images/1688629614965878784/A3e-x9Sv_400x400.jpg',
  'rajgokal': 'https://pbs.twimg.com/profile_images/1699149054430359552/oVYDxYhd_400x400.jpg',
}

/**
 * Get avatar URL for a KOL with multiple fallback strategies
 */
export function getKolAvatar(twitterHandle: string): string {
  if (!twitterHandle) {
    return AVATAR_STRATEGIES[2]('Unknown')
  }
  
  // Check known avatars first
  if (KNOWN_AVATARS[twitterHandle]) {
    return KNOWN_AVATARS[twitterHandle]
  }
  
  // Use unavatar.io as primary (handles all the complexity)
  return AVATAR_STRATEGIES[0](twitterHandle)
}

/**
 * Get fallback avatar URL if primary fails
 */
export function getKolAvatarFallback(twitterHandle: string, attemptIndex: number): string {
  const strategyIndex = Math.min(attemptIndex, AVATAR_STRATEGIES.length - 1)
  return AVATAR_STRATEGIES[strategyIndex](twitterHandle || 'Unknown')
}

/**
 * Convert KOLProfile from database to full KOL interface for display
 * Stats will be populated from API calls
 */
export function profileToKOL(profile: KOLProfile, liveStats?: Partial<KOL>): KOL {
  const baseKOL: KOL = {
    id: profile.address,
    name: profile.name,
    twitter: profile.twitter || '',
    wallet: profile.address,
    avatar: getKolAvatar(profile.twitter || ''),
    pnl: 0,
    pnl7d: 0,
    pnl30d: 0,
    winRate: 0,
    totalTrades: 0,
    avgHoldTime: '-',
    tradingStyle: profile.tradingStyle || profile.category || 'Unknown',
    tier: profile.tier === 'legendary' ? 'legendary' : 
          profile.tier === 'emerging' ? 'bronze' : profile.tier,
    isWashTrader: false,
    washScore: 0,
    favoriteTokens: [],
    followers: profile.followers || 0,
    copyTraders: 0,
    lastActive: '-',
    verified: profile.verified,
    earlyEntryScore: 0,
    dumpOnFollowers: 0,
    avgEntryTiming: 0,
    coordinationScore: 0,
    alphaAccuracy: 0,
    roi7d: 0,
    roi30d: 0,
    sharpeRatio: 0,
    maxDrawdown: 0,
    profitFactor: 0,
    avgTradeSize: 0,
    bestTrade: 0,
    worstTrade: 0,
    consecutiveWins: 0,
    activeHours: '-',
    riskLevel: 'medium',
    category: profile.category,
    isLive: false,
  }
  
  // Merge with live stats if available
  if (liveStats) {
    return { ...baseKOL, ...liveStats }
  }
  
  return baseKOL
}

/**
 * Get ALL KOLs from database for display (will be enriched with live data)
 * This returns the COMPLETE database - no limits
 */
export function getInitialKOLDatabase(): KOL[] {
  // Use the FULL database, not a limited subset
  return UNIQUE_KOL_DATABASE.map(profile => profileToKOL(profile))
}

/**
 * Get total KOL count
 */
export function getKOLCount(): number {
  return UNIQUE_KOL_DATABASE.length
}

// Format helpers
export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(2)
}

export function formatUSD(num: number): string {
  if (Math.abs(num) >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (Math.abs(num) >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address || ''
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

export function formatTimeAgo(timestamp: number | string | Date): string {
  const date = typeof timestamp === 'number' ? timestamp : 
               typeof timestamp === 'string' ? new Date(timestamp).getTime() : 
               timestamp.getTime()
  
  const diff = Date.now() - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  return `${Math.floor(days / 7)}w ago`
}
