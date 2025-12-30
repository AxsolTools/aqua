"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { GlassPanel, StepIndicator } from "@/components/ui/glass-panel"
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
  initialBuySol: string
  pourRate: number
  evaporationRate: number
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
  initialBuySol: "0",
  pourRate: 1,
  evaporationRate: 0.5,
}

const steps = [
  { id: 1, name: "Basics", description: "Token identity" },
  { id: 2, name: "Supply", description: "Tokenomics" },
  { id: 3, name: "Liquidity", description: "AQUA settings" },
  { id: 4, name: "Launch", description: "Review & deploy" },
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
          decimals: 6, // pump.fun tokens always use 6 decimals
          initialBuySol: parseFloat(formData.initialBuySol) || 0,
          pourRate: formData.pourRate,
          evaporationRate: formData.evaporationRate,
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
      <div className="lg:col-span-2 space-y-6">
        {/* Progress Steps - Glass Style */}
        <GlassPanel className="rounded-2xl">
          <StepIndicator steps={steps} currentStep={currentStep} />
        </GlassPanel>

        {/* Step Content */}
        <GlassPanel 
          title={`Step ${currentStep}: ${steps[currentStep - 1].name}`}
          subtitle={steps[currentStep - 1].description}
          className="rounded-2xl"
        >
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
        </GlassPanel>
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
