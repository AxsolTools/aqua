"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { TerminalPanel } from "@/components/ui/terminal-panel"
import { StepBasics } from "@/components/launch/step-basics"
import { StepTokenomics } from "@/components/launch/step-tokenomics"
import { StepAquaSettings } from "@/components/launch/step-aqua-settings"
import { StepReview } from "@/components/launch/step-review"
import { TokenPreview } from "@/components/launch/token-preview"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { cn } from "@/lib/utils"

export interface TokenFormData {
  name: string
  symbol: string
  description: string
  imageFile: File | null
  imagePreview: string | null
  website: string
  twitter: string
  telegram: string
  discord: string
  totalSupply: string
  decimals: string
  creatorAllocation: string
  pourRate: number
  evaporationRate: number
  migrationThreshold: string
  bondingCurveType: "linear" | "exponential" | "sigmoid"
}

const initialFormData: TokenFormData = {
  name: "",
  symbol: "",
  description: "",
  imageFile: null,
  imagePreview: null,
  website: "",
  twitter: "",
  telegram: "",
  discord: "",
  totalSupply: "1000000000",
  decimals: "9",
  creatorAllocation: "0",
  pourRate: 1,
  evaporationRate: 0.5,
  migrationThreshold: "85",
  bondingCurveType: "linear",
}

const steps = [
  { id: 1, name: "BASICS", command: "init" },
  { id: 2, name: "SUPPLY", command: "config" },
  { id: 3, name: "AQUA", command: "liquidity" },
  { id: 4, name: "DEPLOY", command: "execute" },
]

interface LaunchWizardProps {
  creatorWallet: string
}

export function LaunchWizard({ creatorWallet }: LaunchWizardProps) {
  const router = useRouter()
  const { userId, sessionId } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<TokenFormData>(initialFormData)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  
  // Pre-generated mint keypair for showing address before confirmation
  const [mintKeypair, setMintKeypair] = useState<Keypair | null>(null)
  const [mintAddress, setMintAddress] = useState<string | null>(null)

  // Generate mint keypair when entering step 4 (Review)
  const generateMintKeypair = useCallback(() => {
    const keypair = Keypair.generate()
    setMintKeypair(keypair)
    setMintAddress(keypair.publicKey.toBase58())
    console.log('[LAUNCH] Pre-generated mint address:', keypair.publicKey.toBase58())
  }, [])

  // Regenerate mint address if user goes back and comes to step 4 again
  const regenerateMint = useCallback(() => {
    generateMintKeypair()
  }, [generateMintKeypair])

  const updateFormData = (updates: Partial<TokenFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const nextStep = () => {
    if (currentStep < 4) {
      const newStep = currentStep + 1
      setCurrentStep(newStep)
      // Generate mint keypair when entering review step
      if (newStep === 4 && !mintKeypair) {
        generateMintKeypair()
      }
    }
  }

  const prevStep = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1)
  }

  const handleDeploy = async () => {
    setIsDeploying(true)
    setDeployError(null)

    console.log('[LAUNCH] Deploying token...', { 
      sessionId: sessionId?.slice(0, 8), 
      wallet: creatorWallet?.slice(0, 8),
      mintAddress: mintAddress?.slice(0, 8)
    })

    try {
      // Ensure we have a mint keypair
      let currentMintKeypair = mintKeypair
      if (!currentMintKeypair) {
        currentMintKeypair = Keypair.generate()
        setMintKeypair(currentMintKeypair)
        setMintAddress(currentMintKeypair.publicKey.toBase58())
      }

      // Encode the mint secret key to send to backend
      const mintSecretKey = bs58.encode(currentMintKeypair.secretKey)

      // CRITICAL: Include auth headers for API authentication
      const response = await fetch("/api/token/create", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress: creatorWallet,
        }),
        body: JSON.stringify({
          name: formData.name,
          symbol: formData.symbol,
          description: formData.description,
          image: formData.imagePreview,
          website: formData.website,
          twitter: formData.twitter,
          telegram: formData.telegram,
          discord: formData.discord,
          totalSupply: parseInt(formData.totalSupply),
          decimals: parseInt(formData.decimals),
          pourRate: formData.pourRate,
          evaporationRate: formData.evaporationRate,
          migrationThreshold: parseInt(formData.migrationThreshold),
          // Send pre-generated mint keypair so backend uses the same address
          mintSecretKey: mintSecretKey,
          mintAddress: currentMintKeypair.publicKey.toBase58(),
        }),
      })

      const data = await response.json()
      console.log('[LAUNCH] Response:', data)

      if (!response.ok) {
        throw new Error(data.error?.message || data.error || "Failed to create token")
      }

      // Use the pre-generated mint address (or fallback to response)
      const finalMintAddress = data.data?.mintAddress || data.mintAddress || currentMintKeypair.publicKey.toBase58()
      router.push(`/token/${finalMintAddress}`)
    } catch (err) {
      console.error('[LAUNCH] Error:', err)
      setDeployError(err instanceof Error ? err.message : "Deployment failed")
      setIsDeploying(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Form */}
      <div className="lg:col-span-2">
        {/* Progress Steps - Terminal Style */}
        <TerminalPanel title="DEPLOYMENT_PROGRESS" className="rounded-lg mb-6">
          <div className="flex items-center justify-between">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded border flex items-center justify-center font-mono text-sm transition-all",
                      currentStep >= step.id
                        ? "border-[var(--aqua-primary)] bg-[var(--aqua-subtle)] text-[var(--aqua-primary)]"
                        : "border-[var(--terminal-border)] bg-black/30 text-[var(--text-muted)]",
                      currentStep === step.id && "terminal-glow-aqua",
                    )}
                  >
                    {currentStep > step.id ? "✓" : step.id}
                  </div>
                  <div className="mt-2 text-center hidden md:block">
                    <p
                      className={cn(
                        "font-mono text-xs",
                        currentStep >= step.id ? "text-[var(--aqua-primary)]" : "text-[var(--text-muted)]",
                      )}
                    >
                      ${step.command}
                    </p>
                    <p className="font-mono text-[10px] text-[var(--text-muted)]">{step.name}</p>
                  </div>
                </div>

                {index < steps.length - 1 && (
                  <div className="w-8 md:w-16 h-px mx-2 overflow-hidden bg-[var(--terminal-border)]">
                    <motion.div
                      initial={false}
                      animate={{ width: currentStep > step.id ? "100%" : "0%" }}
                      transition={{ duration: 0.3 }}
                      className="h-full bg-[var(--aqua-primary)]"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </TerminalPanel>

        {/* Step Content */}
        <TerminalPanel title={`STEP_${currentStep}_${steps[currentStep - 1].name}`} className="rounded-lg">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {currentStep === 1 && (
                <StepBasics formData={formData} updateFormData={updateFormData} onNext={nextStep} />
              )}
              {currentStep === 2 && (
                <StepTokenomics
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 3 && (
                <StepAquaSettings
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 4 && (
                <StepReview
                  formData={formData}
                  onBack={prevStep}
                  onDeploy={handleDeploy}
                  isDeploying={isDeploying}
                  error={deployError}
                  mintAddress={mintAddress}
                  onRegenerateMint={regenerateMint}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </TerminalPanel>
      </div>

      {/* Live Preview */}
      <div className="lg:col-span-1">
        <div className="sticky top-28">
          <TokenPreview formData={formData} />
        </div>
      </div>
    </div>
  )
}
