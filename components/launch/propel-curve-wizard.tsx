"use client"

import { useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { GlassPanel, StepIndicator } from "@/components/ui/glass-panel"
import { StepBasics } from "@/components/launch/step-basics"
import { PropelCurveDesigner } from "@/components/launch/propel-curve-designer"
import { StepReview } from "@/components/launch/step-review"
import { TokenPreview } from "@/components/launch/token-preview"
import { useAuth } from "@/components/providers/auth-provider"
import { getAuthHeaders } from "@/lib/api"
import { Keypair } from "@solana/web3.js"
import bs58 from "bs58"

export interface CurveRange {
  price: number
  liquidity: number
}

export interface PropelFormData {
  // Basic info
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
  
  // Curve configuration
  preset: 'smooth' | 'explosive' | 'whale_trap' | 'diamond_hands' | 'custom'
  customCurveRanges: CurveRange[]
  quoteMint: 'sol' | 'usdc'
  migrationThresholdSol: number
  
  // Fee settings
  tradingFeeBps: number
  creatorFeePercentage: number
  creatorLpPercentage: number
  creatorLockedLpPercentage: number
  
  // AQUA parameters (reuse existing)
  pourEnabled: boolean
  pourRate: number
  pourInterval: 'hourly' | 'daily'
  pourSource: 'fees' | 'treasury' | 'both'
  evaporationEnabled: boolean
  evaporationRate: number
  feeToLiquidity: number
  feeToCreator: number
  autoClaimEnabled: boolean
  claimThreshold: number
  claimInterval: 'hourly' | 'daily' | 'weekly'
}

const initialFormData: PropelFormData = {
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
  
  // Curve defaults
  preset: 'smooth',
  customCurveRanges: [
    { price: 0.00001, liquidity: 1000 },
    { price: 0.0001, liquidity: 1000 },
    { price: 0.001, liquidity: 1000 },
    { price: 0.01, liquidity: 1000 },
  ],
  quoteMint: 'sol',
  migrationThresholdSol: 85,
  
  // Fee defaults
  tradingFeeBps: 100,
  creatorFeePercentage: 80,
  creatorLpPercentage: 90,
  creatorLockedLpPercentage: 0,
  
  // AQUA defaults
  pourEnabled: true,
  pourRate: 2,
  pourInterval: 'hourly',
  pourSource: 'fees',
  evaporationEnabled: false,
  evaporationRate: 1,
  feeToLiquidity: 25,
  feeToCreator: 75,
  autoClaimEnabled: true,
  claimThreshold: 0.1,
  claimInterval: 'daily',
}

const steps = [
  { id: 1, name: "Basics", description: "Token identity" },
  { id: 2, name: "Curve", description: "Price action design" },
  { id: 3, name: "Review", description: "Deploy token" },
]

interface PropelCurveWizardProps {
  creatorWallet: string
}

export function PropelCurveWizard({ creatorWallet }: PropelCurveWizardProps) {
  const router = useRouter()
  const { userId, sessionId } = useAuth()
  const [currentStep, setCurrentStep] = useState(1)
  const [formData, setFormData] = useState<PropelFormData>(initialFormData)
  const [isDeploying, setIsDeploying] = useState(false)
  const [deployError, setDeployError] = useState<string | null>(null)
  
  const [mintKeypair, setMintKeypair] = useState<Keypair | null>(null)
  const [mintAddress, setMintAddress] = useState<string | null>(null)

  const generateMintKeypair = useCallback(() => {
    const keypair = Keypair.generate()
    setMintKeypair(keypair)
    setMintAddress(keypair.publicKey.toBase58())
    console.log('[PROPEL-CURVE] Pre-generated mint address:', keypair.publicKey.toBase58())
  }, [])

  const regenerateMint = useCallback(() => {
    generateMintKeypair()
  }, [generateMintKeypair])

  const updateFormData = (updates: Partial<PropelFormData>) => {
    setFormData((prev) => ({ ...prev, ...updates }))
  }

  const nextStep = () => {
    if (currentStep < 3) {
      const newStep = currentStep + 1
      setCurrentStep(newStep)
      if (newStep === 3 && !mintKeypair) {
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

    console.log('[PROPEL-CURVE] Deploying token...', { 
      sessionId: sessionId?.slice(0, 8), 
      wallet: creatorWallet?.slice(0, 8),
      preset: formData.preset,
      quoteMint: formData.quoteMint,
    })

    try {
      let currentMintKeypair = mintKeypair
      if (!currentMintKeypair) {
        currentMintKeypair = Keypair.generate()
        setMintKeypair(currentMintKeypair)
        setMintAddress(currentMintKeypair.publicKey.toBase58())
      }

      const mintSecretKey = bs58.encode(currentMintKeypair.secretKey)

      const response = await fetch("/api/meteora/create", {
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
          decimals: 6,
          totalSupply: parseInt(formData.totalSupply),
          
          // Curve configuration
          preset: formData.preset,
          customCurveRanges: formData.preset === 'custom' ? formData.customCurveRanges : undefined,
          quoteMint: formData.quoteMint,
          migrationThresholdSol: formData.migrationThresholdSol,
          
          // Fee settings
          tradingFeeBps: formData.tradingFeeBps,
          creatorFeePercentage: formData.creatorFeePercentage,
          creatorLpPercentage: formData.creatorLpPercentage,
          creatorLockedLpPercentage: formData.creatorLockedLpPercentage,
          
          // Launch options
          initialBuySol: parseFloat(formData.initialBuySol) || 0,
          mintSecretKey: mintSecretKey,
          mintAddress: currentMintKeypair.publicKey.toBase58(),
          
          // AQUA parameters
          pourEnabled: formData.pourEnabled,
          pourRate: formData.pourRate,
          pourInterval: formData.pourInterval,
          pourSource: formData.pourSource,
          evaporationEnabled: formData.evaporationEnabled,
          evaporationRate: formData.evaporationRate,
          feeToLiquidity: formData.feeToLiquidity,
          feeToCreator: formData.feeToCreator,
          autoClaimEnabled: formData.autoClaimEnabled,
          claimThreshold: formData.claimThreshold,
          claimInterval: formData.claimInterval,
        }),
      })

      const data = await response.json()
      console.log('[PROPEL-CURVE] Response:', data)

      if (!response.ok || !data.success) {
        throw new Error(data.error?.message || data.error || "Failed to create token")
      }

      const finalMintAddress = data.data?.mintAddress || data.mintAddress || currentMintKeypair.publicKey.toBase58()
      
      if (!finalMintAddress) {
        throw new Error("Token created but mint address not returned")
      }

      console.log('[PROPEL-CURVE] Token created successfully:', {
        mintAddress: finalMintAddress,
        tokenId: data.data?.tokenId,
        txSignature: data.data?.txSignature,
      })
      
      await new Promise(resolve => setTimeout(resolve, 1500))
      router.replace(`/token/${finalMintAddress}`)
      
    } catch (err) {
      console.error('[PROPEL-CURVE] Error:', err)
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
                <StepBasics 
                  formData={formData} 
                  updateFormData={updateFormData} 
                  onNext={nextStep}
                  creatorWallet={creatorWallet}
                  pool="meteora"
                  isUsd1Quote={false}
                />
              )}
              {currentStep === 2 && (
                <PropelCurveDesigner
                  formData={formData}
                  updateFormData={updateFormData}
                  onNext={nextStep}
                  onBack={prevStep}
                />
              )}
              {currentStep === 3 && (
                <StepReview
                  formData={formData}
                  onBack={prevStep}
                  onDeploy={handleDeploy}
                  isDeploying={isDeploying}
                  error={deployError}
                  mintAddress={mintAddress}
                  onRegenerateMint={regenerateMint}
                  pool="meteora"
                  isUsd1Quote={false}
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
