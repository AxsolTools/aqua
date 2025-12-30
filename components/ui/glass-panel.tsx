"use client"

import type React from "react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface GlassPanelProps {
  children: ReactNode
  title?: string
  subtitle?: string
  className?: string
  glowColor?: "cyan" | "purple" | "green" | "orange"
  showBorder?: boolean
}

export function GlassPanel({ 
  children, 
  title, 
  subtitle,
  className, 
  glowColor = "cyan",
  showBorder = true 
}: GlassPanelProps) {
  const glowClasses = {
    cyan: "shadow-[0_0_30px_rgba(0,255,255,0.1)] hover:shadow-[0_0_40px_rgba(0,255,255,0.15)]",
    purple: "shadow-[0_0_30px_rgba(147,51,234,0.1)] hover:shadow-[0_0_40px_rgba(147,51,234,0.15)]",
    green: "shadow-[0_0_30px_rgba(34,197,94,0.1)] hover:shadow-[0_0_40px_rgba(34,197,94,0.15)]",
    orange: "shadow-[0_0_30px_rgba(249,115,22,0.1)] hover:shadow-[0_0_40px_rgba(249,115,22,0.15)]",
  }

  const borderClasses = {
    cyan: "border-cyan-500/20",
    purple: "border-purple-500/20",
    green: "border-green-500/20", 
    orange: "border-orange-500/20",
  }

  return (
    <motion.div 
      className={cn(
        "relative rounded-2xl bg-black/40 backdrop-blur-xl transition-all duration-300",
        showBorder && "border",
        showBorder && borderClasses[glowColor],
        glowClasses[glowColor],
        className
      )}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Gradient overlay */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-white/5 via-transparent to-transparent pointer-events-none" />
      
      {/* Content */}
      <div className="relative">
        {(title || subtitle) && (
          <div className="px-6 py-4 border-b border-white/10">
            {title && (
              <h3 className="text-lg font-semibold text-white">{title}</h3>
            )}
            {subtitle && (
              <p className="text-sm text-white/50 mt-1">{subtitle}</p>
            )}
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </motion.div>
  )
}

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
}

export function GlassInput({ label, hint, error, className, ...props }: GlassInputProps) {
  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-white/80">{label}</label>
      )}
      <input 
        className={cn(
          "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10",
          "text-white placeholder:text-white/30",
          "focus:outline-none focus:border-cyan-500/50 focus:bg-white/10",
          "transition-all duration-200",
          error && "border-red-500/50",
          className
        )} 
        {...props} 
      />
      {hint && !error && (
        <p className="text-xs text-white/40">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  charCount?: number
  maxChars?: number
}

export function GlassTextarea({ label, hint, error, charCount, maxChars, className, ...props }: GlassTextareaProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        {label && (
          <label className="block text-sm font-medium text-white/80">{label}</label>
        )}
        {maxChars && (
          <span className={cn(
            "text-xs",
            charCount && charCount > maxChars ? "text-red-400" : "text-white/40"
          )}>
            {charCount || 0}/{maxChars}
          </span>
        )}
      </div>
      <textarea 
        className={cn(
          "w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10",
          "text-white placeholder:text-white/30",
          "focus:outline-none focus:border-cyan-500/50 focus:bg-white/10",
          "transition-all duration-200 resize-none",
          error && "border-red-500/50",
          className
        )} 
        {...props} 
      />
      {hint && !error && (
        <p className="text-xs text-white/40">{hint}</p>
      )}
      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}
    </div>
  )
}

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline"
  size?: "sm" | "md" | "lg"
  children: ReactNode
  isLoading?: boolean
}

export function GlassButton({ 
  variant = "primary", 
  size = "md",
  children, 
  className, 
  isLoading,
  disabled,
  ...props 
}: GlassButtonProps) {
  const sizeClasses = {
    sm: "px-4 py-2 text-sm",
    md: "px-6 py-3",
    lg: "px-8 py-4 text-lg",
  }

  const variantClasses = {
    primary: "bg-gradient-to-r from-cyan-500 to-blue-500 text-black font-semibold hover:from-cyan-400 hover:to-blue-400",
    secondary: "bg-white/10 text-white hover:bg-white/20 border border-white/10",
    outline: "bg-transparent text-white border border-white/20 hover:bg-white/10",
  }

  return (
    <button 
      className={cn(
        "rounded-xl transition-all duration-200",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        sizeClasses[size],
        variantClasses[variant],
        className
      )}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center gap-2">
          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          <span>Processing...</span>
        </div>
      ) : children}
    </button>
  )
}

interface StepIndicatorProps {
  steps: Array<{ id: number; name: string; description?: string }>
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-between w-full">
      {steps.map((step, index) => (
        <div key={step.id} className="flex items-center flex-1">
          <div className="flex flex-col items-center">
            {/* Step circle */}
            <motion.div
              className={cn(
                "w-12 h-12 rounded-xl flex items-center justify-center font-semibold text-lg",
                "border-2 transition-all duration-300",
                currentStep > step.id 
                  ? "bg-cyan-500 border-cyan-500 text-black"
                  : currentStep === step.id
                    ? "bg-cyan-500/20 border-cyan-500 text-cyan-400"
                    : "bg-white/5 border-white/20 text-white/40"
              )}
              animate={{
                scale: currentStep === step.id ? 1.05 : 1,
              }}
            >
              {currentStep > step.id ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : step.id}
            </motion.div>
            
            {/* Step label */}
            <div className="mt-3 text-center">
              <p className={cn(
                "text-sm font-medium",
                currentStep >= step.id ? "text-white" : "text-white/40"
              )}>
                {step.name}
              </p>
              {step.description && (
                <p className="text-xs text-white/30 mt-0.5 hidden sm:block">{step.description}</p>
              )}
            </div>
          </div>

          {/* Connector line */}
          {index < steps.length - 1 && (
            <div className="flex-1 h-0.5 mx-4 bg-white/10 rounded overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-500 to-blue-500"
                initial={{ width: "0%" }}
                animate={{ width: currentStep > step.id ? "100%" : "0%" }}
                transition={{ duration: 0.3 }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

interface ImageUploadProps {
  value: string | null
  onChange: (file: File | null, preview: string | null) => void
  accept?: string
  maxSize?: number // in MB
}

export function ImageUpload({ value, onChange, accept = "image/*", maxSize = 2 }: ImageUploadProps) {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > maxSize * 1024 * 1024) {
        alert(`File size must be less than ${maxSize}MB`)
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => {
        onChange(file, reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <label className={cn(
      "flex flex-col items-center justify-center w-32 h-32 rounded-2xl cursor-pointer",
      "border-2 border-dashed transition-all duration-200",
      value 
        ? "border-cyan-500/50 bg-cyan-500/10" 
        : "border-white/20 bg-white/5 hover:border-cyan-500/30 hover:bg-white/10"
    )}>
      {value ? (
        <img src={value} alt="Preview" className="w-full h-full object-cover rounded-xl" />
      ) : (
        <div className="text-center p-4">
          <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-white/10 flex items-center justify-center">
            <svg className="w-5 h-5 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <span className="text-xs text-white/50">Upload Image</span>
          <span className="text-[10px] text-white/30 block mt-1">Max {maxSize}MB</span>
        </div>
      )}
      <input 
        type="file" 
        accept={accept}
        onChange={handleChange}
        className="hidden" 
      />
    </label>
  )
}
