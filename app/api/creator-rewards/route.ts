/**
 * Creator Rewards API - Fetch and claim rewards from Pump.fun, Bonk.fun, and Jupiter DBC pools
 * 
 * Supports:
 * - Pump.fun: Creator vault PDA (per-creator, accumulates all tokens)
 * - Bonk.fun: Creator vault PDA (per-creator, accumulates all tokens)
 * - Jupiter: DBC pool fees (per-token, each token has its own pool)
 * 
 * Reference: https://pumpportal.fun/docs, https://dev.jup.ag
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL, VersionedTransaction, Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { getAdminClient } from "@/lib/supabase/admin"
import { decryptPrivateKey, getOrCreateServiceSalt } from "@/lib/crypto"
import { getJupiterFeeInfo, claimJupiterFees } from "@/lib/blockchain"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// Program IDs
const PUMP_PROGRAM_ID = new PublicKey("6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P")
// Bonk.fun uses LBP (Letsbonk Protocol) which shares infrastructure with pump.fun
const BONK_PROGRAM_ID = new PublicKey("LBPPPwvAoMJZcnGgPFTT1oGVcnwHs8v3zKmAh8jd28o")
const PUMPPORTAL_LOCAL_TRADE = "https://pumpportal.fun/api/trade-local"

// Pool types
type PoolType = 'pump' | 'bonk' | 'jupiter'

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
      .select("id, stage, creator_wallet, pool_type, quote_mint, dbc_pool_address")
      .eq("mint_address", tokenMint)
      .single()

    const tokenData = token as { 
      id?: string; 
      stage?: string; 
      creator_wallet?: string; 
      pool_type?: string;
      quote_mint?: string;
      dbc_pool_address?: string;
    } | null

    // Determine pool type (pump, bonk, or jupiter)
    let poolType: PoolType = 'pump'
    if (tokenData?.pool_type === 'bonk') {
      poolType = 'bonk'
    } else if (tokenData?.pool_type === 'jupiter') {
      poolType = 'jupiter'
    }
    
    const isUsd1Token = tokenData?.quote_mint === 'USD1ttGY1N17NEEHLmELoaybftRBUSErhqYiQzvEmuB'
    const dbcPoolAddress = tokenData?.dbc_pool_address

    let rewards: { balance: number; vaultAddress: string; hasRewards: boolean }
    let platformName: string

    // Jupiter tokens use DBC pool fees (per-token)
    if (poolType === 'jupiter' && dbcPoolAddress) {
      rewards = await getJupiterCreatorRewards(dbcPoolAddress)
      platformName = 'Jupiter'
    } else {
      // Pump.fun and Bonk.fun use creator vault (per-creator, accumulates all tokens)
      const pumpPoolType = poolType === 'bonk' ? 'bonk' : 'pump'
      rewards = await getCreatorRewards(tokenMint, creatorWallet, pumpPoolType)
      platformName = poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'
    }
    
    // If migrated, also check for any Raydium/Meteora LP fee rewards
    let migrationRewards = 0
    const tokenStage = tokenData?.stage
    if (tokenStage === "migrated" && poolType !== 'jupiter') {
      migrationRewards = await getMigratedTokenRewards(tokenMint, creatorWallet, poolType)
    }

    const totalRewards = rewards.balance + migrationRewards
    const tokenCreatorWallet = tokenData?.creator_wallet

    return NextResponse.json({
      success: true,
      data: {
        balance: totalRewards,
        pumpBalance: poolType !== 'jupiter' ? rewards.balance : 0,
        jupiterBalance: poolType === 'jupiter' ? rewards.balance : 0,
        migrationBalance: migrationRewards,
        vaultAddress: rewards.vaultAddress,
        hasRewards: totalRewards > 0,
        stage: tokenStage || "unknown",
        isCreator: tokenCreatorWallet === creatorWallet,
        canClaimViaPumpPortal: poolType !== 'jupiter' && rewards.balance > 0 && tokenStage !== "migrated",
        canClaimViaJupiter: poolType === 'jupiter' && rewards.balance > 0,
        // Pool info
        poolType,
        isUsd1Token,
        platformName,
        dbcPoolAddress,
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
 * POST - Claim creator rewards using PumpPortal API or Jupiter API
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
      .select("id, creator_wallet, stage, pool_type, quote_mint, dbc_pool_address")
      .eq("mint_address", tokenMint)
      .single()

    const tokenData = token as { 
      id?: string; 
      creator_wallet?: string; 
      stage?: string;
      pool_type?: string;
      quote_mint?: string;
      dbc_pool_address?: string;
    } | null

    if (!tokenData || tokenData.creator_wallet !== walletAddress) {
      return NextResponse.json(
        { success: false, error: "Only the token creator can claim rewards" },
        { status: 403 }
      )
    }

    // Determine pool type
    let poolType: PoolType = 'pump'
    if (tokenData.pool_type === 'bonk') {
      poolType = 'bonk'
    } else if (tokenData.pool_type === 'jupiter') {
      poolType = 'jupiter'
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

    // ============================================================================
    // JUPITER DBC POOL CLAIM
    // ============================================================================
    if (poolType === 'jupiter') {
      const dbcPoolAddress = tokenData.dbc_pool_address
      
      if (!dbcPoolAddress) {
        return NextResponse.json({
          success: false,
          error: "Jupiter DBC pool address not found for this token"
        })
      }

      // Get current rewards balance
      const rewardsData = await getJupiterCreatorRewards(dbcPoolAddress)

      if (rewardsData.balance <= 0) {
        return NextResponse.json({
          success: false,
          error: "No Jupiter fees available to claim"
        })
      }

      console.log(`[CREATOR-REWARDS] Claiming Jupiter DBC fees from pool: ${dbcPoolAddress}`)

      // Use Jupiter API to claim fees
      const claimResult = await claimJupiterFees(connection, keypair, dbcPoolAddress)

      if (!claimResult.success) {
        return NextResponse.json({
          success: false,
          error: claimResult.error || "Failed to claim Jupiter fees",
          data: {
            balance: rewardsData.balance,
            dbcPoolAddress,
          }
        })
      }

      // Record the claim in database
      try {
        if (tokenData.id) {
          await adminClient.from("tide_harvest_claims").insert({
            token_id: tokenData.id,
            wallet_address: walletAddress,
            amount_sol: rewardsData.balance,
            tx_signature: claimResult.txSignature,
            claimed_at: new Date().toISOString(),
          } as any)
        }
      } catch (dbError) {
        console.warn("[CREATOR-REWARDS] Failed to record claim:", dbError)
      }

      return NextResponse.json({
        success: true,
        data: {
          signature: claimResult.txSignature,
          amountClaimed: rewardsData.balance,
          explorerUrl: `https://solscan.io/tx/${claimResult.txSignature}`,
          platformName: 'Jupiter',
        }
      })
    }

    // ============================================================================
    // PUMP.FUN / BONK.FUN CLAIM
    // ============================================================================
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
        platformName,
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
 * Fetch creator rewards from Jupiter DBC pool (per-token)
 * 
 * Jupiter tokens use a different fee structure - each token has its own DBC pool
 * that accumulates fees from trades on that specific token.
 */
