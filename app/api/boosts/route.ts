/**
 * AQUA Launchpad - Boosts API
 * Manages SOL-based boosts for token visibility
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { Connection, PublicKey } from "@solana/web3.js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const HELIUS_RPC = process.env.HELIUS_RPC_URL || "https://api.mainnet-beta.solana.com"
const connection = new Connection(HELIUS_RPC, "confirmed")

// GET - Get boosts for a token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenAddress = searchParams.get("token_address")
    const walletAddress = searchParams.get("wallet_address")

    if (!tokenAddress) {
      return NextResponse.json(
        { error: "token_address is required" },
        { status: 400 }
      )
    }

    // Get all confirmed boosts for the token
    const { data: boosts, error } = await supabase
      .from("boosts")
      .select("*")
      .eq("token_address", tokenAddress)
      .eq("status", "confirmed")
      .order("created_at", { ascending: false })

    if (error) throw error

    // Calculate total boost amount
    const totalBoost = boosts?.reduce((sum, b) => sum + Number(b.amount), 0) || 0

    // Get user's boosts if wallet provided
    let userBoosts = null
    let userTotalBoost = 0
    if (walletAddress) {
      userBoosts = boosts?.filter(b => b.wallet_address === walletAddress) || []
      userTotalBoost = userBoosts.reduce((sum, b) => sum + Number(b.amount), 0)
    }

    return NextResponse.json({
      success: true,
      data: {
        tokenAddress,
        totalBoost,
        boostCount: boosts?.length || 0,
        recentBoosts: boosts?.slice(0, 10) || [],
        userBoosts,
        userTotalBoost,
      },
    })
  } catch (error) {
    console.error("[BOOSTS] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get boosts" },
      { status: 500 }
    )
  }
}

// POST - Create a boost (after SOL payment)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token_address, wallet_address, amount, tx_signature } = body

    if (!token_address || !wallet_address || !amount) {
      return NextResponse.json(
        { error: "token_address, wallet_address, and amount are required" },
        { status: 400 }
      )
    }

    if (Number(amount) <= 0) {
      return NextResponse.json(
        { error: "amount must be greater than 0" },
        { status: 400 }
      )
    }

    // Verify transaction if signature provided
    let status = "pending"
    if (tx_signature) {
      try {
        const txInfo = await connection.getTransaction(tx_signature, {
          maxSupportedTransactionVersion: 0,
        })
        if (txInfo && txInfo.meta && !txInfo.meta.err) {
          status = "confirmed"
        } else if (txInfo && txInfo.meta?.err) {
          status = "failed"
        }
      } catch {
        // Transaction might not be confirmed yet
        status = "pending"
      }
    }

    // Insert the boost
    const { data, error } = await supabase
      .from("boosts")
      .insert({
        token_address,
        wallet_address,
        amount: Number(amount),
        tx_signature,
        status,
      })
      .select()
      .single()

    if (error) throw error

    // Get updated total
    const { data: allBoosts } = await supabase
      .from("boosts")
      .select("amount")
      .eq("token_address", token_address)
      .eq("status", "confirmed")

    const totalBoost = allBoosts?.reduce((sum, b) => sum + Number(b.amount), 0) || 0

    return NextResponse.json({
      success: true,
      data: {
        boost: data,
        totalBoost,
      },
    })
  } catch (error) {
    console.error("[BOOSTS] POST error:", error)
    return NextResponse.json(
      { error: "Failed to create boost" },
      { status: 500 }
    )
  }
}

// PATCH - Update boost status (for confirming pending boosts)
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { boost_id, tx_signature } = body

    if (!boost_id) {
      return NextResponse.json(
        { error: "boost_id is required" },
        { status: 400 }
      )
    }

    // Get the boost
    const { data: boost, error: fetchError } = await supabase
      .from("boosts")
      .select("*")
      .eq("id", boost_id)
      .single()

    if (fetchError || !boost) {
      return NextResponse.json(
        { error: "Boost not found" },
        { status: 404 }
      )
    }

    // Verify transaction
    const sigToVerify = tx_signature || boost.tx_signature
    let status = boost.status

    if (sigToVerify) {
      try {
        const txInfo = await connection.getTransaction(sigToVerify, {
          maxSupportedTransactionVersion: 0,
        })
        if (txInfo && txInfo.meta && !txInfo.meta.err) {
          status = "confirmed"
        } else if (txInfo && txInfo.meta?.err) {
          status = "failed"
        }
      } catch {
        // Keep current status
      }
    }

    // Update the boost
    const { data, error } = await supabase
      .from("boosts")
      .update({
        status,
        tx_signature: sigToVerify,
        updated_at: new Date().toISOString(),
      })
      .eq("id", boost_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({
      success: true,
      data,
    })
  } catch (error) {
    console.error("[BOOSTS] PATCH error:", error)
    return NextResponse.json(
      { error: "Failed to update boost" },
      { status: 500 }
    )
  }
}

