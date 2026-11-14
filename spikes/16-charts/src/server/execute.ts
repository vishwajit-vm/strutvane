/**
 * Run a validated plan and shape the rows into the contract's {@link AggregateResult}:
 * zero-filled buckets, one value per series, a top N with "other", rounding to the column's
 * scale, and small-group suppression.
 *
 * @module
 */
import { OTHER_GROUP_KEY, SINGLE_SERIES_KEY, TOTAL_GROUP_KEY, type AggregateBucket, type AggregateResult } from '../shared/aggregate-contract.ts'
import type { AggregatePlan } from './plan.ts'
import { COLUMNS, renderAggregate, renderTotals, type Dialect, type QueryScope, type RenderedSql } from './sql.ts'
import { suppressSmallGroups, type Cell } from './suppress.ts'
import { NONE_KEY } from './validate.ts'

/**
 * One result row as a driver returns it (column name → value).
 *
 * @example
 * const row: Row = { bucket: '2026-11-01', row_count: 12 }
 */
export type Row = Readonly<Record<string, unknown>>

/**
 * The tiny driver contract this spike needs. In the product this is the ORM's connection.
 *
 * @example
 * const executor: AggregateExecutor = { dialect: 'sqlite', all: async (statement) => db.prepare(statement.text).all(...statement.params) }
 */
export interface AggregateExecutor {
  readonly dialect: Dialect
  /**
   * Run one read statement. `tenant` is passed so PostgreSQL can set `app.tenant_id` for RLS in
   * the same transaction (the second layer, ADR-0007); other engines ignore it.
   */
  all(statement: RenderedSql, context: { readonly tenant: string | null }): Promise<readonly Row[]>
}

/** Sums and counts behind one cell, before the metric is applied. */
interface Totals {
  rows: number
  sum: number
  counted: number
}

/**
 * Execute a plan inside a scope and build the response body.
 *
 * @example
 * const result = await runAggregate(plan, scope, executor)
 * result.data[0] // { key: '2026-01-01', values: { value: 4 } }
 */
export async function runAggregate(plan: AggregatePlan, scope: QueryScope, executor: AggregateExecutor): Promise<AggregateResult> {
  const context = { tenant: scope.tenant?.id ?? null }
  const rows = await executor.all(renderAggregate(plan, scope, executor.dialect), context)
  const totals = new Map<string, Map<string, Totals>>()
  for (const row of rows) add(totals, groupKey(plan, row), seriesKey(plan, row), readTotals(row))

  let groupKeys = expectedGroupKeys(plan, totals)
  let truncated = false
  if (plan.group.kind === 'relation') {
    truncated = groupKeys.length > plan.group.limit
    groupKeys = groupKeys.slice(0, plan.group.limit)
    if (truncated) {
      const all = await executor.all(renderTotals(plan, scope, executor.dialect), context)
      totals.set(OTHER_GROUP_KEY, new Map([[SINGLE_SERIES_KEY, otherTotals(all[0], groupKeys, totals)]]))
      groupKeys = [...groupKeys, OTHER_GROUP_KEY]
    }
  }
  const seriesKeys = expectedSeriesKeys(plan, totals)
  const grid = groupKeys.map((group) => seriesKeys.map((series) => toCell(plan, totals.get(group)?.get(series))))
  const suppressedCells = plan.minGroupSize === null ? 0 : suppressSmallGroups(grid, plan.minGroupSize)
  return {
    data: groupKeys.map((key, index) => toBucket(key, seriesKeys, grid[index] ?? [])),
    series: seriesKeys.map((key) => ({ key })),
    meta: {
      resource: plan.route,
      metric: plan.metric,
      field: plan.field?.name ?? null,
      groupBy: plan.group.kind === 'none' ? null : plan.group.column.name,
      groupKind: plan.group.kind,
      interval: plan.group.kind === 'date' ? plan.group.interval : null,
      splitBy: plan.split.kind === 'none' ? null : plan.split.column.name,
      splitKind: plan.split.kind,
      dateField: plan.dateField,
      from: plan.from?.toISOString() ?? null,
      to: plan.to?.toISOString() ?? null,
      timezone: 'UTC',
      minGroupSize: plan.minGroupSize,
      suppressedCells,
      truncated,
    },
  }
}

function add(totals: Map<string, Map<string, Totals>>, group: string, series: string, value: Totals): void {
  const bySeries = totals.get(group) ?? new Map<string, Totals>()
  const existing = bySeries.get(series)
  // Two rows can land on one key (e.g. MySQL returning 1 and true for a boolean); merge them.
  bySeries.set(series, existing === undefined ? value : { rows: existing.rows + value.rows, sum: existing.sum + value.sum, counted: existing.counted + value.counted })
  totals.set(group, bySeries)
}

