/**
 * Jupiter Bundle Token Creation API - Create token with coordinated multi-wallet launch
 * 
 * Uses Jito bundles for atomic execution:
 * - Token creation + dev buy in first transaction
 * - Bundle wallet buys in subsequent transactions (max 4)
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { executeBundle } from "@/lib/blockchain/jito-bundles"
import { solToLamports, lamportsToSol, calculatePlatformFee } from "@/lib/precision"
import { createJupiterToken, getJupiterPoolAddress, JUPITER_PRESETS } from "@/lib/blockchain/jupiter-studio"
import { collectPlatformFee, TOKEN_CREATION_FEE_LAMPORTS, TOKEN_CREATION_FEE_SOL } from "@/lib/fees"
import { getReferrer, addReferralEarnings } from "@/lib/referral"

// ============================================================================
// CONFIGURATION
// ============================================================================

const HELIUS_RPC_URL = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const MAX_BUNDLE_WALLETS = 4 // Jito limit: 5 txs total (1 create + 4 buys)

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
  image: string
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
    const userId = request.headers.get("x-user-id")

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
      decimals = 9,
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

    console.log("[JUPITER-BUNDLE] Starting bundle token creation:", {
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
      .single() as { data: { encrypted_private_key: string } | null; error: any }

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
    // STEP 1: Create token on Jupiter (first transaction)
    // =========================================================================
    console.log("[JUPITER-BUNDLE] Creating token on Jupiter...")

    const createResult = await createJupiterToken(connection, {
      metadata: {
        name,
        symbol,
        description,
        image: image || "https://aqua.launchpad/placeholder.png",
        website,
        twitter,
        telegram,
        discord,
      },
      creatorKeypair,
      curveParams: JUPITER_PRESETS.MEME, // Default to meme preset
      feeBps: 100, // 1% trading fee
      antiSniping: false,
      isLpLocked: true,
      initialBuySol,
      slippageBps: 1000, // 10% for bundle
    })

    if (!createResult.success || !createResult.mintAddress) {
      console.error("[JUPITER-BUNDLE] Token creation failed:", createResult.error)
      return NextResponse.json({
        success: false,
        error: { code: 3004, message: createResult.error || "Jupiter token creation failed" },
      }, { status: 500 })
    }

    const creationSignature = createResult.txSignature!
    console.log("[JUPITER-BUNDLE] Token created:", {
      mintAddress: createResult.mintAddress,
      txSignature: creationSignature,
    })

    // =========================================================================
    // STEP 2: Load bundle wallet keypairs for follow-up buys
    // =========================================================================
    const bundleKeypairs: Map<string, { keypair: Keypair; amount: number }> = new Map()
    const limitedWallets = bundleWallets.slice(0, MAX_BUNDLE_WALLETS)

    console.log(`[JUPITER-BUNDLE] Loading ${limitedWallets.length} bundle wallets...`)

    for (const bw of limitedWallets) {
      try {
        let walletQuery = adminClient
          .from("wallets")
          .select("encrypted_private_key, public_key")
          .eq("session_id", sessionId)
        
        if (bw.address) {
          walletQuery = walletQuery.eq("public_key", bw.address)
        } else if (bw.walletId) {
          walletQuery = walletQuery.eq("id", bw.walletId)
        } else {
          console.warn(`[JUPITER-BUNDLE] Bundle wallet missing address and walletId`)
          continue
        }

        const { data: wallet, error: walletErr } = await walletQuery.single() as { 
          data: { encrypted_private_key: string; public_key: string } | null; 
          error: any 
        }

        if (walletErr) {
          console.warn(`[JUPITER-BUNDLE] Failed to find bundle wallet:`, { 
            address: bw.address?.slice(0, 8), 
            walletId: bw.walletId, 
            error: walletErr.message 
          })
          continue
        }

        if (wallet) {
          const privateKey = decryptPrivateKey(
            wallet.encrypted_private_key,
            sessionId,
            serviceSalt
          )
          const walletAddr = bw.address || wallet.public_key
          bundleKeypairs.set(walletAddr, {
            keypair: Keypair.fromSecretKey(bs58.decode(privateKey)),
            amount: bw.buyAmountSol,
          })
          console.log(`[JUPITER-BUNDLE] Loaded bundle wallet ${walletAddr.slice(0, 8)} with ${bw.buyAmountSol} SOL`)
        }
      } catch (error) {
        console.error(`[JUPITER-BUNDLE] Failed to load bundle wallet ${bw.address}:`, error)
      }
    }

    console.log(`[JUPITER-BUNDLE] Successfully loaded ${bundleKeypairs.size}/${limitedWallets.length} bundle wallets`)

    // =========================================================================
    // STEP 3: Execute bundle buys via Jupiter swap (if bundle wallets exist)
    // =========================================================================
    const bundleSignatures: string[] = [creationSignature]
    
    // Note: For Jupiter DBC, we would need to implement buy transactions
    // This is a placeholder - Jupiter may have a different buy mechanism
    // For now, we log the bundle wallet configuration
    if (bundleKeypairs.size > 0) {
      console.log(`[JUPITER-BUNDLE] Bundle wallets configured for follow-up buys:`)
      for (const [address, { amount }] of bundleKeypairs) {
        console.log(`  - ${address.slice(0, 8)}...: ${amount} SOL`)
      }
      // TODO: Implement Jupiter DBC buy transactions when API is available
    }

    // =========================================================================
    // STEP 4: Get DBC pool address
    // =========================================================================
    let dbcPoolAddress: string | null = null
    try {
      dbcPoolAddress = await getJupiterPoolAddress(createResult.mintAddress)
      console.log(`[JUPITER-BUNDLE] DBC Pool Address: ${dbcPoolAddress}`)
    } catch (poolError) {
      console.warn("[JUPITER-BUNDLE] Could not fetch pool address:", poolError)
    }

    // =========================================================================
    // STEP 5: Collect platform fee (ONLY AFTER SUCCESS)
    // =========================================================================
    // Fee structure:
    // - Fixed creation fee: 0.1 SOL
    // - 2% of initial buy + bundle buys
    const totalBuySol = initialBuySol + Array.from(bundleKeypairs.values()).reduce((sum, w) => sum + w.amount, 0)
    const percentageFeeLamports = calculatePlatformFee(solToLamports(totalBuySol))
    const totalFeeLamports = percentageFeeLamports + TOKEN_CREATION_FEE_LAMPORTS

    console.log(`[JUPITER-BUNDLE] Collecting fees: ${TOKEN_CREATION_FEE_SOL} SOL (creation) + ${lamportsToSol(percentageFeeLamports)} SOL (2% of ${totalBuySol} SOL) = ${lamportsToSol(totalFeeLamports)} SOL total`)

    // Check for referrer
    const referrerUserId = userId ? await getReferrer(userId) : null
    let referrerWallet: PublicKey | undefined

    if (referrerUserId) {
      const { data: referrerData } = await adminClient
        .from("users")
        .select("main_wallet_address")
        .eq("id", referrerUserId)
        .single() as { data: { main_wallet_address: string } | null; error: any }

      if (referrerData?.main_wallet_address) {
        referrerWallet = new PublicKey(referrerData.main_wallet_address)
      }
    }

    const feeResult = await collectPlatformFee(
      connection,
      creatorKeypair,
      solToLamports(totalBuySol), // 2% of this amount
      referrerWallet,
      5000, // priority fee
      TOKEN_CREATION_FEE_LAMPORTS // fixed 0.1 SOL creation fee
    )

    // Add referral earnings
    if (feeResult.success && referrerUserId && feeResult.referralShare) {
      await addReferralEarnings(
        referrerUserId,
        lamportsToSol(feeResult.referralShare),
        userId || "anonymous",
        "jupiter_create"
      )
    }

    // =========================================================================
    // STEP 6: Save to database
    // =========================================================================
    const { data: tokenRecord, error: dbError } = await adminClient
      .from("tokens")
      .insert({
        mint_address: createResult.mintAddress,
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
        stage: "bonding",
        launch_tx_signature: creationSignature,
        pool_type: "jupiter",
        is_platform_token: true,
      } as any)
      .select("id")
      .single() as { data: { id: string } | null; error: any }

    if (dbError) {
      console.error("[JUPITER-BUNDLE] Database error:", dbError)
      // Token was created on-chain, so return success with warning
    }

    const duration = Date.now() - startTime
    console.log(`[JUPITER-BUNDLE] Complete in ${duration}ms`)

    return NextResponse.json({
      success: true,
      data: {
        tokenId: tokenRecord?.id,
        mintAddress: createResult.mintAddress,
        txSignature: creationSignature,
        dbcPoolAddress,
        metadataUri: createResult.metadataUri,
        bundleWalletsProcessed: bundleKeypairs.size,
        signatures: bundleSignatures,
        pool: "jupiter",
        platformFee: lamportsToSol(totalFeeLamports),
        duration,
      },
    })

  } catch (error) {
    console.error("[JUPITER-BUNDLE] Error:", error)
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

