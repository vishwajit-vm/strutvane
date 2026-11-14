/**
 * Invoices: the one resource the mockup is built around. 238 deterministic records with a
 * realistic mix of statuses, amounts, currencies, owners and due dates, plus the pure query
 * function the list, board, calendar and command palette all share.
 */
import { type Currency, daysFromNow, NOW } from '../lib/format.ts'
import { type Customer, customers, type Member, members } from './people.ts'
import { seeded } from './random.ts'

export type InvoiceStatus = 'draft' | 'open' | 'overdue' | 'paid' | 'void'

/** Status order on the board and in the status breakdown: the life of an invoice, left to right. */
export const STATUSES: readonly InvoiceStatus[] = ['draft', 'open', 'overdue', 'paid', 'void']

export const STATUS_LABELS: Record<InvoiceStatus, string> = { draft: 'Draft', open: 'Open', overdue: 'Overdue', paid: 'Paid', void: 'Void' }

export type PaymentTerms = 'due' | 'net15' | 'net30' | 'net60'

export const TERMS_LABELS: Record<PaymentTerms, string> = { due: 'Due on receipt', net15: 'Net 15', net30: 'Net 30', net60: 'Net 60' }

const TERMS_DAYS: Record<PaymentTerms, number> = { due: 0, net15: 15, net30: 30, net60: 60 }

export interface Invoice {
  /** URL id, e.g. `inv-2264`. */
  id: string
  /** Display number, e.g. `INV-2264`. */
  number: string
  customer: Customer
  owner: Member
  status: InvoiceStatus
  /** Total in minor units (cents). */
  amount: number
  currency: Currency
  issuedAt: string
  dueAt: string
  terms: PaymentTerms
  tags: string[]
}

export const TAGS = ['Enterprise', 'Renewal', 'Services', 'Hardware', 'Q4', 'Priority', 'EU VAT', 'Milestone'] as const

const COUNT = 238
const LATEST_NUMBER = 2278
const DAY = 86_400_000

/** The record the detail and edit screens open by default; an open invoice with a full history. */
export const FEATURED_INVOICE_ID = 'inv-2264'

function isoDaysAgo(days: number, hour: number): string {
  const date = new Date(NOW.getTime() - days * DAY)
  date.setUTCHours(hour, 0, 0, 0)
  return date.toISOString()
}

function statusFor(dueAt: string, issuedDaysAgo: number, roll: number): InvoiceStatus {
  if (issuedDaysAgo <= 4 && roll < 0.45) return 'draft'
  if (roll > 0.97) return 'void'
  const overdue = daysFromNow(dueAt) < 0
  if (overdue) return roll < 0.16 ? 'overdue' : 'paid'
  return roll < 0.35 ? 'paid' : 'open'
}

function generate(): Invoice[] {
  const random = seeded(2026)
  const pool = members.filter((member) => member.status === 'active' && member.role !== 'viewer') as [Member, ...Member[]]
  const rows: Invoice[] = []
  let daysAgo = 0
  for (let index = 0; index < COUNT; index += 1) {
    const number = LATEST_NUMBER - index
    daysAgo += random.next() * 1.6
    const issuedDaysAgo = Math.floor(daysAgo)
    const terms = random.pick<PaymentTerms>(['net30', 'net30', 'net15', 'net60', 'due'])
    const issuedAt = isoDaysAgo(issuedDaysAgo, random.int(8, 17))
    const dueAt = new Date(new Date(issuedAt).getTime() + TERMS_DAYS[terms] * DAY).toISOString()
    // Log-uniform amounts between ~€350 and ~€48,000 read like real B2B invoices.
    const amount = Math.round(Math.exp(Math.log(35_000) + random.next() * Math.log(4_800_000 / 35_000)) / 100) * 100
    const tagCount = random.int(0, 2)
    const tags = Array.from(new Set(Array.from({ length: tagCount }, () => random.pick(TAGS))))
    rows.push({
      id: `inv-${number}`,
      number: `INV-${number}`,
      customer: random.pick(customers),
      owner: random.pick(pool),
      status: statusFor(dueAt, issuedDaysAgo, random.next()),
      amount,
      currency: random.chance(0.78) ? 'EUR' : random.pick<Currency>(['USD', 'GBP']),
      issuedAt,
      dueAt,
      terms,
      tags,
    })
  }
  return rows.map((row) => (row.id === FEATURED_INVOICE_ID ? featured(row) : row))
}

/** Pin the featured record so the detail screen always shows the same, rich example. */
function featured(row: Invoice): Invoice {
  return {
    ...row,
    customer: customers[0],
    owner: members[1] ?? members[0],
    status: 'open',
    amount: 1_842_000,
    currency: 'EUR',
    terms: 'net30',
    issuedAt: '2026-10-21T10:00:00Z',
    dueAt: '2026-11-20T10:00:00Z',
    tags: ['Enterprise', 'Q4'],
  }
}

/** Every invoice, newest first. Frozen so a screen can never mutate the shared mock by accident. */
export const invoices: readonly Invoice[] = Object.freeze(generate())

export function invoiceById(id: string): Invoice | undefined {
  return invoices.find((invoice) => invoice.id === id)
}

// ---------------------------------------------------------------------------------------------
// Query (search, filter, sort, paginate): pure, so the list, tests and saved views share it.
// ---------------------------------------------------------------------------------------------

export type SortKey = 'number' | 'customer' | 'status' | 'amount' | 'issuedAt' | 'dueAt'

export interface Sort {
  key: SortKey
  direction: 'asc' | 'desc'
}

export interface InvoiceFilters {
  search: string
  statuses: readonly InvoiceStatus[]
  ownerIds: readonly string[]
  /** Minimum amount in major units (euros), or `null` for no minimum. */
  minAmount: number | null
}

