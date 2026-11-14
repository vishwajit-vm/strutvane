/**
 * Mock invoices: the resource behind the list, form, detail, dashboard and kanban screens.
 *
 * Generated from a fixed seed so every load shows the same 86 varied rows: different customers,
 * amounts from a few hundred to tens of thousands, every status, and due dates around "today".
 */
import { TODAY } from '../lib/format.ts'
import { seeded } from '../lib/random.ts'
import { TEAM, type Person } from './people.ts'

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft' | 'void'

export const INVOICE_STATUSES: readonly InvoiceStatus[] = ['paid', 'pending', 'overdue', 'draft', 'void']

export interface Customer {
  readonly id: string
  readonly name: string
  readonly contact: string
  readonly email: string
  readonly city: string
  readonly industry: string
}

export interface LineItem {
  readonly description: string
  readonly quantity: number
  readonly unitPrice: number
}

export interface Invoice {
  readonly id: string
  /** Human number, e.g. "INV-2026-0142". */
  readonly number: string
  readonly customer: Customer
  readonly owner: Person
  readonly status: InvoiceStatus
  readonly currency: 'USD'
  readonly issuedAt: Date
  readonly dueAt: Date
  readonly items: readonly LineItem[]
  /** Sum of the line items plus tax. */
  readonly total: number
  readonly tax: number
  readonly tags: readonly string[]
  readonly notes: string
}

export const CUSTOMERS: readonly Customer[] = [
  { id: 'c1', name: 'Larkspur Analytics', contact: 'Nadia Farouk', email: 'billing@larkspur.example', city: 'Austin', industry: 'Software' },
  { id: 'c2', name: 'Northgate Freight', contact: 'Tom Albright', email: 'ap@northgate.example', city: 'Rotterdam', industry: 'Logistics' },
  { id: 'c3', name: 'Copperleaf Studio', contact: 'Iris Moreau', email: 'iris@copperleaf.example', city: 'Lyon', industry: 'Design' },
  { id: 'c4', name: 'Meridian Health Labs', contact: 'Dr. Kwame Mensah', email: 'finance@meridian.example', city: 'Boston', industry: 'Healthcare' },
  { id: 'c5', name: 'Quarry & Pine', contact: 'Ben Hollis', email: 'ben@quarrypine.example', city: 'Portland', industry: 'Retail' },
  { id: 'c6', name: 'Solace Robotics', contact: 'Yuki Sato', email: 'accounts@solace.example', city: 'Osaka', industry: 'Manufacturing' },
  { id: 'c7', name: 'Fernwood Dental Group', contact: 'Rachel Kim', email: 'office@fernwood.example', city: 'Denver', industry: 'Healthcare' },
  { id: 'c8', name: 'Tidewater Energy', contact: 'Marcus Webb', email: 'ap@tidewater.example', city: 'Houston', industry: 'Energy' },
  { id: 'c9', name: 'Atlas Kitchens', contact: 'Lena Vogel', email: 'lena@atlaskitchens.example', city: 'Munich', industry: 'Hospitality' },
  { id: 'c10', name: 'Brightwell Schools', contact: 'Ana Lucía Torres', email: 'bursar@brightwell.example', city: 'Madrid', industry: 'Education' },
  { id: 'c11', name: 'Juniper Legal LLP', contact: 'Edward Price', email: 'eprice@juniper.example', city: 'London', industry: 'Legal' },
  { id: 'c12', name: 'Kestrel Aviation', contact: 'Sam Okoro', email: 'finance@kestrel.example', city: 'Lagos', industry: 'Aviation' },
  { id: 'c13', name: 'Oakline Architecture', contact: 'Mia Lindqvist', email: 'mia@oakline.example', city: 'Stockholm', industry: 'Architecture' },
  { id: 'c14', name: 'Vantage Print Co.', contact: 'Raj Malhotra', email: 'raj@vantage.example', city: 'Pune', industry: 'Printing' },
  { id: 'c15', name: 'Saffron Hospitality', contact: 'Leila Haddad', email: 'ap@saffron.example', city: 'Dubai', industry: 'Hospitality' },
  { id: 'c16', name: 'Ironbark Construction', contact: 'Jack Thornton', email: 'jack@ironbark.example', city: 'Brisbane', industry: 'Construction' },
  { id: 'c17', name: 'Bluefin Marine Supply', contact: 'Chloé Dubois', email: 'compta@bluefin.example', city: 'Marseille', industry: 'Wholesale' },
  { id: 'c18', name: 'Harbor & Main Outfitters', contact: 'Olivia Grant', email: 'olivia@harbormain.example', city: 'Halifax', industry: 'Retail' },
]

