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
import { 
  Connection, 
  PublicKey, 
  LAMPORTS_PER_SOL, 
  VersionedTransaction, 
  Keypair,
  SystemProgram,
  SystemInstruction,
  TransactionInstruction,
} from "@solana/web3.js"
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

    console.log(`[CREATOR-REWARDS] Token ${tokenMint.slice(0, 8)}... pool_type=${poolType}, dbc_pool=${dbcPoolAddress || 'none'}`)

    let rewards: { balance: number; vaultAddress: string; hasRewards: boolean }
    let platformName: string

    // Jupiter tokens use DBC pool fees (per-token)
    if (poolType === 'jupiter') {
      if (dbcPoolAddress) {
        rewards = await getJupiterCreatorRewards(dbcPoolAddress)
        platformName = 'Jupiter'
      } else {
        // Jupiter token without DBC pool address - try to fetch it
        console.log(`[CREATOR-REWARDS] Jupiter token missing dbc_pool_address, attempting to fetch...`)
        try {
          const { getJupiterPoolAddress } = await import("@/lib/blockchain")
          const fetchedPoolAddress = await getJupiterPoolAddress(tokenMint)
          if (fetchedPoolAddress) {
            console.log(`[CREATOR-REWARDS] Fetched Jupiter pool address: ${fetchedPoolAddress}`)
            rewards = await getJupiterCreatorRewards(fetchedPoolAddress)
            platformName = 'Jupiter'
            
            // Update the database with the pool address for next time
            try {
              const updateData: Record<string, string> = { dbc_pool_address: fetchedPoolAddress }
              await (adminClient.from("tokens") as any).update(updateData).eq("mint_address", tokenMint)
              console.log(`[CREATOR-REWARDS] Updated dbc_pool_address in database`)
            } catch (updateErr) {
              console.warn(`[CREATOR-REWARDS] Failed to update dbc_pool_address:`, updateErr)
            }
          } else {
            // No Jupiter pool found, return empty
            rewards = { balance: 0, vaultAddress: '', hasRewards: false }
            platformName = 'Jupiter'
          }
        } catch (fetchErr) {
          console.warn(`[CREATOR-REWARDS] Failed to fetch Jupiter pool:`, fetchErr)
          rewards = { balance: 0, vaultAddress: '', hasRewards: false }
          platformName = 'Jupiter'
        }
      }
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

    if (!tokenData) {
      return NextResponse.json(
        { success: false, error: "Token not found in database" },
        { status: 404 }
      )
    }
    
    // Check if wallet is the creator
    const isCreator = tokenData.creator_wallet?.toLowerCase() === walletAddress.toLowerCase()
    console.log(`[CREATOR-REWARDS] Claim check: wallet=${walletAddress.slice(0, 8)}... creator=${tokenData.creator_wallet?.slice(0, 8)}... match=${isCreator}`)
    
    if (!isCreator) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Only the token creator can claim rewards",
          debug: {
            providedWallet: walletAddress,
            creatorWallet: tokenData.creator_wallet,
          }
        },
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

    // For migrated tokens, try Meteora DBC pool claim via PumpPortal
    // Pump.fun tokens migrate to Raydium but fees may still be claimable via meteora-dbc
    if (tokenData.stage === "migrated" && poolType === 'pump') {
      console.log(`[CREATOR-REWARDS] Token is migrated, trying meteora-dbc pool...`)
      
      try {
        const meteoraTradeBody = {
          publicKey: walletAddress,
          action: "collectCreatorFee",
          mint: tokenMint,
          priorityFee: 0.0001,
          pool: "meteora-dbc",
        }
        
        const meteoraResponse = await fetch(PUMPPORTAL_LOCAL_TRADE, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(meteoraTradeBody),
        })
        
        if (meteoraResponse.ok) {
          const txBytes = new Uint8Array(await meteoraResponse.arrayBuffer())
          if (txBytes.length > 10) {
            const tx = VersionedTransaction.deserialize(txBytes)
            tx.sign([keypair])
            
            const signature = await connection.sendTransaction(tx, {
              skipPreflight: false,
              maxRetries: 3,
            })
            
            const confirmation = await connection.confirmTransaction(signature, "confirmed")
            
            if (!confirmation.value.err) {
              console.log("[CREATOR-REWARDS] Meteora DBC claim successful:", signature)
              
              return NextResponse.json({
                success: true,
                data: {
                  signature,
                  amountClaimed: rewardsData.balance,
                  explorerUrl: `https://solscan.io/tx/${signature}`,
                  platformName: 'Meteora DBC',
                }
              })
            }
          }
        }
      } catch (meteoraError) {
        console.debug("[CREATOR-REWARDS] Meteora DBC claim failed:", meteoraError)
      }
      
      // Fallback: Direct user to the platform
      const dexUrl = `https://pump.fun/coin/${tokenMint}`
      
      return NextResponse.json({
        success: false,
        error: `Token has migrated. Visit Pump.fun to claim your ${rewardsData.balance.toFixed(6)} SOL rewards.`,
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
 * Fetch creator rewards from Pump.fun or Bonk.fun
 * 
 * Pump.fun creator fees are stored in a PDA derived from:
 * - Seeds: ["creator_vault", creator_pubkey] (per-creator, NOT per-token)
 * - OR for newer tokens: fees accumulate directly and use collectCreatorFee action
 * 
 * The most reliable method is to use PumpPortal's collectCreatorFee API which will
 * return a transaction if there are fees to claim.
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
    // METHOD 1: Query Platform API first (fastest and most accurate)
    // Pump.fun frontend API returns creator balance info for tokens
    // ============================================================================
    try {
      const apiUrl = poolType === 'bonk'
        ? `https://api.bonk.fun/coins/${tokenMint}`
        : `https://frontend-api.pump.fun/coins/${tokenMint}`
      
      console.log(`[CREATOR-REWARDS] Querying ${platformName} API for token ${tokenMint.slice(0, 8)}...`)
      
      const response = await fetch(apiUrl, {
        headers: { 
          "Accept": "application/json",
          "User-Agent": "Mozilla/5.0 (compatible; PropelBot/1.0)",
        },
        signal: AbortSignal.timeout(8000)
      })
      
      if (response.ok) {
        const data = await response.json()
        
        // Check if this is the token creator
        if (data.creator === creatorWallet) {
          // Pump.fun API returns creator_fee_basis_points and may have accumulated fees info
          // The exact field name varies - check common patterns
          const possibleBalanceFields = [
            'creator_balance_sol',
            'creatorBalance',
            'creator_fees_sol',
            'accumulated_fees',
            'unclaimed_fees',
          ]
          
          for (const field of possibleBalanceFields) {
            if (data[field] !== undefined) {
              const balance = parseFloat(data[field])
              if (balance > 0) {
                claimableBalance = balance * LAMPORTS_PER_SOL
                console.log(`[CREATOR-REWARDS] ✅ ${platformName} API: ${balance.toFixed(6)} SOL (field: ${field})`)
                break
              }
            }
          }
          
          // Also capture the bonding curve address if available
          if (data.bonding_curve) {
            feeAccountAddress = data.bonding_curve
          }
        } else {
          console.log(`[CREATOR-REWARDS] ℹ️ Token creator mismatch: ${data.creator?.slice(0, 8)} != ${creatorWallet.slice(0, 8)}`)
        }
      } else {
        console.debug(`[CREATOR-REWARDS] ${platformName} API returned ${response.status}`)
      }
    } catch (apiError) {
      console.debug(`[CREATOR-REWARDS] ${platformName} API error:`, 
        apiError instanceof Error ? apiError.message : "Unknown")
    }

    // ============================================================================
    // METHOD 2: PumpPortal Preview Transaction
    // If API didn't give us balance info, try getting a preview transaction
    // This method creates a transaction without submitting it - we parse it to
    // extract the transfer amount (the claimable fees)
    // ============================================================================
    if (claimableBalance === 0) {
      try {
        console.log(`[CREATOR-REWARDS] Trying ${platformName} PumpPortal preview...`)
        
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
          signal: AbortSignal.timeout(10000)
        })

        if (previewResponse.ok) {
          const contentType = previewResponse.headers.get('content-type')
          
          // Check if it's actually a transaction (binary) or an error (JSON)
          if (contentType?.includes('application/octet-stream') || !contentType?.includes('json')) {
            const txBytes = new Uint8Array(await previewResponse.arrayBuffer())
            
            if (txBytes.length > 10) { // Valid transaction is at least some bytes
              try {
                const tx = VersionedTransaction.deserialize(txBytes)
                const lamports = await extractTransferAmount(tx, creatorPubkey)
                
                if (lamports > 0) {
                  claimableBalance = lamports
                  console.log(`[CREATOR-REWARDS] ✅ ${platformName} preview: ${(lamports / LAMPORTS_PER_SOL).toFixed(6)} SOL claimable`)
                }
              } catch (parseError) {
                console.debug(`[CREATOR-REWARDS] Transaction parse error:`, parseError)
              }
            }
          } else {
            // It returned JSON instead of a transaction - likely an error or "no fees"
            try {
              const jsonResponse = await previewResponse.json()
              if (jsonResponse.error) {
                console.log(`[CREATOR-REWARDS] ℹ️ ${platformName}: ${jsonResponse.error}`)
              }
            } catch {
              // Ignore JSON parse errors
            }
          }
        } else {
          const errorText = await previewResponse.text().catch(() => 'Unknown error')
          // Check for known "no fees" responses
          const noFeesIndicators = ['no fees', 'nothing to claim', 'not found', 'insufficient', '0 SOL']
          const hasNoFees = noFeesIndicators.some(indicator => 
            errorText.toLowerCase().includes(indicator.toLowerCase())
          )
          
          if (hasNoFees) {
            console.log(`[CREATOR-REWARDS] ℹ️ ${platformName}: No fees to claim`)
          } else {
            console.debug(`[CREATOR-REWARDS] ${platformName} preview failed (${previewResponse.status}):`, 
              errorText.slice(0, 100))
          }
        }
      } catch (previewError) {
        console.debug(`[CREATOR-REWARDS] ${platformName} preview error:`, 
          previewError instanceof Error ? previewError.message : "Unknown")
      }
    }

    // ============================================================================
    // METHOD 3: On-chain PDA check (fallback)
    // Try multiple possible PDA derivation patterns that Pump.fun has used
    // Based on working Telegram bot implementation
    // ============================================================================
    if (claimableBalance === 0) {
      // Try multiple PDA patterns that Pump.fun might use
      // NOTE: "creator-vault" (hyphen) is the correct seed based on working Telegram bot
      const pdaPatterns: Buffer[][] = [
        // Pattern 1: Per-creator vault (accumulates ALL creator fees across all tokens)
        // This is the primary pattern for Pump.fun creator rewards
        [Buffer.from("creator-vault"), creatorPubkey.toBuffer()],
        // Pattern 2: Per-token fee account (older pattern)
        [Buffer.from("creator_fee"), creatorPubkey.toBuffer(), mintPubkey.toBuffer()],
        // Pattern 3: Alternative underscore naming
        [Buffer.from("creator_vault"), creatorPubkey.toBuffer()],
      ]
      
      for (const seeds of pdaPatterns) {
        try {
          const [pda] = PublicKey.findProgramAddressSync(seeds, programId)
          const accountInfo = await connection.getAccountInfo(pda)
          
          if (accountInfo && accountInfo.lamports > 0) {
            // For fee vaults, the full balance is typically claimable
            // (rent is paid separately by the program)
            const balance = accountInfo.lamports
            
            if (balance > 0) {
              feeAccountAddress = pda.toBase58()
              claimableBalance = balance
              console.log(`[CREATOR-REWARDS] ✅ Found ${(balance / LAMPORTS_PER_SOL).toFixed(6)} SOL in vault ${pda.toBase58().slice(0, 8)} (seeds: ${seeds[0].toString()})`)
              break
            }
          }
        } catch (pdaError) {
          // Continue to next pattern
        }
      }
    }

    const finalBalance = claimableBalance / LAMPORTS_PER_SOL
    
    if (finalBalance > 0) {
      console.log(`[CREATOR-REWARDS] ✅ Total ${platformName} rewards for ${tokenMint.slice(0, 8)}: ${finalBalance.toFixed(6)} SOL`)
    }

    return {
      balance: finalBalance,
      vaultAddress: feeAccountAddress,
      hasRewards: finalBalance > 0,
    }
  } catch (error) {
    console.error(`[CREATOR-REWARDS] ${poolType} fetch error:`, error)
    return { balance: 0, vaultAddress: "", hasRewards: false }
  }
}

