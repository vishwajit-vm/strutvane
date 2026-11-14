/**
 * Text inputs: Input, Textarea and InputGroup (an input with a leading/trailing adornment such as
 * a search icon or a currency code).
 *
 * Inputs sit on the near-opaque `surface-input` with a 3:1 border (WCAG 1.4.11), and get a soft
 * brand glow on focus. `aria-invalid` switches the border and glow to the danger tone.
 *
 * @example
 *   <Input id="email" type="email" autoComplete="email" />
 *   <InputGroup start={<IconSearch aria-hidden />}><Input aria-label="Search invoices" /></InputGroup>
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/** Shared look for every text-like control (also used by Select's trigger). */
export const controlClass = cn(
  'w-full min-w-0 rounded-md border border-input bg-surface-input text-base text-fg shadow-[var(--shadow-inner)]',
  'placeholder:text-fg-muted transition-base',
  'hover:border-fg-muted',
  'focus-visible:border-ring focus-visible:shadow-[0_0_0_4px_var(--primary-soft)] focus-visible:outline-none',
  'aria-invalid:border-danger aria-invalid:focus-visible:shadow-[0_0_0_4px_var(--danger-soft)]',
  'disabled:cursor-not-allowed disabled:opacity-60',
)

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>) {
  return <input type={type} className={cn(controlClass, 'h-10 px-3', className)} {...props} />
}

export function Textarea({ className, rows = 4, ...props }: ComponentProps<'textarea'>) {
  return <textarea rows={rows} className={cn(controlClass, 'min-h-24 resize-y px-3 py-2.5 leading-relaxed', className)} {...props} />
}

export interface InputGroupProps {
  readonly start?: ReactNode
  readonly end?: ReactNode
  readonly children: ReactNode
  readonly className?: string
}

/**
 * Wrap one `<Input>` with adornments. The adornments are decorative or plain text; the input keeps
 * its own label, so screen readers never hear the icon.
 */
export function InputGroup({ start, end, children, className }: InputGroupProps) {
  return (
    <div className={cn('relative flex items-center', className)}>
      {start !== undefined && (
        <span className="pointer-events-none absolute left-3 flex items-center text-fg-muted [&_svg]:size-4">{start}</span>
      )}
      <div className={cn('w-full [&_input]:w-full', start !== undefined && '[&_input]:pl-9', end !== undefined && '[&_input]:pr-14')}>{children}</div>
      {end !== undefined && <span className="absolute right-3 flex items-center text-sm text-fg-muted">{end}</span>}
    </div>
  )
}
