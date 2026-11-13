/**
 * Default form widgets, one per field type. Each renders ONLY the control (label, help and error
 * text are rendered once by FieldShell in ResourceForm), receives the same WidgetProps, and wires
 * the accessibility attributes it is given (`aria-invalid`, `aria-describedby`). Native elements
 * are used on purpose: they are accessible by default and keep the spike free of a component
 * library. The real package swaps these for its registry components (Base UI / Radix).
 */
import { type ChangeEvent, useEffect, useState } from 'react'
import type { Widget, WidgetProps } from './registry.tsx'
import { useRelationOptions } from './relations.ts'

/** Attributes every control shares. */
function common(p: WidgetProps) {
  return {
    id: p.id,
    name: p.name,
    onBlur: p.onBlur,
    'aria-invalid': p.invalid || undefined,
    'aria-describedby': p.describedBy,
    'aria-required': p.field.required || undefined,
  } as const
}

const asString = (v: unknown): string => (v === null || v === undefined ? '' : String(v))

export const TextWidget: Widget = (p) => (
  <input
    {...common(p)}
    type={p.field.type === 'email' ? 'email' : 'text'}
    value={asString(p.value)}
    readOnly={p.readOnly}
    onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value)}
  />
)

export const TextareaWidget: Widget = (p) => (
  <textarea
    {...common(p)}
    value={asString(p.value)}
    readOnly={p.readOnly}
    rows={3}
    onChange={(e: ChangeEvent<HTMLTextAreaElement>) => p.onChange(e.target.value)}
  />
)

/** A complete number as typed by a person (no trailing `.`, no lone `-`). */
const COMPLETE_NUMBER = /^-?(\d+(\.\d+)?|\.\d+)$/

/**
 * Numbers. The input shows the user's DRAFT text, not the parsed value: converting on every
 * keystroke would turn "1250." into 1250 and swallow the decimal point (a bug this spike's tests
 * caught). The form value is a number once the text is a complete number, `null` when empty, and
 * otherwise the raw text, so validation can say "must be a number" instead of dropping input.
 */
export const NumberWidget: Widget = (p) => {
  const [draft, setDraft] = useState(() => asString(p.value))
  // Follow external changes (form reset, record loaded) without fighting the user's typing.
  useEffect(() => {
    const parsed = COMPLETE_NUMBER.test(draft.trim()) ? Number(draft) : draft.trim() === '' ? null : draft
    if (parsed !== p.value) setDraft(asString(p.value))
    // Deliberately keyed on the external value only (re-syncing on draft would undo typing).
  }, [p.value])
  return (
    <input
      {...common(p)}
      type="text"
      inputMode={p.field.type === 'integer' ? 'numeric' : 'decimal'}
      value={draft}
      readOnly={p.readOnly}
      onChange={(e: ChangeEvent<HTMLInputElement>) => {
        const raw = e.target.value
        setDraft(raw)
        const trimmed = raw.trim()
        p.onChange(trimmed === '' ? null : COMPLETE_NUMBER.test(trimmed) ? Number(trimmed) : raw)
      }}
    />
  )
}

export const SelectWidget: Widget = (p) => (
  <select
    {...common(p)}
    value={asString(p.value)}
    disabled={p.readOnly}
    onChange={(e: ChangeEvent<HTMLSelectElement>) => p.onChange(e.target.value === '' ? null : e.target.value)}
  >
    <option value="">Select…</option>
    {(p.field.enumValues ?? []).map((v) => (
      <option key={v} value={v}>
        {v}
      </option>
    ))}
  </select>
)

export const CheckboxWidget: Widget = (p) => (
  <input
    {...common(p)}
    type="checkbox"
    checked={p.value === true}
    disabled={p.readOnly}
    onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.checked)}
  />
)

export const DateWidget: Widget = (p) => (
  <input
    {...common(p)}
    type="date"
    value={asString(p.value)}
    readOnly={p.readOnly}
    onChange={(e: ChangeEvent<HTMLInputElement>) => p.onChange(e.target.value === '' ? null : e.target.value)}
  />
)

export const RelationPickerWidget: Widget = (p) => {
  const { options, isLoading } = useRelationOptions(p.field.relation?.target)
  return (
    <select
      {...common(p)}
      value={asString(p.value)}
      disabled={p.readOnly}
      aria-busy={isLoading || undefined}
      onChange={(e: ChangeEvent<HTMLSelectElement>) => p.onChange(e.target.value === '' ? null : e.target.value)}
    >
      <option value="">{isLoading ? 'Loading…' : 'Select…'}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}

/** Default widget map, keyed by field type or widget name. `default` is the required fallback. */
export const defaultWidgets: Readonly<Record<string, Widget>> = Object.freeze({
  default: TextWidget,
  string: TextWidget,
  email: TextWidget,
  text: TextareaWidget,
  integer: NumberWidget,
  decimal: NumberWidget,
  money: NumberWidget,
  enum: SelectWidget,
  boolean: CheckboxWidget,
  date: DateWidget,
  belongsTo: RelationPickerWidget,
  'relation-picker': RelationPickerWidget,
  textarea: TextareaWidget,
})
