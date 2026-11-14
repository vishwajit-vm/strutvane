/**
 * Text inputs: `<Input>`, `<Textarea>` and `<InputGroup>` (an input with a leading icon or a
 * leading/trailing text addon such as a currency symbol).
 *
 * One look for every control: 38px tall, 8px radius, a 3:1-contrast border, a soft accent focus
 * ring, and a danger border + ring when `aria-invalid` is set (so validation styling follows the
 * accessibility attribute instead of a separate prop that could drift).
 *
 * @example
 * <InputGroup start={<IconSearch />}><Input placeholder="Search" /></InputGroup>
 * <InputGroup start="$"><Input inputMode="decimal" /></InputGroup>
 */
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/** Shared control styles (also used by the select trigger and the relation picker). */
export const controlClasses = cn(
  'w-full min-w-0 rounded-md border border-input bg-card text-sm text-foreground shadow-xs outline-none',
  'transition-[border-color,box-shadow] duration-150 placeholder:text-muted-foreground',
  'hover:border-muted-foreground focus-visible:border-primary focus-visible:ring-3 focus-visible:ring-ring/25',
  'aria-invalid:border-danger aria-invalid:ring-danger/20 aria-invalid:focus-visible:ring-3',
  'disabled:cursor-not-allowed disabled:opacity-60',
)

export function Input({ className, type = 'text', ...props }: ComponentProps<'input'>): ReactElement {
  return <input data-slot="input" type={type} className={cn(controlClasses, 'h-9.5 px-3', className)} {...props} />
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>): ReactElement {
  return <textarea data-slot="textarea" className={cn(controlClasses, 'min-h-24 resize-y px-3 py-2 leading-6', className)} {...props} />
}

/** Props of {@link InputGroup}. */
export interface InputGroupProps {
  /** Icon or short text shown inside the control, before the value. */
  readonly start?: ReactNode
  /** Icon, text or small button shown inside the control, after the value. */
  readonly end?: ReactNode
  readonly className?: string
  /** Exactly one `<Input>`. */
  readonly children: ReactElement
}

export function InputGroup({ start, end, className, children }: InputGroupProps): ReactElement {
  return (
    <div
      className={cn(
        'relative flex min-w-0 items-center',
        start !== undefined && '[&>input]:pl-9.5',
        end !== undefined && '[&>input]:pr-10',
        className,
      )}
    >
      {start === undefined ? null : (
        <span aria-hidden className="pointer-events-none absolute left-3 flex items-center text-sm text-muted-foreground [&_svg]:size-4.5">
          {start}
        </span>
      )}
      {children}
      {end === undefined ? null : <span className="absolute right-2 flex items-center text-sm text-muted-foreground [&_svg]:size-4.5">{end}</span>}
    </div>
  )
}
