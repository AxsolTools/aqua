/**
 * AQUA Launchpad - Votes API
 * Manages user votes on tokens (upvotes/downvotes)
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET - Get votes for a token or check if user voted
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

    // Get vote counts for the token
    const { data: votes, error: votesError } = await supabase
      .from("votes")
      .select("vote_type")
      .eq("token_address", tokenAddress)

    if (votesError) throw votesError

    const upVotes = votes?.filter(v => v.vote_type === "up").length || 0
    const downVotes = votes?.filter(v => v.vote_type === "down").length || 0

    // Check if specific wallet has voted
    let userVote = null
    if (walletAddress) {
      const { data: userVoteData } = await supabase
        .from("votes")
        .select("vote_type")
        .eq("token_address", tokenAddress)
        .eq("wallet_address", walletAddress)
        .single()
      
      userVote = userVoteData?.vote_type || null
    }

    return NextResponse.json({
      success: true,
      data: {
        tokenAddress,
        upVotes,
        downVotes,
        totalVotes: upVotes + downVotes,
        userVote,
      },
    })
  } catch (error) {
    console.error("[VOTES] GET error:", error)
    return NextResponse.json(
      { error: "Failed to get votes" },
      { status: 500 }
    )
  }
}

// POST - Cast a vote
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { token_address, wallet_address, vote_type = "up" } = body

    if (!token_address || !wallet_address) {
      return NextResponse.json(
        { error: "token_address and wallet_address are required" },
        { status: 400 }
      )
    }

    if (!["up", "down"].includes(vote_type)) {
      return NextResponse.json(
        { error: "vote_type must be 'up' or 'down'" },
        { status: 400 }
      )
    }

    // Upsert the vote (update if exists, insert if not)
    const { data, error } = await supabase
      .from("votes")
      .upsert(
        {
          token_address,
          wallet_address,
          vote_type,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "token_address,wallet_address",
        }
      )
      .select()
      .single()

    if (error) throw error

    // Get updated counts
    const { data: votes } = await supabase
      .from("votes")
      .select("vote_type")
      .eq("token_address", token_address)

    const upVotes = votes?.filter(v => v.vote_type === "up").length || 0
    const downVotes = votes?.filter(v => v.vote_type === "down").length || 0

    return NextResponse.json({
      success: true,
      data: {
        vote: data,
        upVotes,
        downVotes,
        totalVotes: upVotes + downVotes,
      },
    })
  } catch (error) {
    console.error("[VOTES] POST error:", error)
    return NextResponse.json(
      { error: "Failed to cast vote" },
      { status: 500 }
    )
  }
}

// DELETE - Remove a vote
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const tokenAddress = searchParams.get("token_address")
    const walletAddress = searchParams.get("wallet_address")

    if (!tokenAddress || !walletAddress) {
      return NextResponse.json(
        { error: "token_address and wallet_address are required" },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from("votes")
      .delete()
      .eq("token_address", tokenAddress)
      .eq("wallet_address", walletAddress)

    if (error) throw error

    // Get updated counts
    const { data: votes } = await supabase
      .from("votes")
      .select("vote_type")
      .eq("token_address", tokenAddress)

    const upVotes = votes?.filter(v => v.vote_type === "up").length || 0
    const downVotes = votes?.filter(v => v.vote_type === "down").length || 0

    return NextResponse.json({
      success: true,
      data: {
        upVotes,
        downVotes,
        totalVotes: upVotes + downVotes,
      },
    })
  } catch (error) {
    console.error("[VOTES] DELETE error:", error)
    return NextResponse.json(
      { error: "Failed to remove vote" },
      { status: 500 }
    )
  }
}

