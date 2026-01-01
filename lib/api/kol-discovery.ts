/**
 * KOL Discovery Service
 * 
 * Discovers and validates KOL wallets using:
 * 1. Helius Enhanced APIs for transaction analysis
 * 2. On-chain profit/loss calculation
 * 3. Token trading pattern detection
 * 4. Wallet behavior classification
 */

import { KOL_MASTER_DATABASE, type KOLProfile } from './kol-database'

// Types
export interface WalletAnalysis {
  address: string
  totalTransactions: number
  tokensBought: number
  tokensSold: number
  estimatedPnlSol: number
  estimatedPnlUsd: number
  winRate: number
  avgHoldTime: number // in hours
  tradingFrequency: number // trades per day
  topTokens: { mint: string; count: number }[]
  firstSeen: number
  lastSeen: number
  isActive: boolean
  classification: 'whale' | 'smart_money' | 'degen' | 'bot' | 'normal'
  riskScore: number // 1-100
}

export interface DiscoveredKOL {
  profile: KOLProfile
  analysis: WalletAnalysis
  confidence: number // 0-100
}

export interface TokenMention {
  tokenAddress: string
  tokenSymbol?: string
  mentionedBy: { address: string; name: string; twitter?: string }[]
  firstMention: number
  buyCount: number
}

// Cache for analysis results
const analysisCache = new Map<string, { data: WalletAnalysis; timestamp: number }>()
const ANALYSIS_CACHE_TTL = 300000 // 5 minutes

/**
 * Analyze a wallet's trading history using Helius
 */
export async function analyzeWallet(
  address: string,
  heliusApiKey: string
): Promise<WalletAnalysis | null> {
  // Check cache
  const cached = analysisCache.get(address)
  if (cached && Date.now() - cached.timestamp < ANALYSIS_CACHE_TTL) {
    return cached.data
  }

  try {
    // Fetch transaction history
    const response = await fetch(
      `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${heliusApiKey}&limit=100`,
      { signal: AbortSignal.timeout(10000) }
    )

    if (!response.ok) {
      throw new Error(`Helius API error: ${response.status}`)
    }

    const transactions = await response.json()

    // Analyze transactions
    let buyCount = 0
    let sellCount = 0
    let totalSolSpent = 0
    let totalSolReceived = 0
    const tokenCounts: Record<string, number> = {}
    let firstSeen = Date.now()
    let lastSeen = 0

    for (const tx of transactions || []) {
      const timestamp = tx.timestamp * 1000 || Date.now()
      if (timestamp < firstSeen) firstSeen = timestamp
      if (timestamp > lastSeen) lastSeen = timestamp

      if (tx.type === 'SWAP') {
        // Detect buy vs sell
        const nativeTransfers = tx.nativeTransfers || []
        const tokenTransfers = tx.tokenTransfers || []

        for (const nt of nativeTransfers) {
          if (nt.fromUserAccount === address) {
            buyCount++
            totalSolSpent += (nt.amount || 0) / 1e9
          }
          if (nt.toUserAccount === address) {
            sellCount++
            totalSolReceived += (nt.amount || 0) / 1e9
          }
        }

        for (const tt of tokenTransfers) {
          if (tt.mint) {
            tokenCounts[tt.mint] = (tokenCounts[tt.mint] || 0) + 1
          }
        }
      }
    }

    // Calculate metrics
    const totalTrades = buyCount + sellCount
    const estimatedPnlSol = totalSolReceived - totalSolSpent
    const winRate = sellCount > 0 ? (sellCount / Math.max(totalTrades, 1)) * 100 : 0
    const tradingDays = (lastSeen - firstSeen) / 86400000 || 1
    const tradingFrequency = totalTrades / tradingDays

    // Get top tokens
    const topTokens = Object.entries(tokenCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([mint, count]) => ({ mint, count }))

    // Classify wallet
    let classification: WalletAnalysis['classification'] = 'normal'
    if (tradingFrequency > 50) classification = 'bot'
    else if (Math.abs(estimatedPnlSol) > 100 && winRate > 60) classification = 'smart_money'
    else if (Math.abs(estimatedPnlSol) > 500) classification = 'whale'
    else if (tradingFrequency > 10 && winRate < 40) classification = 'degen'

    // Calculate risk score
    const riskScore = Math.min(
      100,
      Math.max(
        1,
        50 - winRate / 2 + tradingFrequency * 2 + (classification === 'bot' ? 30 : 0)
      )
    )

    const analysis: WalletAnalysis = {
      address,
      totalTransactions: transactions?.length || 0,
      tokensBought: buyCount,
      tokensSold: sellCount,
      estimatedPnlSol,
      estimatedPnlUsd: estimatedPnlSol * 170, // Approximate SOL price
      winRate,
      avgHoldTime: 24, // Would need more analysis
      tradingFrequency,
      topTokens,
      firstSeen,
      lastSeen,
      isActive: Date.now() - lastSeen < 86400000, // Active in last 24h
      classification,
      riskScore,
    }

    analysisCache.set(address, { data: analysis, timestamp: Date.now() })
    return analysis
  } catch (error) {
    console.error(`[KOL Discovery] Error analyzing ${address}:`, error)
    return null
  }
}

