# Dice Game Environment Variables

Add these environment variables to your `.env.local` file to configure the dice game.

## Required for Dice Game

```bash
# ===========================================
# DICE GAME SERVER CONFIGURATION
# ===========================================

# Server port for the dice game backend
DICE_SERVER_PORT=5001

# URL for Next.js to proxy to dice server
DICE_SERVER_URL=http://localhost:5001

# Enable/disable the dice game
DICE_ENABLED=true

# ===========================================
# HOUSE WALLET (CRITICAL - KEEP SECRET!)
# ===========================================
# The house wallet holds funds for payouts and receives lost bets
# Format: Base58 encoded secret key
# Generate a new wallet: solana-keygen new --no-outfile
HOUSE_WALLET_SECRET=your_base58_encoded_secret_key_here

# House wallet public address (for reference)
HOUSE_WALLET_ADDRESS=your_house_wallet_public_address

# ===========================================
# BETTING TOKEN CONFIGURATION
# ===========================================
# The SPL token mint address for betting
DICE_TOKEN_MINT=your_spl_token_mint_address

# Token decimals (standard is 9 for most SPL tokens)
DICE_TOKEN_DECIMALS=9

# Token symbol for display in UI
NEXT_PUBLIC_DICE_TOKEN_SYMBOL=AQUA

# Token name
DICE_TOKEN_NAME=AQUA Token

# ===========================================
# GAME SETTINGS
# ===========================================
# House edge percentage (1.5 = 1.5% house advantage)
HOUSE_EDGE=1.5

# Minimum bet amount in tokens
MIN_BET_AMOUNT=1

# Maximum bet amount in tokens  
MAX_BET_AMOUNT=10000

# Maximum profit per bet (caps winnings to protect house bankroll)
MAX_PROFIT=5000

# ===========================================
# RATE LIMITING (Abuse Prevention)
# ===========================================
# Maximum bets per minute per user
MAX_BETS_PER_MINUTE=10

# Minimum time between bets in milliseconds
MIN_BET_INTERVAL_MS=3000

# ===========================================
# SECURITY
# ===========================================
# Wallet encryption key for dice game's wallet storage
# Must be a 64-character hex string (32 bytes)
# Generate: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
WALLET_ENCRYPTION_KEY=your_64_char_hex_key_here

# ===========================================
# FEES
# ===========================================
# Wallet address to receive platform fees (optional)
FEE_WALLET_ADDRESS=your_fee_wallet_address

# ===========================================
# ADMIN
# ===========================================
# Admin wallet addresses (comma-separated)
ADMIN_WALLET_ADDRESSES=admin_wallet_1,admin_wallet_2
```

## How to Configure

1. Copy the variables above to your `.env.local` file
2. Fill in your actual values
3. Restart both servers (`pnpm dev:all`)

## Running the Dice Game

```bash
# Run both Next.js and Dice Server together
pnpm dev:all

# Or run separately:
pnpm dev          # Next.js frontend
pnpm dice:dev     # Dice game backend
```

## Security Notes

- **NEVER commit your `.env` file** - It contains secrets
- **Secure your HOUSE_WALLET_SECRET** - This wallet controls all payouts
- **Use a dedicated house wallet** - Don't use your personal wallet
- **Fund the house wallet** - It needs tokens to pay out winners
- **Monitor the house balance** - Ensure it can cover max potential payouts

## Understanding the Settings

| Variable | Description | Example |
|----------|-------------|---------|
| `HOUSE_EDGE` | Your profit margin on all bets | 1.5 = 1.5% edge |
| `MIN_BET_AMOUNT` | Smallest allowed bet | 1 token |
| `MAX_BET_AMOUNT` | Largest allowed bet | 10000 tokens |
| `MAX_PROFIT` | Cap on winnings per bet | 5000 tokens |
| `MAX_BETS_PER_MINUTE` | Rate limit per user | 10 bets/min |

