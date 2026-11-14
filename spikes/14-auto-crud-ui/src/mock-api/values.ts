/**
 * Value rules of the mock API: the same checks and messages as spike 10's `src/crud/values.ts`,
 * over plain JavaScript values instead of SQL.
 *
 * Why mirror instead of import: spikes are standalone. `test/contract/spike10-contract.test.ts`
 * replays one request script against both APIs and requires identical responses, so a drift in
 * these rules fails a test instead of hiding.
 *
 * @module
 */
import type { FieldMetadata } from '../shared/metadata.ts'

/**
 * A stored value. Rows hold exactly what the API returns: decimals as fixed-scale strings, dates
 * as `YYYY-MM-DD`, datetimes as ISO strings, JSON as parsed values.
 *
 * @example
 * const price: StoredValue = '12.50'
 */
export type StoredValue = string | number | boolean | null | object

/**
 * Either a converted value, or a friendly reason it was rejected (spike 10's shape).
 *
 * @example
 * const refused: Coerced = { ok: false, code: 'too_long', message: 'Title can be at most 200 characters.' }
 */
export type Coerced = { readonly ok: true; readonly value: StoredValue } | { readonly ok: false; readonly code: string; readonly message: string }

const ok = (value: StoredValue): Coerced => ({ ok: true, value })
const fail = (code: string, message: string): Coerced => ({ ok: false, code, message })

const INTEGER_TEXT = /^-?\d+$/
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?$/
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_TEXT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Convert a query-string value for filters and exact search.
 *
 * @example
 * coerceQueryValue(priceField, '9.99') // { ok: true, value: '9.99' }
 */
export function coerceQueryValue(field: FieldMetadata, raw: string): Coerced {
  switch (field.cast) {
    case 'integer':
      return INTEGER_TEXT.test(raw) ? integerValue(field, Number(raw)) : fail('invalid_integer', `${field.label} must be a whole number.`)
    case 'number':
      return Number.isFinite(Number(raw)) && raw.trim() !== '' ? ok(Number(raw)) : fail('invalid_number', `${field.label} must be a number.`)
    case 'boolean':
      if (raw === 'true' || raw === '1') return ok(true)
      if (raw === 'false' || raw === '0') return ok(false)
      return fail('invalid_boolean', `${field.label} must be true or false.`)
    default:
      return coerceText(field, raw)
  }
}

/**
 * Convert a JSON body value. `null` is allowed only for nullable fields.
 *
 * @example
 * coerceBodyValue(titleField, 42) // { ok: false, code: 'invalid_type', message: 'Title must be text.' }
 */
export function coerceBodyValue(field: FieldMetadata, value: unknown): Coerced {
  if (value === null) return field.nullable ? ok(null) : fail('not_nullable', `${field.label} can't be empty.`)
  switch (field.cast) {
    case 'integer':
      return typeof value === 'number' ? integerValue(field, value) : fail('invalid_type', `${field.label} must be a whole number.`)
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? ok(value) : fail('invalid_type', `${field.label} must be a number.`)
    case 'boolean':
      return typeof value === 'boolean' ? ok(value) : fail('invalid_type', `${field.label} must be true or false.`)
    case 'decimal':
      if (typeof value === 'number' && Number.isFinite(value)) return coerceText(field, String(value))
      return typeof value === 'string' ? coerceText(field, value) : fail('invalid_type', `${field.label} must be a decimal number such as "12.50".`)
    case 'json':
      return typeof value === 'object' || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? ok(cloneJson(value)) : fail('invalid_type', `${field.label} must be JSON.`)
    default:
      return typeof value === 'string' ? coerceText(field, value) : fail('invalid_type', `${field.label} must be text.`)
  }
}

/**
 * Put a stored value in the exact form the API returns (decimals re-fixed to their scale, the way
 * spike 10 does after SQLite turns `12.50` into `12.5`).
 *
 * @example
 * serializeValue(priceField, '12.5') // '12.50'
 */
export function serializeValue(field: FieldMetadata, value: StoredValue | undefined): StoredValue {
  if (value === null || value === undefined) return null
  if (field.cast === 'decimal') return Number(value).toFixed(field.scale ?? 2)
  return value
}

function coerceText(field: FieldMetadata, text: string): Coerced {
  switch (field.cast) {
    case 'decimal':
      return decimalValue(field, text)
    case 'date':
      return isRealDate(text) ? ok(text) : fail('invalid_date', `${field.label} must be a date written as YYYY-MM-DD.`)
    case 'datetime': {
      const time = Date.parse(text)
      return Number.isNaN(time) ? fail('invalid_datetime', `${field.label} must be a date and time, for example 2026-11-14T09:30:00Z.`) : ok(new Date(time).toISOString())
    }
    default:
      return stringValue(field, text)
  }
}

function stringValue(field: FieldMetadata, text: string): Coerced {
  if (field.options !== undefined && !field.options.includes(text)) return fail('not_allowed', `${field.label} must be one of: ${field.options.join(', ')}.`)
  // Count characters, not UTF-16 units, the way varchar(n) does.
  if (field.maxLength !== undefined && [...text].length > field.maxLength) return fail('too_long', `${field.label} can be at most ${field.maxLength} characters.`)
  if (field.kind === 'uuid' && !UUID_TEXT.test(text)) return fail('invalid_uuid', `${field.label} must be a UUID.`)
  if (field.kind === 'slug' && !SLUG_TEXT.test(text)) {
    return fail('invalid_slug', `${field.label} may only contain lower-case letters, digits and single dashes, like "my-first-post".`)
  }
  return ok(text)
}

function integerValue(field: FieldMetadata, value: number): Coerced {
  return Number.isSafeInteger(value) ? ok(value) : fail('invalid_integer', `${field.label} must be a whole number between ±${Number.MAX_SAFE_INTEGER}.`)
}

function decimalValue(field: FieldMetadata, text: string): Coerced {
  if (!DECIMAL_TEXT.test(text)) return fail('invalid_decimal', `${field.label} must be a decimal number such as "12.50".`)
  const scale = field.scale ?? 2
  const precision = field.precision ?? 8
  const [whole = '', fraction = ''] = text.replace('-', '').split('.')
  if (fraction.length > scale) return fail('invalid_decimal', `${field.label} can have at most ${scale} digits after the decimal point.`)
  if (whole.replace(/^0+(?=\d)/, '').length > precision - scale) {
    return fail('invalid_decimal', `${field.label} can have at most ${precision - scale} digits before the decimal point.`)
  }
  return ok(text)
}

function isRealDate(text: string): boolean {
  if (!DATE_TEXT.test(text)) return false
  // Round-trip so 2026-02-30 is refused instead of quietly becoming March 2nd.
  const parsed = new Date(`${text}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === text
}

function cloneJson(value: unknown): StoredValue {
  return JSON.parse(JSON.stringify(value)) as StoredValue
}
