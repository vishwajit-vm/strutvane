/**
 * The invoice list's pure logic: filtering, sorting, paging, saved views and filter chips.
 *
 * Why pure functions: the table, the grid view, the chips and the tests all use the same rules,
 * and they are trivially testable without rendering anything.
 *
 * @example
 *   const visible = applyQuery(INVOICES, { ...DEFAULT_QUERY, statuses: ['overdue'], sort: { key: 'total', dir: 'desc' } })
 *   const page = paginate(visible, 1, 10)   // { rows, total, pageCount, from, to }
 */
import type { Invoice, InvoiceStatus } from '../../../data/invoices.ts'
import { STATUS_LABEL } from '../../../data/invoices.ts'
import { formatMoney, TODAY } from '../../../lib/format.ts'

export type SortKey = 'number' | 'customer' | 'issuedAt' | 'dueAt' | 'total' | 'status'
export type SortDir = 'asc' | 'desc'

export interface ListQuery {
  readonly search: string
  readonly statuses: readonly InvoiceStatus[]
  /** Owner (person) id, or null for anyone. */
  readonly owner: string | null
  readonly minAmount: number | null
  readonly tags: readonly string[]
  readonly sort: { readonly key: SortKey; readonly dir: SortDir }
}

export const DEFAULT_QUERY: ListQuery = {
  search: '',
  statuses: [],
  owner: null,
  minAmount: null,
  tags: [],
  sort: { key: 'issuedAt', dir: 'desc' },
}

