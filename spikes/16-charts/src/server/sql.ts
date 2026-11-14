/**
 * Turning an {@link AggregatePlan} into one SQL statement per dialect.
 *
 * - **Values are always bound**, never spliced into the text. Identifiers come only from the
 *   metadata and are additionally checked against a strict pattern before quoting.
 * - **Date buckets differ per engine** and are the reason this module exists (see
 *   {@link bucketExpression}). Every engine produces the same `YYYY-MM-DD` key for the same bucket,
 *   which the tests prove on SQLite and PostgreSQL (PGlite) with the same rows.
 * - **The tenant check runs on the condition list before rendering** (spike 11's choke point):
 *   a scoped table without `tenant = <active tenant>` as a top-level AND never becomes SQL.
 *
 * @module
 */
import type { DateInterval } from '../shared/aggregate-contract.ts'
import type { AggregatePlan, Condition, PlanColumn, TypedValue } from './plan.ts'

/**
 * The SQL engines Strutvane supports. MySQL is the default app database; this spike executes
 * SQLite and PostgreSQL (PGlite) and checks MySQL's SQL text (see the README).
 *
 * @example
 * const dialect: Dialect = 'mysql'
 */
export type Dialect = 'sqlite' | 'postgres' | 'mysql'

/**
 * A rendered statement: text with placeholders, and the values in order.
 *
 * @example
 * const statement: RenderedSql = { text: 'SELECT COUNT(*) AS row_count FROM "invoices" AS t WHERE t."tenant_id" = $1', params: ['0190…'] }
 */
export interface RenderedSql {
  readonly text: string
  readonly params: readonly SqlParam[]
}

/**
 * A bind parameter value, after dialect conversion.
 *
 * @example
 * const param: SqlParam = 1 // `true` on SQLite and MySQL
 */
export type SqlParam = string | number | boolean | null

/**
 * The tenancy and policy part of a query, added on top of the plan's own conditions.
 *
 * @example
 * const scope: QueryScope = { conditions: [{ kind: 'tenant', column: 'tenant_id', tenant: tenantA }], tenant: { column: 'tenant_id', id: tenantA } }
 */
export interface QueryScope {
  readonly conditions: readonly Condition[]
  /** Set when the table is tenant-scoped: the check below demands a matching condition. */
  readonly tenant: { readonly column: string; readonly id: string } | null
}

/**
 * A scoped table would be queried without its tenant condition. Always a bug: refuse, don't leak.
 *
 * @example
 * throw new TenantScopeMissingError('invoices')
 */
export class TenantScopeMissingError extends Error {
  override readonly name = 'TenantScopeMissingError'
  readonly code = 'TENANT_SCOPE_MISSING'

  constructor(table: string) {
    super(`Refusing to run an aggregate on "${table}" without "tenant = active tenant" as a top-level AND condition. This is a bug in the aggregate compiler or a custom scope; nothing was queried.`)
  }
}

/**
 * Thrown for an identifier that isn't a plain snake_case name. Metadata never produces one, so
 * this is defence in depth against a damaged resources.json.
 *
 * @example
 * quoteIdentifier('invoices; DROP TABLE x', 'sqlite') // throws UnsafeIdentifierError
 */
export class UnsafeIdentifierError extends Error {
  override readonly name = 'UnsafeIdentifierError'
}

const IDENTIFIER = /^[a-z_][a-z0-9_]{0,62}$/

/** Column aliases of the result set (none is a reserved word on any engine). */
export const COLUMNS = { bucket: 'bucket', series: 'series', rows: 'row_count', sum: 'value_sum', counted: 'value_count' } as const

/**
 * Quote an identifier for a dialect, after checking it is a plain name.
 *
 * @example
 * quoteIdentifier('created_at', 'mysql') // '`created_at`'
 */
export function quoteIdentifier(name: string, dialect: Dialect): string {
  if (!IDENTIFIER.test(name)) throw new UnsafeIdentifierError(`"${name}" is not a safe SQL identifier. Regenerate resources.json with \`node strut migrate\`.`)
  return dialect === 'mysql' ? `\`${name}\`` : `"${name}"`
}

/**
 * The expression that turns a date or timestamp column into its bucket key, `YYYY-MM-DD` of the
 * bucket's first day, in UTC.
 *
 * Per engine:
 * - **SQLite** stores timestamps as ISO text (spike 11), so `strftime` reads them directly. Weeks:
 *   `'weekday 0'` jumps forward to Sunday (or stays), then `'-6 days'` lands on that week's Monday.
 * - **PostgreSQL**: `date_trunc('week')` is ISO (Monday). Timestamps are `timestamptz`, so they are
 *   converted `AT TIME ZONE 'UTC'` first; otherwise the *session* time zone decides the day.
 *   Without it, `2026-10-01T00:00Z` lands in **September** for a session in Los Angeles (tested).
 *   Plain `date` columns are cast to `timestamp` (without zone): `date_trunc` on a `date` goes
 *   through `timestamptz` in the session zone and only comes out right because `to_char` uses the
 *   same zone, an accident not worth relying on.
 * - **MySQL**: no `date_trunc`; `DATE_FORMAT` for day/month, and Monday via `WEEKDAY()` (0 =
 *   Monday). `WEEK()` is avoided: its default mode starts weeks on Sunday. The ORM pins the session
 *   `time_zone` to `+00:00` (spike 11), which is what makes `DATETIME` values UTC.
 *
 * @example
 * bucketExpression({ name: 'created_at', kind: 'timestamp' }, 'month', 'postgres')
 * // `to_char(date_trunc('month', t."created_at" AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
 */
