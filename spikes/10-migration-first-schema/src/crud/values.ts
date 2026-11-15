/**
 * Turning outside values into database values (and back), driven only by field metadata.
 *
 * Two directions, one set of rules:
 * - in: query-string text or JSON body values → checked, typed {@link SqlValue}s;
 * - out: database rows → JSON the API returns (the shape of the generated `PostJson` type).
 *
 * The rules come straight from the column types in the migrations, so "validation derived from
 * columns" means: a `string(200)` rejects 201 characters, a `decimal(12, 2)` rejects `1.234`, an
 * `enum` rejects anything off its list, and so on.
 */
import type { Dialect, SqlValue } from '../sql/dialect.ts'
import type { FieldMetadata, ResourceMetadata } from '../generate/metadata.ts'
import type { Row } from '../db/database.ts'

/**
 * Either a converted value, or a friendly reason it was rejected.
 *
 * @example
 * const accepted: Coerced = { ok: true, value: '12.50' }
 * const refused: Coerced = { ok: false, code: 'too_long', message: 'Title can be at most 200 characters.' }
 */
export type Coerced = { readonly ok: true; readonly value: SqlValue } | { readonly ok: false; readonly code: string; readonly message: string }

const ok = (value: SqlValue): Coerced => ({ ok: true, value })
const fail = (code: string, message: string): Coerced => ({ ok: false, code, message })

const INTEGER_TEXT = /^-?\d+$/
const DECIMAL_TEXT = /^-?\d+(?:\.\d+)?$/
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/
const UUID_TEXT = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SLUG_TEXT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/**
 * Convert a query-string value (always text) for a field, for filters and exact search.
 *
 * @example
 * coerceQueryValue(priceField, '9.99') // { ok: true, value: '9.99' }
 * coerceQueryValue(featuredField, 'yes') // { ok: false, code: 'invalid_boolean', … }
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
      return coerceValue(field, raw)
  }
}

/**
 * Convert a JSON body value for a field. `null` is allowed only for nullable fields.
 *
 * @example
 * coerceBodyValue(titleField, 'Hello') // { ok: true, value: 'Hello' }
 * coerceBodyValue(titleField, 42) // { ok: false, code: 'invalid_type', … }
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
      // Numbers are accepted for convenience; strings are the exact way to send money.
      if (typeof value === 'number' && Number.isFinite(value)) return coerceValue(field, String(value))
      return typeof value === 'string' ? coerceValue(field, value) : fail('invalid_type', `${field.label} must be a decimal number such as "12.50".`)
    case 'json':
      return ok(JSON.stringify(value))
    default:
      return typeof value === 'string' ? coerceValue(field, value) : fail('invalid_type', `${field.label} must be text.`)
  }
}

/** Rules shared by query and body values once they are text. */
function coerceValue(field: FieldMetadata, text: string): Coerced {
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
  if (field.options !== undefined && !field.options.includes(text)) {
    return fail('not_allowed', `${field.label} must be one of: ${field.options.join(', ')}.`)
  }
  // Count characters, not UTF-16 units, the way PostgreSQL's varchar(n) does.
  if (field.maxLength !== undefined && [...text].length > field.maxLength) {
    return fail('too_long', `${field.label} can be at most ${field.maxLength} characters.`)
  }
  if (field.kind === 'uuid' && !UUID_TEXT.test(text)) return fail('invalid_uuid', `${field.label} must be a UUID.`)
  if (field.kind === 'slug' && !SLUG_TEXT.test(text)) {
    return fail('invalid_slug', `${field.label} may only contain lower-case letters, digits and single dashes, like "my-first-post".`)
  }
  return ok(text)
}

function integerValue(field: FieldMetadata, value: number): Coerced {
  // Beyond 2^53 a JavaScript number silently changes value; refuse rather than store the wrong id.
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

/**
 * Turn a database row into the JSON the API returns, the same on SQLite and PostgreSQL:
 * booleans are `true`/`false` (not 1/0), decimals are fixed-scale strings (`'12.50'`), timestamps
 * are ISO strings, dates are `YYYY-MM-DD`, JSON columns are parsed, and secrets are never included.
 *
 * @example
 * serializeRow(posts, { id: 1, featured: 0, price: 12.5 }, 'sqlite') // { id: 1, featured: false, price: '12.50' }
 */
export function serializeRow(resource: ResourceMetadata, row: Row, dialect: Dialect): Record<string, unknown> {
  const json: Record<string, unknown> = {}
  for (const field of resource.fields) {
    if (field.hidden) continue
    json[field.name] = serializeValue(field, row[field.name], dialect)
  }
  return json
}

function serializeValue(field: FieldMetadata, value: unknown, dialect: Dialect): unknown {
  if (value === null || value === undefined) return null
  switch (field.cast) {
    case 'integer':
    case 'number':
      return Number(value)
    case 'boolean':
      return value === true || value === 1
    case 'decimal':
      // SQLite hands back a float (12.5); PostgreSQL hands back the exact text ('12.50').
      return typeof value === 'number' ? value.toFixed(field.scale ?? 2) : String(value)
    case 'date':
      return value instanceof Date ? value.toISOString().slice(0, 10) : String(value)
    case 'datetime':
      return value instanceof Date ? value.toISOString() : String(value)
    case 'json':
      // Only SQLite hands back JSON *text*. PostgreSQL's jsonb (and MySQL's JSON via mysql2) arrive
      // parsed, so a string from them is already the value: parsing it again turned a stored JSON
      // string ("hello") into a 500 on every read of that row, and "123" into the number 123.
      return dialect === 'sqlite' && typeof value === 'string' ? (JSON.parse(value) as unknown) : value
    case 'string':
      return String(value)
  }
}
