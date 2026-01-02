/**
 * Creator Rewards API - Fetch and claim rewards from Pump.fun and Bonk.fun bonding curve vaults
 * 
 * Uses PumpPortal API for collectCreatorFee action
 * Supports both 'pump' and 'bonk' pools
 * Reference: https://pumpportal.fun/docs
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction, Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Program IDs
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
// Bonk.fun uses LBP (Letsbonk Protocol) which shares infrastructure with pump.fun
const BONK_PROGRAM_ID = new PublicKey("LBPPPwvAoMJZcnGgPFTT1oGVcnwHs8v3zKmAh8jd28o")
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"

// Pool types
type PoolType = 'pump' | 'bonk'

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

    // Check if token is migrated or on bonding curve, and get pool type
    const { data: token, error: tokenError } = await adminClient
      .from("tokens")
      .select("id, stage, creator_wallet, pool_type, quote_mint")
      .eq("mint_address", tokenMint)
      .single()

    const tokenData = token as { 
      id?: string; 
      stage?: string; 
      creator_wallet?: string; 
      pool_type?: string;
      quote_mint?: string;
    } | null

    // Determine pool type (pump or bonk)
    const poolType: PoolType = (tokenData?.pool_type === 'bonk' ? 'bonk' : 'pump')
    const isUsd1Token = tokenData?.quote_mint === 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'

    // Get creator vault balance from on-chain based on pool type
    const rewards = await getCreatorRewards(tokenMint, creatorWallet, poolType)
    
    // If migrated, also check for any Raydium/Meteora LP fee rewards
    let migrationRewards = 0
    const tokenStage = tokenData?.stage
    if (tokenStage === "migrated") {
      migrationRewards = await getMigratedTokenRewards(tokenMint, creatorWallet, poolType)
    }

    const totalRewards = rewards.balance + migrationRewards
    const tokenCreatorWallet = tokenData?.creator_wallet

    return NextResponse.json({
      success: true,
      data: {
        balance: totalRewards,
        pumpBalance: rewards.balance,
        migrationBalance: migrationRewards,
        vaultAddress: rewards.vaultAddress,
        hasRewards: totalRewards > 0,
        stage: tokenStage || "unknown",
        isCreator: tokenCreatorWallet === creatorWallet,
        canClaimViaPumpPortal: rewards.balance > 0 && tokenStage !== "migrated",
        // Pool info
        poolType,
        isUsd1Token,
        platformName: poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun',
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
    const { data: token, error: tokenError } = await adminClient
      .from("tokens")
      .select("id, creator_wallet, stage, pool_type, quote_mint")
      .eq("mint_address", tokenMint)
      .single()

    const tokenData = token as { 
      id?: string; 
      creator_wallet?: string; 
      stage?: string;
      pool_type?: string;
      quote_mint?: string;
    } | null

    if (!tokenData || tokenData.creator_wallet !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Only the token creator can claim rewards" },
        { status: 403 }
      )
    }

    // Determine pool type
    const poolType: PoolType = (tokenData.pool_type === 'bonk' ? 'bonk' : 'pump')
    const platformName = poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'

    // Get current rewards balance
    const rewardsData = await getCreatorRewards(tokenMint, walletAddress, poolType)

    if (rewardsData.balance <= 0) {
      return NextResponse.json({
        success: false,
        error: "No rewards available to claim"
      })
    }

    // For migrated tokens, they need to claim on the DEX directly
    if (tokenData.stage === "migrated") {
      const dexUrl = poolType === 'bonk' 
        ? `https://app.meteora.ag/pools` 
        : `https://raydium.io/liquidity/`
      
      return NextResponse.json({
        success: false,
        error: `Token has migrated. Please claim rewards from ${poolType === 'bonk' ? 'Meteora' : 'Raydium'} directly.`,
        data: {
          balance: rewardsData.balance,
          claimUrl: dexUrl,
        }
      })
    }

    // Decrypt private key
    const serviceSalt = await getOrCreateServiceSalt(adminClient)
    const walletData = wallet as { encrypted_private_key: string }
    const privateKeyBase58 = decryptPrivateKey(
      walletData.encrypted_private_key,
      sessionId,
      serviceSalt
    )
    const keypair = Keypair.fromSecretKey(bs58.decode(privateKeyBase58))

    // Call PumpPortal API for collectCreatorFee with pool parameter
    console.log(`[CREATOR-REWARDS] Requesting collectCreatorFee transaction for ${poolType} pool...`)

    const tradeBody = {
      publicKey: walletAddress,
      action: "collectCreatorFee",
      mint: tokenMint,
      priorityFee: 0.0001,
      pool: poolType, // 'pump' or 'bonk'
    }

    const pumpResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(tradeBody),
    })

    if (!pumpResponse.ok) {
      const errorText = await pumpResponse.text()
      console.error("[CREATOR-REWARDS] PumpPortal error:", errorText)
      
      // Fallback: Direct user to the appropriate platform
      const fallbackUrl = poolType === 'bonk' 
        ? `https://bonk.fun/token/${tokenMint}`
        : `https://pump.fun/coin/${tokenMint}`
      
      return NextResponse.json({
        success: false,
        error: `Unable to claim via API. Please visit ${platformName} to claim your ${rewardsData.balance.toFixed(6)} SOL rewards directly.`,
        data: {
          balance: rewardsData.balance,
          vaultAddress: rewardsData.vaultAddress,
          claimUrl: fallbackUrl,
          poolType,
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
      if (tokenData.id) {
        await adminClient.from("tide_harvest_claims").insert({
          token_id: tokenData.id,
          wallet_address: walletAddress,
          amount_sol: rewardsData.balance,
          tx_signature: signature,
          claimed_at: new Date().toISOString(),
        } as any)
      }
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
 * Fetch creator rewards from on-chain vault (Pump.fun or Bonk.fun)
 * 
 * The creator vault is a System Account PDA with seeds: ["creator-vault", creator_pubkey]
 * This vault accumulates all creator fees from ALL tokens created by the creator (not per-token)
 */
