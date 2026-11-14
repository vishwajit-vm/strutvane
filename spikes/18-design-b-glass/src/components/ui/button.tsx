/**
 * Button: the one clickable control, in six variants and five sizes.
 *
 * Why variants instead of ad-hoc classes: every screen gets the same heights (32/40/44 px), radius
 * and focus behaviour, and only ONE `primary` button per view carries the brand gradient so the
 * main action is always obvious.
 *
 * @example
 *   <Button>Save invoice</Button>
 *   <Button variant="secondary" size="sm"><IconDownload aria-hidden /> Export</Button>
 *   <Button asChild variant="ghost"><Link to="/invoices">Cancel</Link></Button>
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'

export const buttonVariants = cva(
  [
    'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap font-semibold',
    'transition-base disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-[1.1em] [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand-gradient text-primary-fg shadow-primary hover:-translate-y-px hover:brightness-110 active:translate-y-0',
        secondary: 'border border-glass-border bg-glass-card text-fg shadow-glass hover:-translate-y-px hover:bg-surface',
        outline: 'border border-input bg-surface-input text-fg hover:bg-surface-muted',
        ghost: 'text-fg hover:bg-glass-hover',
        soft: 'bg-primary-soft text-primary-soft-fg hover:brightness-105',
        danger: 'bg-danger-solid text-danger-fg hover:brightness-110',
      },
      size: {
        sm: 'h-8 rounded-sm px-3 text-sm',
        md: 'h-10 rounded-md px-4 text-base',
        lg: 'h-11 rounded-md px-5 text-md',
        icon: 'size-10 rounded-md text-md',
        'icon-sm': 'size-8 rounded-sm text-base',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the child element (e.g. a router `<Link>`) with button styles instead of a `<button>`. */
  readonly asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      // A plain <button> defaults to type="submit"; make that opt-in to avoid surprise submits.
      {...(asChild ? {} : { type: type ?? 'button' })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
