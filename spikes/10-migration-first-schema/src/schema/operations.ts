/**
 * The recorded operations of a migration.
 *
 * Running a migration's `up()` against the recorder doesn't touch a database. It produces this
 * list of plain-data operations. The same list is then:
 * - folded into a {@link SchemaState} (types and metadata), and
 * - compiled to SQL for a real database (the migrator).
 *
 * Because both paths start from the same list, the types can't drift from the SQL that runs.
 */
import type { ColumnDef, IndexDef } from './columns.ts'

/**
 * One change inside `schema.create(…)` or `schema.table(…)`.
 *
 * @example
 * const action: TableAction = { type: 'renameColumn', from: 'body', to: 'content' }
 */
export type TableAction =
  | { readonly type: 'addColumn'; readonly column: ColumnDef }
  | { readonly type: 'renameColumn'; readonly from: string; readonly to: string }
  | { readonly type: 'dropColumn'; readonly name: string }
  | { readonly type: 'addIndex'; readonly index: IndexDef }
  | { readonly type: 'dropIndex'; readonly name: string }

/**
 * One schema-level operation, in the order the migration called it.
 *
 * @example
 * const op: SchemaOperation = { type: 'dropTable', table: 'posts', ifExists: true }
 */
export type SchemaOperation =
  | { readonly type: 'createTable'; readonly table: string; readonly actions: readonly TableAction[] }
  | { readonly type: 'alterTable'; readonly table: string; readonly actions: readonly TableAction[] }
  | { readonly type: 'dropTable'; readonly table: string; readonly ifExists: boolean }
  | { readonly type: 'renameTable'; readonly from: string; readonly to: string }
