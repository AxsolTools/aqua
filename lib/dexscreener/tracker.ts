/**
 * DexScreener Tracker Service
 * Monitors DexScreener for real-time boosts and profile updates for Solana tokens
 * Based on the Soldexpaid tracker logic
 */

export interface DexBoost {
  tokenAddress: string
  chainId: string
  amount: number
  totalAmount: number
  description?: string
  url: string
  links?: Array<{ label?: string; type?: string; url: string }>
  name?: string
  icon?: string
  timestamp?: number
}

export interface DexProfile {
  tokenAddress: string
  chainId: string
  name?: string
  description?: string
  url: string
  links?: Array<{ type: string; url: string; title?: string }>
  icon?: string
  header?: string
  timestamp?: number
}

export interface DexScreenerUpdate {
  type: 'boost' | 'profile'
  data: DexBoost | DexProfile
  tokenName?: string
  tokenSymbol?: string
  tokenLogo?: string
}

// Cache for processed items to avoid duplicates
const processedBoosts = new Set<string>()
const processedProfiles = new Set<string>()
const tokenNameCache = new Map<string, { name: string; symbol: string; logo: string }>()

// Configuration
const CONFIG = {
  endpoints: {
    boosts: 'https://api.dexscreener.com/token-boosts/latest/v1',
    profiles: 'https://api.dexscreener.com/token-profiles/latest/v1',
    tokenInfo: 'https://api.dexscreener.com/latest/dex/tokens',
  },
  targetChainId: 'solana',
  checkInterval: 5000, // 5 seconds
  profileCheckInterval: 10000, // 10 seconds
  resetInterval: 86400000, // 24 hours
  maxRetries: 3,
  retryDelay: 2000,
}

/**
 * Fetch token info from DexScreener
 */
async function fetchTokenInfo(tokenAddress: string): Promise<{ name: string; symbol: string; logo: string } | null> {
  if (tokenNameCache.has(tokenAddress)) {
    return tokenNameCache.get(tokenAddress)!
  }

  try {
    const response = await fetch(`${CONFIG.endpoints.tokenInfo}/${tokenAddress}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      next: { revalidate: 60 },
    })

    if (!response.ok) return null

    const data = await response.json()
    const pair = data?.pairs?.[0]
    
    if (!pair) return null

    const info = {
      name: pair.baseToken?.name || pair.quoteToken?.name || 'Unknown',
      symbol: pair.baseToken?.symbol || pair.quoteToken?.symbol || '???',
      logo: pair.info?.imageUrl || `https://dd.dexscreener.com/ds-data/tokens/solana/${tokenAddress}.png`,
    }

    tokenNameCache.set(tokenAddress, info)
    return info
  } catch (error) {
    console.error('[DEXSCREENER] Failed to fetch token info:', error)
    return null
  }
}

/**
 * Fetch latest boosts from DexScreener API
 */
export async function fetchLatestBoosts(): Promise<DexScreenerUpdate[]> {
  try {
    const response = await fetch(CONFIG.endpoints.boosts, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const boosts = (Array.isArray(data) ? data : [data])
      .filter((b: any) => b?.tokenAddress && b.chainId?.toLowerCase() === CONFIG.targetChainId)

    const updates: DexScreenerUpdate[] = []

    for (const boost of boosts) {
      const boostId = `${boost.chainId}_${boost.tokenAddress}_${boost.amount}`
      
      if (processedBoosts.has(boostId)) continue
      processedBoosts.add(boostId)

      // Fetch token info
      const tokenInfo = await fetchTokenInfo(boost.tokenAddress)

      updates.push({
        type: 'boost',
        data: {
          tokenAddress: boost.tokenAddress,
          chainId: boost.chainId,
          amount: boost.amount || 1,
          totalAmount: boost.totalAmount || boost.amount || 1,
          description: boost.description,
          url: boost.url || `https://dexscreener.com/solana/${boost.tokenAddress}`,
          links: boost.links,
          name: tokenInfo?.name,
          icon: boost.icon || tokenInfo?.logo,
          timestamp: Date.now(),
        },
        tokenName: tokenInfo?.name,
        tokenSymbol: tokenInfo?.symbol,
        tokenLogo: tokenInfo?.logo,
      })
    }

    return updates
  } catch (error) {
    console.error('[DEXSCREENER] Failed to fetch boosts:', error)
    return []
  }
}

/**
 * Fetch latest profiles from DexScreener API
 */
export async function fetchLatestProfiles(): Promise<DexScreenerUpdate[]> {
  try {
    const response = await fetch(CONFIG.endpoints.profiles, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const data = await response.json()
    const profiles = (Array.isArray(data) ? data : [data])
      .filter((p: any) => p?.tokenAddress && p.chainId?.toLowerCase() === CONFIG.targetChainId)

    const updates: DexScreenerUpdate[] = []

    for (const profile of profiles) {
      const profileId = `${profile.chainId}_${profile.tokenAddress}`
      
      if (processedProfiles.has(profileId)) continue
      processedProfiles.add(profileId)

      // Fetch token info
      const tokenInfo = await fetchTokenInfo(profile.tokenAddress)

      updates.push({
        type: 'profile',
        data: {
          tokenAddress: profile.tokenAddress,
          chainId: profile.chainId,
          name: profile.name || tokenInfo?.name,
          description: profile.description,
          url: profile.url || `https://dexscreener.com/solana/${profile.tokenAddress}`,
          links: profile.links,
          icon: profile.icon || tokenInfo?.logo,
          header: profile.header,
          timestamp: Date.now(),
        },
        tokenName: profile.name || tokenInfo?.name,
        tokenSymbol: tokenInfo?.symbol,
        tokenLogo: profile.icon || tokenInfo?.logo,
      })
    }

    return updates
  } catch (error) {
    console.error('[DEXSCREENER] Failed to fetch profiles:', error)
    return []
  }
}

/**
 * Fetch all updates (boosts + profiles)
 */
export async function fetchAllUpdates(): Promise<DexScreenerUpdate[]> {
  const [boosts, profiles] = await Promise.all([
    fetchLatestBoosts(),
    fetchLatestProfiles(),
  ])

  // Sort by timestamp (newest first)
  const allUpdates = [...boosts, ...profiles]
  allUpdates.sort((a, b) => {
    const timeA = (a.data as any).timestamp || 0
    const timeB = (b.data as any).timestamp || 0
    return timeB - timeA
  })

  return allUpdates
}

/**
 * Clear processed cache (for testing or daily reset)
 */
export function clearCache(): void {
  processedBoosts.clear()
  processedProfiles.clear()
  console.log('[DEXSCREENER] Cache cleared')
}

/**
 * Mark items as processed (for initialization without sending)
 */
export function markAsProcessed(items: DexScreenerUpdate[]): void {
  for (const item of items) {
    if (item.type === 'boost') {
      const boost = item.data as DexBoost
      processedBoosts.add(`${boost.chainId}_${boost.tokenAddress}_${boost.amount}`)
    } else {
      const profile = item.data as DexProfile
      processedProfiles.add(`${profile.chainId}_${profile.tokenAddress}`)
    }
  }
}

/**
 * Get cache stats
 */
export function getCacheStats(): { boosts: number; profiles: number; tokens: number } {
  return {
    boosts: processedBoosts.size,
    profiles: processedProfiles.size,
    tokens: tokenNameCache.size,
  }
}

