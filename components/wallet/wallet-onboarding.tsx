"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
import { FintechCard, ActionButton } from "@/components/ui/fintech-card"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { 
  Wallet, 
  Plus, 
  Upload, 
  ArrowLeft, 
  Copy, 
  Check, 
  AlertTriangle,
  Shield,
  X
} from "lucide-react"

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
  const [copiedField, setCopiedField] = useState<string | null>(null)

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

      if (!response.ok) throw new Error(data.error?.message || data.error || "Failed to generate wallet")

      if (data.data?.sessionId) {
        setUserId(data.data.sessionId)
      }

      setGeneratedWallet({
        publicKey: data.data?.publicKey || data.publicKey,
        secretKey: data.data?.secretKey || data.secretKey || "",
        mnemonic: data.data?.mnemonic || data.mnemonic,
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

      if (!response.ok) throw new Error(data.error?.message || data.error || "Failed to import wallet")

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
      setError("Please confirm you have saved your recovery phrase")
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

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-zinc-950/90 backdrop-blur-md"
        onClick={step === "complete" ? handleClose : undefined}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="relative w-full max-w-md"
      >
        <FintechCard glow className="p-6">
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <AnimatePresence mode="wait">
            {step === "choice" && (
              <motion.div
                key="choice"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                className="space-y-6"
              >
                {/* Header */}
                <div className="text-center pt-4">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/10 border border-teal-500/20 flex items-center justify-center">
                    <Wallet className="w-8 h-8 text-teal-400" />
                  </div>
                  <h2 className="text-xl font-semibold text-zinc-100 mb-2">Connect Wallet</h2>
                  <p className="text-sm text-zinc-500">
                    Your wallet is your identity on Aquarius
                  </p>
                </div>

                {/* Options */}
                <div className="space-y-3">
                  <button
                    onClick={() => setStep("generate")}
                    className="w-full group p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-teal-500/50 hover:bg-zinc-800 transition-all flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center group-hover:bg-teal-500/20 transition-colors">
                      <Plus className="w-5 h-5 text-teal-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-medium text-zinc-100">Create New Wallet</h3>
                      <p className="text-sm text-zinc-500">Generate a new Solana keypair</p>
                    </div>
                  </button>

                  <button
                    onClick={() => setStep("import")}
                    className="w-full group p-4 rounded-xl bg-zinc-800/50 border border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800 transition-all flex items-center gap-4"
                  >
                    <div className="w-12 h-12 rounded-xl bg-zinc-700/50 border border-zinc-600 flex items-center justify-center group-hover:bg-zinc-700 transition-colors">
                      <Upload className="w-5 h-5 text-zinc-400" />
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="font-medium text-zinc-100">Import Wallet</h3>
                      <p className="text-sm text-zinc-500">Use existing private key</p>
                    </div>
                  </button>
                </div>

                {/* Security note */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                  <Shield className="w-4 h-4 text-teal-400 shrink-0" />
                  <p className="text-xs text-zinc-500">
                    Your keys are encrypted with AES-256-GCM and stored securely
                  </p>
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
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>

                <div>
                  <h2 className="text-xl font-semibold text-zinc-100 mb-1">Create New Wallet</h2>
                  <p className="text-sm text-zinc-500">Give your wallet a name to identify it</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Wallet Name
                    </label>
                    <Input
                      value={walletLabel}
                      onChange={(e) => setWalletLabel(e.target.value)}
                      placeholder="Main Wallet"
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}

                  <ActionButton 
                    onClick={handleGenerateWallet} 
                    loading={isProcessing}
                    className="w-full"
                  >
                    Generate Wallet
                  </ActionButton>
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
                  className="flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </button>

                <div>
                  <h2 className="text-xl font-semibold text-zinc-100 mb-1">Import Wallet</h2>
                  <p className="text-sm text-zinc-500">Enter your private key or seed phrase</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Wallet Name
                    </label>
                    <Input
                      value={walletLabel}
                      onChange={(e) => setWalletLabel(e.target.value)}
                      placeholder="Imported Wallet"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-zinc-400 mb-2">
                      Private Key or Seed Phrase
                    </label>
                    <Textarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="Enter base58 private key or 12/24 word seed phrase..."
                      rows={3}
                    />
                  </div>

                  {error && (
                    <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-sm text-red-400">{error}</p>
                    </div>
                  )}

                  <ActionButton
                    onClick={handleImportWallet}
                    loading={isProcessing}
                    disabled={!importData.trim()}
                    className="w-full"
                  >
                    Import Wallet
                  </ActionButton>
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
                {/* Warning Banner */}
                <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/20">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-amber-400">Save Your Recovery Phrase</h3>
                      <p className="text-sm text-zinc-400 mt-1">
                        Write it down and store it securely. We cannot recover it for you.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Public Key */}
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Wallet Address
                  </label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-teal-400 font-mono break-all">
                      {generatedWallet.publicKey}
                    </code>
                    <button
                      onClick={() => copyToClipboard(generatedWallet.publicKey, 'publicKey')}
                      className="p-3 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors"
                    >
                      {copiedField === 'publicKey' ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-zinc-400" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Recovery Phrase */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-sm font-medium text-zinc-400">
                      Recovery Phrase
                    </label>
                    <button
                      onClick={() => copyToClipboard(generatedWallet.mnemonic, 'mnemonic')}
                      className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1"
                    >
                      {copiedField === 'mnemonic' ? (
                        <>
                          <Check className="w-3 h-3 text-green-400" />
                          <span className="text-green-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          Copy all
                        </>
                      )}
                    </button>
                  </div>
                  <div className="p-4 rounded-lg bg-zinc-800 border border-amber-500/30">
                    <div className="grid grid-cols-3 gap-2">
                      {generatedWallet.mnemonic.split(" ").map((word, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-zinc-900/50">
                          <span className="text-xs text-zinc-600 w-4">{i + 1}.</span>
                          <span className="text-sm text-amber-300 font-medium">{word}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Confirmation */}
                <label className="flex items-center gap-3 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700 cursor-pointer hover:bg-zinc-800 transition-colors">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="w-4 h-4 rounded border-zinc-600 bg-zinc-800 text-teal-500 focus:ring-teal-500/30"
                  />
                  <span className="text-sm text-zinc-400">
                    I have securely saved my recovery phrase
                  </span>
                </label>

                {error && (
                  <p className="text-sm text-red-400">{error}</p>
                )}

                <ActionButton onClick={handleBackupComplete} className="w-full">
                  Continue
                </ActionButton>
              </motion.div>
            )}

            {step === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center py-6 space-y-6"
              >
                <div className="w-16 h-16 mx-auto rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
                  <Check className="w-8 h-8 text-green-400" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-zinc-100 mb-2">Wallet Connected!</h2>
                  <p className="text-sm text-zinc-500">You're ready to explore Aquarius</p>
                </div>
                <ActionButton onClick={handleClose} className="w-full">
                  Get Started
                </ActionButton>
              </motion.div>
            )}
          </AnimatePresence>
        </FintechCard>
      </motion.div>
    </div>
  )
}