async function getJupiterCreatorRewards(
  dbcPoolAddress: string
): Promise<{
  balance: number
  vaultAddress: string
  hasRewards: boolean
}> {
  try {
    console.log(`[CREATOR-REWARDS] Fetching Jupiter DBC fees for pool: ${dbcPoolAddress}`)
    
    const feeInfo = await getJupiterFeeInfo(dbcPoolAddress)
    
    const unclaimedSol = feeInfo.unclaimedFees / LAMPORTS_PER_SOL
    
    console.log(`[CREATOR-REWARDS] ✅ Jupiter DBC unclaimed fees: ${unclaimedSol.toFixed(6)} SOL`)
    
    return {
      balance: unclaimedSol,
      vaultAddress: dbcPoolAddress,
      hasRewards: unclaimedSol > 0,
    }
  } catch (error) {
    console.error("[CREATOR-REWARDS] Jupiter fee fetch error:", error)
    return { balance: 0, vaultAddress: dbcPoolAddress, hasRewards: false }
  }
}

/**
 * Fetch creator rewards using PumpPortal preview (most accurate method)
 * 
 * This method calls PumpPortal API with collectCreatorFee action to get a preview
 * transaction, then parses it to extract the actual claimable amount.
 * 
 * For Pump.fun: Uses per-token fee account PDA ["creator_fee", creator, mint]
 * For Bonk.fun: Similar structure
 */
