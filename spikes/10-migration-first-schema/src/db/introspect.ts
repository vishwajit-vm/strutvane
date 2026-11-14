/**
 * Read a live database's schema and compare it with what the migrations say it should be.
 *
 * This is the safety net for the one thing replay can't see: someone changing the database by
 * hand, or with raw SQL in a migration. `sv migrate` would run this check afterwards, and
 * `sv doctor` on demand. In the spike, the tests also use it to prove that the SQL we generate
 * produces exactly the schema the recorder predicted, on both engines.
 */
import type { ColumnDef, ReferentialAction, SchemaState } from '../schema/columns.ts'
import { columnType } from '../sql/ddl.ts'
import type { Database, Row } from './database.ts'
import { MIGRATIONS_TABLE } from './migrator.ts'

/**
 * A column as the database reports it.
 *
 * @example
 * const column: LiveColumn = { name: 'title', type: 'character varying(200)', nullable: false }
 */
export interface LiveColumn {
  readonly name: string
  /** The engine's own type name, lower-cased. */
  readonly type: string
  readonly nullable: boolean
}

/**
 * A table as the database reports it.
 *
 * @example
 * const live: LiveTable = { name: 'tags', columns: [], indexes: [], foreignKeys: [] }
 */
export interface LiveTable {
  readonly name: string
  readonly columns: readonly LiveColumn[]
  readonly indexes: readonly { readonly name: string; readonly columns: readonly string[]; readonly unique: boolean }[]
  readonly foreignKeys: readonly { readonly column: string; readonly table: string; readonly references: string; readonly onDelete: ReferentialAction }[]
}

/**
 * Read every app table (the migrations table and engine internals are skipped).
 *
 * @example
 * const live = await introspect(db)
 */
export async function introspect(db: Database): Promise<LiveTable[]> {
  return db.dialect === 'sqlite' ? introspectSqlite(db) : introspectPostgres(db)
}

/**
 * Compare the expected schema with the live one. Returns one friendly sentence per difference,
 * or an empty list when they match.
 *
 * @example
 * schemaDrift(replay.state, await introspect(db), 'sqlite') // []
 */
export function schemaDrift(expected: SchemaState, live: readonly LiveTable[], dialect: Database['dialect']): string[] {
  const problems: string[] = []
  const liveByName = new Map(live.map((table) => [table.name, table]))
  for (const table of expected.tables) {
    const actual = liveByName.get(table.name)
    if (actual === undefined) {
      problems.push(`Table "${table.name}" is in the migrations but not in the database.`)
      continue
    }
    for (const column of table.columns) {
      const liveColumn = actual.columns.find((candidate) => candidate.name === column.name)
      if (liveColumn === undefined) {
        problems.push(`Column "${table.name}.${column.name}" is in the migrations but not in the database.`)
        continue
      }
      const wantedType = expectedLiveType(column, dialect)
      if (liveColumn.type !== wantedType) problems.push(`Column "${table.name}.${column.name}" should be ${wantedType}, but the database says ${liveColumn.type}.`)
      // A primary key is NOT NULL in the database even though "nullable" never applies to it.
      const wantedNullable = column.kind === 'id' ? false : column.nullable
      if (liveColumn.nullable !== wantedNullable) {
        problems.push(`Column "${table.name}.${column.name}" should be ${wantedNullable ? 'nullable' : 'NOT NULL'}, but the database disagrees.`)
      }
      const liveKey = actual.foreignKeys.find((key) => key.column === column.name)
      const wantedKey = column.references
      if (wantedKey === undefined && liveKey !== undefined) problems.push(`Column "${table.name}.${column.name}" has a foreign key the migrations don't know about.`)
      if (wantedKey !== undefined && (liveKey?.table !== wantedKey.table || liveKey.references !== wantedKey.column || liveKey.onDelete !== wantedKey.onDelete)) {
        problems.push(`Column "${table.name}.${column.name}" should reference ${wantedKey.table}.${wantedKey.column} (on delete ${wantedKey.onDelete}), but the database disagrees.`)
      }
    }
    for (const column of actual.columns) {
      if (!table.columns.some((candidate) => candidate.name === column.name)) problems.push(`Column "${table.name}.${column.name}" is in the database but not in the migrations.`)
    }
    for (const index of table.indexes) {
      const liveIndex = actual.indexes.find((candidate) => candidate.name === index.name)
      if (liveIndex === undefined || liveIndex.unique !== index.unique || liveIndex.columns.join(',') !== index.columns.join(',')) {
        problems.push(`Index "${index.name}" on "${table.name}" doesn't match the migrations.`)
      }
    }
    for (const index of actual.indexes) {
      if (!table.indexes.some((candidate) => candidate.name === index.name)) problems.push(`Index "${index.name}" on "${table.name}" is in the database but not in the migrations.`)
    }
  }
  for (const table of live) {
    if (!expected.tables.some((candidate) => candidate.name === table.name)) problems.push(`Table "${table.name}" is in the database but not in the migrations.`)
  }
  return problems
}

