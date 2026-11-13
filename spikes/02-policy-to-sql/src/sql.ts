/**
 * Compile a bound, validated {@link Filter} into a parameterized Postgres WHERE fragment.
 *
 * ## Guarantees
 * - **No value is ever concatenated into SQL.** Every literal becomes a typed placeholder (`$n::type`).
 *   Identifiers come only from the trusted schema and are quoted after pattern validation.
 * - **Two-valued output.** Every leaf compiles to an expression that is never NULL, so wrapping it in
 *   `NOT (...)` behaves exactly like JavaScript `!`. This is the crux of SQL/JS equivalence:
 *   - `eq`  → `col IS NOT DISTINCT FROM $1`   (NULL-safe, never NULL)
 *   - `ne`  → `col IS DISTINCT FROM $1`       (naive `col <> $1` would return NULL for a NULL column,
 *                                               silently dropping rows that JS considers "not equal")
 *   - `gt…` → `COALESCE(col > $1, FALSE)`
 *   - `contains` → `COALESCE(strpos(col, $1) > 0, FALSE)` (not LIKE: user values containing `%` or `_`
 *                                               would act as wildcards and change the meaning)
 * - **Composable.** The output is a pure WHERE fragment over the subject table alias. To-one relation
 *   paths compile to correlated scalar subqueries, so the caller's FROM/JOIN/ORDER/LIMIT is untouched.
 *
 * ## Why scalar subqueries for relations (not JOIN, not EXISTS)
 * - A JOIN would force the fragment to change the caller's FROM clause (not composable).
 * - `EXISTS (... AND pred)` gives the wrong answer for a missing related row: `customer.region IS NULL`
 *   must be TRUE when there is no customer (in-memory: null relation → null field), but EXISTS is FALSE.
 * - `(SELECT c.region FROM customers c WHERE c.id = t.customer_id)` yields NULL for a missing row, which
 *   is exactly the in-memory semantics. Postgres typically plans these as a join; see README for the
 *   performance caveat. EXISTS remains the right tool for future to-MANY "any related row" predicates.
 */
import type { Filter, Operand, Scalar } from './ast.js'
import { validate } from './bind.js'
import { type ModelSchema, quoteIdent, resolveColumn } from './schema.js'

/** A parameterized SQL fragment as an ordered list of tokens: raw SQL text and parameter values. */
export type Token = { readonly sql: string } | { readonly param: Scalar; readonly type: string }

export interface CompileOptions {
  /** Alias of the subject table in the surrounding query. Default `"t"`. */
  readonly alias?: string
}

const lit = (op: Operand): Scalar => (op.kind === 'value' ? op.value : null)

function compileTokens(f: Filter, schema: ModelSchema, alias: string, out: Token[]): void {
  const raw = (sql: string): void => {
    out.push({ sql })
  }
  const param = (v: Scalar, type: string): void => {
    out.push({ param: v, type })
  }

  const column = (path: readonly string[]): { readonly type: string } => {
    const { column: col, relation } = resolveColumn(schema, path)
    if (!relation) {
      raw(`${quoteIdent(alias)}.${quoteIdent(col.column)}`)
    } else {
      const r = '__rel_' + (path[0] as string)
      raw(
        `(SELECT ${quoteIdent(r)}.${quoteIdent(col.column)} FROM ${quoteIdent(relation.table)} AS ${quoteIdent(r)}` +
          ` WHERE ${quoteIdent(r)}.${quoteIdent(relation.targetKey)} = ${quoteIdent(alias)}.${quoteIdent(relation.foreignKey)})`,
      )
    }
    return { type: col.type }
  }

  const group = (args: readonly Filter[], joiner: string, empty: string): void => {
    if (args.length === 0) {
      raw(empty)
      return
    }
    raw('(')
    args.forEach((a, i) => {
      if (i > 0) raw(` ${joiner} `)
      compileTokens(a, schema, alias, out)
    })
    raw(')')
  }

  switch (f.op) {
    case 'true':
      return raw('TRUE')
    case 'false':
      return raw('FALSE')
    case 'and':
      return group(f.args, 'AND', 'TRUE')
    case 'or':
      return group(f.args, 'OR', 'FALSE')
    case 'not':
      raw('(NOT ')
      compileTokens(f.arg, schema, alias, out)
      return raw(')')
    case 'isNull':
      raw('(')
      column(f.field.path)
      return raw(f.value ? ' IS NULL)' : ' IS NOT NULL)')
    case 'eq':
    case 'ne': {
      raw('(')
      const { type } = column(f.field.path)
      raw(f.op === 'eq' ? ' IS NOT DISTINCT FROM ' : ' IS DISTINCT FROM ')
      param(lit(f.value), type)
      return raw(')')
    }
    case 'in':
    case 'nin': {
      // Expanded to OR of NULL-safe equalities: `col = ANY($1)` would be NULL (not FALSE) for a NULL column
      // and could not match a NULL element.
      if (f.values.length === 0) return raw(f.op === 'in' ? 'FALSE' : 'TRUE')
      raw(f.op === 'in' ? '(' : '(NOT (')
      f.values.forEach((v, i) => {
        if (i > 0) raw(' OR ')
        raw('(')
        const { type } = column(f.field.path)
        raw(' IS NOT DISTINCT FROM ')
        param(lit(v), type)
        raw(')')
      })
      return raw(f.op === 'in' ? ')' : '))')
    }
    case 'contains': {
      raw('COALESCE(strpos(')
      const { type } = column(f.field.path)
      raw(', ')
      param(lit(f.value), type)
      return raw(') > 0, FALSE)')
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const sym = { gt: '>', gte: '>=', lt: '<', lte: '<=' }[f.op]
      raw('COALESCE(')
      const { type } = column(f.field.path)
      raw(` ${sym} `)
      param(lit(f.value), type)
      return raw(', FALSE)')
    }
  }
}

/** Compile to tokens (for adapters such as Kysely). Validates first: invalid input throws, like `evaluate`. */
export function compileToTokens(filter: Filter, schema: ModelSchema, options: CompileOptions = {}): Token[] {
  validate(filter, schema)
  const out: Token[] = []
  compileTokens(filter, schema, options.alias ?? 't', out)
  return out
}

/** Render tokens as `$n`-numbered SQL for the `pg` / PGlite wire protocol. */
export function renderPostgres(tokens: readonly Token[], firstParam = 1): { sql: string; params: Scalar[] } {
  let sql = ''
  const params: Scalar[] = []
  for (const t of tokens) {
    if ('sql' in t) sql += t.sql
    else {
      params.push(t.param)
      sql += `$${firstParam + params.length - 1}::${t.type}`
    }
  }
  return { sql, params }
}

/** Convenience: compile straight to `{ sql, params }`. */
export function compileToSql(filter: Filter, schema: ModelSchema, options: CompileOptions = {}) {
  return renderPostgres(compileToTokens(filter, schema, options))
}
