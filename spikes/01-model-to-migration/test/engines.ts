/**
 * Thin adapters over two real database engines so every test can run the same
 * scenario against both: PGlite (Postgres compiled to WASM, in-process) and libSQL (SQLite).
 */
import { PGlite } from '@electric-sql/pglite'
import { createClient, type Client } from '@libsql/client'
import type { Dialect } from '../src/diff.js'

export interface ColumnInfo {
  readonly type: string
  readonly nullable: boolean
  readonly default: string | null
}

export interface Engine {
  readonly dialect: Dialect
  /** Executes migration statements in order, one by one (fails loudly on the first error). */
  apply(statements: readonly string[]): Promise<void>
  exec(sql: string, params?: readonly unknown[]): Promise<void>
  rows<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>
  tables(): Promise<string[]>
  columns(table: string): Promise<Record<string, ColumnInfo>>
  indexes(table: string): Promise<string[]>
  close(): Promise<void>
}

class PgEngine implements Engine {
  readonly dialect = 'postgres' as const
  private readonly db = new PGlite()

  async apply(statements: readonly string[]): Promise<void> {
    for (const s of statements) await this.db.exec(s)
  }
  async exec(sql: string, params: readonly unknown[] = []): Promise<void> {
    await this.db.query(sql, [...params])
  }
  async rows<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return (await this.db.query<T>(sql, [...params])).rows
  }
  async tables(): Promise<string[]> {
    const r = await this.rows<{ table_name: string }>(
      `select table_name from information_schema.tables where table_schema = 'public' order by 1`,
    )
    return r.map((x) => x.table_name)
  }
  async columns(table: string): Promise<Record<string, ColumnInfo>> {
    const r = await this.rows<{
      column_name: string
      data_type: string
      character_maximum_length: number | null
      numeric_precision: number | null
      numeric_scale: number | null
      is_nullable: 'YES' | 'NO'
      column_default: string | null
    }>(
      `select column_name, data_type, character_maximum_length, numeric_precision, numeric_scale, is_nullable, column_default
       from information_schema.columns where table_schema = 'public' and table_name = $1`,
      [table],
    )
    return Object.fromEntries(
      r.map((c) => {
        let type = c.data_type
        if (type === 'character varying') type = `varchar(${c.character_maximum_length})`
        if (type === 'numeric') type = `numeric(${c.numeric_precision},${c.numeric_scale})`
        return [c.column_name, { type, nullable: c.is_nullable === 'YES', default: c.column_default }]
      }),
    )
  }
  async indexes(table: string): Promise<string[]> {
    const r = await this.rows<{ indexname: string }>(`select indexname from pg_indexes where tablename = $1 order by 1`, [table])
    return r.map((x) => x.indexname)
  }
  async constraints(table: string): Promise<Record<string, string>> {
    const r = await this.rows<{ conname: string; contype: string }>(
      `select c.conname, c.contype from pg_constraint c join pg_class t on t.oid = c.conrelid where t.relname = $1`,
      [table],
    )
    return Object.fromEntries(r.map((x) => [x.conname, x.contype]))
  }
  async close(): Promise<void> {
    await this.db.close()
  }
}

class SqliteEngine implements Engine {
  readonly dialect = 'sqlite' as const
  private readonly db: Client = createClient({ url: ':memory:' })

  async apply(statements: readonly string[]): Promise<void> {
    for (const s of statements) await this.db.execute(s)
  }
  async exec(sql: string, params: readonly unknown[] = []): Promise<void> {
    await this.db.execute({ sql, args: params as never })
  }
  async rows<T>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const r = await this.db.execute({ sql, args: params as never })
    return r.rows.map((row) => Object.fromEntries(r.columns.map((c) => [c, row[c]]))) as T[]
  }
  async tables(): Promise<string[]> {
    const r = await this.rows<{ name: string }>(
      `select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like '\\_\\_%' escape '\\' order by 1`,
    )
    return r.map((x) => x.name)
  }
  async columns(table: string): Promise<Record<string, ColumnInfo>> {
    const r = await this.rows<{ name: string; type: string; notnull: number; dflt_value: string | null }>(
      `select name, type, "notnull", dflt_value from pragma_table_info(?)`,
      [table],
    )
    return Object.fromEntries(r.map((c) => [c.name, { type: c.type.toLowerCase(), nullable: c.notnull === 0, default: c.dflt_value }]))
  }
  async indexes(table: string): Promise<string[]> {
    const r = await this.rows<{ name: string }>(
      `select name from sqlite_master where type = 'index' and tbl_name = ? and name not like 'sqlite_autoindex%' order by 1`,
      [table],
    )
    return r.map((x) => x.name)
  }
  async tableSql(table: string): Promise<string> {
    const r = await this.rows<{ sql: string }>(`select sql from sqlite_master where type = 'table' and name = ?`, [table])
    return r[0]?.sql ?? ''
  }
  async close(): Promise<void> {
    this.db.close()
  }
}

export type PgTestEngine = PgEngine
export type SqliteTestEngine = SqliteEngine

export function createEngine(dialect: 'postgres'): Promise<PgEngine>
export function createEngine(dialect: 'sqlite'): Promise<SqliteEngine>
export function createEngine(dialect: Dialect): Promise<PgEngine | SqliteEngine>
export async function createEngine(dialect: Dialect): Promise<PgEngine | SqliteEngine> {
  if (dialect === 'postgres') return new PgEngine()
  const e = new SqliteEngine()
  await e.exec('PRAGMA foreign_keys = ON')
  return e
}
