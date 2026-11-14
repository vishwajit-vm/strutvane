/**
 * Parse a list query string exactly as spike 10 does (`src/crud/list-query.ts`):
 * `?page=2&perPage=20&search=hello&sort=-price,title&filter[status][in]=draft,published`.
 *
 * Plus one extension from the design doc (§4.5, §4.10) that spike 10 does not have yet:
 * `filter[trashed]=with|only` on soft-delete resources. Against spike 10 this parameter is a 422
 * ("trashed can't be filtered on"), which the README lists as a finding.
 *
 * @module
 */
import { isExposedField } from '../shared/exposure.ts'
import type { FieldMetadata, FilterOperator, ResourceMetadata } from '../shared/metadata.ts'
import type { Issue } from './problem.ts'
import { coerceQueryValue, type StoredValue } from './values.ts'

/**
 * One validated filter.
 *
 * @example
 * const filter: ListFilter = { field: status, operator: 'in', value: ['draft'] }
 */
export interface ListFilter {
  readonly field: FieldMetadata
  readonly operator: FilterOperator
  readonly value: StoredValue | readonly StoredValue[]
}

/**
 * Which soft-deleted rows a list includes: none (default), all, or only them.
 *
 * @example
 * const trashed: TrashedMode = 'only'
 */
export type TrashedMode = 'without' | 'with' | 'only'

/**
 * A validated list request.
 *
 * @example
 * const request: ListRequest = { page: 1, perPage: 15, sort: [], filters: [], trashed: 'without' }
 */
export interface ListRequest {
  readonly page: number
  readonly perPage: number
  readonly search?: string
  readonly sort: readonly { readonly field: string; readonly direction: 'asc' | 'desc' }[]
  readonly filters: readonly ListFilter[]
  readonly trashed: TrashedMode
}

/** Same limits as spike 10. */
export const MAX_PER_PAGE = 100
const MAX_SEARCH_LENGTH = 200
const MAX_SORT_FIELDS = 3
const MAX_IN_VALUES = 100
const FILTER_KEY = /^filter\[([a-z0-9_]+)\](?:\[([a-zA-Z]+)\])?$/

/**
 * Validate a list query; return the request or every issue found.
 *
 * @example
 * parseListQuery(posts, new URLSearchParams('page=2&sort=-price')) // { ok: true, request: {...} }
 */
export function parseListQuery(resource: ResourceMetadata, query: URLSearchParams): { ok: true; request: ListRequest } | { ok: false; issues: Issue[] } {
  const issues: Issue[] = []
  const page = positiveInteger(query.get('page'), 1, 'page', 'Page', Number.MAX_SAFE_INTEGER, issues)
  const perPage = positiveInteger(query.get('perPage'), resource.perPage, 'perPage', 'Page size', MAX_PER_PAGE, issues)
  const search = query.get('search')?.trim() ?? ''
  if (search.length > MAX_SEARCH_LENGTH) issues.push({ field: 'search', code: 'too_long', message: `Search terms can be at most ${MAX_SEARCH_LENGTH} characters.` })
  const sort = parseSort(resource, query.get('sort') ?? resource.defaultSort, issues)
  const { filters, trashed } = parseFilters(resource, query, issues)
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, request: { page, perPage, sort, filters, trashed, ...(search === '' ? {} : { search }) } }
}

function positiveInteger(raw: string | null, fallback: number, field: string, label: string, max: number, issues: Issue[]): number {
  if (raw === null) return fallback
  const value = Number(raw)
  if (/^\d+$/.test(raw) && value >= 1 && value <= max) return value
  issues.push({ field, code: 'invalid_integer', message: `${label} must be a whole number from 1 to ${max}.` })
  return fallback
}

