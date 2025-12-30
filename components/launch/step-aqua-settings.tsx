"use client"

import type { TokenFormData } from "./launch-wizard"
import { GlassButton } from "@/components/ui/glass-panel"
import { Droplets, Flame, Waves } from "lucide-react"

interface StepAquaSettingsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
  onBack: () => void
}

export function StepAquaSettings({ formData, updateFormData, onNext, onBack }: StepAquaSettingsProps) {
  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">This is where the magic happens. Set your liquidity mechanics.</p>
      </div>

      <div className="space-y-6">
        {/* Pour Rate */}
        <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
                <Droplets className="w-5 h-5 text-cyan-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Pour Rate</div>
                <div className="text-xs text-white/40">Liquidity injection per hour</div>
              </div>
            </div>
            <div className="text-3xl font-bold text-cyan-400">{formData.pourRate}%</div>
          </div>

          {/* Visual Bar */}
          <div className="h-3 rounded-full bg-black/30 overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 transition-all duration-300 rounded-full"
              style={{ width: `${(formData.pourRate / 5) * 100}%` }}
            />
          </div>

          <input
            type="range"
            min="0.1"
            max="5"
            step="0.1"
            value={formData.pourRate}
            onChange={(e) => updateFormData({ pourRate: Number(e.target.value) })}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10 
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400 
              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:shadow-cyan-500/30"
          />
          <div className="flex justify-between text-xs text-white/40 mt-2">
            <span>0.1% (Slow drip)</span>
            <span>5% (Firehose)</span>
          </div>
        </div>

        {/* Evaporation Rate */}
        <div className="p-5 rounded-xl bg-white/5 border border-orange-500/20">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Flame className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <div className="text-sm font-medium text-white">Evaporation (Burn)</div>
                <div className="text-xs text-white/40">Tokens burned per transaction</div>
              </div>
            </div>
            <div className="text-3xl font-bold text-orange-400">{formData.evaporationRate}%</div>
          </div>

          {/* Visual Bar */}
          <div className="h-3 rounded-full bg-black/30 overflow-hidden mb-3">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-red-500 transition-all duration-300 rounded-full"
              style={{ width: `${(formData.evaporationRate / 3) * 100}%` }}
            />
          </div>

          <input
            type="range"
            min="0"
            max="3"
            step="0.1"
            value={formData.evaporationRate}
            onChange={(e) => updateFormData({ evaporationRate: Number(e.target.value) })}
            className="w-full h-2 rounded-lg appearance-none cursor-pointer bg-white/10
              [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 
              [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-400 
              [&::-webkit-slider-thumb]:cursor-pointer [&::-webkit-slider-thumb]:shadow-lg
              [&::-webkit-slider-thumb]:shadow-orange-500/30"
          />
          <div className="flex justify-between text-xs text-white/40 mt-2">
            <span>0% (No burn)</span>
            <span>3% (High burn)</span>
          </div>
        </div>

        {/* Projected Metrics */}
        <div className="p-5 rounded-xl bg-gradient-to-r from-green-500/10 to-cyan-500/10 border border-green-500/20">
          <div className="flex items-center gap-2 mb-4">
            <Waves className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium text-white">Projected Daily Metrics</span>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div>
              <div className="text-xs text-white/40 mb-1">Daily Liquidity Growth</div>
              <div className="text-2xl font-bold text-cyan-400">+{(formData.pourRate * 24).toFixed(1)}%</div>
            </div>
            <div>
              <div className="text-xs text-white/40 mb-1">Daily Burn Rate</div>
              <div className="text-2xl font-bold text-orange-400">
                {formData.evaporationRate > 0 ? `~${formData.evaporationRate}%` : "0%"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <GlassButton onClick={onBack} variant="outline">
          ← Back
        </GlassButton>
        <GlassButton onClick={onNext} variant="primary">
          Review & Launch →
        </GlassButton>
      </div>
    </div>
  )
}
