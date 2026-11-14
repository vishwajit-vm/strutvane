/**
 * Text-like inputs: `Input`, `Textarea` and `InputGroup` (an input with a leading or trailing
 * adornment such as a currency symbol or a search icon).
 *
 * All share one look: `--control-md` tall (32 px), 6 px radius, `--input` hairline, surface fill, and the accent
 * ring on focus. `aria-invalid="true"` turns the border to the danger colour, so error styling
 * comes from the same attribute screen readers use, never from a separate class.
 *
 * @example
 * <Input id="email" type="email" autoComplete="email" />
 * <InputGroup leading={<Search aria-hidden />}><Input aria-label="Search" /></InputGroup>
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/** Shared control surface, also used by the select trigger and the combobox trigger. */
export const controlClasses = cn(
  'w-full min-w-0 rounded-md border border-input bg-surface text-sm text-fg shadow-xs',
  'transition-[border-color,box-shadow] duration-150 ease-out',
  'hover:border-border-strong focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20',
  'aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20',
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-fg-subtle',
)

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlClasses, 'h-control-md px-2.5', className)} {...props} />
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(controlClasses, 'block resize-y px-2.5 py-1.5 leading-5', className)} {...props} />
}

interface InputGroupProps {
  /** Shown inside the left edge, e.g. a search icon or `€`. Decorative: give it `aria-hidden`. */
  leading?: ReactNode
  /** Shown inside the right edge, e.g. a keyboard hint or a clear button. */
  trailing?: ReactNode
  className?: string
  children: ReactNode
}

/**
 * Positions adornments over an `Input` and pads the input so text never runs under them.
 * The padding is applied with child selectors so the wrapped `Input` stays a plain input.
 */
export function InputGroup({ leading, trailing, className, children }: InputGroupProps) {
  return (
    <div
      className={cn(
        'relative flex items-center',
        leading !== undefined && '[&>input]:pl-8',
        trailing !== undefined && '[&>input]:pr-9',
        className,
      )}
    >
      {leading !== undefined && (
        <span className="pointer-events-none absolute left-2.5 flex items-center text-sm text-fg-subtle [&_svg]:size-4">{leading}</span>
      )}
      {children}
      {trailing !== undefined && <span className="absolute right-1.5 flex items-center gap-1">{trailing}</span>}
    </div>
  )
}
