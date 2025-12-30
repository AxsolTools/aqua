"use client"

import type { TokenFormData } from "./launch-wizard"
import { useAuth } from "@/components/providers/auth-provider"
import { GlassButton } from "@/components/ui/glass-panel"
import { Copy, RefreshCw, AlertTriangle, Rocket, Check } from "lucide-react"
import { useState } from "react"

interface StepReviewProps {
  formData: TokenFormData
  onBack: () => void
  onDeploy: () => void
  isDeploying: boolean
  error: string | null
  mintAddress: string | null
  onRegenerateMint: () => void
}

export function StepReview({ formData, onBack, onDeploy, isDeploying, error, mintAddress, onRegenerateMint }: StepReviewProps) {
  const { activeWallet } = useAuth()
  const [copied, setCopied] = useState(false)

  // Copy mint address to clipboard
  const copyMintAddress = async () => {
    if (mintAddress) {
      await navigator.clipboard.writeText(mintAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const sections = [
    {
      title: "Token Identity",
      items: [
        { label: "Name", value: formData.name },
        { label: "Symbol", value: `$${formData.symbol}` },
        { label: "Description", value: formData.description || "—" },
      ],
    },
    {
      title: "Tokenomics",
      items: [
        { label: "Total Supply", value: Number(formData.totalSupply).toLocaleString() },
        { label: "Decimals", value: "6 (pump.fun standard)" },
        { label: "Creator Allocation", value: `${Number(formData.creatorAllocation).toLocaleString()} tokens` },
      ],
    },
    {
      title: "AQUA Settings",
      items: [
        { label: "Pour Rate", value: `${formData.pourRate}% per hour` },
        { label: "Evaporation Rate", value: `${formData.evaporationRate}%` },
      ],
    },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">Double check everything. Once deployed, these settings are permanent.</p>
      </div>

      {/* Review Sections */}
      <div className="space-y-4">
        {sections.map((section) => (
          <div
            key={section.title}
            className="p-5 rounded-xl bg-white/5 border border-white/10"
          >
            <h3 className="text-sm font-medium text-white mb-4">{section.title}</h3>
            <div className="space-y-3">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-white/50">{item.label}</span>
                  <span className="text-sm font-medium text-white text-right max-w-[60%] truncate">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Social Links - Compact */}
      {(formData.website || formData.twitter || formData.telegram || formData.discord) && (
        <div className="p-5 rounded-xl bg-white/5 border border-white/10">
          <h3 className="text-sm font-medium text-white mb-3">Social Links</h3>
          <div className="flex flex-wrap gap-2">
            {formData.website && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">🌐 Website</span>
            )}
            {formData.twitter && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">𝕏 Twitter</span>
            )}
            {formData.telegram && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">✈️ Telegram</span>
            )}
            {formData.discord && (
              <span className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70">💬 Discord</span>
            )}
          </div>
        </div>
      )}

      {/* Pre-generated Mint Address */}
      {mintAddress && (
        <div className="p-5 rounded-xl bg-gradient-to-r from-cyan-500/10 to-purple-500/10 border border-cyan-500/30">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <p className="text-sm font-medium text-cyan-400">Your Token Address (Pre-generated)</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={copyMintAddress}
                className="text-xs px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 transition-colors flex items-center gap-1.5"
                title="Copy to clipboard"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? "Copied!" : "Copy"}
              </button>
              <button
                onClick={onRegenerateMint}
                disabled={isDeploying}
                className="text-xs px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                title="Generate new address"
              >
                <RefreshCw className="w-3 h-3" />
                New
              </button>
            </div>
          </div>
          <p className="font-mono text-sm text-white bg-black/30 px-4 py-3 rounded-lg break-all select-all">
            {mintAddress}
          </p>
          <p className="text-xs text-white/40 mt-3">
            Save this address! It&apos;s your token&apos;s permanent home on Solana.
          </p>
        </div>
      )}

      {/* Deploying Wallet */}
      <div className="p-5 rounded-xl bg-white/5 border border-white/10">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-white/40 mb-1">Deploying from</p>
            <p className="text-sm font-mono text-white">
              {activeWallet
                ? `${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}`
                : "No wallet connected"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-white/40 mb-1">Network fee</p>
            <p className="text-sm font-medium text-white">~0.02 SOL</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-400">Deployment failed</p>
            <p className="text-sm text-red-400/70 mt-1">{error}</p>
          </div>
        </div>
      )}

      {/* Warning */}
      <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
        <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-400/90">
          Token deployment is permanent. Once live, settings cannot be changed. Make sure everything is correct!
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} disabled={isDeploying} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton
          onClick={onDeploy}
          disabled={isDeploying || !activeWallet}
          variant="primary"
          isLoading={isDeploying}
        >
          {isDeploying ? (
            "Deploying..."
          ) : (
            <span className="flex items-center gap-2">
              <Rocket className="w-4 h-4" />
              Launch Token
            </span>
          )}
        </GlassButton>
      </div>
    </div>
  )
}
