/**
 * The invoice list's data logic as pure functions (filter → sort → paginate), kept out of the
 * components so they stay about layout and so the rules are easy to read and test.
 *
 * @module
 */
import { balanceOf, type Invoice, type InvoiceStatus, type PaymentMethod } from '../../data/invoices.ts'
import { daysUntil } from '../../lib/format.ts'

/** Everything the toolbar can filter on. Empty values mean "no filter". */
export interface InvoiceFilters {
  readonly search: string
  readonly status: InvoiceStatus | 'all'
  readonly ownerId: string
  readonly methods: readonly PaymentMethod[]
  readonly minAmount: number | null
  readonly overdueOnlyDays: number | null
}

export const NO_FILTERS: InvoiceFilters = { search: '', status: 'all', ownerId: '', methods: [], minAmount: null, overdueOnlyDays: null }

export type SortKey = 'id' | 'customer' | 'dueAt' | 'amount' | 'balance'
export interface Sort {
  readonly key: SortKey
  readonly direction: 'asc' | 'desc'
}

/** Apply every filter except status (status tabs need counts computed without the status filter). */
export function filterInvoices(list: readonly Invoice[], filters: InvoiceFilters, includeStatus = true): Invoice[] {
  const term = filters.search.trim().toLowerCase()
  return list.filter((invoice) => {
    if (term !== '' && ![invoice.id, invoice.customer.name, invoice.customer.contact, invoice.customer.email].some((text) => text.toLowerCase().includes(term))) return false
    if (includeStatus && filters.status !== 'all' && invoice.status !== filters.status) return false
    if (filters.ownerId !== '' && invoice.owner.id !== filters.ownerId) return false
    if (filters.methods.length > 0 && !filters.methods.includes(invoice.method)) return false
    if (filters.minAmount !== null && invoice.amount < filters.minAmount) return false
    if (filters.overdueOnlyDays !== null && !(invoice.status === 'overdue' && -daysUntil(invoice.dueAt) >= filters.overdueOnlyDays)) return false
    return true
  })
}

const VALUE: Readonly<Record<SortKey, (invoice: Invoice) => string | number>> = {
  id: (invoice) => invoice.id,
  customer: (invoice) => invoice.customer.name,
  dueAt: (invoice) => invoice.dueAt.getTime(),
  amount: (invoice) => invoice.amount,
  balance: balanceOf,
}

export function sortInvoices(list: readonly Invoice[], sort: Sort): Invoice[] {
  const read = VALUE[sort.key]
  const sign = sort.direction === 'asc' ? 1 : -1
  return [...list].sort((a, b) => {
    const left = read(a)
    const right = read(b)
    return (typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))) * sign
  })
}

/** A page of results plus the numbers the footer shows. `page` is clamped into range. */
export function paginate<T>(list: readonly T[], page: number, pageSize: number): { readonly rows: readonly T[]; readonly page: number; readonly pageCount: number; readonly from: number; readonly to: number } {
  const pageCount = Math.max(1, Math.ceil(list.length / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * pageSize
  const rows = list.slice(start, start + pageSize)
  return { rows, page: current, pageCount, from: list.length === 0 ? 0 : start + 1, to: start + rows.length }
}

/**
 * Page numbers with ellipses for the pager: always first, last, and two around the current page.
 *
 * @example
 * pageWindow(5, 10) // [1, 'gap', 4, 5, 6, 'gap', 10]
 */
export function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1].filter((value) => value >= 1 && value <= pageCount))
  const sorted = [...pages].sort((a, b) => a - b)
  const result: (number | 'gap')[] = []
  for (const [index, value] of sorted.entries()) {
    const previous = sorted[index - 1]
    if (previous !== undefined && value - previous > 1) result.push('gap')
    result.push(value)
  }
  return result
}

/** Optional columns the user can show or hide (the invoice number and actions always show). */
export const OPTIONAL_COLUMNS = [
  { id: 'customer', label: 'Customer' },
  { id: 'owner', label: 'Owner' },
  { id: 'issued', label: 'Issued' },
  { id: 'due', label: 'Due' },
  { id: 'amount', label: 'Amount' },
  { id: 'collected', label: 'Collected' },
  { id: 'status', label: 'Status' },
] as const

export type ColumnId = (typeof OPTIONAL_COLUMNS)[number]['id']

/** Saved views: named filter presets. */
export const SAVED_VIEWS: readonly { readonly id: string; readonly label: string; readonly filters: InvoiceFilters }[] = [
  { id: 'all', label: 'All invoices', filters: NO_FILTERS },
  { id: 'overdue-30', label: 'Overdue 30+ days', filters: { ...NO_FILTERS, overdueOnlyDays: 30 } },
  { id: 'mine', label: 'My invoices', filters: { ...NO_FILTERS, ownerId: 'usr_01' } },
  { id: 'large', label: 'Large deals ($10K+)', filters: { ...NO_FILTERS, minAmount: 10_000 } },
  { id: 'card', label: 'Paid by card', filters: { ...NO_FILTERS, methods: ['Card'] } },
]
