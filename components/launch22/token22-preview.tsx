"use client"

import type { Token22FormData } from "./token22-wizard"
import { GlassPanel } from "@/components/ui/glass-panel"
import { Droplets, Zap, Shield, Lock, TrendingUp, ExternalLink } from "lucide-react"

interface Token22PreviewProps {
  formData: Token22FormData
}

export function Token22Preview({ formData }: Token22PreviewProps) {
  // Calculate preview values
  const totalSupply = parseFloat(formData.totalSupply) || 1000000000
  const lpTokens = totalSupply * (formData.lpAllocation / 100)
  const solAmount = parseFloat(formData.poolSolAmount) || 1
  const pricePerToken = lpTokens > 0 ? solAmount / lpTokens : 0
  const initialMarketCap = pricePerToken * totalSupply

  return (
    <GlassPanel title="Live Preview" className="rounded-2xl">
      <div className="space-y-6">
        {/* Token Card Preview */}
        <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-slate-900 to-slate-800 border border-white/10 p-4">
          {/* Token-2022 Badge */}
          <div className="absolute top-3 right-3">
            <span className="px-2 py-1 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-xs font-medium text-emerald-400">
              Token-2022
            </span>
          </div>
          
          {/* Token Identity */}
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-500/20 to-purple-500/20 flex items-center justify-center overflow-hidden border-2 border-white/10">
              {formData.imagePreview ? (
                <img src={formData.imagePreview} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-2xl">🪙</span>
              )}
            </div>
            <div>
              <h3 className="font-bold text-white">
                {formData.name || "Token Name"}
              </h3>
              <p className="text-sm text-cyan-400">
                ${formData.symbol || "SYMBOL"}
              </p>
            </div>
          </div>

          {/* Description */}
          <p className="text-xs text-white/60 line-clamp-2 mb-4">
            {formData.description || "Your token description will appear here..."}
          </p>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2 rounded-lg bg-white/5">
              <p className="text-[10px] text-white/40">Supply</p>
              <p className="text-xs font-medium text-white">
                {totalSupply.toLocaleString()}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-white/5">
              <p className="text-[10px] text-white/40">Launch Price</p>
              <p className="text-xs font-medium text-purple-400">
                {pricePerToken > 0 
                  ? (pricePerToken < 0.000001 ? pricePerToken.toExponential(2) : pricePerToken.toFixed(6))
                  : "—"
                } SOL
              </p>
            </div>
          </div>
        </div>

        {/* Features Summary */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wide">Token Features</p>
          
          {/* Transfer Fee */}
          <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
            formData.enableTransferFee ? 'bg-amber-500/10' : 'bg-white/5'
          }`}>
            <Zap className={`w-4 h-4 ${formData.enableTransferFee ? 'text-amber-400' : 'text-white/30'}`} />
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Transfer Fee</p>
            </div>
            <span className={`text-xs font-medium ${formData.enableTransferFee ? 'text-amber-400' : 'text-white/40'}`}>
              {formData.enableTransferFee ? `${(formData.transferFeeBasisPoints / 100).toFixed(2)}%` : 'Off'}
            </span>
          </div>

          {/* Mint Authority */}
          <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
            formData.revokeMintAuthority ? 'bg-emerald-500/10' : 'bg-amber-500/10'
          }`}>
            <Shield className={`w-4 h-4 ${formData.revokeMintAuthority ? 'text-emerald-400' : 'text-amber-400'}`} />
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Mint Authority</p>
            </div>
            <span className={`text-xs font-medium ${formData.revokeMintAuthority ? 'text-emerald-400' : 'text-amber-400'}`}>
              {formData.revokeMintAuthority ? 'Revoked ✓' : 'Kept'}
            </span>
          </div>

          {/* Liquidity Pool */}
          <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
            formData.autoCreatePool ? 'bg-cyan-500/10' : 'bg-white/5'
          }`}>
            <Droplets className={`w-4 h-4 ${formData.autoCreatePool ? 'text-cyan-400' : 'text-white/30'}`} />
            <div className="flex-1">
              <p className="text-xs font-medium text-white">Raydium Pool</p>
            </div>
            <span className={`text-xs font-medium ${formData.autoCreatePool ? 'text-cyan-400' : 'text-white/40'}`}>
              {formData.autoCreatePool ? `${formData.poolSolAmount} SOL` : 'Manual'}
            </span>
          </div>

          {/* LP Lock */}
          {formData.autoCreatePool && (
            <div className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
              formData.lockLpTokens ? 'bg-amber-500/10' : 'bg-white/5'
            }`}>
              <Lock className={`w-4 h-4 ${formData.lockLpTokens ? 'text-amber-400' : 'text-white/30'}`} />
              <div className="flex-1">
                <p className="text-xs font-medium text-white">LP Lock</p>
              </div>
              <span className={`text-xs font-medium ${formData.lockLpTokens ? 'text-amber-400' : 'text-white/40'}`}>
                {formData.lockLpTokens ? `${formData.lpLockDurationDays}d` : 'No'}
              </span>
            </div>
          )}
        </div>

        {/* Distribution Preview */}
        <div className="space-y-3">
          <p className="text-xs font-medium text-white/50 uppercase tracking-wide">Distribution</p>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden flex">
            <div 
              className="h-full bg-blue-500" 
              style={{ width: `${formData.teamAllocation}%` }}
              title="Team"
            />
            <div 
              className="h-full bg-cyan-500" 
              style={{ width: `${formData.lpAllocation}%` }}
              title="Liquidity"
            />
            <div 
              className="h-full bg-amber-500" 
              style={{ width: `${formData.lockedAllocation}%` }}
              title="Locked"
            />
          </div>
          <div className="flex justify-between text-[10px]">
            <span className="text-blue-400">Team {formData.teamAllocation}%</span>
            <span className="text-cyan-400">LP {formData.lpAllocation}%</span>
            <span className="text-amber-400">Lock {formData.lockedAllocation}%</span>
          </div>
        </div>

        {/* Market Cap Preview */}
        {formData.autoCreatePool && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-white/50">Est. Initial Market Cap</span>
            </div>
            <p className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              {initialMarketCap.toFixed(2)} SOL
            </p>
          </div>
        )}

        {/* DEX Link Preview */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <img 
              src="/pumpswap-logo.png" 
              alt="Raydium" 
              className="w-5 h-5 rounded"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none'
              }}
            />
            <span className="text-xs text-white/70">Trading on Raydium</span>
          </div>
          <ExternalLink className="w-4 h-4 text-white/30" />
        </div>
      </div>
    </GlassPanel>
  )
}