async function getCreatorRewards(
  tokenMint: string, 
  creatorWallet: string,
  poolType: PoolType = 'pump'
): Promise<{
  balance: number
  vaultAddress: string
  hasRewards: boolean
}> {
  try {
    const creatorPubkey = new PublicKey(creatorWallet)
    const programId = poolType === 'bonk' ? BONK_PROGRAM_ID : PUMP_PROGRAM_ID
    const platformName = poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'

    // ============================================================================
    // CREATOR VAULT PDA - Direct on-chain balance query
    // Based on official implementation: PDA seeds are ["creator-vault", creator_pubkey]
    // This is a System Account that holds SOL directly
    // The vault is per-creator (not per-token), accumulating fees from all tokens
    // ============================================================================
    let vaultBalance = 0
    let foundVault = ""

    try {
      const [creatorVaultPda] = PublicKey.findProgramAddressSync(
        [
          Buffer.from("creator-vault"),
          creatorPubkey.toBuffer()
        ],
        programId
      )
        
      const vaultInfo = await connection.getAccountInfo(creatorVaultPda)
        
      if (vaultInfo && vaultInfo.lamports > 0) {
        vaultBalance = vaultInfo.lamports
        foundVault = creatorVaultPda.toBase58()
        const solAmount = vaultBalance / LAMPORTS_PER_SOL
        console.log(`[CREATOR-REWARDS] ✅ ${platformName} creator vault balance: ${solAmount.toFixed(6)} SOL (${creatorVaultPda.toBase58().substring(0, 8)}...)`)
      } else {
        console.log(`[CREATOR-REWARDS] ℹ️ ${platformName} creator vault is empty or does not exist yet`)
      }
    } catch (vaultError) {
      console.warn(`[CREATOR-REWARDS] Failed to query ${platformName} creator vault:`, 
        vaultError instanceof Error ? vaultError.message : "Unknown error")
    }

    // Fallback: Try platform API to get creator balance (if available)
    try {
      const apiUrl = poolType === 'bonk'
        ? `https://api.bonk.fun/coins/${tokenMint}`
        : `https://frontend-api.pump.fun/coins/${tokenMint}`
      
      const response = await fetch(apiUrl, {
        headers: { "Accept": "application/json" }
      })
      if (response.ok) {
        const data = await response.json()
        if (data.creator_balance_sol) {
          const creatorBal = parseFloat(data.creator_balance_sol)
          // Use API value if it's higher (more accurate) or if on-chain query failed
          if (creatorBal > vaultBalance / LAMPORTS_PER_SOL || vaultBalance === 0) {
            vaultBalance = creatorBal * LAMPORTS_PER_SOL
            console.log(`[CREATOR-REWARDS] Using ${platformName} API balance: ${creatorBal.toFixed(6)} SOL`)
          }
        }
      }
    } catch (e) {
      console.debug(`[CREATOR-REWARDS] ${platformName} API unavailable:`, e)
    }

    return {
      balance: vaultBalance / LAMPORTS_PER_SOL,
      vaultAddress: foundVault,
      hasRewards: vaultBalance > 0,
    }
  } catch (error) {
    console.error(`[CREATOR-REWARDS] ${poolType} fetch error:`, error)
    return { balance: 0, vaultAddress: "", hasRewards: false }
  }
}

/**
 * Get rewards for migrated tokens (from Raydium/Meteora LP fees etc)
 */
async function getMigratedTokenRewards(
  tokenMint: string,
  creatorWallet: string,
  poolType: PoolType = 'pump'
): Promise<number> {
  try {
    // For migrated tokens, check if there are any LP rewards
    // Pump.fun tokens migrate to Raydium
    // Bonk.fun tokens migrate to Meteora
    
    // Future: Integrate with Raydium/Meteora API to check LP fee accumulation
    // For now, we return 0 as this requires more complex integration
    return 0
  } catch (error) {
    console.error(`[CREATOR-REWARDS] ${poolType} migration rewards fetch error:`, error)
    return 0
  }
}
