/**
 * `migration({ up, down })` and the `schema` object migrations talk to.
 *
 * The `schema` object is a *recorder*: `schema.create(…)` doesn't create anything, it writes down
 * a {@link SchemaOperation}. That one design choice is what lets Strutvane read a project's schema
 * with no database at all: run every `up()` against a recorder, in file order, and fold the
 * operations together.
 */
import { Blueprint } from './blueprint.ts'
import type { SchemaState } from './columns.ts'
import { assertIdentifier, SchemaError } from './errors.ts'
import type { SchemaOperation } from './operations.ts'

/**
 * What a migration's `up` and `down` receive: Laravel's `Schema` facade, as a parameter.
 *
 * Passing it in (instead of importing a global) keeps migrations pure functions of their input,
 * which is exactly what makes offline replay possible.
 *
 * @example
 * up(schema) {
 *   schema.create('posts', (t) => { t.id(); t.string('title') })
 * }
 */
export interface SchemaBuilder {
  /** Create a table. Laravel's `Schema::create`. */
  create(table: string, define: (t: Blueprint) => void): void
  /** Change an existing table: add, rename or drop columns and indexes. Laravel's `Schema::table`. */
  table(table: string, define: (t: Blueprint) => void): void
  /** Drop a table that must exist. */
  drop(table: string): void
  /** Drop a table if it exists; the usual choice in `down()`. */
  dropIfExists(table: string): void
  /** Rename a table. */
  rename(from: string, to: string): void
  /**
   * `true` if the table exists *at this point in the migration history*. Answered from the
   * recorded state, so it works offline and gives the same answer the database would.
   */
  hasTable(table: string): boolean
  /** `true` if the column exists at this point in the migration history. */
  hasColumn(table: string, column: string): boolean
}

/**
 * A migration file's default export.
 *
 * @example
 * export default migration({
 *   up(schema) { schema.create('tags', (t) => { t.id(); t.string('name') }) },
 *   down(schema) { schema.dropIfExists('tags') },
 * })
 */
export interface Migration {
  /** Apply the change. */
  up(schema: SchemaBuilder): void
  /** Undo exactly what `up` did. */
  down(schema: SchemaBuilder): void
}

/**
 * Declare a migration. It's an identity function: it exists for the types (so `schema` and `t`
 * are inferred inside `up` and `down`) and as a marker the static analyser can look for.
 *
 * @example
 * export default migration({ up(schema) {}, down(schema) {} })
 */
export function migration(definition: Migration): Migration {
  return definition
}

/**
 * Record what one `up()` or `down()` call does, without a database.
 *
 * `stateBefore` is only used to answer `hasTable` / `hasColumn`, so migrations that branch on
 * them still record the right operations.
 *
 * @example
 * const ops = recordOperations((schema) => schema.drop('posts'), state)
 * // [{ type: 'dropTable', table: 'posts', ifExists: false }]
 */
export function recordOperations(run: (schema: SchemaBuilder) => void, stateBefore: SchemaState): SchemaOperation[] {
  const recorder = new SchemaRecorder(stateBefore)
  try {
    // Typed as void, but an `async up()` still compiles (a Promise is assignable to void). Its
    // operations after the first `await` would be recorded too late, so refuse it outright.
    refuseThenable(run(recorder), 'up() and down()')
  } finally {
    recorder.seal()
  }
  return recorder.operations
}

/** Migrations are recorded synchronously: a returned promise means operations would be lost. */
function refuseThenable(result: unknown, what: string): void {
  if (typeof result === 'object' && result !== null && 'then' in result && typeof result.then === 'function') {
    throw new SchemaError(
      'ASYNC_MIGRATION',
      `${what} returned a promise. Migrations are recorded synchronously, so everything after the first await would be missing from the types, metadata and SQL.`,
      'Remove async/await from the migration. Data changes that need I/O belong in a seeder or a data migration, not in the schema.',
    )
  }
}

/**
 * The recorder behind {@link SchemaBuilder}.
 *
 * It tracks just enough of the state as it goes to answer `hasTable` / `hasColumn` truthfully
 * after earlier calls in the same migration (for example `create` then `hasTable`).
 */
class SchemaRecorder implements SchemaBuilder {
  readonly operations: SchemaOperation[] = []
  readonly #tables: Map<string, Set<string>>
  #sealed = false

  /** Stop recording: a call that arrives after up()/down() returned is a bug, never a silent no-op. */
  seal(): void {
    this.#sealed = true
  }

  #assertOpen(): void {
    if (this.#sealed) {
      throw new SchemaError('ASYNC_MIGRATION', 'The schema builder was used after the migration returned (a stored reference, a timer or an await).', 'Call schema methods only synchronously inside up() and down().')
    }
  }

  constructor(state: SchemaState) {
    this.#tables = new Map(state.tables.map((table) => [table.name, new Set(table.columns.map((column) => column.name))]))
  }

  create(table: string, define: (t: Blueprint) => void): void {
    this.#assertOpen()
    assertIdentifier(table, 'table')
    const actions = runBlueprint(table, define)
    this.operations.push({ type: 'createTable', table, actions })
    this.#tables.set(table, new Set(actions.flatMap((action) => (action.type === 'addColumn' ? [action.column.name] : []))))
  }

  table(table: string, define: (t: Blueprint) => void): void {
    this.#assertOpen()
    const actions = runBlueprint(table, define)
    this.operations.push({ type: 'alterTable', table, actions })
    const columns = this.#tables.get(table) ?? new Set<string>()
    for (const action of actions) {
      if (action.type === 'addColumn') columns.add(action.column.name)
      if (action.type === 'dropColumn') columns.delete(action.name)
      if (action.type === 'renameColumn') {
        columns.delete(action.from)
        columns.add(action.to)
      }
    }
  }

  drop(table: string): void {
    this.#assertOpen()
    this.operations.push({ type: 'dropTable', table, ifExists: false })
    this.#tables.delete(table)
  }

  dropIfExists(table: string): void {
    this.#assertOpen()
    this.operations.push({ type: 'dropTable', table, ifExists: true })
    this.#tables.delete(table)
  }

  rename(from: string, to: string): void {
    this.#assertOpen()
    assertIdentifier(to, 'table')
    this.operations.push({ type: 'renameTable', from, to })
    const columns = this.#tables.get(from)
    this.#tables.delete(from)
    if (columns !== undefined) this.#tables.set(to, columns)
  }

  hasTable(table: string): boolean {
    return this.#tables.has(table)
  }

  hasColumn(table: string, column: string): boolean {
    return this.#tables.get(table)?.has(column) ?? false
  }
}

function runBlueprint(table: string, define: (t: Blueprint) => void): ReturnType<Blueprint['toActions']> {
  const blueprint = new Blueprint(table)
  refuseThenable(define(blueprint), `The callback for "${table}"`)
  return blueprint.toActions()
}

/**
 * Check that a module's default export looks like a migration, with a friendly error if not.
 *
 * @example
 * const m = assertMigration((await import(url)).default, 'create_posts_table.ts')
 */
export function assertMigration(value: unknown, file: string): Migration {
  if (typeof value === 'object' && value !== null && 'up' in value && 'down' in value && typeof value.up === 'function' && typeof value.down === 'function') {
    return value as Migration
  }
  throw new SchemaError(
    'INVALID_MIGRATION',
    `${file} doesn't default-export a migration.`,
    'Make the file end with `export default migration({ up(schema) { … }, down(schema) { … } })`.',
  )
}
