/**
 * ListQuery ↔ URL query string (the REST wire format from blueprint 04 §4.1):
 *
 *   filter[status][in]=draft,sent & filter[amount][gte]=100 & sort=-dueDate,number
 *   & page[size]=25 & page[cursor]=abc & search=acme
 *
 * Design choices:
 * - Pure functions, no router dependency: any router (TanStack Router, React Router, Next) can call
 *   them. The UI only represents an AND of simple field filters ("chips"); complex trees go
 *   through `POST /query`, not the URL.
 * - List values are comma-joined and EACH element is percent-encoded, so values containing commas,
 *   `&`, `=` or Unicode round-trip exactly. We therefore parse the raw string ourselves instead of
 *   URLSearchParams (which would decode before we can split on commas).
 * - Fail closed: parameters for fields the resource does not mark filterable/sortable, unknown
 *   operators, or uncoercible values are rejected (and reported), never sent to the server.
 */
import {
  type FieldDescriptor,
  type FilterOperator,
  LIST_QUERY_LIMITS,
  type ListQuery,
  type QueryFilter,
  type ResourceDescriptor,
  type SortDirective,
} from './contracts.ts'

/** One UI filter chip: `field op value(s)`. */
export type SimpleFilter =
  | { readonly field: string; readonly op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; readonly value: string | number | boolean }
  | { readonly field: string; readonly op: 'in' | 'nin'; readonly values: readonly (string | number)[] }
  | { readonly field: string; readonly op: 'isNull' | 'isNotNull' }
  | { readonly field: string; readonly op: 'contains' | 'startsWith' | 'endsWith'; readonly value: string }
  | { readonly field: string; readonly op: 'between'; readonly from: number | string; readonly to: number | string }

/** The list state the UI manipulates. */
export interface ListState {
  readonly filters: readonly SimpleFilter[]
  readonly sort: readonly SortDirective[]
  readonly search: string
  readonly pageSize: number
  /** Cursor of the current page (`undefined` = first page). */
  readonly cursor?: string
}

export const initialListState: ListState = Object.freeze({
  filters: [],
  sort: [],
  search: '',
  pageSize: LIST_QUERY_LIMITS.defaultPageSize,
})

/** A rejected URL parameter and why (shown in dev tools / logged; never silently "fixed"). */
export interface RejectedParam {
  readonly key: string
  readonly reason: string
}

// ── state → ListQuery ──────────────────────────────────────────────────────────────────────────

export function simpleFilterToQueryFilter(f: SimpleFilter): QueryFilter {
  switch (f.op) {
    case 'in':
    case 'nin':
      return { op: f.op, field: f.field, values: f.values }
    case 'isNull':
    case 'isNotNull':
      return { op: f.op, field: f.field }
    case 'between':
      return { op: 'between', field: f.field, from: f.from, to: f.to }
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return { op: f.op, field: f.field, value: f.value }
    default:
      return { op: f.op, field: f.field, value: f.value }
  }
}

/** Build the typed ListQuery the API client sends. */
export function toListQuery(state: ListState): ListQuery {
  const filter: QueryFilter | undefined =
    state.filters.length === 0
      ? undefined
      : state.filters.length === 1 && state.filters[0]
        ? simpleFilterToQueryFilter(state.filters[0])
        : { op: 'and', filters: state.filters.map(simpleFilterToQueryFilter) }
  return {
    ...(filter ? { filter } : {}),
    ...(state.search.trim() ? { search: state.search.trim() } : {}),
    ...(state.sort.length > 0 ? { sort: state.sort } : {}),
    page: {
      kind: 'cursor',
      size: clampPageSize(state.pageSize),
      ...(state.cursor ? { cursor: state.cursor } : {}),
    },
  }
}

export function clampPageSize(size: number): number {
  if (!Number.isInteger(size) || size < 1) return LIST_QUERY_LIMITS.defaultPageSize
  return Math.min(size, LIST_QUERY_LIMITS.maxPageSize)
}

// ── state → URL ────────────────────────────────────────────────────────────────────────────────

const enc = encodeURIComponent

function filterValue(f: SimpleFilter): string {
  switch (f.op) {
    case 'in':
    case 'nin':
      return f.values.map((v) => enc(String(v))).join(',')
    case 'isNull':
    case 'isNotNull':
      return 'true'
    case 'between':
      return `${enc(String(f.from))},${enc(String(f.to))}`
    default:
      return enc(String(f.value))
  }
}

/** Serialise list state to a query string (without the leading `?`). Deterministic order. */
export function toSearchString(state: ListState): string {
  const parts: string[] = []
  for (const f of state.filters) parts.push(`${enc(`filter[${f.field}][${f.op}]`)}=${filterValue(f)}`)
  if (state.search.trim()) parts.push(`search=${enc(state.search.trim())}`)
  if (state.sort.length > 0) {
    const sort = state.sort.map((s) => `${s.direction === 'desc' ? '-' : ''}${enc(s.field)}`)
    parts.push(`sort=${sort.join(',')}`)
  }
  if (state.pageSize !== LIST_QUERY_LIMITS.defaultPageSize)
    parts.push(`${enc('page[size]')}=${clampPageSize(state.pageSize)}`)
  if (state.cursor) parts.push(`${enc('page[cursor]')}=${enc(state.cursor)}`)
  return parts.join('&')
}

