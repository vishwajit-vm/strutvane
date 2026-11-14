/**
 * The database connection the core talks to. Async on purpose, even though `node:sqlite` is
 * synchronous: MySQL and PostgreSQL drivers are async, and controllers written against this
 * interface must not change when the app switches engine.
 *
 * The real query builder and ORM are designed in spike 11; this is the smallest layer that lets
 * the MVC core run end to end.
 */
import { isAbsolute, join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { token } from '../foundation/container.ts'
import { StrutvaneError } from '../support/errors.ts'
import { sqliteDialect, type Dialect, type SqlValue } from './dialect.ts'

/**
 * A row as the driver returns it.
 *
 * @example
 * const row: DatabaseRow = { id: 1, title: 'Hello' }
 */
export type DatabaseRow = Readonly<Record<string, unknown>>

/**
 * One open connection.
 *
 * @example
 * const rows = await db.select('SELECT * FROM "posts" WHERE "id" = ?1', [1])
 */
export interface Connection {
  readonly dialect: Dialect
  /** Run a query that returns rows. */
  select(sql: string, params?: readonly SqlValue[]): Promise<DatabaseRow[]>
  /** Run a write; returns the affected row count and the new id for inserts. */
  execute(sql: string, params?: readonly SqlValue[]): Promise<{ readonly changes: number; readonly insertId: number }>
  /** Run a script of several statements (schema dumps, seeds). No parameters. */
  script(sql: string): Promise<void>
  /** Close the connection. Safe to call twice. */
  close(): Promise<void>
}

/**
 * The container token for the default connection.
 *
 * @example
 * const db = app.make(ConnectionToken)
 */
export const ConnectionToken = token<Connection>('Connection')

/**
 * The `connections` part of `config/database.ts`, Laravel's shape.
 *
 * @example
 * const settings: ConnectionSettings = { driver: 'sqlite', database: ':memory:' }
 */
export type ConnectionSettings =
  | { readonly driver: 'sqlite'; readonly database: string }
  | { readonly driver: 'mysql' | 'postgres'; readonly host: string; readonly port: number; readonly database: string; readonly username: string; readonly password: string | undefined }

/**
 * Open the connection described by the config. Only SQLite has a driver in this spike; MySQL and
 * PostgreSQL fail with a clear message instead of a stack trace from a missing module.
 *
 * @example
 * const db = openConnection('sqlite', { driver: 'sqlite', database: 'storage/database.sqlite' }, '/srv/blog')
 */
export function openConnection(name: string, settings: ConnectionSettings, basePath: string): Connection {
  if (settings.driver === 'sqlite') {
    // Relative SQLite paths are relative to the app, not to wherever the process was started.
    const path = settings.database === ':memory:' || isAbsolute(settings.database) ? settings.database : join(basePath, settings.database)
    return openSqlite(path)
  }
  throw new StrutvaneError(
    'DRIVER_NOT_AVAILABLE',
    `The "${name}" connection uses the ${settings.driver} driver, which this prototype doesn't ship.`,
    'Set DB_CONNECTION=sqlite in .env for now (the framework will add the mysql2 and pg drivers).',
  )
}

/**
 * A SQLite connection through Node's built-in `node:sqlite` (no native addon to install).
 *
 * @example
 * const db = openSqlite(':memory:')
 */
export function openSqlite(path: string): Connection {
  const database = new DatabaseSync(path)
  // Foreign keys are off by default in SQLite; Laravel turns them on, and so do we.
  database.exec('PRAGMA foreign_keys = ON')
  let open = true
  return {
    dialect: sqliteDialect,
    async select(sql, params = []) {
      return database.prepare(sql).all(...params) as DatabaseRow[]
    },
    async execute(sql, params = []) {
      const result = database.prepare(sql).run(...params)
      return { changes: Number(result.changes), insertId: Number(result.lastInsertRowid) }
    },
    async script(sql) {
      database.exec(sql)
    },
    async close() {
      if (open) database.close()
      open = false
    },
  }
}
