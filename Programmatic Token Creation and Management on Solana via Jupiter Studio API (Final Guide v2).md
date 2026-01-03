# Programmatic Token Creation and Management on Solana via Jupiter Studio API (Final Guide v2)

The Jupiter Exchange ecosystem provides a programmatic alternative to its web-based token launchpad, **Jupiter Studio**, through a dedicated **Studio API** [1]. This API enables developers to create a Dynamic Bonding Curve (DBC) pool for a new token on the Solana blockchain and, crucially, to manage it post-launch, including monitoring and claiming accrued fees.

## 1. API Key Acquisition and Cost

Access to the Jupiter API, including the Studio API, is managed through the **Jupiter Portal** and includes a **Free** tier [2].

### 1.1. How to Get the API Key

1.  **Open the Portal**: Navigate to the [Jupiter Portal](https://portal.jup.ag/) [2].
2.  **Connect**: Sign up or connect your account, typically via email.
3.  **Generate Key**: Once logged in, generate your API key from the dashboard.

Your API key must be included in the request header as `x-api-key`.

### 1.2. API Cost and Tiers

The Jupiter API is **free to use** for its public and documented APIs via the Free tier. The cost is only incurred if you require higher rate limits or specialized services.

| Tier | Rate Limit Model | Base URL | Cost | Primary Use Case |
| :--- | :--- | :--- | :--- | :--- |
| **Free** | Fixed Rate Limit | `https://api.jup.ag/` | **Free** | Low-volume usage; suitable for initial development and the Studio API. |
| **Pro** | Fixed Tiered Rate Limits | `https://api.jup.ag/` | Paid (Subscription) | Projects requiring guaranteed, higher request per second (RPS) limits. |
| **Ultra** | Dynamic Rate Limits | `https://api.jup.ag/ultra/` | Free/Paid | High-volume swap-focused applications where rate limits scale with executed swap volume. |

## 2. Token Metadata and Logo Handling

The Jupiter Studio API simplifies the process of handling off-chain token assets:

*   **Metadata Standard**: The API requires the token metadata to conform to the **Metaplex Token Metadata Standard** [3]. This ensures compatibility with wallets and explorers across the Solana ecosystem.
*   **Storage**: Jupiter provides a free, temporary storage solution for the token image and metadata JSON file via **presigned URLs**. This eliminates the need for the developer to manage storage on services like Arweave or IPFS for the launch. You simply `PUT` your files to the provided URLs, and Jupiter hosts them statically.

## 3. Prerequisites and Setup

To utilize the Studio API, you must have:

1.  **API Key**: A valid key obtained from the Jupiter Portal, passed in the `x-api-key` header.
2.  **Solana Wallet**: A keypair (wallet) to sign the transaction, which will be designated as the token creator.
3.  **Development Libraries**: Libraries such as `@solana/web3.js` for transaction handling and signing, and a method for making HTTP requests (e.g., `fetch` in Node.js).

## 4. Step-by-Step Guide to Token Creation

*(Sections 4.1 to 4.4 on `create-tx`, Upload Image, Upload Metadata, and `submit` remain the same as the previous guide, detailing the token creation process.)*

## 5. Post-Launch Management: Monitoring and Claiming Fees

Once your token is launched, the DBC pool will accrue fees from trading activity. The Studio API provides endpoints to monitor these fees and generate the transaction required to claim them [4].

### 5.1. Step 5.1: Get Pool Address

First, you need the address of the Dynamic Bonding Curve (DBC) pool associated with your token's mint address.

**Endpoint:** `https://api.jup.ag/studio/v1/dbc-pool/addresses/{mint}`

```javascript
const MINT_ADDRESS = 'YourTokenMintAddressHere'; // e.g., from the create-tx response

const poolAddressResponse = await (
    await fetch(
      `https://api.jup.ag/studio/v1/dbc-pool/addresses/${MINT_ADDRESS}`,
      {
        headers: {
          'x-api-key': API_KEY,
        },
      }
    )
).json();

