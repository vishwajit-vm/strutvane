/**
 * The aggregate endpoint contract, shared by the server (which validates and answers it) and the
 * browser (which builds requests and draws the answers).
 *
 * ```text
 * GET /api/v1/<resource>/aggregate
 *     ?metric=count|sum|avg          required
 *     &field=<numeric field>         required for sum and avg, refused for count
 *     &groupBy=<field>               optional: a date, enum, boolean or belongsTo field
 *     &interval=day|week|month       required when groupBy is a date field, refused otherwise
 *     &splitBy=<enum|boolean field>  optional second dimension (stacked/grouped bars)
 *     &dateField=<date field>        which date from/to limit (default: groupBy, else created_at)
 *     &from=2026-01-01&to=2026-12-31 optional range, from inclusive, to exclusive (UTC)
 *     &limit=10                      top N for belongsTo groups (1..50), the rest becomes "other"
 *     &filter[status][in]=paid,sent  spike 10's list filters
 * ```
 *
 * Why one endpoint with parameters, not one per chart: the server can then hold **one** allow-list
 * per resource and one validation path, and every chart (suggested or hand-made) goes through it.
 * Unknown parameters are refused (422), never ignored, so a typo can't silently widen a query.
 *
 * @module
 */
import type { FilterOperator } from './metadata.ts'

/**
 * What to compute per group.
 *
 * Why no `min`/`max`: they return one row's exact value, which defeats small-group suppression
 * (the highest salary *is* one person's salary). Add them per resource only for non-sensitive data.
 *
 * @example
 * const metric: AggregateMetric = 'sum'
 */
export type AggregateMetric = 'count' | 'sum' | 'avg'

/**
 * Date bucket size. Weeks start on Monday (ISO 8601) on every engine.
 *
 * @example
 * const interval: DateInterval = 'month'
 */
export type DateInterval = 'day' | 'week' | 'month'

/**
 * How a group key was produced, so the browser knows how to label it.
 *
 * @example
 * const kind: GroupKind = 'date' // keys are 'YYYY-MM-DD' bucket starts
 */
export type GroupKind = 'none' | 'date' | 'category' | 'relation'

/**
 * One `filter[field][op]=value` from the query string.
 *
 * @example
 * const filter: AggregateFilter = { field: 'status', op: 'in', value: 'paid,sent' }
 */
export interface AggregateFilter {
  readonly field: string
  readonly op: FilterOperator
  readonly value: string
}

/**
 * A request, as the browser builds it. Every field name is still a plain string here; the server
 * checks each one against the resource's allow-list.
 *
 * @example
 * const query: AggregateQuery = { metric: 'sum', field: 'total', groupBy: 'issued_on', interval: 'month' }
 */
export interface AggregateQuery {
  readonly metric: AggregateMetric
  readonly field?: string
  readonly groupBy?: string
  readonly interval?: DateInterval
  readonly splitBy?: string
  readonly dateField?: string
  readonly from?: string
  readonly to?: string
  readonly limit?: number
  readonly filters?: readonly AggregateFilter[]
}

/**
 * One group (an x-axis position, a pie slice) with a value per series.
 *
 * - `key`: the group value: `'2026-11-01'` for dates (bucket start), `'paid'` for enums,
 *   `'true'`/`'false'` for booleans, `'42'` for relations, `'__other__'` for the rest of a top N,
 *   `'__total__'` when there is no groupBy.
 * - `values[series]`: the number, or `null` when there is nothing to average or the cell was
 *   suppressed (see `suppressed`).
 *
 * @example
 * const bucket: AggregateBucket = { key: '2026-11-01', values: { value: 12 } }
 */
export interface AggregateBucket {
  readonly key: string
  readonly values: Readonly<Record<string, number | null>>
  /** Series keys whose value was withheld because fewer than `minGroupSize` rows were behind it. */
  readonly suppressed?: readonly string[]
}

/**
 * One series (a line, a bar colour). Without `splitBy` there is exactly one: `{ key: 'value' }`.
 *
 * @example
 * const series: AggregateSeries = { key: 'paid' }
 */
export interface AggregateSeries {
  readonly key: string
}

/**
 * Everything the answer was computed from, after defaults and alignment, so a chart can label
 * itself honestly ("Jan 2026 – Dec 2026, UTC").
 *
 * @example
 * result.meta.from // '2026-01-01T00:00:00.000Z' (aligned to the bucket start)
 */
