/**
 * The invoice form's values, defaults, validation and totals: pure functions, unit-tested.
 *
 * Messages are friendly and say how to fix the problem (the project's error-message standard).
 *
 * @example
 *   const errors = validateInvoice(values)   // { customer: 'Choose who this invoice is for.' }
 *   const { subtotal, tax, total } = totals(values)
 */
import { CUSTOMERS, type Customer, type Invoice } from '../../../data/invoices.ts'
import { TODAY, toDateInput } from '../../../lib/format.ts'
import type { PickedFile } from './inputs.tsx'

export interface LineDraft {
  readonly key: string
  readonly description: string
  readonly quantity: string
  readonly unitPrice: string
}

export interface InvoiceValues {
  readonly customer: Customer | null
  readonly number: string
  readonly reference: string
  readonly issuedAt: string
  readonly dueAt: string
  readonly terms: string
  readonly taxRate: string
  readonly lines: readonly LineDraft[]
  readonly notes: string
  readonly tags: readonly string[]
  readonly files: readonly PickedFile[]
  readonly reminders: boolean
  readonly partialPayments: boolean
}

export type InvoiceErrors = Partial<Record<'customer' | 'issuedAt' | 'dueAt' | 'lines' | 'notes', string>> & {
  readonly lineErrors?: Readonly<Record<string, Partial<Record<'description' | 'quantity' | 'unitPrice', string>>>>
}

export const NOTES_LIMIT = 500

let lineCounter = 0
/** A fresh, empty line with a unique key (keys keep React rows stable when lines are removed). */
export function newLine(partial: Partial<Omit<LineDraft, 'key'>> = {}): LineDraft {
  lineCounter += 1
  return { key: `line-${String(lineCounter)}`, description: '', quantity: '1', unitPrice: '', ...partial }
}

export function emptyInvoice(): InvoiceValues {
  const due = new Date(TODAY)
  due.setDate(due.getDate() + 30)
  return {
    customer: null,
    number: 'INV-2026-1128',
    reference: '',
    issuedAt: toDateInput(TODAY),
    dueAt: toDateInput(due),
    terms: 'net30',
    taxRate: '8',
    lines: [newLine()],
    notes: '',
    tags: [],
    files: [],
    reminders: true,
    partialPayments: false,
  }
}

export function valuesFromInvoice(invoice: Invoice): InvoiceValues {
  return {
    customer: invoice.customer,
    number: invoice.number,
    reference: 'PO-48213',
    issuedAt: toDateInput(invoice.issuedAt),
    dueAt: toDateInput(invoice.dueAt),
    terms: 'net30',
    taxRate: '8',
    lines: invoice.items.map((item) => newLine({ description: item.description, quantity: String(item.quantity), unitPrice: item.unitPrice.toFixed(2) })),
    notes: invoice.notes,
    tags: invoice.tags,
    files: [],
    reminders: true,
    partialPayments: invoice.total > 10_000,
  }
}

function parseNumber(text: string): number {
  const value = Number(text.replace(/,/g, ''))
  return Number.isFinite(value) ? value : Number.NaN
}

export function totals(values: InvoiceValues): { subtotal: number; tax: number; total: number } {
  const subtotal = values.lines.reduce((sum, line) => {
    const amount = parseNumber(line.quantity) * parseNumber(line.unitPrice)
    return Number.isFinite(amount) ? sum + amount : sum
  }, 0)
  const rate = parseNumber(values.taxRate)
  const tax = Math.round(subtotal * (Number.isFinite(rate) ? rate : 0)) / 100
  return { subtotal, tax, total: subtotal + tax }
}

/** Every problem at once (so the user fixes them in one pass), keyed by field. */
export function validateInvoice(values: InvoiceValues): InvoiceErrors {
  const errors: Partial<Record<'customer' | 'issuedAt' | 'dueAt' | 'lines' | 'notes', string>> = {}
  const lineErrors: Record<string, Partial<Record<'description' | 'quantity' | 'unitPrice', string>>> = {}
  if (values.customer === null) errors.customer = 'Choose who this invoice is for.'
  if (values.issuedAt === '') errors.issuedAt = 'Pick the issue date.'
  if (values.dueAt === '') errors.dueAt = 'Pick a due date.'
  else if (values.issuedAt !== '' && values.dueAt < values.issuedAt) errors.dueAt = 'The due date can’t be before the issue date.'
  if (values.notes.length > NOTES_LIMIT) errors.notes = `Keep notes under ${NOTES_LIMIT} characters (now ${values.notes.length}).`
  for (const line of values.lines) {
    const problems: Partial<Record<'description' | 'quantity' | 'unitPrice', string>> = {}
    if (line.description.trim() === '') problems.description = 'Describe the item.'
    const quantity = parseNumber(line.quantity)
    if (!(quantity > 0)) problems.quantity = 'Use a quantity above 0.'
    const price = parseNumber(line.unitPrice)
    if (line.unitPrice === '' || !(price >= 0)) problems.unitPrice = 'Enter a price.'
    if (Object.keys(problems).length > 0) lineErrors[line.key] = problems
  }
  if (values.lines.length === 0) errors.lines = 'Add at least one line item.'
  return Object.keys(lineErrors).length > 0 ? { ...errors, lineErrors } : errors
}

export function hasErrors(errors: InvoiceErrors): boolean {
  return Object.keys(errors).length > 0
}

/** The mock "server" search for the relation select: a little latency, case-insensitive. */
export function searchCustomers(term: string): Promise<readonly Customer[]> {
  const needle = term.toLowerCase().trim()
  const found = CUSTOMERS.filter((customer) => `${customer.name} ${customer.city} ${customer.industry}`.toLowerCase().includes(needle)).slice(0, 8)
  return new Promise((resolve) => window.setTimeout(() => resolve(found), 320))
}
