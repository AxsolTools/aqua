/**
 * Jito Bundle Submission Library
 * 
 * Handles atomic transaction bundles for MEV protection
 * Ported from raydiumspltoken/jito_bundles.js for Next.js
 * 
 * Key features:
 * - Multiple block engine endpoint support with rotation
 * - Automatic retry with exponential backoff
 * - Rate limit handling
 * - Sequential fallback if bundle fails
 */

import { VersionedTransaction, Connection, Transaction } from "@solana/web3.js"
import bs58 from "bs58"

// ============================================================================
// CONFIGURATION
// ============================================================================

// Jito Block Engine endpoints (mainnet)
const JITO_BLOCK_ENGINE_URLS = [
  "https://ny.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
  "https://tokyo.mainnet.block-engine.jito.wtf/api/v1/bundles",
]

// Jito Bundle status endpoint
const JITO_BUNDLE_STATUS_URL = "https://bundles.jito.wtf/api/v1/bundles"

// Jito tip accounts (rotate for load balancing)
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
  "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
  "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
  "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
  "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
]

// Default configuration
const DEFAULT_BUNDLE_RETRIES = 5
const BUNDLE_REQUEST_TIMEOUT_MS = 30000
const MIN_RETRY_DELAY_MS = 1000
const MAX_RETRY_DELAY_MS = 60000
const BACKOFF_FACTOR = 1.5

// ============================================================================
// TYPES
// ============================================================================

export interface BundleSubmitResult {
  success: boolean
  bundleId?: string
  endpoint?: string
  attempts: number
  signatures?: string[]
  error?: string
}

export interface BundleStatusResult {
  status: "pending" | "landed" | "failed" | "unknown"
  landedSlot?: number
  error?: string
}

export interface BundleOptions {
  retries?: number
  timeoutMs?: number
  priorityFeeLamports?: number
  useJito?: boolean
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Get a random Jito tip account for bundle tips
 */
export function getJitoTipAccount(): string {
  return JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
}

/**
 * Serialize transactions for bundle submission
 */
function serializeTransactions(
  transactions: (VersionedTransaction | Transaction)[]
): string[] {
  if (transactions.length > 5) {
    throw new Error("Bundles support maximum 5 transactions")
  }

  return transactions.map((tx) => {
    if (tx instanceof VersionedTransaction) {
      return bs58.encode(tx.serialize())
    }
    return bs58.encode(
      tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      })
    )
  })
}

/**
 * Extract signatures from signed transactions
 */
function extractSignatures(
  transactions: (VersionedTransaction | Transaction)[]
): string[] {
  return transactions.map((tx) => {
    if (tx instanceof VersionedTransaction) {
      return bs58.encode(tx.signatures[0])
    }
    return tx.signature ? bs58.encode(tx.signature) : ""
  })
}

// ============================================================================
// BUNDLE SUBMISSION
// ============================================================================

/**
 * Submit a bundle of signed transactions to Jito block engine
 */