export const EMPTY_FILTERS: InvoiceFilters = { search: '', statuses: [], ownerIds: [], minAmount: null }

function compare(a: Invoice, b: Invoice, key: SortKey): number {
  switch (key) {
    case 'number':
      return a.number.localeCompare(b.number)
    case 'customer':
      return a.customer.name.localeCompare(b.customer.name)
    case 'status':
      return STATUSES.indexOf(a.status) - STATUSES.indexOf(b.status)
    case 'amount':
      return a.amount - b.amount
    case 'issuedAt':
      return a.issuedAt.localeCompare(b.issuedAt)
    case 'dueAt':
      return a.dueAt.localeCompare(b.dueAt)
  }
}

/** Apply search and filters (no paging). Search matches number, customer and contact, case-insensitively. */
export function filterInvoices(rows: readonly Invoice[], filters: InvoiceFilters): Invoice[] {
  const needle = filters.search.trim().toLowerCase()
  return rows.filter((row) => {
    if (needle !== '' && !`${row.number} ${row.customer.name} ${row.customer.contact}`.toLowerCase().includes(needle)) return false
    if (filters.statuses.length > 0 && !filters.statuses.includes(row.status)) return false
    if (filters.ownerIds.length > 0 && !filters.ownerIds.includes(row.owner.id)) return false
    if (filters.minAmount !== null && row.amount < filters.minAmount * 100) return false
    return true
  })
}

export interface Page<T> {
  rows: T[]
  total: number
  page: number
  pageCount: number
}

/**
 * Filter, sort (stable, ties broken by number) and slice one page.
 * Out-of-range pages are clamped, so a stale `?page=40` lands on the last page instead of nothing.
 */
export function queryInvoices(rows: readonly Invoice[], filters: InvoiceFilters, sort: Sort, page: number, pageSize: number): Page<Invoice> {
  const matching = filterInvoices(rows, filters)
  const sign = sort.direction === 'asc' ? 1 : -1
  matching.sort((a, b) => compare(a, b, sort.key) * sign || b.number.localeCompare(a.number))
  const pageCount = Math.max(1, Math.ceil(matching.length / pageSize))
  const current = Math.min(Math.max(1, page), pageCount)
  return { rows: matching.slice((current - 1) * pageSize, current * pageSize), total: matching.length, page: current, pageCount }
}

/** A named, shareable combination of filters and sort, shown in the "Saved views" menu. */
export interface SavedView {
  id: string
  name: string
  filters: InvoiceFilters
  sort: Sort
}

export const SAVED_VIEWS: readonly SavedView[] = [
  { id: 'all', name: 'All invoices', filters: EMPTY_FILTERS, sort: { key: 'issuedAt', direction: 'desc' } },
  { id: 'overdue', name: 'Overdue, largest first', filters: { ...EMPTY_FILTERS, statuses: ['overdue'] }, sort: { key: 'amount', direction: 'desc' } },
  { id: 'mine', name: 'My open invoices', filters: { ...EMPTY_FILTERS, statuses: ['open', 'draft'], ownerIds: ['u1', 'u2'] }, sort: { key: 'dueAt', direction: 'asc' } },
  { id: 'large', name: 'Over €10,000', filters: { ...EMPTY_FILTERS, minAmount: 10_000 }, sort: { key: 'amount', direction: 'desc' } },
]

// ---------------------------------------------------------------------------------------------
// Detail data: line items, payments and files, derived deterministically from the invoice.
// ---------------------------------------------------------------------------------------------

export interface LineItem {
  description: string
  quantity: number
  /** Unit price in minor units. */
  unitPrice: number
}

const ITEM_NAMES = ['Platform subscription (annual)', 'Implementation services', 'Premium support', 'Data migration', 'Training workshop', 'Additional seats', 'API usage overage'] as const

/**
 * Split an invoice's total (including 21% VAT) into three line items whose amounts add up exactly,
 * so the totals block on the detail page always reconciles to the cent.
 */
export function lineItemsFor(invoice: Invoice): { items: LineItem[]; subtotal: number; tax: number } {
  const random = seeded(Number(invoice.number.slice(4)))
  const subtotal = Math.round(invoice.amount / 1.21)
  const tax = invoice.amount - subtotal
  const firstShare = Math.round(subtotal * (0.5 + random.next() * 0.2))
  const secondShare = Math.round((subtotal - firstShare) * 0.6)
  const shares = [firstShare, secondShare, subtotal - firstShare - secondShare]
  const names = [...ITEM_NAMES].sort(() => random.next() - 0.5)
  const items = shares.map((share, index) => {
    const quantity = index === 1 ? random.int(2, 6) : 1
    // Keep quantity × unit price exact: fall back to quantity 1 when the share does not divide.
    const exact = share % quantity === 0
    return { description: names[index] ?? 'Services', quantity: exact ? quantity : 1, unitPrice: exact ? share / quantity : share }
  })
  return { items, subtotal, tax }
}

/** All invoices for one customer, newest first (the "Related" tab). */
export function invoicesForCustomer(customerId: string): Invoice[] {
  return invoices.filter((invoice) => invoice.customer.id === customerId)
}

/** Totals per status for the dashboard breakdown and the board column headers. */
export function totalsByStatus(rows: readonly Invoice[]): Record<InvoiceStatus, { count: number; amount: number }> {
  const totals = Object.fromEntries(STATUSES.map((status) => [status, { count: 0, amount: 0 }])) as Record<InvoiceStatus, { count: number; amount: number }>
  for (const row of rows) {
    totals[row.status].count += 1
    totals[row.status].amount += row.amount
  }
  return totals
}
