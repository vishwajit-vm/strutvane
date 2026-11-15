/**
 * Compile recorded migration operations into SQL for SQLite, PostgreSQL and MySQL.
 *
 * The compiler walks the operations *with* the schema state, so it always knows what the table
 * looks like at that moment. It needs that for the places where engines differ:
 * - SQLite can't drop a column that is part of an index, so the indexes are dropped first;
 * - SQLite can't drop a column that is part of a foreign key at all, so the table is rebuilt;
 * - MySQL silently ignores inline `REFERENCES`, so its foreign keys are separate constraints.
 */
import { applyOperation } from '../schema/apply.ts'
import { findColumn, findTable, type ColumnDef, type ForeignKeyDef, type IndexDef, type SchemaState, type TableState } from '../schema/columns.ts'
import { SchemaError } from '../schema/errors.ts'
import type { SchemaOperation, TableAction } from '../schema/operations.ts'
import { isMysqlFamily, quoteIdentifier, sqlLiteral, type Dialect } from './dialect.ts'

/**
 * Compile one migration's operations, starting from the schema as it was before the migration.
 *
 * @example
 * const statements = compileOperations(step.before, step.up, 'sqlite')
 * for (const sql of statements) await db.execute(sql)
 */
export function compileOperations(stateBefore: SchemaState, operations: readonly SchemaOperation[], dialect: Dialect): string[] {
  const statements: string[] = []
  let state = stateBefore
  for (const operation of operations) {
    statements.push(...compileOperation(state, operation, dialect))
    state = applyOperation(state, operation)
  }
  return statements
}

/**
 * The full schema as `CREATE` statements, Laravel's `schema:dump`. Tables are ordered so every
 * foreign key points at a table created earlier, which PostgreSQL and MySQL require.
 *
 * @example
 * writeFileSync('schema.postgres.sql', createSchemaSql(replay.state, 'postgres').join(';\n\n'))
 */
export function createSchemaSql(state: SchemaState, dialect: Dialect): string[] {
  return dependencyOrder(state).flatMap((table) => createTableSql(table, dialect))
}

function compileOperation(state: SchemaState, operation: SchemaOperation, dialect: Dialect): string[] {
  const q = (name: string): string => quoteIdentifier(name, dialect)
  switch (operation.type) {
    case 'createTable': {
      const after = applyOperation(state, operation)
      return createTableSql(requireTable(after, operation.table), dialect)
    }
    case 'alterTable':
      return compileAlter(state, operation.table, operation.actions, dialect)
    case 'dropTable':
      return [`DROP TABLE ${operation.ifExists ? 'IF EXISTS ' : ''}${q(operation.table)}`]
    case 'renameTable':
      return isMysqlFamily(dialect)
        ? [`RENAME TABLE ${q(operation.from)} TO ${q(operation.to)}`]
        : [`ALTER TABLE ${q(operation.from)} RENAME TO ${q(operation.to)}`]
  }
}

function compileAlter(stateBefore: SchemaState, tableName: string, actions: readonly TableAction[], dialect: Dialect): string[] {
  const statements: string[] = []
  let state = stateBefore
  for (const action of actions) {
    const table = requireTable(state, tableName)
    const next = applyOperation(state, { type: 'alterTable', table: tableName, actions: [action] })
    statements.push(...compileTableAction(state, table, requireTable(next, tableName), action, dialect))
    state = next
  }
  return statements
}

function compileTableAction(state: SchemaState, before: TableState, after: TableState, action: TableAction, dialect: Dialect): string[] {
  const q = (name: string): string => quoteIdentifier(name, dialect)
  const table = q(before.name)
  switch (action.type) {
    case 'addColumn': {
      const statements = [`ALTER TABLE ${table} ADD COLUMN ${columnSql(action.column, dialect)}`]
      if (isMysqlFamily(dialect) && action.column.references !== undefined) {
        statements.push(`ALTER TABLE ${table} ADD ${foreignKeyConstraintSql(before.name, action.column.name, action.column.references, dialect)}`)
      }
      return [...statements, ...columnCommentSql(before.name, action.column, dialect)]
    }
    case 'renameColumn': {
      // RENAME COLUMN: SQLite 3.25+, PostgreSQL, MySQL 8.0+, MariaDB 10.5.2+. MariaDB 10.4 (what XAMPP
      // 8.2 ships) only has CHANGE COLUMN, which restates the definition; it works on every MariaDB.
      const renamed = findColumn(after, action.to)
      if (dialect === 'mariadb' && renamed !== undefined) return [`ALTER TABLE ${table} CHANGE COLUMN ${q(action.from)} ${columnSql(renamed, dialect)}`]
      return [`ALTER TABLE ${table} RENAME COLUMN ${q(action.from)} TO ${q(action.to)}`]
    }
    case 'dropColumn':
      return dropColumnSql(state, before, after, action.name, dialect)
    case 'addIndex':
      return [createIndexSql(before.name, action.index, dialect)]
    case 'dropIndex':
      return [dropIndexSql(before.name, action.name, dialect)]
  }
}

