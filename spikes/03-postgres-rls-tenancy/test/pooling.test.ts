/**
 * Question (3): with transaction-scoped settings, can one tenant's id ever leak into another
 * request through a pooled connection? This is tested both with a pg Pool connected directly
 * and through PgBouncer in TRANSACTION pooling mode, where many client connections share a few
 * server connections.
 *
 * Method: thousands of concurrent transactions alternate between tenants A and B, with jitter
 * inside each transaction to force interleaving. Every row seen must belong to the expected tenant,
 * every unscoped query in between must see zero rows, and some transactions deliberately fail
 * and roll back. Backend PIDs are recorded to prove the physical connections really were reused.
 */
import type pg from 'pg'
import { setTimeout as sleep } from 'node:timers/promises'
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest'
import { withTenant } from '../src/tenant.ts'
import { INVOICES_PER_TENANT, TENANT_A, TENANT_B, closePools, createPool, seed, terminateBackends } from './helpers.ts'

const TRANSACTIONS = 2_400

let superuser: pg.Pool

beforeAll(async () => {
  superuser = createPool('postgres')
  await seed(superuser)
  await terminateBackends(superuser, 'app_user') // start from clean server connections
})
afterAll(closePools)

interface HammerResult {
  committed: number
  rolledBack: number
  crossTenantRows: number
  unscopedChecks: number
  unscopedLeaks: number
  backendPids: Set<number>
}

class PlannedFailure extends Error {}

async function hammer(pool: pg.Pool, concurrency: number): Promise<HammerResult> {
  const result: HammerResult = {
    committed: 0, rolledBack: 0, crossTenantRows: 0, unscopedChecks: 0, unscopedLeaks: 0, backendPids: new Set(),
  }
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < TRANSACTIONS) {
      const i = next++
      const tenant = (i * 7919) % 2 === 0 ? TENANT_A : TENANT_B // deterministic but interleaved
      try {
        await withTenant(pool, tenant, async (c) => {
          const first = await c.query<{ tenant_id: string; pid: number }>(
            'SELECT tenant_id, pg_backend_pid() AS pid FROM app.invoices')
          await sleep(i % 3) // jitter: other transactions run while this one is open
          const second = await c.query<{ tenant_id: string }>('SELECT tenant_id FROM app.invoices')
          for (const row of [...first.rows, ...second.rows]) if (row.tenant_id !== tenant) result.crossTenantRows++
          if (first.rows.length !== INVOICES_PER_TENANT) result.crossTenantRows++
          const pid = first.rows[0]?.pid
          if (pid !== undefined) result.backendPids.add(pid)
          if (i % 50 === 0) throw new PlannedFailure() // exercise the ROLLBACK path too
        })
        result.committed++
      } catch (error) {
        if (!(error instanceof PlannedFailure)) throw error
        result.rolledBack++
      }
      if (i % 10 === 0) {
        // An unscoped query on the same pool must never see a tenant.
        const { rows } = await pool.query<{ n: string }>('SELECT count(*) AS n FROM app.invoices')
        result.unscopedChecks++
        if (Number(rows[0]?.n) !== 0) result.unscopedLeaks++
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker))
  return result
}

describe('no tenant leak across pooled connections (transaction-scoped settings)', () => {
  it(`direct pg Pool (max 8): ${TRANSACTIONS} concurrent transactions, zero leaks`, async () => {
    const pool = createPool('app_user', { max: 8 })
    const r = await hammer(pool, 16)
    expect(r.committed + r.rolledBack).toBe(TRANSACTIONS)
    expect(r.rolledBack).toBe(TRANSACTIONS / 50)
    expect(r.crossTenantRows).toBe(0)
    expect(r.unscopedLeaks).toBe(0)
    expect(r.unscopedChecks).toBe(TRANSACTIONS / 10)
    expect(r.backendPids.size).toBeLessThanOrEqual(8)
  })

  it(`PgBouncer transaction mode (32 clients -> 4 server connections): ${TRANSACTIONS} transactions, zero leaks`, async () => {
    const { bouncerPoolSize } = inject('spike')
    const pool = createPool('app_user', { via: 'pgbouncer', max: 32 })
    const r = await hammer(pool, 32)
    expect(r.committed + r.rolledBack).toBe(TRANSACTIONS)
    expect(r.crossTenantRows).toBe(0)
    expect(r.unscopedLeaks).toBe(0)
    // Proof that PgBouncer really multiplexed: 32 client connections were served by <= 4 backends,
    // so each backend ran hundreds of different tenants' transactions back to back.
    expect(r.backendPids.size).toBeGreaterThan(0)
    expect(r.backendPids.size).toBeLessThanOrEqual(bouncerPoolSize)
    console.info(`[pgbouncer] ${TRANSACTIONS} transactions served by ${r.backendPids.size} server backends: ${[...r.backendPids].join(', ')}`)
  })
})
