// Round trips through the GENERATED, TYPED client against the in-process Hono app (no network).
import type { OpenAPIHono } from '@hono/zod-openapi'
import { beforeEach, describe, expect, test } from 'vitest'
import { createApp } from '../src/app.ts'
import type { components } from '../src/client.gen/schema.d.ts'
import { type ApiClient, createApiClient } from '../src/client.ts'

type Invoice = components['schemas']['Invoice']
type Problem = components['schemas']['Problem']

let app: OpenAPIHono
let api: ApiClient
let customerId: string

beforeEach(async () => {
  app = createApp()
  api = createApiClient({ baseUrl: 'http://api.test', fetch: (request) => Promise.resolve(app.fetch(request)) })
  const { data } = await api.POST('/customers', { body: { name: 'Acme', email: 'billing@acme.test', region: 'EU' } })
  customerId = data?.id ?? ''
  expect(customerId).toMatch(/^[0-9a-f-]{36}$/)
})

async function seedInvoices(): Promise<Invoice[]> {
  const rows: Invoice[] = []
  const specs = [
    { number: 'INV-001', amount: 100, status: 'draft' },
    { number: 'INV-002', amount: 2500, status: 'sent' },
    { number: 'INV-003', amount: 900, status: 'paid' },
    { number: 'INV-004', amount: 4200, status: 'sent' },
    { number: 'INV-005', amount: 50, status: 'void' },
  ] as const
  for (const s of specs) {
    const { data, error } = await api.POST('/invoices', { body: { ...s, customerId, dueDate: '2026-12-31' } })
    expect(error).toBeUndefined()
    if (data) rows.push(data)
  }
  return rows
}

