"use client"

import type { TokenFormData } from "./launch-wizard"
import { GlassPanel } from "@/components/ui/glass-panel"
import { WaterLevelMeter } from "@/components/metrics/water-level-meter"

interface TokenPreviewProps {
  formData: TokenFormData
}

export function TokenPreview({ formData }: TokenPreviewProps) {
  // Simulate initial water level based on settings
  const simulatedWaterLevel = Math.min(100, formData.pourRate * 20 + 40)

  return (
    <GlassPanel className="p-6" glow>
      <h3 className="text-sm font-medium text-[var(--text-secondary)] mb-4">Live Preview</h3>

      {/* Token Card Preview */}
      <div className="p-4 rounded-xl bg-[var(--ocean-surface)] border border-[var(--glass-border)]">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--aqua-primary)] to-[var(--warm-pink)] flex items-center justify-center overflow-hidden">
            {formData.imagePreview ? (
              <img
                src={formData.imagePreview || "/placeholder.svg"}
                alt="Preview"
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-lg font-bold text-[var(--ocean-deep)]">{formData.symbol?.charAt(0) || "?"}</span>
            )}
          </div>
          <div>
            <h4 className="font-medium text-[var(--text-primary)]">{formData.name || "Token Name"}</h4>
            <p className="text-sm text-[var(--text-secondary)]">${formData.symbol || "SYMBOL"}</p>
          </div>
        </div>

        {/* Water Level */}
        <div className="mb-4">
          <WaterLevelMeter level={simulatedWaterLevel} size="sm" />
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-2 rounded-lg bg-[var(--ocean-deep)]">
            <p className="text-xs text-[var(--text-muted)]">Pour Rate</p>
            <p className="text-sm font-mono text-[var(--aqua-primary)]">{formData.pourRate}%</p>
          </div>
          <div className="p-2 rounded-lg bg-[var(--ocean-deep)]">
            <p className="text-xs text-[var(--text-muted)]">Evaporation</p>
            <p className="text-sm font-mono text-[var(--warm-orange)]">{formData.evaporationRate}%</p>
          </div>
        </div>
      </div>

      {/* Settings Summary */}
      <div className="mt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">Total Supply</span>
          <span className="text-xs font-mono text-[var(--text-primary)]">
            {Number(formData.totalSupply).toLocaleString()}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">Migration Target</span>
          <span className="text-xs font-mono text-[var(--text-primary)]">{formData.migrationThreshold} SOL</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-xs text-[var(--text-muted)]">Curve Type</span>
          <span className="text-xs font-mono text-[var(--text-primary)] capitalize">{formData.bondingCurveType}</span>
        </div>
      </div>

      {/* Health Indicator */}
      <div className="mt-4 pt-4 border-t border-[var(--glass-border)]">
        <p className="text-xs text-[var(--text-muted)] mb-2">Projected Health</p>
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-[var(--ocean-surface)] rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--aqua-primary)] to-emerald-400"
              style={{ width: `${simulatedWaterLevel}%` }}
            />
          </div>
          <span className="text-xs font-medium text-emerald-400">
            {simulatedWaterLevel >= 70 ? "Excellent" : simulatedWaterLevel >= 50 ? "Good" : "Fair"}
          </span>
        </div>
      </div>
    </GlassPanel>
  )
}
