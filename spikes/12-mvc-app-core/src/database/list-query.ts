/**
 * Parse and validate a list request against resource metadata, in the format spike 10 defined
 * (and spike 14's UI calls):
 *
 *   `?page=2&perPage=20&search=hello&sort=-created_at,title&filter[status]=published&filter[author_id][in]=1,2`
 *
 * Every field name and operator is checked against the metadata whitelist before it can get near
 * SQL. Unknown ones are a 422 that lists what *is* allowed, so a typo is easy to fix.
 */
import type { Issue } from '../support/issue.ts'
import type { SqlValue } from './dialect.ts'
import type { FieldMetadata, FilterOperator, ResourceMetadata } from './metadata.ts'

/**
 * One validated filter.
 *
 * @example
 * const filter: ListFilter = { field: statusField, operator: 'eq', value: 'published' }
 */
export interface ListFilter {
  readonly field: FieldMetadata
  readonly operator: FilterOperator
  readonly value: SqlValue | readonly SqlValue[]
}

/**
 * A validated list request.
 *
 * @example
 * const request: ListRequest = { page: 1, perPage: 15, sort: [{ field: 'created_at', direction: 'desc' }], filters: [] }
 */
export interface ListRequest {
  readonly page: number
  readonly perPage: number
  readonly search?: string
  readonly sort: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[]
  readonly filters: readonly ListFilter[]
}

/** A big page is a slow page: 100 rows is plenty for any screen. */
export const MAX_PER_PAGE = 100
/** Long search terms are almost always abuse (they make LIKE expensive). */
export const MAX_SEARCH_LENGTH = 200
/** Sorting by more than three fields is never what a person meant. */
const MAX_SORT_FIELDS = 3
/** `in` lists longer than this are refused, to keep parameter lists bounded. */
const MAX_IN_VALUES = 100
const FILTER_KEY = /^filter\[([a-z0-9_]+)\](?:\[([a-zA-Z]+)\])?$/

/**
 * Validate a list query. Returns the request, or every issue found (not just the first).
 *
 * @example
 * parseListQuery(posts, new URLSearchParams('page=2&sort=-title'))
 */
export function parseListQuery(resource: ResourceMetadata, query: URLSearchParams): { ok: true; request: ListRequest } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = []
  const page = positiveInteger(query.get('page'), 1, 'page', 'Page', Number.MAX_SAFE_INTEGER, issues)
  const perPage = positiveInteger(query.get('perPage'), resource.perPage, 'perPage', 'Page size', MAX_PER_PAGE, issues)
  const search = query.get('search')?.trim() ?? ''
  if (search.length > MAX_SEARCH_LENGTH) issues.push({ field: 'search', code: 'too_long', message: `Search terms can be at most ${MAX_SEARCH_LENGTH} characters.` })
  const sort = parseSort(resource, query.get('sort') ?? resource.defaultSort, issues)
  const filters = parseFilters(resource, query, issues)
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, request: { page, perPage, sort, filters, ...(search === '' ? {} : { search }) } }
}

function positiveInteger(raw: string | null, fallback: number, field: string, label: string, max: number, issues: Issue[]): number {
  if (raw === null) return fallback
  if (/^\d+$/.test(raw) && Number(raw) >= 1 && Number(raw) <= max) return Number(raw)
  issues.push({ field, code: 'invalid_integer', message: `${label} must be a whole number from 1 to ${max}.` })
  return fallback
}

function parseSort(resource: ResourceMetadata, raw: string, issues: Issue[]): ListRequest['sort'] {
  const parts = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0)
  if (parts.length > MAX_SORT_FIELDS) {
    issues.push({ field: 'sort', code: 'too_many', message: `Sort by at most ${MAX_SORT_FIELDS} fields.` })
    return []
  }
  const sortable = resource.fields.filter((field) => field.sortable && !field.hidden).map((field) => field.name)
  const sort: { field: string; direction: 'asc' | 'desc' }[] = []
  for (const part of parts) {
    const descending = part.startsWith('-')
    const name = descending ? part.slice(1) : part
    if (sortable.includes(name)) sort.push({ field: name, direction: descending ? 'desc' : 'asc' })
    else issues.push({ field: 'sort', code: 'not_sortable', message: `"${name}" can't be sorted on. Sortable fields: ${sortable.join(', ')}.` })
  }
  return sort
}

