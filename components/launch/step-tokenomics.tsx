"use client"

import type { TokenFormData } from "./launch-wizard"

interface StepTokenomicsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
  onBack: () => void
}

const supplyPresets = [
  { value: "1000000", label: "1M" },
  { value: "100000000", label: "100M" },
  { value: "1000000000", label: "1B" },
  { value: "1000000000000", label: "1T" },
]

export function StepTokenomics({ formData, updateFormData, onNext, onBack }: StepTokenomicsProps) {
  const creatorAllocationPercent = (Number(formData.creatorAllocation) / Number(formData.totalSupply)) * 100 || 0

  return (
    <div>
      <h2 className="text-2xl font-semibold text-[var(--text-primary)] mb-2">Tokenomics</h2>
      <p className="text-sm text-[var(--text-secondary)] mb-8">Configure your token's supply and distribution</p>

      <div className="space-y-6">
        {/* Total Supply */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Total Supply</label>
          <input
            type="text"
            value={Number(formData.totalSupply).toLocaleString()}
            onChange={(e) => {
              const value = e.target.value.replace(/,/g, "")
              if (/^\d*$/.test(value)) {
                updateFormData({ totalSupply: value })
              }
            }}
            className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--aqua-primary)] transition-colors"
          />
          <div className="flex gap-2 mt-2">
            {supplyPresets.map((preset) => (
              <button
                key={preset.value}
                type="button"
                onClick={() => updateFormData({ totalSupply: preset.value })}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                  formData.totalSupply === preset.value
                    ? "bg-[var(--aqua-primary)] text-[var(--ocean-deep)]"
                    : "bg-[var(--ocean-surface)] text-[var(--text-secondary)] border border-[var(--glass-border)] hover:border-[var(--aqua-primary)]/50"
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        {/* Decimals */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Decimals</label>
          <select
            value={formData.decimals}
            onChange={(e) => updateFormData({ decimals: e.target.value })}
            className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] focus:outline-none focus:border-[var(--aqua-primary)] cursor-pointer"
          >
            <option value="6">6 (like USDC)</option>
            <option value="9">9 (standard)</option>
          </select>
          <p className="text-xs text-[var(--text-muted)] mt-1">9 decimals is standard for Solana tokens</p>
        </div>

        {/* Creator Allocation */}
        <div>
          <label className="block text-sm text-[var(--text-secondary)] mb-2">Creator Allocation</label>
          <div className="relative">
            <input
              type="text"
              value={Number(formData.creatorAllocation).toLocaleString()}
              onChange={(e) => {
                const value = e.target.value.replace(/,/g, "")
                if (/^\d*$/.test(value)) {
                  const maxAllocation = Number(formData.totalSupply) * 0.1 // Max 10%
                  const newValue = Math.min(Number(value), maxAllocation)
                  updateFormData({ creatorAllocation: newValue.toString() })
                }
              }}
              className="w-full px-4 py-3 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-[var(--aqua-primary)] transition-colors pr-16"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--text-muted)]">
              {creatorAllocationPercent.toFixed(1)}%
            </span>
          </div>
          <p className="text-xs text-[var(--text-muted)] mt-1">Maximum 10% of total supply</p>
        </div>

        {/* Supply Breakdown */}
        <div className="p-4 rounded-lg bg-[var(--ocean-surface)] border border-[var(--glass-border)]">
          <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-3">Supply Breakdown</h3>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Bonding Curve</span>
              <span className="text-sm font-mono text-[var(--text-primary)]">
                {(Number(formData.totalSupply) - Number(formData.creatorAllocation)).toLocaleString()} (
                {(100 - creatorAllocationPercent).toFixed(1)}%)
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-[var(--text-muted)]">Creator</span>
              <span className="text-sm font-mono text-[var(--text-primary)]">
                {Number(formData.creatorAllocation).toLocaleString()} ({creatorAllocationPercent.toFixed(1)}%)
              </span>
            </div>
          </div>

          {/* Visual bar */}
          <div className="mt-3 h-3 rounded-full bg-[var(--ocean-deep)] overflow-hidden flex">
            <div className="bg-[var(--aqua-primary)]" style={{ width: `${100 - creatorAllocationPercent}%` }} />
            <div className="bg-[var(--warm-orange)]" style={{ width: `${creatorAllocationPercent}%` }} />
          </div>
          <div className="flex justify-between mt-1">
            <span className="text-xs text-[var(--aqua-primary)]">Bonding Curve</span>
            <span className="text-xs text-[var(--warm-orange)]">Creator</span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="px-6 py-3 rounded-lg border border-[var(--glass-border)] text-[var(--text-secondary)] hover:border-[var(--aqua-primary)]/50 transition-colors"
        >
          Back
        </button>
        <button
          onClick={onNext}
          className="px-8 py-3 rounded-lg bg-[var(--aqua-primary)] text-[var(--ocean-deep)] font-medium hover:shadow-[0_0_20px_rgba(0,242,255,0.4)] transition-all"
        >
          Continue
        </button>
      </div>
    </div>
  )
}
