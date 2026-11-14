/**
 * Validation of the URL search params the screens use. The URL is user input: anything malformed
 * is dropped (the screen then uses its default), never trusted and never an exception.
 *
 * @module
 */
import type { FilterState } from './api/list-params.ts'

/** Page sizes offered in lists (design doc §4.3). */
export const PAGE_SIZES = [10, 25, 50, 100] as const

/**
 * A list screen's URL state: `/posts?page=2&perPage=25&search=hi&sort=-price&filter=...`.
 *
 * @example
 * const search: ListSearch = { page: 2, sort: '-price', filter: { 'status.in': 'draft' } }
 */
export interface ListSearch {
  readonly page?: number
  readonly perPage?: number
  readonly search?: string
  readonly sort?: string
  readonly filter?: FilterState
  readonly trashed?: 'with' | 'only'
}

/**
 * A detail screen's URL state: which tab is open (`?tab=posts`).
 *
 * @example
 * const search: DetailSearch = { tab: 'posts' }
 */
export interface DetailSearch {
  readonly tab?: string
}

/**
 * Keep only well-formed list params.
 *
 * @example
 * validateListSearch({ page: '2', perPage: 7, sort: '-price' }) // { page: 2, sort: '-price' } (7 is not a page size)
 */
export function validateListSearch(raw: Record<string, unknown>): ListSearch {
  const page = positiveInteger(raw['page'])
  const perPage = positiveInteger(raw['perPage'])
  const filter = filterState(raw['filter'])
  return {
    ...(page === undefined ? {} : { page }),
    ...(perPage !== undefined && isPageSize(perPage) ? { perPage } : {}),
    ...(typeof raw['search'] === 'string' && raw['search'] !== '' ? { search: raw['search'] } : {}),
    ...(typeof raw['sort'] === 'string' && /^-?[a-z0-9_]+$/.test(raw['sort']) ? { sort: raw['sort'] } : {}),
    ...(filter === undefined ? {} : { filter }),
    ...(raw['trashed'] === 'with' || raw['trashed'] === 'only' ? { trashed: raw['trashed'] } : {}),
  }
}

/**
 * Keep only a well-formed tab name.
 *
 * @example
 * validateDetailSearch({ tab: 'posts' }) // { tab: 'posts' }
 */
export function validateDetailSearch(raw: Record<string, unknown>): DetailSearch {
  return typeof raw['tab'] === 'string' && /^[A-Za-z0-9_]+$/.test(raw['tab']) ? { tab: raw['tab'] } : {}
}

/**
 * Is this one of the offered page sizes?
 *
 * @example
 * isPageSize(25) // true
 */
export function isPageSize(value: number): value is (typeof PAGE_SIZES)[number] {
  return PAGE_SIZES.some((size) => size === value)
}

function positiveInteger(value: unknown): number | undefined {
  const number = typeof value === 'string' ? Number(value) : value
  return typeof number === 'number' && Number.isSafeInteger(number) && number >= 1 ? number : undefined
}

/** Filters: an object of `field.op` → string, with safe key shapes only. */
function filterState(value: unknown): FilterState | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  const entries = Object.entries(value).filter((entry): entry is [string, string] => /^[a-z0-9_]+\.[a-zA-Z]+$/.test(entry[0]) && typeof entry[1] === 'string' && entry[1] !== '')
  return entries.length === 0 ? undefined : Object.fromEntries(entries)
}
