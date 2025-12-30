"use client"

import type React from "react"
import { forwardRef } from "react"
import { cn } from "@/lib/utils"

interface GlassPanelProps extends React.HTMLAttributes<HTMLDivElement> {
  glow?: boolean | "aqua" | "orange" | "pink"
  variant?: "default" | "elevated" | "solid"
  hover?: boolean
}

export const GlassPanel = forwardRef<HTMLDivElement, GlassPanelProps>(
  ({ className, children, glow = false, variant = "default", hover = false, ...props }, ref) => {
    const variantClasses = {
      default: "glass-panel",
      elevated: "glass-panel-elevated",
      solid:
        "bg-[var(--ocean-surface)] border border-[var(--glass-border)] rounded-[var(--radius)] shadow-[0_4px_24px_rgba(0,0,0,0.2)]",
    }

    const glowClasses = {
      true: "shadow-[0_0_30px_rgba(0,242,255,0.15),_inset_0_0_30px_rgba(0,242,255,0.02)]",
      aqua: "shadow-[0_0_40px_rgba(0,242,255,0.2),_inset_0_0_30px_rgba(0,242,255,0.03)] border-[var(--aqua-border)]",
      orange:
        "shadow-[0_0_40px_rgba(255,107,53,0.15),_inset_0_0_30px_rgba(255,107,53,0.02)] border-[rgba(255,107,53,0.2)]",
      pink: "shadow-[0_0_40px_rgba(236,72,153,0.15),_inset_0_0_30px_rgba(236,72,153,0.02)] border-[rgba(236,72,153,0.2)]",
      false: "",
    }

    const glowClass = typeof glow === "boolean" ? (glow ? glowClasses.true : "") : glowClasses[glow]

    return (
      <div
        ref={ref}
        className={cn(
          variantClasses[variant],
          glowClass,
          hover &&
            "transition-all duration-300 hover:border-[var(--aqua-border)] hover:shadow-[0_0_30px_rgba(0,242,255,0.1)]",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

GlassPanel.displayName = "GlassPanel"
