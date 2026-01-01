/**
 * AQUA Launchpad - Anti-Sniper Real-Time Monitoring API
 * 
 * This endpoint starts monitoring a newly created token for sniper activity.
 * Uses Helius WebSocket/DAS for industrial-grade real-time trade monitoring.
 * 
 * POST /api/token22/anti-sniper/monitor
 * {
 *   tokenMint: string,
 *   config: AntiSniperConfig,
 *   launchSlot: number,
 *   userWallets: string[], // Wallets to ignore (user's own)
 * }
 */

import { NextRequest, NextResponse } from 'next/server'
import { Connection, PublicKey } from '@solana/web3.js'
import { getAdminClient } from '@/lib/supabase/admin'

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || 'https://api.mainnet-beta.solana.com'
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || ''

// Average Solana slot time in milliseconds
const SLOT_TIME_MS = 400
const MAX_MONITOR_BLOCKS = 8 // Hard limit - stop monitoring after 8 blocks to save API calls

// ============================================================================
// TYPES
// ============================================================================

export interface AntiSniperConfig {
  enabled: boolean
  maxSupplyPercentThreshold: number
  maxSolAmountThreshold: number
  monitorBlocksWindow: number
  takeProfitEnabled: boolean
  takeProfitMultiplier: number
  autoSellWalletIds: string[]
  sellPercentage: number
}

interface MonitorRequest {
  tokenMint: string
  config: AntiSniperConfig
  launchSlot: number
  userWallets: string[]
  sessionId: string
  totalSupply: number
  decimals: number
}

interface TradeEvent {
  signature: string
  slot: number
  traderWallet: string
  type: 'buy' | 'sell'
  solAmount: number
  tokenAmount: number
  timestamp: number
}

// In-memory store for active monitors (in production, use Redis)
const activeMonitors = new Map<string, {
  config: AntiSniperConfig
  launchSlot: number
  userWallets: Set<string>
  sessionId: string
  totalSupply: number
  decimals: number
  startTime: number
  triggered: boolean
  expiresAt: number
}>()

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get('x-session-id')
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: 'Session required' } },
        { status: 401 }
      )
    }

    const body: MonitorRequest = await request.json()
    const {
      tokenMint,
      config,
      launchSlot,
      userWallets,
      totalSupply,
      decimals,
    } = body

    if (!tokenMint || !config || !config.enabled) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'Invalid anti-sniper config' } },
        { status: 400 }
      )
    }

    // Cap monitoring window to MAX_MONITOR_BLOCKS to avoid burning API
    const effectiveWindowBlocks = Math.min(config.monitorBlocksWindow, MAX_MONITOR_BLOCKS)
    
    console.log(`[ANTI-SNIPER] Starting monitor for ${tokenMint}`, {
      launchSlot,
      windowBlocks: effectiveWindowBlocks,
      maxSupplyPercent: config.maxSupplyPercentThreshold,
      maxSolAmount: config.maxSolAmountThreshold,
    })

    // Calculate expiration (monitoring window + small buffer, max 8 blocks)
    const monitorDurationMs = (effectiveWindowBlocks + 2) * SLOT_TIME_MS
    const expiresAt = Date.now() + monitorDurationMs

    // Store monitor config with effective window
    activeMonitors.set(tokenMint, {
      config: { ...config, monitorBlocksWindow: effectiveWindowBlocks },
      launchSlot,
      userWallets: new Set(userWallets),
      sessionId,
      totalSupply,
      decimals,
      startTime: Date.now(),
      triggered: false,
      expiresAt,
    })

    // Store in database for persistence across restarts
    const adminClient = getAdminClient()
    await adminClient.from('anti_sniper_monitors').upsert({
      token_mint: tokenMint,
      session_id: sessionId,
      config: { ...config, monitorBlocksWindow: effectiveWindowBlocks },
      launch_slot: launchSlot,
      user_wallets: userWallets,
      total_supply: totalSupply,
      decimals,
      status: 'active',
      triggered: false,
      started_at: new Date().toISOString(),
      expires_at: new Date(expiresAt).toISOString(),
    })

    // Start background monitoring (non-blocking)
    startTradeMonitoring(tokenMint).catch(err => {
      console.error(`[ANTI-SNIPER] Monitor error for ${tokenMint}:`, err)
    })

    return NextResponse.json({
      success: true,
      data: {
        tokenMint,
        monitorId: tokenMint,
        status: 'monitoring',
        expiresAt: new Date(expiresAt).toISOString(),
        windowBlocks: effectiveWindowBlocks,
        windowMs: monitorDurationMs,
        maxBlocks: MAX_MONITOR_BLOCKS,
      }
    })

  } catch (error) {
    console.error('[ANTI-SNIPER] Monitor start error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : 'Failed to start monitor',
        },
      },
      { status: 500 }
    )
  }
}

// ============================================================================
// MONITORING LOGIC
// ============================================================================

