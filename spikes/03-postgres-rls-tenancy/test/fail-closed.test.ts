/**
 * Question (2): when no tenant is set, is access fail-closed (zero rows, writes rejected),
 * and does the withTenant() helper behave robustly on bad input and on errors?
 */
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { InvalidTenantIdError, TENANT_SETTING, withTenant } from '../src/tenant.ts'
import { INVOICES_PER_TENANT, TENANT_A, TENANT_B, closePools, createPool, groundTruth, seed, sqlState } from './helpers.ts'

let superuser: pg.Pool

beforeAll(() => {
  superuser = createPool('postgres')
})
beforeEach(async () => seed(superuser))
afterAll(closePools)

const countInvoices = async (q: pg.Pool | pg.PoolClient): Promise<number> =>
  Number((await q.query<{ n: string }>('SELECT count(*) AS n FROM app.invoices')).rows[0]?.n)

describe('fail-closed when no tenant is set', () => {
  it('a fresh connection without a tenant sees zero rows, not an error', async () => {
    const app = createPool('app_user', { max: 1 })
    expect(await countInvoices(app)).toBe(0)
    expect((await app.query('SELECT * FROM app.tenants')).rowCount).toBe(0)
  })

  it('writes without a tenant are rejected or affect nothing', async () => {
    const app = createPool('app_user', { max: 1 })
    await expect(
      app.query(`INSERT INTO app.invoices (tenant_id, number, amount) VALUES ($1, 'X-1', 1)`, [TENANT_A]),
    ).rejects.toSatisfy((error: unknown) => sqlState(error) === '42501')
    expect((await app.query('UPDATE app.invoices SET amount = 0')).rowCount).toBe(0)
    expect((await app.query('DELETE FROM app.invoices')).rowCount).toBe(0)
    expect(await groundTruth(superuser)).toEqual({ [TENANT_A]: INVOICES_PER_TENANT, [TENANT_B]: INVOICES_PER_TENANT })
  })

  it('a pooled connection reused after a tenant transaction sees zero rows again', async () => {
    const app = createPool('app_user', { max: 1 }) // max 1 forces the exact same physical connection
    const pidInside = await withTenant(app, TENANT_A, async (c) => {
      expect(await countInvoices(c)).toBe(INVOICES_PER_TENANT)
      return (await c.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')).rows[0]?.pid
    })
    const after = await app.query<{ pid: number; n: string }>(
      'SELECT pg_backend_pid() AS pid, (SELECT count(*) FROM app.invoices) AS n')
    expect(after.rows[0]?.pid).toBe(pidInside) // proves it really is the same connection
    expect(Number(after.rows[0]?.n)).toBe(0)
  })

  it('documents current_setting semantics: NULL before, empty string after a local setting ends', async () => {
    const client = new pg.Client(poolConfig(createPool('app_user')))
    await client.connect()
    try {
      const read = async (): Promise<string | null> =>
        (await client.query<{ v: string | null }>('SELECT current_setting($1, true) AS v', [TENANT_SETTING])).rows[0]?.v ?? null
      expect(await read()).toBeNull() // never set in this session
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', [TENANT_SETTING, TENANT_A])
      expect(await read()).toBe(TENANT_A)
      await client.query('COMMIT')
      expect(await read()).toBe('') // NOT null: the placeholder now exists in the session with ''
      // Without NULLIF in the policy, this cast would make every unscoped query ERROR on reused connections:
      await expect(client.query(`SELECT ''::uuid`)).rejects.toSatisfy((e: unknown) => sqlState(e) === '22P02')
    } finally {
      await client.end()
    }
  })

  it('a local setting outside an explicit transaction lasts only for that one statement', async () => {
    const app = createPool('app_user', { max: 1 })
    const client = await app.connect()
    try {
      await client.query('SELECT set_config($1, $2, true)', [TENANT_SETTING, TENANT_A]) // autocommit: its own transaction
      expect(await countInvoices(client)).toBe(0) // the setting is already gone: still fail-closed
    } finally {
      client.release()
    }
  })

  it('a malformed tenant value set directly (bypassing the helper) errors instead of matching rows', async () => {
    const app = createPool('app_user', { max: 1 })
    const client = await app.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT set_config($1, $2, true)', [TENANT_SETTING, "' OR true --"])
      await expect(client.query('SELECT * FROM app.invoices')).rejects.toSatisfy((e: unknown) => sqlState(e) === '22P02')
      await client.query('ROLLBACK')
    } finally {
      client.release()
    }
  })
})

describe('withTenant() robustness', () => {
  it.each(['', 'not-a-uuid', "' OR 1=1 --", `${TENANT_A} `, '0a0a0a0a00004000800000000000000a'])(
    'rejects %j before checking out a connection', async (badId) => {
      const app = createPool('app_user', { max: 1 })
      await expect(withTenant(app, badId, async () => 'never')).rejects.toBeInstanceOf(InvalidTenantIdError)
      expect(app.totalCount).toBe(0) // no connection was ever opened
    })

  it('rolls back and re-throws the original error when work fails', async () => {
    const app = createPool('app_user', { max: 1 })
    const boom = new Error('business rule failed')
    await expect(withTenant(app, TENANT_A, async (c) => {
      await c.query(`INSERT INTO app.invoices (tenant_id, number, amount) VALUES ($1, 'A-ROLLED-BACK', 1)`, [TENANT_A])
      throw boom
    })).rejects.toBe(boom)
    expect((await groundTruth(superuser))[TENANT_A]).toBe(INVOICES_PER_TENANT)
    expect(app.idleCount).toBe(1) // healthy connection returned to the pool
  })

  it('destroys (never re-pools) a connection whose transaction could not be closed', async () => {
    const app = createPool('app_user', { max: 1 })
    // Kill our own backend mid-transaction: the query fails and ROLLBACK then fails too.
    await expect(withTenant(app, TENANT_A, (c) => c.query('SELECT pg_terminate_backend(pg_backend_pid())'))).rejects.toThrow()
    expect(app.totalCount).toBe(0) // destroyed, not returned
    // The pool recovers with a brand-new connection.
    expect(await withTenant(app, TENANT_A, async (c) => countInvoices(c))).toBe(INVOICES_PER_TENANT)
  })
})

function poolConfig(pool: pg.Pool): pg.ClientConfig {
  const { host, port, database, user, password } = pool.options
  return { host, port, database, user, password } as pg.ClientConfig
}
