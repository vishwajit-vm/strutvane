/**
 * Attach Strutvane field metadata to a Zod schema using Zod 4's native `.meta()`.
 *
 * Why `.meta()` and not `@hono/zod-openapi`'s `.openapi()`: `.meta()` is part of Zod itself, so
 * model files stay free of any OpenAPI library. Both `z.toJSONSchema` and `@hono/zod-openapi`
 * copy `x-*` meta keys into the generated schema verbatim (verified in this spike), which is how
 * `x-strutvane-field` reaches the OpenAPI document and, from there, the UI.
 *
 * @module
 */
import type { z } from 'zod'
import type { FieldMeta } from './contracts.ts'

/** The meta key under which field metadata is stored and published. */
export const FIELD_META_KEY: 'x-strutvane-field' = 'x-strutvane-field'

/**
 * Return `schema` annotated with Strutvane field metadata. The schema's type is unchanged.
 *
 * @example
 * const amount = field(z.number().min(0), { label: 'Amount', filterOperators: ['gte', 'lte'], widget: 'money' })
 */
export function field<S extends z.ZodType>(schema: S, meta: FieldMeta): S {
  return schema.meta({ [FIELD_META_KEY]: meta }) as S
}

/** Read Strutvane field metadata back from a schema (`undefined` when none was attached). */
export function readFieldMeta(schema: z.ZodType): FieldMeta | undefined {
  const meta = schema.meta()
  const value = meta?.[FIELD_META_KEY]
  return isFieldMeta(value) ? value : undefined
}

function isFieldMeta(value: unknown): value is FieldMeta {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { label?: unknown }).label === 'string'
  )
}