describe('CRUD round trip through the typed client', () => {
  test('create → show → update → delete, with server-managed fields', async () => {
    const created = await api.POST('/invoices', {
      body: { number: 'INV-100', customerId, amount: 1200, status: 'draft', dueDate: '2026-12-01', notes: 'first' },
    })
    expect(created.response.status).toBe(201)
    const invoice = created.data
    if (!invoice) throw new Error('no data')
    expect(invoice).toMatchObject({ number: 'INV-100', amount: 1200, status: 'draft', notes: 'first' })
    expect(invoice.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    const shown = await api.GET('/invoices/{id}', { params: { path: { id: invoice.id } } })
    expect(shown.data).toEqual(invoice)

    const updated = await api.PATCH('/invoices/{id}', { params: { path: { id: invoice.id } }, body: { status: 'sent' } })
    expect(updated.data).toMatchObject({ status: 'sent', amount: 1200, notes: 'first' })

    const deleted = await api.DELETE('/invoices/{id}', { params: { path: { id: invoice.id } } })
    expect(deleted.response.status).toBe(204)
    const gone = await api.GET('/invoices/{id}', { params: { path: { id: invoice.id } } })
    expect(gone.response.status).toBe(404)
    expect(gone.error).toMatchObject({ status: 404, code: 'NOT_FOUND' })
  })
})

describe('validation errors: RFC 9457 problem+json with RFC-0003 issues', () => {
  test('422 lists EVERY issue with path, stable code, params and a rendered message', async () => {
    const res = await api.POST('/invoices', {
      // @ts-expect-error deliberately invalid payload: missing fields, bad enum, negative amount, unknown key
      body: { customerId: 'not-a-uuid', amount: -5, status: 'lost', dueDate: '2026-13-45', bogus: true },
    })
    expect(res.response.status).toBe(422)
    expect(res.response.headers.get('content-type')).toBe('application/problem+json')
    const problem = res.error as Problem
    expect(problem).toMatchObject({ status: 422, code: 'VALIDATION_FAILED', title: 'Validation failed' })
    const byPath = Object.fromEntries((problem.issues ?? []).map((i) => [i.path.join('.'), i]))
    expect(byPath.number).toEqual({ path: ['number'], code: 'required', message: 'Number is required.' })
    expect(byPath.amount).toEqual({ path: ['amount'], code: 'too_small', params: { min: 0 }, message: 'Amount must be at least 0.' })
    expect(byPath.status).toMatchObject({ code: 'invalid_value', message: 'Status must be one of: draft, sent, paid, void.' })
    expect(byPath.customerId).toMatchObject({ code: 'invalid_format', params: { format: 'uuid' } })
    expect(byPath.dueDate).toMatchObject({ code: 'invalid_format', params: { format: 'date' }, message: 'Due date must be a valid date.' })
    expect(byPath.bogus).toMatchObject({ code: 'unknown_field' })
    expect(problem.fieldErrors?.amount).toEqual(['Amount must be at least 0.'])
  })

  test('string length issues use the text-specific codes', async () => {
    const res = await api.POST('/customers', { body: { name: '', email: 'a@b.test', region: 'EUR' } })
    const byPath = Object.fromEntries((res.error?.issues ?? []).map((i) => [i.path.join('.'), i]))
    expect(byPath.name).toEqual({ path: ['name'], code: 'too_short', params: { min: 1 }, message: 'Name must be at least 1 characters.' })
    expect(byPath.region).toMatchObject({ code: 'too_long', params: { max: 2 } })
  })

  test('invalid path parameters are 422 with a params-prefixed path', async () => {
    const res = await api.GET('/invoices/{id}', { params: { path: { id: 'nope' } } })
    expect(res.response.status).toBe(422)
    expect(res.error?.issues?.[0]).toMatchObject({ path: ['params', 'id'], code: 'invalid_format' })
  })

  test('malformed JSON is a 400 problem; unknown routes are 404 problems', async () => {
    const malformed = await app.request('/invoices', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"number":' })
    expect(malformed.status).toBe(400)
    expect(malformed.headers.get('content-type')).toBe('application/problem+json')
    expect(await malformed.json()).toMatchObject({ code: 'MALFORMED_REQUEST' })
    const missing = await app.request('/nope')
    expect(missing.status).toBe(404)
    expect(await missing.json()).toMatchObject({ code: 'NOT_FOUND' })
  })

  test('unexpected failures return only a traceId; details go to the injected logger, never the client', async () => {
    const logged: [string, unknown][] = []
    const failing = createApp({ onUnexpectedError: (traceId, error) => logged.push([traceId, error]) })
    failing.get('/boom', () => {
      throw new Error('db password is hunter2')
    })
    const res = await failing.request('/boom')
    expect(res.status).toBe(500)
    const body = (await res.json()) as Problem
    expect(body).toMatchObject({ code: 'INTERNAL_ERROR', status: 500 })
    expect(JSON.stringify(body)).not.toContain('hunter2')
    expect(logged).toHaveLength(1)
    expect(logged[0]?.[0]).toBe(body.traceId)
  })
})

describe('list endpoint: the ListQuery protocol through the typed client', () => {
  test('typed filters (in, range), sort and page size produce the right rows', async () => {
    await seedInvoices()
    const { data, error } = await api.GET('/invoices', {
      params: { query: { filter: { status: { in: ['sent', 'paid'] }, amount: { gte: 500 } }, sort: ['-amount'], page: { size: 10 } } },
    })
    expect(error).toBeUndefined()
    expect(data?.data.map((i) => i.number)).toEqual(['INV-004', 'INV-002', 'INV-003'])
    expect(data?.meta.page).toEqual({ size: 10, hasMore: false })
  })

  test('between, ne (two-valued: matches everything not equal) and startsWith', async () => {
    await seedInvoices()
    const between = await api.GET('/invoices', { params: { query: { filter: { amount: { between: [90, 1000] } }, sort: ['amount'] } } })
    expect(between.data?.data.map((i) => i.number)).toEqual(['INV-001', 'INV-003'])
    const ne = await api.GET('/invoices', { params: { query: { filter: { status: { ne: 'sent' } }, sort: ['number'] } } })
    expect(ne.data?.data.map((i) => i.number)).toEqual(['INV-001', 'INV-003', 'INV-005'])
    const prefix = await api.GET('/invoices', { params: { query: { filter: { number: { startsWith: 'INV-00' } }, page: { size: 2 } } } })
    expect(prefix.data?.data).toHaveLength(2)
  })

  test('cursor pagination walks every row exactly once, in a stable order', async () => {
    await seedInvoices()
    const seen: string[] = []
    let cursor: string | undefined
    for (let guard = 0; guard < 10; guard++) {
      const { data } = await api.GET('/invoices', { params: { query: { sort: ['-amount'], page: { size: 2, ...(cursor ? { cursor } : {}) } } } })
      seen.push(...(data?.data.map((i) => i.number) ?? []))
      cursor = data?.meta.page.nextCursor
      if (!data?.meta.page.hasMore) break
    }
    expect(seen).toEqual(['INV-004', 'INV-002', 'INV-003', 'INV-001', 'INV-005'])
  })

  test('null filters on nullable fields (isNull / isNotNull)', async () => {
    await api.POST('/customers', { body: { name: 'Globex', email: 'x@globex.test', region: null } })
    const nulls = await api.GET('/customers', { params: { query: { filter: { region: { isNull: true } } } } })
    expect(nulls.data?.data.map((c) => c.name)).toEqual(['Globex'])
    const set = await api.GET('/customers', { params: { query: { filter: { region: { isNotNull: true } } } } })
    expect(set.data?.data.map((c) => c.name)).toEqual(['Acme'])
  })

  test('every invalid list parameter is reported at once, never silently ignored', async () => {
    const url =
      '/invoices?filter[notes][eq]=x&filter[status][gt]=paid&filter[amount][gte]=lots&sort=notes&page[size]=500&page[cursor]=%%%&colour=red'
    const res = await app.request(url)
    expect(res.status).toBe(422)
    const issues = ((await res.json()) as Problem).issues ?? []
    expect(issues.map((i) => i.code).sort()).toEqual(
      ['filter_not_allowed', 'invalid_cursor', 'invalid_filter_value', 'invalid_page_size', 'operator_not_allowed', 'sort_not_allowed', 'unknown_parameter'].sort(),
    )
    const filterIssue = issues.find((i) => i.code === 'operator_not_allowed')
    expect(filterIssue).toMatchObject({ path: ['query', 'filter', 'status', 'gt'], message: 'Status does not support the "gt" filter.' })
  })
})
