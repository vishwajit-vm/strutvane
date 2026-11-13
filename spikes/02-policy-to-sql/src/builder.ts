/**
 * Typed predicate builder: `row.amount.lte(10_000)` → AST, with compile-time checking.
 *
 * Type safety (compile time):
 * - Unknown fields are errors: `row.amout` does not exist on the mapped type.
 * - Value types must match the field: `row.amount.eq('x')` is an error.
 * - Ordering operators exist only on numeric fields; `contains` only on text fields.
 * - Actor references are typed: `actor.attrs.region` can only be compared with a compatible field.
 *
 * Safety (run time): the builder only records paths. `validate()` re-checks every path and value against the
 * schema, so untyped callers (plain JS, deserialised filters from a UI) cannot bypass the rules.
 */
import type { Filter, FieldRef, Operand, Scalar } from './ast.js'
import type { ModelSchema } from './schema.js'

/** Phantom-typed actor reference. `__t` never exists at runtime; it only carries the value type. */
export interface ActorRef<T extends Scalar> {
  readonly kind: 'actor'
  readonly path: readonly string[]
  readonly __t?: T
}

type Arg<T extends Scalar> = T | ActorRef<T> | ActorRef<Exclude<T, null>>

export interface FieldExpr<T extends Scalar> {
  eq(v: Arg<T>): Filter
  ne(v: Arg<T>): Filter
  in(vs: readonly Arg<T>[]): Filter
  nin(vs: readonly Arg<T>[]): Filter
  isNull(): Filter
  isNotNull(): Filter
}
export interface NumberExpr<T extends number | null> extends FieldExpr<T> {
  gt(v: Arg<number | null>): Filter
  gte(v: Arg<number | null>): Filter
  lt(v: Arg<number | null>): Filter
  lte(v: Arg<number | null>): Filter
}
export interface TextExpr<T extends string | null> extends FieldExpr<T> {
  contains(v: Arg<string | null>): Filter
}

/** Pick the expression interface for a field type. Tuple-wrapped to avoid distributing over unions. */
export type ExprFor<T extends Scalar> = [NonNullable<T>] extends [number]
  ? NumberExpr<Extract<T, number | null>>
  : [NonNullable<T>] extends [string]
    ? TextExpr<Extract<T, string | null>>
    : FieldExpr<T>

/** Shape of a model: scalar fields, plus to-one relations as nested objects (or null). */
export type ModelShape = { readonly [k: string]: Scalar | { readonly [k: string]: Scalar } }

/** `row` proxy type. Relation fields become nullable: a missing related row reads as null. */
export type RowProxy<S extends ModelShape> = {
  readonly [K in keyof S]-?: NonNullable<S[K]> extends { readonly [k: string]: Scalar }
    ? { readonly [F in keyof NonNullable<S[K]>]-?: ExprFor<NonNullable<S[K]>[F] | null> }
    : S[K] extends Scalar
      ? ExprFor<S[K]>
      : never
}

/** `actor` proxy type. `A` declares the attribute names and types the policy may reference. */
export interface ActorProxy<A extends { readonly [k: string]: Scalar }> {
  readonly id: ActorRef<string>
  readonly attrs: { readonly [K in keyof A]-?: ActorRef<A[K] | null> }
}

const toOperand = (v: unknown): Operand =>
  typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'actor'
    ? { kind: 'actor', path: [...(v as ActorRef<Scalar>).path] }
    : { kind: 'value', value: v as Scalar }

function fieldExpr(field: FieldRef): NumberExpr<number | null> & TextExpr<string | null> & FieldExpr<Scalar> {
  const cmp = (op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte') => (v: unknown): Filter => ({ op, field, value: toOperand(v) })
  return {
    eq: cmp('eq'),
    ne: cmp('ne'),
    gt: cmp('gt'),
    gte: cmp('gte'),
    lt: cmp('lt'),
    lte: cmp('lte'),
    in: (vs: readonly unknown[]): Filter => ({ op: 'in', field, values: vs.map(toOperand) }),
    nin: (vs: readonly unknown[]): Filter => ({ op: 'nin', field, values: vs.map(toOperand) }),
    isNull: (): Filter => ({ op: 'isNull', field, value: true }),
    isNotNull: (): Filter => ({ op: 'isNull', field, value: false }),
    contains: (v: unknown): Filter => ({ op: 'contains', field, value: toOperand(v) }),
  }
}

/** Create the runtime `row` proxy. Relation names come from the schema; everything else is a field. */
export function createRow<S extends ModelShape>(schema: ModelSchema): RowProxy<S> {
  return new Proxy({} as RowProxy<S>, {
    get(_t, prop) {
      if (typeof prop !== 'string') return undefined
      if (schema.relations[prop]) {
        return new Proxy({}, {
          get(_r, sub) {
            return typeof sub === 'string' ? fieldExpr({ path: [prop, sub] }) : undefined
          },
        })
      }
      return fieldExpr({ path: [prop] })
    },
  })
}

/** Create the runtime `actor` proxy (references only; values are bound later). */
export function createActorRefs<A extends { readonly [k: string]: Scalar }>(): ActorProxy<A> {
  return {
    id: { kind: 'actor', path: ['id'] },
    attrs: new Proxy({} as ActorProxy<A>['attrs'], {
      get(_t, prop) {
        return typeof prop === 'string' ? { kind: 'actor', path: ['attrs', prop] } : undefined
      },
    }),
  }
}