async function getCreatorRewards(
  tokenMint: string, 
  creatorWallet: string,
  poolType: 'pump' | 'bonk' = 'pump'
): Promise<{
  balance: number
  vaultAddress: string
  hasRewards: boolean
}> {
  try {
    const creatorPubkey = new PublicKey(creatorWallet)
    const mintPubkey = new PublicKey(tokenMint)
    const programId = poolType === 'bonk' ? BONK_PROGRAM_ID : PUMP_PROGRAM_ID
    const platformName = poolType === 'bonk' ? 'Bonk.fun' : 'Pump.fun'

    let claimableBalance = 0
    let feeAccountAddress = ""

    // ============================================================================
    // METHOD 1: PumpPortal Preview (Most Accurate)
    // Call the API with collectCreatorFee to get a preview of claimable amount
    // ============================================================================
    try {
      console.log(`[CREATOR-REWARDS] Previewing ${platformName} fees for token ${tokenMint.slice(0, 8)}...`)
      
      const previewResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          publicKey: creatorWallet,
          action: "collectCreatorFee",
          mint: tokenMint,
          priorityFee: 0.00001,
          pool: poolType,
        }),
      })

      if (previewResponse.ok) {
        const txBytes = new Uint8Array(await previewResponse.arrayBuffer())
        
        if (txBytes.length > 0) {
          // Parse the transaction to extract transfer amount
          const tx = VersionedTransaction.deserialize(txBytes)
          const lamports = extractTransferAmount(tx, creatorPubkey)
          
          if (lamports > 0) {
            claimableBalance = lamports
            console.log(`[CREATOR-REWARDS] ✅ ${platformName} preview: ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL claimable`)
          } else {
            console.log(`[CREATOR-REWARDS] ℹ️ ${platformName} preview: No claimable fees in transaction`)
          }
        } else {
          console.log(`[CREATOR-REWARDS] ℹ️ ${platformName} returned empty response (no fees)`)
        }
      } else {
        const errorText = await previewResponse.text()
        // Check for known "no fees" responses
        if (errorText.includes("no fees") || errorText.includes("nothing to claim") || errorText.includes("not found")) {
          console.log(`[CREATOR-REWARDS] ℹ️ ${platformName}: No fees to claim for this token`)
        } else {
          console.warn(`[CREATOR-REWARDS] ${platformName} preview failed:`, errorText.slice(0, 100))
        }
      }
    } catch (previewError) {
      console.warn(`[CREATOR-REWARDS] ${platformName} preview error:`, 
        previewError instanceof Error ? previewError.message : "Unknown error")
    }

    // ============================================================================
    // METHOD 2: On-chain fee account check (fallback/diagnostic)
    // Fee account PDA: ["creator_fee", creator_pubkey, mint]
    // ============================================================================
    if (claimableBalance === 0) {
      try {
        const [feeAccountPda] = PublicKey.findProgramAddressSync(
          [
            Buffer.from("creator_fee"),
            creatorPubkey.toBuffer(),
            mintPubkey.toBuffer()
          ],
          programId
        )
        
        feeAccountAddress = feeAccountPda.toBase58()
        const accountInfo = await connection.getAccountInfo(feeAccountPda)
        
        if (accountInfo && accountInfo.lamports > 0) {
          // Fee account has balance - but this might not all be claimable
          // The PumpPortal preview is more accurate
          const solAmount = accountInfo.lamports / LAMPORTS_PER_SOL
          console.log(`[CREATOR-REWARDS] ℹ️ ${platformName} fee account has ${solAmount.toFixed(6)} SOL (on-chain check)`)
          
          // Only use this if preview failed completely
          if (claimableBalance === 0) {
            claimableBalance = accountInfo.lamports
          }
        } else {
          console.log(`[CREATOR-REWARDS] ℹ️ ${platformName} fee account not found or empty`)
        }
      } catch (onChainError) {
        console.debug(`[CREATOR-REWARDS] On-chain check failed:`, onChainError)
      }
    }

    // ============================================================================
    // METHOD 3: Platform API fallback
    // ============================================================================
    if (claimableBalance === 0) {
      try {
        const apiUrl = poolType === 'bonk'
          ? `https://api.bonk.fun/coins/${tokenMint}`
          : `https://frontend-api.pump.fun/coins/${tokenMint}`
        
        const response = await fetch(apiUrl, {
          headers: { "Accept": "application/json" },
          signal: AbortSignal.timeout(5000)
        })
        
        if (response.ok) {
          const data = await response.json()
          // Check if this creator matches and has balance
          if (data.creator === creatorWallet && data.creator_balance_sol) {
            const creatorBal = parseFloat(data.creator_balance_sol)
            if (creatorBal > 0) {
              claimableBalance = creatorBal * LAMPORTS_PER_SOL
              console.log(`[CREATOR-REWARDS] Using ${platformName} API: ${creatorBal.toFixed(6)} SOL`)
            }
          }
        }
      } catch (e) {
        console.debug(`[CREATOR-REWARDS] ${platformName} API unavailable`)
      }
    }

    return {
      balance: claimableBalance / LAMPORTS_PER_SOL,
      vaultAddress: feeAccountAddress,
      hasRewards: claimableBalance > 0,
    }
  } catch (error) {
    console.error(`[CREATOR-REWARDS] ${poolType} fetch error:`, error)
    return { balance: 0, vaultAddress: "", hasRewards: false }
  }
}

