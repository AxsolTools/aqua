/**
 * Token Transactions API - Fetch on-chain transaction history
 * Uses Helius getTransactionsForAddress RPC method for comprehensive transaction data
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
    const paginationToken = searchParams.get("paginationToken")

    // First try to get transactions from database (for platform tokens)
    const dbTransactions = await fetchDatabaseTransactions(address, limit)

    // Also fetch on-chain transactions via Helius getTransactionsForAddress RPC
    const onChainTransactions = await fetchHeliusTransactions(address, limit, paginationToken)

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
 * Fetch transactions using Helius getTransactionsForAddress RPC method
 * This is the new recommended approach with better filtering, sorting, and pagination
 * 
 * Docs: https://www.helius.dev/docs/rpc/gettransactionsforaddress
 */
async function fetchHeliusTransactions(
  tokenAddress: string,
  limit: number,
  paginationToken?: string | null
): Promise<Transaction[]> {
  if (!HELIUS_RPC) {
    console.log("[TOKEN-TRANSACTIONS] No HELIUS_RPC configured")
    return []
  }

  console.log("[TOKEN-TRANSACTIONS] Fetching for token:", tokenAddress.slice(0, 8))

  try {
    // Use the new getTransactionsForAddress RPC method
    const response = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getTransactionsForAddress",
        params: [
          tokenAddress,
          {
            transactionDetails: "full",
            sortOrder: "desc",
            limit: Math.min(limit, 100),
            maxSupportedTransactionVersion: 0,
            filters: {
              status: "succeeded"
            },
            ...(paginationToken ? { paginationToken } : {})
          }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      console.warn("[TOKEN-TRANSACTIONS] Helius RPC error:", response.status)
      // Fall back to standard RPC if new method fails
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, paginationToken)
    }

    const data = await response.json()
    
    if (data.error) {
      console.warn("[TOKEN-TRANSACTIONS] Helius RPC error:", data.error.message || data.error)
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, paginationToken)
    }
    
    const transactions = data.result?.data || []
    
    console.log("[TOKEN-TRANSACTIONS] Found", transactions.length, "transactions")

    if (transactions.length === 0) {
      return []
    }

    // Map transactions to our format
    return transactions
      .map((tx: FullTransaction): Transaction => {
        const parsed = parseTransaction(tx, tokenAddress)
        return {
          signature: tx.signature || "",
          type: parsed.type,
          walletAddress: parsed.walletAddress,
          amountSol: parsed.amountSol,
          amountTokens: parsed.amountTokens,
          timestamp: (tx.blockTime || 0) * 1000,
          status: tx.err ? "failed" : "confirmed",
        }
      })
      .filter((tx: Transaction) => tx.signature) // Only include valid txs
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error("[TOKEN-TRANSACTIONS] Helius fetch error:", error)
    }
    return await fetchHeliusTransactionsFallback(tokenAddress, limit, paginationToken)
  }
}

/**
 * Fallback to standard getSignaturesForAddress RPC if new method fails
 */
