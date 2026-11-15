/**
 * The few pure rules behind the screens: list filtering/sorting/paging, form validation and the
 * mock data's internal consistency (an "overdue" invoice really is past due).
 */
import { describe, expect, it } from 'vitest'
import { invoices } from '../src/data/invoices.ts'
import { daysUntil, formatPercentChange, initials } from '../src/lib/format.ts'
import { matchPath } from '../src/lib/router.tsx'
import { passwordStrength } from '../src/screens/account/settings-tabs.tsx'
import { validateSignIn } from '../src/screens/auth/SignInPage.tsx'
import { validateInvoice } from '../src/screens/invoices/InvoiceFormPage.tsx'
import { filterInvoices, NO_FILTERS, pageWindow, paginate, sortInvoices } from '../src/screens/invoices/list-model.ts'

describe('mock data tells a consistent story', () => {
  it('has 64 invoices whose statuses agree with their dates and payments', () => {
    expect(invoices).toHaveLength(64)
    for (const invoice of invoices) {
      if (invoice.status === 'overdue') expect(daysUntil(invoice.dueAt)).toBeLessThan(0)
      if (invoice.status === 'paid') expect(invoice.paid).toBe(invoice.amount)
      if (invoice.status === 'partial') expect(invoice.paid).toBeGreaterThan(0)
      expect(invoice.amount).toBe(invoice.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0))
    }
  })
})

describe('invoice list model', () => {
  it('filters by search across number, customer and email', () => {
    const first = invoices[0]
    expect(first).toBeDefined()
    const found = filterInvoices(invoices, { ...NO_FILTERS, search: first?.id ?? '' })
    expect(found.map((invoice) => invoice.id)).toEqual([first?.id])
  })

  it('combines amount and overdue-age filters', () => {
    const big = filterInvoices(invoices, { ...NO_FILTERS, minAmount: 10_000 })
    expect(big.length).toBeGreaterThan(0)
    expect(big.every((invoice) => invoice.amount >= 10_000)).toBe(true)
    const late = filterInvoices(invoices, { ...NO_FILTERS, overdueOnlyDays: 30 })
    expect(late.every((invoice) => invoice.status === 'overdue' && -daysUntil(invoice.dueAt) >= 30)).toBe(true)
  })

  it('sorts both ways and pages with clamping', () => {
    const ascending = sortInvoices(invoices, { key: 'amount', direction: 'asc' })
    expect(ascending[0]?.amount).toBeLessThanOrEqual(ascending.at(-1)?.amount ?? 0)
    const page = paginate(ascending, 99, 10)
    expect(page).toMatchObject({ page: 7, from: 61, to: 64 })
    expect(paginate([], 1, 10)).toMatchObject({ page: 1, from: 0, to: 0, pageCount: 1 })
  })

  it('shows first, last and neighbours with gaps in the pager', () => {
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10])
    expect(pageWindow(1, 3)).toEqual([1, 2, 3])
  })
})

describe('validation messages say how to fix the problem', () => {
  it('sign-in', () => {
    expect(validateSignIn('', '')).toEqual({ email: 'Enter your work email.', password: 'Enter your password.' })
    expect(validateSignIn('amara@', 'short').email).toMatch(/name@company\.com/)
    expect(validateSignIn('amara@halyard.io', 'long enough')).toEqual({})
  })

  it('invoice form', () => {
    const values = { customer: null, number: 'INV-1', issued: '2026-11-14', due: '2026-11-01', currency: 'USD', terms: 'net30', amount: '0', taxRate: '120', owner: 'usr_01', description: '', tags: [], reminders: true, partial: false, cards: true }
    expect(Object.keys(validateInvoice(values)).sort()).toEqual(['amount', 'customer', 'due', 'taxRate'])
  })

  it('password strength grows with length and variety', () => {
    expect(passwordStrength('short')).toBe(0)
    expect(passwordStrength('Correct-Horse-9-Battery')).toBe(4)
  })
})

describe('helpers', () => {
  it('format and match', () => {
    expect(initials('Maya Okafor')).toBe('MO')
    expect(initials('Northwind')).toBe('NO')
    expect(formatPercentChange(-4.3)).toBe('−4.3%')
    expect(matchPath('/invoices/:id', '/invoices/INV-1042')).toEqual({ id: 'INV-1042' })
    expect(matchPath('/invoices/:id', '/invoices')).toBeNull()
    // Malformed percent-encoding in a param is "no match", never a thrown URIError (blank screen).
    for (const bad of ['/invoices/%E0%A4%A', '/invoices/%', '/invoices/50%', '/invoices/%ZZ/edit'])
      expect(() => matchPath('/invoices/:id', bad), bad).not.toThrow()
    expect(matchPath('/invoices/:id', '/invoices/%E0%A4%A')).toBeNull()
  })
})
