/**
 * Mock invoices: 64 records generated from a fixed seed, with statuses that agree with their dates
 * (an "overdue" invoice really is past due on {@link TODAY}, a "paid" one has a payment) so every
 * screen tells a consistent story.
 *
 * @module
 */
import { TODAY } from '../lib/format.ts'
import { seeded } from '../lib/random.ts'
import { customers, team, type Customer, type Member } from './people.ts'

/** Lifecycle of an invoice. */
export type InvoiceStatus = 'draft' | 'pending' | 'partial' | 'paid' | 'overdue'

/** Every status, in the order columns and legends show them. */
export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['draft', 'pending', 'partial', 'paid', 'overdue']

export type PaymentMethod = 'Card' | 'Bank transfer' | 'Direct debit' | 'PayPal'

/** One billable line. */
export interface LineItem {
  readonly description: string
  readonly quantity: number
  readonly unitPrice: number
}

export interface Invoice {
  readonly id: string
  readonly customer: Customer
  readonly owner: Member
  readonly issuedAt: Date
  readonly dueAt: Date
  readonly status: InvoiceStatus
  readonly method: PaymentMethod
  readonly items: readonly LineItem[]
  /** Sum of the line items. */
  readonly amount: number
  /** Amount received so far. */
  readonly paid: number
  readonly tags: readonly string[]
}

const SERVICES: readonly [readonly [string, number], ...(readonly [string, number])[]] = [
  ['Platform subscription · Growth plan', 1_290],
  ['Platform subscription · Enterprise plan', 4_800],
  ['Platform subscription · Starter plan', 390],
  ['Additional seats', 49],
  ['Onboarding workshop (2 days)', 2_400],
  ['Priority support (quarterly)', 1_150],
  ['Data migration service', 3_200],
  ['Custom report pack', 680],
  ['API overage (per 10k calls)', 35],
]

const TAGS: readonly [string, ...string[]] = ['Q4', 'Renewal', 'Enterprise', 'Upsell', 'EU VAT', 'Net 30', 'Priority']
const METHODS: readonly [PaymentMethod, ...PaymentMethod[]] = ['Card', 'Bank transfer', 'Direct debit', 'PayPal']

const addDays = (date: Date, days: number): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, 9, 0)

function makeItems(random: ReturnType<typeof seeded>): LineItem[] {
  const count = random.int(1, 4)
  const items: LineItem[] = []
  for (let index = 0; index < count; index += 1) {
    const [description, unitPrice] = random.pick(SERVICES)
    if (items.some((item) => item.description === description)) continue
    const perUnit = unitPrice < 100
    items.push({ description, quantity: perUnit ? random.int(5, 40) : random.int(1, 3), unitPrice })
  }
  return items
}

/** Pick a status that is true to the dates: past-due invoices are paid, partial or overdue. */
function statusFor(dueAt: Date, random: ReturnType<typeof seeded>): InvoiceStatus {
  const roll = random.next()
  if (dueAt.getTime() < TODAY.getTime()) return roll < 0.62 ? 'paid' : roll < 0.85 ? 'overdue' : 'partial'
  return roll < 0.5 ? 'pending' : roll < 0.7 ? 'paid' : roll < 0.86 ? 'draft' : 'partial'
}

function generate(): Invoice[] {
  const random = seeded(17)
  const invoices: Invoice[] = []
  for (let index = 0; index < 64; index += 1) {
    const issuedAt = addDays(TODAY, -random.int(0, 100))
    const dueAt = addDays(issuedAt, random.pick([14, 30, 30, 45] as const))
    const items = makeItems(random)
    const amount = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const status = statusFor(dueAt, random)
    const paid = status === 'paid' ? amount : status === 'partial' ? Math.round(amount * random.pick([0.25, 0.4, 0.5, 0.6] as const)) : 0
    const owner = team[random.int(0, 6)] ?? team[0]
    if (owner === undefined) throw new Error('team mock data is empty')
    invoices.push({
      id: `INV-${1001 + index}`,
      customer: random.pick(customers),
      owner,
      issuedAt,
      dueAt,
      status,
      method: random.pick(METHODS),
      items,
      amount,
      paid,
      tags: random.next() < 0.6 ? [...new Set([random.pick(TAGS), random.pick(TAGS)])] : [],
    })
  }
  // Newest first, like the real list's default sort.
  return invoices.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
}

/** All mock invoices, newest first. */
export const invoices: readonly Invoice[] = generate()

/** Balance still owed on an invoice. */
export const balanceOf = (invoice: Invoice): number => invoice.amount - invoice.paid

/** Find one invoice by id. */
export function findInvoice(id: string): Invoice | undefined {
  return invoices.find((invoice) => invoice.id === id)
}

/**
 * The invoice the detail and edit screens open by default: a partly paid one, because it shows
 * every part of the design (payments, balance, reminders) at once.
 */
export const featuredInvoice: Invoice = invoices.find((invoice) => invoice.status === 'partial' && invoice.items.length >= 2) ?? (invoices[0] as Invoice)

/** Count of invoices per status. */
export function countByStatus(list: readonly Invoice[] = invoices): Record<InvoiceStatus, number> {
  const counts: Record<InvoiceStatus, number> = { draft: 0, pending: 0, partial: 0, paid: 0, overdue: 0 }
  for (const invoice of list) counts[invoice.status] += 1
  return counts
}
