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
 * Fetch transactions from Helius using getTransactionsForAddress API
 * 
 * CREDIT EFFICIENCY:
 * - getTransactionsForAddress: 100 credits for up to 100 full transactions (ONE call)
 * - Old method (getSignaturesForAddress + getTransaction): 10 + (10 × N) = 510+ credits for 50 txs
 * 
 * This is 5x more efficient for fetching transaction history!
 * Requires Developer plan or higher.
 */
async function fetchHeliusTransactions(
  tokenAddress: string,
  limit: number,
  beforeSignature?: string | null
): Promise<Transaction[]> {
  // Build RPC URL - use HELIUS_RPC_URL if available, otherwise construct from API key
  const rpcUrl = HELIUS_RPC || (HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : null)
  
  if (!rpcUrl) {
    return []
  }

  try {
    // Use Helius getTransactionsForAddress - most efficient method!
    // 100 credits = 100 full transactions in ONE call
    // vs old method: 10 credits (signatures) + 10 credits × N transactions = 510+ credits
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "tx-history",
        method: "getTransactionsForAddress",
        params: [
          tokenAddress,
          {
            transactionDetails: "full", // Get complete transaction data
            sortOrder: "desc", // Newest first
            limit: Math.min(limit, 100), // Max 100 with full details
            ...(beforeSignature ? { 
              filters: { 
                before: { signature: beforeSignature } 
              } 
            } : {}),
            // Only get successful transactions
            filters: {
              status: "succeeded"
            }
          }
        ]
      }),
      signal: AbortSignal.timeout(15000)
    })

    if (!response.ok) {
      // If getTransactionsForAddress fails (e.g., older Helius plan), fall back to standard RPC
      console.warn("[TOKEN-TRANSACTIONS] getTransactionsForAddress error:", response.status, "- falling back to standard RPC")
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }

    const data = await response.json()
    
    // Check for RPC error (method not found on older plans)
    if (data.error) {
      console.warn("[TOKEN-TRANSACTIONS] Helius RPC error:", data.error.message, "- falling back to standard RPC")
      return await fetchHeliusTransactionsFallback(tokenAddress, limit, beforeSignature)
    }
    
    const txs = data.result?.data || []

    return txs
      .slice(0, limit)
      .map((tx: HeliusFullTransaction) => {
        const isBuy = isTokenBuyHelius(tx, tokenAddress)
        const solAmount = extractSolAmountHelius(tx)
        const tokenAmount = extractTokenAmountHelius(tx, tokenAddress)
        
        return {
          signature: tx.signature || "",
          type: isBuy ? "buy" : "sell",
          walletAddress: tx.feePayer || "",
          amountSol: solAmount,
          amountTokens: tokenAmount,
          timestamp: (tx.blockTime || 0) * 1000,
          status: "confirmed" as const,
        }
      })
      .filter((tx: Transaction) => tx.amountSol > 0 || tx.amountTokens > 0)
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error("[TOKEN-TRANSACTIONS] Helius fetch error:", error)
    }
    return []
  }
}

/**
 * Fallback to standard RPC methods if getTransactionsForAddress is not available
 * Uses getSignaturesForAddress (10 credits) + individual getTransaction calls (10 credits each)
 * Less efficient but works on all Helius plans
 */
