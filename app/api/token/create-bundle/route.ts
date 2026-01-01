/**
 * Bundle Token Creation API - Create token with coordinated multi-wallet launch
 * 
 * Uses Jito bundles for atomic execution:
 * - Token creation + dev buy in first transaction
 * - Bundle wallet buys in subsequent transactions (max 4)
 * 
 * Reference: raydiumspltoken/pumpfun_complete.js createPumpfunTokenWithBundle()
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { executeBundle } from "@/lib/blockchain/jito-bundles"
import { solToLamports, lamportsToSol } from "@/lib/precision"

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"
const PUMPFUN_IPFS_API = "https://pump.fun/api/ipfs"
const MAX_BUNDLE_WALLETS = 4 // Jito limit: 5 txs total (1 create + 4 buys)
const DEFAULT_PRIORITY_FEE = 0.0005
const BUNDLE_SLIPPAGE = 10 // 10% slippage for bundle

// ============================================================================
// TYPES
// ============================================================================

interface BundleWallet {
  walletId?: string
  address: string
  buyAmountSol: number
}

interface CreateBundleRequest {
  name: string
  symbol: string
  description: string
  image: string // Base64
  website?: string
  twitter?: string
  telegram?: string
  discord?: string
  totalSupply: number
  decimals: number
  initialBuySol: number
  mintSecretKey: string
  mintAddress: string
  bundleWallets: BundleWallet[]
  // AQUA parameters
  pourEnabled?: boolean
  pourRate?: number
  pourInterval?: string
  pourSource?: string
  evaporationEnabled?: boolean
  evaporationRate?: number
  feeToLiquidity?: number
  feeToCreator?: number
  autoClaimEnabled?: boolean
  claimThreshold?: number
  claimInterval?: string
  migrationTarget?: string
  treasuryWallet?: string
  devWallet?: string
}

// ============================================================================
// HANDLER
// ============================================================================

export async function POST(request: NextRequest) {
  const startTime = Date.now()

  try {
    // Get auth headers
    const sessionId = request.headers.get("x-session-id")
    const walletAddress = request.headers.get("x-wallet-address")

    if (!sessionId || !walletAddress) {
      return NextResponse.json(
        { success: false, error: { code: 1001, message: "Authentication required" } },
        { status: 401 }
      )
    }

    const body: CreateBundleRequest = await request.json()
    const {
      name,
      symbol,
      description,
      image,
      website,
      twitter,
      telegram,
      discord,
      totalSupply,
      decimals = 6,
      initialBuySol = 0,
      mintSecretKey,
      mintAddress,
      bundleWallets = [],
    } = body

    // Validate required fields
    if (!name || !symbol) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Name and symbol are required" } },
        { status: 400 }
      )
    }

    if (!mintSecretKey || !mintAddress) {
      return NextResponse.json(
        { success: false, error: { code: 3001, message: "Mint keypair is required" } },
        { status: 400 }
      )
    }

    console.log("[BUNDLE-CREATE] Starting bundle token creation:", {
      name,
      symbol,
      initialBuySol,
      bundleWalletsCount: bundleWallets.length,
      mintAddress: mintAddress.slice(0, 8),
    })

    const adminClient = getAdminClient()
    const connection = new Connection(HELIUS_RPC_URL, "confirmed")
    const serviceSalt = await getOrCreateServiceSalt(adminClient)

    // Reconstruct mint keypair
    const mintKeypair = Keypair.fromSecretKey(bs58.decode(mintSecretKey))

    // Get creator wallet keypair
    const { data: creatorWallet, error: walletError } = await adminClient
      .from("wallets")
      .select("encrypted_private_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !creatorWallet) {
      return NextResponse.json(
        { success: false, error: { code: 1003, message: "Creator wallet not found" } },
        { status: 404 }
      )
    }

    const creatorPrivateKey = decryptPrivateKey(
      creatorWallet.encrypted_private_key,
      sessionId,
      serviceSalt
    )
    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(creatorPrivateKey))

    // =========================================================================
    // STEP 1: Upload metadata to IPFS
    // =========================================================================
    console.log("[BUNDLE-CREATE] Uploading metadata to IPFS...")

    let metadataUri: string
    try {
      const formData = new FormData()
      formData.append("name", name)
      formData.append("symbol", symbol)
      formData.append("description", description || "")
      if (website) formData.append("website", website)
      if (twitter) formData.append("twitter", twitter)
      if (telegram) formData.append("telegram", telegram)
      
      // Convert base64 image to blob
      if (image && image.startsWith("data:")) {
        const [header, base64Data] = image.split(",")
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png"
        const imageBuffer = Buffer.from(base64Data, "base64")
        const imageBlob = new Blob([imageBuffer], { type: mimeType })
        formData.append("file", imageBlob, "token.png")
      }

      const ipfsResponse = await fetch(PUMPFUN_IPFS_API, {
        method: "POST",
        body: formData,
      })

      if (!ipfsResponse.ok) {
        throw new Error(`IPFS upload failed: ${ipfsResponse.statusText}`)
      }

      const ipfsData = await ipfsResponse.json()
      metadataUri = ipfsData.metadataUri
      console.log("[BUNDLE-CREATE] Metadata URI:", metadataUri)
    } catch (error) {
      console.error("[BUNDLE-CREATE] IPFS error:", error)
      return NextResponse.json(
        { success: false, error: { code: 3003, message: "Failed to upload metadata" } },
        { status: 500 }
      )
    }

    // =========================================================================
    // STEP 2: Load bundle wallet keypairs
    // =========================================================================
    const bundleKeypairs: Map<string, { keypair: Keypair; amount: number }> = new Map()
    const limitedWallets = bundleWallets.slice(0, MAX_BUNDLE_WALLETS)

    for (const bw of limitedWallets) {
      try {
        const { data: wallet } = await adminClient
          .from("wallets")
          .select("encrypted_private_key")
          .eq("session_id", sessionId)
          .eq("public_key", bw.address)
          .single()

        if (wallet) {
          const privateKey = decryptPrivateKey(
            wallet.encrypted_private_key,
            sessionId,
            serviceSalt
          )
          bundleKeypairs.set(bw.address, {
            keypair: Keypair.fromSecretKey(bs58.decode(privateKey)),
            amount: bw.buyAmountSol,
          })
        }
      } catch (error) {
        console.warn(`[BUNDLE-CREATE] Failed to load bundle wallet ${bw.address}:`, error)
      }
    }

    console.log(`[BUNDLE-CREATE] Loaded ${bundleKeypairs.size} bundle wallets`)

    // =========================================================================
    // STEP 3: Build bundle transactions via PumpPortal
    // =========================================================================
    const txArgs: {
      publicKey: string
      action: string
      tokenMetadata?: { name: string; symbol: string; uri: string }
      mint?: string
      denominatedInSol: string
      amount: number
      slippage: number
      priorityFee: number
      pool: string
    }[] = []

    // Transaction 0: Create + dev buy (with Jito tip via priorityFee)
    txArgs.push({
      publicKey: walletAddress,
      action: "create",
      tokenMetadata: {
        name,
        symbol,
        uri: metadataUri,
      },
      mint: mintAddress,
      denominatedInSol: "true",
      amount: initialBuySol,
      slippage: BUNDLE_SLIPPAGE,
      priorityFee: DEFAULT_PRIORITY_FEE,
      pool: "pump",
    })

    // Transactions 1-4: Bundle wallet buys
    for (const [address, { amount }] of bundleKeypairs) {
      txArgs.push({
        publicKey: address,
        action: "buy",
        mint: mintAddress,
        denominatedInSol: "true",
        amount: amount,
        slippage: BUNDLE_SLIPPAGE,
        priorityFee: 0, // Only first tx pays tip
        pool: "pump",
      })
    }

    console.log(`[BUNDLE-CREATE] Requesting ${txArgs.length} transactions from PumpPortal...`)

    // Request all transactions from PumpPortal
    const pumpResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(txArgs),
    })

    if (!pumpResponse.ok) {
      const errorText = await pumpResponse.text()
      console.error("[BUNDLE-CREATE] PumpPortal error:", errorText)
      return NextResponse.json(
        { success: false, error: { code: 3004, message: "PumpPortal request failed" } },
        { status: 500 }
      )
    }

    const txPayloads = await pumpResponse.json()
    const txArray = Array.isArray(txPayloads) ? txPayloads : txPayloads?.transactions || []

    if (txArray.length === 0) {
      return NextResponse.json(
        { success: false, error: { code: 3005, message: "No transactions returned from PumpPortal" } },
        { status: 500 }
      )
    }

    console.log(`[BUNDLE-CREATE] Received ${txArray.length} transactions`)

    // =========================================================================
    // STEP 4: Sign all transactions
    // =========================================================================
    const signedTransactions: VersionedTransaction[] = []

    // Sign create transaction (index 0)
    const createTx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txArray[0])))
    createTx.sign([mintKeypair, creatorKeypair])
    signedTransactions.push(createTx)

    // Sign bundle wallet transactions
    let bundleIndex = 0
    for (const [address, { keypair }] of bundleKeypairs) {
      const txIndex = bundleIndex + 1
      if (txIndex < txArray.length) {
        const tx = VersionedTransaction.deserialize(new Uint8Array(bs58.decode(txArray[txIndex])))
        tx.sign([keypair])
        signedTransactions.push(tx)
      }
      bundleIndex++
    }

    console.log(`[BUNDLE-CREATE] Signed ${signedTransactions.length} transactions`)

    // =========================================================================
    // STEP 5: Submit bundle via Jito
    // =========================================================================
    console.log("[BUNDLE-CREATE] Submitting Jito bundle...")

    const bundleResult = await executeBundle(connection, signedTransactions, {
      retries: 3,
      sequentialFallback: true,
    })

    if (!bundleResult.success) {
      console.error("[BUNDLE-CREATE] Bundle execution failed:", bundleResult.error)
      return NextResponse.json({
        success: false,
        error: { code: 3006, message: bundleResult.error || "Bundle execution failed" },
      }, { status: 500 })
    }

    const creationSignature = bundleResult.signatures[0]
    console.log("[BUNDLE-CREATE] Bundle successful:", {
      bundleId: bundleResult.bundleId,
      method: bundleResult.method,
      signatures: bundleResult.signatures.length,
    })

    // =========================================================================
    // STEP 6: Save to database
    // =========================================================================
    const { data: tokenRecord, error: dbError } = await adminClient
      .from("tokens")
      .insert({
        mint_address: mintAddress,
        name,
        symbol,
        description,
        image_url: image,
        website,
        twitter,
        telegram,
        discord,
        total_supply: totalSupply,
        decimals,
        creator_wallet: walletAddress,
        session_id: sessionId,
        stage: "bonding",
        tx_signature: creationSignature,
        
        // AQUA parameters
        pour_enabled: body.pourEnabled,
        pour_rate: body.pourRate,
        pour_interval: body.pourInterval,
        pour_source: body.pourSource,
        evaporation_enabled: body.evaporationEnabled,
        evaporation_rate: body.evaporationRate,
        fee_to_liquidity: body.feeToLiquidity,
        fee_to_creator: body.feeToCreator,
        auto_claim_enabled: body.autoClaimEnabled,
        claim_threshold: body.claimThreshold,
        claim_interval: body.claimInterval,
        migration_target: body.migrationTarget,
        treasury_wallet: body.treasuryWallet || walletAddress,
        dev_wallet: body.devWallet || walletAddress,
      })
      .select("id")
      .single()

    if (dbError) {
      console.error("[BUNDLE-CREATE] Database error:", dbError)
      // Token was created on-chain, so return success with warning
    }

    const duration = Date.now() - startTime
    console.log(`[BUNDLE-CREATE] Complete in ${duration}ms`)

    return NextResponse.json({
      success: true,
      data: {
        tokenId: tokenRecord?.id,
        mintAddress,
        txSignature: creationSignature,
        bundleId: bundleResult.bundleId,
        bundleMethod: bundleResult.method,
        bundleWalletsProcessed: bundleKeypairs.size,
        signatures: bundleResult.signatures,
        duration,
      },
    })

  } catch (error) {
    console.error("[BUNDLE-CREATE] Error:", error)
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 5001,
          message: error instanceof Error ? error.message : "Bundle creation failed",
        },
      },
      { status: 500 }
    )
  }
}

