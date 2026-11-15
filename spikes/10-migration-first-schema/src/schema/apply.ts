/**
 * Fold recorded operations into a {@link SchemaState}: the in-memory "database" of the recorder.
 *
 * This is where migration mistakes are caught *before* any SQL runs: renaming a column that
 * doesn't exist, pointing a foreign key at a missing table, dropping a column a slug is built
 * from, and so on. Every check fails closed with a friendly {@link SchemaError}.
 *
 * Where SQLite and PostgreSQL disagree, the stricter rule wins, so a migration that replays
 * cleanly here runs on both engines. For example, adding a `NOT NULL` column without a default to
 * an existing table works on an empty PostgreSQL table but always fails on SQLite, so it's
 * refused here.
 */
import { findColumn, findTable, type ColumnDef, type IndexDef, type SchemaState, type TableState } from './columns.ts'
import { SchemaError } from './errors.ts'
import type { SchemaOperation, TableAction } from './operations.ts'

/**
 * Apply one operation and return the new state. The input state is never mutated, so callers can
 * keep every intermediate state (the rollback tests rely on that).
 *
 * @example
 * const next = applyOperation(EMPTY_SCHEMA, { type: 'createTable', table: 'tags', actions: [] })
 */
export function applyOperation(state: SchemaState, operation: SchemaOperation): SchemaState {
  switch (operation.type) {
    case 'createTable':
      return createTable(state, operation.table, operation.actions)
    case 'alterTable':
      return alterTable(state, operation.table, operation.actions)
    case 'dropTable':
      return dropTable(state, operation.table, operation.ifExists)
    case 'renameTable':
      return renameTable(state, operation.from, operation.to)
  }
}

/**
 * Apply a list of operations in order.
 *
 * @example
 * const state = applyOperations(EMPTY_SCHEMA, recordOperations(m.up, EMPTY_SCHEMA))
 */
export function applyOperations(state: SchemaState, operations: readonly SchemaOperation[]): SchemaState {
  return operations.reduce(applyOperation, state)
}

function createTable(state: SchemaState, name: string, actions: readonly TableAction[]): SchemaState {
  if (findTable(state, name) !== undefined) {
    throw new SchemaError('TABLE_EXISTS', `The table "${name}" already exists.`, `Use schema.table('${name}', …) to change it, or drop it first.`)
  }
  for (const action of actions) {
    if (action.type !== 'addColumn' && action.type !== 'addIndex') {
      throw new SchemaError(
        'NOT_ALLOWED_IN_CREATE',
        `schema.create('${name}') can only add columns and indexes, but it asks to ${action.type}.`,
        `Define the table the way you want it, or change it later with schema.table('${name}', …).`,
      )
    }
  }
  const empty: TableState = { name, columns: [], indexes: [] }
  // The new table is visible while its own actions run, so a self-referencing key (parent_id) works.
  const withTable: SchemaState = { tables: [...state.tables, empty] }
  return applyTableActions(withTable, name, actions, 'create')
}

function alterTable(state: SchemaState, name: string, actions: readonly TableAction[]): SchemaState {
  requireTable(state, name)
  return applyTableActions(state, name, actions, 'alter')
}

function applyTableActions(state: SchemaState, name: string, actions: readonly TableAction[], mode: 'create' | 'alter'): SchemaState {
  let current = state
  for (const action of actions) current = applyTableAction(current, name, action, mode)
  // Checked once the whole callback has run: the slug source may be declared after the slug.
  assertSlugSourcesExist(requireTable(current, name))
  return current
}

function applyTableAction(state: SchemaState, tableName: string, action: TableAction, mode: 'create' | 'alter'): SchemaState {
  const table = requireTable(state, tableName)
  switch (action.type) {
    case 'addColumn': {
      assertColumnCanBeAdded(state, table, action.column, mode)
      // Name the foreign key now (Laravel's convention), so later renames don't change it.
      const references = action.column.references
      const column = references === undefined || references.name !== undefined ? action.column : { ...action.column, references: { ...references, name: `${tableName}_${action.column.name}_foreign` } }
      return replaceTable(state, tableName, { ...table, columns: [...table.columns, column] })
    }
    case 'renameColumn':
      return renameColumn(state, table, action.from, action.to)
    case 'dropColumn':
      return dropColumn(state, table, action.name)
    case 'addIndex':
      assertIndexCanBeAdded(state, table, action.index)
      return replaceTable(state, tableName, { ...table, indexes: [...table.indexes, action.index] })
    case 'dropIndex':
      if (!table.indexes.some((index) => index.name === action.name)) {
        throw new SchemaError(
          'UNKNOWN_INDEX',
          `The table "${tableName}" has no index named "${action.name}".`,
          `Existing indexes: ${listOrNone(table.indexes.map((index) => index.name))}.`,
        )
      }
      return replaceTable(state, tableName, { ...table, indexes: table.indexes.filter((index) => index.name !== action.name) })
  }
}

