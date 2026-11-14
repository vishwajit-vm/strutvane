/**
 * The few places where SQL differs between engines, in one object per engine. Everything the
 * core builds (list queries, binding lookups, writes) goes through these, so supporting MySQL
 * (the project's default database) is a dialect, not a rewrite.
 *
 * Only SQLite is *executed* in this spike. The MySQL and PostgreSQL dialects are covered by
 * SQL-text tests and marked unverified against a real engine in the README.
 */

/**
 * A value that can be bound to a statement parameter.
 *
 * @example
 * const value: SqlValue = 'hello'
 */
export type SqlValue = string | number | bigint | null

/**
 * One SQL engine's spelling.
 *
 * @example
 * sqliteDialect.quote('posts') // '"posts"'
 */
export interface Dialect {
  readonly name: 'sqlite' | 'mysql' | 'postgres'
  /** Quote an identifier (identifiers only ever come from validated metadata). */
  quote(identifier: string): string
  /** The placeholder for the n-th (1-based) parameter. */
  placeholder(position: number): string
  /** A case-insensitive "contains/starts with" comparison; `pattern` is a placeholder. */
  likeInsensitive(column: string, pattern: string): string
  /** One ORDER BY term with NULLs always last, whatever the engine's default. */
  orderBy(column: string, direction: 'asc' | 'desc'): string
  /** Store a timestamp in the engine's preferred text form. */
  formatDateTime(date: Date): string
}

/** `%` and `_` are wildcards in LIKE; escaping them makes a search for "50%" literal. */
const LIKE_ESCAPE = " ESCAPE '\\'"

/**
 * SQLite: numbered `?NNN` placeholders (spike 10, Finding 1: bare `?` silently bound wrong values),
 * `LIKE` is already case-insensitive for ASCII, `NULLS LAST` since 3.30.
 *
 * @example
 * sqliteDialect.placeholder(2) // '?2'
 */
export const sqliteDialect: Dialect = {
  name: 'sqlite',
  quote: (identifier) => `"${identifier}"`,
  placeholder: (position) => `?${position}`,
  likeInsensitive: (column, pattern) => `${column} LIKE ${pattern}${LIKE_ESCAPE}`,
  orderBy: (column, direction) => `${column} ${direction.toUpperCase()} NULLS LAST`,
  formatDateTime: (date) => date.toISOString(),
}

/**
 * MySQL 8.4 (the default database): only positional `?` placeholders, so every query must be
 * built strictly left to right (the builders here are). No `NULLS LAST`: emulated with
 * `col IS NULL` first. `LIKE` case sensitivity follows the column collation; the default
 * `utf8mb4_0900_ai_ci` is case-insensitive. DATETIME takes no `T`/`Z`. *(unverified: no engine here)*
 *
 * @example
 * mysqlDialect.orderBy('`title`', 'asc') // '`title` IS NULL, `title` ASC'
 */
export const mysqlDialect: Dialect = {
  name: 'mysql',
  quote: (identifier) => `\`${identifier}\``,
  placeholder: () => '?',
  likeInsensitive: (column, pattern) => `${column} LIKE ${pattern}${LIKE_ESCAPE}`,
  orderBy: (column, direction) => `${column} IS NULL, ${column} ${direction.toUpperCase()}`,
  formatDateTime: (date) => date.toISOString().replace('T', ' ').replace('Z', ''),
}

/**
 * PostgreSQL: `$n` placeholders, `ILIKE`, native `NULLS LAST`. *(not executed here; spike 10 ran PGlite)*
 *
 * @example
 * postgresDialect.likeInsensitive('"title"', '$1') // '"title" ILIKE $1 ESCAPE …'
 */
export const postgresDialect: Dialect = {
  name: 'postgres',
  quote: (identifier) => `"${identifier}"`,
  placeholder: (position) => `$${position}`,
  likeInsensitive: (column, pattern) => `${column} ILIKE ${pattern}${LIKE_ESCAPE}`,
  orderBy: (column, direction) => `${column} ${direction.toUpperCase()} NULLS LAST`,
  formatDateTime: (date) => date.toISOString(),
}

/**
 * Collects parameter values in order and hands out placeholders. Because values are appended in
 * the order the SQL text is written, the same builder is correct for numbered *and* positional
 * placeholder styles.
 *
 * @example
 * const params = new SqlParams(sqliteDialect)
 * const sql = `SELECT * FROM "posts" WHERE "id" = ${params.add(7)}` // … = ?1
 */
export class SqlParams {
  readonly values: SqlValue[] = []
  readonly #dialect: Dialect

  constructor(dialect: Dialect) {
    this.#dialect = dialect
  }

  /**
   * Add a value and get its placeholder.
   *
   * @example
   * params.add('hello') // '?1'
   */
  add(value: SqlValue): string {
    this.values.push(value)
    return this.#dialect.placeholder(this.values.length)
  }
}

/**
 * Escape LIKE wildcards so user text matches literally.
 *
 * @example
 * escapeLike('50%_off') // '50\\%\\_off'
 */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`)
}