/**
 * Discover profitable wallets from on-chain data
 */
export async function discoverProfitableWallets(
  tokenAddress: string,
  heliusApiKey: string,
  limit = 50
): Promise<DiscoveredKOL[]> {
  try {
    // Get token holders
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${heliusApiKey}`
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTokenLargestAccounts',
        params: [tokenAddress],
      }),
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      throw new Error('Helius RPC error')
    }

    const data = await response.json()
    const accounts = data.result?.value || []
    
    // Analyze top holders
    const discoveries: DiscoveredKOL[] = []
    
    for (const account of accounts.slice(0, Math.min(limit, 20))) {
      // Get account owner
      const ownerResponse = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAccountInfo',
          params: [account.address, { encoding: 'jsonParsed' }],
        }),
      })

      const ownerData = await ownerResponse.json()
      const owner = ownerData.result?.value?.data?.parsed?.info?.owner
      
      if (!owner) continue

      // Check if already in database
      const existing = KOL_MASTER_DATABASE.find(k => k.address === owner)
      if (existing) {
        const analysis = await analyzeWallet(owner, heliusApiKey)
        if (analysis) {
          discoveries.push({
            profile: existing,
            analysis,
            confidence: 90,
          })
        }
        continue
      }

      // Analyze new wallet
      const analysis = await analyzeWallet(owner, heliusApiKey)
      if (!analysis) continue

      // Only include if profitable or significant
      if (analysis.estimatedPnlSol > 10 || analysis.classification === 'smart_money') {
        discoveries.push({
          profile: {
            address: owner,
            name: `Discovered Wallet`,
            tier: analysis.estimatedPnlSol > 100 ? 'gold' : 'silver',
            category: analysis.classification === 'bot' ? 'bot' : 'smart_money',
            verified: false,
            source: 'onchain',
            tradingStyle: analysis.classification,
            addedAt: Date.now(),
          },
          analysis,
          confidence: 60,
        })
      }
    }

    // Sort by PnL
    discoveries.sort((a, b) => b.analysis.estimatedPnlSol - a.analysis.estimatedPnlSol)
    return discoveries.slice(0, limit)
  } catch (error) {
    console.error('[KOL Discovery] Error discovering wallets:', error)
    return []
  }
}

/**
 * Get all KOL wallets with live analysis
 */
export async function getKOLsWithAnalysis(
  heliusApiKey: string,
  options: {
    limit?: number
    category?: KOLProfile['category']
    tier?: KOLProfile['tier']
  } = {}
): Promise<DiscoveredKOL[]> {
  const { limit = 100, category, tier } = options
  
  let kols = [...KOL_MASTER_DATABASE]
  
  if (category) {
    kols = kols.filter(k => k.category === category)
  }
  if (tier) {
    kols = kols.filter(k => k.tier === tier)
  }
  
  // Prioritize by tier
  const tierOrder = { legendary: 0, diamond: 1, gold: 2, silver: 3, bronze: 4, emerging: 5 }
  kols.sort((a, b) => tierOrder[a.tier] - tierOrder[b.tier])
  kols = kols.slice(0, limit)
  
  // Analyze in batches
  const results: DiscoveredKOL[] = []
  const batchSize = 5
  
  for (let i = 0; i < kols.length; i += batchSize) {
    const batch = kols.slice(i, i + batchSize)
    const analyses = await Promise.all(
      batch.map(async (kol) => {
        try {
          const analysis = await analyzeWallet(kol.address, heliusApiKey)
          return { kol, analysis }
        } catch {
          return { kol, analysis: null }
        }
      })
    )
    
    for (const { kol, analysis } of analyses) {
      if (analysis) {
        results.push({
          profile: kol,
          analysis,
          confidence: kol.verified ? 95 : 70,
        })
      } else {
        // Return without analysis
        results.push({
          profile: kol,
          analysis: {
            address: kol.address,
            totalTransactions: 0,
            tokensBought: 0,
            tokensSold: 0,
            estimatedPnlSol: 0,
            estimatedPnlUsd: 0,
            winRate: 0,
            avgHoldTime: 0,
            tradingFrequency: 0,
            topTokens: [],
            firstSeen: Date.now(),
            lastSeen: Date.now(),
            isActive: false,
            classification: 'normal',
            riskScore: 50,
          },
          confidence: kol.verified ? 80 : 50,
        })
      }
    }
    
    // Rate limit between batches
    if (i + batchSize < kols.length) {
      await new Promise(resolve => setTimeout(resolve, 100))
    }
  }
  
  return results
}

/**
 * Detect token convergence - multiple KOLs buying the same token
 */
export async function detectTokenConvergence(
  heliusApiKey: string,
  lookbackHours = 24,
  minKolCount = 2
): Promise<TokenMention[]> {
  const tokenMentions = new Map<string, TokenMention>()
  const lookbackMs = lookbackHours * 3600000
  
  // Get top KOLs
  const topKols = KOL_MASTER_DATABASE
    .filter(k => k.tier === 'legendary' || k.tier === 'diamond' || k.tier === 'gold')
    .slice(0, 30)
  
  // Analyze each KOL's recent trades
  for (const kol of topKols) {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${kol.address}/transactions?api-key=${heliusApiKey}&limit=20`,
        { signal: AbortSignal.timeout(8000) }
      )
      
      if (!response.ok) continue
      
      const transactions = await response.json()
      
      for (const tx of transactions || []) {
        const timestamp = (tx.timestamp || 0) * 1000
        if (Date.now() - timestamp > lookbackMs) continue
        
        if (tx.type === 'SWAP') {
          const tokenTransfers = tx.tokenTransfers || []
          
          for (const tt of tokenTransfers) {
            if (!tt.mint || tt.toUserAccount !== kol.address) continue
            
            const existing = tokenMentions.get(tt.mint) || {
              tokenAddress: tt.mint,
              tokenSymbol: undefined,
              mentionedBy: [],
              firstMention: timestamp,
              buyCount: 0,
            }
            
            // Check if this KOL already counted
            if (!existing.mentionedBy.find(m => m.address === kol.address)) {
              existing.mentionedBy.push({
                address: kol.address,
                name: kol.name,
                twitter: kol.twitter,
              })
            }
            existing.buyCount++
            if (timestamp < existing.firstMention) {
              existing.firstMention = timestamp
            }
            
            tokenMentions.set(tt.mint, existing)
          }
        }
      }
    } catch (error) {
      console.error(`[Convergence] Error for ${kol.name}:`, error)
    }
    
    // Rate limit
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  
  // Filter to tokens with multiple KOL mentions
  const results = Array.from(tokenMentions.values())
    .filter(t => t.mentionedBy.length >= minKolCount)
    .sort((a, b) => b.mentionedBy.length - a.mentionedBy.length)
  
  return results
}

