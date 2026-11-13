/**
 * Question (1): with a tenant set via withTenant(), can app_user read, update, delete or insert
 * another tenant's rows? Expected: no, through every statement type.
 */
import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant } from '../src/tenant.ts'
import {
  INVOICES_PER_TENANT, TENANT_A, TENANT_B, closePools, createPool, groundTruth, seed, sqlState,
} from './helpers.ts'

let superuser: pg.Pool
let app: pg.Pool

beforeAll(() => {
  superuser = createPool('postgres')
  app = createPool('app_user')
})
beforeEach(async () => seed(superuser))
afterAll(closePools)

async function anyInvoiceIdOf(tenantId: string): Promise<string> {
  const { rows } = await superuser.query<{ id: string }>(
    'SELECT id FROM app.invoices WHERE tenant_id = $1 ORDER BY number LIMIT 1', [tenantId],
  )
  const id = rows[0]?.id
  if (id === undefined) throw new Error('seed produced no invoices')
  return id
}

describe('cross-tenant isolation for app_user (RLS enforced)', () => {
  it('SELECT returns only the current tenant rows', async () => {
    const rows = await withTenant(app, TENANT_A, async (c) =>
      (await c.query<{ tenant_id: string }>('SELECT tenant_id FROM app.invoices')).rows)
    expect(rows).toHaveLength(INVOICES_PER_TENANT)
    expect(new Set(rows.map((r) => r.tenant_id))).toEqual(new Set([TENANT_A]))
  })

  it('aggregates and the tenants table are scoped too', async () => {
    const result = await withTenant(app, TENANT_B, async (c) => ({
      invoices: (await c.query<{ n: string }>('SELECT count(*) AS n FROM app.invoices')).rows[0]?.n,
      tenants: (await c.query<{ id: string }>('SELECT id FROM app.tenants')).rows.map((r) => r.id),
    }))
    expect(Number(result.invoices)).toBe(INVOICES_PER_TENANT)
    expect(result.tenants).toEqual([TENANT_B])
  })

  it('cannot read another tenant row even by primary key', async () => {
    const foreignId = await anyInvoiceIdOf(TENANT_B)
    const { rowCount } = await withTenant(app, TENANT_A, (c) =>
      c.query('SELECT * FROM app.invoices WHERE id = $1', [foreignId]))
    expect(rowCount).toBe(0)
  })

  it('UPDATE targeting another tenant affects zero rows', async () => {
    const { rowCount } = await withTenant(app, TENANT_A, (c) =>
      c.query('UPDATE app.invoices SET amount = 0 WHERE tenant_id = $1', [TENANT_B]))
    expect(rowCount).toBe(0)
    const { rows } = await superuser.query<{ n: string }>(
      'SELECT count(*) AS n FROM app.invoices WHERE tenant_id = $1 AND amount = 0', [TENANT_B])
    expect(Number(rows[0]?.n)).toBe(0)
  })

  it('DELETE without a WHERE clause only deletes the current tenant rows', async () => {
    const { rowCount } = await withTenant(app, TENANT_A, (c) => c.query('DELETE FROM app.invoices'))
    expect(rowCount).toBe(INVOICES_PER_TENANT)
    expect(await groundTruth(superuser)).toEqual({ [TENANT_B]: INVOICES_PER_TENANT })
  })

  it('INSERT spoofing another tenant_id is rejected by WITH CHECK (SQLSTATE 42501)', async () => {
    const attempt = withTenant(app, TENANT_A, (c) =>
      c.query(`INSERT INTO app.invoices (tenant_id, number, amount) VALUES ($1, 'EVIL-1', 1)`, [TENANT_B]))
    await expect(attempt).rejects.toThrow(/row-level security/)
    await attempt.catch((error: unknown) => expect(sqlState(error)).toBe('42501'))
    expect(await groundTruth(superuser)).toEqual({ [TENANT_A]: INVOICES_PER_TENANT, [TENANT_B]: INVOICES_PER_TENANT })
  })

  it('UPDATE moving an own row to another tenant is rejected by WITH CHECK (42501)', async () => {
    const ownId = await anyInvoiceIdOf(TENANT_A)
    const attempt = withTenant(app, TENANT_A, (c) =>
      c.query('UPDATE app.invoices SET tenant_id = $1 WHERE id = $2', [TENANT_B, ownId]))
    await expect(attempt).rejects.toSatisfy((error: unknown) => sqlState(error) === '42501')
    expect(await groundTruth(superuser)).toEqual({ [TENANT_A]: INVOICES_PER_TENANT, [TENANT_B]: INVOICES_PER_TENANT })
  })

  it('INSERT for the current tenant succeeds (sanity check)', async () => {
    await withTenant(app, TENANT_A, (c) =>
      c.query(`INSERT INTO app.invoices (tenant_id, number, amount) VALUES ($1, 'A-NEW', 5)`, [TENANT_A]))
    expect((await groundTruth(superuser))[TENANT_A]).toBe(INVOICES_PER_TENANT + 1)
  })
})
