/**
 * {@link Database} over Node's built-in `node:sqlite` (no native addon to install).
 */
import { DatabaseSync } from 'node:sqlite'
import type { SqlValue } from '../sql/dialect.ts'
import type { Database, Row } from './database.ts'

/**
 * Open a SQLite database (in memory by default) with foreign keys enforced.
 *
 * @example
 * const db = openSqlite()
 * await db.execute('CREATE TABLE "t" ("id" INTEGER PRIMARY KEY)')
 */
export function openSqlite(path = ':memory:'): Database {
  const connection = new DatabaseSync(path)
  // SQLite ships with foreign keys *off* for backwards compatibility; every connection must opt in.
  connection.exec('PRAGMA foreign_keys = ON')
  return new SqliteDatabase(connection)
}

class SqliteDatabase implements Database {
  readonly dialect = 'sqlite' as const
  readonly #connection: DatabaseSync
  #inTransaction = false
  #closed = false

  constructor(connection: DatabaseSync) {
    this.#connection = connection
  }

  async execute(sql: string): Promise<void> {
    this.#connection.exec(sql)
  }

  async query(sql: string, params: readonly SqlValue[] = []): Promise<Row[]> {
    const rows = this.#connection.prepare(sql).all(...params.map(toSqliteValue))
    // node:sqlite returns null-prototype objects; spread them into ordinary objects for callers.
    return rows.map((row) => ({ ...row }))
  }

  async transaction<T>(work: (tx: Database) => Promise<T>): Promise<T> {
    if (this.#inTransaction) throw new Error('Nested transactions aren\'t supported in this spike: run the work inside the outer transaction.')
    this.#inTransaction = true
    this.#connection.exec('BEGIN')
    try {
      const result = await work(this)
      this.#connection.exec('COMMIT')
      return result
    } catch (error) {
      this.#connection.exec('ROLLBACK')
      throw error
    } finally {
      this.#inTransaction = false
    }
  }

  async close(): Promise<void> {
    if (this.#closed) return
    this.#closed = true
    this.#connection.close()
  }
}

/** SQLite has no boolean type: store `true`/`false` as 1/0, which is what reads back. */
function toSqliteValue(value: SqlValue): string | number | null {
  if (typeof value === 'boolean') return value ? 1 : 0
  return value
}
