/**
 * Batch Trade API - Execute trades for multiple wallets atomically
 * 
 * Uses Jito bundles for atomic execution with sequential fallback
 * Each wallet trades the FULL specified amount (not split)
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, PublicKey, VersionedTransaction } from "@solana/web3.js"
import { getAssociatedTokenAddress } from "@solana/spl-token"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { executeBundle, executeSequentialFallback } from "@/lib/blockchain/jito-bundles"

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"
const MAX_BUNDLE_SIZE = 5 // Jito max transactions per bundle
const DEFAULT_PRIORITY_FEE = 0.0005

// ============================================================================
// TYPES
// ============================================================================

interface BatchTradeRequest {
  walletAddresses: string[]
  action: "buy" | "sell"
  tokenMint: string
  amountPerWallet: number
  slippageBps: number
  tokenDecimals?: number
}

interface WalletTradeResult {
  walletAddress: string
  success: boolean
  txSignature?: string
  error?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")
    const userId = request.headers.get("x-user-id")

    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Session required" } },
        { status: 401 }
      )
    }

    // Parse request body
    const body: BatchTradeRequest = await request.json()
    const {
      walletAddresses,
      action,
      tokenMint,
      amountPerWallet,
      slippageBps = 500,
      tokenDecimals = 6,
    } = body

    // Validate request
    if (!walletAddresses || !Array.isArray(walletAddresses) || walletAddresses.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "No wallet addresses provided" } },
        { status: 400 }
      )
    }

    if (!["buy", "sell"].includes(action)) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Invalid action" } },
        { status: 400 }
      )
    }

    if (typeof amountPerWallet !== "number" || amountPerWallet <= 0) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Invalid amount" } },
        { status: 400 }
      )
    }

    if (!tokenMint || tokenMint.length < 32) {
      return NextResponse.json(
        { success: false, error: { code: 4001, message: "Invalid token mint" } },
        { status: 400 }
      )
    }

    console.log("[BATCH-TRADE] Request:", {
      walletCount: walletAddresses.length,
      action,
      tokenMint: tokenMint.slice(0, 8),
      amountPerWallet,
      slippageBps,
    })

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    const serviceSalt = await getOrCreateServiceSalt(adminClient)

    // Fetch and decrypt all wallet keypairs
    const walletKeypairs: Map<string, Keypair> = new Map()
    const walletErrors: WalletTradeResult[] = []

    for (const address of walletAddresses) {
      try {
        const { data: wallet, error: walletError } = await adminClient
          .from("wallets")
          .select("encrypted_private_key")
          .eq("session_id", sessionId)
          .eq("public_key", address)
          .single()

        if (walletError || !wallet) {
          walletErrors.push({
            walletAddress: address,
            success: false,
            error: "Wallet not found or not authorized",
          })
          continue
        }

        const privateKeyBase58 = decryptPrivateKey(
          wallet.encrypted_private_key,
          sessionId,
          serviceSalt
        )
        const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))
        walletKeypairs.set(address, keypair)
      } catch (error) {
        console.error(`[BATCH-TRADE] Failed to decrypt wallet ${address}:`, error)
        walletErrors.push({
          walletAddress: address,
          success: false,
          error: "Failed to decrypt wallet",
        })
      }
    }

    if (walletKeypairs.size === 0) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "No valid wallets found" } },
        { status: 404 }
      )
    }

    console.log(`[BATCH-TRADE] Loaded ${walletKeypairs.size} wallets`)

    // For sells, we need to get each wallet's actual token balance
    // because the client sends the TOTAL amount across all wallets
    const walletTokenBalances: Map<string, number> = new Map()
    
    if (action === "sell") {
      console.log("[BATCH-TRADE] Fetching individual token balances for sell...")
      const tokenMintPubkey = new PublicKey(tokenMint)
      
      for (const [address] of walletKeypairs) {
        try {
          const walletPubkey = new PublicKey(address)
          const ata = await getAssociatedTokenAddress(tokenMintPubkey, walletPubkey)
          const balance = await connection.getTokenAccountBalance(ata)
          const tokenAmount = balance.value.uiAmount || 0
          walletTokenBalances.set(address, tokenAmount)
          console.log(`[BATCH-TRADE] Wallet ${address.slice(0, 8)} has ${tokenAmount.toFixed(2)} tokens`)
        } catch (error) {
          console.warn(`[BATCH-TRADE] Could not fetch balance for ${address.slice(0, 8)}:`, error)
          walletTokenBalances.set(address, 0)
        }
      }
    }

    // Build transactions for each wallet via PumpPortal
    const transactions: VersionedTransaction[] = []
    const walletToTxIndex: Map<string, number> = new Map()
    const walletActualAmounts: Map<string, number> = new Map()

    for (const [address, keypair] of walletKeypairs) {
      try {
        // For sells, use actual wallet balance. For buys, use the requested amount.
        let actualAmount = amountPerWallet
        
        if (action === "sell") {
          const walletBalance = walletTokenBalances.get(address) || 0
          if (walletBalance <= 0) {
            console.log(`[BATCH-TRADE] Skipping ${address.slice(0, 8)} - no tokens to sell`)
            walletErrors.push({
              walletAddress: address,
              success: false,
              error: "No tokens to sell",
            })
            continue
          }
          // Use the wallet's actual balance for sells
          actualAmount = walletBalance
          console.log(`[BATCH-TRADE] Will sell ${actualAmount.toFixed(2)} tokens from ${address.slice(0, 8)}`)
        }
        
        walletActualAmounts.set(address, actualAmount)

        // Build trade request for PumpPortal
        const tradeBody = {
          publicKey: address,
          action,
          mint: tokenMint,
          denominatedInSol: action === "buy" ? "true" : "false",
          amount: actualAmount,
          slippage: slippageBps / 100, // Convert to percentage
          priorityFee: transactions.length === 0 ? DEFAULT_PRIORITY_FEE : 0, // Only first tx pays tip
          pool: "pump",
        }

        console.log(`[BATCH-TRADE] Requesting tx for ${address.slice(0, 8)}...`)

        const response = await fetch(PUMPPORTAL_LOCAL_TRADE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(tradeBody),
        })

        if (!response.ok) {
          const errorText = await response.text()
          throw new Error(`PumpPortal error: ${errorText}`)
        }

        // PumpPortal returns raw transaction bytes
        const txBytes = new Uint8Array(await response.arrayBuffer())
        const tx = VersionedTransaction.deserialize(txBytes)

        // Sign the transaction
        tx.sign([keypair])

        walletToTxIndex.set(address, transactions.length)
        transactions.push(tx)
      } catch (error) {
        console.error(`[BATCH-TRADE] Failed to build tx for ${address}:`, error)
        walletErrors.push({
          walletAddress: address,
          success: false,
          error: error instanceof Error ? error.message : "Failed to build transaction",
        })
      }
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 3002, message: "No transactions could be built" },
          data: {
            totalWallets: walletAddresses.length,
            successCount: 0,
            failureCount: walletErrors.length,
            results: walletErrors,
            duration: Date.now() - startTime,
          },
        },
        { status: 400 }
      )
    }

    console.log(`[BATCH-TRADE] Built ${transactions.length} transactions`)

    // Execute transactions
    const results: WalletTradeResult[] = [...walletErrors]

    if (transactions.length <= MAX_BUNDLE_SIZE) {
      // Single bundle execution
      console.log("[BATCH-TRADE] Executing as single Jito bundle...")

      const bundleResult = await executeBundle(connection, transactions, {
        retries: 3,
        sequentialFallback: true,
      })

      // Map results back to wallets
      for (const [address, txIndex] of walletToTxIndex) {
        const signature = bundleResult.signatures[txIndex]
        results.push({
          walletAddress: address,
          success: bundleResult.success,
          txSignature: signature,
          error: bundleResult.success ? undefined : bundleResult.error,
        })
      }
    } else {
      // Multiple bundles needed - execute in chunks
      console.log(`[BATCH-TRADE] Splitting into ${Math.ceil(transactions.length / MAX_BUNDLE_SIZE)} bundles...`)

      const chunks: VersionedTransaction[][] = []
      for (let i = 0; i < transactions.length; i += MAX_BUNDLE_SIZE) {
        chunks.push(transactions.slice(i, i + MAX_BUNDLE_SIZE))
      }

      let globalIndex = 0
      for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
        const chunk = chunks[chunkIndex]
        console.log(`[BATCH-TRADE] Executing bundle ${chunkIndex + 1}/${chunks.length}...`)

        const bundleResult = await executeBundle(connection, chunk, {
          retries: 3,
          sequentialFallback: true,
        })

        // Map results back to wallets
        for (let i = 0; i < chunk.length; i++) {
          const walletAddress = Array.from(walletToTxIndex.entries()).find(
            ([, idx]) => idx === globalIndex + i
          )?.[0]

          if (walletAddress) {
            const signature = bundleResult.signatures[i]
            results.push({
              walletAddress,
              success: bundleResult.success,
              txSignature: signature,
              error: bundleResult.success ? undefined : bundleResult.error,
            })
          }
        }

        globalIndex += chunk.length

        // Small delay between bundles
        if (chunkIndex < chunks.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 500))
        }
      }
    }

    const successCount = results.filter((r) => r.success).length
    const duration = Date.now() - startTime

    console.log(`[BATCH-TRADE] Complete: ${successCount}/${results.length} successful in ${duration}ms`)

    // Record trades in database
    for (const result of results.filter((r) => r.success)) {
      try {
        const actualAmount = walletActualAmounts.get(result.walletAddress) || amountPerWallet
        await adminClient.from("trades").insert({
          wallet_address: result.walletAddress,
          token_address: tokenMint,
          trade_type: action,
          amount_sol: action === "buy" ? actualAmount : 0,
          token_amount: action === "sell" ? actualAmount : 0,
          tx_signature: result.txSignature,
          status: "confirmed",
          source: "batch_trade",
        })
      } catch (dbError) {
        console.warn("[BATCH-TRADE] Failed to record trade:", dbError)
      }
    }

    return NextResponse.json({
      success: successCount > 0,
      data: {
        totalWallets: walletAddresses.length,
        successCount,
        failureCount: results.length - successCount,
        results,
        duration,
      },
    })
  } catch (error) {
    console.error("[BATCH-TRADE] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : "Batch trade failed",
        },
      },
      { status: 500 }
    )
  }
}

