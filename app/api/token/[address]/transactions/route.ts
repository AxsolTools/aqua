/**
 * Token Transactions API - Fetch on-chain transaction history
 * Uses Helius for comprehensive transaction data
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_RPC = process.env.HELIUS_RPC_URL

interface Transaction {
  signature: string
  type: "buy" | "sell" | "transfer" | "unknown"
  walletAddress: string
  amountSol: number
  amountTokens: number
  timestamp: number
  status: "confirmed" | "pending" | "failed"
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100)
    const beforeSignature = searchParams.get("before")

    // First try to get transactions from database (for platform tokens)
    const dbTransactions = await fetchDatabaseTransactions(address, limit)

    // Also fetch on-chain transactions via Helius
    const onChainTransactions = await fetchHeliusTransactions(address, limit, beforeSignature)

    // Merge and deduplicate
    const allTransactions = mergeTransactions(dbTransactions, onChainTransactions)
      .slice(0, limit)

    return NextResponse.json({
      success: true,
      data: {
        transactions: allTransactions,
        hasMore: allTransactions.length === limit,
      },
    })
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] Error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch transactions" },
      { status: 500 }
    )
  }
}

/**
 * Fetch transactions from database (platform trades)
 */
async function fetchDatabaseTransactions(
  tokenAddress: string,
  limit: number
): Promise<Transaction[]> {
  try {
    // First get token ID
    const { data: token } = await supabase
      .from("tokens")
      .select("id")
      .eq("mint_address", tokenAddress)
      .single()

    if (!token) return []

    // Fetch trades
    const { data: trades, error } = await supabase
      .from("trades")
      .select("*")
      .eq("token_id", token.id)
      .order("created_at", { ascending: false })
      .limit(limit)

    if (error || !trades) return []

    return trades.map((trade) => ({
      signature: trade.tx_signature || "",
      type: trade.trade_type as "buy" | "sell",
      walletAddress: trade.wallet_address,
      amountSol: trade.amount_sol || 0,
      amountTokens: trade.amount_tokens || 0,
      timestamp: new Date(trade.created_at).getTime(),
      status: trade.status === "completed" ? "confirmed" : trade.status as Transaction["status"],
    }))
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] DB fetch error:", error)
    return []
  }
}

/**
 * Fetch transactions from Helius API
 */
async function fetchHeliusTransactions(
  tokenAddress: string,
  limit: number,
  beforeSignature?: string | null
): Promise<Transaction[]> {
  if (!HELIUS_API_KEY) {
    console.warn("[TOKEN-TRANSACTIONS] No Helius API key configured")
    return []
  }

  try {
    // Use Helius Enhanced Transactions API
    const url = `https://api.helius.xyz/v0/addresses/${tokenAddress}/transactions?api-key=${HELIUS_API_KEY}&type=SWAP`
    
    const response = await fetch(url)
    
    if (!response.ok) {
      console.warn("[TOKEN-TRANSACTIONS] Helius API error:", response.status)
      return []
    }

    const data = await response.json()
    
    if (!Array.isArray(data)) return []

    return data.slice(0, limit).map((tx: HelixTransaction) => {
      // Determine if buy or sell based on token movements
      const isBuy = isTokenBuy(tx, tokenAddress)
      
      return {
        signature: tx.signature,
        type: isBuy ? "buy" : "sell",
        walletAddress: tx.feePayer || tx.signer || "",
        amountSol: extractSolAmount(tx),
        amountTokens: extractTokenAmount(tx, tokenAddress),
        timestamp: tx.timestamp * 1000,
        status: "confirmed" as const,
      }
    })
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] Helius fetch error:", error)
    return []
  }
}

interface HelixTransaction {
  signature: string
  timestamp: number
  feePayer?: string
  signer?: string
  type?: string
  tokenTransfers?: Array<{
    mint: string
    tokenAmount: number
    fromUserAccount?: string
    toUserAccount?: string
  }>
  nativeTransfers?: Array<{
    amount: number
    fromUserAccount?: string
    toUserAccount?: string
  }>
}

/**
 * Determine if a transaction is a buy (receiving tokens)
 */
function isTokenBuy(tx: HelixTransaction, tokenAddress: string): boolean {
  if (!tx.tokenTransfers) return false
  
  const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
  if (!tokenTransfer) return false
  
  // If tokens are going TO the fee payer, it's a buy
  return tokenTransfer.toUserAccount === tx.feePayer
}

/**
 * Extract SOL amount from transaction
 */
function extractSolAmount(tx: HelixTransaction): number {
  if (!tx.nativeTransfers || tx.nativeTransfers.length === 0) return 0
  
  // Sum all SOL transfers
  const totalLamports = tx.nativeTransfers.reduce((sum, t) => sum + (t.amount || 0), 0)
  return totalLamports / 1e9 // Convert lamports to SOL
}

/**
 * Extract token amount from transaction
 */
function extractTokenAmount(tx: HelixTransaction, tokenAddress: string): number {
  if (!tx.tokenTransfers) return 0
  
  const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
  return tokenTransfer?.tokenAmount || 0
}

/**
 * Merge and deduplicate transactions from multiple sources
 */
function mergeTransactions(db: Transaction[], onChain: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  const merged: Transaction[] = []

  // Add DB transactions first (they have more accurate data for platform trades)
  for (const tx of db) {
    if (tx.signature && !seen.has(tx.signature)) {
      seen.add(tx.signature)
      merged.push(tx)
    }
  }

  // Add on-chain transactions that aren't in DB
  for (const tx of onChain) {
    if (tx.signature && !seen.has(tx.signature)) {
      seen.add(tx.signature)
      merged.push(tx)
    }
  }

  // Sort by timestamp descending
  return merged.sort((a, b) => b.timestamp - a.timestamp)
}

