// Unit tests for the framework-free modules: URL ↔ ListQuery, validation, error routing, reducer.
import { describe, expect, test } from 'vitest'
import { invoiceResource } from '../src/manifest.fixture.ts'
import { firstInvalidField, issuePathToFieldName, problemBannerText, routeIssues } from '../src/errors.ts'
import { type ListState, initialListState, parseSearchString, toListQuery, toSearchString } from '../src/list-query-url.ts'
import { defaultMessages, formatMessage } from '../src/messages.ts'
import { listReducer } from '../src/useListQuery.ts'
import { isIsoDate, validateArrayItems, validateField } from '../src/validation.ts'

const field = (name: string) => {
  const f = invoiceResource.fields.find((x) => x.name === name)
  if (!f) throw new Error(`no field ${name}`)
  return f
}

describe('toListQuery', () => {
  test('single filter is sent as-is; several become an AND; page size is clamped to the protocol max', () => {
    const one = toListQuery({ ...initialListState, filters: [{ field: 'status', op: 'eq', value: 'draft' }] })
    expect(one.filter).toEqual({ op: 'eq', field: 'status', value: 'draft' })
    const two = toListQuery({
      ...initialListState,
      pageSize: 5000,
      filters: [
        { field: 'status', op: 'in', values: ['draft', 'sent'] },
        { field: 'amount', op: 'between', from: 10, to: 20 },
      ],
      sort: [{ field: 'amount', direction: 'desc' }],
      search: '  acme ',
    })
    expect(two).toEqual({
      filter: { op: 'and', filters: [{ op: 'in', field: 'status', values: ['draft', 'sent'] }, { op: 'between', field: 'amount', from: 10, to: 20 }] },
      search: 'acme',
      sort: [{ field: 'amount', direction: 'desc' }],
      page: { kind: 'cursor', size: 100 },
    })
  })
})

describe('URL round-trip', () => {
  const tricky: ListState = {
    filters: [
      { field: 'number', op: 'contains', value: 'a,b&c=d %25 ü 日本' },
      { field: 'status', op: 'in', values: ['draft', 'sent'] },
      { field: 'amount', op: 'between', from: 0, to: 99.5 },
      { field: 'paid', op: 'eq', value: true },
      { field: 'customer', op: 'eq', value: 'c,1' },
    ],
    sort: [{ field: 'dueDate', direction: 'desc' }, { field: 'number', direction: 'asc' }],
    search: 'Acme & Co, Ltd',
    pageSize: 50,
    cursor: 'eyJvIjo1MH0=',
  }

  test('state → URL → state is lossless, including commas, &, =, % and Unicode', () => {
    const search = toSearchString(tricky)
    const { state, rejected } = parseSearchString(search, invoiceResource)
    expect(rejected).toEqual([])
    expect(state).toEqual(tricky)
  })

  test('the URL uses the documented wire format', () => {
    const s = decodeURIComponent(toSearchString({ ...initialListState, filters: [{ field: 'status', op: 'in', values: ['draft', 'sent'] }], sort: [{ field: 'dueDate', direction: 'desc' }] }))
    expect(s).toBe('filter[status][in]=draft,sent&sort=-dueDate')
  })
})

describe('parseSearchString fails closed', () => {
  test.each([
    ['filter[notes][eq]=x', 'operator not allowed for this field'],
    ['filter[secret][eq]=x', 'unknown field'],
    ['filter[status][like]=x', 'operator not allowed for this field'],
    ['filter[amount][gte]=abc', 'invalid value'],
    ['filter[amount][between]=1', 'invalid value'],
    ['filter[paid][eq]=maybe', 'invalid value'],
    ['sort=-notes', 'field is not sortable'],
    ['page%5Bsize%5D=10&debug=1', 'unknown parameter'],
    ['filter[number][contains]=%E0%A4%A', 'malformed encoding'],
  ])('%s → rejected (%s)', (search, reason) => {
    const { rejected } = parseSearchString(search, invoiceResource)
    expect(rejected.map((r) => r.reason)).toContain(reason)
  })

  test('page size is clamped, garbage page size falls back to the default', () => {
    expect(parseSearchString('page%5Bsize%5D=1000', invoiceResource).state.pageSize).toBe(100)
    expect(parseSearchString('page%5Bsize%5D=-3', invoiceResource).state.pageSize).toBe(25)
  })
})

