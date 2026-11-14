/**
 * Executors for the two engines this spike runs for real: SQLite (`node:sqlite`) and PostgreSQL
 * (PGlite). MySQL's SQL text is checked in `test/server/dialects.test.ts`; running it needs
 * Docker (spike 11 has the container helper) and was out of scope here.
 *
 * @module
 */
import type { PGlite } from '@electric-sql/pglite'
import type { DatabaseSync, SQLInputValue } from 'node:sqlite'
import type { AggregateExecutor, Row } from './execute.ts'
import type { RenderedSql, SqlParam } from './sql.ts'

/**
 * Wrap a `node:sqlite` database.
 *
 * @example
 * const executor = sqliteExecutor(new DatabaseSync(':memory:'))
 */
export function sqliteExecutor(database: DatabaseSync): AggregateExecutor {
  return {
    dialect: 'sqlite',
    async all(statement: RenderedSql): Promise<readonly Row[]> {
      return database.prepare(statement.text).all(...statement.params.map(toSqliteValue))
    },
  }
}

/** node:sqlite has no boolean binding; the SQL layer already turned booleans into 0/1. */
function toSqliteValue(value: SqlParam): SQLInputValue {
  return typeof value === 'boolean' ? (value ? 1 : 0) : value
}

/**
 * Options for {@link pgliteExecutor}.
 *
 * @example
 * const options: PgliteExecutorOptions = { role: 'strut_app' }
 */
export interface PgliteExecutorOptions {
  /**
   * Run statements as this (non-owner) role, so row-level security applies. Owners and superusers
   * bypass RLS, which is ADR-0007's rule 3; PGlite's default user is a superuser.
   */
  readonly role?: string
}

/**
 * Wrap a PGlite database. Every statement runs in its own transaction, which first sets
 * `app.tenant_id` transaction-locally (`set_config(…, true)`, ADR-0007 rule 1: never session-wide,
 * which leaks across pooled connections) so RLS policies see the same tenant as the WHERE clause.
 *
 * @example
 * const executor = pgliteExecutor(await PGlite.create(), { role: 'strut_app' })
 */
export function pgliteExecutor(database: PGlite, options: PgliteExecutorOptions = {}): AggregateExecutor {
  return {
    dialect: 'postgres',
    async all(statement: RenderedSql, context: { readonly tenant: string | null }): Promise<readonly Row[]> {
      return database.transaction(async (transaction) => {
        // An unset setting reads as '' (spike 03): set it to '' explicitly for global tables, so a
        // value can never linger from an earlier statement on the same connection.
        await transaction.query("SELECT set_config('app.tenant_id', $1, true)", [context.tenant ?? ''])
        if (options.role !== undefined) await transaction.query(`SET LOCAL ROLE ${options.role.replace(/[^a-z0-9_]/g, '')}`)
        const result = await transaction.query<Row>(statement.text, [...statement.params])
        return result.rows
      })
    },
  }
}