/**
 * Extract transfer amount from a VersionedTransaction
 * Looks for SystemProgram transfers to the destination
 */
function extractTransferAmount(tx: VersionedTransaction, destination: PublicKey): number {
  try {
    const message = tx.message
    const accountKeys = message.staticAccountKeys
    
    // Find destination account index
    const destIndex = accountKeys.findIndex(key => key.equals(destination))
    if (destIndex === -1) return 0
    
    let totalLamports = 0
    
    // Parse compiled instructions
    for (const ix of message.compiledInstructions) {
      // Check if this is a SystemProgram instruction (program index 0 is usually system)
      const programKey = accountKeys[ix.programIdIndex]
      if (!programKey) continue
      
      // SystemProgram ID
      const SYSTEM_PROGRAM = new PublicKey("11111111111111111111111111111111")
      if (!programKey.equals(SYSTEM_PROGRAM)) continue
      
      // SystemProgram Transfer instruction has discriminator 2
      const data = ix.data
      if (data.length >= 12 && data[0] === 2) {
        // Transfer instruction: [discriminator(4), lamports(8)]
        // Read as little-endian u64
        const lamportsBuffer = data.slice(4, 12)
        const dataView = new DataView(new Uint8Array(lamportsBuffer).buffer)
        // Read as two 32-bit values and combine (for compatibility)
        const low = dataView.getUint32(0, true)
        const high = dataView.getUint32(4, true)
        const lamports = low + (high * 4294967296) // 2^32
        
        // Check if destination is in the accounts for this instruction
        const destAccountIdx = ix.accountKeyIndexes.indexOf(destIndex)
        if (destAccountIdx === 1) { // Transfer: [from, to]
          totalLamports += lamports
        }
      }
    }
    
    return totalLamports
  } catch (error) {
    console.error("[CREATOR-REWARDS] Error extracting transfer amount:", error)
    return 0
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
