/**
 * The state of a list screen (page, page size, search, sort, filters, deleted rows) and how it
 * becomes spike 10's query string.
 *
 * Wire format (spike 10's API, ADR-0011 family names):
 *   page=2&perPage=25&search=hello&sort=-price&filter[status][in]=draft,published
 *   &filter[price][gte]=10&filter[trashed]=only   (trashed: design-doc extension, mock only)
 *
 * The UI sends only these parameters and never assumes how the database searches, sorts or
 * orders NULLs: that stays the server's job, whatever the engine (MySQL, PostgreSQL, SQLite).
 *
 * @module
 */
import type { FilterOperator } from '../../shared/metadata.ts'

/**
 * Which soft-deleted rows to show. `without` is the default and is never sent.
 *
 * @example
 * const mode: TrashedMode = 'only'
 */
export type TrashedMode = 'without' | 'with' | 'only'

/**
 * Active filters, keyed `field.operator` (for example `price.gte`), each with its raw text value.
 * Flat string keys keep the URL readable and the state trivially serialisable.
 *
 * @example
 * const filters: FilterState = { 'status.in': 'draft,published', 'price.gte': '10' }
 */
export type FilterState = Readonly<Record<string, string>>

/**
 * Everything a list request needs.
 *
 * @example
 * const params: ListParams = { page: 1, perPage: 25, search: '', sort: '-created_at', filters: {}, trashed: 'without' }
 */
export interface ListParams {
  readonly page: number
  readonly perPage: number
  readonly search: string
  readonly sort: string
  readonly filters: FilterState
  readonly trashed: TrashedMode
}

/**
 * The key a filter is stored under.
 *
 * @example
 * filterKey('price', 'gte') // 'price.gte'
 */
export function filterKey(field: string, operator: FilterOperator): string {
  return `${field}.${operator}`
}

/**
 * Set or clear one filter. An empty value removes the filter, so "cleared" never sends `=`.
 *
 * @example
 * withFilter({}, 'status.in', 'draft') // { 'status.in': 'draft' }
 * withFilter({ 'status.in': 'draft' }, 'status.in', '') // {}
 */
export function withFilter(filters: FilterState, key: string, value: string): FilterState {
  const next: Record<string, string> = { ...filters }
  if (value === '') delete next[key]
  else next[key] = value
  return next
}

/**
 * How many filters are active (for the "Filters (2)" button and the empty state).
 *
 * @example
 * activeFilterCount({ 'status.in': 'draft' }, 'with') // 2
 */
export function activeFilterCount(filters: FilterState, trashed: TrashedMode): number {
  return Object.keys(filters).length + (trashed === 'without' ? 0 : 1)
}

/**
 * Build spike 10's query string. Parameters equal to the server default are still sent (page,
 * perPage, sort) so a request means the same thing whatever the server's defaults become.
 *
 * @example
 * toQueryString({ page: 2, perPage: 25, search: 'hi', sort: '-price', filters: { 'status.in': 'draft' }, trashed: 'without' })
 * // 'page=2&perPage=25&sort=-price&search=hi&filter%5Bstatus%5D%5Bin%5D=draft'
 */
export function toQueryString(params: ListParams): string {
  const query = new URLSearchParams()
  query.set('page', String(params.page))
  query.set('perPage', String(params.perPage))
  if (params.sort !== '') query.set('sort', params.sort)
  const search = params.search.trim()
  if (search !== '') query.set('search', search)
  for (const [key, value] of Object.entries(params.filters).sort(([a], [b]) => (a < b ? -1 : 1))) {
    const dot = key.lastIndexOf('.')
    if (dot <= 0) continue
    query.set(`filter[${key.slice(0, dot)}][${key.slice(dot + 1)}]`, value)
  }
  if (params.trashed !== 'without') query.set('filter[trashed]', params.trashed)
  return query.toString()
}

/**
 * Parse the sort string for one column: `'-price'` → descending on price.
 *
 * @example
 * sortDirectionOf('-price', 'price') // 'desc'
 * sortDirectionOf('-price', 'title') // false
 */
export function sortDirectionOf(sort: string, field: string): 'asc' | 'desc' | false {
  if (sort === field) return 'asc'
  if (sort === `-${field}`) return 'desc'
  return false
}

/**
 * The next sort after clicking a column header: ascending, then descending, then back to the
 * resource default. The first click is always ascending, on every column, so behaviour is
 * predictable (spike 08 lesson).
 *
 * @example
 * nextSort('', 'title', '-created_at') // 'title'
 * nextSort('title', 'title', '-created_at') // '-title'
 * nextSort('-title', 'title', '-created_at') // '-created_at'
 */
export function nextSort(current: string, field: string, defaultSort: string): string {
  const direction = sortDirectionOf(current, field)
  if (direction === false) return field
  if (direction === 'asc') return `-${field}`
  // When the default *is* this column descending, "back to default" would change nothing and the
  // header would look stuck; start the cycle again instead.
  return defaultSort === current ? field : defaultSort
}
