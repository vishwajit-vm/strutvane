/**
 * {@link Database} over PGlite: real PostgreSQL compiled to WebAssembly, in process.
 */
import { PGlite, type Transaction } from '@electric-sql/pglite'
import type { SqlValue } from '../sql/dialect.ts'
import type { Database, Row } from './database.ts'

/**
 * Start a fresh in-memory PostgreSQL.
 *
 * @example
 * const db = await openPglite()
 * await db.query('SELECT 1 AS one') // [{ one: 1 }]
 */
export async function openPglite(): Promise<Database> {
  const pg = await PGlite.create()
  return new PgliteDatabase(pg, pg)
}

type Queryable = PGlite | Transaction

class PgliteDatabase implements Database {
  readonly dialect = 'postgres' as const
  readonly #root: PGlite
  readonly #target: Queryable

  constructor(root: PGlite, target: Queryable) {
    this.#root = root
    this.#target = target
  }

  async execute(sql: string): Promise<void> {
    await this.#target.exec(sql)
  }

  async query(sql: string, params: readonly SqlValue[] = []): Promise<Row[]> {
    const result = await this.#target.query<Row>(sql, [...params])
    return result.rows
  }

  async transaction<T>(work: (tx: Database) => Promise<T>): Promise<T> {
    if (this.#target !== this.#root) throw new Error('Nested transactions aren\'t supported in this spike: run the work inside the outer transaction.')
    return this.#root.transaction((tx) => work(new PgliteDatabase(this.#root, tx)))
  }

  async close(): Promise<void> {
    if (this.#root.closed) return
    await this.#root.close()
  }
}
