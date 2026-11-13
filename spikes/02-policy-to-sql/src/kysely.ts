/**
 * Kysely adapter: turn compiled tokens into a Kysely `RawBuilder<SqlBool>` so a policy filter can be
 * dropped into any Kysely query (`.where(policyWhere(...))`). Kysely then numbers the parameters itself,
 * so the fragment composes safely with other parameterized clauses.
 */
import { type RawBuilder, type SqlBool, sql } from 'kysely'
import type { Filter } from './ast.js'
import type { ModelSchema } from './schema.js'
import { type CompileOptions, compileToTokens } from './sql.js'

export function policyWhere(filter: Filter, schema: ModelSchema, options: CompileOptions = {}): RawBuilder<SqlBool> {
  const parts = compileToTokens(filter, schema, options).map((t) =>
    'sql' in t ? sql.raw(t.sql) : sql`${t.param}::${sql.raw(t.type)}`,
  )
  return sql<SqlBool>`${sql.join(parts, sql.raw(''))}`
}
