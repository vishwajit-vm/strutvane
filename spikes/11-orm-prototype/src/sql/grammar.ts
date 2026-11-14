/**
 * Grammars: everything that differs between SQL engines, in one small object per dialect.
 *
 * This copies Laravel's split (Query Builder → Grammar → Connection): the compiler writes
 * portable fragments and asks the grammar only for the few things engines disagree on:
 *
 * | | MySQL 8.4 (default) | PostgreSQL | SQLite |
 * |---|---|---|---|
 * | identifier quotes | `` `name` `` | `"name"` | `"name"` |
 * | placeholders | `?` | `$1, $2…` | `?` |
 * | NULL-safe "differs from" | `NOT (a <=> b)` | `a IS DISTINCT FROM b` | `a IS NOT b` |
 * | `RETURNING` | no: insert id + re-select | yes | yes |
 * | `OFFSET` without `LIMIT` | needs a huge `LIMIT` | fine | needs `LIMIT -1` |
 * | unique violation | errno 1062 | SQLSTATE 23505 | "UNIQUE constraint failed" |
 */
import { concat, type SqlFragment, text, value } from './fragment.ts'

/** The SQL engines Strutvane supports. MySQL is the default for new apps. */
export type Dialect = 'mysql' | 'postgres' | 'sqlite'

/**
 * What a dialect must provide.
 *
 * @example
 * const { sql, params } = mysqlGrammar.render(fragment)
 */
export interface Grammar {
  readonly dialect: Dialect
  /** Quote a validated identifier. */
  quote(name: string): string
  /** The placeholder for the n-th bound value (1-based). */
  placeholder(position: number): string
  /** NULL-safe "left differs from right" (ADR-0008: `!=` matches NULL rows, like JavaScript). */
  nullSafeNotEqual(left: SqlFragment, right: SqlFragment): SqlFragment
  /** Literal substring position (1-based, 0 when absent): never LIKE, so `%` and `_` are plain text. */
  position(haystack: SqlFragment, needle: SqlFragment): SqlFragment
  /** A text parameter. PostgreSQL can't infer a parameter's type inside string functions. */
  textParameter(value: unknown): SqlFragment
  /** Can `INSERT`/`UPDATE … RETURNING *` hand back the written row? */
  readonly supportsReturning: boolean
  /** The `LIMIT` to write when only an `OFFSET` was asked for (`undefined`: none needed). */
  readonly limitForOffsetOnly: string | undefined
  /** Turn a driver error into "was this a unique-constraint violation?". */
  isUniqueViolation(error: unknown): boolean
  /** Render a fragment to final SQL text and its parameter list. */
  render(fragment: SqlFragment): RenderedSql
}

/**
 * SQL ready for a driver.
 *
 * @example
 * const rendered: RenderedSql = { sql: 'SELECT * FROM `posts` WHERE `id` = ?', params: [1] }
 */
export interface RenderedSql {
  readonly sql: string
  readonly params: readonly unknown[]
}

function renderWith(grammar: Pick<Grammar, 'quote' | 'placeholder'>, fragment: SqlFragment): RenderedSql {
  let output = ''
  const params: unknown[] = []
  for (const part of fragment.parts) {
    if (part.kind === 'text') output += part.text
    else if (part.kind === 'identifier') output += grammar.quote(part.name)
    else {
      params.push(part.value)
      output += grammar.placeholder(params.length)
    }
  }
  return { sql: output, params }
}

function errorProperty(error: unknown, key: 'code' | 'errno'): unknown {
  return typeof error === 'object' && error !== null && key in error ? Reflect.get(error, key) : undefined
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * MySQL 8.4 LTS, the default engine for new Strutvane apps.
 *
 * @example
 * mysqlGrammar.quote('posts') // '`posts`'
 */
export const mysqlGrammar: Grammar = {
  dialect: 'mysql',
  quote: (name) => `\`${name}\``,
  placeholder: () => '?',
  // MySQL has no IS DISTINCT FROM; `<=>` is its NULL-safe equality, so negate it.
  nullSafeNotEqual: (left, right) => concat(text('NOT ('), left, text(' <=> '), right, text(')')),
  position: (haystack, needle) => concat(text('LOCATE('), needle, text(', '), haystack, text(')')),
  textParameter: (bound) => value(bound),
  // MySQL (unlike MariaDB) has no RETURNING clause, up to and including 8.4 / 9.x.
  supportsReturning: false,
  // The largest unsigned BIGINT: MySQL's documented way to say "no limit" before an OFFSET.
  limitForOffsetOnly: '18446744073709551615',
  isUniqueViolation: (error) => errorProperty(error, 'code') === 'ER_DUP_ENTRY' || errorProperty(error, 'errno') === 1062,
  render(fragment) {
    return renderWith(this, fragment)
  },
}

/**
 * PostgreSQL (and PGlite, which is PostgreSQL compiled to WebAssembly).
 *
 * @example
 * postgresGrammar.placeholder(2) // '$2'
 */
export const postgresGrammar: Grammar = {
  dialect: 'postgres',
  quote: (name) => `"${name}"`,
  placeholder: (position) => `$${position}`,
  nullSafeNotEqual: (left, right) => concat(left, text(' IS DISTINCT FROM '), right),
  position: (haystack, needle) => concat(text('strpos('), haystack, text(', '), needle, text(')')),
  textParameter: (bound) => concat(text('CAST('), value(bound), text(' AS text)')),
  supportsReturning: true,
  limitForOffsetOnly: undefined,
  // 23505 = unique_violation (SQLSTATE), the same on PostgreSQL and PGlite.
  isUniqueViolation: (error) => errorProperty(error, 'code') === '23505',
  render(fragment) {
    return renderWith(this, fragment)
  },
}

/**
 * SQLite (node:sqlite here; the same SQL works on better-sqlite3 and libSQL).
 *
 * @example
 * sqliteGrammar.placeholder(2) // '?'
 */
export const sqliteGrammar: Grammar = {
  dialect: 'sqlite',
  quote: (name) => `"${name}"`,
  placeholder: () => '?',
  // SQLite's IS / IS NOT are NULL-safe comparisons for any operands.
  nullSafeNotEqual: (left, right) => concat(left, text(' IS NOT '), right),
  position: (haystack, needle) => concat(text('instr('), haystack, text(', '), needle, text(')')),
  textParameter: (bound) => value(bound),
  supportsReturning: true,
  limitForOffsetOnly: '-1',
  isUniqueViolation: (error) => errorMessage(error).includes('UNIQUE constraint failed'),
  render(fragment) {
    return renderWith(this, fragment)
  },
}

/**
 * The grammar for a dialect.
 *
 * @example
 * grammarFor('mysql').quote('posts') // '`posts`'
 */
export function grammarFor(dialect: Dialect): Grammar {
  switch (dialect) {
    case 'mysql':
      return mysqlGrammar
    case 'postgres':
      return postgresGrammar
    case 'sqlite':
      return sqliteGrammar
  }
}
