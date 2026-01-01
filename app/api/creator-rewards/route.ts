/**
 * Creator Rewards API - Fetch and claim rewards from Pump.fun bonding curve vault
 * 
 * Uses PumpPortal API for collectCreatorFee action
 * Reference: https://pumpportal.fun/docs
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction, Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Pump.fun program ID
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"

/**
 * GET - Check creator rewards balance for a token
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenMint = searchParams.get("tokenMint")
    const creatorWallet = searchParams.get("creatorWallet")

    if (!tokenMint || !creatorWallet) {
      return NextResponse.json(
        { success: false, error: "tokenMint and creatorWallet are required" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Check if token is migrated or on bonding curve
    const { data: token } = await adminClient
      .from("tokens")
      .select("id, stage, creator_wallet")
      .eq("mint_address", tokenMint)
      .single()

    // Get creator vault balance from on-chain (Pump.fun)
    const pumpRewards = await getPumpFunCreatorRewards(tokenMint, creatorWallet)
    
    // If migrated, also check for any Raydium/LP fee rewards
    let migrationRewards = 0
    if (token?.stage === "migrated") {
      migrationRewards = await getMigratedTokenRewards(tokenMint, creatorWallet)
    }

    const totalRewards = pumpRewards.balance + migrationRewards

    return NextResponse.json({
      success: true,
      data: {
        balance: totalRewards,
        pumpBalance: pumpRewards.balance,
        migrationBalance: migrationRewards,
        vaultAddress: pumpRewards.vaultAddress,
        hasRewards: totalRewards > 0,
        stage: token?.stage || "unknown",
        isCreator: token?.creator_wallet === creatorWallet,
        canClaimViaPumpPortal: pumpRewards.balance > 0 && token?.stage !== "migrated",
      }
    })
  } catch (error) {
    console.error("[CREATOR-REWARDS] GET error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to fetch creator rewards" },
      { status: 500 }
    )
  }
}

/**
 * POST - Claim creator rewards using PumpPortal API
 */
export async function POST(request: NextRequest) {
  try {
    const sessionId = request.headers.get("x-session-id")
    const userId = request.headers.get("x-user-id")
    
    if (!sessionId) {
      return NextResponse.json(
        { success: false, error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { tokenMint, walletAddress } = body

    if (!tokenMint || !walletAddress) {
      return NextResponse.json(
        { success: false, error: "tokenMint and walletAddress are required" },
        { status: 400 }
      )
    }

    const adminClient = getAdminClient()

    // Verify this wallet belongs to the user
    const { data: wallet, error: walletError } = await adminClient
      .from("wallets")
      .select("encrypted_private_key")
      .eq("session_id", sessionId)
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: "Wallet not found or unauthorized" },
        { status: 403 }
      )
    }

    // Verify this is the token creator
    const { data: token } = await adminClient
      .from("tokens")
      .select("id, creator_wallet, stage")
      .eq("mint_address", tokenMint)
      .single()

    if (!token || token.creator_wallet !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Only the token creator can claim rewards" },
        { status: 403 }
      )
    }

    // Get current rewards balance
    const rewardsData = await getPumpFunCreatorRewards(tokenMint, walletAddress)

    if (rewardsData.balance <= 0) {
      return NextResponse.json({
        success: false,
        error: "No rewards available to claim"
      })
    }

    // For migrated tokens, they need to claim on the DEX directly
    if (token.stage === "migrated") {
      return NextResponse.json({
        success: false,
        error: "Token has migrated. Please claim rewards from the DEX directly.",
        data: {
          balance: rewardsData.balance,
          claimUrl: `https://raydium.io/liquidity/`,
        }
      })
    }

    // Decrypt private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient)
    const privateKeyBase58 = decryptPrivateKey(
      wallet.encrypted_private_key,
      sessionId,
      serviceSalt
    )
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))

    // Call PumpPortal API for collectCreatorFee
    console.log("[CREATOR-REWARDS] Requesting collectCreatorFee transaction...")

    const tradeBody = {
      publicKey: walletAddress,
      action: "collectCreatorFee",
      mint: tokenMint,
      priorityFee: 0.0001,
    }

    const pumpResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tradeBody),
    })

    if (!pumpResponse.ok) {
      const errorText = await pumpResponse.text()
      console.error("[CREATOR-REWARDS] PumpPortal error:", errorText)
      
      // Fallback: Direct user to Pump.fun
      return NextResponse.json({
        success: false,
        error: `Unable to claim via API. Please visit pump.fun to claim your ${rewardsData.balance.toFixed(6)} SOL rewards directly.`,
        data: {
          balance: rewardsData.balance,
          vaultAddress: rewardsData.vaultAddress,
          claimUrl: `https://pump.fun/coin/${tokenMint}`,
        }
      })
    }

    // Deserialize and sign the transaction
    const txBytes = new Uint8Array(await pumpResponse.arrayBuffer())
    const tx = VersionedTransaction.deserialize(txBytes)
    tx.sign([keypair])

    // Send to RPC
    console.log("[CREATOR-REWARDS] Submitting claim transaction...")
    const signature = await connection.sendTransaction(tx, {
      skipPreflight: false,
      maxRetries: 3,
    })

    // Confirm transaction
    const confirmation = await connection.confirmTransaction(signature, "confirmed")
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
    }

    console.log("[CREATOR-REWARDS] Claim successful:", signature)

    // Record the claim in database
    try {
      await adminClient.from("tide_harvest_claims").insert({
        token_id: token.id,
        wallet_address: walletAddress,
        amount_sol: rewardsData.balance,
        tx_signature: signature,
        claimed_at: new Date().toISOString(),
      })
    } catch (dbError) {
      console.warn("[CREATOR-REWARDS] Failed to record claim:", dbError)
    }

    return NextResponse.json({
      success: true,
      data: {
        signature,
        amountClaimed: rewardsData.balance,
        explorerUrl: `https://solscan.io/tx/${signature}`,
      }
    })

  } catch (error) {
    console.error("[CREATOR-REWARDS] POST error:", error)
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to process claim" 
      },
      { status: 500 }
    )
  }
}

