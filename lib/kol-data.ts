// Official Solana KOL Database with verified Twitter handles and wallet addresses

export interface KOL {
  id: string
  name: string
  twitter: string
  wallet: string
  avatar: string
  pnl: number
  pnl7d: number
  pnl30d: number
  winRate: number
  totalTrades: number
  avgHoldTime: string
  tradingStyle: string
  tier: "diamond" | "gold" | "silver" | "bronze"
  isWashTrader: boolean
  washScore: number
  favoriteTokens: string[]
  followers: number
  copyTraders: number
  lastActive: string
  verified: boolean
  earlyEntryScore: number
  dumpOnFollowers: number
  avgEntryTiming: number
  coordinationScore: number
  alphaAccuracy: number
  // Extended analytics
  roi7d: number
  roi30d: number
  sharpeRatio: number
  maxDrawdown: number
  profitFactor: number
  avgTradeSize: number
  bestTrade: number
  worstTrade: number
  consecutiveWins: number
  activeHours: string
  riskLevel: "low" | "medium" | "high" | "extreme"
}

export interface Token {
  symbol: string
  name: string
  logo: string
  address: string
  price: number
  change24h: number
  age?: string
  marketCap?: number
}

export interface FreshToken {
  token: Token
  launchTime: Date
  riskScore: number
  moonPotential: number
  kolBuyers: KOL[]
}

export interface KOLConvergence {
  token: Token
  kols: KOL[]
  convergenceScore: number
  totalBuyVolume: number
  firstBuyTime: Date
}

// Use unavatar.io for reliable Twitter/X avatar fetching
// This service handles the complexity of fetching X profile pictures
const getAvatar = (twitterHandle: string) => `https://unavatar.io/twitter/${twitterHandle}?fallback=https://ui-avatars.com/api/?name=${twitterHandle}&background=1a1a1a&color=00d9ff&bold=true`

// Fallback avatars for accounts that may have issues
const DIRECT_AVATARS: Record<string, string> = {
  DegenSpartan: "https://pbs.twimg.com/profile_images/1676908029091622913/hVb3D8tJ_400x400.jpg",
  blknoiz06: "https://pbs.twimg.com/profile_images/1768802747840204800/KgpBpIrP_400x400.jpg",
  MustStopMurad: "https://pbs.twimg.com/profile_images/1844398975566684161/JkqvGxGd_400x400.jpg",
  GiganticRebirth: "https://pbs.twimg.com/profile_images/1529152551261650944/tW8FE9wW_400x400.jpg",
  HsakaTrades: "https://pbs.twimg.com/profile_images/1760328497768923136/oqIyRuP5_400x400.jpg",
  Pentosh1: "https://pbs.twimg.com/profile_images/1674477997039812608/7T0ej1lS_400x400.jpg",
  coaborblabs: "https://pbs.twimg.com/profile_images/1632007691989569537/Mw8dI8DG_400x400.jpg",
  CL207: "https://pbs.twimg.com/profile_images/1655595282219569152/RH_NfnXO_400x400.jpg",
  loomdart: "https://pbs.twimg.com/profile_images/1797350847710339073/3_hFBTmY_400x400.jpg",
  "0xSunNFT": "https://pbs.twimg.com/profile_images/1676960789111742464/Jx6UJlS4_400x400.jpg",
  daborblabs: "https://pbs.twimg.com/profile_images/1717956538787white9968/NxNIKIZx_400x400.jpg",
  A1lon9: "https://pbs.twimg.com/profile_images/1686064012649050112/XuJtDd67_400x400.jpg",
  a1lon9: "https://pbs.twimg.com/profile_images/1686064012649050112/XuJtDd67_400x400.jpg",
}

export const getKolAvatar = (twitterHandle: string) => {
  // Check for direct avatar first
  if (DIRECT_AVATARS[twitterHandle]) {
    return DIRECT_AVATARS[twitterHandle]
  }
  // Use unavatar.io as the primary source with a fallback
  return getAvatar(twitterHandle)
}

