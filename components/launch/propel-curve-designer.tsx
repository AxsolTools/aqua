"use client"

import { useState } from "react"
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { GlassButton } from "@/components/ui/glass-panel"
import { cn } from "@/lib/utils"

interface CurveRange {
  price: number
  liquidity: number
}

interface PropelCurveDesignerProps {
  formData: any
  updateFormData: (updates: any) => void
  onNext: () => void
  onBack: () => void
}

const PRESETS = {
  smooth: {
    name: '🌊 Smooth Operator',
    description: 'Steady growth with minimal volatility',
    ranges: [
      { price: 0.00001, liquidity: 1000 },
      { price: 0.0001, liquidity: 1000 },
      { price: 0.001, liquidity: 1000 },
      { price: 0.01, liquidity: 1000 },
    ],
  },
  explosive: {
    name: '🚀 Rocket Fuel',
    description: 'Low middle liquidity = explosive price action',
    ranges: [
      { price: 0.00001, liquidity: 2000 },
      { price: 0.0001, liquidity: 500 },
      { price: 0.001, liquidity: 500 },
      { price: 0.01, liquidity: 2000 },
    ],
  },
  whale_trap: {
    name: '🐋 Whale Trap',
    description: 'Easy to buy, harder to sell',
    ranges: [
      { price: 0.00001, liquidity: 3000 },
      { price: 0.0001, liquidity: 1500 },
      { price: 0.001, liquidity: 800 },
      { price: 0.01, liquidity: 500 },
    ],
  },
  diamond_hands: {
    name: '💎 Diamond Hands',
    description: 'Rewards long-term holders',
    ranges: [
      { price: 0.00001, liquidity: 800 },
      { price: 0.0001, liquidity: 1200 },
      { price: 0.001, liquidity: 1800 },
      { price: 0.01, liquidity: 2500 },
    ],
  },
}