function dropColumnSql(state: SchemaState, before: TableState, after: TableState, name: string, dialect: Dialect): string[] {
  const q = (identifier: string): string => quoteIdentifier(identifier, dialect)
  const column = findColumn(before, name)
  if (isMysqlFamily(dialect)) {
    // MySQL refuses to drop a column while a foreign key constraint still uses it.
    const dropForeignKey = column?.references === undefined ? [] : [`ALTER TABLE ${q(before.name)} DROP FOREIGN KEY ${q(column.references.name ?? foreignKeyName(before.name, name))}`]
    return [...dropForeignKey, `ALTER TABLE ${q(before.name)} DROP COLUMN ${q(name)}`]
  }
  if (dialect === 'postgres') return [`ALTER TABLE ${q(before.name)} DROP COLUMN ${q(name)}`]
  // SQLite's DROP COLUMN refuses columns used by a foreign key: rebuild the table instead.
  if (column?.references !== undefined) return rebuildSqliteTable(state, before, after)
  // It also refuses indexed columns, so drop those indexes first (PostgreSQL does this implicitly).
  const coveringIndexes = before.indexes.filter((index) => index.columns.includes(name))
  return [...coveringIndexes.map((index) => dropIndexSql(before.name, index.name, dialect)), `ALTER TABLE ${q(before.name)} DROP COLUMN ${q(name)}`]
}

/**
 * SQLite's documented way to make changes ALTER TABLE can't: build the new table under a
 * temporary name, copy the rows, drop the old table, rename the new one, recreate the indexes.
 *
 * Fail closed: if another table points *at* this one, dropping it would run that table's
 * `ON DELETE` rules against the copied-away rows, so we refuse instead of risking data.
 */
function rebuildSqliteTable(state: SchemaState, before: TableState, after: TableState): string[] {
  const child = state.tables.find((table) => table.name !== before.name && table.columns.some((column) => column.references?.table === before.name))
  if (child !== undefined) {
    throw new SchemaError(
      'INVALID_FOREIGN_KEY',
      `Dropping this column on SQLite means rebuilding "${before.name}", but "${child.name}" points at it and could lose rows.`,
      'Drop the foreign key column in a migration that runs while nothing references the table, or use PostgreSQL for this change.',
    )
  }
  const q = (name: string): string => quoteIdentifier(name, 'sqlite')
  const temporary = `__strutvane_rebuild_${after.name}`
  const kept = after.columns.map((column) => q(column.name)).join(', ')
  return [
    ...createTableSql({ ...after, name: temporary, indexes: [] }, 'sqlite'),
    `INSERT INTO ${q(temporary)} (${kept}) SELECT ${kept} FROM ${q(before.name)}`,
    `DROP TABLE ${q(before.name)}`,
    `ALTER TABLE ${q(temporary)} RENAME TO ${q(after.name)}`,
    ...after.indexes.map((index) => createIndexSql(after.name, index, 'sqlite')),
  ]
}

function createTableSql(table: TableState, dialect: Dialect): string[] {
  const q = (name: string): string => quoteIdentifier(name, dialect)
  const definitions = table.columns.map((column) => columnSql(column, dialect))
  if (isMysqlFamily(dialect)) {
    for (const column of table.columns) {
      if (column.references !== undefined) definitions.push(foreignKeyConstraintSql(table.name, column.name, column.references, dialect))
    }
  }
  const create = `CREATE TABLE ${q(table.name)} (\n  ${definitions.join(',\n  ')}\n)`
  return [
    create,
    ...table.indexes.map((index) => createIndexSql(table.name, index, dialect)),
    ...table.columns.flatMap((column) => columnCommentSql(table.name, column, dialect)),
  ]
}

/**
 * One column definition. The type, nullability, default and constraints for each engine.
 *
 * @example
 * columnSql({ name: 'price', kind: 'decimal', nullable: false, precision: 12, scale: 2, default: 0 }, 'postgres')
 * // '"price" NUMERIC(12, 2) NOT NULL DEFAULT 0'
 */