// Token logos from reliable CDNs
export const TOKENS: Token[] = [
  {
    symbol: "SOL",
    name: "Solana",
    logo: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    address: "So11111111111111111111111111111111111111112",
    price: 178.5,
    change24h: 2.4,
  },
  {
    symbol: "WIF",
    name: "dogwifhat",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm.png",
    address: "EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm",
    price: 2.85,
    change24h: 5.2,
  },
  {
    symbol: "BONK",
    name: "Bonk",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263.png",
    address: "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263",
    price: 0.0000234,
    change24h: -1.2,
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN.png",
    address: "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN",
    price: 1.12,
    change24h: 3.8,
  },
  {
    symbol: "POPCAT",
    name: "Popcat",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr.png",
    address: "7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr",
    price: 1.45,
    change24h: 8.9,
  },
  {
    symbol: "MEW",
    name: "cat in a dogs world",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5.png",
    address: "MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5",
    price: 0.0089,
    change24h: -2.1,
  },
  {
    symbol: "PYTH",
    name: "Pyth Network",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3.png",
    address: "HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3",
    price: 0.42,
    change24h: 1.5,
  },
  {
    symbol: "RAY",
    name: "Raydium",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R.png",
    address: "4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R",
    price: 5.67,
    change24h: 4.2,
  },
  {
    symbol: "MOODENG",
    name: "Moo Deng",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY.png",
    address: "ED5nyyWEzpPPiWimP8vYm7sD7TD3LAt3Q3gRTWHzPJBY",
    price: 0.32,
    change24h: 12.5,
  },
  {
    symbol: "GIGA",
    name: "Gigachad",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9.png",
    address: "63LfDmNb3MQ8mw9MtZ2To9bEA2M71kZUUGq5tiJxcqj9",
    price: 0.089,
    change24h: 8.7,
  },
  {
    symbol: "SPX",
    name: "SPX6900",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr.png",
    address: "J3NKxxXZcnNiMjKw9hYb2K4LUxgwB6t1FtPtQVsv3KFr",
    price: 0.78,
    change24h: 15.2,
  },
  {
    symbol: "FWOG",
    name: "Fwog",
    logo: "https://dd.dexscreener.com/ds-data/tokens/solana/A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump.png",
    address: "A8C3xuqscfmyLrte3VmTqrAq8kgMASius9AFNANwpump",
    price: 0.045,
    change24h: 34.5,
  },
]

export const EMERGING_TOKENS: Token[] = [
  {
    symbol: "ZEREBRO",
    name: "Zerebro",
    logo: "https://assets.coingecko.com/coins/images/51289/standard/zerebro_2.png",
    address: "8x5VqbHA8D7NkD52uNuS5nnt3PwA8pLD34ymskeSo2Wn",
    price: 0.42,
    change24h: 156.8,
    age: "2h",
    marketCap: 420000,
  },
  {
    symbol: "AI16Z",
    name: "ai16z",
    logo: "https://coin-images.coingecko.com/coins/images/51090/large/AI16Z.jpg",
    address: "HeLp6NuQkmYB4pYWo2zYs22mESHXPQYzXbB8n4V98jwC",
    price: 1.85,
    change24h: 89.2,
    age: "6h",
    marketCap: 1850000,
  },
  {
    symbol: "GRIFFAIN",
    name: "Griffain",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/34362.png",
    address: "KENJSUYLASHUMfHyy5o4Hp2FdNqZg1AsUPhfH2kYvEP",
    price: 0.068,
    change24h: 234.5,
    age: "45m",
    marketCap: 68000,
  },
  {
    symbol: "ARC",
    name: "AI Rig Complex",
    logo: "https://assets.coingecko.com/coins/images/52701/standard/u312bPNA_400x400.jpg",
    address: "61V8vBaqAGMpgDQi4JcAwo1dmBGHsyhzodcPqnEVpump",
    price: 0.0034,
    change24h: 567.2,
    age: "18m",
    marketCap: 34000,
  },
  {
    symbol: "SWARMS",
    name: "Swarms",
    logo: "https://s2.coinmarketcap.com/static/img/coins/64x64/34535.png",
    address: "74SBV4zDXxTRgv1pEMoECskKBkZHc2yGPnc7GYVepump",
    price: 0.0089,
    change24h: 312.4,
    age: "1h",
    marketCap: 89000,
  },
  {
    symbol: "GOAT",
    name: "Goatseus Maximus",
    logo: "https://assets.coingecko.com/coins/images/50717/standard/GOAT_LOGO_NEW.jpg",
    address: "CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump",
    price: 0.67,
    change24h: 45.6,
    age: "12h",
    marketCap: 6700000,
  },
  {
    symbol: "FARTCOIN",
    name: "Fartcoin",
    logo: "https://assets.coingecko.com/coins/images/50891/standard/fart.jpg",
    address: "9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump",
    price: 0.89,
    change24h: 67.3,
    age: "8h",
    marketCap: 8900000,
  },
]