// ── URL → state ────────────────────────────────────────────────────────────────────────────────

const NUMERIC_TYPES = new Set(['integer', 'decimal', 'money'])

function coerce(field: FieldDescriptor, raw: string): string | number | boolean | undefined {
  if (NUMERIC_TYPES.has(field.type)) {
    const n = Number(raw)
    return raw.trim() !== '' && Number.isFinite(n) ? n : undefined
  }
  if (field.type === 'boolean') return raw === 'true' ? true : raw === 'false' ? false : undefined
  return raw
}

const OPERATORS: ReadonlySet<string> = new Set<FilterOperator>([
  'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'nin', 'isNull', 'isNotNull',
  'contains', 'startsWith', 'endsWith', 'between',
])

/**
 * Parse a query string into list state for `resource`. Returns the state plus every parameter that
 * was rejected (unknown field, operator not allowed for that field, bad value).
 */
export function parseSearchString(
  search: string,
  resource: ResourceDescriptor,
): { state: ListState; rejected: RejectedParam[] } {
  const fields = new Map(resource.fields.map((f) => [f.name, f]))
  const filters: SimpleFilter[] = []
  const rejected: RejectedParam[] = []
  let sort: SortDirective[] = []
  let searchText = ''
  let pageSize: number = LIST_QUERY_LIMITS.defaultPageSize
  let cursor: string | undefined

  const query = search.startsWith('?') ? search.slice(1) : search
  for (const pair of query.split('&')) {
    if (pair === '') continue
    const eq = pair.indexOf('=')
    const rawKey = eq < 0 ? pair : pair.slice(0, eq)
    const rawValue = eq < 0 ? '' : pair.slice(eq + 1)
    let key: string
    try {
      key = decodeURIComponent(rawKey)
    } catch {
      rejected.push({ key: rawKey, reason: 'malformed encoding' })
      continue
    }
    const decodeList = () => rawValue.split(',').map((v) => decodeURIComponent(v))

    try {
      const m = /^filter\[([^\]]+)\]\[([^\]]+)\]$/.exec(key)
      if (m) {
        const [, name = '', op = ''] = m
        const field = fields.get(name)
        if (!field) { rejected.push({ key, reason: 'unknown field' }); continue }
        if (!OPERATORS.has(op) || !field.filterOperators.includes(op as FilterOperator)) {
          rejected.push({ key, reason: 'operator not allowed for this field' }); continue
        }
        const parsed = parseFilter(field, op as FilterOperator, decodeList())
        if (parsed) filters.push(parsed)
        else rejected.push({ key, reason: 'invalid value' })
        continue
      }
      if (key === 'search') { searchText = decodeURIComponent(rawValue); continue }
      if (key === 'sort') {
        const next: SortDirective[] = []
        for (const token of decodeList()) {
          const desc = token.startsWith('-')
          const name = desc ? token.slice(1) : token
          if (fields.get(name)?.sortable) next.push({ field: name, direction: desc ? 'desc' : 'asc' })
          else rejected.push({ key: `sort:${token}`, reason: 'field is not sortable' })
        }
        sort = next
        continue
      }
      if (key === 'page[size]') { pageSize = clampPageSize(Number(rawValue)); continue }
      if (key === 'page[cursor]') { cursor = decodeURIComponent(rawValue); continue }
      rejected.push({ key, reason: 'unknown parameter' })
    } catch {
      rejected.push({ key, reason: 'malformed encoding' })
    }
  }
  return {
    state: { filters, sort, search: searchText, pageSize, ...(cursor ? { cursor } : {}) },
    rejected,
  }
}

/**
 * Build a validated SimpleFilter from raw string values (used by URL parsing AND the filter bar, so
 * both apply identical coercion and rules). Returns undefined when the input is not valid.
 */
export function buildSimpleFilter(field: FieldDescriptor, op: FilterOperator, values: string[]): SimpleFilter | undefined {
  if (!field.filterOperators.includes(op)) return undefined
  return parseFilter(field, op, values)
}

function parseFilter(field: FieldDescriptor, op: FilterOperator, values: string[]): SimpleFilter | undefined {
  const name = field.name
  switch (op) {
    case 'isNull':
    case 'isNotNull':
      return values.length === 1 && values[0] === 'true' ? { field: name, op } : undefined
    case 'in':
    case 'nin': {
      const coerced = values.map((v) => coerce(field, v))
      if (coerced.some((v) => v === undefined || typeof v === 'boolean')) return undefined
      return { field: name, op, values: coerced as (string | number)[] }
    }
    case 'between': {
      if (values.length !== 2) return undefined
      const [from, to] = values.map((v) => coerce(field, v))
      if (from === undefined || to === undefined || typeof from === 'boolean' || typeof to === 'boolean') return undefined
      return { field: name, op, from, to }
    }
    case 'contains':
    case 'startsWith':
    case 'endsWith':
      return values.length === 1 && values[0] !== undefined ? { field: name, op, value: values[0] } : undefined
    default: {
      if (values.length !== 1 || values[0] === undefined) return undefined
      const value = coerce(field, values[0])
      return value === undefined ? undefined : { field: name, op, value }
    }
  }
}
