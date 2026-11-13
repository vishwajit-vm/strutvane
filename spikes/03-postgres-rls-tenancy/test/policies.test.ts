/**
 * Policy design: why tenant isolation must be a RESTRICTIVE policy, plus a tenancy audit query
 * (a prototype of a future `sv doctor` / CI check) that flags unprotected tenant tables.
 */
import type pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { readSql } from '../src/migrate.ts'
import { withTenant } from '../src/tenant.ts'
import { INVOICES_PER_TENANT, TENANT_A, TENANT_B, closePools, createPool, seed } from './helpers.ts'

let superuser: pg.Pool
let owner: pg.Pool
let app: pg.Pool

beforeAll(() => {
  superuser = createPool('postgres')
  owner = createPool('app_owner')
  app = createPool('app_user')
})
beforeEach(async () => seed(superuser))
afterAll(closePools)

describe('RESTRICTIVE tenant policy', () => {
  it('a sloppy extra PERMISSIVE policy cannot widen access across tenants', async () => {
    try {
      await owner.query('CREATE POLICY sloppy_read_all ON app.invoices AS PERMISSIVE FOR SELECT TO app_user USING (true)')
      const n = await withTenant(app, TENANT_A, async (c) =>
        Number((await c.query<{ n: string }>('SELECT count(*) AS n FROM app.invoices')).rows[0]?.n))
      expect(n).toBe(INVOICES_PER_TENANT)
    } finally {
      await owner.query('DROP POLICY IF EXISTS sloppy_read_all ON app.invoices')
    }
  })

  it('contrast: with a PERMISSIVE-only tenant policy, the same sloppy policy leaks every tenant', async () => {
    try {
      await owner.query(`
        CREATE TABLE app.notes (tenant_id uuid NOT NULL REFERENCES app.tenants (id), body text NOT NULL);
        ALTER TABLE app.notes ENABLE ROW LEVEL SECURITY;
        ALTER TABLE app.notes FORCE ROW LEVEL SECURITY;
        CREATE POLICY tenant_permissive ON app.notes AS PERMISSIVE FOR ALL
          USING (tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid);
        CREATE POLICY sloppy_read_all ON app.notes AS PERMISSIVE FOR SELECT TO app_user USING (true);
        GRANT SELECT ON app.notes TO app_user;`)
      await superuser.query(`INSERT INTO app.notes VALUES ($1, 'a'), ($2, 'b')`, [TENANT_A, TENANT_B])
      const tenants = await withTenant(app, TENANT_A, async (c) =>
        (await c.query<{ tenant_id: string }>('SELECT DISTINCT tenant_id FROM app.notes')).rows.map((r) => r.tenant_id))
      expect(new Set(tenants)).toEqual(new Set([TENANT_A, TENANT_B])) // LEAK: permissive policies are OR-ed
    } finally {
      await owner.query('DROP TABLE IF EXISTS app.notes')
    }
  })
})

describe('tenancy audit query', () => {
  const audit = async (): Promise<Array<{ table_name: string }>> =>
    (await superuser.query<{ table_name: string }>(await readSql('audit.sql'))).rows

  it('reports nothing for the spike schema (every tenant table is protected)', async () => {
    expect(await audit()).toEqual([])
  })

  it('flags tables with tenant_id that lack RLS, lack FORCE, or lack a restrictive policy', async () => {
    try {
      await owner.query(`
        CREATE TABLE app.no_rls (tenant_id uuid);
        CREATE TABLE app.no_force (tenant_id uuid);
        ALTER TABLE app.no_force ENABLE ROW LEVEL SECURITY;
        CREATE POLICY t ON app.no_force AS RESTRICTIVE USING (true);
        CREATE TABLE app.no_restrictive (tenant_id uuid);
        ALTER TABLE app.no_restrictive ENABLE ROW LEVEL SECURITY;
        ALTER TABLE app.no_restrictive FORCE ROW LEVEL SECURITY;
        CREATE POLICY t ON app.no_restrictive AS PERMISSIVE USING (true);`)
      expect((await audit()).map((r) => r.table_name)).toEqual(['no_force', 'no_restrictive', 'no_rls'])
    } finally {
      await owner.query('DROP TABLE IF EXISTS app.no_rls, app.no_force, app.no_restrictive')
    }
  })
})
