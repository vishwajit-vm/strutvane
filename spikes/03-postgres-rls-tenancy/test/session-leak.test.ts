/**
 * Question (4): what happens if code uses a SESSION-level setting (plain `SET app.tenant_id = ...`
 * or `set_config(..., false)`) instead of a transaction-local one?
 * Expected: it leaks into later requests on the same connection. Through PgBouncer in transaction
 * mode it even leaks to OTHER clients. That is the reason for the lint rule recommended in the README.
 */
import pg from 'pg'
import { afterAll, afterEach, beforeAll, describe, expect, inject, it } from 'vitest'
import { TENANT_SETTING } from '../src/tenant.ts'
import { INVOICES_PER_TENANT, TENANT_A, closePools, createPool, seed, terminateBackends } from './helpers.ts'

let superuser: pg.Pool

beforeAll(async () => {
  superuser = createPool('postgres')
  await seed(superuser)
})
// Poisoned server connections must never survive this file.
afterEach(async () => terminateBackends(superuser, 'app_user'))
afterAll(closePools)

const count = async (q: pg.Pool | pg.Client): Promise<number> =>
  Number((await q.query<{ n: string }>('SELECT count(*) AS n FROM app.invoices')).rows[0]?.n)

describe('session-level settings leak (anti-pattern)', () => {
  it('plain SET on a pooled connection leaks the tenant into the next, unrelated request', async () => {
    const pool = createPool('app_user', { max: 1 })
    // "Request 1" for tenant A wrongly uses a session-level SET. SET cannot take bind parameters,
    // so real code would also be interpolating a value into SQL here, which is a second problem.
    await pool.query(`SET ${TENANT_SETTING} = '${TENANT_A}'`)
    // "Request 2" sets no tenant at all, yet it sees tenant A's data:
    expect(await count(pool)).toBe(INVOICES_PER_TENANT)
  })

  it('set_config(..., false) leaks exactly the same way', async () => {
    const pool = createPool('app_user', { max: 1 })
    await pool.query('SELECT set_config($1, $2, false)', [TENANT_SETTING, TENANT_A])
    expect(await count(pool)).toBe(INVOICES_PER_TENANT)
  })

  it('through PgBouncer transaction mode, one client\'s session SET leaks to OTHER clients', async () => {
    const { bouncerPoolSize, host, bouncerPort, database, passwords } = inject('spike')
    const poisoner = createPool('app_user', { via: 'pgbouncer', max: 16 })

    // Poison every server connection in PgBouncer's pool. pg_sleep keeps each server connection
    // busy, which forces PgBouncer to spread the concurrent statements across all of them.
    const poisoned = new Set<number>()
    for (let attempt = 0; attempt < 30 && poisoned.size < bouncerPoolSize; attempt++) {
      const results = await Promise.all(Array.from({ length: 16 }, () =>
        poisoner.query<{ pid: number }>(
          'SELECT pg_backend_pid() AS pid, set_config($1, $2, false), pg_sleep(0.05)', [TENANT_SETTING, TENANT_A])))
      for (const r of results) if (r.rows[0]) poisoned.add(r.rows[0].pid)
    }
    expect(poisoned.size).toBe(bouncerPoolSize)

    // A completely separate client (think: another app instance) connects through PgBouncer.
    const victim = new pg.Client({ host, port: bouncerPort, database, user: 'app_user', password: passwords.appUser })
    await victim.connect()
    try {
      let leaked = 0
      for (let i = 0; i < 40; i++) if ((await count(victim)) === INVOICES_PER_TENANT) leaked++
      expect(leaked).toBe(40) // every single unscoped query saw tenant A's rows
    } finally {
      await victim.end()
    }
  })
})