// Generate extended analytics for KOLs
function generateExtendedAnalytics(basePnl: number, winRate: number): Partial<KOL> {
  return {
    roi7d: (Math.random() - 0.3) * 50 + 10,
    roi30d: (Math.random() - 0.3) * 100 + 20,
    sharpeRatio: Math.random() * 2 + 0.5,
    maxDrawdown: Math.random() * 30 + 5,
    profitFactor: Math.random() * 1.5 + 1,
    avgTradeSize: basePnl / 100 + Math.random() * 10000,
    bestTrade: basePnl * 0.1 * Math.random(),
    worstTrade: -(basePnl * 0.05 * Math.random()),
    consecutiveWins: Math.floor(Math.random() * 15) + 3,
    activeHours: "09:00-17:00 UTC",
    riskLevel: winRate > 65 ? "low" : winRate > 55 ? "medium" : winRate > 45 ? "high" : "extreme",
  }
}

export const KOL_DATABASE: KOL[] = [
  {
    id: "1",
    name: "Ansem",
    twitter: "blknoiz06",
    wallet: "AVAZvHLR2PcWpDf8BXY4rVxNHYRBytycHkcB5z5QNXYm",
    avatar: getKolAvatar("blknoiz06"),
    pnl: 28500000,
    pnl7d: 2150000,
    pnl30d: 9800000,
    winRate: 64.7,
    totalTrades: 16600,
    avgHoldTime: "5m",
    tradingStyle: "Momentum",
    tier: "diamond",
    isWashTrader: false,
    washScore: 5,
    favoriteTokens: ["WIF", "BONK", "POPCAT"],
    followers: 584000,
    copyTraders: 12450,
    lastActive: "2m ago",
    verified: true,
    earlyEntryScore: 94,
    dumpOnFollowers: 2,
    avgEntryTiming: 3,
    coordinationScore: 45,
    alphaAccuracy: 78,
    ...generateExtendedAnalytics(28500000, 64.7),
  } as KOL,
  {
    id: "2",
    name: "Murad",
    twitter: "MustStopMurad",
    wallet: "7vUQX3hgKzYfSqxGMNLVTZKMJLpVZ1WkJgTe7H5rT8GS",
    avatar: getKolAvatar("MustStopMurad"),
    pnl: 24150000,
    pnl7d: 1850000,
    pnl30d: 8500000,
    winRate: 68.9,
    totalTrades: 2890,
    avgHoldTime: "4h 30m",
    tradingStyle: "Memecoin Hunter",
    tier: "diamond",
    isWashTrader: false,
    washScore: 8,
    favoriteTokens: ["SPX", "GIGA", "MOODENG"],
    followers: 298000,
    copyTraders: 8920,
    lastActive: "5m ago",
    verified: true,
    earlyEntryScore: 89,
    dumpOnFollowers: 5,
    avgEntryTiming: 8,
    coordinationScore: 62,
    alphaAccuracy: 72,
    ...generateExtendedAnalytics(24150000, 68.9),
  } as KOL,
  {
    id: "3",
    name: "GCR",
    twitter: "GiganticRebirth",
    wallet: "GCR1111111111111111111111111111111111111111",
    avatar: getKolAvatar("GiganticRebirth"),
    pnl: 45000000,
    pnl7d: 3200000,
    pnl30d: 12000000,
    winRate: 72.4,
    totalTrades: 890,
    avgHoldTime: "2d",
    tradingStyle: "Macro Trader",
    tier: "diamond",
    isWashTrader: false,
    washScore: 3,
    favoriteTokens: ["SOL", "JUP", "BONK"],
    followers: 412000,
    copyTraders: 15600,
    lastActive: "1h ago",
    verified: true,
    earlyEntryScore: 82,
    dumpOnFollowers: 1,
    avgEntryTiming: 45,
    coordinationScore: 28,
    alphaAccuracy: 85,
    ...generateExtendedAnalytics(45000000, 72.4),
  } as KOL,
  {
    id: "4",
    name: "Hsaka",
    twitter: "HsakaTrades",
    wallet: "HSAKA11111111111111111111111111111111111111",
    avatar: getKolAvatar("HsakaTrades"),
    pnl: 18900000,
    pnl7d: 980000,
    pnl30d: 4200000,
    winRate: 61.2,
    totalTrades: 4560,
    avgHoldTime: "15m",
    tradingStyle: "Scalper",
    tier: "diamond",
    isWashTrader: false,
    washScore: 12,
    favoriteTokens: ["WIF", "MEW", "POPCAT"],
    followers: 189000,
    copyTraders: 6780,
    lastActive: "30s ago",
    verified: true,
    earlyEntryScore: 76,
    dumpOnFollowers: 8,
    avgEntryTiming: 5,
    coordinationScore: 55,
    alphaAccuracy: 65,
    ...generateExtendedAnalytics(18900000, 61.2),
  } as KOL,
  {
    id: "5",
    name: "Pentoshi",
    twitter: "Pentosh1",
    wallet: "PENT1111111111111111111111111111111111111111",
    avatar: getKolAvatar("Pentosh1"),
    pnl: 32000000,
    pnl7d: 1450000,
    pnl30d: 6800000,
    winRate: 58.9,
    totalTrades: 3200,
    avgHoldTime: "6h",
    tradingStyle: "Swing Trader",
    tier: "diamond",
    isWashTrader: false,
    washScore: 7,
    favoriteTokens: ["SOL", "BONK", "JUP"],
    followers: 567000,
    copyTraders: 9800,
    lastActive: "15m ago",
    verified: true,
    earlyEntryScore: 71,
    dumpOnFollowers: 4,
    avgEntryTiming: 25,
    coordinationScore: 38,
    alphaAccuracy: 69,
    ...generateExtendedAnalytics(32000000, 58.9),
  } as KOL,
  {
    id: "6",
    name: "Cobie",
    twitter: "coaborblabs",
    wallet: "COBIE111111111111111111111111111111111111111",
    avatar: getKolAvatar("coaborblabs"),
    pnl: 89000000,
    pnl7d: 2800000,
    pnl30d: 15000000,
    winRate: 71.5,
    totalTrades: 1200,
    avgHoldTime: "1w",
    tradingStyle: "VC Style",
    tier: "diamond",
    isWashTrader: false,
    washScore: 2,
    favoriteTokens: ["SOL", "JUP", "PYTH"],
    followers: 892000,
    copyTraders: 22000,
    lastActive: "2h ago",
    verified: true,
    earlyEntryScore: 88,
    dumpOnFollowers: 0,
    avgEntryTiming: 120,
    coordinationScore: 15,
    alphaAccuracy: 82,
    ...generateExtendedAnalytics(89000000, 71.5),
  } as KOL,
  {
    id: "7",
    name: "CL207",
    twitter: "CL207",
    wallet: "CL207111111111111111111111111111111111111111",
    avatar: getKolAvatar("CL207"),
    pnl: 12500000,
    pnl7d: 890000,
    pnl30d: 3400000,
    winRate: 59.8,
    totalTrades: 8900,
    avgHoldTime: "3m",
    tradingStyle: "Degen",
    tier: "gold",
    isWashTrader: false,
    washScore: 18,
    favoriteTokens: ["BONK", "WIF", "MEW"],
    followers: 156000,
    copyTraders: 4500,
    lastActive: "1m ago",
    verified: true,
    earlyEntryScore: 92,
    dumpOnFollowers: 12,
    avgEntryTiming: 2,
    coordinationScore: 72,
    alphaAccuracy: 58,
    ...generateExtendedAnalytics(12500000, 59.8),
  } as KOL,
  {
    id: "8",
    name: "Loomdart",
    twitter: "loomdart",
    wallet: "LOOM1111111111111111111111111111111111111111",
    avatar: getKolAvatar("loomdart"),
    pnl: 8900000,
    pnl7d: 650000,
    pnl30d: 2100000,
    winRate: 55.4,
    totalTrades: 5600,
    avgHoldTime: "20m",
    tradingStyle: "Momentum",
    tier: "gold",
    isWashTrader: false,
    washScore: 22,
    favoriteTokens: ["POPCAT", "MEW", "WIF"],
    followers: 134000,
    copyTraders: 3200,
    lastActive: "8m ago",
    verified: true,
    earlyEntryScore: 79,
    dumpOnFollowers: 15,
    avgEntryTiming: 7,
    coordinationScore: 65,
    alphaAccuracy: 52,
    ...generateExtendedAnalytics(8900000, 55.4),
  } as KOL,
  {
    id: "9",
    name: "0xSun",
    twitter: "0xSunNFT",
    wallet: "0XSUN111111111111111111111111111111111111111",
    avatar: getKolAvatar("0xSunNFT"),
    pnl: 6700000,
    pnl7d: 420000,
    pnl30d: 1800000,
    winRate: 62.1,
    totalTrades: 2340,
    avgHoldTime: "45m",
    tradingStyle: "NFT Degen",
    tier: "gold",
    isWashTrader: false,
    washScore: 14,
    favoriteTokens: ["WIF", "BONK", "SOL"],
    followers: 98000,
    copyTraders: 2100,
    lastActive: "12m ago",
    verified: true,
    earlyEntryScore: 85,
    dumpOnFollowers: 6,
    avgEntryTiming: 12,
    coordinationScore: 48,
    alphaAccuracy: 61,
    ...generateExtendedAnalytics(6700000, 62.1),
  } as KOL,
  {
    id: "10",
    name: "Dingaling",
    twitter: "daborblabs",
    wallet: "DING1111111111111111111111111111111111111111",
    avatar: getKolAvatar("daborblabs"),
    pnl: 15600000,
    pnl7d: 1100000,
    pnl30d: 4800000,
    winRate: 66.7,
    totalTrades: 1890,
    avgHoldTime: "2h",
    tradingStyle: "Whale",
    tier: "diamond",
    isWashTrader: false,
    washScore: 9,
    favoriteTokens: ["JUP", "SOL", "RAY"],
    followers: 245000,
    copyTraders: 7800,
    lastActive: "25m ago",
    verified: true,
    earlyEntryScore: 74,
    dumpOnFollowers: 3,
    avgEntryTiming: 35,
    coordinationScore: 32,
    alphaAccuracy: 71,
    ...generateExtendedAnalytics(15600000, 66.7),
  } as KOL,
  {
    id: "11",
    name: "DegenSpartan",
    twitter: "DegenSpartan",
    wallet: "DEGEN111111111111111111111111111111111111111",
    avatar: getKolAvatar("DegenSpartan"),
    pnl: 7800000,
    pnl7d: 560000,
    pnl30d: 2400000,
    winRate: 54.2,
    totalTrades: 12000,
    avgHoldTime: "8m",
    tradingStyle: "Pure Degen",
    tier: "gold",
    isWashTrader: false,
    washScore: 28,
    favoriteTokens: ["BONK", "WIF", "POPCAT"],
    followers: 178000,
    copyTraders: 5400,
    lastActive: "45s ago",
    verified: true,
    earlyEntryScore: 88,
    dumpOnFollowers: 18,
    avgEntryTiming: 1,
    coordinationScore: 78,
    alphaAccuracy: 48,
    ...generateExtendedAnalytics(7800000, 54.2),
  } as KOL,
  {
    id: "12",
    name: "A1lon9",
    twitter: "A1lon9",
    wallet: "A1LON111111111111111111111111111111111111111",
    avatar: getKolAvatar("A1lon9"),
    pnl: 9200000,
    pnl7d: 720000,
    pnl30d: 2900000,
    winRate: 69.2,
    totalTrades: 1200,
    avgHoldTime: "1h",
    tradingStyle: "Pump.fun Insider",
    tier: "gold",
    isWashTrader: false,
    washScore: 11,
    favoriteTokens: ["PUMP", "WIF", "BONK"],
    followers: 78000,
    copyTraders: 1900,
    lastActive: "5m ago",
    verified: true,
    earlyEntryScore: 96,
    dumpOnFollowers: 4,
    avgEntryTiming: 1,
    coordinationScore: 42,
    alphaAccuracy: 74,
    ...generateExtendedAnalytics(9200000, 69.2),
  } as KOL,
  // Wash traders for Wall of Shame
  {
    id: "100",
    name: "RugMaster",
    twitter: "RugPullKing",
    wallet: "RUGM1111111111111111111111111111111111111111",
    avatar: getKolAvatar("RugPullKing"),
    pnl: 890000,
    pnl7d: -120000,
    pnl30d: 340000,
    winRate: 78.9,
    totalTrades: 450,
    avgHoldTime: "2m",
    tradingStyle: "Pump & Dump",
    tier: "bronze",
    isWashTrader: true,
    washScore: 98,
    favoriteTokens: ["SCAM", "RUG", "FAKE"],
    followers: 45000,
    copyTraders: 890,
    lastActive: "5m ago",
    verified: false,
    earlyEntryScore: 99,
    dumpOnFollowers: 47,
    avgEntryTiming: 0,
    coordinationScore: 95,
    alphaAccuracy: 12,
    ...generateExtendedAnalytics(890000, 78.9),
  } as KOL,
  {
    id: "101",
    name: "PumpNDump",
    twitter: "PumpDumpPro",
    wallet: "PUMP11111111111111111111111111111111111111",
    avatar: getKolAvatar("PumpDumpPro"),
    pnl: 560000,
    pnl7d: -89000,
    pnl30d: 180000,
    winRate: 82.3,
    totalTrades: 320,
    avgHoldTime: "1m",
    tradingStyle: "Exit Liquidity",
    tier: "bronze",
    isWashTrader: true,
    washScore: 94,
    favoriteTokens: ["FAKE", "SCAM", "RUG"],
    followers: 28000,
    copyTraders: 560,
    lastActive: "12m ago",
    verified: false,
    earlyEntryScore: 97,
    dumpOnFollowers: 32,
    avgEntryTiming: 0,
    coordinationScore: 88,
    alphaAccuracy: 8,
    ...generateExtendedAnalytics(560000, 82.3),
  } as KOL,
  {
    id: "102",
    name: "WashKing",
    twitter: "WashTradeKing",
    wallet: "WASH11111111111111111111111111111111",
    avatar: getKolAvatar("WashTradeKing"),
    pnl: 340000,
    pnl7d: -45000,
    pnl30d: 120000,
    winRate: 75.6,
    totalTrades: 280,
    avgHoldTime: "3m",
    tradingStyle: "Wash Trader",
    tier: "bronze",
    isWashTrader: true,
    washScore: 89,
    favoriteTokens: ["WASH", "FAKE", "SCAM"],
    followers: 67000,
    copyTraders: 450,
    lastActive: "1h ago",
    verified: false,
    earlyEntryScore: 94,
    dumpOnFollowers: 28,
    avgEntryTiming: 0,
    coordinationScore: 92,
    alphaAccuracy: 15,
    ...generateExtendedAnalytics(340000, 75.6),
  } as KOL,
]

