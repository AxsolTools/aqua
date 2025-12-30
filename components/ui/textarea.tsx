import * as React from 'react'

import { cn } from '@/lib/utils'

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        // Base styles
        'flex min-h-[80px] w-full rounded-md px-3 py-2 text-base md:text-sm',
        // Background and border - VISIBLE border color
        'bg-[var(--bg-input)] border border-[rgba(255,255,255,0.15)]',
        // Text and placeholder
        'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
        // Focus states with aqua glow
        'focus:outline-none focus:border-[var(--aqua-primary)] focus:ring-2 focus:ring-[var(--aqua-primary)]/20',
        // Transitions
        'transition-all duration-150',
        // Disabled state
        'disabled:cursor-not-allowed disabled:opacity-50',
        // Invalid state
        'aria-invalid:border-[var(--red)] aria-invalid:ring-[var(--red)]/20',
        // Selection and resize
        'selection:bg-[var(--aqua-primary)] selection:text-white resize-y',
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
