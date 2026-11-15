/**
 * The invoice list's state in the URL: status, search, advanced filters, sort, page and page size.
 *
 * Why the URL and not component state: a list link can be shared, a reload keeps the view, and
 * Back from a record returns to exactly the list you left (blueprint §5.1, "back button with
 * restored list state; deep links"). Every value is parsed defensively: a hostile or stale URL
 * falls back to the default for that one value, never crashes the screen.
 *
 * @example
 * readListUrl(new URLSearchParams('status=overdue&q=acme&sort=amount.asc')).filters.status // 'overdue'
 */
import { INVOICE_STATUSES, type PaymentMethod } from '../../data/invoices.ts'
import { NO_FILTERS, type InvoiceFilters, type Sort, type SortKey } from './list-model.ts'

/** Everything the URL carries for the list. */
export interface ListUrlState {
  readonly filters: InvoiceFilters
  readonly sort: Sort
  readonly page: number
  readonly pageSize: number
}

export const DEFAULT_SORT: Sort = { key: 'dueAt', direction: 'desc' }
export const PAGE_SIZES = [10, 25, 50] as const
const SORT_KEYS: readonly SortKey[] = ['id', 'customer', 'dueAt', 'amount', 'balance']
const METHODS: readonly PaymentMethod[] = ['Card', 'Bank transfer', 'Direct debit', 'PayPal']

function positiveInt(text: string | null, max: number): number | null {
  if (text === null || !/^\d{1,9}$/.test(text)) return null
  const value = Number(text)
  return value >= 1 && value <= max ? value : null
}

function parseSort(text: string | null): Sort {
  const match = /^([a-zA-Z]+)\.(asc|desc)$/.exec(text ?? '')
  const key = SORT_KEYS.find((candidate) => candidate === match?.[1])
  return key === undefined || match === null ? DEFAULT_SORT : { key, direction: match[2] === 'asc' ? 'asc' : 'desc' }
}

/** Read the list state from a query string (hostile values fall back to defaults). */
export function readListUrl(search: URLSearchParams): ListUrlState {
  const status = INVOICE_STATUSES.find((candidate) => candidate === search.get('status'))
  const methods = (search.get('methods') ?? '').split(',').flatMap((name) => METHODS.filter((method) => method === name))
  const size = positiveInt(search.get('size'), 100)
  return {
    filters: {
      search: (search.get('q') ?? '').slice(0, 200),
      status: status ?? 'all',
      ownerId: /^usr_\d{1,6}$/.test(search.get('owner') ?? '') ? (search.get('owner') ?? '') : '',
      methods: [...new Set(methods)],
      minAmount: positiveInt(search.get('min'), 1_000_000_000),
      overdueOnlyDays: positiveInt(search.get('overdue'), 3650),
    },
    sort: parseSort(search.get('sort')),
    page: positiveInt(search.get('page'), 100_000) ?? 1,
    pageSize: PAGE_SIZES.find((candidate) => candidate === size) ?? PAGE_SIZES[0],
  }
}

/** The query string for a list state; defaults are left out, so the plain list is `/invoices`. */
export function writeListUrl(state: ListUrlState): string {
  const params = new URLSearchParams()
  const { filters } = state
  if (filters.status !== 'all') params.set('status', filters.status)
  if (filters.search !== '') params.set('q', filters.search)
  if (filters.ownerId !== NO_FILTERS.ownerId) params.set('owner', filters.ownerId)
  if (filters.methods.length > 0) params.set('methods', filters.methods.join(','))
  if (filters.minAmount !== null) params.set('min', String(filters.minAmount))
  if (filters.overdueOnlyDays !== null) params.set('overdue', String(filters.overdueOnlyDays))
  if (state.sort.key !== DEFAULT_SORT.key || state.sort.direction !== DEFAULT_SORT.direction) params.set('sort', `${state.sort.key}.${state.sort.direction}`)
  if (state.page !== 1) params.set('page', String(state.page))
  if (state.pageSize !== PAGE_SIZES[0]) params.set('size', String(state.pageSize))
  const text = params.toString()
  return text === '' ? '' : `?${text}`
}

