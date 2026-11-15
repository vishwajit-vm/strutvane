/**
 * Strict validation of `GET /api/v1/<resource>/aggregate` parameters into an {@link AggregatePlan}.
 *
 * Rules (each has a test in `test/server/validate.test.ts`):
 * - **unknown parameters are refused**, never ignored (a typo like `groupby` would otherwise
 *   silently return the ungrouped total);
 * - every field must be in the resource's **allow-list** (`resolve.ts`), which never contains
 *   hidden, secret or tenant columns; error messages list only allowed names (F-13);
 * - every value is **parsed for its column type** before it gets near SQL;
 * - ranges are aligned to whole buckets and capped at {@link AGGREGATE_LIMITS}.maxBuckets;
 * - with small-group suppression on, **filters are refused** and from/to windows are widened to
 *   whole buckets. Any filter that can single out a group value lets a caller subtract a filtered
 *   total from an unfiltered one and recover a hidden cell (`filter[department][eq]=sales` returns
 *   the complementary partner on its own), so none is accepted.
 *
 * All problems are collected and returned together, so a developer fixes a request in one go.
 *
 * @module
 */
import { AGGREGATE_LIMITS, type AggregateMetric, type DateInterval, type ProblemIssue } from '../shared/aggregate-contract.ts'
import { isExposedField } from '../shared/exposure.ts'
import type { FieldMetadata, FilterOperator } from '../shared/metadata.ts'
import type { AggregateAllowList, ResolvedResourceCharts } from '../shared/resolve.ts'
import { addBuckets, bucketKeys, ceilToBucket, countBuckets, parseUtcDate, startOfBucket } from '../shared/dates.ts'
import type { AggregatePlan, Condition, PlanColumn, PlanGroup, PlanSplit, TypedValue } from './plan.ts'

const SCALAR_PARAMS = ['metric', 'field', 'groupBy', 'interval', 'splitBy', 'dateField', 'from', 'to', 'limit'] as const
const METRICS: readonly AggregateMetric[] = ['count', 'sum', 'avg']
const INTERVALS: readonly DateInterval[] = ['day', 'week', 'month']
const FILTER_KEY = /^filter\[([a-z_][a-z0-9_]*)\](?:\[([a-zA-Z]+)\])?$/
const INTEGER = /^-?\d{1,15}$/
const DECIMAL = /^-?\d{1,15}(\.\d{1,10})?$/
/** Group key used for NULL values of a category or relation (shown as "None"). */
export const NONE_KEY = '__none__'

/**
 * The outcome of validation: a plan, or every reason the request was refused.
 *
 * @example
 * const result = validateAggregateRequest(params, charts, { now: new Date(), tenantColumn: 'tenant_id' })
 * if (!result.ok) return problem(422, result.issues)
 */
export type ValidationResult = { readonly ok: true; readonly plan: AggregatePlan } | { readonly ok: false; readonly issues: readonly ProblemIssue[] }

/**
 * Context validation needs besides the parameters.
 *
 * @example
 * const context: ValidationContext = { now: new Date(), tenantColumn: 'tenant_id' }
 */
export interface ValidationContext {
  /** "Now", for default windows. Injected so tests are deterministic. */
  readonly now: Date
  readonly tenantColumn: string | false
}

/** Mutable state while one request is validated. */
interface Draft {
  readonly params: URLSearchParams
  readonly charts: ResolvedResourceCharts
  readonly allow: AggregateAllowList
  readonly context: ValidationContext
  readonly issues: ProblemIssue[]
}

/**
 * Validate the query string of an aggregate request against one resource's resolved charts.
 *
 * @example
 * validateAggregateRequest(new URLSearchParams('metric=count&groupBy=status'), invoicesCharts, { now, tenantColumn: 'tenant_id' })
 * // { ok: true, plan: { metric: 'count', group: { kind: 'category', … }, … } }
 */
