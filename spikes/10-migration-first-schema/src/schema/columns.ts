/**
 * The plain-data vocabulary of a database schema.
 *
 * Everything in this file is data, never behaviour: it describes a table the way the migrations
 * left it. The recorder builds it, the generators (types, metadata, SQL) read it, and the
 * introspector compares a real database against it. Keeping it dumb and serialisable is what lets
 * the whole pipeline run offline and stay deterministic.
 */

/**
 * Every column kind the migration builder can create.
 *
 * Why a closed list: each kind maps to exactly one TypeScript type, one SQL type per dialect, one
 * validation rule and one UI widget. Adding a kind means touching each of those on purpose.
 *
 * @example
 * const kind: ColumnKind = 'decimal'
 */
export type ColumnKind =
  | 'id'
  | 'integer'
  | 'bigInteger'
  | 'string'
  | 'text'
  | 'slug'
  | 'uuid'
  | 'decimal'
  | 'double'
  | 'boolean'
  | 'enum'
  | 'date'
  | 'timestamp'
  | 'json'
  | 'foreignId'

/**
 * What happens to rows that point at a parent row when the parent is deleted.
 *
 * @example
 * const onDelete: ReferentialAction = 'cascade'
 */
export type ReferentialAction = 'cascade' | 'set null' | 'restrict' | 'no action'

/**
 * A foreign key: "this column holds an id from that table".
 *
 * @example
 * const fk: ForeignKeyDef = { table: 'users', column: 'id', onDelete: 'cascade' }
 */
export interface ForeignKeyDef {
  /** The parent table, for example `users`. */
  readonly table: string
  /** The parent column, almost always `id`. */
  readonly column: string
  /** What the database does to this row when the parent row is deleted. */
  readonly onDelete: ReferentialAction
}

/**
 * A literal default value. Only literals are allowed, so the same default can be written into
 * SQLite, PostgreSQL and MySQL DDL and into TypeScript `New*` types without running any code.
 *
 * @example
 * const fallback: DefaultValue = 'draft'
 */
export type DefaultValue = string | number | boolean | null

/**
 * One column, fully resolved.
 *
 * @example
 * const title: ColumnDef = { name: 'title', kind: 'string', nullable: false, length: 200 }
 */
export interface ColumnDef {
  readonly name: string
  readonly kind: ColumnKind
  /** `true` when the column accepts SQL `NULL` (and the TypeScript type gains `| null`). */
  readonly nullable: boolean
  /** Present only when the migration called `.default(…)`. `null` is a real default here. */
  readonly default?: DefaultValue
  /** Maximum characters for `string` / `slug`. */
  readonly length?: number
  /** Total digits for `decimal`. */
  readonly precision?: number
  /** Digits after the decimal point for `decimal`. */
  readonly scale?: number
  /** Allowed values for `enum`, in declaration order. */
  readonly values?: readonly string[]
  /** For `slug`: the column the slug is generated from, for example `title`. */
  readonly slugFrom?: string
  /** Present when the column references another table. */
  readonly references?: ForeignKeyDef
  /** A free-text comment stored in the database (PostgreSQL / MySQL only). */
  readonly comment?: string
}

/**
 * An index on one or more columns. Named the way Laravel names them (`posts_slug_unique`), so
 * people coming from Laravel recognise them in `\d posts`.
 *
 * @example
 * const idx: IndexDef = { name: 'posts_slug_unique', columns: ['slug'], unique: true }
 */
export interface IndexDef {
  readonly name: string
  readonly columns: readonly string[]
  readonly unique: boolean
}

/**
 * A table as the migrations left it. Column order is the order columns were added, which is also
 * the order the generators print them in: that keeps generated files stable and readable.
 *
 * @example
 * const empty: TableState = { name: 'posts', columns: [], indexes: [] }
 */
export interface TableState {
  readonly name: string
  readonly columns: readonly ColumnDef[]
  readonly indexes: readonly IndexDef[]
}

/**
 * The whole schema: every table, in creation order.
 *
 * @example
 * const nothingYet: SchemaState = { tables: [] }
 */
export interface SchemaState {
  readonly tables: readonly TableState[]
}

/** An empty schema, the starting point before the first migration runs. */
export const EMPTY_SCHEMA: SchemaState = { tables: [] }

/**
 * Find a table by name.
 *
 * @example
 * const posts = findTable(state, 'posts') // TableState | undefined
 */
export function findTable(state: SchemaState, name: string): TableState | undefined {
  return state.tables.find((table) => table.name === name)
}

/**
 * Find a column by name.
 *
 * @example
 * const title = findColumn(posts, 'title') // ColumnDef | undefined
 */
export function findColumn(table: TableState, name: string): ColumnDef | undefined {
  return table.columns.find((column) => column.name === name)
}

/**
 * Columns the database fills in by itself, so neither a create form nor a `New*` type should ask
 * for them: the auto-increment id, and the timestamps the framework stamps on every write.
 *
 * @example
 * isManagedColumn({ name: 'created_at', kind: 'timestamp', nullable: true }) // true
 */
export function isManagedColumn(column: ColumnDef): boolean {
  if (column.kind === 'id') return true
  return MANAGED_TIMESTAMPS.has(column.name) && column.kind === 'timestamp'
}

/** Timestamp columns the framework writes itself (Laravel's `timestamps()` and `softDeletes()`). */
export const MANAGED_TIMESTAMPS: ReadonlySet<string> = new Set(['created_at', 'updated_at', 'deleted_at'])

/**
 * Column names that hold secrets. They are never returned by the API, never searched and never
 * shown in the UI, whatever the migration says. This mirrors Laravel's `$hidden` defaults.
 *
 * @example
 * isSensitiveColumn('password') // true
 */
export function isSensitiveColumn(name: string): boolean {
  return SENSITIVE_NAMES.has(name) || name.endsWith('_secret') || name.endsWith('_token')
}

const SENSITIVE_NAMES: ReadonlySet<string> = new Set(['password', 'remember_token', 'two_factor_secret'])
