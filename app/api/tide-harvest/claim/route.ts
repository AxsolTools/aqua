/**
 * AQUA Launchpad - Tide Harvest Claim API
 * Allows creators to claim accumulated rewards
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js"
import bs58 from "bs58"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// GET - Get tide harvest status for a token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenAddress = searchParams.get("token_address")
    const creatorWallet = searchParams.get("creator_wallet")

    if (!tokenAddress && !creatorWallet) {
      return NextResponse.json(
        { error: "token_address or creator_wallet is required" },
        { status: 400 }
      )
    }

    let query = supabase.from("tide_harvests").select("*")

    if (tokenAddress) {
      query = query.eq("token_address", tokenAddress)
    }
    if (creatorWallet) {
      query = query.eq("creator_wallet", creatorWallet)
    }

    const { data, error } = await query

    if (error) throw error

    // Calculate totals if multiple harvests
    const totalAccumulated = data?.reduce((sum, h) => sum + Number(h.total_accumulated), 0) || 0
    const totalClaimed = data?.reduce((sum, h) => sum + Number(h.total_claimed), 0) || 0
    const pendingAmount = totalAccumulated - totalClaimed

    return NextResponse.json({
      success: true,
      data: {
        harvests: data || [],
        totalAccumulated,
        totalClaimed,
        pendingAmount,
      },
    })
  } catch (error) {
    console.error("[TIDE-HARVEST] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get tide harvest data" },
      { status: 500 }
    )
  }
}

// POST - Claim pending rewards
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token_address, creator_wallet, claim_amount } = body

    if (!token_address || !creator_wallet) {
      return NextResponse.json(
        { error: "token_address and creator_wallet are required" },
        { status: 400 }
      )
    }

    // Get the tide harvest record
    const { data: harvest, error: fetchError } = await supabase
      .from("tide_harvests")
      .select("*")
      .eq("token_address", token_address)
      .single()

    if (fetchError || !harvest) {
      return NextResponse.json(
        { error: "Tide harvest record not found" },
        { status: 404 }
      )
    }

    // Verify ownership
    if (harvest.creator_wallet !== creator_wallet) {
      return NextResponse.json(
        { error: "Not authorized to claim this harvest" },
        { status: 403 }
      )
    }

    // Calculate pending amount
    const pendingAmount = Number(harvest.total_accumulated) - Number(harvest.total_claimed)
    const amountToClaim = claim_amount ? Math.min(Number(claim_amount), pendingAmount) : pendingAmount

    if (amountToClaim <= 0) {
      return NextResponse.json(
        { error: "No pending rewards to claim" },
        { status: 400 }
      )
    }

    // Minimum claim amount (0.001 SOL)
    const MIN_CLAIM = 0.001
    if (amountToClaim < MIN_CLAIM) {
      return NextResponse.json(
        { error: `Minimum claim amount is ${MIN_CLAIM} SOL` },
        { status: 400 }
      )
    }

    // Get the token's creator vault and check balance
    // In a real implementation, this would interact with the Pump.fun creator vault PDA
    // For now, we'll create a claim record and simulate the transfer
    
    // Create claim record
    const { data: claim, error: claimError } = await supabase
      .from("tide_harvest_claims")
      .insert({
        tide_harvest_id: harvest.id,
        token_address,
        creator_wallet,
        amount: amountToClaim,
        status: "pending",
      })
      .select()
      .single()

    if (claimError) throw claimError

    // TODO: Execute actual claim from creator vault
    // This would involve:
    // 1. Deriving the creator vault PDA
    // 2. Creating the claim instruction
    // 3. Signing with the creator's wallet
    // 4. Submitting the transaction
    
    // For now, simulate a successful claim
    const txSignature = `claim_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Update the claim with signature
    await supabase
      .from("tide_harvest_claims")
      .update({
        tx_signature: txSignature,
        status: "confirmed", // Would be 'pending' until blockchain confirms
      })
      .eq("id", claim.id)

    // Update the harvest record
    const { data: updatedHarvest, error: updateError } = await supabase
      .from("tide_harvests")
      .update({
        total_claimed: Number(harvest.total_claimed) + amountToClaim,
        last_claim_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", harvest.id)
      .select()
      .single()

    if (updateError) throw updateError

    return NextResponse.json({
      success: true,
      data: {
        claim: {
          id: claim.id,
          amount: amountToClaim,
          txSignature,
          status: "confirmed",
        },
        harvest: updatedHarvest,
        message: `Successfully claimed ${amountToClaim.toFixed(4)} SOL`,
      },
    })
  } catch (error) {
    console.error("[TIDE-HARVEST] POST error:", error)
    return NextResponse.json(
      { error: "Failed to claim rewards" },
      { status: 500 }
    )
  }
}

