/**
 * `<Field>`: label + control + hint + inline error, with the accessibility wiring done once.
 *
 * Why a render-less helper (`fieldAria`) instead of cloning children: the control stays a plain,
 * visible element in the JSX, and its `aria-describedby` / `aria-invalid` are explicit.
 *
 * @example
 * <Field id="email" label="Email" required error={errors.email} hint="We never share it.">
 *   <Input id="email" {...fieldAria('email', errors.email, true)} />
 * </Field>
 */
import { IconAlertCircle } from '@tabler/icons-react'
import { Label as LabelPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export function Label({ className, ...props }: ComponentProps<typeof LabelPrimitive.Root>): ReactElement {
  return <LabelPrimitive.Root className={cn('text-label font-semibold text-foreground', className)} {...props} />
}

/** Props of {@link Field}. */
export interface FieldProps {
  readonly id: string
  readonly label: ReactNode
  readonly required?: boolean
  readonly hint?: ReactNode
  readonly error?: string | undefined
  /** Something on the right of the label row (e.g. "Forgot password?"). */
  readonly aside?: ReactNode
  readonly className?: string
  readonly children: ReactNode
}

export function Field({ id, label, required = false, hint, error, aside, className, children }: FieldProps): ReactElement {
  return (
    <div data-slot="field" className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={id}>
          {label}
          {required ? (
            <span aria-hidden className="ml-0.5 text-danger">
              *
            </span>
          ) : null}
        </Label>
        {aside}
      </div>
      {children}
      {error === undefined ? (
        hint === undefined ? null : (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )
      ) : (
        <p id={`${id}-error`} className="flex items-center gap-1 text-xs font-medium text-danger">
          <IconAlertCircle aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * The ARIA attributes a control inside {@link Field} needs.
 *
 * @example
 * <Input id="name" {...fieldAria('name', errors.name, true)} />
 */
export function fieldAria(id: string, error: string | undefined, hasHint = false): { 'aria-invalid'?: true; 'aria-describedby'?: string; 'aria-errormessage'?: string } {
  if (error !== undefined) return { 'aria-invalid': true, 'aria-describedby': `${id}-error`, 'aria-errormessage': `${id}-error` }
  return hasHint ? { 'aria-describedby': `${id}-hint` } : {}
}