const dbcPoolAddress = poolAddressResponse.data.dbcPoolAddress;
console.log("DBC Pool Address:", dbcPoolAddress);
```

### 5.2. Step 5.2: Monitor Unclaimed Fees

To monitor the real-time balance of unclaimed fees, you can repeatedly call the `/dbc/fee` endpoint.

**Endpoint:** `https://api.jup.ag/studio/v1/dbc/fee`

```javascript
// Function to check fees
async function checkFees(poolAddress) {
    const feeResponse = await (
        await fetch (
          'https://api.jup.ag/studio/v1/dbc/fee',
          {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': API_KEY,
            },
            body: JSON.stringify({
                poolAddress: poolAddress,
            })
        })
    ).json();
    
    // The response will contain details on total and unclaimed fees
    console.log("Fee Monitoring Response:", feeResponse);
    // feeResponse.data.unclaimedFee will show the current balance
    return feeResponse.data.unclaimedFee; 
}

// Example of real-time monitoring (polling)
// Note: For high-frequency, real-time monitoring, consider using a dedicated RPC service 
// to subscribe to account changes, as suggested in the Jupiter docs.
const unclaimedFee = await checkFees(dbcPoolAddress);
console.log(`Current Unclaimed Fee: ${unclaimedFee}`);
```

### 5.3. Step 5.3: Create Claim Fee Transaction

When you are ready to claim the fees, use the `/dbc/fee/create-tx` endpoint to generate the unsigned transaction.

**Endpoint:** `https://api.jup.ag/studio/v1/dbc/fee/create-tx`

```javascript
const claimTransactionResponse = await (
    await fetch (
      'https://api.jup.ag/studio/v1/dbc/fee/create-tx',
      {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': API_KEY,
        },
        body: JSON.stringify({
            ownerWallet: wallet.publicKey.toBase58(), // Your wallet address
            poolAddress: dbcPoolAddress,
            // Max amount to claim in quote token (e.g., USDC). 
            // Set high to claim all available fees.
            maxQuoteAmount: 1000000000, 
        })
    })
).json();

const claimTransaction = claimTransactionResponse.transaction;
console.log("Unsigned Claim Transaction:", claimTransaction);
```

### 5.4. Step 5.4: Sign and Submit Claim Transaction

The final step is to sign the base64-encoded claim transaction and submit it directly to the Solana network using your RPC connection (as detailed in the Jupiter documentation's Transaction Sending Example).

```javascript
// Assume 'connection' is an established Connection object from @solana/web3.js
// Assume 'claimTransaction' is the base64 string from the previous step

// 1. Deserialize and Sign
const transaction = VersionedTransaction.deserialize(
    Buffer.from(claimTransaction, 'base64')
);
transaction.sign([wallet]); // Sign with your creator wallet
const transactionBinary = transaction.serialize();

// 2. Submit to Solana Network
const signature = await connection.sendRawTransaction(transactionBinary, {
  maxRetries: 0,
  skipPreflight: true,
});

console.log(`Claim Transaction sent: https://solscan.io/tx/${signature}`);

// You would then wait for confirmation as shown in the Jupiter docs.
```

***

## References

[1] Jupiter Developers. *Create Token (Beta) - Studio API*. [https://dev.jup.ag/docs/studio-api/create-token](https://dev.jup.ag/docs/studio-api/create-token)
[2] Jupiter Developers. *Setting Up API Key*. [https://dev.jup.ag/portal/setup](https://dev.jup.ag/portal/setup)
[3] Metaplex. *Token Metadata*. [https://developers.metaplex.com/token-metadata](https://developers.metaplex.com/token-metadata)
[4] Jupiter Developers. *Claim Fee (Beta) - Studio API*. [https://dev.jup.ag/docs/studio-api/claim-fee](https://dev.jup.ag/docs/studio-api/claim-fee)
