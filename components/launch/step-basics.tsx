"use client"

import type React from "react"

import type { TokenFormData } from "./launch-wizard"
import { useRef } from "react"
import { TerminalButton, TerminalInput } from "@/components/ui/terminal-panel"

interface StepBasicsProps {
  formData: TokenFormData
  updateFormData: (updates: Partial<TokenFormData>) => void
  onNext: () => void
}

export function StepBasics({ formData, updateFormData, onNext }: StepBasicsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onloadend = () => {
        updateFormData({
          imageFile: file,
          imagePreview: reader.result as string,
        })
      }
      reader.readAsDataURL(file)
    }
  }

  const isValid = formData.name.length >= 2 && formData.symbol.length >= 2 && formData.symbol.length <= 10

  return (
    <div className="font-mono">
      <div className="text-[var(--aqua-primary)] mb-1">$ init --token-basics</div>
      <div className="text-xs text-[var(--text-muted)] mb-6">{">"} Define token identity and metadata</div>

      <div className="space-y-6">
        {/* Image Upload - Terminal Style */}
        <div>
          <div className="text-xs text-[var(--text-muted)] uppercase mb-2">TOKEN_IMAGE</div>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-16 h-16 rounded border border-dashed border-[var(--terminal-border)] hover:border-[var(--aqua-primary)] transition-colors flex items-center justify-center overflow-hidden bg-black/30"
            >
              {formData.imagePreview ? (
                <img
                  src={formData.imagePreview || "/placeholder.svg"}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[var(--text-muted)] text-xl">+</span>
              )}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageChange} className="hidden" />
            <div className="text-xs text-[var(--text-muted)]">
              <div>{">"} PNG, JPG, GIF</div>
              <div>{">"} MAX_SIZE: 2MB</div>
            </div>
          </div>
        </div>

        {/* Name & Symbol */}
        <div className="grid grid-cols-2 gap-4">
          <TerminalInput
            label="TOKEN_NAME"
            value={formData.name}
            onChange={(e) => updateFormData({ name: e.target.value })}
            placeholder="aqua_protocol"
          />
          <TerminalInput
            label="TOKEN_SYMBOL"
            value={formData.symbol}
            onChange={(e) => updateFormData({ symbol: e.target.value.toUpperCase() })}
            placeholder="AQUA"
            maxLength={10}
          />
        </div>

        {/* Description */}
        <div>
          <div className="text-xs text-[var(--text-muted)] uppercase mb-2">DESCRIPTION</div>
          <textarea
            value={formData.description}
            onChange={(e) => updateFormData({ description: e.target.value })}
            placeholder="> enter token description..."
            rows={3}
            maxLength={500}
            className="terminal-input w-full resize-none"
          />
          <div className="text-[10px] text-[var(--text-muted)] mt-1">CHARS: {formData.description.length}/500</div>
        </div>

        {/* Social Links */}
        <div>
          <div className="text-xs text-[var(--text-muted)] uppercase mb-3">SOCIAL_LINKS</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <TerminalInput
              label="WEBSITE"
              value={formData.website}
              onChange={(e) => updateFormData({ website: e.target.value })}
              placeholder="https://..."
              prefix="@"
            />
            <TerminalInput
              label="TWITTER"
              value={formData.twitter}
              onChange={(e) => updateFormData({ twitter: e.target.value })}
              placeholder="https://twitter.com/..."
              prefix="@"
            />
            <TerminalInput
              label="TELEGRAM"
              value={formData.telegram}
              onChange={(e) => updateFormData({ telegram: e.target.value })}
              placeholder="https://t.me/..."
              prefix="@"
            />
            <TerminalInput
              label="DISCORD"
              value={formData.discord}
              onChange={(e) => updateFormData({ discord: e.target.value })}
              placeholder="https://discord.gg/..."
              prefix="@"
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-end mt-8">
        <TerminalButton onClick={onNext} disabled={!isValid}>
          CONTINUE
        </TerminalButton>
      </div>
    </div>
  )
}
