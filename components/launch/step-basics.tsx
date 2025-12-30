"use client"

import type React from "react"
import type { TokenFormData } from "./launch-wizard"
import { useRef } from "react"
import { GlassInput, GlassTextarea, GlassButton, ImageUpload } from "@/components/ui/glass-panel"

interface StepBasicsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
}

export function StepBasics({ formData, updateFormData, onNext }: StepBasicsProps) {
  const handleImageChange = (file: File | null, preview: string | null) => {
    updateFormData({
      imageFile: file,
      imagePreview: preview,
    })
  }

  const isValid = formData.name.length >= 2 && formData.symbol.length >= 2 && formData.symbol.length <= 10

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <p className="text-white/60 text-sm">Give your token an identity. This is what traders will see.</p>
      </div>

      {/* Image and Name/Symbol Row */}
      <div className="flex flex-col sm:flex-row gap-6">
        {/* Image Upload */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-3">Token Image</label>
          <ImageUpload 
            value={formData.imagePreview}
            onChange={handleImageChange}
            accept="image/png,image/jpeg,image/gif"
            maxSize={2}
          />
        </div>

        {/* Name & Symbol */}
        <div className="flex-1 space-y-4">
          <GlassInput
            label="Token Name"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            placeholder="e.g. Aqua Protocol"
            hint="Minimum 2 characters"
          />
          <GlassInput
            label="Token Symbol"
            value={formData.symbol}
            onChange={(e) => updateFormData({ symbol: e.target.value.toUpperCase() })}
            placeholder="e.g. AQUA"
            hint="2-10 characters, will be uppercase"
            maxLength={10}
          />
        </div>
      </div>

      {/* Description */}
      <GlassTextarea
        label="Description"
        value={formData.description}
        onChange={(e) => updateFormData({ description: e.target.value })}
        placeholder="What's your token about? Make it count..."
        rows={4}
        maxLength={500}
        charCount={formData.description.length}
        maxChars={500}
      />

      {/* Social Links */}
      <div>
        <label className="block text-sm font-medium text-white/80 mb-4">Social Links (Optional)</label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <GlassInput
            label="Website"
            value={formData.website}
            onChange={(e) => updateFormData({ website: e.target.value })}
            placeholder="https://yoursite.com"
          />
          <GlassInput
            label="Twitter"
            value={formData.twitter}
            onChange={(e) => updateFormData({ twitter: e.target.value })}
            placeholder="https://twitter.com/yourtoken"
          />
          <GlassInput
            label="Telegram"
            value={formData.telegram}
            onChange={(e) => updateFormData({ telegram: e.target.value })}
            placeholder="https://t.me/yourgroup"
          />
          <GlassInput
            label="Discord"
            value={formData.discord}
            onChange={(e) => updateFormData({ discord: e.target.value })}
            placeholder="https://discord.gg/yourserver"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <GlassButton onClick={onNext} disabled={!isValid} variant="primary">
          Continue →
        </GlassButton>
      </div>
    </div>
  )
}
