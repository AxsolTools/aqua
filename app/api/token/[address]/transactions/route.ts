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
 * Fetch transactions from Helius Enhanced Transactions API
 * 
 * CORRECT APPROACH:
 * 1. Use getSignaturesForAddress to get transaction signatures
 * 2. Use POST /v0/transactions with signatures to get enhanced parsed data
 * 
 * Docs: https://docs.helius.dev/solana-apis/enhanced-transactions-api/parse-transaction-s
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
    // Step 1: Get signatures using standard RPC
    const sigResponse = await fetch(HELIUS_RPC!, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sigs",
        method: "getSignaturesForAddress",
        params: [
          tokenAddress,
          { 
            limit: Math.min(limit, 50),
            ...(beforeSignature ? { before: beforeSignature } : {})
          }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!sigResponse.ok) {
      console.warn("[TOKEN-TRANSACTIONS] Failed to get signatures:", sigResponse.status)
      return []
    }

    const sigData = await sigResponse.json()
    const signatures = (sigData.result || [])
      .filter((sig: SignatureInfo) => sig.err === null)
      .map((sig: SignatureInfo) => sig.signature)
      .slice(0, Math.min(limit, 50))

    if (signatures.length === 0) {
      console.log("[TOKEN-TRANSACTIONS] No signatures found")
      return []
    }

    console.log("[TOKEN-TRANSACTIONS] Found", signatures.length, "signatures, fetching enhanced data...")

    // Step 2: Use POST /v0/transactions to get enhanced parsed data
    // Docs: https://www.helius.dev/docs/api-reference/enhanced-transactions/gettransactions
    const enhancedResponse = await fetch(
      `https://api-mainnet.helius-rpc.com/v0/transactions?api-key=${HELIUS_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactions: signatures }),
        signal: AbortSignal.timeout(15000)
      }
    )

    if (!enhancedResponse.ok) {
      console.warn("[TOKEN-TRANSACTIONS] Enhanced API error:", enhancedResponse.status)
      // Return basic transactions from signatures
      return sigData.result
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

    const transactions = await enhancedResponse.json()
    
    if (!Array.isArray(transactions)) {
      console.warn("[TOKEN-TRANSACTIONS] Unexpected response format")
      return []
    }
    
    console.log("[TOKEN-TRANSACTIONS] Got", transactions.length, "enhanced transactions")

    // Map enhanced transactions to our format
    const mappedTxs = transactions
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
      .filter((tx) => tx.signature)
    
    return mappedTxs
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error("[TOKEN-TRANSACTIONS] Helius fetch error:", error)
    }
    return []
  }
}


// Enhanced Transaction format from Helius API
// Supports multiple formats as Helius response can vary
interface EnhancedTransaction {
  signature: string
  timestamp?: number
  slot?: number
  feePayer?: string
  source?: string
  type?: string
  description?: string
  // Native SOL transfers (lamports)
  nativeTransfers?: Array<{
    amount: number | string
    fromUserAccount: string
    toUserAccount: string
  }>
  // Token transfers
  tokenTransfers?: Array<{
    mint: string
    tokenAmount: number
    fromUserAccount: string
    toUserAccount: string
    tokenStandard?: string
  }>
  // Account balance changes
  accountData?: Array<{
    account: string
    nativeBalanceChange: number | string
    tokenBalanceChanges?: Array<{
      mint: string
      rawTokenAmount: { tokenAmount: string; decimals: number }
      userAccount: string
    }>
  }>
  // Swap events from Helius Enhanced API
  events?: {
    swap?: {
      nativeInput?: { account: string; amount: string | number }
      nativeOutput?: { account: string; amount: string | number }
      tokenInputs?: Array<{
        mint: string
        rawTokenAmount: { tokenAmount: string; decimals: number }
        userAccount: string
        tokenAccount: string
      }>
      tokenOutputs?: Array<{
        mint: string
        rawTokenAmount: { tokenAmount: string; decimals: number }
        userAccount: string
        tokenAccount: string
      }>
      // Alternative format
      innerSwaps?: Array<{
        tokenInputs?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
        tokenOutputs?: Array<{ mint: string; rawTokenAmount: { tokenAmount: string; decimals: number } }>
        nativeFees?: Array<{ amount: number | string }>
      }>
    }
    // Alternative field name
    nft?: unknown
  }
  // Alternative fee format
  fee?: number
  // Native balance change for the whole transaction
  nativeBalanceChange?: number | string
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
  // PRIORITY 1: Check swap events - if SOL is input and tokens are output, it's a buy
  if (tx.events?.swap) {
    const swap = tx.events.swap
    // If there's native input (SOL spent) and token outputs, it's a buy
    if (swap.nativeInput && swap.tokenOutputs && swap.tokenOutputs.length > 0) {
      return true
    }
    // If there's token input and native output (SOL received), it's a sell
    if (swap.nativeOutput && swap.tokenInputs && swap.tokenInputs.length > 0) {
      return false
    }
  }

  // PRIORITY 2: Check token transfers
  if (tx.tokenTransfers) {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (tokenTransfer) {
      return tokenTransfer.toUserAccount === tx.feePayer
    }
  }
  
  // PRIORITY 3: Check account data
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
  // PRIORITY 1: Check swap events (most accurate for DEX trades)
  if (tx.events?.swap) {
    const swap = tx.events.swap
    // For swaps, get SOL input or output
    if (swap.nativeInput?.amount) {
      const amount = typeof swap.nativeInput.amount === 'string' 
        ? parseInt(swap.nativeInput.amount) 
        : swap.nativeInput.amount
      if (amount > 0) return amount / 1e9
    }
    if (swap.nativeOutput?.amount) {
      const amount = typeof swap.nativeOutput.amount === 'string' 
        ? parseInt(swap.nativeOutput.amount) 
        : swap.nativeOutput.amount
      if (amount > 0) return amount / 1e9
    }
  }

  // PRIORITY 2: Try nativeTransfers - reliable for SOL transfers
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    // Sum all significant transfers (filter out tiny fee-related amounts)
    let totalSol = 0
    for (const transfer of tx.nativeTransfers) {
      const amount = typeof transfer.amount === 'string' 
        ? parseInt(transfer.amount) 
        : (transfer.amount || 0)
      // Only count significant transfers (> 0.001 SOL = 1_000_000 lamports)
      if (Math.abs(amount) > 1_000_000) {
        totalSol += Math.abs(amount)
      }
    }
    if (totalSol > 0) {
      // Return the average to avoid double-counting (from/to same pair)
      const count = tx.nativeTransfers.filter(t => {
        const amt = typeof t.amount === 'string' ? parseInt(t.amount) : (t.amount || 0)
        return Math.abs(amt) > 1_000_000
      }).length
      return (totalSol / Math.max(count, 1)) / 1e9
    }
  }
  
  // PRIORITY 3: Try accountData for balance changes
  if (tx.accountData) {
    // Look for significant balance changes (not just fee payer)
    let maxChange = 0
    for (const account of tx.accountData) {
      const change = typeof account.nativeBalanceChange === 'string'
        ? parseInt(account.nativeBalanceChange)
        : Math.abs(account.nativeBalanceChange || 0)
      // Only count significant changes (> 0.001 SOL)
      if (change > 1_000_000 && change > maxChange) {
        maxChange = change
      }
    }
    if (maxChange > 0) {
      return maxChange / 1e9
    }
  }
  
  return 0
}

/**
 * Extract token amount from transaction
 */
function extractTokenAmount(tx: EnhancedTransaction, tokenAddress: string): number {
  // PRIORITY 1: Check swap events for token amounts
  if (tx.events?.swap) {
    const swap = tx.events.swap
    // Check token outputs first (for buys, you receive tokens)
    if (swap.tokenOutputs && swap.tokenOutputs.length > 0) {
      const tokenOut = swap.tokenOutputs.find(t => t.mint === tokenAddress) || swap.tokenOutputs[0]
      if (tokenOut?.rawTokenAmount) {
        const amount = parseFloat(tokenOut.rawTokenAmount.tokenAmount)
        const decimals = tokenOut.rawTokenAmount.decimals || 0
        return Math.abs(amount / Math.pow(10, decimals))
      }
    }
    // Check token inputs (for sells, you send tokens)
    if (swap.tokenInputs && swap.tokenInputs.length > 0) {
      const tokenIn = swap.tokenInputs.find(t => t.mint === tokenAddress) || swap.tokenInputs[0]
      if (tokenIn?.rawTokenAmount) {
        const amount = parseFloat(tokenIn.rawTokenAmount.tokenAmount)
        const decimals = tokenIn.rawTokenAmount.decimals || 0
        return Math.abs(amount / Math.pow(10, decimals))
      }
    }
  }

  // PRIORITY 2: Try tokenTransfers
  if (tx.tokenTransfers && tx.tokenTransfers.length > 0) {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (tokenTransfer && tokenTransfer.tokenAmount) {
      return Math.abs(tokenTransfer.tokenAmount)
    }
    // If specific token not found, use the first transfer with amount
    const allTransfers = tx.tokenTransfers.filter(t => t.tokenAmount && t.tokenAmount > 0)
    if (allTransfers.length > 0) {
      return Math.abs(allTransfers[0].tokenAmount)
    }
  }
  
  // PRIORITY 3: Try accountData for balance changes
  if (tx.accountData) {
    for (const account of tx.accountData) {
      if (account.tokenBalanceChanges && account.tokenBalanceChanges.length > 0) {
        // Look for the specific token first
        const tokenChange = account.tokenBalanceChanges.find(t => t.mint === tokenAddress)
        if (tokenChange && tokenChange.rawTokenAmount) {
          const amount = parseFloat(tokenChange.rawTokenAmount.tokenAmount)
          const decimals = tokenChange.rawTokenAmount.decimals || 0
          return Math.abs(amount / Math.pow(10, decimals))
        }
        // Fallback to first token change
        const firstChange = account.tokenBalanceChanges[0]
        if (firstChange && firstChange.rawTokenAmount) {
          const amount = parseFloat(firstChange.rawTokenAmount.tokenAmount)
          const decimals = firstChange.rawTokenAmount.decimals || 0
          return Math.abs(amount / Math.pow(10, decimals))
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
