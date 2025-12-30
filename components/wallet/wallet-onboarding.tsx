"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { TerminalPanel, TerminalInput, TerminalButton } from "@/components/ui/terminal-panel"

type OnboardingStep = "choice" | "generate" | "import" | "backup" | "complete"

export function WalletOnboarding() {
  const { isOnboarding, setIsOnboarding, refreshWallets, userId, setUserId } = useAuth()
  const [step, setStep] = useState<OnboardingStep>("choice")
  const [generatedWallet, setGeneratedWallet] = useState<{
    publicKey: string
    secretKey: string
    mnemonic: string
  } | null>(null)
  const [importData, setImportData] = useState("")
  const [walletLabel, setWalletLabel] = useState("")
  const [backupConfirmed, setBackupConfirmed] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [error, setError] = useState("")

  if (!isOnboarding) return null

  const handleGenerateWallet = async () => {
    setIsProcessing(true)
    setError("")

    try {
      const response = await fetch("/api/wallet/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: walletLabel || "Main Wallet",
          userId: userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      if (data.userId) {
        setUserId(data.userId)
      }

      setGeneratedWallet({
        publicKey: data.publicKey,
        secretKey: data.secretKey,
        mnemonic: data.mnemonic,
      })
      setStep("backup")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate wallet")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleImportWallet = async () => {
    setIsProcessing(true)
    setError("")

    try {
      const response = await fetch("/api/wallet/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secretKey: importData.trim(),
          label: walletLabel || "Imported Wallet",
          userId: userId,
        }),
      })

      const data = await response.json()

      if (!response.ok) throw new Error(data.error)

      if (data.userId) {
        setUserId(data.userId)
      }

      await refreshWallets()
      setStep("complete")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to import wallet")
    } finally {
      setIsProcessing(false)
    }
  }

  const handleBackupComplete = async () => {
    if (!backupConfirmed) {
      setError("You must confirm you have saved your recovery phrase")
      return
    }

    await refreshWallets()
    setStep("complete")
  }

  const handleClose = () => {
    setIsOnboarding(false)
    setStep("choice")
    setGeneratedWallet(null)
    setImportData("")
    setWalletLabel("")
    setBackupConfirmed(false)
    setError("")
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-[#030a12]/95 backdrop-blur-xl"
        onClick={step === "complete" ? handleClose : undefined}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-lg"
      >
        <TerminalPanel title="WALLET_INIT" className="rounded-lg">
          <AnimatePresence mode="wait">
            {step === "choice" && (
              <motion.div
                key="choice"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                <button
                  onClick={handleClose}
                  className="flex items-center gap-2 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-colors"
                >
                  {"<-"} BACK
                </button>

                <div className="text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded border-2 border-[var(--aqua-primary)] flex items-center justify-center bg-black/30">
                    <span className="font-mono text-2xl text-[var(--aqua-primary)] terminal-glow-aqua">◇</span>
                  </div>
                  <div className="font-mono text-lg text-[var(--aqua-primary)] terminal-glow-aqua mb-2">
                    AQUARIUS_AUTH
                  </div>
                  <div className="font-mono text-xs text-[var(--text-muted)]">
                    {">"} Your wallet is your identity
                    <span className="cursor-blink" />
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={() => setStep("generate")}
                    className="w-full group relative overflow-hidden rounded border border-[var(--terminal-border)] hover:border-[var(--aqua-primary)] transition-all bg-black/20"
                  >
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded border border-[var(--aqua-primary)]/50 bg-[var(--aqua-subtle)] flex items-center justify-center font-mono text-[var(--aqua-primary)]">
                        +
                      </div>
                      <div className="text-left flex-1 font-mono">
                        <div className="text-sm text-[var(--text-primary)]">$ generate_wallet</div>
                        <div className="text-xs text-[var(--text-muted)]">// Create new Solana keypair</div>
                      </div>
                      <span className="font-mono text-xs text-[var(--text-muted)] group-hover:text-[var(--aqua-primary)]">
                        {"->"}
                      </span>
                    </div>
                  </button>

                  <button
                    onClick={() => setStep("import")}
                    className="w-full group relative overflow-hidden rounded border border-[var(--terminal-border)] hover:border-[var(--aqua-primary)] transition-all bg-black/20"
                  >
                    <div className="p-4 flex items-center gap-4">
                      <div className="w-10 h-10 rounded border border-[var(--terminal-border)] bg-black/30 flex items-center justify-center font-mono text-[var(--text-muted)]">
                        ↑
                      </div>
                      <div className="text-left flex-1 font-mono">
                        <div className="text-sm text-[var(--text-primary)]">$ import_wallet</div>
                        <div className="text-xs text-[var(--text-muted)]">// Use existing private key</div>
                      </div>
                      <span className="font-mono text-xs text-[var(--text-muted)] group-hover:text-[var(--aqua-primary)]">
                        {"->"}
                      </span>
                    </div>
                  </button>
                </div>

                <div className="font-mono text-[10px] text-center text-[var(--text-muted)] border-t border-[var(--terminal-border)] pt-4">
                  {">"} ENCRYPTION: AES-256-GCM | STORAGE: ENCRYPTED_DB
                </div>
              </motion.div>
            )}

            {step === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <button
                  onClick={() => setStep("choice")}
                  className="flex items-center gap-2 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-colors"
                >
                  {"<-"} BACK
                </button>

                <div className="font-mono">
                  <div className="text-sm text-[var(--aqua-primary)] mb-1">$ generate_wallet</div>
                  <div className="text-xs text-[var(--text-muted)]">{">"} Enter wallet identifier</div>
                </div>

                <div className="space-y-4">
                  <TerminalInput
                    label="WALLET_LABEL"
                    value={walletLabel}
                    onChange={(e) => setWalletLabel(e.target.value)}
                    placeholder="main_wallet"
                  />

                  {error && (
                    <div className="font-mono text-xs text-[var(--terminal-red)] bg-[var(--terminal-red)]/10 p-2 rounded border border-[var(--terminal-red)]/30">
                      ERROR: {error}
                    </div>
                  )}

                  <TerminalButton onClick={handleGenerateWallet} disabled={isProcessing} className="w-full">
                    {isProcessing ? "GENERATING..." : "EXECUTE"}
                  </TerminalButton>
                </div>
              </motion.div>
            )}

            {step === "import" && (
              <motion.div
                key="import"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <button
                  onClick={() => setStep("choice")}
                  className="flex items-center gap-2 font-mono text-xs text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-colors"
                >
                  {"<-"} BACK
                </button>

                <div className="font-mono">
                  <div className="text-sm text-[var(--aqua-primary)] mb-1">$ import_wallet</div>
                  <div className="text-xs text-[var(--text-muted)]">{">"} Paste private key or seed phrase</div>
                </div>

                <div className="space-y-4">
                  <TerminalInput
                    label="WALLET_LABEL"
                    value={walletLabel}
                    onChange={(e) => setWalletLabel(e.target.value)}
                    placeholder="imported_wallet"
                  />

                  <div className="space-y-1.5">
                    <label className="block font-mono text-xs text-[var(--text-muted)] uppercase tracking-wider">
                      SECRET_KEY
                    </label>
                    <textarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="base58_private_key or seed_phrase..."
                      rows={3}
                      className="terminal-input w-full resize-none"
                    />
                  </div>

                  {error && (
                    <div className="font-mono text-xs text-[var(--terminal-red)] bg-[var(--terminal-red)]/10 p-2 rounded border border-[var(--terminal-red)]/30">
                      ERROR: {error}
                    </div>
                  )}

                  <TerminalButton
                    onClick={handleImportWallet}
                    disabled={isProcessing || !importData.trim()}
                    className="w-full"
                  >
                    {isProcessing ? "IMPORTING..." : "IMPORT"}
                  </TerminalButton>
                </div>
              </motion.div>
            )}

            {step === "backup" && generatedWallet && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-6"
              >
                <div className="p-3 rounded border border-[var(--terminal-amber)]/50 bg-[var(--terminal-amber)]/10">
                  <div className="flex items-start gap-3 font-mono text-xs">
                    <span className="text-[var(--terminal-amber)]">⚠</span>
                    <div>
                      <div className="text-[var(--terminal-amber)] font-semibold">CRITICAL: BACKUP_REQUIRED</div>
                      <div className="text-[var(--text-muted)] mt-1">
                        Save your recovery phrase. We cannot recover it for you.
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">PUBLIC_KEY</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 p-3 rounded bg-black/30 border border-[var(--terminal-border)] font-mono text-xs text-[var(--aqua-primary)] break-all">
                        {generatedWallet.publicKey}
                      </code>
                      <button
                        onClick={() => copyToClipboard(generatedWallet.publicKey)}
                        className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--aqua-primary)] p-2"
                      >
                        [CP]
                      </button>
                    </div>
                  </div>

                  <div>
                    <div className="font-mono text-[10px] text-[var(--text-muted)] uppercase mb-2">RECOVERY_PHRASE</div>
                    <div className="p-3 rounded bg-black/30 border border-[var(--terminal-amber)]/30">
                      <div className="grid grid-cols-3 gap-2">
                        {generatedWallet.mnemonic.split(" ").map((word, i) => (
                          <div key={i} className="flex items-center gap-2 font-mono text-xs">
                            <span className="text-[var(--text-muted)] w-4">{i + 1}.</span>
                            <span className="text-[var(--terminal-amber)]">{word}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => copyToClipboard(generatedWallet.mnemonic)}
                      className="mt-2 font-mono text-[10px] text-[var(--text-muted)] hover:text-[var(--aqua-primary)]"
                    >
                      {">"} COPY_PHRASE
                    </button>
                  </div>
                </div>

                <label className="flex items-center gap-3 p-3 rounded border border-[var(--terminal-border)] bg-black/20 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="w-4 h-4 accent-[var(--aqua-primary)]"
                  />
                  <span className="font-mono text-xs text-[var(--text-muted)]">
                    I have saved my recovery phrase securely
                  </span>
                </label>

                {error && <div className="font-mono text-xs text-[var(--terminal-red)]">ERROR: {error}</div>}

                <TerminalButton onClick={handleBackupComplete} className="w-full">
                  CONFIRM_BACKUP
                </TerminalButton>
              </motion.div>
            )}

            {step === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-6"
              >
                <div className="w-16 h-16 mx-auto rounded border-2 border-[var(--terminal-green)] flex items-center justify-center bg-[var(--terminal-green)]/10">
                  <span className="font-mono text-2xl text-[var(--terminal-green)]">✓</span>
                </div>
                <div className="font-mono">
                  <div className="text-lg text-[var(--terminal-green)] terminal-glow mb-2">WALLET_INITIALIZED</div>
                  <div className="text-xs text-[var(--text-muted)]">{">"} Ready to interact with Aquarius</div>
                </div>
                <TerminalButton onClick={handleClose} className="w-full">
                  CONTINUE
                </TerminalButton>
              </motion.div>
            )}
          </AnimatePresence>
        </TerminalPanel>
      </motion.div>
    </div>
  )
}