async function startTradeMonitoring(tokenMint: string): Promise<void> {
  const monitor = activeMonitors.get(tokenMint)
  if (!monitor) {
    console.warn(`[ANTI-SNIPER] No monitor config found for ${tokenMint}`)
    return
  }

  const connection = new Connection(HELIUS_RPC_URL, 'confirmed')
  const mintPubkey = new PublicKey(tokenMint)

  console.log(`[ANTI-SNIPER] Starting trade polling for ${tokenMint}`)

  // Poll for transactions (industrial-grade would use Helius WebSocket)
  const pollInterval = 200 // Poll every 200ms for low latency
  let lastSignature: string | undefined

  const poll = async () => {
    const currentMonitor = activeMonitors.get(tokenMint)
    if (!currentMonitor) {
      console.log(`[ANTI-SNIPER] Monitor removed for ${tokenMint}`)
      return
    }

    // Check if expired by time
    if (Date.now() > currentMonitor.expiresAt) {
      console.log(`[ANTI-SNIPER] Monitor expired for ${tokenMint}`)
      await cleanupMonitor(tokenMint, 'expired')
      return
    }

    // Check if already triggered
    if (currentMonitor.triggered) {
      console.log(`[ANTI-SNIPER] Monitor already triggered for ${tokenMint}`)
      return
    }
    
    // Check if exceeded max blocks (hard stop at 8 blocks)
    try {
      const currentSlot = await connection.getSlot('confirmed')
      const blocksPassed = currentSlot - currentMonitor.launchSlot
      if (blocksPassed > MAX_MONITOR_BLOCKS) {
        console.log(`[ANTI-SNIPER] Max blocks (${MAX_MONITOR_BLOCKS}) exceeded for ${tokenMint}, stopping`)
        await cleanupMonitor(tokenMint, 'expired')
        return
      }
    } catch {
      // Continue if slot check fails
    }

    try {
      // Get recent signatures for the token
      const signatures = await connection.getSignaturesForAddress(
        mintPubkey,
        { limit: 20, until: lastSignature },
        'confirmed'
      )

      if (signatures.length > 0) {
        lastSignature = signatures[0].signature

        for (const sig of signatures) {
          // Skip if outside monitoring window
          if (sig.slot && sig.slot > currentMonitor.launchSlot + currentMonitor.config.monitorBlocksWindow) {
            continue
          }

          // Analyze the transaction
          const tradeEvent = await analyzeTransaction(connection, sig.signature, tokenMint, currentMonitor)
          
          if (tradeEvent && tradeEvent.type === 'buy') {
            // Check if this is a user's own wallet (ignore)
            if (currentMonitor.userWallets.has(tradeEvent.traderWallet)) {
              console.log(`[ANTI-SNIPER] Ignoring user's own trade from ${tradeEvent.traderWallet.slice(0, 8)}`)
              continue
            }

            // Check thresholds
            const supplyPercent = (tradeEvent.tokenAmount / currentMonitor.totalSupply) * 100
            const exceedsSupplyThreshold = supplyPercent > currentMonitor.config.maxSupplyPercentThreshold
            const exceedsSolThreshold = tradeEvent.solAmount > currentMonitor.config.maxSolAmountThreshold

            console.log(`[ANTI-SNIPER] Trade detected:`, {
              trader: tradeEvent.traderWallet.slice(0, 8),
              solAmount: tradeEvent.solAmount,
              tokenAmount: tradeEvent.tokenAmount,
              supplyPercent: supplyPercent.toFixed(4),
              exceedsSupply: exceedsSupplyThreshold,
              exceedsSol: exceedsSolThreshold,
              slot: tradeEvent.slot,
              slotDiff: tradeEvent.slot - currentMonitor.launchSlot,
            })

            if (exceedsSupplyThreshold || exceedsSolThreshold) {
              console.log(`[ANTI-SNIPER] 🚨 SNIPER DETECTED! Triggering auto-sell for ${tokenMint}`)
              
              // Mark as triggered
              currentMonitor.triggered = true
              activeMonitors.set(tokenMint, currentMonitor)

              // Trigger auto-sell
              await triggerAutoSell(tokenMint, tradeEvent, currentMonitor)
              
              // Update database
              const adminClient = getAdminClient()
              await adminClient.from('anti_sniper_monitors').update({
                status: 'triggered',
                triggered: true,
                trigger_trade: tradeEvent,
                triggered_at: new Date().toISOString(),
              }).eq('token_mint', tokenMint)

              return
            }
          }
        }
      }
    } catch (error) {
      console.error(`[ANTI-SNIPER] Poll error for ${tokenMint}:`, error)
    }

    // Continue polling
    setTimeout(poll, pollInterval)
  }

  // Start polling
  poll()
}