/** The catalogue items invoices are built from (also the dashboard's "top items"). */
export const CATALOGUE = [
  { name: 'Platform licence (annual)', price: 12_000 },
  { name: 'Implementation package', price: 8_500 },
  { name: 'Premium support (12 months)', price: 4_200 },
  { name: 'Data migration', price: 3_150 },
  { name: 'Training workshop (on-site)', price: 1_800 },
  { name: 'Custom integration', price: 6_400 },
  { name: 'API usage overage', price: 0.04 },
  { name: 'Hardware kit: scanner bundle', price: 649 },
] as const

const TAGS = ['Q4', 'Renewal', 'Enterprise', 'Net 30', 'Priority', 'EU VAT', 'Partner', 'Upsell'] as const

const NOTES = [
  'Payment by bank transfer. Please quote the invoice number as the reference.',
  'Thank you for your business! Early payment within 10 days earns a 2% discount.',
  'Includes the onboarding milestones agreed on the kickoff call.',
  'Purchase order reference is printed on page 2.',
  '',
] as const

function daysFrom(date: Date, days: number): Date {
  const copy = new Date(date)
  copy.setDate(copy.getDate() + days)
  return copy
}

function buildInvoices(): Invoice[] {
  const random = seeded(2026_11_14)
  const owners = TEAM.filter((person) => person.role !== 'Viewer' && person.status === 'active')
  const invoices: Invoice[] = []
  for (let index = 0; index < 86; index++) {
    const customer = CUSTOMERS[random.between(0, CUSTOMERS.length - 1)] ?? CUSTOMERS[0]
    const owner = owners[random.between(0, owners.length - 1)] ?? owners[0]
    if (customer === undefined || owner === undefined) continue
    const issuedAt = daysFrom(TODAY, -random.between(0, 170))
    const dueAt = daysFrom(issuedAt, random.pick([14, 30, 30, 45, 60] as const))
    const itemCount = random.between(1, 4)
    const items: LineItem[] = []
    for (let line = 0; line < itemCount; line++) {
      const product = CATALOGUE[random.between(0, CATALOGUE.length - 1)] ?? CATALOGUE[0]
      const isUsage = product.price < 1
      items.push({
        description: product.name,
        quantity: isUsage ? random.between(5_000, 90_000) : random.between(1, 3),
        // Prices vary a little per customer (discounts, regional pricing).
        unitPrice: isUsage ? product.price : Math.round(product.price * (0.85 + random.next() * 0.3) * 100) / 100,
      })
    }
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
    const tax = Math.round(subtotal * 0.08 * 100) / 100
    const status = statusFor(dueAt, random.next())
    invoices.push({
      id: String(1042 + index),
      number: `INV-2026-${String(1042 + index).padStart(4, '0')}`,
      customer,
      owner,
      status,
      currency: 'USD',
      issuedAt,
      dueAt,
      items,
      tax,
      total: Math.round((subtotal + tax) * 100) / 100,
      tags: TAGS.filter(() => random.chance(0.18)).slice(0, 3),
      notes: random.pick(NOTES),
    })
  }
  // Newest first, like the list's default sort.
  return invoices.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
}

/** A realistic status: past-due unpaid invoices are overdue, a few are drafts or voided. */
function statusFor(dueAt: Date, roll: number): InvoiceStatus {
  if (roll < 0.06) return 'void'
  if (roll < 0.16) return 'draft'
  const pastDue = dueAt.getTime() < TODAY.getTime()
  if (pastDue) return roll < 0.78 ? 'paid' : 'overdue'
  return roll < 0.45 ? 'paid' : 'pending'
}

export const INVOICES: readonly Invoice[] = buildInvoices()

/** Find one invoice by id (the detail and edit screens). */
export function findInvoice(id: string | undefined): Invoice | undefined {
  return INVOICES.find((invoice) => invoice.id === id)
}

/** Human labels for each status. */
export const STATUS_LABEL: Readonly<Record<InvoiceStatus, string>> = {
  paid: 'Paid',
  pending: 'Pending',
  overdue: 'Overdue',
  draft: 'Draft',
  void: 'Void',
}