/** How the engine reports the type we asked for (PostgreSQL normalises names, SQLite echoes them). */
function expectedLiveType(column: ColumnDef, dialect: Database['dialect']): string {
  const declared = columnType(column, dialect).toLowerCase()
  if (dialect === 'sqlite') return declared
  return declared
    .replace(/^varchar\((\d+)\)$/, 'character varying($1)')
    .replace(/^numeric\((\d+), (\d+)\)$/, 'numeric($1,$2)')
}

async function introspectSqlite(db: Database): Promise<LiveTable[]> {
  const tables = await db.query(`SELECT "name" FROM "sqlite_master" WHERE "type" = 'table' AND "name" NOT LIKE 'sqlite_%' AND "name" <> '${MIGRATIONS_TABLE}' ORDER BY "name"`)
  const result: LiveTable[] = []
  for (const { name } of tables) {
    const table = String(name)
    // Table names come from sqlite_master and were validated by the recorder; PRAGMAs can't take parameters.
    const columns = await db.query(`PRAGMA table_info("${table}")`)
    const indexList = await db.query(`PRAGMA index_list("${table}")`)
    const foreignKeys = await db.query(`PRAGMA foreign_key_list("${table}")`)
    const indexes = []
    // origin 'c' = created by CREATE INDEX; 'pk' / 'u' are implicit and not part of the declared schema.
    for (const index of indexList.filter((row) => row['origin'] === 'c')) {
      const info = await db.query(`PRAGMA index_info("${String(index['name'])}")`)
      indexes.push({ name: String(index['name']), unique: Number(index['unique']) === 1, columns: info.map((row) => String(row['name'])) })
    }
    result.push({
      name: table,
      columns: columns.map((row) => ({ name: String(row['name']), type: String(row['type']).toLowerCase(), nullable: Number(row['notnull']) === 0 && Number(row['pk']) === 0 })),
      indexes,
      foreignKeys: foreignKeys.map((row) => ({ column: String(row['from']), table: String(row['table']), references: String(row['to']), onDelete: String(row['on_delete']).toLowerCase() as ReferentialAction })),
    })
  }
  return result
}

const PG_DELETE_RULES: Readonly<Record<string, ReferentialAction>> = { a: 'no action', r: 'restrict', c: 'cascade', n: 'set null' }

async function introspectPostgres(db: Database): Promise<LiveTable[]> {
  const columns = await db.query(`
    SELECT c.relname AS "table", a.attname AS "column", format_type(a.atttypid, a.atttypmod) AS "type", NOT a.attnotnull AS "nullable"
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped AND c.relname <> '${MIGRATIONS_TABLE}'
    ORDER BY c.relname, a.attnum`)
  const indexes = await db.query(`
    SELECT t.relname AS "table", i.relname AS "name", ix.indisunique AS "unique",
           string_agg(a.attname, ',' ORDER BY k.ord) AS "columns"
    FROM pg_index ix
    JOIN pg_class i ON i.oid = ix.indexrelid
    JOIN pg_class t ON t.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    CROSS JOIN LATERAL unnest(ix.indkey) WITH ORDINALITY AS k(attnum, ord)
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = k.attnum
    WHERE n.nspname = 'public' AND NOT ix.indisprimary AND t.relname <> '${MIGRATIONS_TABLE}'
    GROUP BY t.relname, i.relname, ix.indisunique`)
  const foreignKeys = await db.query(`
    SELECT tc.relname AS "table", a.attname AS "column", rt.relname AS "references_table", ra.attname AS "references_column", c.confdeltype AS "on_delete"
    FROM pg_constraint c
    JOIN pg_class tc ON tc.oid = c.conrelid
    JOIN pg_class rt ON rt.oid = c.confrelid
    JOIN pg_namespace n ON n.oid = tc.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    JOIN pg_attribute ra ON ra.attrelid = c.confrelid AND ra.attnum = c.confkey[1]
    WHERE c.contype = 'f' AND n.nspname = 'public'`)
  const tableNames = [...new Set(columns.map((row) => String(row['table'])))].sort()
  const of = (rows: Row[], table: string): Row[] => rows.filter((row) => row['table'] === table)
  return tableNames.map((table) => ({
    name: table,
    columns: of(columns, table).map((row) => ({ name: String(row['column']), type: String(row['type']).toLowerCase(), nullable: row['nullable'] === true })),
    indexes: of(indexes, table).map((row) => ({ name: String(row['name']), unique: row['unique'] === true, columns: String(row['columns']).split(',') })),
    foreignKeys: of(foreignKeys, table).map((row) => ({
      column: String(row['column']),
      table: String(row['references_table']),
      references: String(row['references_column']),
      onDelete: PG_DELETE_RULES[String(row['on_delete'])] ?? 'no action',
    })),
  }))
}