async function fetchHeliusTransactionsFallback(
  tokenAddress: string,
  limit: number,
  _paginationToken?: string | null
): Promise<Transaction[]> {
  if (!HELIUS_RPC) return []

  console.log("[TOKEN-TRANSACTIONS] Using fallback RPC method")

  try {
    // First get signatures
    const sigResponse = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sigs",
        method: "getSignaturesForAddress",
        params: [
          tokenAddress,
          { 
            limit: Math.min(limit, 100)
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!sigResponse.ok) return []

    const sigData = await sigResponse.json()
    const signatures = sigData.result || []
    
    console.log("[TOKEN-TRANSACTIONS] Fallback found", signatures.length, "signatures")

    if (signatures.length === 0) return []

    // For fallback, we need to fetch each transaction to get details
    // Batch fetch the first few transactions for better UX
    const signaturesToFetch = signatures
      .filter((sig: SignatureInfo) => sig.err === null)
      .slice(0, Math.min(limit, 20))
      .map((sig: SignatureInfo) => sig.signature)

    if (signaturesToFetch.length === 0) {
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
    }

    // Batch fetch transaction details
    const txResponse = await fetch(HELIUS_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "txs",
        method: "getTransactions",
        params: [
          signaturesToFetch,
          { 
            maxSupportedTransactionVersion: 0,
            encoding: "jsonParsed"
          }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    })

    if (!txResponse.ok) {
      // If batch fetch fails, return basic signature data
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
    }

    const txData = await txResponse.json()
    const txResults = txData.result || []

    return txResults.map((tx: FullTransaction, index: number) => {
      if (!tx) {
        const sig = signatures[index]
        return {
          signature: sig?.signature || "",
          type: "unknown" as const,
          walletAddress: "",
          amountSol: 0,
          amountTokens: 0,
          timestamp: (sig?.blockTime || 0) * 1000,
          status: "confirmed" as const,
        }
      }
      
      const parsed = parseTransaction(tx, tokenAddress)
      return {
        signature: tx.signature || signaturesToFetch[index] || "",
        type: parsed.type,
        walletAddress: parsed.walletAddress,
        amountSol: parsed.amountSol,
        amountTokens: parsed.amountTokens,
        timestamp: (tx.blockTime || 0) * 1000,
        status: tx.meta?.err ? "failed" : "confirmed",
      }
    })
  } catch (error) {
    console.error("[TOKEN-TRANSACTIONS] Fallback error:", error)
    return []
  }
}

/**
 * Parse a full transaction to extract trade details
 */
function parseTransaction(tx: FullTransaction, tokenAddress: string): {
  type: "buy" | "sell" | "transfer" | "unknown"
  walletAddress: string
  amountSol: number
  amountTokens: number
} {
  const result = {
    type: "unknown" as "buy" | "sell" | "transfer" | "unknown",
    walletAddress: "",
    amountSol: 0,
    amountTokens: 0,
  }

  try {
    // Get the fee payer as the wallet address
    const message = tx.transaction?.message
    if (message?.accountKeys && message.accountKeys.length > 0) {
      const firstKey = message.accountKeys[0]
      result.walletAddress = typeof firstKey === 'string' ? firstKey : (firstKey?.pubkey || "")
    }

    // Check meta for balance changes
    const meta = tx.meta
    if (meta) {
      // Calculate SOL change for the first account (fee payer)
      const preBalances = meta.preBalances || []
      const postBalances = meta.postBalances || []
      if (preBalances.length > 0 && postBalances.length > 0) {
        const solChange = (postBalances[0] - preBalances[0]) / 1e9
        result.amountSol = Math.abs(solChange)
        
        // If SOL decreased and tokens likely increased, it's a buy
        // If SOL increased and tokens likely decreased, it's a sell
        if (solChange < -0.001) {
          result.type = "buy"
        } else if (solChange > 0.001) {
          result.type = "sell"
        }
      }

      // Try to get token amounts from token balance changes
      const preTokenBalances = meta.preTokenBalances || []
      const postTokenBalances = meta.postTokenBalances || []
      
      for (const post of postTokenBalances) {
        if (post.mint === tokenAddress) {
          const pre = preTokenBalances.find((p: TokenBalance) => p.accountIndex === post.accountIndex)
          const preAmount = pre?.uiTokenAmount?.uiAmount || 0
          const postAmount = post.uiTokenAmount?.uiAmount || 0
          const tokenChange = postAmount - preAmount
          result.amountTokens = Math.abs(tokenChange)
          
          // Refine type based on token change
          if (tokenChange > 0 && result.type === "unknown") {
            result.type = "buy"
          } else if (tokenChange < 0 && result.type === "unknown") {
            result.type = "sell"
          }
          break
        }
      }
    }
  } catch (e) {
    console.debug("[TOKEN-TRANSACTIONS] Parse error:", e)
  }

  return result
}

// Full transaction format from getTransactionsForAddress
interface FullTransaction {
  signature: string
  slot?: number
  blockTime?: number
  err?: unknown
  transaction?: {
    message?: {
      accountKeys?: Array<string | { pubkey: string }>
    }
  }
  meta?: {
    err?: unknown
    preBalances?: number[]
    postBalances?: number[]
    preTokenBalances?: TokenBalance[]
    postTokenBalances?: TokenBalance[]
  }
}

interface TokenBalance {
  accountIndex: number
  mint: string
  owner?: string
  uiTokenAmount?: {
    uiAmount: number | null
    decimals: number
    amount: string
  }
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

