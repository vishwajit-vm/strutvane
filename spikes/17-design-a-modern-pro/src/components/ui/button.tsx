/**
 * `<Button>`: the one button of the design, in six variants and five sizes.
 *
 * - `primary`: the single main action of a view (solid accent with a soft accent glow);
 * - `soft`: a secondary action that should still read as "brand" (tinted accent);
 * - `outline`: neutral secondary actions (Export, Cancel, Filters);
 * - `ghost`: toolbar and icon buttons;
 * - `danger`: destructive confirmations only;
 * - `link`: inline text actions.
 *
 * `asChild` renders the styles on the child instead (e.g. a router `<Link>`), via Radix Slot.
 *
 * @example
 * <Button variant="primary"><IconPlus /> New invoice</Button>
 * <Button asChild variant="outline"><Link to="/invoices">Back</Link></Button>
 */
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ComponentProps, ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

export const buttonVariants = cva(
  [
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold',
    'transition-[background-color,box-shadow,color,filter,transform] duration-150 active:translate-y-px',
    'disabled:pointer-events-none disabled:opacity-55 aria-disabled:pointer-events-none aria-disabled:opacity-55',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5",
  ],
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-primary hover:brightness-110',
        soft: 'bg-primary-soft text-primary-soft-foreground hover:brightness-[0.97] dark:hover:brightness-125',
        outline: 'border border-border bg-card text-foreground shadow-xs hover:bg-subtle',
        ghost: 'text-foreground hover:bg-subtle',
        danger: 'bg-danger-solid text-danger-solid-foreground shadow-xs hover:brightness-110',
        link: 'h-auto px-0 text-primary-soft-foreground underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-3 text-label',
        md: 'h-9.5 px-4 text-sm',
        lg: 'h-11 px-5 text-sm',
        icon: 'size-9.5',
        'icon-sm': 'size-8 rounded-md',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'outline', size: 'md' },
  },
)

/** Props of {@link Button}. */
export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  /** Render the styles on the only child instead of a `<button>`. */
  readonly asChild?: boolean
}

export function Button({ className, variant, size, asChild = false, type, ...props }: ButtonProps): ReactElement {
  const Component = asChild ? Slot.Root : 'button'
  return (
    <Component
      data-slot="button"
      // A plain <button> inside a form defaults to "submit"; make that opt-in, never accidental.
      {...(asChild ? {} : { type: type ?? 'button' })}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