export function bucketExpression(column: PlanColumn, interval: DateInterval, dialect: Dialect): string {
  const ref = `t.${quoteIdentifier(column.name, dialect)}`
  switch (dialect) {
    case 'sqlite':
      if (interval === 'day') return `strftime('%Y-%m-%d', ${ref})`
      if (interval === 'week') return `strftime('%Y-%m-%d', ${ref}, 'weekday 0', '-6 days')`
      return `strftime('%Y-%m-01', ${ref})`
    case 'postgres': {
      const source = column.kind === 'date' ? `${ref}::timestamp` : `${ref} AT TIME ZONE 'UTC'`
      return `to_char(date_trunc('${interval}', ${source}), 'YYYY-MM-DD')`
    }
    case 'mysql':
      if (interval === 'day') return `DATE_FORMAT(${ref}, '%Y-%m-%d')`
      if (interval === 'week') return `DATE_FORMAT(DATE_SUB(DATE(${ref}), INTERVAL WEEKDAY(${ref}) DAY), '%Y-%m-%d')`
      return `DATE_FORMAT(${ref}, '%Y-%m-01')`
  }
}

/**
 * Render the main aggregate statement.
 *
 * Shape: `SELECT <bucket>, <series>, COUNT(*), SUM(f), COUNT(f) FROM t WHERE … GROUP BY …`, plus
 * `ORDER BY <metric> DESC LIMIT n+1` for a top N (one extra row tells us whether "other" exists).
 * Sums and counts (not `AVG`) are selected so averages can be combined exactly, for "other" and
 * for complementary suppression.
 *
 * @example
 * renderAggregate(plan, scope, 'sqlite').text
 * // 'SELECT t."status" AS bucket, COUNT(*) AS row_count FROM "invoices" AS t WHERE t."tenant_id" = ? … GROUP BY t."status"'
 */
export function renderAggregate(plan: AggregatePlan, scope: QueryScope, dialect: Dialect): RenderedSql {
  const params: SqlParam[] = []
  const groupExpressions = [groupExpression(plan, dialect), splitExpression(plan, dialect)].filter((expression): expression is string => expression !== undefined)
  const select = [
    ...groupExpressions.map((expression, index) => `${expression} AS ${index === 0 && plan.group.kind !== 'none' ? COLUMNS.bucket : COLUMNS.series}`),
    `COUNT(*) AS ${COLUMNS.rows}`,
    ...measureColumns(plan, dialect),
  ]
  const where = renderWhere(plan, scope, dialect, params)
  let text = `SELECT ${select.join(', ')} FROM ${quoteIdentifier(plan.table, dialect)} AS t${where}`
  if (groupExpressions.length > 0) text += ` GROUP BY ${groupExpressions.join(', ')}`
  if (plan.group.kind === 'relation') {
    params.push(plan.group.limit + 1)
    // PostgreSQL sorts NULL first in DESC order; SQLite and MySQL sort it last. Say it explicitly
    // so a related record with only NULL amounts never takes a top-N slot on PostgreSQL.
    const nullsLast = dialect === 'postgres' ? ' NULLS LAST' : ''
    text += ` ORDER BY ${rankExpression(plan, dialect)} DESC${nullsLast}, ${groupExpressions[0] ?? '1'} ASC LIMIT ${placeholder(dialect, params.length)}`
  }
  return { text, params }
}

/**
 * Render the ungrouped totals of the same rows (used to compute "other" for a top N).
 *
 * @example
 * renderTotals(plan, scope, 'postgres').text // 'SELECT COUNT(*) AS row_count, … WHERE …'
 */
export function renderTotals(plan: AggregatePlan, scope: QueryScope, dialect: Dialect): RenderedSql {
  const params: SqlParam[] = []
  const where = renderWhere(plan, scope, dialect, params)
  return { text: `SELECT ${[`COUNT(*) AS ${COLUMNS.rows}`, ...measureColumns(plan, dialect)].join(', ')} FROM ${quoteIdentifier(plan.table, dialect)} AS t${where}`, params }
}

/**
 * The choke point (spike 11, F-05): a tenant-scoped table must carry its tenant condition as a
 * top-level AND, for the active tenant. Conditions are a flat AND list, so "top-level" is simply
 * "in the list".
 *
 * @example
 * assertTenantScoped('invoices', conditions, { column: 'tenant_id', id: tenantA }) // throws when missing
 */