export interface AggregateMeta {
  readonly resource: string
  readonly metric: AggregateMetric
  readonly field: string | null
  readonly groupBy: string | null
  readonly groupKind: GroupKind
  readonly interval: DateInterval | null
  readonly splitBy: string | null
  readonly splitKind: 'none' | 'category'
  readonly dateField: string | null
  readonly from: string | null
  readonly to: string | null
  /** Buckets are computed in UTC on every engine (see the README for per-user time zones). */
  readonly timezone: 'UTC'
  /** Small-group suppression threshold for this resource, or null when off. */
  readonly minGroupSize: number | null
  /** How many cells were withheld (primary plus complementary suppression). */
  readonly suppressedCells: number
  /** True when a top N cut groups off into `__other__`. */
  readonly truncated: boolean
}

/**
 * The response body (`200 application/json`).
 *
 * @example
 * const { data, series, meta } = await response.json() as AggregateResult
 */
export interface AggregateResult {
  readonly data: readonly AggregateBucket[]
  readonly series: readonly AggregateSeries[]
  readonly meta: AggregateMeta
}

/**
 * An RFC 9457 problem, as every Strutvane endpoint returns on failure (spike 12's shape).
 *
 * @example
 * const problem: Problem = { type: 'about:blank', title: 'Invalid aggregate request', status: 422, code: 'invalid_aggregate', detail: '…', issues: [] }
 */
export interface Problem {
  readonly type: string
  readonly title: string
  readonly status: number
  readonly code: string
  readonly detail: string
  readonly issues?: readonly ProblemIssue[]
}

/**
 * One reason a request was refused, pointing at the parameter to fix.
 *
 * @example
 * const issue: ProblemIssue = { field: 'field', code: 'not_aggregatable', message: '"salary" cannot be summed here.' }
 */
export interface ProblemIssue {
  readonly field: string
  readonly code: string
  readonly message: string
}

/** Key of the only series when there is no `splitBy`. */
export const SINGLE_SERIES_KEY = 'value'
/** Key of the "everything outside the top N" group. */
export const OTHER_GROUP_KEY = '__other__'
/** Key of the single group when there is no `groupBy`. */
export const TOTAL_GROUP_KEY = '__total__'

/**
 * Server-side limits. They keep one request cheap (rate limits stop many requests; see the
 * README), and they are part of the contract so the UI can explain a refusal.
 *
 * @example
 * AGGREGATE_LIMITS.maxBuckets // 400: a bit more than a year of days
 */
export const AGGREGATE_LIMITS = {
  /** Most date buckets one answer may have (366 days fit, with room for alignment). */
  maxBuckets: 400,
  /** Largest top N for belongsTo groups. */
  maxLimit: 50,
  /** Default top N. */
  defaultLimit: 10,
  /** Most values in one `filter[x][in]` list. */
  maxInValues: 50,
  /** Longest filter value, in characters. */
  maxFilterValueLength: 200,
  /** Most filters per request. */
  maxFilters: 10,
  /** Default window when a date groupBy has no from/to, in buckets. */
  defaultBuckets: { day: 30, week: 12, month: 12 },
} as const

/**
 * Build the request URL for a query. The browser uses this; the server parses the same shape.
 *
 * Why `URLSearchParams`: it encodes `[`, `]`, `,` and non-ASCII the same way every time, so a
 * request built here is byte-identical to what the server tests send.
 *
 * @example
 * aggregateUrl('invoices', { metric: 'count', groupBy: 'status' })
 * // '/api/v1/invoices/aggregate?metric=count&groupBy=status'
 */
export function aggregateUrl(route: string, query: AggregateQuery, base = '/api/v1'): string {
  const params = new URLSearchParams()
  params.set('metric', query.metric)
  const optional: readonly (readonly [string, string | number | undefined])[] = [
    ['field', query.field],
    ['groupBy', query.groupBy],
    ['interval', query.interval],
    ['splitBy', query.splitBy],
    ['dateField', query.dateField],
    ['from', query.from],
    ['to', query.to],
    ['limit', query.limit],
  ]
  for (const [name, value] of optional) if (value !== undefined) params.set(name, String(value))
  for (const filter of query.filters ?? []) params.append(`filter[${filter.field}][${filter.op}]`, filter.value)
  return `${base}/${encodeURIComponent(route)}/aggregate?${params.toString()}`
}