/**
 * Extract transfer amount from a VersionedTransaction
 * Uses the proper SystemInstruction decoder to parse transfer instructions
 * Based on the working implementation from the Telegram bot
 */
async function extractTransferAmount(tx: VersionedTransaction, destination: PublicKey): Promise<number> {
  try {
    const message = tx.message
    const staticAccountKeys = message.staticAccountKeys
    
    // Build account keys map (static keys only for now)
    const accountKeys = new Map<number, PublicKey>()
    staticAccountKeys.forEach((key, index) => {
      accountKeys.set(index, key)
    })
    
    // Also need to handle address table lookups for VersionedTransaction
    // For now, we'll work with static keys which should cover most cases
    
    let totalLamports = 0
    
    // Parse compiled instructions
    for (const ix of message.compiledInstructions) {
      const programKey = accountKeys.get(ix.programIdIndex)
      if (!programKey || !programKey.equals(SystemProgram.programId)) {
        continue
      }
      
      // Build the instruction keys array
      const keys = ix.accountKeyIndexes.map((index) => {
        const pubkey = accountKeys.get(index)
        return {
          pubkey: pubkey || PublicKey.default,
          isSigner: message.isAccountSigner(index),
          isWritable: message.isAccountWritable(index),
        }
      })
      
      // Create TransactionInstruction for decoding
      const instruction = new TransactionInstruction({
        programId: programKey,
        keys,
        data: Buffer.from(ix.data),
      })
      
      // Try to decode the instruction type
      let instructionType: string
      try {
        instructionType = SystemInstruction.decodeInstructionType(instruction)
      } catch {
        continue // Not a decodable system instruction
      }
      
      // Handle Transfer and TransferWithSeed instructions
      if (instructionType === 'Transfer') {
        try {
          const transferInfo = SystemInstruction.decodeTransfer(instruction)
          if (transferInfo.toPubkey.equals(destination)) {
            totalLamports += Number(transferInfo.lamports)
          }
        } catch {
          // Failed to decode transfer
        }
      } else if (instructionType === 'TransferWithSeed') {
        try {
          const transferInfo = SystemInstruction.decodeTransferWithSeed(instruction)
          if (transferInfo.toPubkey.equals(destination)) {
            totalLamports += Number(transferInfo.lamports)
          }
        } catch {
          // Failed to decode transfer with seed
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
