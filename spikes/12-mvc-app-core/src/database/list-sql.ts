/**
 * Build the SQL for a list request (search, filters, extra constraints, soft deletes, sort,
 * pagination) for any {@link Dialect}.
 *
 * Two rules make it injection-proof: identifiers come only from metadata (which came from
 * validated migrations), and every value is a bound parameter. The WHERE clause is written
 * strictly left to right, so the same code is correct for MySQL's positional `?`.
 */
import { StrutvaneError } from '../support/errors.ts'
import { escapeLike, SqlParams, type Dialect, type SqlValue } from './dialect.ts'
import type { ListFilter, ListRequest } from './list-query.ts'
import type { FieldMetadata, ResourceMetadata } from './metadata.ts'

/**
 * An extra condition a controller adds to a list, for example "only published posts, or my own".
 * Plain data, so controllers never write SQL.
 *
 * @example
 * const visible: Constraint = { anyOf: [{ column: 'status', equals: 'published' }, { column: 'author_id', equals: 7 }] }
 */
export type Constraint = { readonly column: string; readonly equals: SqlValue } | { readonly anyOf: readonly Constraint[] }

/**
 * The statements for one list request.
 *
 * @example
 * const { count, select } = buildListSql(posts, request, [], sqliteDialect)
 */
export interface ListSql {
  readonly count: { readonly sql: string; readonly params: readonly SqlValue[] }
  readonly select: { readonly sql: string; readonly params: readonly SqlValue[] }
}

/**
 * Build the count and page queries.
 *
 * @example
 * buildListSql(posts, { page: 2, perPage: 10, sort: [], filters: [] }, [], mysqlDialect).select.sql
 * // 'SELECT * FROM `posts` WHERE `deleted_at` IS NULL ORDER BY `id` ASC LIMIT ? OFFSET ?'
 */
export function buildListSql(resource: ResourceMetadata, request: ListRequest, constraints: readonly Constraint[], dialect: Dialect): ListSql {
  const table = dialect.quote(resource.table)
  const countParams = new SqlParams(dialect)
  const countWhere = whereClause(resource, request, constraints, dialect, countParams)
  const selectParams = new SqlParams(dialect)
  const selectWhere = whereClause(resource, request, constraints, dialect, selectParams)
  const order = orderClause(resource, request, dialect)
  const limit = selectParams.add(request.perPage)
  const offset = selectParams.add((request.page - 1) * request.perPage)
  return {
    count: { sql: `SELECT COUNT(*) AS ${dialect.quote('total')} FROM ${table}${countWhere}`, params: countParams.values },
    select: { sql: `SELECT * FROM ${table}${selectWhere} ORDER BY ${order} LIMIT ${limit} OFFSET ${offset}`, params: selectParams.values },
  }
}

function whereClause(resource: ResourceMetadata, request: ListRequest, constraints: readonly Constraint[], dialect: Dialect, params: SqlParams): string {
  const conditions: string[] = []
  if (resource.softDeletes) conditions.push(`${dialect.quote('deleted_at')} IS NULL`)
  for (const constraint of constraints) conditions.push(constraintSql(resource, constraint, dialect, params))
  if (request.search !== undefined) {
    const search = searchSql(resource, request.search, dialect, params)
    if (search !== undefined) conditions.push(search)
  }
  for (const filter of request.filters) conditions.push(filterSql(filter, dialect, params))
  return conditions.length === 0 ? '' : ` WHERE ${conditions.join(' AND ')}`
}

function constraintSql(resource: ResourceMetadata, constraint: Constraint, dialect: Dialect, params: SqlParams): string {
  if ('anyOf' in constraint) {
    if (constraint.anyOf.length === 0) return '1 = 0' // "any of nothing" matches nothing: fail closed
    return `(${constraint.anyOf.map((inner) => constraintSql(resource, inner, dialect, params)).join(' OR ')})`
  }
  if (!resource.fields.some((field) => field.name === constraint.column)) {
    throw new StrutvaneError('UNKNOWN_CONSTRAINT_COLUMN', `A list constraint uses "${constraint.column}", which ${resource.table} doesn't have.`, `Use one of: ${resource.fields.map((field) => field.name).join(', ')}.`)
  }
  if (constraint.equals === null) return `${dialect.quote(constraint.column)} IS NULL`
  return `${dialect.quote(constraint.column)} = ${params.add(constraint.equals)}`
}

function searchSql(resource: ResourceMetadata, term: string, dialect: Dialect, params: SqlParams): string | undefined {
  const parts: string[] = []
  for (const field of resource.fields) {
    if (field.hidden || field.searchable === false) continue
    if (field.searchable === 'text') parts.push(dialect.likeInsensitive(dialect.quote(field.name), params.add(`%${escapeLike(term)}%`)))
    else if (/^\d+$/.test(term)) parts.push(`${dialect.quote(field.name)} = ${params.add(Number(term))}`)
  }
  return parts.length === 0 ? undefined : `(${parts.join(' OR ')})`
}

function filterSql(filter: ListFilter, dialect: Dialect, params: SqlParams): string {
  const column = dialect.quote(filter.field.name)
  const value = filter.value
  switch (filter.operator) {
    case 'null':
      return value === 1 ? `${column} IS NULL` : `${column} IS NOT NULL`
    case 'in': {
      const list = Array.isArray(value) ? value : [value]
      return `${column} IN (${list.map((item) => params.add(forColumn(filter.field, item, dialect))).join(', ')})`
    }
    case 'contains':
      return dialect.likeInsensitive(column, params.add(`%${escapeLike(String(value))}%`))
    case 'startsWith':
      return dialect.likeInsensitive(column, params.add(`${escapeLike(String(value))}%`))
    default:
      return `${column} ${COMPARISON[filter.operator]} ${params.add(forColumn(filter.field, scalar(value), dialect))}`
  }
}

const COMPARISON = { eq: '=', ne: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' } as const

function scalar(value: SqlValue | readonly SqlValue[]): SqlValue {
  return Array.isArray(value) ? (value[0] ?? null) : (value as SqlValue)
}

/** Datetimes arrive as ISO text; each engine stores them in its own text form. */
function forColumn(field: FieldMetadata, value: SqlValue, dialect: Dialect): SqlValue {
  if (field.cast === 'datetime' && typeof value === 'string') return dialect.formatDateTime(new Date(value))
  return value
}

function orderClause(resource: ResourceMetadata, request: ListRequest, dialect: Dialect): string {
  const terms = request.sort.map((term) => dialect.orderBy(dialect.quote(term.field), term.direction))
  // The primary key as a final tie-breaker makes pages stable: no row appears on two pages.
  if (!request.sort.some((term) => term.field === resource.primaryKey)) terms.push(`${dialect.quote(resource.primaryKey)} ASC`)
  return terms.join(', ')
}