/** Keep the invoices matching every active filter. Search covers number, customer and contact. */
export function filterInvoices(invoices: readonly Invoice[], query: ListQuery): Invoice[] {
  const terms = query.search.toLowerCase().trim().split(/\s+/).filter(Boolean)
  return invoices.filter((invoice) => {
    if (query.statuses.length > 0 && !query.statuses.includes(invoice.status)) return false
    if (query.owner !== null && invoice.owner.id !== query.owner) return false
    if (query.minAmount !== null && invoice.total < query.minAmount) return false
    if (query.tags.length > 0 && !query.tags.every((tag) => invoice.tags.includes(tag))) return false
    if (terms.length === 0) return true
    const haystack = `${invoice.number} ${invoice.customer.name} ${invoice.customer.contact} ${invoice.customer.email}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

const STATUS_ORDER: Readonly<Record<InvoiceStatus, number>> = { overdue: 0, pending: 1, draft: 2, paid: 3, void: 4 }

/** Stable sort by one column; ties fall back to the invoice number so the order never jumps. */
export function sortInvoices(invoices: readonly Invoice[], sort: ListQuery['sort']): Invoice[] {
  const direction = sort.dir === 'asc' ? 1 : -1
  const value = (invoice: Invoice): number | string => {
    switch (sort.key) {
      case 'number':
        return invoice.number
      case 'customer':
        return invoice.customer.name.toLowerCase()
      case 'issuedAt':
        return invoice.issuedAt.getTime()
      case 'dueAt':
        return invoice.dueAt.getTime()
      case 'total':
        return invoice.total
      case 'status':
        return STATUS_ORDER[invoice.status]
    }
  }
  return [...invoices].sort((a, b) => {
    const left = value(a)
    const right = value(b)
    if (left < right) return -direction
    if (left > right) return direction
    return a.number.localeCompare(b.number)
  })
}

export function applyQuery(invoices: readonly Invoice[], query: ListQuery): Invoice[] {
  return sortInvoices(filterInvoices(invoices, query), query.sort)
}

export interface Page<T> {
  readonly rows: readonly T[]
  readonly total: number
  readonly page: number
  readonly pageCount: number
  /** 1-based index of the first row shown (0 when empty). */
  readonly from: number
  readonly to: number
}

/** Slice one page; an out-of-range page is clamped (e.g. after a filter shrinks the list). */
export function paginate<T>(rows: readonly T[], page: number, pageSize: number): Page<T> {
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  const start = (current - 1) * pageSize
  const slice = rows.slice(start, start + pageSize)
  return { rows: slice, total: rows.length, page: current, pageCount, from: slice.length === 0 ? 0 : start + 1, to: start + slice.length }
}

/**
 * Page buttons with ellipses: always the first and last page, and the neighbours of the current.
 * @example pageWindow(6, 12) // [1, 'gap', 5, 6, 7, 'gap', 12]
 */
export function pageWindow(page: number, pageCount: number): (number | 'gap')[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)
  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  const sorted = [...pages].filter((value) => value >= 1 && value <= pageCount).sort((a, b) => a - b)
  const result: (number | 'gap')[] = []
  for (const value of sorted) {
    const previous = result[result.length - 1]
    if (typeof previous === 'number' && value - previous > 1) result.push('gap')
    result.push(value)
  }
  return result
}

/** Clicking a header: a new column sorts ascending (dates and money descending), the same column flips. */
export function nextSort(current: ListQuery['sort'], key: SortKey): ListQuery['sort'] {
  if (current.key === key) return { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
  return { key, dir: key === 'issuedAt' || key === 'dueAt' || key === 'total' ? 'desc' : 'asc' }
}

// ── Saved views ───────────────────────────────────────────────────────────

export interface SavedView {
  readonly id: string
  readonly label: string
  readonly query: Partial<ListQuery>
}

export const SAVED_VIEWS: readonly SavedView[] = [
  { id: 'all', label: 'All invoices', query: {} },
  { id: 'attention', label: 'Needs attention', query: { statuses: ['overdue', 'pending'], sort: { key: 'dueAt', dir: 'asc' } } },
  { id: 'large', label: 'Over $10k', query: { minAmount: 10_000, sort: { key: 'total', dir: 'desc' } } },
  { id: 'drafts', label: 'Drafts', query: { statuses: ['draft'] } },
]

export function viewQuery(view: SavedView): ListQuery {
  return { ...DEFAULT_QUERY, ...view.query }
}

// ── Filter chips ──────────────────────────────────────────────────────────

export interface FilterChip {
  readonly id: string
  readonly label: string
  /** The query with this one filter removed. */
  readonly remove: (query: ListQuery) => ListQuery
}

/** One removable chip per active filter, in a stable order. */
export function activeChips(query: ListQuery, ownerName: (id: string) => string): FilterChip[] {
  const chips: FilterChip[] = []
  for (const status of query.statuses) {
    chips.push({ id: `status-${status}`, label: `Status: ${STATUS_LABEL[status]}`, remove: (q) => ({ ...q, statuses: q.statuses.filter((s) => s !== status) }) })
  }
  if (query.owner !== null) {
    chips.push({ id: 'owner', label: `Owner: ${ownerName(query.owner)}`, remove: (q) => ({ ...q, owner: null }) })
  }
  if (query.minAmount !== null) {
    chips.push({ id: 'amount', label: `Amount ≥ ${formatMoney(query.minAmount).replace(/\.00$/, '')}`, remove: (q) => ({ ...q, minAmount: null }) })
  }
  for (const tag of query.tags) {
    chips.push({ id: `tag-${tag}`, label: `Tag: ${tag}`, remove: (q) => ({ ...q, tags: q.tags.filter((t) => t !== tag) }) })
  }
  return chips
}

// ── Row helpers ───────────────────────────────────────────────────────────

/** "Due in 5 days", "3 days late", "Due today", or "Paid" for settled invoices. */
export function dueLabel(invoice: Invoice, now: Date = TODAY): { text: string; late: boolean } {
  if (invoice.status === 'paid' || invoice.status === 'void') return { text: invoice.status === 'paid' ? 'Settled' : 'Cancelled', late: false }
  const days = Math.round((startOfDay(invoice.dueAt) - startOfDay(now)) / 86_400_000)
  if (days === 0) return { text: 'Due today', late: false }
  if (days > 0) return { text: `Due in ${days} ${days === 1 ? 'day' : 'days'}`, late: false }
  return { text: `${-days} ${days === -1 ? 'day' : 'days'} late`, late: true }
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

/** Share of the invoice already collected (0..1). Deterministic per invoice for the mock. */
export function collectedRatio(invoice: Invoice): number {
  switch (invoice.status) {
    case 'paid':
      return 1
    case 'void':
    case 'draft':
      return 0
    default:
      // Some open invoices are part-paid (instalments); derive it from the number so it is stable.
      return (Number(invoice.id) * 37) % 100 < 35 ? ((Number(invoice.id) * 13) % 60) / 100 + 0.2 : 0
  }
}