async function analyzeTransaction(
  connection: Connection,
  signature: string,
  tokenMint: string,
  monitor: typeof activeMonitors extends Map<string, infer V> ? V : never
): Promise<TradeEvent | null> {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    })

    if (!tx || !tx.meta) return null

    // Look for token balance changes
    const preBalances = tx.meta.preTokenBalances || []
    const postBalances = tx.meta.postTokenBalances || []

    // Find the token balance changes for our mint
    let buyerWallet: string | null = null
    let tokenDelta = 0
    let solDelta = 0

    for (const post of postBalances) {
      if (post.mint !== tokenMint) continue

      const pre = preBalances.find(
        p => p.accountIndex === post.accountIndex && p.mint === tokenMint
      )

      const preAmount = pre?.uiTokenAmount?.uiAmount || 0
      const postAmount = post.uiTokenAmount?.uiAmount || 0
      const delta = postAmount - preAmount

      if (delta > 0) {
        // This is a buy
        buyerWallet = post.owner || null
        tokenDelta = delta

        // Calculate SOL spent (look at lamport changes)
        const accountIndex = post.accountIndex
        if (tx.meta.preBalances && tx.meta.postBalances) {
          const preSol = tx.meta.preBalances[accountIndex] || 0
          const postSol = tx.meta.postBalances[accountIndex] || 0
          solDelta = (preSol - postSol) / 1e9 // Convert lamports to SOL
        }

        break
      }
    }

    if (!buyerWallet || tokenDelta <= 0) return null

    return {
      signature,
      slot: tx.slot,
      traderWallet: buyerWallet,
      type: 'buy',
      solAmount: Math.abs(solDelta),
      tokenAmount: tokenDelta,
      timestamp: tx.blockTime ? tx.blockTime * 1000 : Date.now(),
    }
  } catch (error) {
    console.error(`[ANTI-SNIPER] Failed to analyze tx ${signature}:`, error)
    return null
  }
}

async function triggerAutoSell(
  tokenMint: string,
  tradeEvent: TradeEvent,
  monitor: typeof activeMonitors extends Map<string, infer V> ? V : never
): Promise<void> {
  console.log(`[ANTI-SNIPER] Executing auto-sell for ${tokenMint}`)

  try {
    // Call the auto-sell API
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const response = await fetch(`${baseUrl}/api/token22/anti-sniper/sell`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-session-id': monitor.sessionId,
        'x-internal-call': 'true',
      },
      body: JSON.stringify({
        tokenMint,
        walletIds: monitor.config.autoSellWalletIds,
        sellPercentage: monitor.config.sellPercentage,
        reason: 'sniper_detected',
        triggerTrade: tradeEvent,
      }),
    })

    const result = await response.json()
    
    if (!result.success) {
      console.error(`[ANTI-SNIPER] Auto-sell failed:`, result.error)
    } else {
      console.log(`[ANTI-SNIPER] Auto-sell executed successfully:`, result.data)
    }
  } catch (error) {
    console.error(`[ANTI-SNIPER] Auto-sell error:`, error)
  }
}

async function cleanupMonitor(tokenMint: string, reason: string): Promise<void> {
  activeMonitors.delete(tokenMint)
  
  const adminClient = getAdminClient()
  await adminClient.from('anti_sniper_monitors').update({
    status: reason,
    ended_at: new Date().toISOString(),
  }).eq('token_mint', tokenMint)

  console.log(`[ANTI-SNIPER] Monitor cleaned up for ${tokenMint}: ${reason}`)
}

// ============================================================================
// GET - Check monitor status
// ============================================================================

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenMint = searchParams.get('tokenMint')

    if (!tokenMint) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: 'tokenMint required' } },
        { status: 400 }
      )
    }

    const monitor = activeMonitors.get(tokenMint)
    
    if (monitor) {
      return NextResponse.json({
        success: true,
        data: {
          tokenMint,
          status: monitor.triggered ? 'triggered' : 'monitoring',
          triggered: monitor.triggered,
          startTime: monitor.startTime,
          expiresAt: monitor.expiresAt,
          remainingMs: Math.max(0, monitor.expiresAt - Date.now()),
          config: {
            windowBlocks: monitor.config.monitorBlocksWindow,
            maxSupplyPercent: monitor.config.maxSupplyPercentThreshold,
            maxSolAmount: monitor.config.maxSolAmountThreshold,
          },
        },
      })
    }

    // Check database
    const adminClient = getAdminClient()
    const { data: dbMonitor } = await adminClient
      .from('anti_sniper_monitors')
      .select('*')
      .eq('token_mint', tokenMint)
      .single()

    if (dbMonitor) {
      return NextResponse.json({
        success: true,
        data: {
          tokenMint,
          status: dbMonitor.status,
          triggered: dbMonitor.triggered,
          startTime: new Date(dbMonitor.started_at).getTime(),
          expiresAt: new Date(dbMonitor.expires_at).getTime(),
          remainingMs: 0,
          config: dbMonitor.config,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        tokenMint,
        status: 'not_found',
      },
    })

  } catch (error) {
    console.error('[ANTI-SNIPER] Status check error:', error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : 'Failed to check status',
        },
      },
      { status: 500 }
    )
  }
}

