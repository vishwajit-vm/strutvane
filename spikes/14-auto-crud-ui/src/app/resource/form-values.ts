/**
 * Form values: from an API row into inputs, client-side checks, and back into an API body.
 *
 * Inputs hold text exactly as typed (numbers and decimals stay strings until submit, so "12." is
 * not swallowed while typing, the spike 08 defect). Conversion happens once, in {@link buildBody}.
 *
 * The client checks mirror spike 10's server rules (required, length, number shapes, decimal
 * scale, JSON) for instant feedback; the server stays the authority and its 422 issues are shown
 * on the same fields.
 *
 * @module
 */
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ApiRow } from '../api/client.ts'

/**
 * One input's value: text for most widgets, a boolean for switches, an id (or null) for relations.
 *
 * @example
 * const value: FormValue = '12.50'
 */
export type FormValue = string | boolean | number | null

/**
 * All input values of a form, by field name.
 *
 * @example
 * const values: FormValues = { title: 'Hello', featured: false, author_id: 1 }
 */
export type FormValues = Readonly<Record<string, FormValue>>

/**
 * Field name → error message.
 *
 * @example
 * const errors: FormErrors = { title: 'Title is required.' }
 */
export type FormErrors = Readonly<Record<string, string>>

const INTEGER_TEXT = /^-?\d+$/
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?$/
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/

/**
 * Starting values: the row's (edit), else the column default, else empty.
 *
 * @example
 * initialValues(postFields, undefined).status // 'draft' (the column default)
 */
export function initialValues(fields: readonly FieldMetadata[], row: ApiRow | undefined): FormValues {
  const values: Record<string, FormValue> = {}
  for (const field of fields) {
    const source = row === undefined ? field.default : row[field.name]
    values[field.name] = toFormValue(field, source)
  }
  return values
}

function toFormValue(field: FieldMetadata, value: unknown): FormValue {
  if (field.input === 'switch') return value === true
  if (field.input === 'relation') return typeof value === 'number' ? value : null
  if (value === null || value === undefined) return ''
  if (field.input === 'json') return JSON.stringify(value, null, 2)
  if (field.input === 'datetime') return toLocalDateTimeInput(String(value))
  // A DB default of 0 on a decimal column shows as "0.00", like the API returns it.
  if (field.cast === 'decimal' && typeof value === 'number') return value.toFixed(field.scale ?? 2)
  return String(value)
}

/**
 * Check the values before sending. Returns an empty object when everything looks right.
 *
 * @example
 * validateValues(postFields, { title: '' }, 'create') // { title: 'Title is required.', author_id: 'Author is required.' }
 */
export function validateValues(fields: readonly FieldMetadata[], values: FormValues, mode: 'create' | 'edit'): FormErrors {
  const errors: Record<string, string> = {}
  for (const field of fields) {
    const message = checkField(field, values[field.name] ?? null, mode)
    if (message !== undefined) errors[field.name] = message
  }
  return errors
}

function checkField(field: FieldMetadata, value: FormValue, mode: 'create' | 'edit'): string | undefined {
  const empty = value === '' || value === null
  // Required on create; on edit, a required field may not be emptied (it already has a value).
  if (empty) return field.required || (mode === 'edit' && !field.nullable && field.input !== 'switch' && field.kind !== 'slug') ? `${field.label} is required.` : undefined
  if (typeof value !== 'string') return undefined
  if (field.maxLength !== undefined && [...value].length > field.maxLength) return `${field.label} can be at most ${field.maxLength} characters.`
  if (field.cast === 'integer' && !INTEGER_TEXT.test(value.trim())) return `${field.label} must be a whole number.`
  if (field.cast === 'number' && !Number.isFinite(Number(value))) return `${field.label} must be a number.`
  if (field.cast === 'decimal') return checkDecimal(field, value.trim())
  if (field.cast === 'date' && !DATE_TEXT.test(value)) return `${field.label} must be a date written as YYYY-MM-DD.`
  if (field.cast === 'json' && !isJson(value)) return `${field.label} must be valid JSON, for example {"key": "value"}.`
  return undefined
}

function checkDecimal(field: FieldMetadata, text: string): string | undefined {
  if (!DECIMAL_TEXT.test(text)) return `${field.label} must be a decimal number such as "12.50".`
  const scale = field.scale ?? 2
  const fraction = text.split('.')[1] ?? ''
  return fraction.length > scale ? `${field.label} can have at most ${scale} digits after the decimal point.` : undefined
}

function isJson(text: string): boolean {
  try {
    JSON.parse(text)
    return true
  } catch {
    return false
  }
}

/**
 * Turn form values into the JSON body the API expects.
 *
 * - create: empty optional fields are left out, so the database default applies (and the server
 *   generates the slug);
 * - edit: only fields that changed are sent, so two people editing different fields of the same
 *   record do not overwrite each other; an emptied nullable field is sent as `null`.
 *
 * @example
 * buildBody(postFields, { title: 'Hi', price: '' }, 'create', initial) // { title: 'Hi' }
 */
export function buildBody(fields: readonly FieldMetadata[], values: FormValues, mode: 'create' | 'edit', initial: FormValues): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  for (const field of fields) {
    const value = values[field.name] ?? null
    if (mode === 'edit' && value === initial[field.name]) continue
    const empty = value === '' || value === null
    if (empty && mode === 'create') continue
    body[field.name] = empty ? null : toApiValue(field, value)
  }
  return body
}

function toApiValue(field: FieldMetadata, value: FormValue): unknown {
  if (typeof value !== 'string') return value
  const text = value.trim()
  switch (field.cast) {
    case 'integer':
    case 'number':
      return Number(text)
    case 'json':
      return JSON.parse(text) as unknown
    case 'datetime':
      return fromLocalDateTimeInput(text)
    default:
      // Decimals stay strings ("12.50"): exact, and what the API returns.
      return field.cast === 'decimal' ? text : value
  }
}

/**
 * ISO instant → the value a `datetime-local` input shows, in the user's time zone.
 *
 * @example
 * toLocalDateTimeInput('2026-11-01T09:00:00.000Z') // '2026-11-01T14:30' in Asia/Kolkata
 */
export function toLocalDateTimeInput(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const pad = (number: number): string => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/**
 * A `datetime-local` value (local time) → ISO instant in UTC, what the API stores.
 *
 * @example
 * fromLocalDateTimeInput('2026-11-01T14:30') // '2026-11-01T09:00:00.000Z' in Asia/Kolkata
 */
export function fromLocalDateTimeInput(text: string): string {
  const date = new Date(text)
  return Number.isNaN(date.getTime()) ? text : date.toISOString()
}
