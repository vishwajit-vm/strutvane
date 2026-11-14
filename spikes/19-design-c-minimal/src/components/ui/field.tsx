/**
 * Field: label + control + help text + inline error, wired for assistive technology.
 *
 * Why a render prop: the control needs the generated `id`, `aria-describedby` and
 * `aria-invalid`, and passing them explicitly keeps every control type (input, select,
 * combobox, switch) free of hidden context magic.
 *
 * @example
 * <Field label="Email" error={errors.email}>
 *   {(control) => <Input {...control} type="email" />}
 * </Field>
 */
import { CircleAlert } from 'lucide-react'
import { type ReactNode, useId } from 'react'
import { cn } from '../../lib/cn.ts'

/** Props a control must spread to be connected to its label, help text and error. */
export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: true
}

interface FieldProps {
  label: ReactNode
  /** Help text under the control. Kept short: one sentence. */
  description?: ReactNode
  /** The error message; when set, the control is marked invalid and the message is announced. */
  error?: string | undefined
  /** Adds a quiet "Optional" hint; required is the default, so it is not marked. */
  optional?: boolean
  /** Content aligned to the right of the label, e.g. a "Forgot password?" link. */
  labelAside?: ReactNode
  className?: string
  children: (control: FieldControlProps) => ReactNode
}

export function Field({ label, description, error, optional = false, labelAside, className, children }: FieldProps) {
  const id = useId()
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  // The error replaces the help text on screen, so only one of them is referenced at a time.
  const describedBy = error !== undefined ? errorId : description !== undefined ? descriptionId : ''
  const control: FieldControlProps = {
    id,
    ...(describedBy !== '' ? { 'aria-describedby': describedBy } : {}),
    ...(error !== undefined ? { 'aria-invalid': true as const } : {}),
  }
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <div className="flex min-h-5 items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {optional && <span className="ml-1.5 font-normal text-fg-subtle">Optional</span>}
        </label>
        {labelAside}
      </div>
      {children(control)}
      {description !== undefined && error === undefined && (
        <p id={descriptionId} className="text-xs text-fg-subtle">
          {description}
        </p>
      )}
      {error !== undefined && <FieldError id={errorId}>{error}</FieldError>}
    </div>
  )
}

/** The inline error line: an icon plus text, in the danger text colour (never colour alone). */
export function FieldError({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-center gap-1.5 text-xs font-medium text-danger-text">
      <CircleAlert aria-hidden className="size-3.5 shrink-0" />
      {children}
    </p>
  )
}
