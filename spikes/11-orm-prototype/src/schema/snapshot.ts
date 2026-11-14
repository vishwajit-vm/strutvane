/**
 * The runtime schema snapshot: what the migrations left behind, as plain data.
 *
 * Spike 10 replays the migration files in memory and produces exactly this shape (its
 * `TableState`). The ORM reads it at runtime to know things the generated *types* cannot carry
 * into JavaScript: which column is a boolean (SQLite returns `0`/`1`), which one is a JSON column,
 * which column is the slug and what it is generated from, whether the table has timestamps, soft
 * deletes or a tenant column. The model file never redeclares any of this.
 */

/**
 * Every column kind the migration builder can create (the same closed list as spike 10).
 *
 * @example
 * const kind: ColumnKind = 'timestamp'
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
 * One column, fully resolved by the migration replay.
 *
 * @example
 * const title: ColumnDef = { name: 'title', kind: 'string', nullable: false, length: 200 }
 */
export interface ColumnDef {
  readonly name: string
  readonly kind: ColumnKind
  /** `true` when the column accepts SQL `NULL`. */
  readonly nullable: boolean
  /** Maximum characters for `string` / `slug`. */
  readonly length?: number
  /** Digits after the decimal point for `decimal`. */
  readonly scale?: number
  /** Allowed values for `enum`. */
  readonly values?: readonly string[]
  /** For `slug`: the column the slug is generated from. */
  readonly slugFrom?: string
}

/**
 * An index. The ORM only cares about unique ones (slug uniqueness is scoped like the index).
 *
 * @example
 * const index: IndexDef = { name: 'posts_slug_unique', columns: ['slug'], unique: true }
 */
export interface IndexDef {
  readonly name: string
  readonly columns: readonly string[]
  readonly unique: boolean
}

/**
 * A table as the migrations left it.
 *
 * @example
 * const tags: TableState = { name: 'tags', columns: [{ name: 'id', kind: 'id', nullable: false }], indexes: [] }
 */
export interface TableState {
  readonly name: string
  readonly columns: readonly ColumnDef[]
  readonly indexes: readonly IndexDef[]
  /**
   * Shared reference data, deliberately visible to every tenant (`schema.create(name, fn, { global: true })`).
   * When tenancy is on, a table with neither the tenant column nor this flag is refused (fail closed).
   */
  readonly global?: boolean
}

/**
 * Every table of the app. Generated next to the types by `sv migrate` (spike 10).
 *
 * @example
 * const snapshot: SchemaSnapshot = { tables: { tags: tagsTable } }
 */
export interface SchemaSnapshot {
  readonly tables: Readonly<Record<string, TableState>>
}
