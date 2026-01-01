/**
 * Creator Rewards API - Fetch and claim rewards from Pump.fun bonding curve vault
 * 
 * For bonding curve tokens: Uses Pump.fun's creator vault PDA
 * For migrated tokens: Uses Raydium/Jupiter trading fees (if applicable)
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Pump.fun program ID
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")

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

    // Check if token is migrated or on bonding curve
    const { data: token } = await supabase
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
 * POST - Claim creator rewards
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { tokenMint, walletAddress } = body

    if (!tokenMint || !walletAddress) {
      return NextResponse.json(
        { success: false, error: "tokenMint and walletAddress are required" },
        { status: 400 }
      )
    }

    // Get current rewards balance
    const rewardsData = await getPumpFunCreatorRewards(tokenMint, walletAddress)

    if (rewardsData.balance <= 0) {
      return NextResponse.json({
        success: false,
        error: "No rewards available to claim. If you have Pump.fun creator rewards, please visit pump.fun to claim them directly."
      })
    }

    // For now, Pump.fun creator rewards must be claimed directly on pump.fun
    // The PumpPortal API doesn't support programmatic claiming yet
    return NextResponse.json({
      success: false,
      error: `You have ${rewardsData.balance.toFixed(6)} SOL in creator rewards. Please visit pump.fun to claim your rewards directly.`,
      data: {
        balance: rewardsData.balance,
        vaultAddress: rewardsData.vaultAddress,
        claimUrl: `https://pump.fun/coin/${tokenMint}`,
      }
    })

  } catch (error) {
    console.error("[CREATOR-REWARDS] POST error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to process claim" },
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
      const pumpResponse = await fetch(`https://frontend-api.pump.fun/coins/${tokenMint}`)
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
