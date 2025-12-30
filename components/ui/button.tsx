import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--aqua-primary)]/30",
  {
    variants: {
      variant: {
        default: 'bg-[var(--aqua-primary)] text-white hover:bg-[var(--aqua-secondary)] shadow-md shadow-[var(--aqua-primary)]/20',
        destructive:
          'bg-[var(--red)] text-white hover:bg-[var(--red-light)] shadow-md shadow-[var(--red)]/20',
        outline:
          'border border-[rgba(255,255,255,0.15)] bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] hover:border-[rgba(255,255,255,0.25)]',
        secondary:
          'bg-[var(--bg-secondary)] text-[var(--text-primary)] border border-[rgba(255,255,255,0.1)] hover:bg-[var(--bg-elevated)] hover:border-[rgba(255,255,255,0.15)]',
        ghost:
          'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]',
        link: 'text-[var(--aqua-primary)] underline-offset-4 hover:underline',
        success: 'bg-[var(--green)] text-white hover:bg-[var(--green-light)] shadow-md shadow-[var(--green)]/20',
      },
      size: {
        default: 'h-10 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-11 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-10',
        'icon-sm': 'size-8',
        'icon-lg': 'size-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
