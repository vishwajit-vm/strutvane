/**
 * `<FormField>`: label + widget + help + error, wired for accessibility once (the ADR-0014 rule):
 * `<label htmlFor>`, `aria-invalid`, and `aria-describedby` pointing at the help and the error.
 * Every field goes through it, so no widget can forget the wiring.
 *
 * @module
 */
import type { ReactElement, ReactNode } from 'react'
import type { FieldMetadata } from '../../shared/metadata.ts'

/**
 * Props of {@link FormField}.
 *
 * @example
 * const props: FormFieldProps = { id: 'f-title', field: titleField, error: undefined, help: undefined, children: () => null }
 */
export interface FormFieldProps {
  readonly id: string
  readonly field: FieldMetadata
  readonly error: string | undefined
  /** Extra text under the input, for example the slug preview. */
  readonly help: ReactNode
  /** Render the widget with the ids it must reference. */
  readonly children: (wiring: { readonly invalid: boolean; readonly describedBy: string | undefined }) => ReactNode
  /** Span both columns of the form grid (textareas, JSON). */
  readonly wide?: boolean
  /** Characters used and allowed, for inputs with a length limit ("12/200"). */
  readonly counter?: { readonly length: number; readonly max: number } | undefined
}

/**
 * One labelled form field.
 *
 * @example
 * <FormField id="f-title" field={titleField} error={errors.title} help={undefined}>
 *   {({ invalid, describedBy }) => <Input id="f-title" aria-invalid={invalid} aria-describedby={describedBy} />}
 * </FormField>
 */
export function FormField({ id, field, error, help, children, wide = false, counter }: FormFieldProps): ReactElement {
  const helpId = help === undefined ? undefined : `${id}-help`
  const errorId = error === undefined ? undefined : `${id}-error`
  const counterId = counter === undefined ? undefined : `${id}-counter`
  const describedBy = [helpId, errorId, counterId].filter((part) => part !== undefined).join(' ') || undefined
  const overLimit = counter !== undefined && counter.length > counter.max
  return (
    <div className={wide ? 'space-y-1.5 md:col-span-2' : 'space-y-1.5'} data-field={field.name}>
      <label htmlFor={id} className="block text-sm font-medium">
        {field.label}
        {field.required && (
          <>
            <span aria-hidden="true" className="text-destructive">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {children({ invalid: error !== undefined, describedBy })}
      {help !== undefined && (
        <p id={helpId} className="text-xs text-muted-foreground">
          {help}
        </p>
      )}
      {error !== undefined && (
        <p id={errorId} className="text-sm text-destructive">
          {error}
        </p>
      )}
      {counter !== undefined && (
        // Read with the field ("12 of 200 characters"); not a live region, so typing stays quiet.
        <p id={counterId} className={overLimit ? 'text-right text-xs font-semibold text-destructive' : 'text-right text-xs text-muted-foreground'}>
          <span aria-hidden="true">
            {counter.length}/{counter.max}
          </span>
          <span className="sr-only">
            {counter.length} of {counter.max} characters
          </span>
        </p>
      )}
    </div>
  )
}