/**
 * Fetch Pump.fun creator rewards from on-chain vault
 */
async function getPumpFunCreatorRewards(
  tokenMint: string, 
  creatorWallet: string
): Promise<{
  balance: number
  vaultAddress: string
  hasRewards: boolean
}> {
  try {
    const mintPubkey = new PublicKey(tokenMint)
    const creatorPubkey = new PublicKey(creatorWallet)

    // Pump.fun uses a bonding curve PDA that holds creator fees
    // Try multiple known PDA patterns

    const pdaPatterns = [
      // Pattern 1: Pump.fun bonding curve with mint seed
      ["bonding-curve", mintPubkey.toBuffer()],
      // Pattern 2: Creator vault with mint and creator seeds
      ["creator-vault", mintPubkey.toBuffer(), creatorPubkey.toBuffer()],
      // Pattern 3: Fee vault with mint seed
      ["fee-vault", mintPubkey.toBuffer()],
      // Pattern 4: Creator with creator pubkey
      ["creator", creatorPubkey.toBuffer()],
    ]

    let totalBalance = 0
    let foundVault = ""

    for (const seeds of pdaPatterns) {
      try {
        const [pda] = PublicKey.findProgramAddressSync(
          seeds.map(s => typeof s === "string" ? Buffer.from(s) : s),
          PUMP_PROGRAM_ID
        )
        
        const balance = await connection.getBalance(pda)
        
        if (balance > 0) {
          console.log(`[CREATOR-REWARDS] Found vault at ${pda.toBase58()}: ${balance / LAMPORTS_PER_SOL} SOL`)
          totalBalance += balance
          if (!foundVault) foundVault = pda.toBase58()
        }
      } catch {
        // Invalid PDA, skip
      }
    }

    // Also try to get bonding curve account data using Pump.fun's API
    try {
      const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`, {
        headers: { "Accept": "application/json" }
      })
      if (pumpResponse.ok) {
        const pumpData = await pumpResponse.json()
        if (pumpData.creator_balance_sol) {
          const creatorBal = parseFloat(pumpData.creator_balance_sol)
          if (creatorBal > totalBalance / LAMPORTS_PER_SOL) {
            totalBalance = creatorBal * LAMPORTS_PER_SOL
          }
        }
        if (pumpData.bonding_curve) {
          foundVault = pumpData.bonding_curve
        }
      }
    } catch (e) {
      console.debug("[CREATOR-REWARDS] Pump.fun API unavailable:", e)
    }

    return {
      balance: totalBalance / LAMPORTS_PER_SOL,
      vaultAddress: foundVault,
      hasRewards: totalBalance > 0,
    }
  } catch (error) {
    console.error("[CREATOR-REWARDS] Pump.fun fetch error:", error)
    return { balance: 0, vaultAddress: "", hasRewards: false }
  }
}

/**
 * Get rewards for migrated tokens (from Raydium LP fees etc)
 */
async function getMigratedTokenRewards(
  tokenMint: string,
  creatorWallet: string
): Promise<number> {
  try {
    // For migrated tokens, check if there are any LP rewards
    // This would typically involve checking Raydium/Orca LP positions
    // For now, we return 0 as this requires more complex integration
    
    // Future: Integrate with Raydium API to check LP fee accumulation
    return 0
  } catch (error) {
    console.error("[CREATOR-REWARDS] Migration rewards fetch error:", error)
    return 0
  }
}
