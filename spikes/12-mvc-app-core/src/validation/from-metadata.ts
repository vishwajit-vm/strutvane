/**
 * Default validation rules derived from `resources.json`: what `ResourceController` uses when a
 * controller doesn't name its own form request. Required columns are required on create, and
 * every message names the field in plain words.
 *
 * Which columns may be written (security review F-10, mass assignment):
 * 1. When the model lists `static fillable`, exactly those (and never hidden ones).
 * 2. Otherwise the metadata's fillable, non-hidden columns *minus* names that are almost always
 *    server-owned: `*_at` timestamps, `is_*` flags, and foreign keys to an owner table
 *    (`users` by default), which the controller sets from the signed-in user.
 */
import { z } from 'zod'
import type { FieldMetadata, ResourceMetadata } from '../database/metadata.ts'
import type { HttpContext } from '../http/context.ts'
import { FormRequest, type StandardSchema } from './form-request.ts'

/**
 * `create` requires the required columns; `update` makes every column optional (PATCH semantics).
 *
 * @example
 * const mode: RequestMode = 'update'
 */
export type RequestMode = 'create' | 'update'

/**
 * Build the Zod schema for a resource.
 *
 * @example
 * schemaFromMetadata(posts, 'create').parse({ title: 'Hello', author_id: 1 })
 */
export function schemaFromMetadata(resource: ResourceMetadata, mode: RequestMode, fillable?: readonly string[], ownerTables: readonly string[] = ['users']): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodType> = {}
  for (const field of resource.fields) {
    if (!isWritable(field, fillable, ownerTables)) continue
    const base = fieldSchema(field)
    const withNull = field.nullable ? base.nullable() : base
    shape[field.name] = mode === 'create' && field.required ? withNull : withNull.optional()
  }
  return z.object(shape)
}

/**
 * Whether the auto API may write a column (see the module comment for the rules).
 *
 * @example
 * isWritable(isAdminField, undefined, ['users']) // false: `is_*` is server-owned by default
 */
export function isWritable(field: FieldMetadata, fillable: readonly string[] | undefined, ownerTables: readonly string[]): boolean {
  if (field.hidden || field.kind === 'id') return false
  if (fillable !== undefined) return fillable.includes(field.name)
  if (!field.fillable) return false
  if (field.name.endsWith('_at') || field.name.startsWith('is_')) return false
  return field.references === undefined || !ownerTables.includes(field.references)
}

function fieldSchema(field: FieldMetadata): z.ZodType {
  const label = field.label
  const typeError = (expected: string) => (issue: { input: unknown }) => (issue.input === undefined ? `${label} is required.` : `${label} must be ${expected}.`)
  if (field.options !== undefined && field.options.length > 0) {
    const [first, ...rest] = field.options
    return z.enum([first ?? '', ...rest], { error: `${label} must be one of: ${field.options.join(', ')}.` })
  }
  switch (field.cast) {
    case 'integer':
      return z.number({ error: typeError('a whole number') }).int({ error: `${label} must be a whole number.` })
    case 'number':
    case 'decimal':
      return z.number({ error: typeError('a number') })
    case 'boolean':
      return z.boolean({ error: typeError('true or false') })
    case 'datetime':
      return z.iso.datetime({ error: typeError('a date and time such as 2026-11-14T10:00:00Z') })
    case 'date':
      return z.iso.date({ error: typeError('a date such as 2026-11-14') })
    case 'json':
      return z.json()
    case 'string': {
      let text = z.string({ error: typeError('text') }).trim()
      if (field.required) text = text.min(1, { error: `${label} can't be empty.` })
      if (field.maxLength !== undefined) text = text.max(field.maxLength, { error: `${label} can be at most ${field.maxLength} characters.` })
      return text
    }
  }
}

/**
 * A form request whose rules come from the metadata. `ResourceController` uses it by default.
 *
 * @example
 * await new MetadataRequest(Post.metadata(), 'create', Post.fillable).validate(ctx)
 */
export class MetadataRequest extends FormRequest<Record<string, unknown>> {
  readonly #schema: z.ZodType<Record<string, unknown>>

  constructor(resource: ResourceMetadata, mode: RequestMode, fillable?: readonly string[]) {
    super()
    this.#schema = schemaFromMetadata(resource, mode, fillable)
  }

  rules(_ctx: HttpContext): StandardSchema<Record<string, unknown>> {
    return this.#schema
  }
}