function assertColumnCanBeAdded(state: SchemaState, table: TableState, column: ColumnDef, mode: 'create' | 'alter'): void {
  if (findColumn(table, column.name) !== undefined) {
    throw new SchemaError('COLUMN_EXISTS', `The table "${table.name}" already has a column "${column.name}".`, 'Pick another name, or rename/drop the existing column first.')
  }
  if (column.kind === 'id' && table.columns.some((existing) => existing.kind === 'id')) {
    throw new SchemaError('INVALID_COLUMN', `The table "${table.name}" already has a primary key.`, 'A table can only have one t.id().')
  }
  if (mode === 'alter') assertColumnCanBeAddedLater(table, column)
  if (column.references !== undefined) assertForeignKeyTarget(state, table, column)
}

function assertColumnCanBeAddedLater(table: TableState, column: ColumnDef): void {
  if (column.kind === 'id') {
    throw new SchemaError('INVALID_COLUMN', `Can't add a primary key to the existing table "${table.name}".`, 'Add t.id() when the table is created.')
  }
  // SQLite refuses this outright, and PostgreSQL only accepts it while the table is empty.
  if (!column.nullable && !('default' in column)) {
    throw new SchemaError(
      'INVALID_COLUMN',
      `The new column "${table.name}.${column.name}" is required but has no default, so existing rows would have no value.`,
      'Make it .nullable(), or give it a .default(…).',
    )
  }
}

function assertForeignKeyTarget(state: SchemaState, table: TableState, column: ColumnDef): void {
  const reference = column.references
  if (reference === undefined) return
  const parent = findTable(state, reference.table)
  if (parent === undefined) {
    throw new SchemaError(
      'INVALID_FOREIGN_KEY',
      `"${table.name}.${column.name}" points to the table "${reference.table}", which doesn't exist yet.`,
      `Create "${reference.table}" in an earlier migration, or fix the name in .constrained('…').`,
    )
  }
  if (findColumn(parent, reference.column) === undefined) {
    throw new SchemaError('INVALID_FOREIGN_KEY', `"${table.name}.${column.name}" points to "${reference.table}.${reference.column}", which doesn't exist.`, 'Point it at the parent\'s id column.')
  }
  if (reference.onDelete === 'set null' && !column.nullable) {
    throw new SchemaError(
      'INVALID_FOREIGN_KEY',
      `"${table.name}.${column.name}" uses nullOnDelete() but isn't nullable, so the database couldn't set it to null.`,
      'Add .nullable(), or use cascadeOnDelete() / restrictOnDelete() instead.',
    )
  }
}

function assertIndexCanBeAdded(state: SchemaState, table: TableState, index: IndexDef): void {
  // Index names are global in both SQLite and PostgreSQL, not per table.
  const clash = state.tables.find((other) => other.indexes.some((existing) => existing.name === index.name))
  if (clash !== undefined) {
    throw new SchemaError('INDEX_EXISTS', `An index named "${index.name}" already exists (on "${clash.name}").`, 'Give the index another name.')
  }
  for (const column of index.columns) requireColumn(table, column)
}

function renameColumn(state: SchemaState, table: TableState, from: string, to: string): SchemaState {
  const column = requireColumn(table, from)
  if (findColumn(table, to) !== undefined) {
    throw new SchemaError('COLUMN_EXISTS', `Can't rename "${table.name}.${from}" to "${to}": that column already exists.`, 'Drop or rename the other column first.')
  }
  const renamed: TableState = {
    ...table,
    columns: table.columns.map((existing) => {
      const next = existing === column ? { ...existing, name: to } : existing
      // A slug built from the old name keeps following the column under its new name.
      return next.slugFrom === from ? { ...next, slugFrom: to } : next
    }),
    // Both engines keep the index (and its old name) and point it at the renamed column.
    indexes: table.indexes.map((index) => ({ ...index, columns: index.columns.map((name) => (name === from ? to : name)) })),
  }
  const withTable = replaceTable(state, table.name, renamed)
  // Foreign keys in other tables follow the rename too, as they do in both databases.
  return mapReferences(withTable, (reference) =>
    reference.table === table.name && reference.column === from ? { ...reference, column: to } : reference,
  )
}