export async function submitBundle(
  transactions: (VersionedTransaction | Transaction)[],
  options: BundleOptions = {}
): Promise<BundleSubmitResult> {
  const maxAttempts = options.retries ?? DEFAULT_BUNDLE_RETRIES
  const timeoutMs = options.timeoutMs ?? BUNDLE_REQUEST_TIMEOUT_MS

  // Serialize transactions
  const serializedTransactions = serializeTransactions(transactions)
  const signatures = extractSignatures(transactions)

  // Shuffle endpoints for load balancing
  const endpoints = shuffleArray([...JITO_BLOCK_ENGINE_URLS])

  let lastError: Error | null = null
  let endpointIndex = 0

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const endpoint = endpoints[endpointIndex]

    console.log(
      `[JITO] Submitting bundle with ${transactions.length} txs (attempt ${attempt}/${maxAttempts})`
    )
    console.log(`[JITO] Endpoint: ${endpoint}`)

    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [serializedTransactions],
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      const data = await response.json()

      if (data.error) {
        throw new Error(`Jito error: ${JSON.stringify(data.error)}`)
      }

      const bundleId = data.result
      if (!bundleId) {
        throw new Error("Bundle submission succeeded but no result returned")
      }

      console.log(`[JITO] Bundle submitted: ${bundleId}`)

      return {
        success: true,
        bundleId,
        endpoint,
        attempts: attempt,
        signatures,
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error))
      console.error(`[JITO] Bundle attempt ${attempt} failed:`, lastError.message)

      // Determine if we should retry
      const isRetryable = isRetryableError(lastError)
      if (!isRetryable || attempt >= maxAttempts) {
        break
      }

      // Calculate backoff delay
      const baseDelay = MIN_RETRY_DELAY_MS * Math.pow(BACKOFF_FACTOR, attempt - 1)
      const jitter = Math.random() * 0.5 + 0.5 // 0.5 to 1.0
      const waitMs = Math.min(baseDelay * jitter, MAX_RETRY_DELAY_MS)

      console.log(`[JITO] Retrying in ${(waitMs / 1000).toFixed(1)}s...`)

      // Rotate endpoint
      endpointIndex = (endpointIndex + 1) % endpoints.length

      await delay(waitMs)
    }
  }

  return {
    success: false,
    attempts: maxAttempts,
    signatures,
    error: lastError?.message || "Unknown error",
  }
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: Error): boolean {
  const message = error.message.toLowerCase()
  
  // Non-retryable errors
  if (message.includes("insufficient funds")) return false
  if (message.includes("invalid signature")) return false
  if (message.includes("account not found")) return false

  // Retryable errors
  if (message.includes("rate limit")) return true
  if (message.includes("timeout")) return true
  if (message.includes("network")) return true
  if (message.includes("blockhash")) return true
  if (message.includes("temporarily unavailable")) return true
  if (message.includes("500")) return true
  if (message.includes("502")) return true
  if (message.includes("503")) return true

  return true // Default to retryable
}

// ============================================================================
// BUNDLE STATUS
// ============================================================================

/**
 * Check bundle status from Jito
 */
export async function getBundleStatus(bundleId: string): Promise<BundleStatusResult> {
  try {
    const response = await fetch(JITO_BUNDLE_STATUS_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBundleStatuses",
        params: [[bundleId]],
      }),
    })

    const data = await response.json()

    if (data.error) {
      return { status: "unknown", error: JSON.stringify(data.error) }
    }

    const statuses = data.result?.value
    if (!statuses || statuses.length === 0) {
      return { status: "pending" }
    }

    const bundleStatus = statuses[0]
    if (!bundleStatus) {
      return { status: "pending" }
    }

    // Check confirmation status
    if (bundleStatus.confirmation_status === "finalized" || 
        bundleStatus.confirmation_status === "confirmed") {
      return {
        status: "landed",
        landedSlot: bundleStatus.slot,
      }
    }

    if (bundleStatus.err) {
      return {
        status: "failed",
        error: JSON.stringify(bundleStatus.err),
      }
    }

    return { status: "pending" }
  } catch (error) {
    console.error("[JITO] Failed to check bundle status:", error)
    return { status: "unknown", error: String(error) }
  }
}

/**
 * Wait for bundle to be confirmed
 */
export async function waitForBundleConfirmation(
  bundleId: string,
  connection: Connection,
  signatures: string[],
  timeoutMs: number = 60000
): Promise<{
  success: boolean
  status: string
  slot?: number
  error?: string
}> {
  const startTime = Date.now()
  const pollInterval = 2000

  console.log(`[JITO] Waiting for bundle ${bundleId} confirmation...`)

  while (Date.now() - startTime < timeoutMs) {
    // Check Jito bundle status
    const jitoStatus = await getBundleStatus(bundleId)

    if (jitoStatus.status === "landed") {
      console.log(`[JITO] Bundle landed at slot ${jitoStatus.landedSlot}`)
      return {
        success: true,
        status: "confirmed",
        slot: jitoStatus.landedSlot,
      }
    }

    if (jitoStatus.status === "failed") {
      console.error(`[JITO] Bundle failed:`, jitoStatus.error)
      return {
        success: false,
        status: "failed",
        error: jitoStatus.error,
      }
    }

    // Also check RPC for signature statuses
    if (signatures.length > 0) {
      try {
        const statuses = await connection.getSignatureStatuses(
          signatures.filter((s) => s.length > 0),
          { searchTransactionHistory: true }
        )

        const allConfirmed = statuses.value.every(
          (s) =>
            s &&
            (s.confirmationStatus === "confirmed" ||
              s.confirmationStatus === "finalized")
        )

        if (allConfirmed) {
          const highestSlot = Math.max(
            ...statuses.value.map((s) => s?.slot || 0)
          )
          console.log(`[JITO] All signatures confirmed at slot ${highestSlot}`)
          return {
            success: true,
            status: "confirmed",
            slot: highestSlot,
          }
        }

        // Check for failures
        const failed = statuses.value.find((s) => s?.err)
        if (failed) {
          return {
            success: false,
            status: "failed",
            error: JSON.stringify(failed.err),
          }
        }
      } catch (rpcError) {
        console.warn("[JITO] RPC status check failed:", rpcError)
      }
    }

    await delay(pollInterval)
  }

  return {
    success: false,
    status: "timeout",
    error: `Bundle not confirmed within ${timeoutMs / 1000}s`,
  }
}

