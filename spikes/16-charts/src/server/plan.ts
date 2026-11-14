/**
 * The validated, fully typed form of an aggregate request. Nothing in here came from the request
 * as text: every name was looked up in the metadata and every value parsed for its column type.
 * The SQL compiler only ever sees a plan, never the query string.
 *
 * @module
 */
import type { AggregateMetric, DateInterval } from '../shared/aggregate-contract.ts'
import type { ColumnKind } from '../shared/metadata.ts'

/**
 * A value parsed for its column type. Each dialect turns it into a bind parameter its own way
 * (booleans are 0/1 on SQLite and MySQL; timestamps have no `Z` on MySQL).
 *
 * @example
 * const value: TypedValue = { type: 'timestamp', value: new Date('2026-11-01T00:00:00Z') }
 */
export type TypedValue =
  | { readonly type: 'text'; readonly value: string }
  | { readonly type: 'integer'; readonly value: number }
  | { readonly type: 'decimal'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean }
  | { readonly type: 'date'; readonly value: string }
  | { readonly type: 'timestamp'; readonly value: Date }

/**
 * A column the plan reads, with what the compiler needs to treat it right.
 *
 * @example
 * const column: PlanColumn = { name: 'issued_on', kind: 'date' }
 */
export interface PlanColumn {
  readonly name: string
  readonly kind: ColumnKind
  /** Decimal places, for rounding sums and averages the way the column stores them. */
  readonly scale?: number
}

/**
 * One WHERE condition. They are always joined with AND at the top level, which is what makes the
 * tenant check a simple membership test (spike 11's rule: a scope buried in an OR doesn't count).
 *
 * @example
 * const condition: Condition = { kind: 'in', column: 'status', values: [{ type: 'text', value: 'paid' }] }
 */
export type Condition =
  | { readonly kind: 'tenant'; readonly column: string; readonly tenant: string }
  | { readonly kind: 'compare'; readonly column: string; readonly op: '=' | '<' | '<=' | '>' | '>='; readonly value: TypedValue }
  /** NULL-safe "not equal": a NULL row counts as different (spike 11's `!=` rule). */
  | { readonly kind: 'distinct'; readonly column: string; readonly value: TypedValue }
  | { readonly kind: 'in'; readonly column: string; readonly values: readonly TypedValue[] }
  | { readonly kind: 'null'; readonly column: string; readonly isNull: boolean }
  /** `pattern` is already LIKE-escaped (`%`, `_`, `!` are literals); `!` is the escape character (MySQL refuses `\`). */
  | { readonly kind: 'like'; readonly column: string; readonly pattern: string }

/**
 * How rows are grouped.
 *
 * @example
 * const group: PlanGroup = { kind: 'date', column: { name: 'created_at', kind: 'timestamp' }, interval: 'month', keys: ['2026-01-01'] }
 */
export type PlanGroup =
  | { readonly kind: 'none' }
  /** `keys`: every bucket in the range, so empty buckets are filled with 0. */
  | { readonly kind: 'date'; readonly column: PlanColumn; readonly interval: DateInterval; readonly keys: readonly string[] }
  /** `keys`: every enum option (or `true`/`false`), in schema order. */
  | { readonly kind: 'category'; readonly column: PlanColumn; readonly keys: readonly string[] }
  /** Top `limit` related ids by the metric; the rest is summed into `__other__`. */
  | { readonly kind: 'relation'; readonly column: PlanColumn; readonly limit: number }

/**
 * The second dimension (series), if any.
 *
 * @example
 * const split: PlanSplit = { kind: 'category', column: { name: 'status', kind: 'enum' }, keys: ['draft', 'paid'] }
 */
export type PlanSplit = { readonly kind: 'none' } | { readonly kind: 'category'; readonly column: PlanColumn; readonly keys: readonly string[] }

/**
 * A validated aggregate request.
 *
 * @example
 * const plan = validateAggregateRequest(url.searchParams, charts, { now }).plan
 */
export interface AggregatePlan {
  readonly table: string
  readonly route: string
  readonly metric: AggregateMetric
  /** The summed/averaged column (absent for count). */
  readonly field?: PlanColumn
  readonly group: PlanGroup
  readonly split: PlanSplit
  /** Conditions from filters and the date range. Tenancy and policy are added by the scope step. */
  readonly conditions: readonly Condition[]
  readonly softDeletes: boolean
  readonly dateField: string | null
  readonly from: Date | null
  readonly to: Date | null
  readonly minGroupSize: number | null
}
