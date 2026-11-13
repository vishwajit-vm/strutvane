/**
 * Prototype of the Strutvane tenant-scoping helper.
 *
 * Every database interaction made on behalf of a tenant runs inside ONE transaction that
 * starts with:
 *
 *     SELECT set_config('app.tenant_id', $1, true)   -- true = is_local = transaction-scoped
 *
 * `set_config(..., true)` is the parameterised equivalent of `SET LOCAL app.tenant_id = '...'`.
 * `SET` cannot take bind parameters, so using it with a dynamic value would mean string
 * interpolation (an injection risk). `set_config` takes `$1`.
 *
 * Because the setting is transaction-local, PostgreSQL discards it at COMMIT or ROLLBACK. A pooled
 * connection, whether from a pg Pool or PgBouncer in transaction mode, therefore never carries one
 * tenant's id into the next request. Proven in test/pooling.test.ts.
 */
import type { Pool, PoolClient } from 'pg'

/** Name of the custom PostgreSQL setting read by every RLS policy. */
export const TENANT_SETTING = 'app.tenant_id'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Returns true when `value` is a canonical hyphenated UUID string. */
export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value)
}

/** Thrown before any database work when the tenant id is not a valid UUID. */
export class InvalidTenantIdError extends Error {
  override readonly name = 'InvalidTenantIdError'
  constructor(readonly tenantId: unknown) {
    super(`Invalid tenant id: expected a UUID, got ${JSON.stringify(String(tenantId)).slice(0, 80)}`)
  }
}

/**
 * Runs `work` inside a transaction scoped to `tenantId`.
 *
 * Guarantees:
 *  - The tenant id is validated before a connection is even checked out.
 *  - The transaction is committed when `work` resolves and rolled back when it throws.
 *    The original error is always re-thrown unchanged.
 *  - The client is always released. If the transaction could not be closed cleanly (BEGIN,
 *    COMMIT or ROLLBACK failed, or the backend died), the connection is DESTROYED instead of being
 *    returned to the pool, so a connection in an unknown state, possibly still inside a tenant
 *    transaction, is never reused.
 *  - A backend dying mid-transaction surfaces as a rejected promise, never as an uncaught
 *    'error' event that would crash the process.
 *
 * Contract for `work`: it must only run statements through the given client and must not issue
 * COMMIT, ROLLBACK, SET or set_config itself. The real framework will enforce this by handing out
 * a restricted query interface instead of the raw client.
 */
export async function withTenant<T>(
  pool: Pool,
  tenantId: string,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!isUuid(tenantId)) throw new InvalidTenantIdError(tenantId)

  const client = await pool.connect()
  // When set, release(error) destroys the physical connection instead of pooling it.
  let brokenConnection: Error | undefined
  // A checked-out pg client emits 'error' if its backend dies (crash, failover,
  // pg_terminate_backend). pg.Pool only listens on IDLE clients, so without this listener that
  // event is an uncaught exception that kills the Node process. Found by this spike: see the
  // "destroys (never re-pools)" test.
  const onClientError = (error: Error): void => {
    brokenConnection = error
  }
  client.on('error', onClientError)

  try {
    try {
      await client.query('BEGIN')
    } catch (error) {
      brokenConnection = toError(error)
      throw error
    }

    try {
      await client.query('SELECT set_config($1, $2, true)', [TENANT_SETTING, tenantId])
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try {
        await client.query('ROLLBACK')
      } catch (rollbackError) {
        // The connection may still be inside the tenant transaction. Never let it back into the pool.
        brokenConnection = toError(rollbackError)
      }
      throw error
    }
  } finally {
    client.off('error', onClientError)
    client.release(brokenConnection)
  }
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}