function dropColumn(state: SchemaState, table: TableState, name: string): SchemaState {
  requireColumn(table, name)
  const slug = table.columns.find((column) => column.slugFrom === name)
  if (slug !== undefined) {
    throw new SchemaError(
      'INVALID_SLUG_SOURCE',
      `Can't drop "${table.name}.${name}": the slug "${slug.name}" is built from it.`,
      `Change the slug's source first, or drop "${slug.name}" in the same migration before "${name}".`,
    )
  }
  const child = findReferencingColumn(state, table.name, name)
  if (child !== undefined) {
    throw new SchemaError(
      'INVALID_FOREIGN_KEY',
      `Can't drop "${table.name}.${name}": "${child}" still points to it.`,
      `Drop or change "${child}" first.`,
    )
  }
  return replaceTable(state, table.name, {
    ...table,
    columns: table.columns.filter((column) => column.name !== name),
    // PostgreSQL drops every index that covers the column; the SQLite compiler drops them explicitly.
    indexes: table.indexes.filter((index) => !index.columns.includes(name)),
  })
}

function dropTable(state: SchemaState, name: string, ifExists: boolean): SchemaState {
  if (findTable(state, name) === undefined) {
    if (ifExists) return state
    throw new SchemaError('UNKNOWN_TABLE', `Can't drop "${name}": there is no such table.`, `Use schema.dropIfExists('${name}') if it may already be gone.`)
  }
  const child = state.tables
    .filter((table) => table.name !== name)
    .flatMap((table) => table.columns.filter((column) => column.references?.table === name).map((column) => `${table.name}.${column.name}`))[0]
  if (child !== undefined) {
    throw new SchemaError('INVALID_FOREIGN_KEY', `Can't drop "${name}": "${child}" still points to it.`, `Drop "${child.split('.')[0] ?? ''}" first; in down(), drop tables in the reverse order you created them.`)
  }
  return { tables: state.tables.filter((table) => table.name !== name) }
}

function renameTable(state: SchemaState, from: string, to: string): SchemaState {
  const table = requireTable(state, from)
  if (findTable(state, to) !== undefined) {
    throw new SchemaError('TABLE_EXISTS', `Can't rename "${from}" to "${to}": that table already exists.`, 'Pick another name, or drop the other table first.')
  }
  const renamed = { tables: state.tables.map((existing) => (existing === table ? { ...table, name: to } : existing)) }
  return mapReferences(renamed, (reference) => (reference.table === from ? { ...reference, table: to } : reference))
}

function assertSlugSourcesExist(table: TableState): void {
  for (const column of table.columns) {
    if (column.slugFrom === undefined) continue
    const source = findColumn(table, column.slugFrom)
    if (source === undefined) {
      throw new SchemaError(
        'INVALID_SLUG_SOURCE',
        `The slug "${table.name}.${column.name}" is built from "${column.slugFrom}", but that column doesn't exist.`,
        `Columns on "${table.name}": ${listOrNone(table.columns.map((existing) => existing.name))}.`,
      )
    }
  }
}

function requireTable(state: SchemaState, name: string): TableState {
  const table = findTable(state, name)
  if (table !== undefined) return table
  throw new SchemaError('UNKNOWN_TABLE', `There is no table "${name}" at this point in the migrations.`, `Known tables: ${listOrNone(state.tables.map((existing) => existing.name))}. Check the spelling and the migration order.`)
}

function requireColumn(table: TableState, name: string): ColumnDef {
  const column = findColumn(table, name)
  if (column !== undefined) return column
  throw new SchemaError('UNKNOWN_COLUMN', `The table "${table.name}" has no column "${name}".`, `Its columns are: ${listOrNone(table.columns.map((existing) => existing.name))}.`)
}

function replaceTable(state: SchemaState, name: string, next: TableState): SchemaState {
  return { tables: state.tables.map((table) => (table.name === name ? next : table)) }
}

function mapReferences(state: SchemaState, update: (reference: NonNullable<ColumnDef['references']>) => NonNullable<ColumnDef['references']>): SchemaState {
  return {
    tables: state.tables.map((table) => ({
      ...table,
      columns: table.columns.map((column) => (column.references === undefined ? column : { ...column, references: update(column.references) })),
    })),
  }
}

function findReferencingColumn(state: SchemaState, table: string, column: string): string | undefined {
  for (const candidate of state.tables) {
    for (const child of candidate.columns) {
      if (child.references?.table === table && child.references.column === column) return `${candidate.name}.${child.name}`
    }
  }
  return undefined
}

function listOrNone(names: readonly string[]): string {
  return names.length === 0 ? '(none)' : names.join(', ')
}
