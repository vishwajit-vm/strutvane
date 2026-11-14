/**
 * The invoice form's values, defaults and validation, kept out of the component so the rules are
 * unit-tested on their own and the screen stays about layout.
 */
import { type Invoice, type PaymentTerms } from '../../data/invoices.ts'
import type { Customer } from '../../data/people.ts'
import type { Currency } from '../../lib/format.ts'

export interface InvoiceFormValues {
  customer: Customer | null
  email: string
  reference: string
  number: string
  /** `YYYY-MM-DD`, the native date input's format. */
  issuedAt: string
  dueAt: string
  currency: Currency
  /** As typed, e.g. `18,420.00`; parsed by {@link parseAmount}. */
  amount: string
  terms: PaymentTerms
  notes: string
  tags: string[]
  autoSend: boolean
  reminders: boolean
  partial: boolean
}

export type InvoiceFormErrors = Partial<Record<keyof InvoiceFormValues, string>>

export const TERMS_DAYS: Record<PaymentTerms, number> = { due: 0, net15: 15, net30: 30, net60: 60 }

export const NOTES_LIMIT = 500

/** `2026-11-14` plus `days`, still as `YYYY-MM-DD` (UTC, so no daylight-saving surprises). */
export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  parsed.setUTCDate(parsed.getUTCDate() + days)
  return parsed.toISOString().slice(0, 10)
}

/** `18,420.50` → 1842050 (minor units), or `null` when it is not a positive amount. */
export function parseAmount(text: string): number | null {
  const cleaned = text.replace(/,/g, '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null
  const minor = Math.round(Number(cleaned) * 100)
  return minor > 0 ? minor : null
}

/** Blank values for a new invoice, numbered after the latest one. */
export function emptyValues(): InvoiceFormValues {
  return {
    customer: null,
    email: '',
    reference: '',
    number: 'INV-2279',
    issuedAt: '2026-11-14',
    dueAt: addDays('2026-11-14', 30),
    currency: 'EUR',
    amount: '',
    terms: 'net30',
    notes: '',
    tags: [],
    autoSend: true,
    reminders: true,
    partial: false,
  }
}

/** Values for editing an existing invoice. */
export function valuesFrom(invoice: Invoice): InvoiceFormValues {
  return {
    customer: invoice.customer,
    email: invoice.customer.email,
    reference: 'PO-88213',
    number: invoice.number,
    issuedAt: invoice.issuedAt.slice(0, 10),
    dueAt: invoice.dueAt.slice(0, 10),
    currency: invoice.currency,
    amount: (invoice.amount / 100).toLocaleString('en-GB', { minimumFractionDigits: 2 }),
    terms: invoice.terms,
    notes: 'Thank you for your business. Payment by SEPA transfer to the account on the invoice.',
    tags: [...invoice.tags],
    autoSend: false,
    reminders: true,
    partial: false,
  }
}

/**
 * Validate the whole form. Messages say what to do, not just what is wrong
 * ("Choose a due date on or after the issue date").
 */
export function validateInvoice(values: InvoiceFormValues): InvoiceFormErrors {
  const errors: InvoiceFormErrors = {}
  if (values.customer === null) errors.customer = 'Choose the customer to bill.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter the e-mail address the invoice is sent to.'
  if (!/^INV-\d{4,}$/.test(values.number.trim())) errors.number = 'Use the format INV- followed by at least 4 digits, e.g. INV-2279.'
  if (values.issuedAt === '') errors.issuedAt = 'Choose an issue date.'
  if (values.dueAt === '') errors.dueAt = 'Choose a due date.'
  else if (values.issuedAt !== '' && values.dueAt < values.issuedAt) errors.dueAt = 'Choose a due date on or after the issue date.'
  if (parseAmount(values.amount) === null) errors.amount = values.amount.trim() === '' ? 'Enter the amount to bill.' : 'Enter a positive amount with at most two decimals.'
  if (values.notes.length > NOTES_LIMIT) errors.notes = `Keep notes under ${NOTES_LIMIT} characters.`
  return errors
}

/** Field order on screen; the first invalid field in this order receives focus. */
export const FIELD_ORDER: readonly (keyof InvoiceFormValues)[] = ['customer', 'email', 'reference', 'number', 'issuedAt', 'dueAt', 'currency', 'amount', 'terms', 'notes', 'tags']

export const FIELD_LABELS: Partial<Record<keyof InvoiceFormValues, string>> = {
  customer: 'Customer',
  email: 'Billing e-mail',
  number: 'Invoice number',
  issuedAt: 'Issue date',
  dueAt: 'Due date',
  amount: 'Amount',
  notes: 'Notes',
}