export function validateAggregateRequest(params: URLSearchParams, charts: ResolvedResourceCharts, context: ValidationContext): ValidationResult {
  if (charts.allowList === null) {
    return { ok: false, issues: [{ field: 'resource', code: 'not_aggregatable', message: `${charts.resource.label.plural} can't be aggregated.` }] }
  }
  const draft: Draft = { params, charts, allow: charts.allowList, context, issues: [] }
  checkParameterNames(draft)
  const metric = readMetric(draft)
  const field = readField(draft, metric)
  const groupBy = readGroupBy(draft)
  const range = readRange(draft, groupBy)
  const group = buildGroup(draft, groupBy, range)
  const split = readSplit(draft, groupBy)
  const conditions = [...rangeConditions(range), ...readFilters(draft)]
  if (draft.issues.length > 0 || metric === undefined) return { ok: false, issues: draft.issues }
  return {
    ok: true,
    plan: {
      table: charts.resource.table,
      route: charts.resource.route,
      metric,
      ...(field === undefined ? {} : { field }),
      group,
      split,
      conditions,
      softDeletes: charts.resource.softDeletes,
      dateField: range?.column.name ?? null,
      from: range?.from ?? null,
      to: range?.to ?? null,
      minGroupSize: charts.minGroupSize,
    },
  }
}

/** Refuse unknown and repeated parameters. */
function checkParameterNames(draft: Draft): void {
  const seen = new Set<string>()
  for (const name of draft.params.keys()) {
    const known = (SCALAR_PARAMS as readonly string[]).includes(name)
    if (!known && !name.startsWith('filter[')) {
      draft.issues.push({ field: name, code: 'unknown_parameter', message: `"${name}" is not an aggregate parameter. Use: ${SCALAR_PARAMS.join(', ')}, filter[field][op].` })
    } else if (known && seen.has(name)) {
      draft.issues.push({ field: name, code: 'repeated_parameter', message: `"${name}" is given more than once. Send it once.` })
    }
    seen.add(name)
  }
}

function readMetric(draft: Draft): AggregateMetric | undefined {
  const value = draft.params.get('metric')
  const metric = METRICS.find((candidate) => candidate === value)
  if (metric === undefined) {
    draft.issues.push({ field: 'metric', code: value === null ? 'required' : 'invalid', message: `metric must be one of ${METRICS.join(', ')}.` })
  }
  return metric
}

/** count takes no field; sum and avg need an allow-listed numeric one. */
function readField(draft: Draft, metric: AggregateMetric | undefined): PlanColumn | undefined {
  const name = draft.params.get('field')
  if (metric === 'count') {
    if (name !== null) draft.issues.push({ field: 'field', code: 'not_allowed', message: 'count counts rows, so it takes no field. Remove field, or use metric=sum or avg.' })
    return undefined
  }
  if (metric === undefined) return undefined
  if (name === null || !draft.allow.numeric.has(name)) {
    draft.issues.push({
      field: 'field',
      code: name === null ? 'required' : 'not_aggregatable',
      message: `${metric} needs a numeric field${name === null ? '' : `, and "${name}" isn't one here`}. ${allowedList('Numeric fields', draft.allow.numeric)}`,
    })
    return undefined
  }
  return columnOf(draft, name)
}

/** Which kind of group, by the allow-list; `undefined` when absent or invalid. */
interface GroupChoice {
  readonly kind: 'date' | 'category' | 'relation'
  readonly column: PlanColumn
}

function readGroupBy(draft: Draft): GroupChoice | undefined {
  const name = draft.params.get('groupBy')
  if (name === null) return undefined
  const kind = draft.allow.date.has(name) ? 'date' : draft.allow.category.has(name) ? 'category' : draft.allow.relation.has(name) ? 'relation' : undefined
  if (kind === undefined) {
    draft.issues.push({ field: 'groupBy', code: 'not_groupable', message: `"${name}" can't be grouped by here. ${allowedList('Group fields', groupableNames(draft.allow))}` })
    return undefined
  }
  return { kind, column: columnOf(draft, name) }
}

/** A validated, aligned date range on one date column. */
interface Range {
  readonly column: PlanColumn
  readonly from: Date
  readonly to: Date
  readonly interval: DateInterval | undefined
}

/** `dateField`, `from`, `to` and `interval`, with defaults and bucket alignment. */
function readRange(draft: Draft, groupBy: GroupChoice | undefined): Range | undefined {
  const interval = readInterval(draft, groupBy)
  const dateName = draft.params.get('dateField') ?? (groupBy?.kind === 'date' ? groupBy.column.name : draft.allow.date.has('created_at') ? 'created_at' : null)
  if (dateName !== null && !draft.allow.date.has(dateName)) {
    draft.issues.push({ field: 'dateField', code: 'not_a_date', message: `"${dateName}" is not a date field here. ${allowedList('Date fields', draft.allow.date)}` })
    return undefined
  }
  if (groupBy?.kind === 'date' && dateName !== groupBy.column.name) {
    draft.issues.push({ field: 'dateField', code: 'conflict', message: 'When grouping by a date, from/to apply to that same date. Remove dateField.' })
    return undefined
  }
  const from = readDate(draft, 'from')
  const to = readDate(draft, 'to')
  const wantsRange = interval !== undefined || draft.params.has('from') || draft.params.has('to')
  if (!wantsRange || from === null || to === null) return undefined
  if (dateName === null) {
    draft.issues.push({ field: 'from', code: 'no_date_field', message: 'from/to need a date field, and this resource has no created_at. Add dateField.' })
    return undefined
  }
  return alignRange(draft, columnOf(draft, dateName), from, to, interval)
}

