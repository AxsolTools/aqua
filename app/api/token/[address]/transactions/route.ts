/**
 * Token Transactions API - Fetch on-chain transaction history
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
 * Fetch transactions from Helius getTransactionsForAddress RPC method
 * 
 * CREDIT COSTS:
 * - getTransactionsForAddress: 100 credits per call (Developer plan+)
 * - Returns full transaction data with filtering and sorting
 * 
 * Docs: https://www.helius.dev/docs/rpc/gettransactionsforaddress
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
    // Use getTransactionsForAddress RPC method (Helius Developer plan+)
    // Docs: https://www.helius.dev/docs/rpc/gettransactionsforaddress
    const rpcUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
    
    const response = await fetch(rpcUrl, {
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
            encoding: "jsonParsed",
            maxSupportedTransactionVersion: 0,
            sortOrder: "desc",
            limit: Math.min(limit, 100),
            filters: { status: "succeeded" }
          }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      console.warn("[TOKEN-TRANSACTIONS] Helius RPC error:", response.status)
      // Fall back to standard RPC if enhanced API fails
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }

    const data = await response.json()
    
    if (data.error) {
      console.warn("[TOKEN-TRANSACTIONS] RPC error:", data.error.message || data.error)
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }
    
    const transactions = data.result?.data || []
    
    if (!Array.isArray(transactions)) {
      console.warn("[TOKEN-TRANSACTIONS] Unexpected response format")
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }
    
    console.log("[TOKEN-TRANSACTIONS] Found", transactions.length, "transactions")

    if (transactions.length === 0) {
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }

    // Map getTransactionsForAddress response to our format
    // Response format: { slot, blockTime, transaction, meta }
    const mappedTxs = transactions
      .slice(0, limit)
      .map((tx: FullTransactionResponse): Transaction => {
        const signature = tx.transaction?.signatures?.[0] || ""
        const blockTime = tx.blockTime || 0
        const meta = tx.meta
        const message = tx.transaction?.message
        
        // Get fee payer (first account in message)
        const feePayer = message?.accountKeys?.[0]?.pubkey || ""
        
        // Analyze balance changes to determine buy/sell
        const { isBuy, solAmount, tokenAmount } = analyzeBalanceChanges(
          meta, 
          message, 
          tokenAddress, 
          feePayer
        )
        
        // Debug log for first few transactions
        if (transactions.indexOf(tx) < 3) {
          console.log("[TOKEN-TRANSACTIONS] TX:", signature?.slice(0, 12), 
            "isBuy:", isBuy,
            "SOL:", solAmount.toFixed(6),
            "tokens:", tokenAmount
          )
        }
        
        return {
          signature,
          type: isBuy ? "buy" as const : "sell" as const,
          walletAddress: feePayer,
          amountSol: solAmount,
          amountTokens: tokenAmount,
          timestamp: blockTime * 1000,
          status: "confirmed" as const,
        }
      })
      .filter((tx) => tx.signature) // Only include valid txs
    
    return mappedTxs
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

// Full transaction response from getTransactionsForAddress
interface FullTransactionResponse {
  slot: number
  blockTime: number | null
  transaction: {
    signatures: string[]
    message: {
      accountKeys: Array<{ pubkey: string; signer: boolean; writable: boolean }>
      instructions: Array<{
        programId: string
        accounts?: string[]
        data?: string
        parsed?: {
          type: string
          info: Record<string, unknown>
        }
      }>
    }
  }
  meta: {
    err: unknown | null
    fee: number
    preBalances: number[]
    postBalances: number[]
    preTokenBalances?: Array<{
      accountIndex: number
      mint: string
      uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null }
      owner?: string
    }>
    postTokenBalances?: Array<{
      accountIndex: number
      mint: string
      uiTokenAmount: { amount: string; decimals: number; uiAmount: number | null }
      owner?: string
    }>
  }
}

/**
 * Analyze balance changes to determine buy/sell and amounts
 */
function analyzeBalanceChanges(
  meta: FullTransactionResponse["meta"],
  message: FullTransactionResponse["transaction"]["message"],
  tokenAddress: string,
  feePayer: string
): { isBuy: boolean; solAmount: number; tokenAmount: number } {
  let isBuy = false
  let solAmount = 0
  let tokenAmount = 0

  if (!meta || !message) {
    return { isBuy, solAmount, tokenAmount }
  }

  // Calculate SOL change for fee payer (index 0)
  if (meta.preBalances && meta.postBalances && meta.preBalances.length > 0) {
    const solChange = (meta.postBalances[0] - meta.preBalances[0]) / 1e9
    // If SOL decreased significantly (more than just fees), they spent SOL = buy
    // Account for fees (~0.000005 SOL) by checking if change is significant
    if (solChange < -0.0001) {
      // Spent SOL = likely buying tokens
      solAmount = Math.abs(solChange)
    } else if (solChange > 0.0001) {
      // Received SOL = likely selling tokens
      solAmount = solChange
    }
  }

  // Check token balance changes for the specific token
  const preTokens = meta.preTokenBalances || []
  const postTokens = meta.postTokenBalances || []

  // Find token balance for fee payer
  for (const post of postTokens) {
    if (post.mint !== tokenAddress) continue
    
    const postAmount = parseFloat(post.uiTokenAmount.amount) / Math.pow(10, post.uiTokenAmount.decimals)
    
    // Find matching pre balance
    const pre = preTokens.find(p => 
      p.accountIndex === post.accountIndex && p.mint === tokenAddress
    )
    const preAmount = pre 
      ? parseFloat(pre.uiTokenAmount.amount) / Math.pow(10, pre.uiTokenAmount.decimals)
      : 0
    
    const tokenChange = postAmount - preAmount
    
    if (tokenChange > 0) {
      // Received tokens = buy
      isBuy = true
      tokenAmount = tokenChange
    } else if (tokenChange < 0) {
      // Sent tokens = sell
      isBuy = false
      tokenAmount = Math.abs(tokenChange)
    }
    break
  }

  // If we didn't find token changes, check if fee payer got new token account
  if (tokenAmount === 0) {
    for (const post of postTokens) {
      if (post.mint !== tokenAddress) continue
      
      const hasPreBalance = preTokens.some(p => 
        p.accountIndex === post.accountIndex && p.mint === tokenAddress
      )
      
      if (!hasPreBalance && post.uiTokenAmount.uiAmount && post.uiTokenAmount.uiAmount > 0) {
        // New token account with balance = buy
        isBuy = true
        tokenAmount = post.uiTokenAmount.uiAmount
        break
      }
    }
  }

  // If we found no token amount but significant SOL change, check any token
  if (tokenAmount === 0 && solAmount > 0) {
    for (const post of postTokens) {
      const pre = preTokens.find(p => p.accountIndex === post.accountIndex && p.mint === post.mint)
      const postAmt = parseFloat(post.uiTokenAmount.amount) / Math.pow(10, post.uiTokenAmount.decimals)
      const preAmt = pre ? parseFloat(pre.uiTokenAmount.amount) / Math.pow(10, pre.uiTokenAmount.decimals) : 0
      const change = postAmt - preAmt
      
      if (Math.abs(change) > 0) {
        tokenAmount = Math.abs(change)
        isBuy = change > 0
        break
      }
    }
  }

  return { isBuy, solAmount, tokenAmount }
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
