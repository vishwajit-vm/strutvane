/**
 * Question (5): who can bypass RLS? This documents the superuser, BYPASSRLS, table-owner and
 * object-owner (views / SECURITY DEFINER functions) risks with executable evidence.
 */
import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { withTenant } from '../src/tenant.ts'
import { INVOICES_PER_TENANT, TENANT_A, closePools, createPool, seed } from './helpers.ts'

const ALL = INVOICES_PER_TENANT * 2

let superuser: pg.Pool
let app: pg.Pool

beforeAll(() => {
  superuser = createPool('postgres')
  app = createPool('app_user')
})
beforeEach(async () => seed(superuser))
afterAll(closePools)

const count = async (q: pg.Pool | pg.PoolClient, relation = 'app.invoices'): Promise<number> =>
  Number((await q.query<{ n: string }>(`SELECT count(*) AS n FROM ${relation}`)).rows[0]?.n)

describe('RLS bypass vectors', () => {
  it('a superuser ALWAYS bypasses RLS, even with FORCE and even with a tenant set', async () => {
    expect(await count(superuser)).toBe(ALL)
    expect(await withTenant(superuser, TENANT_A, (c) => count(c))).toBe(ALL)
  })

  it('a role with the BYPASSRLS attribute sees every tenant', async () => {
    expect(await count(createPool('app_bypass'))).toBe(ALL)
  })

  it('FORCE ROW LEVEL SECURITY makes the table owner subject to policies (fully locked out here)', async () => {
    const owner = createPool('app_owner')
    expect(await count(owner)).toBe(0)
    // Even WITH a tenant set the owner sees nothing: the RESTRICTIVE tenant policy grants nothing
    // on its own, and the only PERMISSIVE policy (app_access) is scoped `TO app_user`. Only roles
    // that are explicitly given a permissive policy can see rows at all.
    expect(await withTenant(owner, TENANT_A, (c) => count(c))).toBe(0)
  })

  it('...but the owner can switch FORCE off, so the runtime must never connect as the owner', async () => {
    const owner = createPool('app_owner', { max: 1 })
    const client = await owner.connect()
    try {
      await client.query('BEGIN')
      await client.query('ALTER TABLE app.invoices NO FORCE ROW LEVEL SECURITY') // DDL is transactional in PostgreSQL
      expect(await count(client)).toBe(ALL)
      await client.query('ROLLBACK') // restore the protection
    } finally {
      client.release()
    }
    expect(await count(owner)).toBe(0)
  })

  it('a view owned by a superuser leaks every tenant to app_user; security_invoker views do not', async () => {
    try {
      await superuser.query('CREATE VIEW app.leaky_invoices AS SELECT * FROM app.invoices')
      await superuser.query(
        'CREATE VIEW app.safe_invoices WITH (security_invoker = true) AS SELECT * FROM app.invoices')
      await superuser.query('GRANT SELECT ON app.leaky_invoices, app.safe_invoices TO app_user')
      expect(await count(app, 'app.leaky_invoices')).toBe(ALL) // checked as the superuser view owner
      expect(await count(app, 'app.safe_invoices')).toBe(0) // checked as the caller: fail-closed
      expect(await withTenant(app, TENANT_A, (c) => count(c, 'app.safe_invoices'))).toBe(INVOICES_PER_TENANT)
    } finally {
      await superuser.query('DROP VIEW IF EXISTS app.leaky_invoices, app.safe_invoices')
    }
  })

  it('a SECURITY DEFINER function owned by a superuser leaks every tenant', async () => {
    try {
      await superuser.query(`
        CREATE FUNCTION app.count_all_invoices() RETURNS bigint
        LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog
        AS $$ SELECT count(*) FROM app.invoices $$`)
      await superuser.query('GRANT EXECUTE ON FUNCTION app.count_all_invoices() TO app_user')
      const { rows } = await app.query<{ n: string }>('SELECT app.count_all_invoices() AS n')
      expect(Number(rows[0]?.n)).toBe(ALL)
    } finally {
      await superuser.query('DROP FUNCTION IF EXISTS app.count_all_invoices()')
    }
  })

  it('app_user cannot disable RLS or change policies itself', async () => {
    await expect(app.query('ALTER TABLE app.invoices DISABLE ROW LEVEL SECURITY')).rejects.toThrow(/must be owner/)
    await expect(app.query('DROP POLICY tenant_isolation ON app.invoices')).rejects.toThrow(/must be owner/)
    await expect(app.query(`ALTER ROLE app_user BYPASSRLS`)).rejects.toThrow(/permission denied/)
  })
})