describe('validation (client) uses the shared catalog', () => {
  test('required, minimum, enum, pattern, maxLength, real calendar dates', () => {
    expect(validateField(field('amount'), null, defaultMessages)[0]?.message).toBe('Amount is required.')
    expect(validateField(field('amount'), -1, defaultMessages)[0]).toMatchObject({ code: 'too_small', params: { min: 0 }, message: 'Amount must be at least 0.' })
    expect(validateField(field('amount'), 'abc', defaultMessages)[0]?.code).toBe('invalid_number')
    expect(validateField(field('status'), 'void', defaultMessages)[0]?.code).toBe('invalid_enum')
    expect(validateField(field('number'), 'X-1', defaultMessages)[0]?.code).toBe('invalid_format')
    expect(validateField(field('number'), `INV-${'1'.repeat(30)}`, defaultMessages).map((i) => i.code)).toContain('too_long')
    expect(validateField(field('dueDate'), '2026-02-30', defaultMessages)[0]?.code).toBe('invalid_date')
    expect(validateField(field('notes'), null, defaultMessages)).toEqual([])
    expect(isIsoDate('2026-02-28')).toBe(true)
  })

  test('array items get full paths like the server returns', () => {
    const issues = validateArrayItems(field('lines'), [{ description: 'ok', amount: 1 }, { description: '', amount: -5 }], defaultMessages)
    expect(issues.map((i) => i.path)).toEqual([['lines', 1, 'description'], ['lines', 1, 'amount']])
  })

  test('formatMessage never throws on unknown codes and leaves missing params visible', () => {
    expect(formatMessage(defaultMessages, 'nope', { attribute: 'X' })).toBe('X is invalid.')
    expect(formatMessage(defaultMessages, 'too_small', { attribute: 'X' })).toBe('X must be at least {min}.')
  })
})

describe('error routing', () => {
  const rendered = new Set(['number', 'amount', 'lines', 'lines[0].amount', 'lines[1].amount'])

  test('paths become deep field names', () => {
    expect(issuePathToFieldName(['lines', 1, 'amount'])).toBe('lines[1].amount')
    expect(issuePathToFieldName([])).toBe('')
  })

  test('deepest rendered field wins; falls back to parents; unknown and [] become form errors', () => {
    const routed = routeIssues(
      [
        { path: ['lines', 1, 'amount'], code: 'too_small', message: 'm1' },
        { path: ['lines', 7, 'amount'], code: 'too_small', message: 'm2' },
        { path: ['number'], code: 'unique', message: 'm3' },
        { path: [], code: 'conflict', message: 'm4' },
        { path: ['nonexistent'], code: 'x', message: 'm5' },
      ],
      rendered,
    )
    expect(Object.fromEntries(routed.fieldErrors)).toEqual({ 'lines[1].amount': ['m1'], lines: ['m2'], number: ['m3'] })
    expect(routed.formErrors).toEqual(['m4', 'm5'])
    expect(firstInvalidField(['number', 'amount', 'lines', 'lines[1].amount'], routed.fieldErrors)).toBe('number')
  })

  test('5xx banners never show internals but do show the support reference', () => {
    expect(problemBannerText({ type: 't', title: 'Internal', status: 500, code: 'INTERNAL_ERROR', detail: 'NullPointer at db.ts:42', traceId: 'abc' })).toBe(
      'Something went wrong on our side. Your changes are kept. Reference: abc.',
    )
  })
})

describe('list reducer (cursor stack)', () => {
  const start = { list: initialListState, previousCursors: [] as (string | undefined)[] }
  test('next/previous walk the cursor stack; changing the query resets to page 1', () => {
    const p2 = listReducer(start, { type: 'next', cursor: 'c2' })
    const p3 = listReducer(p2, { type: 'next', cursor: 'c3' })
    expect(p3.list.cursor).toBe('c3')
    const back = listReducer(p3, { type: 'previous' })
    expect(back.list.cursor).toBe('c2')
    const first = listReducer(back, { type: 'previous' })
    expect(first.list.cursor).toBeUndefined()
    expect(listReducer(first, { type: 'previous' })).toBe(first) // no-op at page 1
    const sorted = listReducer(p3, { type: 'sort', sort: [{ field: 'amount', direction: 'asc' }] })
    expect(sorted.list.cursor).toBeUndefined()
    expect(sorted.previousCursors).toEqual([])
  })
})
