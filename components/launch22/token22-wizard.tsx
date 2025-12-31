"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"
import { GlassPanel, StepIndicator } from "@/components/ui/glass-panel"
import { Step22Basics } from "@/components/launch22/step-basics"
import { Step22Extensions } from "@/components/launch22/step-extensions"
import { Step22Distribution } from "@/components/launch22/step-distribution"
import { Step22Liquidity } from "@/components/launch22/step-liquidity"
import { Step22Review } from "@/components/launch22/step-review"
import { Token22Preview } from "@/components/launch22/token22-preview"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"

export interface Token22FormData {
  // Basics
  name: string
  symbol: string
  description: string
  imageFile: File | null
  imagePreview: string | null
  website: string
  twitter: string
  telegram: string
  discord: string
  
  // Tokenomics
  totalSupply: string
  decimals: number
  
  // Token-2022 Extensions
  enableTransferFee: boolean
  transferFeeBasisPoints: number // 0-500 (5% max)
  maxTransferFee: string // Max fee per transfer in tokens
  revokeMintAuthority: boolean
  revokeFreezeAuthority: boolean
  
  // Distribution
  teamAllocation: number // percentage
  lpAllocation: number // percentage
  lockedAllocation: number // percentage
  lockDurationDays: number
  
  // Liquidity
  autoCreatePool: boolean
  poolSolAmount: string
  lockLpTokens: boolean
  lpLockDurationDays: number
}

export const initialToken22FormData: Token22FormData = {
  // Basics
  name: "",
  symbol: "",
  description: "",
  imageFile: null,
  imagePreview: null,
  website: "",
  twitter: "",
  telegram: "",
  discord: "",
  
  // Tokenomics
  totalSupply: "1000000000",
  decimals: 6,
  
  // Token-2022 Extensions
  enableTransferFee: false,
  transferFeeBasisPoints: 100, // 1% default
  maxTransferFee: "1000000", // 1 million tokens max
  revokeMintAuthority: true,
  revokeFreezeAuthority: false,
  
  // Distribution
  teamAllocation: 10,
  lpAllocation: 80,
  lockedAllocation: 10,
  lockDurationDays: 90,
  
  // Liquidity
  autoCreatePool: true,
  poolSolAmount: "1",
  lockLpTokens: false,
  lpLockDurationDays: 180,
}

const steps = [
  { id: 1, name: "Identity", description: "Token basics" },
  { id: 2, name: "Extensions", description: "Token-2022 features" },
  { id: 3, name: "Distribution", description: "Supply allocation" },
  { id: 4, name: "Liquidity", description: "Raydium pool" },
  { id: 5, name: "Launch", description: "Review & deploy" },
]

interface Token22WizardProps {
  creatorWallet: string
}

export function Token22Wizard({ creatorWallet }: Token22WizardProps) {
  const router = useRouter()
  const { userId, sessionId } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<Token22FormData>(initialToken22FormData)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  
  // Pre-generated mint keypair for showing address before confirmation
  const [mintKeypair, setMintKeypair] = useState<Keypair | null>(null)
  const [mintAddress, setMintAddress] = useState<string | null>(null)

  // Generate mint keypair when entering review step
  const generateMintKeypair = useCallback(() => {
    const keypair = Keypair.generate()
    setMintKeypair(keypair)
    setMintAddress(keypair.publicKey.toBase58())
    console.log('[TOKEN22] Pre-generated mint address:', keypair.publicKey.toBase58())
  }, [])

  const regenerateMint = useCallback(() => {
    generateMintKeypair()
  }, [generateMintKeypair])

  const updateFormData = (updates: Partial<Token22FormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const nextStep = () => {
    if (currentStep < 5) {
      const newStep = currentStep + 1
      setCurrentStep(newStep)
      // Generate mint keypair when entering review step
      if (newStep === 5 && !mintKeypair) {
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

    console.log('[TOKEN22] Deploying token...', { 
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

      const response = await fetch("/api/token22/create", {
        method: "POST",
        headers: getAuthHeaders({
          sessionId: sessionId || userId,
          walletAddress: creatorWallet,
        }),
        body: JSON.stringify({
          // Basics
          name: formData.name,
          symbol: formData.symbol,
          description: formData.description,
          image: formData.imagePreview,
          website: formData.website,
          twitter: formData.twitter,
          telegram: formData.telegram,
          discord: formData.discord,
          
          // Tokenomics
          totalSupply: formData.totalSupply,
          decimals: formData.decimals,
          
          // Token-2022 Extensions
          enableTransferFee: formData.enableTransferFee,
          transferFeeBasisPoints: formData.transferFeeBasisPoints,
          maxTransferFee: formData.maxTransferFee,
          revokeMintAuthority: formData.revokeMintAuthority,
          revokeFreezeAuthority: formData.revokeFreezeAuthority,
          
          // Distribution
          teamAllocation: formData.teamAllocation,
          lpAllocation: formData.lpAllocation,
          lockedAllocation: formData.lockedAllocation,
          lockDurationDays: formData.lockDurationDays,
          
          // Liquidity
          autoCreatePool: formData.autoCreatePool,
          poolSolAmount: formData.poolSolAmount,
          lockLpTokens: formData.lockLpTokens,
          lpLockDurationDays: formData.lpLockDurationDays,
          
          // Pre-generated mint keypair
          mintSecretKey: mintSecretKey,
          mintAddress: currentMintKeypair.publicKey.toBase58(),
        }),
      })

      const data = await response.json()
      console.log('[TOKEN22] Response:', data)

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error?.details?.join(', ') || data.error || "Failed to create token")
      }

      const finalMintAddress = data.data?.mintAddress || currentMintKeypair.publicKey.toBase58()
      
      if (!finalMintAddress) {
        throw new Error("Token created but mint address not returned")
      }

      console.log('[TOKEN22] Token created successfully:', {
        mintAddress: finalMintAddress,
        tokenId: data.data?.tokenId,
        txSignature: data.data?.txSignature
      })
      
      // Small delay to ensure database is updated
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      // Redirect to the token22 detail page
      router.replace(`/token22/${finalMintAddress}`)
    } catch (err) {
      console.error('[TOKEN22] Error:', err)
      setDeployError(err instanceof Error ? err.message : "Deployment failed")
      setIsDeploying(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Main Form */}
      <div className="lg:col-span-2 space-y-6">
        {/* Progress Steps */}
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
                <Step22Basics formData={formData} updateFormData={updateFormData} onNext={nextStep} />
              )}
              {currentStep === 2 && (
                <Step22Extensions
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 3 && (
                <Step22Distribution
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 4 && (
                <Step22Liquidity
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 5 && (
                <Step22Review
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
          <Token22Preview formData={formData} />
        </div>
      </div>
    </div>
  )
}

