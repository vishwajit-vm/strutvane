/**
 * `defineResource`: the single model definition everything else is derived from.
 *
 * From one Zod object of *writable fields* plus resource metadata, it derives:
 * - `read`   — what the API returns (fields + server-managed `id`, `createdAt`), named `<Name>`,
 *              carrying `x-strutvane-resource`;
 * - `create` — strict input for POST (unknown keys rejected), named `<Name>Create`;
 * - `update` — strict partial input for PATCH, named `<Name>Update`;
 * - `list`   — the `ListResult` envelope, named `<Name>List`;
 * - `filterable` / `sortable` — the allow-lists the list-query parser enforces, read from each
 *   field's `x-strutvane-field` metadata (nothing is filterable unless declared).
 *
 * Generic over the field shape, so every resource gets the same behaviour with zero repeated code.
 *
 * @module
 */
import { z } from 'zod'
import type { FilterOperator, ResourceMeta } from './contracts.ts'
import { readFieldMeta } from './field.ts'

/** Allow-list entry for one filterable field. */
export interface FilterableField {
  /** Operators the field accepts, from its metadata. */
  readonly operators: readonly FilterOperator[]
  /** The field's own schema (unwrapped from optional/nullable), used to coerce and validate values. */
  readonly schema: z.ZodType
  /** Human label, for messages. */
  readonly label: string
}

/** Everything derived from one model definition. */
export interface Resource<Shape extends z.ZodRawShape> {
  readonly meta: ResourceMeta
  readonly read: z.ZodObject<Shape & { id: z.ZodUUID; createdAt: z.ZodISODateTime }>
  readonly create: z.ZodObject<Shape, z.core.$strict>
  readonly update: z.ZodObject<{ [K in keyof Shape]: z.ZodOptional<Shape[K]> }, z.core.$strict>
  readonly list: z.ZodObject<{
    data: z.ZodArray<Resource<Shape>['read']>
    meta: typeof PageMetaSchema
  }>
  readonly filterable: ReadonlyMap<string, FilterableField>
  readonly sortable: readonly string[]
  /** Fields `search=` looks in (marked `searchable`). */
  readonly searchable: string[]
  /** Field labels by name (including `id`/`createdAt`), used to render `{attribute}` in messages. */
  readonly labels: ReadonlyMap<string, string>
}

/** Pagination info returned with every list (mirrors `PageInfo`). */
export const PageMetaSchema = z
  .object({
    page: z.object({
      size: z.int().min(1),
      hasMore: z.boolean(),
      nextCursor: z.string().optional(),
    }),
  })
  .meta({ id: 'PageMeta' })

/** Define a resource from its writable fields. */
export function defineResource<Shape extends z.ZodRawShape>(
  meta: ResourceMeta,
  fields: Shape,
): Resource<Shape> {
  const base = z.object(fields)
  const read = base
    .extend({
      id: z.uuid().meta({ 'x-strutvane-field': { label: 'ID', filterOperators: ['eq', 'in'] } }),
      createdAt: z.iso
        .datetime()
        .meta({ 'x-strutvane-field': { label: 'Created at', sortable: true } }),
    })
    .meta({ id: meta.name, 'x-strutvane-resource': meta })
  const create = z.strictObject(fields).meta({ id: `${meta.name}Create` })
  const update = z.strictObject(fields).partial().meta({ id: `${meta.name}Update` })
  const list = z
    .object({ data: z.array(read), meta: PageMetaSchema })
    .meta({ id: `${meta.name}List` })

  const filterable = new Map<string, FilterableField>()
  const sortable: string[] = []
  const searchable: string[] = []
  const labels = new Map<string, string>()
  for (const [name, schema] of Object.entries(read.shape) as [string, z.ZodType][]) {
    const fieldMeta = readFieldMeta(schema)
    if (!fieldMeta) continue
    labels.set(name, fieldMeta.label)
    if (fieldMeta.filterOperators && fieldMeta.filterOperators.length > 0) {
      filterable.set(name, {
        operators: fieldMeta.filterOperators,
        schema: unwrap(schema),
        label: fieldMeta.label,
      })
    }
    if (fieldMeta.sortable) sortable.push(name)
    if (fieldMeta.searchable) searchable.push(name)
  }

  return {
    meta,
    read: read as Resource<Shape>['read'],
    create: create as Resource<Shape>['create'],
    update: update as unknown as Resource<Shape>['update'],
    list: list as Resource<Shape>['list'],
    filterable,
    sortable,
    searchable,
    labels,
  }
}

/** Strip optional/nullable/default wrappers to reach the value schema. */
function unwrap(schema: z.ZodType): z.ZodType {
  let current: z.ZodType = schema
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault
  ) {
    current = current.unwrap() as z.ZodType
  }
  return current
}
