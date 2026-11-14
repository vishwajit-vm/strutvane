/**
 * Button: the single clickable control of Crisp.
 *
 * Variants, from loudest to quietest:
 * - `primary`: the one main action per view (accent fill). Never two on screen.
 * - `secondary`: everything else that is a real action (surface + hairline border).
 * - `ghost`: toolbar and icon actions that should disappear until hovered.
 * - `danger`: destructive confirmation only (inside a confirm dialog, never as a page action).
 *
 * Heights come from the density tokens `--control-sm/md/lg` (28 / 32 / 36 px in Crisp). Icon-only
 * buttons must pass an `aria-label` (TypeScript cannot check this; the axe test does).
 *
 * @example
 * <Button variant="primary"><Plus aria-hidden /> New invoice</Button>
 * <Button asChild variant="secondary"><Link to="/invoices">Cancel</Link></Button>
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer select-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium',
    'transition-[background-color,border-color,color,box-shadow] duration-150 ease-out',
    'disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg shadow-xs shadow-highlight hover:bg-accent-hover',
        secondary: 'border border-border-strong bg-surface text-fg shadow-xs hover:bg-subtle',
        ghost: 'text-fg-muted hover:bg-subtle hover:text-fg data-[state=open]:bg-subtle data-[state=open]:text-fg',
        danger: 'bg-danger text-danger-fg shadow-xs shadow-highlight hover:bg-danger-hover',
        link: 'h-auto px-0 text-accent-text underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-control-sm px-2.5 text-sm',
        md: 'h-control-md px-3 text-sm',
        lg: 'h-control-lg px-4 text-base',
        icon: 'size-control-md',
        'icon-sm': 'size-control-sm [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element (e.g. a `Link`) with button styling instead of a `<button>`. */
    asChild?: boolean
  }

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps) {
  const classes = cn(buttonVariants({ variant, size }), className)
  if (asChild) return <Slot.Root className={classes} {...props} />
  // `type="button"` by default: a button inside a form must never submit it by accident.
  return <button type={type ?? 'button'} className={classes} {...props} />
}
