import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        // Base styles with visible border
        'h-10 w-full min-w-0 rounded-md px-3 py-2 text-base md:text-sm',
        // Background and border - VISIBLE border color
        'bg-[var(--bg-input)] border border-[rgba(255,255,255,0.15)]',
        // Text and placeholder
        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
        // Focus states with aqua glow
        'focus:outline-none focus:border-[var(--aqua-primary)] focus:ring-2 focus:ring-[var(--aqua-primary)]/20',
        // Transitions
        'transition-all duration-150',
        // File input styles
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--text-primary)]',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Invalid state
        'aria-invalid:border-[var(--red)] aria-invalid:ring-[var(--red)]/20',
        // Selection
        'selection:bg-[var(--aqua-primary)] selection:text-white',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