/**
 * Get real-time KOL activity feed
 */
export async function getKOLActivityFeed(
  heliusApiKey: string,
  limit = 50
): Promise<{
  kol: KOLProfile
  action: 'buy' | 'sell' | 'transfer'
  tokenAddress?: string
  tokenSymbol?: string
  amount?: number
  solAmount?: number
  signature: string
  timestamp: number
}[]> {
  const activities: {
    kol: KOLProfile
    action: 'buy' | 'sell' | 'transfer'
    tokenAddress?: string
    tokenSymbol?: string
    amount?: number
    solAmount?: number
    signature: string
    timestamp: number
  }[] = []
  
  // Get top KOLs
  const topKols = KOL_MASTER_DATABASE
    .filter(k => k.tier === 'legendary' || k.tier === 'diamond')
    .slice(0, 15)
  
  for (const kol of topKols) {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${kol.address}/transactions?api-key=${heliusApiKey}&limit=5`,
        { signal: AbortSignal.timeout(5000) }
      )
      
      if (!response.ok) continue
      
      const transactions = await response.json()
      
      for (const tx of transactions || []) {
        let action: 'buy' | 'sell' | 'transfer' = 'transfer'
        let tokenAddress: string | undefined
        let solAmount: number | undefined
        
        if (tx.type === 'SWAP') {
          const nativeTransfers = tx.nativeTransfers || []
          const tokenTransfers = tx.tokenTransfers || []
          
          for (const nt of nativeTransfers) {
            if (nt.fromUserAccount === kol.address) {
              action = 'buy'
              solAmount = (nt.amount || 0) / 1e9
            } else if (nt.toUserAccount === kol.address) {
              action = 'sell'
              solAmount = (nt.amount || 0) / 1e9
            }
          }
          
          for (const tt of tokenTransfers) {
            if (tt.toUserAccount === kol.address || tt.fromUserAccount === kol.address) {
              tokenAddress = tt.mint
            }
          }
        }
        
        activities.push({
          kol,
          action,
          tokenAddress,
          solAmount,
          signature: tx.signature,
          timestamp: (tx.timestamp || 0) * 1000,
        })
      }
    } catch (error) {
      // Skip errors silently
    }
  }
  
  // Sort by timestamp
  activities.sort((a, b) => b.timestamp - a.timestamp)
  return activities.slice(0, limit)
}

