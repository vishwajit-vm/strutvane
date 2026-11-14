/**
 * What an app's migration files import: `import { migration } from '#strutvane/schema'`.
 *
 * Why this file is so small: the schema builder, the offline replay and the SQL compiler were
 * designed and proven in spike 10. This spike only needs migrations to *type-check* and to keep
 * spike 10's exact file format, so that `make:migration` writes files spike 10 can replay. The
 * example app's `.strutvane/` folder (types, `resources.json`, SQL) was produced by spike 10's
 * generator from these very files (see the README).
 *
 * The interfaces below are a type-only mirror of the subset of spike 10's `Blueprint` the
 * example app uses. In the product they are the real builder from `@strutvane/framework/schema`.
 */

/**
 * Modifiers every column has. `TValue` keeps `.default(…)` type-safe.
 *
 * @example
 * t.string('subtitle').nullable().default(null)
 */
export interface ColumnBuilder<TValue> {
  /** Allow SQL `NULL`. */
  nullable(): this
  /** A literal default that must match the column type. */
  default(value: TValue | null): this
  /** Add a unique index. */
  unique(): this
  /** Add a plain index. */
  index(): this
}

/**
 * A slug column: unique, and built from another column by the CRUD layer.
 *
 * @example
 * t.slug('slug').from('title')
 */
export interface SlugColumnBuilder extends ColumnBuilder<string> {
  /** The column the slug is built from. */
  from(column: string): this
}

/**
 * A foreign key column.
 *
 * @example
 * t.foreignId('author_id').constrained('authors').cascadeOnDelete()
 */
export interface ForeignIdColumnBuilder extends ColumnBuilder<number> {
  /** Reference another table (guessed from the column name when omitted). */
  constrained(table?: string, column?: string): this
  /** Delete child rows with the parent. */
  cascadeOnDelete(): this
  /** Set the column to NULL when the parent goes. */
  nullOnDelete(): this
}

/**
 * The `t` in `schema.create('posts', (t) => { … })`. Laravel's Blueprint.
 *
 * @example
 * schema.create('posts', (t) => { t.id(); t.string('title', 200); t.timestamps() })
 */
export interface Blueprint {
  /** Auto-incrementing primary key. */
  id(name?: string): ColumnBuilder<number>
  /** Whole number. */
  integer(name: string): ColumnBuilder<number>
  /** Short text with a maximum length (255 by default). */
  string(name: string, length?: number): ColumnBuilder<string>
  /** Long text. */
  text(name: string): ColumnBuilder<string>
  /** A unique, URL-safe slug. */
  slug(name?: string, length?: number): SlugColumnBuilder
  /** True or false. */
  boolean(name: string): ColumnBuilder<boolean>
  /** One value from a fixed list. */
  enum<const TValues extends readonly [string, ...string[]]>(name: string, values: TValues): ColumnBuilder<TValues[number]>
  /** A date and time. */
  timestamp(name: string): ColumnBuilder<string>
  /** A foreign key column. */
  foreignId(name: string): ForeignIdColumnBuilder
  /** `created_at` and `updated_at`. */
  timestamps(): void
  /** `deleted_at`, for soft deletes. */
  softDeletes(): void
  /** Drop one or more columns. */
  dropColumn(...names: string[]): void
  /** Rename a column. */
  renameColumn(from: string, to: string): void
}

/**
 * What `up` and `down` receive: Laravel's `Schema` facade, as a parameter (spike 10 explains why
 * a parameter and not a global: it is what makes offline replay possible).
 *
 * @example
 * up(schema) { schema.create('tags', (t) => { t.id() }) }
 */
export interface SchemaBuilder {
  /** Create a table. */
  create(table: string, define: (t: Blueprint) => void): void
  /** Change a table. */
  table(table: string, define: (t: Blueprint) => void): void
  /** Drop a table if it exists. */
  dropIfExists(table: string): void
  /** `true` if the table exists at this point in the history. */
  hasTable(table: string): boolean
  /** `true` if the column exists at this point in the history. */
  hasColumn(table: string, column: string): boolean
}

/**
 * A migration file's default export.
 *
 * @example
 * export default migration({ up(schema) {}, down(schema) {} })
 */
export interface Migration {
  /** Apply the change. */
  up(schema: SchemaBuilder): void
  /** Undo exactly what `up` did. */
  down(schema: SchemaBuilder): void
}

/**
 * Declare a migration. An identity function, exactly like spike 10's: it exists so `schema` and
 * `t` are typed inside `up` and `down`.
 *
 * @example
 * export default migration({
 *   up(schema) { schema.create('tags', (t) => { t.id(); t.string('name') }) },
 *   down(schema) { schema.dropIfExists('tags') },
 * })
 */
export function migration(definition: Migration): Migration {
  return definition
}