function readInterval(draft: Draft, groupBy: GroupChoice | undefined): DateInterval | undefined {
  const value = draft.params.get('interval')
  if (groupBy?.kind !== 'date') {
    if (value !== null) draft.issues.push({ field: 'interval', code: 'not_allowed', message: 'interval only applies when groupBy is a date field. Remove it.' })
    return undefined
  }
  const interval = INTERVALS.find((candidate) => candidate === value)
  if (interval === undefined) draft.issues.push({ field: 'interval', code: value === null ? 'required' : 'invalid', message: `Grouping by a date needs interval=${INTERVALS.join('|')}.` })
  return interval
}

/** `undefined` = absent (use the default); `null` = present but invalid (already reported). */
function readDate(draft: Draft, name: 'from' | 'to'): Date | undefined | null {
  const value = draft.params.get(name)
  if (value === null) return undefined
  const date = parseUtcDate(value)
  if (date === undefined) {
    draft.issues.push({ field: name, code: 'invalid_date', message: `${name} must be a UTC date (2026-11-14) or timestamp (2026-11-14T09:30:00Z); got "${value.slice(0, 40)}".` })
    return null
  }
  return date
}

/** Default window, bucket alignment, order and the bucket cap. */
function alignRange(draft: Draft, column: PlanColumn, from: Date | undefined, to: Date | undefined, interval: DateInterval | undefined): Range | undefined {
  const unit = interval ?? 'day'
  const defaultCount = AGGREGATE_LIMITS.defaultBuckets[unit]
  // Default end: the end of the current bucket, so "this month so far" is included.
  // With privacy on, an ungrouped window is widened to whole days too: two visible totals over
  // windows a second apart would otherwise subtract down to a single row.
  const align = interval !== undefined || draft.charts.minGroupSize !== null
  const end = to === undefined ? addBuckets(startOfBucket(draft.context.now, unit), unit, 1) : align ? ceilToBucket(to, unit) : to
  const start = from === undefined ? addBuckets(end, unit, -defaultCount) : align ? startOfBucket(from, unit) : from
  if (start >= end) {
    draft.issues.push({ field: 'to', code: 'empty_range', message: 'to must be after from (from is inclusive, to is exclusive).' })
    return undefined
  }
  if (interval !== undefined && countBuckets(start, end, interval, AGGREGATE_LIMITS.maxBuckets) > AGGREGATE_LIMITS.maxBuckets) {
    draft.issues.push({
      field: 'interval',
      code: 'too_many_buckets',
      message: `That range has more than ${AGGREGATE_LIMITS.maxBuckets} ${interval}s. Use a larger interval (week or month) or a shorter range.`,
    })
    return undefined
  }
  return { column, from: start, to: end, interval }
}

/** Turn the groupBy choice into a plan group (with all keys, for zero-filling). */
function buildGroup(draft: Draft, groupBy: GroupChoice | undefined, range: Range | undefined): PlanGroup {
  const limit = readLimit(draft, groupBy)
  if (groupBy === undefined) return { kind: 'none' }
  if (groupBy.kind === 'date') {
    return range?.interval === undefined ? { kind: 'none' } : { kind: 'date', column: groupBy.column, interval: range.interval, keys: bucketKeys(range.from, range.to, range.interval) }
  }
  if (groupBy.kind === 'category') return { kind: 'category', column: groupBy.column, keys: categoryKeys(fieldOf(draft, groupBy.column.name)) }
  return { kind: 'relation', column: groupBy.column, limit: limit ?? AGGREGATE_LIMITS.defaultLimit }
}

