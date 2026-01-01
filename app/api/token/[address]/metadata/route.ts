import { NextResponse } from "next/server"
import { Connection, PublicKey } from "@solana/web3.js"
import { getMint } from "@solana/spl-token"

const HELIUS_RPC = process.env.HELIUS_RPC_URL || process.env.NEXT_PUBLIC_HELIUS_RPC_URL
const HELIUS_API_KEY = process.env.HELIUS_API_KEY

interface TokenMetadata {
  name: string
  symbol: string
  decimals: number
  supply: number
  image?: string
  description?: string
  uri?: string
}

export async function GET(
  request: Request,
  context: { params: Promise<{ address: string }> }
) {
  try {
    const { address } = await context.params

    // Validate address
    let mintPubkey: PublicKey
    try {
      mintPubkey = new PublicKey(address)
    } catch {
      return NextResponse.json(
        { success: false, error: { message: "Invalid token address" } },
        { status: 400 }
      )
    }

    // Use Helius RPC for better metadata support
    const rpcUrl = HELIUS_RPC || "https://api.mainnet-beta.solana.com"
    const connection = new Connection(rpcUrl, "confirmed")

    // Fetch mint info
    let mintInfo
    try {
      mintInfo = await getMint(connection, mintPubkey)
    } catch (error) {
      console.error("[TOKEN-METADATA] Failed to get mint:", error)
      return NextResponse.json(
        { success: false, error: { message: "Token not found on-chain" } },
        { status: 404 }
      )
    }

    // Try Helius DAS API for rich metadata
    let metadata: TokenMetadata = {
      name: "Unknown Token",
      symbol: address.slice(0, 6).toUpperCase(),
      decimals: mintInfo.decimals,
      supply: Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals),
    }

    if (HELIUS_API_KEY) {
      try {
        const heliusResponse = await fetch(
          `https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ mintAccounts: [address] }),
          }
        )

        if (heliusResponse.ok) {
          const heliusData = await heliusResponse.json()
          if (heliusData && heliusData[0]) {
            const tokenData = heliusData[0]
            metadata = {
              name: tokenData.onChainMetadata?.metadata?.data?.name || 
                    tokenData.legacyMetadata?.name ||
                    metadata.name,
              symbol: tokenData.onChainMetadata?.metadata?.data?.symbol || 
                      tokenData.legacyMetadata?.symbol ||
                      metadata.symbol,
              decimals: mintInfo.decimals,
              supply: Number(mintInfo.supply) / Math.pow(10, mintInfo.decimals),
              image: tokenData.offChainMetadata?.metadata?.image ||
                     tokenData.legacyMetadata?.logoURI,
              description: tokenData.offChainMetadata?.metadata?.description,
              uri: tokenData.onChainMetadata?.metadata?.data?.uri,
            }
          }
        }
      } catch (heliusError) {
        console.warn("[TOKEN-METADATA] Helius API error:", heliusError)
      }
    }

    // If we still don't have good metadata, try Jupiter token list
    if (metadata.name === "Unknown Token") {
      try {
        const jupResponse = await fetch(`https://tokens.jup.ag/token/${address}`)
        if (jupResponse.ok) {
          const jupData = await jupResponse.json()
          if (jupData) {
            metadata = {
              name: jupData.name || metadata.name,
              symbol: jupData.symbol || metadata.symbol,
              decimals: jupData.decimals || mintInfo.decimals,
              supply: metadata.supply,
              image: jupData.logoURI,
              description: jupData.description,
            }
          }
        }
      } catch (jupError) {
        console.warn("[TOKEN-METADATA] Jupiter API error:", jupError)
      }
    }

    // Try DexScreener as another source
    if (metadata.name === "Unknown Token" || !metadata.image) {
      try {
        const dexResponse = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${address}`)
        if (dexResponse.ok) {
          const dexData = await dexResponse.json()
          if (dexData.pairs && dexData.pairs.length > 0) {
            const pair = dexData.pairs[0]
            if (metadata.name === "Unknown Token") {
              metadata.name = pair.baseToken?.name || metadata.name
              metadata.symbol = pair.baseToken?.symbol || metadata.symbol
            }
            if (!metadata.image && pair.info?.imageUrl) {
              metadata.image = pair.info.imageUrl
            }
          }
        }
      } catch (dexError) {
        console.warn("[TOKEN-METADATA] DexScreener API error:", dexError)
      }
    }

    // Clean up the name and symbol (remove null bytes)
    metadata.name = metadata.name.replace(/\0/g, "").trim()
    metadata.symbol = metadata.symbol.replace(/\0/g, "").trim()

    return NextResponse.json({
      success: true,
      data: metadata,
    })
  } catch (error) {
    console.error("[TOKEN-METADATA] Error:", error)
    return NextResponse.json(
      { success: false, error: { message: "Failed to fetch token metadata" } },
      { status: 500 }
    )
  }
}

