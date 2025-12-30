"use client"

import type { TokenFormData } from "./launch-wizard"
import { cn } from "@/lib/utils"
import { TerminalButton } from "@/components/ui/terminal-panel"

interface StepAquaSettingsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
  onBack: () => void
}

const bondingCurveTypes = [
  { value: "linear" as const, label: "LINEAR", description: "Steady price growth" },
  { value: "exponential" as const, label: "EXPONENTIAL", description: "Accelerating growth" },
  { value: "sigmoid" as const, label: "SIGMOID", description: "S-curve trajectory" },
]

export function StepAquaSettings({ formData, updateFormData, onNext, onBack }: StepAquaSettingsProps) {
  return (
    <div className="font-mono">
      <div className="text-[var(--aqua-primary)] mb-1">$ config --liquidity-mechanics</div>
      <div className="text-xs text-[var(--text-muted)] mb-6">{">"} Configure AQUA infinite liquidity settings</div>

      <div className="space-y-8">
        {/* Pour Rate - Terminal Slider */}
        <div className="p-4 rounded border border-[var(--terminal-border)] bg-black/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-[var(--aqua-primary)]">POUR_RATE</div>
              <div className="text-[10px] text-[var(--text-muted)]">Liquidity injection rate per hour</div>
            </div>
            <div className="text-2xl text-[var(--aqua-primary)] terminal-glow-aqua">{formData.pourRate}%</div>
          </div>

          {/* Visual Meter */}
          <div className="h-8 rounded bg-black/30 border border-[var(--terminal-border)] overflow-hidden relative mb-2">
            <div
              className="h-full bg-gradient-to-r from-[var(--aqua-primary)]/20 to-[var(--aqua-primary)]/60 transition-all duration-300"
              style={{ width: `${(formData.pourRate / 5) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--aqua-primary)]">
              {"█".repeat(Math.floor(formData.pourRate * 4))}
              {"░".repeat(20 - Math.floor(formData.pourRate * 4))}
            </div>
          </div>

          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={formData.pourRate}
            onChange={(e) => updateFormData({ pourRate: Number(e.target.value) })}
            className="w-full h-1 bg-[var(--terminal-border)] rounded appearance-none cursor-pointer accent-[var(--aqua-primary)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
            <span>0.1% SLOW</span>
            <span>5.0% FAST</span>
          </div>
        </div>

        {/* Evaporation Rate */}
        <div className="p-4 rounded border border-[var(--terminal-border)] bg-black/20">
          <div className="flex items-center justify-between mb-3">
            <div>
              <div className="text-sm text-[var(--warm-orange)]">EVAPORATION_RATE</div>
              <div className="text-[10px] text-[var(--text-muted)]">Token burn per transaction</div>
            </div>
            <div className="text-2xl text-[var(--warm-orange)]">{formData.evaporationRate}%</div>
          </div>

          {/* Visual Meter */}
          <div className="h-8 rounded bg-black/30 border border-[var(--terminal-border)] overflow-hidden relative mb-2">
            <div
              className="h-full bg-gradient-to-r from-[var(--warm-orange)]/20 to-[var(--warm-orange)]/60 transition-all duration-300"
              style={{ width: `${(formData.evaporationRate / 3) * 100}%` }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-xs text-[var(--warm-orange)]">
              {"▲".repeat(Math.floor(formData.evaporationRate * 6))}
              {"·".repeat(18 - Math.floor(formData.evaporationRate * 6))}
            </div>
          </div>

          <input
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={formData.evaporationRate}
            onChange={(e) => updateFormData({ evaporationRate: Number(e.target.value) })}
            className="w-full h-1 bg-[var(--terminal-border)] rounded appearance-none cursor-pointer accent-[var(--warm-orange)]"
          />
          <div className="flex justify-between text-[10px] text-[var(--text-muted)] mt-1">
            <span>0% NONE</span>
            <span>3% HIGH_BURN</span>
          </div>
        </div>

        {/* Migration Threshold */}
        <div>
          <div className="text-xs text-[var(--text-muted)] uppercase mb-2">MIGRATION_THRESHOLD (SOL)</div>
          <input
            type="text"
            value={formData.migrationThreshold}
            onChange={(e) => {
              if (/^\d*\.?\d*$/.test(e.target.value)) {
                updateFormData({ migrationThreshold: e.target.value })
              }
            }}
            className="terminal-input w-full"
          />
          <div className="text-[10px] text-[var(--text-muted)] mt-1">{">"} Triggers DEX migration when reached</div>
        </div>

        {/* Bonding Curve Type */}
        <div>
          <div className="text-xs text-[var(--text-muted)] uppercase mb-3">BONDING_CURVE_TYPE</div>
          <div className="grid grid-cols-3 gap-2">
            {bondingCurveTypes.map((curve) => (
              <button
                key={curve.value}
                type="button"
                onClick={() => updateFormData({ bondingCurveType: curve.value })}
                className={cn(
                  "p-3 rounded border text-center transition-all",
                  formData.bondingCurveType === curve.value
                    ? "border-[var(--aqua-primary)] bg-[var(--aqua-subtle)] text-[var(--aqua-primary)]"
                    : "border-[var(--terminal-border)] bg-black/20 text-[var(--text-muted)] hover:border-[var(--aqua-primary)]/50",
                )}
              >
                <div className="text-xs font-semibold">{curve.label}</div>
                <div className="text-[9px] mt-1 opacity-70">{curve.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Health Metrics Preview */}
        <div className="p-4 rounded border border-[var(--terminal-green)]/30 bg-[var(--terminal-green)]/5">
          <div className="text-xs text-[var(--terminal-green)] uppercase mb-3">{">"} PROJECTED_METRICS</div>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-[10px] text-[var(--text-muted)]">DAILY_LIQUIDITY_GROWTH</div>
              <div className="text-[var(--aqua-primary)]">+{(formData.pourRate * 24).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-[10px] text-[var(--text-muted)]">DAILY_BURN_RATE</div>
              <div className="text-[var(--warm-orange)]">
                {formData.evaporationRate > 0 ? `-${formData.evaporationRate}%` : "0%"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="font-mono text-xs text-[var(--text-muted)] hover:text-[var(--aqua-primary)] transition-colors"
        >
          {"<-"} BACK
        </button>
        <TerminalButton onClick={onNext}>REVIEW</TerminalButton>
      </div>
    </div>
  )
}
