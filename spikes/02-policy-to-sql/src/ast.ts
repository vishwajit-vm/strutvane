/**
 * Portable QueryFilter AST.
 *
 * This is the shape `@strutvane/contracts` is expected to standardise. It is plain, JSON-serialisable
 * data: no functions, no classes, no SQL. Producers include auth policies and UI filter chips; consumers
 * include the in-memory evaluator ({@link ./evaluate.ts}) and the SQL compiler ({@link ./sql.ts}).
 *
 * ## Semantics (normative)
 *
 * The AST uses **two-valued, null-safe logic**: every node evaluates to exactly `true` or `false`, never
 * "unknown". SQL's three-valued logic (NULL propagation) is deliberately *not* exposed, because it makes
 * `not(x)` behave differently in SQL and in JavaScript. Leaf semantics:
 *
 * | Node                  | Meaning                                                                    |
 * |-----------------------|----------------------------------------------------------------------------|
 * | `eq(f, v)`            | `f` and `v` are identical; `null` equals `null` ("IS NOT DISTINCT FROM")    |
 * | `ne(f, v)`            | exactly `not(eq(f, v))`; so `null ne 'x'` is **true**                       |
 * | `gt/gte/lt/lte(f, v)` | numeric comparison; **false** if either side is `null`                      |
 * | `in(f, vs)`           | `or(eq(f, v1), eq(f, v2), ...)`; empty list is **false**                    |
 * | `nin(f, vs)`          | exactly `not(in(f, vs))`; empty list is **true**                            |
 * | `isNull(f, b)`        | `f` is `null` (b = true) or not `null` (b = false)                          |
 * | `contains(f, s)`      | case-sensitive substring test; **false** if either side is `null`           |
 * | `and([])` / `or([])`  | `true` / `false` (identity elements)                                       |
 */

/** A scalar value that may appear in a filter or a record. */
export type Scalar = string | number | boolean | null

/** Path to a field on the subject record. `['amount']` or, through a to-one relation, `['customer', 'region']`. */
export interface FieldRef {
  readonly path: readonly [string] | readonly [string, string]
}

/**
 * Right-hand side of a comparison: a literal, or a reference to the acting user that is resolved
 * ("bound") before evaluation or compilation. `['id']` or `['attrs', 'region']`.
 */
export type Operand =
  | { readonly kind: 'value'; readonly value: Scalar }
  | { readonly kind: 'actor'; readonly path: readonly string[] }

export type ComparisonOp = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'

export type Filter =
  | { readonly op: 'true' }
  | { readonly op: 'false' }
  | { readonly op: 'and'; readonly args: readonly Filter[] }
  | { readonly op: 'or'; readonly args: readonly Filter[] }
  | { readonly op: 'not'; readonly arg: Filter }
  | { readonly op: ComparisonOp; readonly field: FieldRef; readonly value: Operand }
  | { readonly op: 'in' | 'nin'; readonly field: FieldRef; readonly values: readonly Operand[] }
  | { readonly op: 'isNull'; readonly field: FieldRef; readonly value: boolean }
  | { readonly op: 'contains'; readonly field: FieldRef; readonly value: Operand }

export const TRUE: Filter = { op: 'true' }
export const FALSE: Filter = { op: 'false' }

/** Logical AND with constant folding (keeps generated SQL readable). */
export function and(...args: readonly Filter[]): Filter {
  const flat: Filter[] = []
  for (const a of args) {
    if (a.op === 'false') return FALSE
    if (a.op === 'true') continue
    if (a.op === 'and') flat.push(...a.args)
    else flat.push(a)
  }
  if (flat.length === 0) return TRUE
  if (flat.length === 1) return flat[0] as Filter
  return { op: 'and', args: flat }
}

/** Logical OR with constant folding. */
export function or(...args: readonly Filter[]): Filter {
  const flat: Filter[] = []
  for (const a of args) {
    if (a.op === 'true') return TRUE
    if (a.op === 'false') continue
    if (a.op === 'or') flat.push(...a.args)
    else flat.push(a)
  }
  if (flat.length === 0) return FALSE
  if (flat.length === 1) return flat[0] as Filter
  return { op: 'or', args: flat }
}

/** Logical NOT with constant folding and double-negation removal. Safe because logic is two-valued. */
export function not(arg: Filter): Filter {
  if (arg.op === 'true') return FALSE
  if (arg.op === 'false') return TRUE
  if (arg.op === 'not') return arg.arg
  return { op: 'not', arg }
}

export const value = (v: Scalar): Operand => ({ kind: 'value', value: v })