function parseFilters(resource: ResourceMetadata, query: URLSearchParams, issues: Issue[]): ListFilter[] {
  const filters: ListFilter[] = []
  for (const [key, raw] of query) {
    if (!key.startsWith('filter')) continue
    const match = FILTER_KEY.exec(key)
    const name = match?.[1]
    if (match === null || name === undefined) {
      issues.push({ field: key, code: 'invalid_filter', message: 'Write filters as filter[field]=value or filter[field][operator]=value.' })
      continue
    }
    const field = resource.fields.find((candidate) => candidate.name === name && !candidate.hidden && candidate.filterOperators.length > 0)
    if (field === undefined) {
      const filterable = resource.fields.filter((candidate) => !candidate.hidden && candidate.filterOperators.length > 0).map((candidate) => candidate.name)
      issues.push({ field: key, code: 'not_filterable', message: `"${name}" can't be filtered on. Filterable fields: ${filterable.join(', ')}.` })
      continue
    }
    const operator = match[2] ?? 'eq'
    if (!isOperatorOf(field, operator)) {
      issues.push({ field: key, code: 'invalid_operator', message: `"${operator}" doesn't work on ${field.label}. Try one of: ${field.filterOperators.join(', ')}.` })
      continue
    }
    const value = filterValue(field, operator, raw, key, issues)
    if (value !== undefined) filters.push({ field, operator, value })
  }
  return filters
}

function isOperatorOf(field: FieldMetadata, operator: string): operator is FilterOperator {
  return (field.filterOperators as readonly string[]).includes(operator)
}

function filterValue(field: FieldMetadata, operator: FilterOperator, raw: string, key: string, issues: Issue[]): SqlValue | SqlValue[] | undefined {
  if (operator === 'null') {
    if (raw === 'true' || raw === 'false') return raw === 'true' ? 1 : 0
    issues.push({ field: key, code: 'invalid_boolean', message: 'Use filter[field][null]=true or =false.' })
    return undefined
  }
  // contains / startsWith match text, so they need no type conversion.
  if (operator === 'contains' || operator === 'startsWith') return raw
  if (operator === 'in') {
    const parts = raw.split(',')
    if (parts.length > MAX_IN_VALUES) {
      issues.push({ field: key, code: 'too_many', message: `List at most ${MAX_IN_VALUES} values.` })
      return undefined
    }
    const values: SqlValue[] = []
    for (const part of parts) {
      const coerced = coerceQueryValue(field, part)
      if (typeof coerced === 'object' && coerced !== null) {
        issues.push({ field: key, ...coerced })
        return undefined
      }
      values.push(coerced)
    }
    return values
  }
  const coerced = coerceQueryValue(field, raw)
  if (typeof coerced === 'object' && coerced !== null) {
    issues.push({ field: key, ...coerced })
    return undefined
  }
  return coerced
}

/**
 * Convert one query-string value to the field's database type, or explain why it can't be.
 *
 * @example
 * coerceQueryValue(authorIdField, 'abc') // { code: 'invalid_integer', message: '…' }
 */
export function coerceQueryValue(field: FieldMetadata, raw: string): SqlValue | { readonly code: string; readonly message: string } {
  switch (field.cast) {
    case 'integer':
      return /^-?\d+$/.test(raw) ? Number(raw) : { code: 'invalid_integer', message: `${field.label} must be a whole number.` }
    case 'number':
    case 'decimal':
      return Number.isFinite(Number(raw)) && raw.trim() !== '' ? raw : { code: 'invalid_number', message: `${field.label} must be a number.` }
    case 'boolean':
      if (raw === 'true' || raw === '1') return 1
      if (raw === 'false' || raw === '0') return 0
      return { code: 'invalid_boolean', message: `${field.label} must be true or false.` }
    case 'datetime':
    case 'date':
      return Number.isNaN(Date.parse(raw)) ? { code: 'invalid_date', message: `${field.label} must be a date such as 2026-11-14.` } : new Date(raw).toISOString()
    case 'string':
    case 'json':
      if (field.options !== undefined && !field.options.includes(raw)) return { code: 'not_allowed', message: `${field.label} must be one of: ${field.options.join(', ')}.` }
      return raw
  }
}
