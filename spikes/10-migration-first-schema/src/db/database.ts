/**
 * The smallest database interface the migrator and the CRUD API need. One implementation per
 * engine (`sqlite.ts`, `pglite.ts`); everything above this line is engine-agnostic.
 */
import type { SqlValue } from '../sql/dialect.ts'

/**
 * One result row, keyed by column name.
 *
 * @example
 * const row: Row = { id: 1, title: 'Hello' }
 */
export type Row = Record<string, unknown>

/**
 * A connection to SQLite or PostgreSQL.
 *
 * @example
 * const rows = await db.query('SELECT * FROM "posts" WHERE "id" = ?', [1])
 */
export interface Database {
  readonly dialect: 'sqlite' | 'postgres'
  /** Run one statement that takes no parameters (DDL). */
  execute(sql: string): Promise<void>
  /** Run one statement with bound parameters and return its rows (empty for writes without RETURNING). */
  query(sql: string, params?: readonly SqlValue[]): Promise<Row[]>
  /**
   * Run `work` in a transaction: committed if it resolves, rolled back if it throws. Both engines
   * support transactional DDL, which is what makes a failed migration leave nothing behind.
   */
  transaction<T>(work: (tx: Database) => Promise<T>): Promise<T>
  /** Release the connection. Safe to call twice. */
  close(): Promise<void>
}

/**
 * A short, engine-neutral reason for a failed write, so the API can answer 409 instead of 500.
 *
 * @example
 * constraintViolation(error) // 'unique' | 'foreign_key' | undefined
 */
export function constraintViolation(error: unknown): 'unique' | 'foreign_key' | undefined {
  if (!(error instanceof Error)) return undefined
  // PostgreSQL reports SQLSTATE codes; SQLite only has the message text.
  const code = 'code' in error ? String(error.code) : ''
  if (code === '23505' || error.message.includes('UNIQUE constraint failed')) return 'unique'
  if (code === '23503' || error.message.includes('FOREIGN KEY constraint failed')) return 'foreign_key'
  return undefined
}