export function columnSql(column: ColumnDef, dialect: Dialect): string {
  const name = quoteIdentifier(column.name, dialect)
  if (column.kind === 'id') return `${name} ${PRIMARY_KEY[dialect]}`
  const parts = [name, columnType(column, dialect), column.nullable ? 'NULL' : 'NOT NULL']
  if ('default' in column && column.default !== undefined) parts.push(`DEFAULT ${sqlLiteral(column.default, dialect)}`)
  if (column.kind === 'json' && dialect === 'mariadb') parts.push(`CHECK (JSON_VALID(${name}))`)
  // SQLite's NUMERIC has no precision: without this it stores 12345678901.00 in a decimal(12, 2)
  // that PostgreSQL and MySQL refuse. The scale is left to the API and ORM casts (PostgreSQL and
  // MySQL round extra decimals instead of refusing them).
  if (column.kind === 'decimal' && dialect === 'sqlite') parts.push(`CHECK (abs(${name}) < 1${'0'.repeat((column.precision ?? 8) - (column.scale ?? 2))})`)
  if (column.kind === 'enum' && !isMysqlFamily(dialect)) {
    const values = (column.values ?? []).map((value) => sqlLiteral(value, dialect)).join(', ')
    parts.push(`CHECK (${name} IN (${values}))`)
  }
  // MySQL ignores an inline REFERENCES clause without a word of warning, so it gets a constraint instead.
  if (column.references !== undefined && !isMysqlFamily(dialect)) parts.push(referencesSql(column.references, dialect))
  if (column.comment !== undefined && isMysqlFamily(dialect)) parts.push(`COMMENT ${sqlLiteral(column.comment, dialect)}`)
  return parts.join(' ')
}

const PRIMARY_KEY: Readonly<Record<Dialect, string>> = {
  // INTEGER PRIMARY KEY makes it the rowid; AUTOINCREMENT stops ids of deleted rows being reused.
  sqlite: 'INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL',
  postgres: 'BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY',
  mysql: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY',
  mariadb: 'BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY',
}

/**
 * The SQL type for a column in one engine. Also used by the drift check to compare against what
 * the database reports.
 *
 * @example
 * columnType({ name: 'title', kind: 'string', nullable: false, length: 200 }, 'sqlite') // 'VARCHAR(200)'
 */
export function columnType(column: ColumnDef, dialect: Dialect): string {
  const length = column.length ?? 255
  switch (column.kind) {
    case 'id':
      return dialect === 'sqlite' ? 'INTEGER' : 'BIGINT'
    case 'integer':
      return isMysqlFamily(dialect) ? 'INT' : 'INTEGER'
    case 'bigInteger':
    case 'foreignId':
      // SQLite integers are already 64-bit; MySQL keys match the unsigned id they point at.
      if (dialect === 'sqlite') return 'INTEGER'
      return isMysqlFamily(dialect) ? 'BIGINT UNSIGNED' : 'BIGINT'
    case 'string':
    case 'slug':
      // MariaDB 11's default collation (utf8mb4_uca1400_ai_ci) folds case and accents: slugs
      // compare byte for byte, so '/posts/RESUME' never finds 'resume' (security review F-08).
      return column.kind === 'slug' && dialect === 'mariadb' ? `VARCHAR(${length}) COLLATE utf8mb4_nopad_bin` : `VARCHAR(${length})`
    case 'text':
      return 'TEXT'
    case 'uuid':
      if (dialect === 'mariadb') return 'CHAR(36) COLLATE utf8mb4_nopad_bin'
      return dialect === 'postgres' ? 'UUID' : isMysqlFamily(dialect) ? 'CHAR(36)' : 'VARCHAR(36)'
    case 'decimal':
      // SQLite has no exact decimal: NUMERIC stores up to ~15 significant digits as REAL.
      return dialect === 'sqlite' ? 'NUMERIC' : `${isMysqlFamily(dialect) ? 'DECIMAL' : 'NUMERIC'}(${column.precision ?? 8}, ${column.scale ?? 2})`
    case 'double':
      return dialect === 'postgres' ? 'DOUBLE PRECISION' : isMysqlFamily(dialect) ? 'DOUBLE' : 'REAL'
    case 'boolean':
      return dialect === 'postgres' ? 'BOOLEAN' : isMysqlFamily(dialect) ? 'TINYINT(1)' : 'INTEGER'
    case 'enum':
      return isMysqlFamily(dialect) ? `ENUM(${(column.values ?? []).map((value) => sqlLiteral(value, dialect)).join(', ')})` : 'VARCHAR(255)'
    case 'date':
      return 'DATE'
    case 'timestamp':
      // PostgreSQL keeps the instant (with time zone). MySQL gets DATETIME(3), holding UTC written by
      // the ORM: TIMESTAMP ends at 2038-01-19 (an expiry in 2040 is an error under strict sql_mode)
      // and converts through the session time zone.
      return dialect === 'postgres' ? 'TIMESTAMP(3) WITH TIME ZONE' : isMysqlFamily(dialect) ? 'DATETIME(3)' : 'DATETIME'
    case 'json':
      // MariaDB's JSON is only an alias of LONGTEXT; say so, with the validity check, so every
      // MariaDB version (10.4 adds the check by itself, older ones don't) stores only valid JSON.
      if (dialect === 'mariadb') return 'LONGTEXT COLLATE utf8mb4_nopad_bin'
      return dialect === 'postgres' ? 'JSONB' : isMysqlFamily(dialect) ? 'JSON' : 'TEXT'
  }
}