function readTotals(row: Row | undefined): Totals {
  return { rows: toNumber(row?.[COLUMNS.rows]), sum: toNumber(row?.[COLUMNS.sum]), counted: toNumber(row?.[COLUMNS.counted]) }
}

/** Drivers return numbers, bigints or numeric strings (PostgreSQL numeric); NULL sums are 0. */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string' && value.trim() !== '') return Number(value)
  return 0
}

/** The key of a row's group, normalised across engines. */
function groupKey(plan: AggregatePlan, row: Row): string {
  if (plan.group.kind === 'none') return TOTAL_GROUP_KEY
  return normaliseKey(row[COLUMNS.bucket], plan.group.kind === 'category' && plan.group.column.kind === 'boolean')
}

function seriesKey(plan: AggregatePlan, row: Row): string {
  if (plan.split.kind === 'none') return SINGLE_SERIES_KEY
  return normaliseKey(row[COLUMNS.series], plan.split.column.kind === 'boolean')
}

/** Booleans come back as true/false (PostgreSQL) or 1/0 (SQLite, MySQL): one key, `'true'`/`'false'`. */
function normaliseKey(value: unknown, isBoolean: boolean): string {
  if (value === null || value === undefined) return NONE_KEY
  if (isBoolean) return value === true || value === 1 || value === '1' || value === 't' ? 'true' : 'false'
  return typeof value === 'string' ? value : String(value)
}

/**
 * Which groups to show, in order: every date bucket and every enum option (zero-filled), or the
 * relation groups as ranked by SQL. NULLs ("None") come last when present.
 */
function expectedGroupKeys(plan: AggregatePlan, totals: ReadonlyMap<string, unknown>): string[] {
  const group = plan.group
  if (group.kind === 'none') return [TOTAL_GROUP_KEY]
  if (group.kind === 'relation') return [...totals.keys()]
  // Date keys outside the range can't occur (the range is a WHERE condition); NULL dates fail it.
  return withNone(group.keys, totals)
}

function expectedSeriesKeys(plan: AggregatePlan, totals: ReadonlyMap<string, ReadonlyMap<string, unknown>>): string[] {
  if (plan.split.kind === 'none') return [SINGLE_SERIES_KEY]
  const seen = new Map<string, true>()
  for (const bySeries of totals.values()) for (const key of bySeries.keys()) seen.set(key, true)
  return withNone(plan.split.keys, seen)
}

/** Known keys in schema order, plus `__none__` (and any unexpected value) when the data has it. */
function withNone(keys: readonly string[], present: ReadonlyMap<string, unknown>): string[] {
  const extra = [...present.keys()].filter((key) => !keys.includes(key)).sort((a, b) => (a === NONE_KEY ? 1 : b === NONE_KEY ? -1 : a.localeCompare(b)))
  return [...keys, ...extra]
}

/** "Other" = everything minus the top N, from the ungrouped totals of the same rows. */
function otherTotals(all: Row | undefined, top: readonly string[], totals: ReadonlyMap<string, ReadonlyMap<string, Totals>>): Totals {
  const whole = readTotals(all)
  for (const key of top) {
    const part = totals.get(key)?.get(SINGLE_SERIES_KEY)
    if (part === undefined) continue
    whole.rows -= part.rows
    whole.sum -= part.sum
    whole.counted -= part.counted
  }
  return whole
}

/** Apply the metric and round to the column's scale (sums) or two more places (averages). */
function toCell(plan: AggregatePlan, totals: Totals | undefined): Cell {
  const rows = totals?.rows ?? 0
  const scale = plan.field?.scale ?? 0
  let value: number | null
  if (plan.metric === 'count') value = rows
  else if (plan.metric === 'sum') value = round(totals?.sum ?? 0, scale)
  else value = totals === undefined || totals.counted === 0 ? null : round(totals.sum / totals.counted, scale + 2)
  // Suppression must count the rows a number is computed *from*. For sum and avg that is the rows
  // with a value (COUNT(field)), not COUNT(*): six rows of which five have a NULL amount make an
  // average that is one person's exact amount.
  return { rows: plan.metric === 'count' ? rows : (totals?.counted ?? 0), value, suppressed: false }
}

/** Round half away from zero to `places` decimals (SQLite sums decimals as floats: 0.1 + 0.2). */
function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.sign(value) * Math.round(Math.abs(value) * factor + Number.EPSILON) / factor
}

function toBucket(key: string, seriesKeys: readonly string[], cells: readonly Cell[]): AggregateBucket {
  const values: Record<string, number | null> = {}
  const suppressed: string[] = []
  seriesKeys.forEach((series, index) => {
    const cell = cells[index]
    values[series] = cell?.value ?? null
    if (cell?.suppressed === true) suppressed.push(series)
  })
  return suppressed.length === 0 ? { key, values } : { key, values, suppressed }
}
