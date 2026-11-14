/**
 * The three engines every behaviour test runs on: MySQL 8.4 (real server in Docker, the default
 * engine), PostgreSQL (PGlite) and SQLite (node:sqlite).
 *
 * `useEngine(engine)` wires a describe block: connect, create the tables, point the models at the
 * connection, and clear all rows before each test.
 */
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, inject } from 'vitest'
import { snapshot } from '../../fixtures/.strutvane/schema.ts'
import { Connection, mysqlDriver, pgliteDriver, registerSchema, sqliteDriver, useConnection } from '#orm'
import { clearTables, createTables } from './ddl.ts'

/** One engine under test. */
export interface Engine {
  readonly name: 'mysql' | 'postgres' | 'sqlite'
  /** Why the engine is skipped, if it is. */
  readonly skipped: string | undefined
  connect(): Promise<Connection>
}

const mysqlInfo = inject('mysql')

/** Every engine, MySQL first (it is the default). */
export const engines: readonly Engine[] = [
  {
    name: 'mysql',
    skipped: 'skipped' in mysqlInfo ? mysqlInfo.skipped : undefined,
    connect: async () => {
      if (!('url' in mysqlInfo)) throw new Error(`MySQL is not available: ${mysqlInfo.skipped}`)
      return new Connection(mysqlDriver({ uri: mysqlInfo.url }))
    },
  },
  { name: 'postgres', skipped: undefined, connect: async () => new Connection(pgliteDriver(await PGlite.create())) },
  { name: 'sqlite', skipped: undefined, connect: async () => new Connection(sqliteDriver(':memory:')) },
]

/** The describe title, with the skip reason when there is one (so a skipped run says why). */
export function engineTitle(engine: Engine): string {
  return engine.skipped === undefined ? engine.name : `${engine.name} (skipped: ${engine.skipped})`
}

/**
 * Set up an engine for the surrounding describe block. Returns a getter for the connection.
 *
 * @example
 * describe.each(engines)('$name', (engine) => { const db = useEngine(engine) })
 */
export function useEngine(engine: Engine): () => Connection {
  let connection: Connection | undefined
  beforeAll(async () => {
    if (engine.skipped !== undefined) return
    registerSchema(snapshot)
    connection = await engine.connect()
    await createTables(connection, snapshot)
  })
  beforeEach(async () => {
    if (connection === undefined) return
    // Each describe block runs alone, so pointing the global resolver at it here is safe.
    useConnection(connection)
    await clearTables(connection)
  })
  afterAll(async () => {
    await connection?.close()
  })
  return () => {
    if (connection === undefined) throw new Error(`The ${engine.name} connection is not open.`)
    return connection
  }
}
