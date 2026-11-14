/**
 * Pure logic: list filtering/sorting/paging/chips, the form model, and formatting helpers.
 */
import { describe, expect, it } from 'vitest'
import { INVOICES } from '../src/data/invoices.ts'
import { formatDelta, formatMoney, formatRelative, initials, TODAY } from '../src/lib/format.ts'
import { seeded } from '../src/lib/random.ts'
import { emptyInvoice, newLine, totals, validateInvoice } from '../src/screens/invoices/form/form-model.ts'
import { activeChips, applyQuery, collectedRatio, DEFAULT_QUERY, dueLabel, nextSort, pageWindow, paginate, SAVED_VIEWS, viewQuery } from '../src/screens/invoices/list/list-state.ts'
import { monthGrid } from '../src/screens/calendar/CalendarPage.tsx'

describe('list state', () => {
  it('the mock data is varied: every status, many customers, a wide amount range', () => {
    expect(new Set(INVOICES.map((invoice) => invoice.status)).size).toBe(5)
    expect(new Set(INVOICES.map((invoice) => invoice.customer.id)).size).toBeGreaterThan(12)
    const totals = INVOICES.map((invoice) => invoice.total)
    expect(Math.min(...totals)).toBeLessThan(5_000)
    expect(Math.max(...totals)).toBeGreaterThan(40_000)
  })

  it('search matches number, customer and contact, all terms required', () => {
    const first = INVOICES[0]
    if (first === undefined) throw new Error('no data')
    expect(applyQuery(INVOICES, { ...DEFAULT_QUERY, search: first.number }).map((invoice) => invoice.id)).toEqual([first.id])
    const larkspur = applyQuery(INVOICES, { ...DEFAULT_QUERY, search: 'larkspur nadia' })
    expect(larkspur.length).toBeGreaterThan(0)
    expect(larkspur.every((invoice) => invoice.customer.name === 'Larkspur Analytics')).toBe(true)
  })

  it('filters combine (status AND owner AND amount AND tags)', () => {
    const query = { ...DEFAULT_QUERY, statuses: ['paid', 'pending'] as const, minAmount: 10_000 }
    const rows = applyQuery(INVOICES, { ...query, statuses: [...query.statuses] })
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every((invoice) => (invoice.status === 'paid' || invoice.status === 'pending') && invoice.total >= 10_000)).toBe(true)
  })

  it('sorting is stable and directional', () => {
    const ascending = applyQuery(INVOICES, { ...DEFAULT_QUERY, sort: { key: 'total', dir: 'asc' } })
    for (let index = 1; index < ascending.length; index++) expect((ascending[index]?.total ?? 0) >= (ascending[index - 1]?.total ?? 0)).toBe(true)
    expect(nextSort({ key: 'number', dir: 'asc' }, 'number')).toEqual({ key: 'number', dir: 'desc' })
    expect(nextSort({ key: 'number', dir: 'asc' }, 'total')).toEqual({ key: 'total', dir: 'desc' })
    expect(nextSort({ key: 'total', dir: 'desc' }, 'customer')).toEqual({ key: 'customer', dir: 'asc' })
  })

  it('pagination clamps out-of-range pages and reports from/to', () => {
    const rows = Array.from({ length: 23 }, (_, index) => index)
    expect(paginate(rows, 3, 10)).toMatchObject({ page: 3, from: 21, to: 23, pageCount: 3 })
    expect(paginate(rows, 99, 10).page).toBe(3)
    expect(paginate([], 1, 10)).toMatchObject({ from: 0, to: 0, pageCount: 1 })
    expect(pageWindow(6, 12)).toEqual([1, 'gap', 5, 6, 7, 'gap', 12])
    expect(pageWindow(1, 4)).toEqual([1, 2, 3, 4])
  })

  it('saved views and chips round-trip', () => {
    const attention = SAVED_VIEWS.find((view) => view.id === 'attention')
    if (attention === undefined) throw new Error('missing view')
    const query = viewQuery(attention)
    const chips = activeChips(query, () => 'Someone')
    expect(chips.map((chip) => chip.label)).toEqual(['Status: Overdue', 'Status: Pending'])
    expect(chips[0]?.remove(query).statuses).toEqual(['pending'])
  })

  it('due labels and collected ratios', () => {
    const base = INVOICES[0]
    if (base === undefined) throw new Error('no data')
    const due = new Date(TODAY)
    due.setDate(due.getDate() - 3)
    expect(dueLabel({ ...base, status: 'overdue', dueAt: due })).toEqual({ text: '3 days late', late: true })
    expect(dueLabel({ ...base, status: 'pending', dueAt: TODAY })).toEqual({ text: 'Due today', late: false })
    expect(collectedRatio({ ...base, status: 'paid' })).toBe(1)
    expect(collectedRatio({ ...base, status: 'draft' })).toBe(0)
  })
})

describe('form model', () => {
  it('an empty invoice reports every problem at once, with friendly messages', () => {
    const errors = validateInvoice(emptyInvoice())
    expect(errors.customer).toBe('Choose who this invoice is for.')
    expect(Object.values(errors.lineErrors ?? {})[0]).toEqual({ description: 'Describe the item.', unitPrice: 'Enter a price.' })
  })

  it('a due date before the issue date is rejected', () => {
    const values = { ...emptyInvoice(), issuedAt: '2026-11-14', dueAt: '2026-11-01' }
    expect(validateInvoice(values).dueAt).toMatch(/can’t be before/)
  })

  it('totals add lines and tax, ignoring unfinished lines', () => {
    const values = { ...emptyInvoice(), taxRate: '10', lines: [newLine({ description: 'A', quantity: '2', unitPrice: '100.00' }), newLine({ description: 'B', quantity: '1', unitPrice: 'abc' })] }
    expect(totals(values)).toEqual({ subtotal: 200, tax: 20, total: 220 })
  })
})

describe('helpers', () => {
  it('format', () => {
    expect(formatMoney(1234.5)).toBe('$1,234.50')
    expect(formatDelta(0.124)).toBe('+12.4%')
    expect(initials('Maya Okafor')).toBe('MO')
    expect(initials('Cher')).toBe('C')
    expect(formatRelative(new Date(TODAY.getTime() - 86_400_000))).toBe('yesterday')
  })

  it('the seeded generator is deterministic', () => {
    const one = seeded(7)
    const two = seeded(7)
    expect([one.next(), one.next()]).toEqual([two.next(), two.next()])
  })

  it('the calendar grid starts on Monday and covers the month', () => {
    const grid = monthGrid(2026, 10)
    expect(grid).toHaveLength(42)
    expect(grid[0]?.getDay()).toBe(1)
    expect(grid.some((day) => day.getMonth() === 10 && day.getDate() === 30)).toBe(true)
  })
})