export function PropelCurveDesigner({ formData, updateFormData, onNext, onBack }: PropelCurveDesignerProps) {
  const [activePreset, setActivePreset] = useState(formData.preset || 'smooth')
  const [customRanges, setCustomRanges] = useState<CurveRange[]>(formData.customCurveRanges || PRESETS.smooth.ranges)

  const handlePresetChange = (preset: keyof typeof PRESETS) => {
    setActivePreset(preset)
    const presetData = PRESETS[preset]
    setCustomRanges(presetData.ranges)
    updateFormData({
      preset,
      customCurveRanges: presetData.ranges,
    })
  }

  const handleCustomRangeChange = (index: number, field: 'price' | 'liquidity', value: number) => {
    const newRanges = [...customRanges]
    newRanges[index] = { ...newRanges[index], [field]: value }
    setCustomRanges(newRanges)
    setActivePreset('custom')
    updateFormData({
      preset: 'custom',
      customCurveRanges: newRanges,
    })
  }

  const addRange = () => {
    const lastRange = customRanges[customRanges.length - 1]
    const newRange = {
      price: lastRange.price * 10,
      liquidity: lastRange.liquidity,
    }
    const newRanges = [...customRanges, newRange]
    setCustomRanges(newRanges)
    setActivePreset('custom')
    updateFormData({
      preset: 'custom',
      customCurveRanges: newRanges,
    })
  }

  const removeRange = (index: number) => {
    if (customRanges.length <= 2) return // Keep at least 2 ranges
    const newRanges = customRanges.filter((_, i) => i !== index)
    setCustomRanges(newRanges)
    setActivePreset('custom')
    updateFormData({
      preset: 'custom',
      customCurveRanges: newRanges,
    })
  }

  // Generate chart data for Recharts
  const chartData = customRanges.map((r, i) => ({
    name: `$${r.price.toFixed(6)}`,
    price: r.price,
    liquidity: r.liquidity,
    index: i,
  }))

  const chartConfig = {
    liquidity: {
      label: "Liquidity",
      color: "hsl(var(--chart-1))",
    },
  }

  return (
    <div className="space-y-6">
      {/* Header with emoji */}
      <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-500/10 to-teal-500/10 border border-cyan-500/20">
        <p className="text-white/80 text-sm">
          📊 <span className="font-medium text-cyan-400">Design your bonding curve.</span> Choose a preset or build custom ranges to control your token's price action.
        </p>
      </div>

      {/* Preset Selection - Matching your style */}
      <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center text-lg">
            🎨
          </div>
          <div>
            <div className="text-sm font-medium text-white">Curve Presets</div>
            <div className="text-xs text-white/40">Battle-tested bonding curve strategies</div>
          </div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(PRESETS).map(([key, preset]) => (
            <button
              key={key}
              onClick={() => handlePresetChange(key as keyof typeof PRESETS)}
              className={cn(
                "p-4 rounded-lg border-2 transition-all text-left",
                activePreset === key
                  ? "border-cyan-500 bg-cyan-500/10"
                  : "border-white/10 bg-white/5 hover:border-white/20"
              )}
            >
              <div className="font-semibold mb-1 text-white">{preset.name}</div>
              <div className="text-sm text-white/60">{preset.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chart Preview - Using your existing Recharts */}
      <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center text-sm">
            📊
          </div>
          <div>
            <div className="text-sm font-medium text-white">Liquidity Distribution</div>
            <div className="text-xs text-white/40">Visual preview of your bonding curve</div>
          </div>
        </div>
        
        <ChartContainer config={chartConfig} className="h-64 w-full">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="fillLiquidity" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="rgb(6, 182, 212)" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="rgb(6, 182, 212)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis 
              dataKey="name" 
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
              label={{ value: 'Price', position: 'insideBottom', offset: -5, fill: 'rgba(255,255,255,0.5)' }}
            />
            <YAxis 
              stroke="rgba(255,255,255,0.3)"
              tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
              label={{ value: 'Liquidity', angle: -90, position: 'insideLeft', fill: 'rgba(255,255,255,0.5)' }}
            />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area 
              type="monotone" 
              dataKey="liquidity" 
              stroke="rgb(6, 182, 212)" 
              strokeWidth={2}
              fill="url(#fillLiquidity)"
            />
          </AreaChart>
        </ChartContainer>
      </div>

      {/* Custom Range Editor - Matching your style */}
      <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center text-lg">
              🎯
            </div>
            <div>
              <div className="text-sm font-medium text-white">
                {activePreset === 'custom' ? 'Custom Ranges' : 'Range Preview'}
              </div>
              <div className="text-xs text-white/40">
                {customRanges.length} price range{customRanges.length !== 1 ? 's' : ''} configured
              </div>
            </div>
          </div>
          {activePreset === 'custom' && customRanges.length < 20 && (
            <button
              onClick={addRange}
              className="text-sm px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 hover:bg-cyan-500/30 transition-all"
            >
              + Add Range
            </button>
          )}
        </div>
        
        <div className="space-y-2">
          {customRanges.map((range, index) => (
            <div key={index} className="flex items-center gap-3 p-3 bg-black/20 rounded-lg border border-white/10">
              <div className="flex-1">
                <label className="text-xs text-white/60 mb-1 block">Price</label>
                <input
                  type="number"
                  step="0.000001"
                  value={range.price}
                  onChange={(e) => handleCustomRangeChange(index, 'price', parseFloat(e.target.value) || 0)}
                  disabled={activePreset !== 'custom'}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              
              <div className="flex-1">
                <label className="text-xs text-white/60 mb-1 block">Liquidity</label>
                <input
                  type="number"
                  step="100"
                  value={range.liquidity}
                  onChange={(e) => handleCustomRangeChange(index, 'liquidity', parseFloat(e.target.value) || 0)}
                  disabled={activePreset !== 'custom'}
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded text-sm text-white disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              
              {activePreset === 'custom' && customRanges.length > 2 && (
                <button
                  onClick={() => removeRange(index)}
                  className="mt-5 p-2 text-red-400 hover:text-red-300 transition-colors"
                  title="Remove range"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Advanced Settings - Matching your AQUA style */}
      <div className="p-5 rounded-xl bg-white/5 border border-cyan-500/20 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-cyan-500/20 flex items-center justify-center text-lg">
            ⚙️
          </div>
          <div>
            <div className="text-sm font-medium text-white">Advanced Settings</div>
            <div className="text-xs text-white/40">Configure quote token, fees, and LP distribution</div>
          </div>
        </div>
        
        {/* Quote Token */}
        <div>
          <label className="block text-xs text-white/60 mb-2">Quote Token</label>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => updateFormData({ quoteMint: 'sol' })}
              className={cn(
                "p-3 rounded-lg border transition-all",
                formData.quoteMint === 'sol'
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                  : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
              )}
            >
              <div className="font-semibold">SOL</div>
              <div className="text-xs opacity-60">Traditional</div>
            </button>
            
            <button
              onClick={() => updateFormData({ quoteMint: 'usdc' })}
              className={cn(
                "p-3 rounded-lg border transition-all",
                formData.quoteMint === 'usdc'
                  ? "border-cyan-500 bg-cyan-500/10 text-cyan-400"
                  : "border-white/10 bg-white/5 text-white/60 hover:border-white/20"
              )}
            >
              <div className="font-semibold">USDC</div>
              <div className="text-xs opacity-60">Stable pricing</div>
            </button>
          </div>
        </div>

        {/* Migration Threshold */}
        <div>
          <label className="block text-xs text-white/60 mb-2">
            Migration Threshold ({formData.quoteMint === 'sol' ? 'SOL' : 'USDC'})
          </label>
          <input
            type="number"
            step="1"
            value={formData.migrationThresholdSol || 85}
            onChange={(e) => updateFormData({ migrationThresholdSol: parseFloat(e.target.value) || 85 })}
            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
            placeholder="85"
          />
          <p className="text-xs text-white/40 mt-1">
            Token graduates when this amount is raised
          </p>
        </div>

        {/* Trading Fee */}
        <div>
          <label className="block text-xs text-white/60 mb-2">Trading Fee (basis points)</label>
          <input
            type="number"
            step="10"
            value={formData.tradingFeeBps || 100}
            onChange={(e) => updateFormData({ tradingFeeBps: parseInt(e.target.value) || 100 })}
            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
            placeholder="100"
          />
          <p className="text-xs text-white/40 mt-1">
            100 = 1%, 200 = 2%, etc.
          </p>
        </div>

        {/* LP Distribution */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-white/60 mb-2">Creator LP %</label>
            <input
              type="number"
              step="5"
              min="0"
              max="100"
              value={formData.creatorLpPercentage || 90}
              onChange={(e) => updateFormData({ creatorLpPercentage: parseInt(e.target.value) || 90 })}
              className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
            />
          </div>
          
          <div>
            <label className="block text-xs text-white/60 mb-2">Creator Locked LP %</label>
            <input
              type="number"
              step="5"
              min="0"
              max="100"
              value={formData.creatorLockedLpPercentage || 0}
              onChange={(e) => updateFormData({ creatorLockedLpPercentage: parseInt(e.target.value) || 0 })}
              className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-white"
            />
          </div>
        </div>
      </div>

      {/* Navigation - Matching your style */}
      <div className="flex justify-between pt-4 border-t border-white/10">
        <button
          onClick={onBack}
          className="px-4 py-2 text-sm font-medium text-white/60 hover:text-white transition-colors"
        >
          ← Back
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-semibold hover:from-cyan-400 hover:to-blue-400 transition-all shadow-lg shadow-cyan-500/20"
        >
          Continue →
        </button>
      </div>
    </div>
  )
}