export function assertTenantScoped(table: string, conditions: readonly Condition[], tenant: QueryScope['tenant']): void {
  if (tenant === null) return
  const scoped = conditions.some((condition) => condition.kind === 'tenant' && condition.column === tenant.column && condition.tenant === tenant.id)
  if (!scoped) throw new TenantScopeMissingError(table)
}

/**
 * All conditions (scope first, then the plan's), after the tenant check, as ` WHERE a AND b`, or
 * `''` when there are none (a global table with no filters; `WHERE` alone is a syntax error).
 */
function renderWhere(plan: AggregatePlan, scope: QueryScope, dialect: Dialect, params: SqlParam[]): string {
  const conditions = [...scope.conditions, ...plan.conditions, ...(plan.softDeletes ? [{ kind: 'null', column: 'deleted_at', isNull: true } as const] : [])]
  assertTenantScoped(plan.table, conditions, scope.tenant)
  return conditions.length === 0 ? '' : ` WHERE ${conditions.map((condition) => renderCondition(condition, dialect, params)).join(' AND ')}`
}

function renderCondition(condition: Condition, dialect: Dialect, params: SqlParam[]): string {
  const ref = `t.${quoteIdentifier(condition.column, dialect)}`
  const bind = (value: SqlParam): string => {
    params.push(value)
    return placeholder(dialect, params.length)
  }
  switch (condition.kind) {
    case 'tenant':
      return `${ref} = ${bind(condition.tenant)}`
    case 'compare':
      return `${ref} ${condition.op} ${bind(toParam(condition.value, dialect))}`
    case 'distinct': {
      // NULL-safe "not equal": a NULL row is different from any value.
      const value = bind(toParam(condition.value, dialect))
      if (dialect === 'postgres') return `${ref} IS DISTINCT FROM ${value}`
      return dialect === 'mysql' ? `NOT (${ref} <=> ${value})` : `${ref} IS NOT ${value}`
    }
    case 'in':
      return `${ref} IN (${condition.values.map((value) => bind(toParam(value, dialect))).join(', ')})`
    case 'null':
      return `${ref} IS ${condition.isNull ? '' : 'NOT '}NULL`
    case 'like':
      // Case rules differ: SQLite LIKE ignores ASCII case, PostgreSQL LIKE doesn't (ILIKE would),
      // MySQL follows the column collation (binary on identifier-like columns). See README.
      // The escape character is '!', not a backslash: on MySQL 8.4, ESCAPE '\' is a syntax error with
      // the default sql_mode and "Incorrect arguments to ESCAPE" with NO_BACKSLASH_ESCAPES.
      return `${ref} LIKE ${bind(condition.pattern)} ESCAPE '!'`
  }
}

/** Convert a typed value into the bind parameter each driver expects. */
export function toParam(value: TypedValue, dialect: Dialect): SqlParam {
  switch (value.type) {
    case 'boolean':
      // SQLite and MySQL store booleans as 0/1 integers; PostgreSQL has a real boolean.
      return dialect === 'postgres' ? value.value : value.value ? 1 : 0
    case 'timestamp':
      // SQLite: the ORM's canonical ISO text, so text comparison orders correctly. MySQL DATETIME
      // literals take no "Z"; the session time zone is pinned to UTC. PostgreSQL parses ISO.
      return dialect === 'mysql' ? value.value.toISOString().replace('T', ' ').replace('Z', '') : value.value.toISOString()
    case 'decimal':
      // Exact text for PostgreSQL's numeric; a number elsewhere (SQLite compares REAL with REAL).
      return dialect === 'postgres' ? value.value : Number(value.value)
    default:
      return value.value
  }
}

function placeholder(dialect: Dialect, position: number): string {
  return dialect === 'postgres' ? `$${position}` : '?'
}

function groupExpression(plan: AggregatePlan, dialect: Dialect): string | undefined {
  const group = plan.group
  if (group.kind === 'none') return undefined
  if (group.kind === 'date') return bucketExpression(group.column, group.interval, dialect)
  return `t.${quoteIdentifier(group.column.name, dialect)}`
}

function splitExpression(plan: AggregatePlan, dialect: Dialect): string | undefined {
  return plan.split.kind === 'none' ? undefined : `t.${quoteIdentifier(plan.split.column.name, dialect)}`
}

function measureColumns(plan: AggregatePlan, dialect: Dialect): string[] {
  if (plan.field === undefined) return []
  const ref = `t.${quoteIdentifier(plan.field.name, dialect)}`
  return [`SUM(${ref}) AS ${COLUMNS.sum}`, `COUNT(${ref}) AS ${COLUMNS.counted}`]
}

/** What a top N is ranked by: rows, the sum, or the average. */
function rankExpression(plan: AggregatePlan, dialect: Dialect): string {
  if (plan.field === undefined || plan.metric === 'count') return 'COUNT(*)'
  const ref = `t.${quoteIdentifier(plan.field.name, dialect)}`
  return plan.metric === 'sum' ? `SUM(${ref})` : `AVG(${ref})`
}
