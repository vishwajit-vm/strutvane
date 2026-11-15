/**
 * Pure logic behind the screens: formatting, routing helpers, list state from the URL, the query
 * engine, pagination windows, form validation, the month grid and small validators.
 */
import { describe, expect, it } from 'vitest'
import { validateFile } from '../src/components/form/file-drop.tsx'
import { sparkPath } from '../src/components/sparkline.tsx'
import { EMPTY_FILTERS, invoices, lineItemsFor, queryInvoices, totalsByStatus } from '../src/data/invoices.ts'
import { formatBytes, formatDelta, formatDue, formatMoney, formatRelative, initials, plural } from '../src/lib/format.ts'
import { matchPath, withParams } from '../src/lib/router.tsx'
import { monthGrid, shiftMonth } from '../src/screens/calendar/month.ts'
import { addDays, emptyValues, parseAmount, validateInvoice } from '../src/screens/invoices/form-model.ts'
import { activeFilterCount, pageWindow, readListState } from '../src/screens/invoices/list-state.ts'
import { passwordScore } from '../src/screens/settings/Security.tsx'
import { validateSignIn } from '../src/screens/auth/SignIn.tsx'
import { customers } from '../src/data/people.ts'

describe('format', () => {
  it('money: minor units, narrow symbols, compact with upper-case suffixes', () => {
    expect(formatMoney(1_842_000, 'EUR')).toBe('€18,420.00')
    expect(formatMoney(774_000, 'USD')).toBe('$7,740.00')
    expect(formatMoney(1_850_000, 'EUR', true)).toBe('€18.5K')
    expect(formatMoney(180_000_000, 'EUR', true)).toBe('€1.8M')
  })

  it('deltas use a real minus sign; plurals never say "(s)"', () => {
    expect(formatDelta(12.43)).toBe('+12.4%')
    expect(formatDelta(-3.1)).toBe('−3.1%')
    expect(plural(1, 'invoice')).toBe('1 invoice')
    expect(plural(1200, 'invoice')).toBe('1,200 invoices')
  })

  it('relative and due dates are computed from the fixed "now"', () => {
    expect(formatDue('2026-11-14T18:00:00Z')).toBe('Due today')
    expect(formatDue('2026-11-15T08:00:00Z')).toBe('Due tomorrow')
    expect(formatDue('2026-11-20T10:00:00Z')).toBe('Due in 6 days')
    expect(formatDue('2026-11-11T10:00:00Z')).toBe('3 days overdue')
    expect(formatRelative('2026-11-14T09:12:00Z')).toBe('18m ago')
    expect(formatRelative('2026-11-14T06:00:00Z')).toBe('4h ago')
    expect(formatRelative('2026-11-13T09:00:00Z')).toBe('Yesterday')
    expect(formatRelative('2026-11-01T09:00:00Z')).toBe('1 Nov')
  })

  it('initials and file sizes', () => {
    expect(initials('Maya Okafor')).toBe('MO')
    expect(initials('Tomás de la Cruz Lindqvist')).toBe('TL')
    expect(initials('Aiko')).toBe('A')
    expect(formatBytes(845 * 1024)).toBe('845 KB')
    expect(formatBytes(2.4 * 1024 * 1024)).toBe('2.4 MB')
  })
})

describe('router helpers', () => {
  it('matches params and rejects different shapes', () => {
    expect(matchPath('/invoices/:id', '/invoices/inv-2264')).toEqual({ id: 'inv-2264' })
    expect(matchPath('/invoices/:id/edit', '/invoices/inv-2264/edit/')).toEqual({ id: 'inv-2264' })
    expect(matchPath('/invoices/:id', '/invoices')).toBeNull()
    expect(matchPath('/settings/:section', '/invoices/board')).toBeNull()
    // Malformed percent-encoding in a param is "no match", never a thrown URIError (blank screen).
    for (const bad of ['/invoices/%E0%A4%A', '/invoices/%', '/invoices/50%', '/invoices/%ZZ/edit'])
      expect(() => matchPath('/invoices/:id', bad), bad).not.toThrow()
    expect(matchPath('/invoices/:id', '/invoices/%E0%A4%A')).toBeNull()
    expect(matchPath('/invoices/:id', '/invoices/inv%2D2264')).toEqual({ id: 'inv-2264' })
  })

  it('withParams keeps other params and drops empty ones', () => {
    const search = new URLSearchParams('q=halc&page=3')
    expect(withParams(search, { page: null })).toBe('?q=halc')
    expect(withParams(search, { status: 'open', q: '' })).toBe('?page=3&status=open')
    expect(withParams(new URLSearchParams(), {})).toBe('')
  })
})

