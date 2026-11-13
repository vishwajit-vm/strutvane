/**
 * In-memory evaluation of a bound, validated {@link Filter} against one record.
 *
 * Used by `can(actor, action, record)` for single-record checks (show/update/delete/custom actions).
 * Implements exactly the two-valued semantics documented in {@link ./ast.ts}.
 */
import type { Filter, Operand, Scalar } from './ast.js'
import { validate } from './bind.js'
import type { ModelSchema } from './schema.js'

/** A record as loaded for a single-record check. To-one relations are nested objects or `null`. */
export type RecordValue = Readonly<Record<string, unknown>>

export class FieldNotLoadedError extends Error {
  override readonly name = 'FieldNotLoadedError'
}

/**
 * Read a field.
 *
 * - A relation that is `null` (no related row) yields `null` for its fields. This matches the SQL scalar
 *   subquery, which returns NULL when no row matches.
 * - A field or relation that is `undefined` was simply not loaded (e.g. a partial SELECT). Guessing `null`
 *   could grant or deny wrongly, so we throw instead: fail closed, loudly.
 */
function read(record: RecordValue, path: readonly string[]): Scalar {
  const head = path[0] as string
  const first = record[head]
  if (first === undefined) {
    throw new FieldNotLoadedError(`Field "${head}" must be loaded to evaluate this policy`)
  }
  if (path.length === 1) return first as Scalar
  if (first === null) return null
  const v = (first as Record<string, unknown>)[path[1] as string]
  if (v === undefined) {
    throw new FieldNotLoadedError(`Field "${path.join('.')}" must be loaded to evaluate this policy`)
  }
  return v as Scalar
}

const lit = (op: Operand): Scalar => (op.kind === 'value' ? op.value : null)

/** Null-safe identity ("IS NOT DISTINCT FROM"). */
const same = (a: Scalar, b: Scalar): boolean => a === b

function evalNode(f: Filter, r: RecordValue): boolean {
  switch (f.op) {
    case 'true':
      return true
    case 'false':
      return false
    case 'and':
      return f.args.every((a) => evalNode(a, r))
    case 'or':
      return f.args.some((a) => evalNode(a, r))
    case 'not':
      return !evalNode(f.arg, r)
    case 'isNull':
      return (read(r, f.field.path) === null) === f.value
    case 'eq':
      return same(read(r, f.field.path), lit(f.value))
    case 'ne':
      return !same(read(r, f.field.path), lit(f.value))
    case 'in':
      return f.values.some((v) => same(read(r, f.field.path), lit(v)))
    case 'nin':
      return !f.values.some((v) => same(read(r, f.field.path), lit(v)))
    case 'contains': {
      const a = read(r, f.field.path)
      const b = lit(f.value)
      return typeof a === 'string' && typeof b === 'string' && a.includes(b)
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const a = read(r, f.field.path)
      const b = lit(f.value)
      if (typeof a !== 'number' || typeof b !== 'number') return false
      if (f.op === 'gt') return a > b
      if (f.op === 'gte') return a >= b
      if (f.op === 'lt') return a < b
      return a <= b
    }
  }
}

/** Evaluate a bound filter. Validates first, so invalid input throws exactly like the SQL compiler does. */
export function evaluate(filter: Filter, record: RecordValue, schema: ModelSchema): boolean {
  validate(filter, schema)
  return evalNode(filter, record)
}
