"use client"

import type { TokenFormData } from "./launch-wizard"
import { useAuth } from "@/components/providers/auth-provider"

interface StepReviewProps {
  formData: TokenFormData
  onBack: () => void
  onDeploy: () => void
  isDeploying: boolean
  error: string | null
}

export function StepReview({ formData, onBack, onDeploy, isDeploying, error }: StepReviewProps) {
  const { activeWallet } = useAuth()

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
        { label: "Decimals", value: formData.decimals },
        { label: "Creator Allocation", value: `${Number(formData.creatorAllocation).toLocaleString()} tokens` },
      ],
    },
    {
      title: "AQUA Settings",
      items: [
        { label: "Pour Rate", value: `${formData.pourRate}% per hour` },
        { label: "Evaporation Rate", value: `${formData.evaporationRate}%` },
        { label: "Migration Threshold", value: `${formData.migrationThreshold} SOL` },
        { label: "Bonding Curve", value: formData.bondingCurveType },
      ],
    },
    {
      title: "Social Links",
      items: [
        { label: "Website", value: formData.website || "—" },
        { label: "Twitter", value: formData.twitter || "—" },
        { label: "Telegram", value: formData.telegram || "—" },
        { label: "Discord", value: formData.discord || "—" },
      ],
    },
  ]

  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">Review & Deploy</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-8">
        Confirm your token settings before deploying to the blockchain
      </p>

      {/* Review Sections */}
      <div className="space-y-6">
        {sections.map((section) => (
          <div
            key={section.title}
            className="p-4 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)]"
          >
            <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">{section.title}</h3>
            <div className="space-y-2">
              {section.items.map((item) => (
                <div key={item.label} className="flex items-center justify-between">
                  <span className="text-sm text-[var(--text-muted)]">{item.label}</span>
                  <span className="text-sm font-medium text-[var(--text-primary)] text-right max-w-[60%] truncate">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Deploying Wallet */}
      <div className="mt-6 p-4 rounded-lg bg-[var(--aqua-subtle)] border border-[var(--aqua-primary)]/30">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-[var(--text-secondary)]">Deploying from wallet</p>
            <p className="text-sm font-mono text-[var(--aqua-primary)]">
              {activeWallet
                ? `${activeWallet.public_key.slice(0, 8)}...${activeWallet.public_key.slice(-8)}`
                : "No wallet connected"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-[var(--text-secondary)]">Estimated fee</p>
            <p className="text-sm font-mono text-[var(--text-primary)]">~0.02 SOL</p>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{error}</div>
      )}

      {/* Warning */}
      <div className="mt-4 p-3 rounded-lg bg-[var(--warm-orange)]/10 border border-[var(--warm-orange)]/30">
        <p className="text-sm text-[var(--warm-orange)]">
          Token deployment is permanent and cannot be undone. Make sure all settings are correct before proceeding.
        </p>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          disabled={isDeploying}
          className="px-6 py-3 rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--aqua-primary)]/50 transition-colors disabled:opacity-50"
        >
          Back
        </button>
        <button
          onClick={onDeploy}
          disabled={isDeploying || !activeWallet}
          className="px-8 py-3 rounded-lg bg-[var(--aqua-primary)] text-[var(--ocean-deep)] font-medium hover:shadow-[0_0_20px_rgba(0,242,255,0.4)] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isDeploying ? (
            <>
              <div className="w-4 h-4 border-2 border-[var(--ocean-deep)] border-t-transparent rounded-full animate-spin" />
              Deploying...
            </>
          ) : (
            "Deploy Token"
          )}
        </button>
      </div>
    </div>
  )
}