describe('list state from the URL', () => {
  it('reads filters, sort and paging, ignoring junk', () => {
    const state = readListState(new URLSearchParams('q=halc&status=open,bogus,overdue&owner=u2,evil&min=5000&sort=-amount&page=2&size=50'))
    expect(state.filters).toEqual({ search: 'halc', statuses: ['open', 'overdue'], ownerIds: ['u2'], minAmount: 5000 })
    expect(state.sort).toEqual({ key: 'amount', direction: 'desc' })
    expect([state.page, state.pageSize]).toEqual([2, 50])
    expect(activeFilterCount(state.filters)).toBe(3)
  })

  it('falls back to defaults for malformed values', () => {
    const state = readListState(new URLSearchParams('sort=password&page=-4&size=7&min=abc'))
    expect(state.sort).toEqual({ key: 'issuedAt', direction: 'desc' })
    expect([state.page, state.pageSize, state.filters.minAmount]).toEqual([1, 25, null])
  })

  it('a saved view is the base; explicit params layer on top, and "-" clears a view filter', () => {
    const view = readListState(new URLSearchParams('view=overdue'))
    expect(view.filters.statuses).toEqual(['overdue'])
    expect(view.edited).toBe(false)
    const cleared = readListState(new URLSearchParams('view=overdue&status=-'))
    expect(cleared.filters.statuses).toEqual([])
    expect(cleared.edited).toBe(true)
  })

  it('page windows keep first, last and neighbours', () => {
    expect(pageWindow(1, 5)).toEqual([1, 2, 3, 4, 5])
    expect(pageWindow(1, 10)).toEqual([1, 2, 3, 4, '…', 10])
    expect(pageWindow(6, 10)).toEqual([1, '…', 5, 6, 7, '…', 10])
    expect(pageWindow(10, 10)).toEqual([1, '…', 7, 8, 9, 10])
  })
})

describe('invoice data and queries', () => {
  it('is deterministic and varied', () => {
    expect(invoices).toHaveLength(238)
    const totals = totalsByStatus(invoices)
    for (const status of ['draft', 'open', 'overdue', 'paid', 'void'] as const) expect(totals[status].count).toBeGreaterThan(0)
    expect(new Set(invoices.map((invoice) => invoice.currency))).toEqual(new Set(['EUR', 'USD', 'GBP']))
  })

  it('searches, filters, sorts stably and clamps the page', () => {
    const result = queryInvoices(invoices, { ...EMPTY_FILTERS, search: 'HALCYON', statuses: ['paid', 'open'] }, { key: 'amount', direction: 'desc' }, 99, 5)
    expect(result.rows.every((row) => row.customer.name === 'Halcyon Freight' && ['paid', 'open'].includes(row.status))).toBe(true)
    expect(result.page).toBe(result.pageCount)
    const all = queryInvoices(invoices, EMPTY_FILTERS, { key: 'amount', direction: 'asc' }, 1, 300).rows
    expect(all.every((row, index) => index === 0 || (all[index - 1]?.amount ?? 0) <= row.amount)).toBe(true)
  })

  it('line items always reconcile to the invoice total, to the cent', () => {
    for (const invoice of invoices) {
      const { items, subtotal, tax } = lineItemsFor(invoice)
      expect(items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)).toBe(subtotal)
      expect(subtotal + tax).toBe(invoice.amount)
    }
  })
})

describe('invoice form rules', () => {
  it('a blank form names every missing essential', () => {
    expect(Object.keys(validateInvoice(emptyValues())).sort()).toEqual(['amount', 'customer', 'email'])
  })

  it('accepts a complete form and rejects a due date before the issue date', () => {
    const valid = { ...emptyValues(), customer: customers[0], email: 'ap@halcyonfreight.example', amount: '18,420.00' }
    expect(validateInvoice(valid)).toEqual({})
    expect(validateInvoice({ ...valid, dueAt: '2026-11-01' }).dueAt).toBe('Choose a due date on or after the issue date.')
    expect(validateInvoice({ ...valid, number: 'INV-12' }).number).toMatch(/INV-/)
  })

  it('parses amounts strictly and adds days across months', () => {
    expect(parseAmount('18,420.5')).toBe(1_842_050)
    expect(parseAmount('12.')).toBeNull()
    expect(parseAmount('0')).toBeNull()
    expect(parseAmount('-5')).toBeNull()
    expect(addDays('2026-11-14', 30)).toBe('2026-12-14')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('calendar grid', () => {
  it('November 2026 starts on Monday 26 October and fills whole weeks', () => {
    const grid = monthGrid(2026, 10)
    expect(grid[0]).toEqual({ date: '2026-10-26', day: 26, inMonth: false })
    expect(grid.length % 7).toBe(0)
    expect(grid.filter((cell) => cell.inMonth)).toHaveLength(30)
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 })
  })
})

describe('small validators', () => {
  it('sign-in and password strength', () => {
    expect(validateSignIn('', '')).toEqual({ email: 'Enter your work e-mail.', password: 'Enter your password.' })
    expect(validateSignIn('maya@', 'x').email).toMatch(/doesn’t look like/)
    expect(validateSignIn('maya@northwind.example', 'x')).toEqual({})
    expect([passwordScore(''), passwordScore('abc'), passwordScore('Northwind-2026'), passwordScore('Northwind-close-2026!')]).toEqual([0, 1, 3, 4])
  })

  it('file drop rejects wrong types and big files with a message naming the file', () => {
    const accept = ['application/pdf']
    expect(validateFile({ name: 'a.pdf', size: 1000, type: 'application/pdf' }, accept, 2048)).toBeNull()
    expect(validateFile({ name: 'a.exe', size: 1000, type: 'application/x-msdownload' }, accept, 2048)).toMatch(/a\.exe is not a supported type/)
    expect(validateFile({ name: 'b.pdf', size: 5 * 1024 * 1024, type: 'application/pdf' }, accept, 1024 * 1024)).toBe('b.pdf is 5.0 MB; the limit is 1.0 MB.')
  })

  it('sparkline path spans the full width and handles flat series', () => {
    expect(sparkPath([1], 120, 32)).toBe('')
    expect(sparkPath([1, 2, 3], 120, 32)).toBe('M0.0 30.0 L60.0 16.0 L120.0 2.0')
    expect(sparkPath([5, 5], 120, 32)).toBe('M0.0 30.0 L120.0 30.0')
  })
})
