/**
 * Attack-style tests for the aggregate endpoint (security review F-01, F-03, F-04, F-05, F-13):
 * tenant A can never see tenant B's numbers, secret and tenant columns can't be aggregated,
 * grouped or filtered, internal tables don't exist, broken scopes fail closed, small groups are
 * suppressed, and random input never produces a 500.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { AggregateResult, Problem } from '../../src/shared/aggregate-contract.ts'
import type { AggregateExecutor } from '../../src/server/execute.ts'
import type { AggregatePlan } from '../../src/server/plan.ts'
import { assertTenantScoped, renderAggregate, TenantScopeMissingError } from '../../src/server/sql.ts'
import { charts, createPglite, createSqlite, handlerFor, NOW, TENANT_A, TENANT_B } from './fixture.ts'

const engines = [
  { name: 'sqlite', start: async (): Promise<{ executor: AggregateExecutor; close: () => unknown }> => createSqlite() },
  { name: 'postgres', start: createPglite },
]

function values(body: unknown): (number | null)[] {
  return (body as AggregateResult).data.flatMap((bucket) => Object.values(bucket.values))
}

describe.each(engines)('tenant isolation on $name', (engine) => {
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

  const asA = (query: string) => api.get(`/api/v1/invoices/aggregate?${query}`, { tenant: TENANT_A })
  const asB = (query: string) => api.get(`/api/v1/invoices/aggregate?${query}`, { tenant: TENANT_B })

  it('tenant A never sees tenant B in totals, groups, top N, splits or "other"', async () => {
    const queries = [
      'metric=sum&field=total',
      'metric=count&groupBy=status',
      'metric=sum&field=total&groupBy=created_at&interval=day&from=2026-11-01&to=2026-11-15',
      'metric=count&groupBy=customer_id&limit=1',
      'metric=sum&field=total&groupBy=created_at&interval=month&splitBy=paid',
      'metric=avg&field=total&groupBy=paid',
    ]
    for (const query of queries) {
      const { status, body } = await asA(query)
      expect(status, query).toBe(200)
      // Tenant B's invoices are 1,000,000 each: any leak pushes a value past this.
      for (const value of values(body)) expect(value ?? 0, query).toBeLessThan(10_000)
      expect(JSON.stringify(body), query).not.toContain('"101"')
    }
  })

  it('tenant B sees exactly its own numbers', async () => {
    expect(values((await asB('metric=sum&field=total')).body)).toEqual([5_000_000])
    expect((await asB('metric=count&groupBy=customer_id')).body).toMatchObject({ data: [{ key: '101', values: { value: 5 } }] })
  })

  it('the tenant column can be neither grouped by, filtered on, nor summed', async () => {
    for (const query of ['metric=count&groupBy=tenant_id', `metric=count&filter[tenant_id][eq]=${TENANT_B}`, 'metric=sum&field=tenant_id']) {
      const { status } = await asA(query)
      expect(status, query).toBe(422)
    }
  })

  it('without an active tenant a scoped resource is refused (403 tenant_required)', async () => {
    const { status, body } = await api.get('/api/v1/invoices/aggregate?metric=count')
    expect(status).toBe(403)
    expect((body as Problem).code).toBe('tenant_required')
  })

  it('a global table works without a tenant; an unscopable one is refused with a generic 500', async () => {
    expect((await api.get('/api/v1/users/aggregate?metric=count')).status).toBe(200)
    const { status, body } = await api.get('/api/v1/tags/aggregate?metric=count', { tenant: TENANT_A })
    expect(status).toBe(500)
    expect(JSON.stringify(body)).not.toContain('tags')
    expect(String(api.errors.at(-1))).toContain('has no tenant_id column')
  })
})

describe('row-level security is the second layer on PostgreSQL', () => {
  it('a statement with NO tenant condition still only sees the active tenant', async () => {
    const { executor, close } = await createPglite()
    try {
      // Bypass the compiler on purpose: raw SQL with no WHERE, run through the executor as tenant A.
      const rows = await executor.all({ text: 'SELECT COUNT(*) AS n, SUM(total) AS s FROM invoices', params: [] }, { tenant: TENANT_A })
      expect(rows[0]).toMatchObject({ n: 16 })
      const none = await executor.all({ text: 'SELECT COUNT(*) AS n FROM invoices', params: [] }, { tenant: null })
      expect(none[0]).toMatchObject({ n: 0 })
    } finally {
      await close()
    }
  })
})

describe('the tenant choke point (before any SQL is rendered)', () => {
  const plan: AggregatePlan = {
    table: 'invoices',
    route: 'invoices',
    metric: 'count',
    group: { kind: 'none' },
    split: { kind: 'none' },
    conditions: [],
    softDeletes: true,
    dateField: null,
    from: null,
    to: null,
    minGroupSize: null,
  }

  it('refuses a scoped query whose conditions lack the tenant', () => {
    expect(() => renderAggregate(plan, { conditions: [], tenant: { column: 'tenant_id', id: TENANT_A } }, 'mysql')).toThrow(TenantScopeMissingError)
  })

  it('refuses a tenant condition for a different tenant than the active one', () => {
    const scope = { conditions: [{ kind: 'tenant', column: 'tenant_id', tenant: TENANT_B } as const], tenant: { column: 'tenant_id', id: TENANT_A } }
    expect(() => renderAggregate(plan, scope, 'sqlite')).toThrow(/without "tenant = active tenant"/)
  })

  it('accepts the scoped query and binds the tenant id', () => {
    const tenant = { column: 'tenant_id', id: TENANT_A }
    expect(() => assertTenantScoped('invoices', [{ kind: 'tenant', column: 'tenant_id', tenant: TENANT_A }], tenant)).not.toThrow()
    const rendered = renderAggregate(plan, { conditions: [{ kind: 'tenant', column: 'tenant_id', tenant: TENANT_A }], tenant }, 'postgres')
    expect(rendered.text).toBe('SELECT COUNT(*) AS row_count FROM "invoices" AS t WHERE t."tenant_id" = $1 AND t."deleted_at" IS NULL')
    expect(rendered.params).toEqual([TENANT_A])
  })
})

describe('secret, hidden and internal data', () => {
  let api: ReturnType<typeof handlerFor>
  beforeAll(() => {
    api = handlerFor(createSqlite().executor)
  })

  it('a secret-looking column (api_key) is not groupable, filterable or listed in hints', async () => {
    for (const query of ['metric=count&groupBy=api_key', 'metric=count&filter[api_key][startsWith]=sk_live']) {
      const { status, body } = await api.get(`/api/v1/customers/aggregate?${query}`, { tenant: TENANT_A })
      expect(status, query).toBe(422)
      const hints = ((body as Problem).issues ?? []).map((issue) => issue.message).join(' ')
      expect(hints).not.toMatch(/api_key[,.]/)
      expect(hints).not.toContain('tenant_id')
    }
  })

  it('a hidden column (users.password) is refused even though it exists', async () => {
    const { status } = await api.get('/api/v1/users/aggregate?metric=count&groupBy=password')
    expect(status).toBe(422)
  })

  it('internal and unknown resources get the same 404', async () => {
    const internal = await api.get('/api/v1/sessions/aggregate?metric=count', { tenant: TENANT_A })
    const unknown = await api.get('/api/v1/nope/aggregate?metric=count', { tenant: TENANT_A })
    expect(internal.status).toBe(404)
    expect(internal.body).toEqual(unknown.body)
  })

  it('a resource without a policy is denied (deny by default)', async () => {
    const strict = handlerFor(createSqlite().executor, { policies: {} })
    expect((await strict.get('/api/v1/invoices/aggregate?metric=count', { tenant: TENANT_A })).status).toBe(403)
  })

  it('a policy scope that does not fit its column fails closed (500), never "all rows"', async () => {
    const broken = handlerFor(createSqlite().executor, {
      policies: { invoices: { viewAny: () => true, scope: () => [{ field: 'customer_id', value: 'not-a-number' }] } },
    })
    expect((await broken.get('/api/v1/invoices/aggregate?metric=count', { tenant: TENANT_A })).status).toBe(500)
  })

  it('guests never fall through a policy that has a row scope', async () => {
    const open = handlerFor(createSqlite().executor, { policies: { invoices: { viewAny: () => true, scope: () => [] } } })
    expect((await open.get('/api/v1/invoices/aggregate?metric=count', { tenant: TENANT_A, actor: null })).status).toBe(403)
  })
})

describe.each(engines)('small-group suppression (employees, k = 5) on $name', (engine) => {
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
  const get = (query: string) => api.get(`/api/v1/employees/aggregate?${query}`, { tenant: TENANT_A })

  it('hides groups of 1..4 people; shows 0 and groups of 5+', async () => {
    const { body } = await get('metric=avg&field=salary&groupBy=department')
    const result = body as AggregateResult
    expect(result.data.map((bucket) => [bucket.key, bucket.values['value'], bucket.suppressed ?? []])).toEqual([
      ['engineering', 102500, []],
      ['sales', 62000, []],
      ['support', null, ['value']],
      ['finance', null, ['value']], // the one 250,000 salary
      ['legal', null, []], // no one here (tenant B's legal team is invisible): nothing to average
    ])
    expect(result.meta).toMatchObject({ minGroupSize: 5, suppressedCells: 2 })
  })

  it('complementary suppression: one hidden cell takes the next smallest with it', async () => {
    // engineering 6, sales 5, support 2: hiding only support would leave "total − 6 − 5" = support.
    // So the smallest other non-empty cell (sales) is hidden as well.
    const { body } = await get('metric=count&groupBy=department&filter[department][in]=engineering,sales,support')
    expect((body as AggregateResult).data.map((bucket) => bucket.values['value'])).toEqual([6, null, null, 0, 0])
    expect((body as AggregateResult).data[1]?.suppressed).toEqual(['value'])
    expect((body as AggregateResult).meta.suppressedCells).toBe(2)
  })

  it('suppresses an ungrouped total too', async () => {
    const { body } = await get('metric=sum&field=salary&filter[department][eq]=finance')
    expect((body as AggregateResult).data).toEqual([{ key: '__total__', values: { value: null }, suppressed: ['value'] }])
  })

  it('limits filters to equality on group fields, so nobody can be singled out', async () => {
    for (const query of ['metric=count&filter[name][eq]=Person 14', 'metric=count&filter[salary][gte]=200000', 'metric=count&filter[department][ne]=sales']) {
      const { status } = await get(query)
      expect(status, query).toBe(422)
    }
    expect((await get('metric=count&filter[department][in]=sales,engineering')).status).toBe(200)
  })
})

describe('fuzz: random parameters never crash the endpoint', () => {
  it('2,000 random queries answer 200 or 422, never 500', async () => {
    const api = handlerFor(createSqlite().executor)
    const keys = ['metric', 'field', 'groupBy', 'interval', 'splitBy', 'dateField', 'from', 'to', 'limit', 'filter[status][in]', 'filter[total][gte]', 'filter[number][contains]', 'filter[x]', 'filter[status][', 'groupby', '__proto__', 'filter[tenant_id][eq]']
    const pool = ['count', 'sum', 'avg', 'total', 'tax', 'status', 'paid', 'customer_id', 'created_at', 'issued_on', 'tenant_id', 'api_key', 'day', 'week', 'month', 'year', '2026-11-14', '2026-02-30', '0001-01-01', '9999-12-31', '-1', '51', '3', "'; DROP TABLE invoices; --", '%', '_\\', 'paid,sent', '1e309', 'ﬀ', '\u0000', '']
    let seed = 42
    const pick = <T>(list: readonly T[]): T => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648
      return list[seed % list.length] as T
    }
    const statuses = new Map<number, number>()
    for (let index = 0; index < 2_000; index += 1) {
      // Half the requests start from a valid base, so the fuzz also reaches the SQL, not only validation.
      const params = new URLSearchParams(index % 2 === 0 ? 'metric=count' : '')
      for (let count = 0; count < index % 4; count += 1) params.set(pick(keys), pick(pool))
      const { status } = await api.get(`/api/v1/invoices/aggregate?${params.toString()}`, { tenant: TENANT_A })
      statuses.set(status, (statuses.get(status) ?? 0) + 1)
    }
    expect([...statuses.keys()].sort()).toEqual(expect.arrayContaining([200, 422]))
    expect(statuses.has(500)).toBe(false)
    expect(api.errors).toEqual([])
  })
})

it('the fixture "now" and resolved charts are what the tests assume', () => {
  expect(NOW.toISOString()).toBe('2026-11-14T12:00:00.000Z')
  expect(charts.get('employees')?.minGroupSize).toBe(5)
  expect(charts.has('sessions')).toBe(false)
})
