/**
 * The invoice list's state lives in the URL (`?q=…&status=open,overdue&sort=-amount&page=2`), so
 * every filtered view is shareable, survives a reload and works with Back/Forward.
 *
 * A saved view (`?view=overdue`) is a starting point: explicit params layer on top of it, and the
 * toolbar shows the view as "edited" when they do.
 */
import { EMPTY_FILTERS, type InvoiceFilters, type InvoiceStatus, SAVED_VIEWS, type SavedView, type Sort, type SortKey, STATUSES } from '../../data/invoices.ts'

export const PAGE_SIZES = [10, 25, 50, 100] as const

export const DEFAULT_SORT: Sort = { key: 'issuedAt', direction: 'desc' }

export interface ListState {
  filters: InvoiceFilters
  sort: Sort
  page: number
  pageSize: number
  view: SavedView | null
  /** True when explicit params change the saved view. */
  edited: boolean
}

const SORT_KEYS: readonly SortKey[] = ['number', 'customer', 'status', 'amount', 'issuedAt', 'dueAt']

function parseSort(raw: string | null): Sort | null {
  if (raw === null) return null
  const direction = raw.startsWith('-') ? 'desc' : 'asc'
  const key = raw.replace(/^-/, '')
  return SORT_KEYS.includes(key as SortKey) ? { key: key as SortKey, direction } : null
}

/** `{ key: 'amount', direction: 'desc' }` → `-amount`. */
export function sortParam(sort: Sort): string {
  return `${sort.direction === 'desc' ? '-' : ''}${sort.key}`
}

function parseList<T extends string>(raw: string | null, allowed: readonly T[]): T[] | null {
  if (raw === null) return null
  return raw.split(',').filter((value): value is T => allowed.includes(value as T))
}

const FILTER_PARAMS = ['q', 'status', 'owner', 'min', 'sort'] as const

/**
 * Read the list state from the query string. Unknown or malformed values are ignored rather than
 * failing: a hand-edited URL degrades to the defaults instead of an error page.
 */
export function readListState(search: URLSearchParams): ListState {
  const view = SAVED_VIEWS.find((candidate) => candidate.id === search.get('view')) ?? null
  const base = view ?? { filters: EMPTY_FILTERS, sort: DEFAULT_SORT }
  const statuses = parseList<InvoiceStatus>(search.get('status'), STATUSES)
  // `-` is an explicit "none": it clears a filter that a saved view would otherwise supply.
  const owners = search.get('owner')?.split(',').filter((id) => /^u\d+$/.test(id)) ?? null
  const min = Number(search.get('min'))
  const size = Number(search.get('size'))
  const page = Number(search.get('page'))
  return {
    filters: {
      search: search.get('q') ?? base.filters.search,
      statuses: statuses ?? base.filters.statuses,
      ownerIds: owners ?? base.filters.ownerIds,
      minAmount: search.has('min') ? (Number.isFinite(min) && min > 0 ? min : null) : base.filters.minAmount,
    },
    sort: parseSort(search.get('sort')) ?? base.sort,
    page: Number.isInteger(page) && page > 0 ? page : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(size) ? size : 25,
    view,
    edited: view !== null && FILTER_PARAMS.some((param) => search.has(param)),
  }
}

/** How many filters are active (the badge on the Filters button). Search is not counted. */
export function activeFilterCount(filters: InvoiceFilters): number {
  return (filters.statuses.length > 0 ? 1 : 0) + (filters.ownerIds.length > 0 ? 1 : 0) + (filters.minAmount !== null ? 1 : 0)
}

/**
 * Page buttons to show: always the first and last page, the current page with one neighbour on
 * each side, and `'…'` for gaps. Short lists show every page.
 *
 * @example pageWindow(6, 10) // → [1, '…', 5, 6, 7, '…', 10]
 */
export function pageWindow(current: number, count: number): (number | '…')[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index + 1)
  const pages = new Set([1, count, current - 1, current, current + 1].filter((page) => page >= 1 && page <= count))
  if (current <= 3) [2, 3, 4].forEach((page) => pages.add(page))
  if (current >= count - 2) [count - 3, count - 2, count - 1].forEach((page) => pages.add(page))
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | '…')[] = []
  for (const [index, page] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && page - previous > 1) result.push('…')
    result.push(page)
  }
  return result
}
