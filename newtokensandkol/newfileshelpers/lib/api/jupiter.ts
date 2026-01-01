// Jupiter API - Solana DEX aggregator with token metadata
export interface JupiterToken {
  address: string
  chainId: number
  decimals: number
  name: string
  symbol: string
  logoURI?: string
  tags?: string[]
  extensions?: {
    coingeckoId?: string
    website?: string
    twitter?: string
  }
}

export interface JupiterPrice {
  id: string
  mintSymbol: string
  vsToken: string
  vsTokenSymbol: string
  price: number
}

const JUPITER_BASE = "https://token.jup.ag"
const JUPITER_PRICE = "https://price.jup.ag/v6"

// Cache token list
let tokenListCache: JupiterToken[] | null = null
let tokenListTimestamp = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

export async function getJupiterTokenList(): Promise<JupiterToken[]> {
  const now = Date.now()
  if (tokenListCache && now - tokenListTimestamp < CACHE_DURATION) {
    return tokenListCache
  }

  try {
    const res = await fetch(`${JUPITER_BASE}/strict`, {
      next: { revalidate: 300 },
    })
    if (!res.ok) return tokenListCache || []
    const data = await res.json()
    tokenListCache = data
    tokenListTimestamp = now
    return data
  } catch {
    return tokenListCache || []
  }
}

export async function getTokenMetadata(address: string): Promise<JupiterToken | null> {
  const tokens = await getJupiterTokenList()
  return tokens.find((t) => t.address === address) || null
}

export async function getTokenPrice(address: string): Promise<number | null> {
  try {
    const res = await fetch(`${JUPITER_PRICE}/price?ids=${address}`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.data?.[address]?.price || null
  } catch {
    return null
  }
}

export async function getMultipleTokenPrices(addresses: string[]): Promise<Record<string, number>> {
  try {
    const res = await fetch(`${JUPITER_PRICE}/price?ids=${addresses.join(",")}`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return {}
    const data = await res.json()
    const prices: Record<string, number> = {}
    for (const addr of addresses) {
      if (data.data?.[addr]?.price) {
        prices[addr] = data.data[addr].price
      }
    }
    return prices
  } catch {
    return {}
  }
}