function referencesSql(reference: ForeignKeyDef, dialect: Dialect): string {
  const onDelete = reference.onDelete === 'no action' ? '' : ` ON DELETE ${reference.onDelete.toUpperCase()}`
  return `REFERENCES ${quoteIdentifier(reference.table, dialect)} (${quoteIdentifier(reference.column, dialect)})${onDelete}`
}

function foreignKeyConstraintSql(table: string, column: string, reference: ForeignKeyDef, dialect: Dialect): string {
  const q = (name: string): string => quoteIdentifier(name, dialect)
  return `CONSTRAINT ${q(reference.name ?? foreignKeyName(table, column))} FOREIGN KEY (${q(column)}) ${referencesSql(reference, dialect)}`
}

/** Laravel's foreign key naming: `posts_author_id_foreign`. */
function foreignKeyName(table: string, column: string): string {
  return `${table}_${column}_foreign`
}

function createIndexSql(table: string, index: IndexDef, dialect: Dialect): string {
  const q = (name: string): string => quoteIdentifier(name, dialect)
  const columns = index.columns.map(q).join(', ')
  return `CREATE ${index.unique ? 'UNIQUE ' : ''}INDEX ${q(index.name)} ON ${q(table)} (${columns})`
}

function dropIndexSql(table: string, name: string, dialect: Dialect): string {
  // MySQL index names are per table, so it needs to know which table.
  return isMysqlFamily(dialect) ? `DROP INDEX ${quoteIdentifier(name, dialect)} ON ${quoteIdentifier(table, dialect)}` : `DROP INDEX ${quoteIdentifier(name, dialect)}`
}

function columnCommentSql(table: string, column: ColumnDef, dialect: Dialect): string[] {
  // SQLite has no column comments; MySQL writes them inline in the column definition.
  if (column.comment === undefined || dialect !== 'postgres') return []
  return [`COMMENT ON COLUMN ${quoteIdentifier(table, dialect)}.${quoteIdentifier(column.name, dialect)} IS ${sqlLiteral(column.comment, dialect)}`]
}

/** Parents before children; otherwise creation order, so the output is stable. */
function dependencyOrder(state: SchemaState): TableState[] {
  const ordered: TableState[] = []
  const placed = new Set<string>()
  const visiting = new Set<string>()
  const visit = (table: TableState): void => {
    if (placed.has(table.name)) return
    if (visiting.has(table.name)) {
      throw new SchemaError(
        'INVALID_FOREIGN_KEY',
        `The tables around "${table.name}" point at each other in a circle, so they can't be created one after another.`,
        'Make one of the foreign keys nullable and add it in a later migration with schema.table(…).',
      )
    }
    visiting.add(table.name)
    for (const column of table.columns) {
      const parent = column.references === undefined || column.references.table === table.name ? undefined : findTable(state, column.references.table)
      if (parent !== undefined) visit(parent)
    }
    visiting.delete(table.name)
    placed.add(table.name)
    ordered.push(table)
  }
  for (const table of state.tables) visit(table)
  return ordered
}

function requireTable(state: SchemaState, name: string): TableState {
  const table = findTable(state, name)
  if (table === undefined) throw new Error(`Internal: table "${name}" vanished during compilation.`)
  return table
}
