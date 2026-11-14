/**
 * Value conversion between the database, the model and JSON, driven by each field's `cast` from
 * `resources.json`. This is why models need no `$casts` list: the migration already said what
 * each column is.
 */
import type { Dialect, SqlValue } from './dialect.ts'
import type { FieldCast, FieldMetadata } from './metadata.ts'

/**
 * Convert a raw driver value into the model's type: `1` → `true` for booleans, text → `Date`
 * for datetimes, a JSON string → an object for JSON columns.
 *
 * @example
 * fromDatabase(isAdminField, 1) // true
 */
export function fromDatabase(field: FieldMetadata, raw: unknown): unknown {
  if (raw === null || raw === undefined) return null
  return convertFromDatabase(field.cast, raw)
}

function convertFromDatabase(cast: FieldCast, raw: unknown): unknown {
  switch (cast) {
    case 'integer':
    case 'number':
      return Number(raw)
    case 'boolean':
      return raw === 1 || raw === true || raw === '1' || raw === 1n
    case 'datetime':
      return new Date(String(raw))
    case 'json':
      return typeof raw === 'string' ? JSON.parse(raw) : raw
    case 'decimal':
    case 'string':
    case 'date':
      return String(raw)
  }
}

/**
 * Convert a model value into something the driver can bind.
 *
 * @example
 * toDatabase(isAdminField, true, sqliteDialect) // 1
 */
export function toDatabase(field: FieldMetadata, value: unknown, dialect: Dialect): SqlValue {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return dialect.formatDateTime(value)
  if (field.cast === 'boolean') return value === true ? 1 : 0
  if (field.cast === 'json') return JSON.stringify(value)
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'string') return value
  return String(value)
}

/**
 * Convert a model value for the JSON API: dates become ISO strings, everything else passes.
 *
 * @example
 * toJsonValue(new Date('2026-11-14T10:00:00Z')) // '2026-11-14T10:00:00.000Z'
 */
export function toJsonValue(value: unknown): unknown {
  return value instanceof Date ? value.toISOString() : value
}
