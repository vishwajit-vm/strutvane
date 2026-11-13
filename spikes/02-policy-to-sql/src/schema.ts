/**
 * Minimal model metadata the compiler needs: table/column names and column types.
 *
 * In Strutvane this comes from `defineModel()`; the spike hand-writes it. Identifiers come ONLY from here
 * (trusted, developer-authored), never from request input, and are still validated and quoted.
 */

export type ColumnType = 'text' | 'int4' | 'bool'

export interface ColumnDef {
  readonly column: string
  readonly type: ColumnType
}

/** A to-one relation (belongsTo): `subject.fk -> target.pk`. */
export interface RelationDef {
  readonly table: string
  readonly foreignKey: string
  readonly targetKey: string
  readonly columns: Readonly<Record<string, ColumnDef>>
}

export interface ModelSchema {
  readonly table: string
  readonly columns: Readonly<Record<string, ColumnDef>>
  readonly relations: Readonly<Record<string, RelationDef>>
}

const IDENT = /^[a-z_][a-z0-9_]{0,62}$/

/** Quote a trusted identifier, rejecting anything outside a conservative pattern. */
export function quoteIdent(name: string): string {
  if (!IDENT.test(name)) throw new SchemaError(`Unsafe SQL identifier: ${JSON.stringify(name)}`)
  return `"${name}"`
}

export class SchemaError extends Error {
  override readonly name = 'SchemaError'
}

/** Resolve a field path to its column definition, or throw. Used by the evaluator and the compiler alike. */
export function resolveColumn(
  schema: ModelSchema,
  path: readonly string[],
): { readonly column: ColumnDef; readonly relation?: RelationDef } {
  if (path.length === 1) {
    const column = schema.columns[path[0] as string]
    if (!column) throw new SchemaError(`Unknown field "${path[0]}" on ${schema.table}`)
    return { column }
  }
  if (path.length === 2) {
    const relation = schema.relations[path[0] as string]
    if (!relation) throw new SchemaError(`Unknown relation "${path[0]}" on ${schema.table}`)
    const column = relation.columns[path[1] as string]
    if (!column) throw new SchemaError(`Unknown field "${path[1]}" on relation ${path[0]}`)
    return { column, relation }
  }
  throw new SchemaError(`Field paths deeper than one relation are not supported: ${path.join('.')}`)
}

/** Does a JS value fit a column type? `null` fits every (nullable) column. */
export function fitsType(v: unknown, type: ColumnType): boolean {
  if (v === null) return true
  switch (type) {
    case 'text':
      return typeof v === 'string'
    case 'int4':
      return typeof v === 'number' && Number.isInteger(v) && v >= -2147483648 && v <= 2147483647
    case 'bool':
      return typeof v === 'boolean'
  }
}
