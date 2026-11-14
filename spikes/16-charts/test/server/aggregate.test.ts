/**
 * The aggregate endpoint end to end, on SQLite and PostgreSQL (PGlite) with the same rows and the
 * same expected numbers: date buckets on boundaries, zero-filling, sums and averages with NULLs,
 * top N with "other", splits, filters, soft deletes, policies and the HTTP contract.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AggregateResult, Problem } from '../../src/shared/aggregate-contract.ts'
import type { AggregateExecutor } from '../../src/server/execute.ts'
import { admin, createPglite, createSqlite, handlerFor, TENANT_A } from './fixture.ts'

type Engine = { readonly name: string; readonly start: () => Promise<{ executor: AggregateExecutor; close: () => unknown }> }

const engines: readonly Engine[] = [
  { name: 'sqlite', start: async () => createSqlite() },
  { name: 'postgres (PGlite, as a non-owner role under RLS)', start: createPglite },
]

/** `[key, value]` pairs of a single-series result, for compact expectations. */
function pairs(body: unknown): [string, number | null][] {
  return (body as AggregateResult).data.map((bucket) => [bucket.key, bucket.values['value'] ?? null])
}

describe.each(engines)('aggregate on $name', (engine) => {
  let api: ReturnType<typeof handlerFor>
  let close: () => unknown = () => undefined

  beforeAll(async () => {
    const started = await engine.start()
    api = handlerFor(started.executor)
    close = started.close
  })
  afterAll(async () => {
    await close()
  })

  const get = (query: string, options: Parameters<ReturnType<typeof handlerFor>['get']>[1] = { tenant: TENANT_A }) => api.get(`/api/v1/invoices/aggregate?${query}`, options)

  it('counts by enum in schema order, without the soft-deleted row', async () => {
    const { status, body } = await get('metric=count&groupBy=status')
    expect(status).toBe(200)
    expect(pairs(body)).toEqual([
      ['draft', 2],
      ['sent', 1],
      ['paid', 11],
      ['void', 1],
    ])
    expect((body as AggregateResult).meta).toMatchObject({ groupKind: 'category', metric: 'count', timezone: 'UTC', truncated: false })
  })

  it('zero-fills enum options that no row has', async () => {
    const { body } = await get('metric=count&groupBy=status&filter[paid][eq]=true')
    expect(pairs(body)).toEqual([
      ['draft', 0],
      ['sent', 0],
      ['paid', 11],
      ['void', 0],
    ])
  })

  it('groups booleans as "true"/"false" on every engine', async () => {
    const { body } = await get('metric=count&groupBy=paid')
    expect(pairs(body)).toEqual([
      ['true', 11],
      ['false', 4],
    ])
  })

  it('sums by month on the last millisecond and the first instant of a month (rounded to the scale)', async () => {
    const { body } = await get('metric=sum&field=total&groupBy=created_at&interval=month&from=2026-09-01&to=2026-12-01')
    // Nov: 0.10 + 0.20 + 999.99 + 300.00. On SQLite that is 1300.2900000000002 before rounding.
    expect(pairs(body)).toEqual([
      ['2026-09-01', 100.1],
      ['2026-10-01', 250.25],
      ['2026-11-01', 1300.29],
    ])
  })

  it('averages ignore NULL amounts and a bucket with nothing to average is null', async () => {
    const { body } = await get('metric=avg&field=tax&groupBy=created_at&interval=month&from=2026-08-01&to=2026-12-01')
    expect(pairs(body)).toEqual([
      ['2026-08-01', null],
      ['2026-09-01', 10.01],
      ['2026-10-01', 5],
      ['2026-11-01', 30],
    ])
  })

  it('buckets weeks from Monday: Sunday 23:59:59 and Monday 00:00 land in different weeks', async () => {
    const { body } = await get('metric=count&groupBy=created_at&interval=week&from=2026-11-01&to=2026-11-15')
    // from 2026-11-01 (a Sunday) aligns back to Monday 2026-10-26; to aligns forward to 2026-11-16.
    expect(pairs(body)).toEqual([
      ['2026-10-26', 1],
      ['2026-11-02', 1],
      ['2026-11-09', 2],
    ])
    expect((body as AggregateResult).meta).toMatchObject({ from: '2026-10-26T00:00:00.000Z', to: '2026-11-16T00:00:00.000Z', interval: 'week' })
  })

  it('buckets days in UTC and zero-fills empty days', async () => {
    const { body } = await get('metric=count&groupBy=created_at&interval=day&from=2026-09-30&to=2026-10-03')
    expect(pairs(body)).toEqual([
      ['2026-09-30', 1],
      ['2026-10-01', 1],
      ['2026-10-02', 0],
    ])
  })

  it('buckets a DATE column (issued_on) and leaves NULL dates out', async () => {
    const { body } = await get('metric=count&groupBy=issued_on&interval=month&from=2026-09-01&to=2026-12-01')
    expect(pairs(body)).toEqual([
      ['2026-09-01', 1],
      ['2026-10-01', 2],
      ['2026-11-01', 2],
    ])
  })

  it('defaults to the last 12 months, the current month included', async () => {
    const { body } = await get('metric=count&groupBy=created_at&interval=month')
    const result = body as AggregateResult
    expect(result.data).toHaveLength(12)
    expect(result.meta.from).toBe('2025-12-01T00:00:00.000Z')
    expect(result.meta.to).toBe('2026-12-01T00:00:00.000Z')
    expect(pairs(body).at(-1)).toEqual(['2026-11-01', 4])
    expect(pairs(body).find(([key]) => key === '2026-06-01')).toEqual(['2026-06-01', 8])
  })

  it('splits months by status (stacked bars), with every option as a series', async () => {
    const { body } = await get('metric=count&groupBy=created_at&interval=month&splitBy=status&from=2026-10-01&to=2026-12-01')
    const result = body as AggregateResult
    expect(result.series.map((series) => series.key)).toEqual(['draft', 'sent', 'paid', 'void'])
    expect(result.data).toEqual([
      { key: '2026-10-01', values: { draft: 0, sent: 1, paid: 1, void: 0 } },
      { key: '2026-11-01', values: { draft: 2, sent: 0, paid: 1, void: 1 } },
    ])
  })

  it('top N by relation with ties broken by key, and the rest summed into "other"', async () => {
    const { body } = await get('metric=count&groupBy=customer_id&limit=3')
    expect(pairs(body)).toEqual([
      ['1', 3],
      ['2', 2],
      ['3', 2],
      ['__other__', 8],
    ])
    expect((body as AggregateResult).meta.truncated).toBe(true)
  })

  it('top N by sum ranks by the sum; "other" is exact', async () => {
    const { body } = await get('metric=sum&field=total&groupBy=customer_id&limit=2')
    expect(pairs(body)).toEqual([
      ['3', 1000.19],
      ['1', 600.3],
      ['__other__', 130.15],
    ])
  })

  it('applies filters: in, gte on decimals, contains with LIKE wildcards as literals', async () => {
    expect(pairs((await get('metric=count&filter[status][in]=draft,void')).body)).toEqual([['__total__', 3]])
    expect(pairs((await get('metric=count&filter[total][gte]=100.10')).body)).toEqual([['__total__', 4]])
    // INV-1 and INV-10 … INV-16.
    expect(pairs((await get('metric=count&filter[number][contains]=INV-1')).body)).toEqual([['__total__', 8]])
    expect(pairs((await get(`metric=count&filter[number][contains]=${encodeURIComponent('%')}`)).body)).toEqual([['__total__', 0]])
  })

  it('ne is NULL-safe: rows with a NULL tax count as "not equal"', async () => {
    // 15 live rows; only invoice 1 has tax 10.01. Four rows have a NULL tax and still match.
    expect(pairs((await get('metric=count&filter[tax][ne]=10.01')).body)).toEqual([['__total__', 14]])
    expect(pairs((await get('metric=count&filter[issued_on][null]=true')).body)).toEqual([['__total__', 2]])
  })

  it('applies the policy scope: an account manager only sees customer 1', async () => {
    const { body } = await get('metric=sum&field=total', { tenant: TENANT_A, actor: { id: '9', roles: ['account-manager'] } })
    expect(pairs(body)).toEqual([['__total__', 600.3]])
  })

  it('refuses without viewAny (403) and does not list fields to that user', async () => {
    const { status, body } = await get('metric=sum&field=nope', { tenant: TENANT_A, actor: { id: '9', roles: ['viewer'] } })
    expect(status).toBe(403)
    expect(JSON.stringify(body)).not.toContain('total')
    expect((body as Problem).code).toBe('forbidden')
  })

  it('answers 422 problem+json with every issue at once', async () => {
    const { status, body, headers } = await get('metric=median&groupBy=api_key&colour=red')
    expect(status).toBe(422)
    expect(headers.get('content-type')).toBe('application/problem+json')
    expect((body as Problem).issues?.map((issue) => issue.code)).toEqual(['unknown_parameter', 'invalid', 'not_groupable'])
  })

  it('sends no-store, and refuses writes with 405', async () => {
    expect((await get('metric=count')).headers.get('cache-control')).toBe('private, no-store')
    expect((await api.get('/api/v1/invoices/aggregate?metric=count', { tenant: TENANT_A, method: 'POST', actor: admin })).status).toBe(405)
  })
})