// ============================================================================
// SEQUENTIAL FALLBACK
// ============================================================================

/**
 * Execute transactions sequentially as fallback when bundle fails
 */
export async function executeSequentialFallback(
  connection: Connection,
  transactions: (VersionedTransaction | Transaction)[],
  options: { skipPreflight?: boolean; maxRetries?: number } = {}
): Promise<{
  success: boolean
  signatures: string[]
  errors: string[]
}> {
  const signatures: string[] = []
  const errors: string[] = []
  const skipPreflight = options.skipPreflight ?? false
  const maxRetries = options.maxRetries ?? 3

  console.log(
    `[FALLBACK] Executing ${transactions.length} transactions sequentially...`
  )

  for (let i = 0; i < transactions.length; i++) {
    const tx = transactions[i]

    try {
      const rawTx =
        tx instanceof VersionedTransaction
          ? tx.serialize()
          : tx.serialize({ requireAllSignatures: true })

      const signature = await connection.sendRawTransaction(rawTx, {
        skipPreflight,
        maxRetries,
      })

      console.log(`[FALLBACK] Tx ${i + 1}/${transactions.length} sent: ${signature.slice(0, 8)}...`)

      // Wait for confirmation
      const confirmation = await connection.confirmTransaction(
        signature,
        "confirmed"
      )

      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`)
      }

      signatures.push(signature)

      // Small delay between transactions
      if (i < transactions.length - 1) {
        await delay(400)
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`[FALLBACK] Tx ${i + 1} failed:`, errorMsg)
      errors.push(errorMsg)

      // Continue with remaining transactions
    }
  }

  return {
    success: errors.length === 0,
    signatures,
    errors,
  }
}

// ============================================================================
// HIGH-LEVEL BUNDLE EXECUTION
// ============================================================================

/**
 * Execute a bundle with automatic fallback to sequential execution
 */
export async function executeBundle(
  connection: Connection,
  transactions: (VersionedTransaction | Transaction)[],
  options: BundleOptions & { sequentialFallback?: boolean } = {}
): Promise<{
  success: boolean
  bundleId?: string
  signatures: string[]
  method: "jito" | "sequential"
  error?: string
}> {
  const useSequentialFallback = options.sequentialFallback ?? true

  // Try Jito bundle first
  console.log(`[BUNDLE] Attempting Jito bundle with ${transactions.length} transactions`)

  const bundleResult = await submitBundle(transactions, options)

  if (bundleResult.success && bundleResult.bundleId) {
    // Wait for confirmation
    const confirmation = await waitForBundleConfirmation(
      bundleResult.bundleId,
      connection,
      bundleResult.signatures || [],
      60000
    )

    if (confirmation.success) {
      return {
        success: true,
        bundleId: bundleResult.bundleId,
        signatures: bundleResult.signatures || [],
        method: "jito",
      }
    }

    console.warn(`[BUNDLE] Jito bundle confirmation failed: ${confirmation.error}`)
  } else {
    console.warn(`[BUNDLE] Jito submission failed: ${bundleResult.error}`)
  }

  // Fallback to sequential execution
  if (useSequentialFallback) {
    console.log("[BUNDLE] Falling back to sequential execution...")

    const sequentialResult = await executeSequentialFallback(
      connection,
      transactions,
      { skipPreflight: false, maxRetries: 3 }
    )

    return {
      success: sequentialResult.success,
      signatures: sequentialResult.signatures,
      method: "sequential",
      error: sequentialResult.errors.length > 0
        ? sequentialResult.errors.join("; ")
        : undefined,
    }
  }

  return {
    success: false,
    signatures: bundleResult.signatures || [],
    method: "jito",
    error: bundleResult.error || "Bundle execution failed",
  }
}