async function fetchHeliusTransactionsFallback(
  tokenAddress: string,
  limit: number,
  beforeSignature?: string | null
): Promise<Transaction[]> {
  const rpcUrl = HELIUS_RPC || (HELIUS_API_KEY ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}` : null)
  
  if (!rpcUrl) return []

  try {
    // Get signatures first (10 credits)
    const signaturesResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "sigs",
        method: "getSignaturesForAddress",
        params: [
          tokenAddress,
          { limit: Math.min(limit, 50), before: beforeSignature || undefined }
        ]
      }),
      signal: AbortSignal.timeout(8000)
    })

    if (!signaturesResponse.ok) return []

    const signaturesData = await signaturesResponse.json()
    const signatures = signaturesData.result || []
    
    if (signatures.length === 0) return []

    // Batch get transactions (10 credits each, but necessary fallback)
    const txResponse = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "txs",
        method: "getMultipleTransactions", // Batch call - more efficient
        params: [
          signatures.slice(0, 20).map((s: { signature: string }) => s.signature), // Limit to 20 to save credits
          { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }
        ]
      }),
      signal: AbortSignal.timeout(10000)
    })

    if (!txResponse.ok) return []

    const txData = await txResponse.json()
    const parsedTxs = txData.result || []

    return parsedTxs
      .filter((tx: ParsedTransaction | null) => tx !== null)
      .map((tx: ParsedTransaction) => {
        const isBuy = isTokenBuyParsed(tx, tokenAddress)
        const solAmount = extractSolAmountParsed(tx)
        const tokenAmount = extractTokenAmountParsed(tx, tokenAddress)
        
        return {
          signature: tx.transaction?.signatures?.[0] || "",
          type: isBuy ? "buy" : "sell",
          walletAddress: tx.transaction?.message?.accountKeys?.[0]?.pubkey || "",
          amountSol: solAmount,
          amountTokens: tokenAmount,
          timestamp: (tx.blockTime || 0) * 1000,
          status: "confirmed" as const,
        }
      })
      .filter((tx: Transaction) => tx.amountSol > 0 || tx.amountTokens > 0)
  } catch (error) {
    if (error instanceof Error && error.name !== 'AbortError') {
      console.error("[TOKEN-TRANSACTIONS] Fallback fetch error:", error)
    }
    return []
  }
}

// Helius getTransactionsForAddress response types
interface HeliusFullTransaction {
  signature: string
  blockTime?: number
  slot?: number
  feePayer?: string
  source?: string
  type?: string
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
  }>
  accountData?: Array<{
    account: string
    nativeBalanceChange: number
    tokenBalanceChanges: Array<{
      mint: string
      rawTokenAmount: { tokenAmount: string; decimals: number }
      userAccount: string
    }>
  }>
}

/**
 * Determine if transaction is a buy using Helius enhanced format
 */
function isTokenBuyHelius(tx: HeliusFullTransaction, tokenAddress: string): boolean {
  // Check token transfers
  if (tx.tokenTransfers) {
    const tokenTransfer = tx.tokenTransfers.find(t => t.mint === tokenAddress)
    if (tokenTransfer) {
      // If tokens go TO the fee payer, it's a buy
      return tokenTransfer.toUserAccount === tx.feePayer
    }
  }
  
  // Check account data for balance changes
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
 * Extract SOL amount from Helius enhanced format
 */
function extractSolAmountHelius(tx: HeliusFullTransaction): number {
  if (tx.nativeTransfers && tx.nativeTransfers.length > 0) {
    // Sum absolute SOL transfers
    const total = tx.nativeTransfers.reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
    return total / 1e9
  }
  
  // Fallback to account data
  if (tx.accountData) {
    const feePayerData = tx.accountData.find(a => a.account === tx.feePayer)
    if (feePayerData) {
      return Math.abs(feePayerData.nativeBalanceChange || 0) / 1e9
    }
  }
  
  return 0
}

/**
 * Extract token amount from Helius enhanced format
 */
function extractTokenAmountHelius(tx: HeliusFullTransaction, tokenAddress: string): number {
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

interface ParsedTransaction {
  blockTime?: number
  transaction?: {
    signatures?: string[]
    message?: {
      accountKeys?: Array<{ pubkey: string; signer?: boolean; writable?: boolean }>
      instructions?: Array<{
        program?: string
        programId?: string
        parsed?: {
          type?: string
          info?: {
            source?: string
            destination?: string
            amount?: string
            lamports?: number
            mint?: string
            tokenAmount?: { amount: string; decimals: number; uiAmount: number }
          }
        }
      }>
    }
  }
  meta?: {
    preBalances?: number[]
    postBalances?: number[]
    preTokenBalances?: Array<{
      mint: string
      owner: string
      uiTokenAmount: { amount: string; decimals: number; uiAmount: number }
    }>
    postTokenBalances?: Array<{
      mint: string
      owner: string
      uiTokenAmount: { amount: string; decimals: number; uiAmount: number }
    }>
  }
}

/**
 * Determine if a parsed transaction is a buy
 */
function isTokenBuyParsed(tx: ParsedTransaction, tokenAddress: string): boolean {
  const preBalances = tx.meta?.preTokenBalances || []
  const postBalances = tx.meta?.postTokenBalances || []
  const signer = tx.transaction?.message?.accountKeys?.[0]?.pubkey
  
  if (!signer) return false
  
  // Find token balance changes for the signer
  const preBal = preBalances.find(b => b.mint === tokenAddress && b.owner === signer)
  const postBal = postBalances.find(b => b.mint === tokenAddress && b.owner === signer)
  
  const preAmount = preBal ? parseFloat(preBal.uiTokenAmount.amount) : 0
  const postAmount = postBal ? parseFloat(postBal.uiTokenAmount.amount) : 0
  
  // If signer's token balance increased, it's a buy
  return postAmount > preAmount
}

/**
 * Extract SOL amount from parsed transaction
 */
function extractSolAmountParsed(tx: ParsedTransaction): number {
  const preBalances = tx.meta?.preBalances || []
  const postBalances = tx.meta?.postBalances || []
  
  if (preBalances.length === 0 || postBalances.length === 0) return 0
  
  // First account is typically the fee payer/signer
  const solChange = Math.abs(preBalances[0] - postBalances[0])
  return solChange / 1e9 // Convert lamports to SOL
}

/**
 * Extract token amount from parsed transaction
 */
function extractTokenAmountParsed(tx: ParsedTransaction, tokenAddress: string): number {
  const preBalances = tx.meta?.preTokenBalances || []
  const postBalances = tx.meta?.postTokenBalances || []
  const signer = tx.transaction?.message?.accountKeys?.[0]?.pubkey
  
  if (!signer) return 0
  
  const preBal = preBalances.find(b => b.mint === tokenAddress && b.owner === signer)
  const postBal = postBalances.find(b => b.mint === tokenAddress && b.owner === signer)
  
  const preAmount = preBal?.uiTokenAmount?.uiAmount || 0
  const postAmount = postBal?.uiTokenAmount?.uiAmount || 0
  
  return Math.abs(postAmount - preAmount)
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

