"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/components/providers/auth-provider"
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
  X,
  Key,
  FileText,
  Sparkles
} from "lucide-react"
import { cn } from "@/lib/utils"

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
  const [activeTab, setActiveTab] = useState<"phrase" | "key">("phrase")

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
      
      console.log('[GENERATE] Response:', data)

      if (!response.ok) throw new Error(data.error?.message || data.error || "Failed to generate wallet")

      if (data.data?.sessionId) {
        console.log('[GENERATE] Setting sessionId:', data.data.sessionId)
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
          sessionId: userId, // Pass sessionId for consistency
        }),
      })

      const data = await response.json()
      
      console.log('[IMPORT] Response:', data)

      if (!response.ok) throw new Error(data.error?.message || data.error || "Failed to import wallet")

      // CRITICAL FIX: The API returns sessionId in data.data.sessionId, not data.userId
      if (data.data?.sessionId) {
        console.log('[IMPORT] Setting sessionId:', data.data.sessionId)
        setUserId(data.data.sessionId)
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
      setError("Please confirm you have saved your credentials")
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
    setActiveTab("phrase")
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="fixed inset-0 z-[100]">
      {/* Animated background */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
      >
        {/* Subtle grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)`,
            backgroundSize: '50px 50px'
          }}
        />
        {/* Gradient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl" />
      </motion.div>

      {/* Content */}
      <div className="relative z-10 min-h-screen flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ type: "spring", damping: 30, stiffness: 300 }}
          className="w-full max-w-xl"
        >
          <AnimatePresence mode="wait">
            {/* CHOICE STEP */}
            {step === "choice" && (
              <motion.div
                key="choice"
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 40 }}
                className="space-y-8"
              >
                {/* Header */}
                <div className="text-center">
                  <motion.div 
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex p-4 rounded-2xl bg-gradient-to-br from-teal-500/20 to-cyan-500/10 border border-teal-500/20 mb-6"
                  >
                    <Wallet className="w-10 h-10 text-teal-400" />
                  </motion.div>
                  <h1 className="text-3xl font-bold text-white mb-3">Welcome to Aquarius</h1>
                  <p className="text-slate-400 text-lg">Your wallet is your passport to infinite liquidity</p>
                </div>

                {/* Options */}
                <div className="space-y-4">
                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2 }}
                    onClick={() => setStep("generate")}
                    className="w-full group relative overflow-hidden rounded-2xl bg-gradient-to-r from-teal-500/10 to-cyan-500/10 border border-teal-500/30 hover:border-teal-400/50 transition-all p-6"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-teal-500/5 to-cyan-500/5 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="relative flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-teal-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Plus className="w-7 h-7 text-teal-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-white mb-1">Create New Wallet</h3>
                        <p className="text-slate-400">Generate a fresh Solana keypair</p>
                      </div>
                      <Sparkles className="w-5 h-5 text-teal-400/50 group-hover:text-teal-400 transition-colors" />
                    </div>
                  </motion.button>

                  <motion.button
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    onClick={() => setStep("import")}
                    className="w-full group relative overflow-hidden rounded-2xl bg-slate-800/50 border border-slate-700 hover:border-slate-600 transition-all p-6"
                  >
                    <div className="relative flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:scale-110 transition-transform">
                        <Upload className="w-6 h-6 text-slate-400" />
                      </div>
                      <div className="flex-1 text-left">
                        <h3 className="text-lg font-semibold text-white mb-1">Import Existing</h3>
                        <p className="text-slate-400">Use your private key or seed phrase</p>
                      </div>
                    </div>
                  </motion.button>
                </div>

                {/* Security badge */}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="flex items-center justify-center gap-2 text-slate-500"
                >
                  <Shield className="w-4 h-4" />
                  <span className="text-sm">AES-256-GCM Encrypted Storage</span>
                </motion.div>

                {/* Close button */}
                <button
                  onClick={handleClose}
                  className="absolute top-8 right-8 p-2 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-all"
                >
                  <X className="w-6 h-6" />
                </button>
              </motion.div>
            )}

            {/* GENERATE STEP */}
            {step === "generate" && (
              <motion.div
                key="generate"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="space-y-8"
              >
                <button
                  onClick={() => setStep("choice")}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back</span>
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Name Your Wallet</h2>
                  <p className="text-slate-400">Give it a name you'll recognize</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-3">
                      Wallet Name
                    </label>
                    <Input
                      value={walletLabel}
                      onChange={(e) => setWalletLabel(e.target.value)}
                      placeholder="Main Wallet"
                      className="h-14 text-lg bg-slate-800/50 border-slate-700"
                    />
                  </div>

                  {error && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-red-400">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleGenerateWallet}
                    disabled={isProcessing}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-lg hover:from-teal-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-5 h-5" />
                        Generate Wallet
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* IMPORT STEP */}
            {step === "import" && (
              <motion.div
                key="import"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="space-y-8"
              >
                <button
                  onClick={() => setStep("choice")}
                  className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
                >
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back</span>
                </button>

                <div>
                  <h2 className="text-2xl font-bold text-white mb-2">Import Your Wallet</h2>
                  <p className="text-slate-400">Enter your private key or recovery phrase</p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-3">
                      Wallet Name
                    </label>
                    <Input
                      value={walletLabel}
                      onChange={(e) => setWalletLabel(e.target.value)}
                      placeholder="Imported Wallet"
                      className="h-12 bg-slate-800/50 border-slate-700"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-3">
                      Private Key or Seed Phrase
                    </label>
                    <Textarea
                      value={importData}
                      onChange={(e) => setImportData(e.target.value)}
                      placeholder="Paste your base58 private key or 12/24 word seed phrase..."
                      rows={4}
                      className="bg-slate-800/50 border-slate-700 resize-none"
                    />
                  </div>

                  {error && (
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                      <p className="text-red-400">{error}</p>
                    </div>
                  )}

                  <button
                    onClick={handleImportWallet}
                    disabled={isProcessing || !importData.trim()}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-lg hover:from-teal-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isProcessing ? (
                      <>
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Importing...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5" />
                        Import Wallet
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            )}

            {/* BACKUP STEP - REDESIGNED */}
            {step === "backup" && generatedWallet && (
              <motion.div
                key="backup"
                initial={{ opacity: 0, x: 40 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -40 }}
                className="space-y-6"
              >
                {/* Warning header */}
                <div className="text-center p-6 rounded-2xl bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20">
                  <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-2">Secure Your Wallet</h2>
                  <p className="text-slate-400">
                    Save both your recovery phrase AND private key. Store them separately and securely.
                  </p>
                </div>

                {/* Wallet Address */}
                <div className="p-5 rounded-xl bg-slate-800/30 border border-slate-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-slate-400">Your Wallet Address</span>
                    <button
                      onClick={() => copyToClipboard(generatedWallet.publicKey, 'address')}
                      className="text-xs text-teal-400 hover:text-teal-300 flex items-center gap-1"
                    >
                      {copiedField === 'address' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedField === 'address' ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <code className="block text-teal-400 font-mono text-sm break-all">
                    {generatedWallet.publicKey}
                  </code>
                </div>

                {/* Tabs for Phrase/Key */}
                <div className="flex gap-2 p-1 rounded-xl bg-slate-800/50">
                  <button
                    onClick={() => setActiveTab("phrase")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all",
                      activeTab === "phrase" 
                        ? "bg-teal-500 text-white" 
                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    )}
                  >
                    <FileText className="w-4 h-4" />
                    Recovery Phrase
                  </button>
                  <button
                    onClick={() => setActiveTab("key")}
                    className={cn(
                      "flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all",
                      activeTab === "key" 
                        ? "bg-teal-500 text-white" 
                        : "text-slate-400 hover:text-white hover:bg-slate-700/50"
                    )}
                  >
                    <Key className="w-4 h-4" />
                    Private Key
                  </button>
                </div>

                {/* Content based on tab */}
                <AnimatePresence mode="wait">
                  {activeTab === "phrase" ? (
                    <motion.div
                      key="phrase"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-5 rounded-xl bg-gradient-to-br from-amber-500/5 to-orange-500/5 border border-amber-500/20"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-amber-400">12-Word Recovery Phrase</span>
                        <button
                          onClick={() => copyToClipboard(generatedWallet.mnemonic, 'mnemonic')}
                          className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          {copiedField === 'mnemonic' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedField === 'mnemonic' ? 'Copied!' : 'Copy All'}
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {generatedWallet.mnemonic.split(" ").map((word, i) => (
                          <div key={i} className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-900/50 border border-slate-700/50">
                            <span className="text-xs text-slate-600 w-5">{i + 1}.</span>
                            <span className="text-amber-300 font-medium">{word}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  ) : (
                    <motion.div
                      key="key"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="p-5 rounded-xl bg-gradient-to-br from-rose-500/5 to-pink-500/5 border border-rose-500/20"
                    >
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-sm font-medium text-rose-400">Base58 Private Key</span>
                        <button
                          onClick={() => copyToClipboard(generatedWallet.secretKey, 'secretKey')}
                          className="text-xs text-rose-400 hover:text-rose-300 flex items-center gap-1"
                        >
                          {copiedField === 'secretKey' ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {copiedField === 'secretKey' ? 'Copied!' : 'Copy'}
                        </button>
                      </div>
                      <div className="p-4 rounded-lg bg-slate-900/50 border border-slate-700/50">
                        <code className="text-rose-300 font-mono text-xs break-all leading-relaxed">
                          {generatedWallet.secretKey || "Private key not available - use recovery phrase"}
                        </code>
                      </div>
                      <p className="text-xs text-slate-500 mt-3">
                        ⚠️ Never share your private key. Anyone with this key has full control of your wallet.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Confirmation */}
                <label className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/30 border border-slate-700 cursor-pointer hover:bg-slate-800/50 transition-colors">
                  <input
                    type="checkbox"
                    checked={backupConfirmed}
                    onChange={(e) => setBackupConfirmed(e.target.checked)}
                    className="w-5 h-5 rounded border-slate-600 bg-slate-800 text-teal-500 focus:ring-teal-500/30"
                  />
                  <span className="text-slate-300">
                    I have securely saved my recovery phrase and private key
                  </span>
                </label>

                {error && <p className="text-red-400 text-sm">{error}</p>}

                <button
                  onClick={handleBackupComplete}
                  disabled={!backupConfirmed}
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-lg hover:from-teal-400 hover:to-cyan-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continue to Dashboard
                </button>
              </motion.div>
            )}

            {/* COMPLETE STEP */}
            {step === "complete" && (
              <motion.div
                key="complete"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center space-y-8"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 300, delay: 0.1 }}
                  className="inline-flex p-6 rounded-full bg-gradient-to-br from-green-500/20 to-emerald-500/10 border border-green-500/20"
                >
                  <Check className="w-16 h-16 text-green-400" />
                </motion.div>
                
                <div>
                  <h2 className="text-3xl font-bold text-white mb-3">You're All Set!</h2>
                  <p className="text-slate-400 text-lg">Your wallet is ready. Welcome to Aquarius.</p>
                </div>
                
                <button
                  onClick={handleClose}
                  className="w-full max-w-sm mx-auto h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-500 text-white font-semibold text-lg hover:from-teal-400 hover:to-cyan-400 transition-all"
                >
                  Start Exploring
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  )
}
