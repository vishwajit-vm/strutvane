/**
 * MySQL 8.4+ through mysql2 (the default engine for new Strutvane apps).
 *
 * The pool settings are the part that matters; each one prevents a real bug:
 * - `timezone: 'Z'`: DATETIME has no zone, so both directions are UTC. Without it mysql2 uses the
 *   Node process' local zone and every timestamp shifts by the server's offset.
 * - `dateStrings: ['DATE']`: a DATE stays `'2026-11-14'`; as a JS Date it would become local
 *   midnight and could show the previous day.
 * - `supportBigNumbers`: BIGINT values beyond 2^53 come back as strings instead of rounded numbers
 *   (the ORM then refuses them loudly instead of corrupting ids).
 * - `decimalNumbers: false` (the default): DECIMAL stays an exact string, like on PostgreSQL.
 * - Statements go through `execute()`: real server-side prepared statements, cached per
 *   connection by mysql2, so values never touch the SQL text.
 * - A connection that fails mid-transaction is destroyed, never returned to the pool.
 * - Every new connection pins its session (security review F-08): a strict `sql_mode` (bad
 *   values are errors, not silently truncated or zeroed), UTC, and utf8mb4. Servers configured
 *   loosely (Laravel's usual setup, managed defaults) can't weaken the app's guarantees.
 */
import { createPool, type Pool, type PoolConnection, type PoolOptions } from 'mysql2/promise'
import type { Driver, DriverSession, QueryResult, Row } from './driver.ts'

/**
 * Connect to MySQL with a connection URL or mysql2 options (merged over the safe defaults).
 *
 * @example
 * const driver = mysqlDriver({ uri: 'mysql://app:secret@127.0.0.1:3306/app' })
 */
export function mysqlDriver(options: PoolOptions): Driver {
  const pool: Pool = createPool({
    connectionLimit: 10,
    ...options,
    timezone: 'Z',
    dateStrings: ['DATE'],
    supportBigNumbers: true,
    bigNumberStrings: false,
    decimalNumbers: false,
  })
  let closed = false
  // mysql2 runs commands on one connection in order, so this SET always precedes the first query.
  pool.pool.on('connection', (connection) => {
    connection.query(SESSION_SETTINGS)
  })

  return {
    dialect: 'mysql',
    async acquire(): Promise<DriverSession> {
      if (closed) throw new Error('This MySQL pool is closed. Create a new connection instead of reusing a closed one.')
      const connection = await pool.getConnection()
      let released = false
      return {
        run: (sql, params) => runOn(connection, sql, params),
        release(broken = false) {
          if (released) return
          released = true
          if (broken) connection.destroy()
          else connection.release()
        },
      }
    },
    async close() {
      if (closed) return
      closed = true
      await pool.end()
    },
  }
}

/**
 * The session every connection runs with. STRICT_ALL_TABLES turns truncation and bad values into
 * errors; NO_BACKSLASH_ESCAPES makes string literals standard SQL (the ORM never writes literals,
 * but raw SQL and the migration DDL do).
 */
const SESSION_SETTINGS =
  "SET SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION,ONLY_FULL_GROUP_BY,NO_BACKSLASH_ESCAPES', " +
  "time_zone = '+00:00', NAMES utf8mb4 COLLATE utf8mb4_0900_bin"

async function runOn(connection: PoolConnection, sql: string, params: readonly unknown[]): Promise<QueryResult> {
  // Transaction control (BEGIN, SAVEPOINT …) can't be prepared in MySQL's binary protocol.
  if (params.length === 0 && /^(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i.test(sql)) {
    await connection.query(sql)
    return { rows: [], rowsAffected: 0 }
  }
  const [result] = await connection.execute(sql, params.map(toMysqlValue))
  if (Array.isArray(result)) {
    const rows: Row[] = []
    for (const item of result) if (isRow(item)) rows.push(item)
    return { rows, rowsAffected: rows.length }
  }
  if ('affectedRows' in result) {
    return { rows: [], rowsAffected: result.affectedRows, ...(result.insertId > 0 ? { insertId: result.insertId } : {}) }
  }
  return { rows: [], rowsAffected: 0 }
}

function isRow(value: unknown): value is Row {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

type MysqlValue = null | number | bigint | string | Buffer

/** MySQL has no boolean type (BOOLEAN is TINYINT(1)), so booleans are sent as 0/1. */
function toMysqlValue(raw: unknown): MysqlValue {
  if (raw === null || raw === undefined) return null
  if (typeof raw === 'boolean') return raw ? 1 : 0
  if (typeof raw === 'number' || typeof raw === 'bigint' || typeof raw === 'string' || Buffer.isBuffer(raw)) return raw
  throw new TypeError(`MySQL can't take a value of type ${typeof raw} as a parameter. Convert it to a string, number or JSON first.`)
}