function parseSort(resource: ResourceMetadata, raw: string, issues: Issue[]): ListRequest['sort'] {
  const parts = raw.split(',').map((part) => part.trim()).filter((part) => part.length > 0)
  if (parts.length > MAX_SORT_FIELDS) {
    issues.push({ field: 'sort', code: 'too_many', message: `Sort by at most ${MAX_SORT_FIELDS} fields.` })
    return []
  }
  // Secret columns are never sortable: a sort leaks values by binary search (F-03).
  const sortable = resource.fields.filter((field) => field.sortable && isExposedField(field)).map((field) => field.name)
  return parts.flatMap((part) => {
    const descending = part.startsWith('-')
    const name = descending ? part.slice(1) : part
    if (sortable.includes(name)) return [{ field: name, direction: descending ? ('desc' as const) : ('asc' as const) }]
    issues.push({ field: 'sort', code: 'not_sortable', message: `"${name}" can't be sorted on. Sortable fields: ${sortable.join(', ')}.` })
    return []
  })
}

function parseFilters(resource: ResourceMetadata, query: URLSearchParams, issues: Issue[]): { filters: ListFilter[]; trashed: TrashedMode } {
  const filters: ListFilter[] = []
  let trashed: TrashedMode = 'without'
  for (const [key, raw] of query) {
    if (!key.startsWith('filter')) continue
    // Extension: soft-delete visibility. Only on resources that soft delete; elsewhere it falls
    // through to the normal "not filterable" message, like spike 10.
    if (key === 'filter[trashed]' && resource.softDeletes) {
      if (raw === 'with' || raw === 'only' || raw === 'without') trashed = raw
      else issues.push({ field: key, code: 'invalid_trashed', message: 'Use filter[trashed]=with or filter[trashed]=only.' })
      continue
    }
    const match = FILTER_KEY.exec(key)
    const name = match?.[1]
    if (match === null || name === undefined) {
      issues.push({ field: key, code: 'invalid_filter', message: 'Write filters as filter[field]=value or filter[field][operator]=value.' })
      continue
    }
    const field = resource.fields.find((candidate) => candidate.name === name && candidate.filterOperators.length > 0 && isExposedField(candidate))
    if (field === undefined) {
      const filterable = resource.fields.filter((candidate) => candidate.filterOperators.length > 0 && isExposedField(candidate)).map((candidate) => candidate.name)
      issues.push({ field: key, code: 'not_filterable', message: `"${name}" can't be filtered on. Filterable fields: ${filterable.join(', ')}.` })
      continue
    }
    const operator = toOperator(field, match[2] ?? 'eq')
    if (operator === undefined) {
      issues.push({ field: key, code: 'invalid_operator', message: `"${match[2] ?? 'eq'}" doesn't work on ${field.label}. Try one of: ${field.filterOperators.join(', ')}.` })
      continue
    }
    const value = filterValue(field, operator, raw, key, issues)
    if (value !== undefined) filters.push({ field, operator, value })
  }
  return { filters, trashed }
}

/** The operator, if this field allows it. */
function toOperator(field: FieldMetadata, raw: string): FilterOperator | undefined {
  return field.filterOperators.find((operator) => operator === raw)
}

function filterValue(field: FieldMetadata, operator: FilterOperator, raw: string, key: string, issues: Issue[]): StoredValue | StoredValue[] | undefined {
  if (operator === 'null') {
    if (raw === 'true' || raw === 'false') return raw === 'true'
    issues.push({ field: key, code: 'invalid_boolean', message: 'Use filter[field][null]=true or =false.' })
    return undefined
  }
  if (operator === 'contains' || operator === 'startsWith') return raw
  if (operator === 'in') {
    const parts = raw.split(',')
    if (parts.length > MAX_IN_VALUES) {
      issues.push({ field: key, code: 'too_many', message: `List at most ${MAX_IN_VALUES} values.` })
      return undefined
    }
    const values: StoredValue[] = []
    for (const part of parts) {
      const coerced = coerceQueryValue(field, part)
      if (!coerced.ok) {
        issues.push({ field: key, code: coerced.code, message: coerced.message })
        return undefined
      }
      values.push(coerced.value)
    }
    return values
  }
  const coerced = coerceQueryValue(field, raw)
  if (coerced.ok) return coerced.value
  issues.push({ field: key, code: coerced.code, message: coerced.message })
  return undefined
}
