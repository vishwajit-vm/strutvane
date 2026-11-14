/**
 * Field: label + control + hint + inline error, wired for assistive technology.
 *
 * Why a render prop: the control needs the generated `id`, `aria-describedby` and `aria-invalid`.
 * Passing them explicitly keeps the wiring visible and type-checked (no cloneElement magic).
 *
 * @example
 *   <Field label="Customer e-mail" hint="Invoices are sent here." error={errors.email}>
 *     {(control) => <Input {...control} type="email" />}
 *   </Field>
 */
import { IconAlertCircle } from '@tabler/icons-react'
import { useId, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export interface ControlProps {
  readonly id: string
  readonly 'aria-describedby'?: string
  readonly 'aria-invalid'?: true
  readonly 'aria-required'?: true
}

export interface FieldProps {
  readonly label: ReactNode
  readonly hint?: ReactNode
  readonly error?: string | undefined
  readonly required?: boolean
  /** Extra text right of the label, e.g. a character count or "Optional". */
  readonly aside?: ReactNode
  readonly className?: string
  readonly children: (control: ControlProps) => ReactNode
}

export function Field({ label, hint, error, required = false, aside, className, children }: FieldProps) {
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = `${id}-error`
  const describedBy = [hint !== undefined ? hintId : null, error !== undefined ? errorId : null].filter(Boolean).join(' ')
  const control: ControlProps = {
    id,
    ...(describedBy !== '' ? { 'aria-describedby': describedBy } : {}),
    ...(error !== undefined ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  }
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={id} className="text-sm font-semibold text-fg">
          {label}
          {required && (
            <span className="ml-0.5 text-danger" aria-hidden>
              *
            </span>
          )}
        </label>
        {aside !== undefined && <span className="text-xs text-fg-muted">{aside}</span>}
      </div>
      {children(control)}
      {hint !== undefined && error === undefined && (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="flex items-center gap-1 text-xs font-medium text-danger">
          <IconAlertCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  )
}

/** A labelled group of fields (fieldset + legend), e.g. "Billing address". */
export function FieldGroup({ legend, description, children, className }: { legend: string; description?: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      <legend className="text-sm font-semibold text-fg">{legend}</legend>
      {description !== undefined && <p className="mt-0.5 text-xs text-fg-muted">{description}</p>}
      <div className="mt-3">{children}</div>
    </fieldset>
  )
}