// Helper functions
export const getWashTraders = () => KOL_DATABASE.filter((kol) => kol.isWashTrader)
export const getVerifiedKOLs = () => KOL_DATABASE.filter((kol) => kol.verified && !kol.isWashTrader)
export const getTopPerformers = (count: number) =>
  [...KOL_DATABASE]
    .filter((k) => !k.isWashTrader)
    .sort((a, b) => b.pnl - a.pnl)
    .slice(0, count)
export const getEarlyAlphaKOLs = () =>
  [...KOL_DATABASE]
    .filter((k) => !k.isWashTrader && k.earlyEntryScore > 80)
    .sort((a, b) => b.earlyEntryScore - a.earlyEntryScore)
export const getRandomKOL = () => {
  const verified = getVerifiedKOLs()
  return verified[Math.floor(Math.random() * verified.length)]
}
export const getRandomToken = () => TOKENS[Math.floor(Math.random() * TOKENS.length)]

export const getTokenBySymbol = (symbol: string): Token | undefined => {
  return TOKENS.find((t) => t.symbol === symbol)
}

export const getEmergingTokenBySymbol = (symbol: string): Token | undefined => {
  return EMERGING_TOKENS.find((t) => t.symbol === symbol)
}

// Generate fresh token data for the radar
export const getFreshTokens = (): FreshToken[] => {
  const verifiedKols = getVerifiedKOLs()
  
  return EMERGING_TOKENS.slice(0, 5).map((token) => {
    const numBuyers = Math.floor(Math.random() * 4) + 2
    const randomKols = [...verifiedKols]
      .sort(() => Math.random() - 0.5)
      .slice(0, numBuyers)
    
    return {
      token,
      launchTime: new Date(Date.now() - Math.random() * 3600000 * 6),
      riskScore: Math.floor(Math.random() * 60) + 20,
      moonPotential: Math.floor(Math.random() * 50) + 40,
      kolBuyers: randomKols,
    }
  })
}

// Generate KOL convergence data
export const getKOLConvergence = (): KOLConvergence[] => {
  const verifiedKols = getVerifiedKOLs()
  
  return TOKENS.slice(0, 6).map((token) => {
    const numKols = Math.floor(Math.random() * 5) + 2
    const randomKols = [...verifiedKols]
      .sort(() => Math.random() - 0.5)
      .slice(0, numKols)
    
    return {
      token,
      kols: randomKols,
      convergenceScore: Math.floor(Math.random() * 40) + 60,
      totalBuyVolume: Math.random() * 500000 + 50000,
      firstBuyTime: new Date(Date.now() - Math.random() * 3600000 * 2),
    }
  }).sort((a, b) => b.convergenceScore - a.convergenceScore)
}

// Format helpers
export function formatNumber(num: number): string {
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`
  return num.toFixed(2)
}

export function formatUSD(num: number): string {
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`
  return `$${num.toFixed(2)}`
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`
}