function readLimit(draft: Draft, groupBy: GroupChoice | undefined): number | undefined {
  const value = draft.params.get('limit')
  if (value === null) return undefined
  if (groupBy?.kind !== 'relation') {
    draft.issues.push({ field: 'limit', code: 'not_allowed', message: 'limit only applies when grouping by a related record (top N). Remove it.' })
    return undefined
  }
  const limit = Number(value)
  if (!/^\d{1,3}$/.test(value) || limit < 1 || limit > AGGREGATE_LIMITS.maxLimit) {
    draft.issues.push({ field: 'limit', code: 'invalid', message: `limit must be a whole number from 1 to ${AGGREGATE_LIMITS.maxLimit}.` })
    return undefined
  }
  return limit
}

/** splitBy: another allow-listed category, and never with a top N (its "other" can't be split). */
function readSplit(draft: Draft, groupBy: GroupChoice | undefined): PlanSplit {
  const name = draft.params.get('splitBy')
  if (name === null) return { kind: 'none' }
  if (!draft.allow.category.has(name) || name === groupBy?.column.name) {
    draft.issues.push({ field: 'splitBy', code: 'not_splittable', message: `splitBy must be another enum or yes/no field. ${allowedList('Split fields', draft.allow.category)}` })
    return { kind: 'none' }
  }
  if (groupBy?.kind === 'relation') {
    draft.issues.push({ field: 'splitBy', code: 'not_allowed', message: 'splitBy can be combined with a date or category groupBy, not with a top N of related records.' })
    return { kind: 'none' }
  }
  return { kind: 'category', column: columnOf(draft, name), keys: categoryKeys(fieldOf(draft, name)) }
}

/** `from <= date < to` on the range column. */
function rangeConditions(range: Range | undefined): Condition[] {
  if (range === undefined) return []
  const value = (date: Date): TypedValue => (range.column.kind === 'date' ? { type: 'date', value: date.toISOString().slice(0, 10) } : { type: 'timestamp', value: date })
  return [
    { kind: 'compare', column: range.column.name, op: '>=', value: value(range.from) },
    { kind: 'compare', column: range.column.name, op: '<', value: value(range.to) },
  ]
}

/** Every `filter[field][op]=value`, parsed and checked. */
function readFilters(draft: Draft): Condition[] {
  const entries = [...draft.params.entries()].filter(([key]) => key.startsWith('filter['))
  if (entries.length > 0 && draft.charts.minGroupSize !== null) {
    draft.issues.push({
      field: 'filter',
      code: 'not_allowed_with_privacy',
      message: `${draft.charts.resource.label.plural} hide groups smaller than ${draft.charts.minGroupSize}, so filters are off: a filtered total subtracted from an unfiltered one would reveal a hidden group. Use groupBy instead.`,
    })
    return []
  }
  if (entries.length > AGGREGATE_LIMITS.maxFilters) {
    draft.issues.push({ field: 'filter', code: 'too_many_filters', message: `At most ${AGGREGATE_LIMITS.maxFilters} filters per request.` })
    return []
  }
  return entries.flatMap(([key, value]) => readFilter(draft, key, value))
}

function readFilter(draft: Draft, key: string, value: string): Condition[] {
  const match = FILTER_KEY.exec(key)
  const name = match?.[1]
  const op = (match?.[2] ?? 'eq') as FilterOperator
  const field = name === undefined ? undefined : filterableField(draft, name)
  if (name === undefined || field === undefined) {
    draft.issues.push({ field: key, code: 'not_filterable', message: `"${name ?? key}" can't be filtered here. ${allowedList('Filterable fields', filterableNames(draft))}` })
    return []
  }
  if (!field.filterOperators.includes(op) || (draft.charts.minGroupSize !== null && op !== 'eq' && op !== 'in')) {
    const ops = draft.charts.minGroupSize === null ? field.filterOperators : field.filterOperators.filter((candidate) => candidate === 'eq' || candidate === 'in')
    draft.issues.push({ field: key, code: 'invalid_operator', message: `"${op}" can't be used on ${name}. Use: ${ops.join(', ')}.` })
    return []
  }
  if (value.length > AGGREGATE_LIMITS.maxFilterValueLength) {
    draft.issues.push({ field: key, code: 'too_long', message: `Filter values are at most ${AGGREGATE_LIMITS.maxFilterValueLength} characters.` })
    return []
  }
  const condition = filterCondition(field, op, value)
  if (condition === undefined) draft.issues.push({ field: key, code: 'invalid_value', message: `"${value.slice(0, 40)}" is not a valid ${field.kind} value for ${name}${field.options === undefined ? '' : ` (one of ${field.options.join(', ')})`}.` })
  return condition === undefined ? [] : [condition]
}

