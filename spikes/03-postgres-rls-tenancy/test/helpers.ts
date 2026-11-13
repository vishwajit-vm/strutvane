/**
 * Shared test helpers: typed connection pools per role, deterministic seed data, and assertions.
 */
import pg from 'pg'
import { inject } from 'vitest'

export const TENANT_A = '0a0a0a0a-0000-4000-8000-00000000000a'
export const TENANT_B = '0b0b0b0b-0000-4000-8000-00000000000b'
export const INVOICES_PER_TENANT = 25

export type Role = 'postgres' | 'app_owner' | 'app_user' | 'app_bypass'

const pools: pg.Pool[] = []

/** Opens a pool for `role`, straight to PostgreSQL or through PgBouncer (app_user only). */
export function createPool(role: Role, options: { via?: 'postgres' | 'pgbouncer'; max?: number } = {}): pg.Pool {
  const env = inject('spike')
  const via = options.via ?? 'postgres'
  if (via === 'pgbouncer' && role !== 'app_user') throw new Error('PgBouncer is configured for app_user only')
  const password = {
    postgres: env.passwords.postgres,
    app_owner: env.passwords.appOwner,
    app_user: env.passwords.appUser,
    app_bypass: env.passwords.appBypass,
  }[role]
  const pool = new pg.Pool({
    host: env.host,
    port: via === 'pgbouncer' ? env.bouncerPort : env.postgresPort,
    database: env.database,
    user: role,
    password,
    max: options.max ?? 4,
    connectionTimeoutMillis: 10_000,
  })
  // Some tests terminate backends on purpose. pg then emits 'error' for affected *idle* clients
  // and discards them. Without a listener that event would crash the process.
  pool.on('error', () => undefined)
  pools.push(pool)
  return pool
}

/** Ends every pool opened by createPool. Call in afterAll. */
export async function closePools(): Promise<void> {
  await Promise.all(pools.splice(0).map((pool) => pool.end()))
}

/** Resets data to two tenants with INVOICES_PER_TENANT invoices each (runs as superuser, bypassing RLS). */
export async function seed(superuser: pg.Pool): Promise<void> {
  await superuser.query('TRUNCATE app.invoices, app.tenants CASCADE')
  await superuser.query(`INSERT INTO app.tenants (id, name) VALUES ($1, 'Tenant A'), ($2, 'Tenant B')`, [TENANT_A, TENANT_B])
  await superuser.query(
    `INSERT INTO app.invoices (tenant_id, number, amount)
     SELECT t.id, t.prefix || '-' || lpad(g::text, 4, '0'), g * 10
     FROM (VALUES ($1::uuid, 'A'), ($2::uuid, 'B')) AS t(id, prefix)
     CROSS JOIN generate_series(1, $3::int) AS g`,
    [TENANT_A, TENANT_B, INVOICES_PER_TENANT],
  )
}

/** Count of invoices per tenant as seen with RLS bypassed (ground truth). */
export async function groundTruth(superuser: pg.Pool): Promise<Record<string, number>> {
  const { rows } = await superuser.query<{ tenant_id: string; n: string }>(
    'SELECT tenant_id, count(*) AS n FROM app.invoices GROUP BY tenant_id',
  )
  return Object.fromEntries(rows.map((r) => [r.tenant_id, Number(r.n)]))
}

/** Kills every backend of `role` so poisoned server connections cannot outlive a test. */
export async function terminateBackends(superuser: pg.Pool, role: Role): Promise<void> {
  await superuser.query(
    'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = $1 AND pid <> pg_backend_pid()',
    [role],
  )
}

/** Extracts the SQLSTATE code from a pg error. */
export function sqlState(error: unknown): string | undefined {
  return typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : undefined
}
