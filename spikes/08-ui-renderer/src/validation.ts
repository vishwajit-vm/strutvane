/**
 * Client-side validation derived from the manifest. A FieldDescriptor (required, enumValues and its
 * JSON Schema: minimum/maximum/minLength/maxLength/pattern) is turned into ValidationIssues with
 * stable codes, then rendered through the same message catalog the server uses.
 *
 * Client validation is a convenience (fast feedback); the server always re-validates. That is why
 * this module is deliberately small and only supports the schema keywords the manifest emits.
 */
import type { FieldDescriptor, ValidationIssue } from './contracts.ts'
import { formatMessage, type MessageCatalog } from './messages.ts'

/** Is this value "empty" for the purpose of `required`? */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  )
}

function numberKeyword(schema: FieldDescriptor['schema'], key: string): number | undefined {
  const v = schema?.[key]
  return typeof v === 'number' ? v : undefined
}

/**
 * Validate one scalar field value. Returns zero or more issues (paths are relative to the form,
 * i.e. `[field.name]`). Array items are validated by {@link validateArrayItems}.
 */
export function validateField(
  field: FieldDescriptor,
  value: unknown,
  catalog: MessageCatalog,
): ValidationIssue[] {
  const issue = (code: string, params: Record<string, string | number | boolean> = {}) => ({
    path: [field.name],
    code,
    params,
    message: formatMessage(catalog, code, { attribute: field.label, ...params }),
  })

  if (isEmptyValue(value)) return field.required ? [issue('required')] : []

  const issues: ValidationIssue[] = []
  const schema = field.schema

  if (field.type === 'enum' && field.enumValues && !field.enumValues.includes(String(value))) {
    issues.push(issue('invalid_enum', { values: field.enumValues.join(', ') }))
  }

  if (field.type === 'integer' || field.type === 'decimal' || field.type === 'money') {
    const n = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(n)) return [issue('invalid_number')]
    const min = numberKeyword(schema, 'minimum')
    const max = numberKeyword(schema, 'maximum')
    if (min !== undefined && n < min) issues.push(issue('too_small', { min }))
    if (max !== undefined && n > max) issues.push(issue('too_big', { max }))
  }

  if (field.type === 'date' && (typeof value !== 'string' || !isIsoDate(value))) {
    issues.push(issue('invalid_date'))
  }

  if (typeof value === 'string' && (field.type === 'string' || field.type === 'text')) {
    const minLength = numberKeyword(schema, 'minLength')
    const maxLength = numberKeyword(schema, 'maxLength')
    if (minLength !== undefined && value.length < minLength)
      issues.push(issue('too_short', { min: minLength }))
    if (maxLength !== undefined && value.length > maxLength)
      issues.push(issue('too_long', { max: maxLength }))
    const pattern = schema?.pattern
    if (typeof pattern === 'string' && !new RegExp(pattern, 'u').test(value))
      issues.push(issue('invalid_format'))
  }
  return issues
}

/**
 * Validate the items of an `array` field whose JSON Schema describes object items
 * (`items.properties`). Issues get full paths such as `['lines', 1, 'amount']`, exactly the shape
 * the server returns, so client and server errors flow through the same mapping code.
 */
export function validateArrayItems(
  field: FieldDescriptor,
  value: unknown,
  catalog: MessageCatalog,
): ValidationIssue[] {
  if (!Array.isArray(value)) return []
  const properties = itemProperties(field)
  const issues: ValidationIssue[] = []
  value.forEach((item: unknown, index) => {
    const row = (item ?? {}) as Record<string, unknown>
    for (const [prop, sub] of Object.entries(properties)) {
      const subField = itemFieldDescriptor(field, prop, sub)
      for (const i of validateField(subField, row[prop], catalog)) {
        issues.push({ ...i, path: [field.name, index, prop] })
      }
    }
  })
  return issues
}

/** The `items.properties` of an array field's JSON Schema (empty when absent or malformed). */
export function itemProperties(field: FieldDescriptor): Record<string, Record<string, unknown>> {
  const items = field.schema?.items
  if (typeof items !== 'object' || items === null) return {}
  const props = (items as Record<string, unknown>).properties
  return typeof props === 'object' && props !== null
    ? (props as Record<string, Record<string, unknown>>)
    : {}
}

/** A synthetic FieldDescriptor for one property of an array item (used for validation + widgets). */
export function itemFieldDescriptor(
  parent: FieldDescriptor,
  prop: string,
  schema: Record<string, unknown>,
): FieldDescriptor {
  const required = Array.isArray((parent.schema?.items as { required?: unknown })?.required)
    ? ((parent.schema?.items as { required: string[] }).required.includes(prop))
    : false
  const type = schema.type === 'number' ? 'decimal' : schema.type === 'integer' ? 'integer' : 'string'
  return {
    name: prop,
    type,
    label: typeof schema.title === 'string' ? schema.title : prop,
    required,
    nullable: !required,
    unique: false,
    readOnly: parent.readOnly,
    writeOnce: false,
    filterOperators: [],
    sortable: false,
    searchable: false,
    schema,
  }
}

/** `YYYY-MM-DD` that is also a real calendar date (rejects 2026-02-30). */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}