/** Build the condition for one filter, or `undefined` when the value doesn't parse. */
function filterCondition(field: FieldMetadata, op: FilterOperator, raw: string): Condition | undefined {
  const column = field.name
  switch (op) {
    case 'null':
      return raw === 'true' || raw === 'false' ? { kind: 'null', column, isNull: raw === 'true' } : undefined
    case 'contains':
    case 'startsWith': {
      if (raw === '') return undefined
      // '!' is the escape character (see sql.ts): MySQL refuses ESCAPE '\' in every sql_mode.
      const escaped = raw.replace(/[!%_]/g, (character) => `!${character}`)
      return { kind: 'like', column, pattern: op === 'contains' ? `%${escaped}%` : `${escaped}%` }
    }
    case 'in': {
      const parts = raw.split(',')
      if (parts.length > AGGREGATE_LIMITS.maxInValues) return undefined
      const values = parts.map((part) => parseValue(field, part))
      return values.every((value): value is TypedValue => value !== undefined) ? { kind: 'in', column, values } : undefined
    }
    case 'ne': {
      const value = parseValue(field, raw)
      return value === undefined ? undefined : { kind: 'distinct', column, value }
    }
    default: {
      const value = parseValue(field, raw)
      const sql = ({ eq: '=', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const)[op]
      return value === undefined ? undefined : { kind: 'compare', column, op: sql, value }
    }
  }
}

/** Parse one filter value for the field's type; `undefined` when it isn't one. */
export function parseValue(field: FieldMetadata, raw: string): TypedValue | undefined {
  switch (field.cast) {
    case 'integer':
      return INTEGER.test(raw) ? { type: 'integer', value: Number(raw) } : undefined
    case 'number':
    case 'decimal':
      return DECIMAL.test(raw) ? { type: 'decimal', value: raw } : undefined
    case 'boolean':
      return raw === 'true' || raw === 'false' ? { type: 'boolean', value: raw === 'true' } : undefined
    case 'date':
      return parseUtcDate(raw) !== undefined && raw.length === 10 ? { type: 'date', value: raw } : undefined
    case 'datetime': {
      const date = parseUtcDate(raw)
      return date === undefined ? undefined : { type: 'timestamp', value: date }
    }
    case 'json':
      return undefined
    case 'string':
      // Enums only accept their options: a misspelt status is a mistake worth reporting.
      if (field.options !== undefined && !field.options.includes(raw)) return undefined
      // Control characters never belong in a filter; refusing them keeps logs and SQL clean.
      return /[\u0000-\u001f]/.test(raw) ? undefined : { type: 'text', value: raw }
  }
}

/** A field filters may use: exposed, not the tenant column, and (with privacy on) a group field. */
function filterableField(draft: Draft, name: string): FieldMetadata | undefined {
  const field = draft.charts.resource.fields.find((candidate) => candidate.name === name)
  if (field === undefined || !isExposedField(field) || field.name === draft.context.tenantColumn || field.filterOperators.length === 0) return undefined
  if (draft.charts.minGroupSize !== null && !draft.allow.category.has(name)) return undefined
  return field
}

function filterableNames(draft: Draft): string[] {
  return draft.charts.resource.fields.map((field) => field.name).filter((name) => filterableField(draft, name) !== undefined)
}

function groupableNames(allow: AggregateAllowList): string[] {
  return [...allow.date, ...allow.category, ...allow.relation.keys()]
}

/** "Numeric fields: total, tax." or a hint that there are none. Lists allowed names only (F-13). */
function allowedList(label: string, names: Iterable<string>): string {
  const list = [...names]
  return list.length === 0 ? `This resource has no ${label.toLowerCase()}.` : `${label}: ${list.join(', ')}.`
}

/** Every key a category can take: enum options in schema order, or true/false. */
function categoryKeys(field: FieldMetadata | undefined): string[] {
  if (field?.kind === 'boolean') return ['true', 'false']
  return [...(field?.options ?? [])]
}

function fieldOf(draft: Draft, name: string): FieldMetadata | undefined {
  return draft.charts.resource.fields.find((field) => field.name === name)
}

/** The plan column for a field that the allow-list already vouched for. */
function columnOf(draft: Draft, name: string): PlanColumn {
  const field = fieldOf(draft, name)
  return { name, kind: field?.kind ?? 'string', ...(field?.scale === undefined ? {} : { scale: field.scale }) }
}
