/**
 * Token Transactions API - Fetch on-chain transaction history
 * Uses Helius Enhanced Transactions API for comprehensive transaction data
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_API_KEY = process.env.HELIUS_API_KEY
const HELIUS_RPC = process.env.HELIUS_RPC_URL || (HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : null)

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
 * Fetch transactions from Helius Enhanced Transactions API
 * 
 * CREDIT COSTS:
 * - Enhanced Transactions API: 100 credits per call
 * - Returns rich parsed data: token transfers, SOL amounts, transaction types
 * 
 * URL: https://api-mainnet.helius-rpc.com/v0/addresses/{address}/transactions?api-key=XXX
 */
async function fetchHeliusTransactions(
  tokenAddress: string,
  limit: number,
  beforeSignature?: string | null
): Promise<Transaction[]> {
  if (!HELIUS_API_KEY) {
    console.log("[TOKEN-TRANSACTIONS] No HELIUS_API_KEY configured")
    return []
  }

  console.log("[TOKEN-TRANSACTIONS] Fetching for token:", tokenAddress.slice(0, 8))

  try {
    // Use Enhanced Transactions API - returns rich parsed data
    // Docs: https://www.helius.dev/docs/enhanced-transactions/transaction-history
    let url = `https://api-mainnet.helius-rpc.com/v0/addresses/${tokenAddress}/transactions?api-key=${HELIUS_API_KEY}`
    
    // Add pagination if needed
    if (beforeSignature) {
      url += `&before=${beforeSignature}`
    }
    
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      console.warn("[TOKEN-TRANSACTIONS] Helius Enhanced API error:", response.status)
      // Fall back to standard RPC if enhanced API fails
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }

    const transactions = await response.json()
    
    if (!Array.isArray(transactions)) {
      console.warn("[TOKEN-TRANSACTIONS] Unexpected response format")
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }
    
    console.log("[TOKEN-TRANSACTIONS] Found", transactions.length, "transactions")

    if (transactions.length === 0) {
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }

    // Map enhanced transactions to our format
    return transactions
      .slice(0, limit)
      .map((tx: EnhancedTransaction): Transaction => {
        const isBuy = isTokenBuy(tx, tokenAddress)
        const solAmount = extractSolAmount(tx)
        const tokenAmount = extractTokenAmount(tx, tokenAddress)
        
        return {
          signature: tx.signature || "",
          type: isBuy ? "buy" as const : "sell" as const,
          walletAddress: tx.feePayer || "",
          amountSol: solAmount,
          amountTokens: tokenAmount,
          timestamp: (tx.timestamp || 0) * 1000,
          status: "confirmed" as const,
        }
      })
      .filter((tx) => tx.signature) // Only include valid txs
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error("[TOKEN-TRANSACTIONS] Helius fetch error:", error)
    }
    return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
  }
}

/**
 * Fallback to standard RPC if Enhanced API fails
 */
async function fetchHeliusTransactionsFallback(
  tokenAddress: string,
  limit: number,
  beforeSignature?: string | null
): Promise<Transaction[]> {
  if (!HELIUS_RPC) return []

  console.log("[TOKEN-TRANSACTIONS] Using fallback RPC method")

  try {
    const response = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sigs",
        method: "getSignaturesForAddress",
        params: [
          tokenAddress,
          { 
            limit: Math.min(limit, 100),
            ...(beforeSignature ? { before: beforeSignature } : {})
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!response.ok) return []

    const data = await response.json()
    const signatures = data.result || []
    
    console.log("[TOKEN-TRANSACTIONS] Fallback found", signatures.length, "signatures")

    return signatures
      .filter((sig: SignatureInfo) => sig.err === null)
      .slice(0, limit)
      .map((sig: SignatureInfo) => ({
        signature: sig.signature,
        type: "unknown" as const,
        walletAddress: "",
        amountSol: 0,
        amountTokens: 0,
        timestamp: (sig.blockTime || 0) * 1000,
        status: "confirmed" as const,
      }))
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] Fallback error:", error)
    return []
  }
}

// Enhanced Transaction format from Helius API
interface EnhancedTransaction {
  signature: string
  timestamp?: number
  slot?: number
  feePayer?: string
  source?: string
  type?: string
  description?: string
  nativeTransfers?: Array<{
    amount: number
    fromUserAccount: string
    toUserAccount: string
  }>
  tokenTransfers?: Array<{
    mint: string
    tokenAmount: number
    fromUserAccount: string
    toUserAccount: string
    tokenStandard?: string
  }>
  accountData?: Array<{
    account: string
    nativeBalanceChange: number
    tokenBalanceChanges?: Array<{
      mint: string
      rawTokenAmount: { tokenAmount: string; decimals: number }
      userAccount: string
    }>
  }>
}

// Signature info from getSignaturesForAddress fallback
interface SignatureInfo {
  signature: string
  slot: number
  blockTime: number | null
  err: unknown | null
  memo: string | null
  confirmationStatus: string
}

/**
 * Determine if transaction is a buy (tokens going to the fee payer)
 */
function isTokenBuy(tx: EnhancedTransaction, tokenAddress: string): boolean {
  if (tx.tokenTransfers) {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (tokenTransfer) {
      return tokenTransfer.toUserAccount === tx.feePayer
    }
  }
  
  if (tx.accountData) {
    const feePayerData = tx.accountData.find(a => a.account === tx.feePayer)
    if (feePayerData?.tokenBalanceChanges) {
      const tokenChange = feePayerData.tokenBalanceChanges.find(t => t.mint === tokenAddress)
      if (tokenChange) {
        return parseFloat(tokenChange.rawTokenAmount.tokenAmount) > 0
      }
    }
  }
  
  return false
}

/**
 * Extract SOL amount from transaction
 */
function extractSolAmount(tx: EnhancedTransaction): number {
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    const total = tx.nativeTransfers.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
    return total / 1e9
  }
  
  if (tx.accountData) {
    const feePayerData = tx.accountData.find(a => a.account === tx.feePayer)
    if (feePayerData) {
      return Math.abs(feePayerData.nativeBalanceChange || 0) / 1e9
    }
  }
  
  return 0
}

/**
 * Extract token amount from transaction
 */
function extractTokenAmount(tx: EnhancedTransaction, tokenAddress: string): number {
  if (tx.tokenTransfers) {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (tokenTransfer) {
      return Math.abs(tokenTransfer.tokenAmount || 0)
    }
  }
  
  if (tx.accountData) {
    for (const account of tx.accountData) {
      if (account.tokenBalanceChanges) {
        const tokenChange = account.tokenBalanceChanges.find(t => t.mint === tokenAddress)
        if (tokenChange) {
          return Math.abs(parseFloat(tokenChange.rawTokenAmount.tokenAmount))
        }
      }
    }
  }
  
  return 0
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
