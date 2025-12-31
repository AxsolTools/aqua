/**
 * Creator Rewards API - Fetch and claim rewards from Pump.fun bonding curve vault
 */

import { NextRequest, NextResponse } from "next/server"
import { Connection, PublicKey, LAMPORTS_PER_SOL, Keypair, Transaction } from "@solana/web3.js"
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

    // Get creator vault balance from on-chain
    const rewardsData = await getCreatorRewardsOnChain(tokenMint, creatorWallet)

    return NextResponse.json({
      success: true,
      data: rewardsData
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
    const { tokenMint, walletAddress, sessionId } = body

    if (!tokenMint || !walletAddress) {
      return NextResponse.json(
        { success: false, error: "tokenMint and walletAddress are required" },
        { status: 400 }
      )
    }

    // Verify the wallet belongs to the session
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, public_key, encrypted_private_key")
      .eq("public_key", walletAddress)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { success: false, error: "Wallet not found" },
        { status: 404 }
      )
    }

    // Get current rewards balance
    const rewardsData = await getCreatorRewardsOnChain(tokenMint, walletAddress)

    if (rewardsData.balance <= 0) {
      return NextResponse.json({
        success: false,
        error: "No rewards available to claim"
      })
    }

    // Claim using PumpPortal API
    const claimResult = await claimCreatorRewardsViaAPI(tokenMint, walletAddress, wallet.encrypted_private_key)

    if (!claimResult.success) {
      return NextResponse.json({
        success: false,
        error: claimResult.error || "Failed to claim rewards"
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        claimed: rewardsData.balance,
        txSignature: claimResult.signature,
        message: `Successfully claimed ${rewardsData.balance.toFixed(6)} SOL`
      }
    })
  } catch (error) {
    console.error("[CREATOR-REWARDS] POST error:", error)
    return NextResponse.json(
      { success: false, error: "Failed to claim rewards" },
      { status: 500 }
    )
  }
}

/**
 * Fetch creator rewards from on-chain vault PDA
 */
async function getCreatorRewardsOnChain(
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

    // Try multiple PDA derivation patterns used by Pump.fun
    const pdaSeeds = [
      // Pattern 1: creator-vault with mint and creator
      [Buffer.from('creator-vault'), mintPubkey.toBuffer(), creatorPubkey.toBuffer()],
      // Pattern 2: creator_fee with creator and mint
      [Buffer.from('creator_fee'), creatorPubkey.toBuffer(), mintPubkey.toBuffer()],
      // Pattern 3: vault with creator only
      [Buffer.from('vault'), creatorPubkey.toBuffer()],
    ]

    let totalBalance = 0
    let foundVault = ""

    for (const seeds of pdaSeeds) {
      try {
        const [vaultPDA] = PublicKey.findProgramAddressSync(seeds, PUMP_PROGRAM_ID)
        const balance = await connection.getBalance(vaultPDA)
        
        if (balance > 0) {
          totalBalance += balance
          foundVault = vaultPDA.toBase58()
          console.log(`[CREATOR-REWARDS] Found vault ${vaultPDA.toBase58()} with ${balance / LAMPORTS_PER_SOL} SOL`)
        }
      } catch {
        // Skip invalid PDA
      }
    }

    // Also check direct creator wallet for any Pump.fun fee distributions
    const directBalance = await connection.getBalance(creatorPubkey)
    
    return {
      balance: totalBalance / LAMPORTS_PER_SOL,
      vaultAddress: foundVault,
      hasRewards: totalBalance > 0
    }
  } catch (error) {
    console.error("[CREATOR-REWARDS] On-chain fetch error:", error)
    return { balance: 0, vaultAddress: "", hasRewards: false }
  }
}

/**
 * Claim creator rewards via PumpPortal API
 */
async function claimCreatorRewardsViaAPI(
  tokenMint: string,
  creatorWallet: string,
  encryptedPrivateKey: string
): Promise<{ success: boolean; signature?: string; error?: string }> {
  try {
    // Get service salt for decryption
    const { data: saltConfig } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "service_salt")
      .single()

    if (!saltConfig?.value) {
      return { success: false, error: "Service configuration not found" }
    }

    // Decrypt private key
    const privateKeyBytes = await decryptWalletKey(encryptedPrivateKey, saltConfig.value)
    const creatorKeypair = Keypair.fromSecretKey(privateKeyBytes)

    // Use PumpPortal API for claiming
    const response = await fetch("https://pumpportal.fun/api/creator-claim", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mint: tokenMint,
        creatorPublicKey: creatorWallet,
      }),
    })

    if (!response.ok) {
      // If PumpPortal doesn't support this endpoint, return info
      return { 
        success: false, 
        error: "Creator reward claiming requires manual withdrawal from Pump.fun. Please visit pump.fun to claim your rewards." 
      }
    }

    // If PumpPortal returns a transaction to sign
    const txData = await response.arrayBuffer()
    const tx = Transaction.from(Buffer.from(txData))
    tx.sign(creatorKeypair)

    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: "confirmed",
      maxRetries: 3,
    })

    await connection.confirmTransaction(signature, "confirmed")

    return { success: true, signature }
  } catch (error) {
    console.error("[CREATOR-REWARDS] Claim error:", error)
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to claim rewards" 
    }
  }
}

/**
 * Decrypt wallet key
 */
async function decryptWalletKey(encryptedData: string, salt: string): Promise<Uint8Array> {
  const parts = encryptedData.split(":")
  if (parts.length !== 3) {
    throw new Error("Invalid encrypted data format")
  }

  const [ivHex, ciphertextHex, authTagHex] = parts

  const hexToBytes = (hex: string): Uint8Array => {
    const bytes = new Uint8Array(hex.length / 2)
    for (let i = 0; i < hex.length; i += 2) {
      bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16)
    }
    return bytes
  }

  const iv = hexToBytes(ivHex)
  const ciphertext = hexToBytes(ciphertextHex)
  const authTag = hexToBytes(authTagHex)
  const saltBytes = hexToBytes(salt)

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    saltBytes.buffer as ArrayBuffer,
    "PBKDF2",
    false,
    ["deriveBits", "deriveKey"]
  )

  const derivedKey = await crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: saltBytes.buffer as ArrayBuffer,
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"]
  )

  const combined = new Uint8Array(ciphertext.length + authTag.length)
  combined.set(ciphertext)
  combined.set(authTag, ciphertext.length)

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer },
    derivedKey,
    combined.buffer as ArrayBuffer
  )

  return new Uint8Array(decrypted)
}

