"use client"

import type React from "react"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"

interface FintechCardProps {
  children: React.ReactNode
  className?: string
  glow?: boolean
  hover?: boolean
}

export function FintechCard({ children, className, glow, hover }: FintechCardProps) {
  return (
    <div
      className={cn(
        "relative rounded-xl p-5",
        "bg-gradient-to-br from-zinc-900/90 to-zinc-950/90",
        "border border-zinc-800",
        "backdrop-blur-sm",
        glow && "shadow-lg shadow-teal-500/5",
        hover && "transition-all duration-300 hover:border-teal-500/30 hover:shadow-xl hover:shadow-teal-500/10",
        className
      )}
    >
      {children}
    </div>
  )
}

interface FintechHeaderProps {
  title: string
  subtitle?: string
  badge?: string
  badgeColor?: "teal" | "green" | "amber" | "red"
  action?: React.ReactNode
}

export function FintechHeader({ title, subtitle, badge, badgeColor = "teal", action }: FintechHeaderProps) {
  const badgeColors = {
    teal: "bg-teal-500/10 text-teal-400 border-teal-500/20",
    green: "bg-green-500/10 text-green-400 border-green-500/20",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    red: "bg-red-500/10 text-red-400 border-red-500/20",
  }

  return (
    <div className="flex items-start justify-between mb-5">
      <div>
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
          {badge && (
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium border",
              badgeColors[badgeColor]
            )}>
              {badge}
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm text-zinc-500 mt-1">{subtitle}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

interface MetricCardProps {
  label: string
  value: string | number
  suffix?: string
  change?: { value: number; positive: boolean }
  icon?: React.ReactNode
  color?: "default" | "teal" | "green" | "amber" | "red"
}

export function MetricCard({ label, value, suffix, change, icon, color = "default" }: MetricCardProps) {
  const colorClasses = {
    default: "text-zinc-100",
    teal: "text-teal-400",
    green: "text-green-400",
    amber: "text-amber-400",
    red: "text-red-400",
  }

  return (
    <div className="p-4 rounded-lg bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-500 uppercase tracking-wide">{label}</span>
        {icon && <span className="text-zinc-600">{icon}</span>}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className={cn("text-2xl font-bold tabular-nums", colorClasses[color])}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {suffix && <span className="text-sm text-zinc-500">{suffix}</span>}
      </div>
      {change && (
        <div className={cn(
          "text-xs mt-1.5 font-medium",
          change.positive ? "text-green-400" : "text-red-400"
        )}>
          {change.positive ? "↑" : "↓"} {Math.abs(change.value)}%
        </div>
      )}
    </div>
  )
}

interface ProgressBarProps {
  value: number
  max?: number
  label?: string
  showValue?: boolean
  color?: "teal" | "green" | "amber" | "red"
  size?: "sm" | "md" | "lg"
}

export function ProgressBar({ value, max = 100, label, showValue = true, color = "teal", size = "md" }: ProgressBarProps) {
  const percentage = Math.min((value / max) * 100, 100)
  
  const colorClasses = {
    teal: "bg-gradient-to-r from-teal-600 to-teal-400",
    green: "bg-gradient-to-r from-green-600 to-green-400",
    amber: "bg-gradient-to-r from-amber-600 to-amber-400",
    red: "bg-gradient-to-r from-red-600 to-red-400",
  }

  const sizeClasses = {
    sm: "h-1.5",
    md: "h-2.5",
    lg: "h-4",
  }

  return (
    <div>
      {(label || showValue) && (
        <div className="flex justify-between text-xs mb-1.5">
          {label && <span className="text-zinc-500">{label}</span>}
          {showValue && <span className="text-zinc-400 tabular-nums">{percentage.toFixed(1)}%</span>}
        </div>
      )}
      <div className={cn("rounded-full bg-zinc-800 overflow-hidden", sizeClasses[size])}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          className={cn("h-full rounded-full", colorClasses[color])}
        />
      </div>
    </div>
  )
}

interface StatusBadgeProps {
  status: "online" | "offline" | "pending" | "active" | "inactive"
  label?: string
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  const statusConfig = {
    online: { color: "bg-green-500", text: "text-green-400", label: label || "Online" },
    active: { color: "bg-green-500", text: "text-green-400", label: label || "Active" },
    offline: { color: "bg-zinc-500", text: "text-zinc-400", label: label || "Offline" },
    inactive: { color: "bg-zinc-500", text: "text-zinc-400", label: label || "Inactive" },
    pending: { color: "bg-amber-500", text: "text-amber-400", label: label || "Pending" },
  }

  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <span className={cn("w-2 h-2 rounded-full animate-pulse", config.color)} />
      <span className={cn("text-xs font-medium", config.text)}>{config.label}</span>
    </div>
  )
}

interface FeatureCardProps {
  icon: React.ReactNode
  title: string
  description: string
  color?: "teal" | "amber" | "purple"
}

export function FeatureCard({ icon, title, description, color = "teal" }: FeatureCardProps) {
  const colorClasses = {
    teal: {
      icon: "text-teal-400 bg-teal-500/10 border-teal-500/20",
      title: "text-teal-400",
    },
    amber: {
      icon: "text-amber-400 bg-amber-500/10 border-amber-500/20",
      title: "text-amber-400",
    },
    purple: {
      icon: "text-purple-400 bg-purple-500/10 border-purple-500/20",
      title: "text-purple-400",
    },
  }

  const classes = colorClasses[color]

  return (
    <div className="p-5 rounded-xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-all group">
      <div className={cn(
        "w-12 h-12 rounded-lg flex items-center justify-center border mb-4",
        classes.icon
      )}>
        {icon}
      </div>
      <h4 className={cn("font-semibold mb-1.5", classes.title)}>{title}</h4>
      <p className="text-sm text-zinc-500">{description}</p>
    </div>
  )
}

interface ActionButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost"
  size?: "sm" | "md" | "lg"
  icon?: React.ReactNode
  loading?: boolean
}

export function ActionButton({ 
  children, 
  variant = "primary", 
  size = "md", 
  icon, 
  loading,
  className,
  disabled,
  ...props 
}: ActionButtonProps) {
  const variantClasses = {
    primary: "bg-gradient-to-r from-teal-600 to-teal-500 text-white hover:from-teal-500 hover:to-teal-400 shadow-lg shadow-teal-500/20",
    secondary: "bg-zinc-800 text-zinc-100 hover:bg-zinc-700 border border-zinc-700",
    outline: "border border-zinc-700 text-zinc-300 hover:bg-zinc-800 hover:border-zinc-600",
    ghost: "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/50",
  }

  const sizeClasses = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-base",
  }

  return (
    <button
      className={cn(
        "rounded-lg font-medium transition-all duration-200 flex items-center justify-center gap-2",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      ) : icon}
      {children}
    </button>
  )
}

interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="text-center py-12 px-6">
      {icon && (
        <div className="w-16 h-16 mx-auto mb-4 rounded-xl bg-zinc-800/50 border border-zinc-700 flex items-center justify-center text-zinc-500">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-zinc-200 mb-2">{title}</h3>
      <p className="text-sm text-zinc-500 mb-6 max-w-sm mx-auto">{description}</p>
      {action}
    </div>
  )
}

