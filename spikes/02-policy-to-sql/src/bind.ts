/**
 * Binding and validation: the single gate both execution paths pass through.
 *
 * `bindActor` replaces actor references with literal values; `validate` rejects anything the two paths
 * could disagree on. Because the in-memory evaluator and the SQL compiler BOTH call these functions,
 * an input is either accepted by both (and then gives identical results) or rejected by both
 * (fail closed, with the same error). That property is what makes the equivalence guarantee hold.
 */
import type { Filter, Operand, Scalar } from './ast.js'
import { fitsType, type ColumnType, type ModelSchema, resolveColumn } from './schema.js'

/** The acting principal (mirrors `Actor` in @strutvane/contracts). */
export interface Actor {
  readonly id: string
  readonly roles: readonly string[]
  readonly attrs: Readonly<Record<string, Scalar | undefined>>
}

export class PolicyTypeError extends Error {
  override readonly name = 'PolicyTypeError'
}

/**
 * Resolve an actor path like `['id']` or `['attrs', 'region']`.
 *
 * A **missing** attribute (`undefined`) throws: the identity layer must set every attribute a policy
 * references, explicitly (`null` is allowed). Silently treating "missing" as `null` is dangerous, see
 * {@link bindActor}.
 */
function resolveActor(actor: Actor, path: readonly string[]): Scalar {
  if (path.length === 1 && path[0] === 'id') return actor.id
  if (path.length === 2 && path[0] === 'attrs') {
    const v = actor.attrs[path[1] as string]
    if (v === undefined) {
      throw new PolicyTypeError(
        `Policy references actor.attrs.${path[1]} but the actor does not define it (set it explicitly; null is allowed)`,
      )
    }
    return v
  }
  throw new PolicyTypeError(`Unsupported actor reference: actor.${path.join('.')}`)
}

const isNullActorRef = (op: Operand, actor: Actor): boolean =>
  op.kind === 'actor' && resolveActor(actor, op.path) === null

function bindOperand(op: Operand, actor: Actor): Operand {
  return op.kind === 'actor' ? { kind: 'value', value: resolveActor(actor, op.path) } : op
}

/**
 * Replace every actor reference with its literal value. Pure; returns a new tree.
 *
 * **Security rule: an actor value that is `null` never matches.** Without this rule,
 * `row.region.eq(actor.attrs.region)` for an actor whose region is `null` would compile to
 * `region IS NOT DISTINCT FROM NULL` and grant access to every record with a NULL region: a privilege
 * escalation. So, at bind time (before either execution path, keeping them identical):
 * - `eq(field, <null actor value>)` → `FALSE`; `ne(...)` → `TRUE` (still the exact negation);
 * - null actor values are dropped from `in` / `nin` lists;
 * - ordering and `contains` with a null operand are already `FALSE` by definition.
 * Literal `null`s written by the developer (`row.status.eq(null)`) keep their IS NULL meaning.
 */
export function bindActor(filter: Filter, actor: Actor): Filter {
  switch (filter.op) {
    case 'true':
    case 'false':
      return filter
    case 'and':
    case 'or':
      return { op: filter.op, args: filter.args.map((a) => bindActor(a, actor)) }
    case 'not':
      return { op: 'not', arg: bindActor(filter.arg, actor) }
    case 'in':
    case 'nin':
      return {
        ...filter,
        values: filter.values.filter((v) => !isNullActorRef(v, actor)).map((v) => bindOperand(v, actor)),
      }
    case 'isNull':
      return filter
    case 'eq':
    case 'ne':
      if (isNullActorRef(filter.value, actor)) return filter.op === 'eq' ? { op: 'false' } : { op: 'true' }
      return { ...filter, value: bindOperand(filter.value, actor) }
    default:
      return { ...filter, value: bindOperand(filter.value, actor) }
  }
}

function literal(op: Operand): Scalar {
  if (op.kind !== 'value') throw new PolicyTypeError('Unbound actor reference: call bindActor() first')
  return op.value
}

function checkValue(v: Scalar, type: ColumnType, where: string): void {
  if (!fitsType(v, type)) {
    throw new PolicyTypeError(`${where}: value ${JSON.stringify(v)} does not fit column type ${type}`)
  }
  // Postgres `text` cannot store U+0000; JS strings can. Reject so both paths agree (fail closed).
  if (typeof v === 'string' && v.includes('\u0000')) {
    throw new PolicyTypeError(`${where}: strings must not contain U+0000`)
  }
}

/**
 * Validate a BOUND filter against the schema. Throws {@link PolicyTypeError} or `SchemaError`.
 * Checks: every field exists; every literal fits the column type; ordering operators only on numbers;
 * `contains` only on text; no unbound actor references.
 */
export function validate(filter: Filter, schema: ModelSchema): void {
  switch (filter.op) {
    case 'true':
    case 'false':
      return
    case 'and':
    case 'or':
      for (const a of filter.args) validate(a, schema)
      return
    case 'not':
      validate(filter.arg, schema)
      return
    case 'isNull':
      resolveColumn(schema, filter.field.path)
      return
    case 'in':
    case 'nin': {
      const { column } = resolveColumn(schema, filter.field.path)
      for (const v of filter.values) checkValue(literal(v), column.type, `${filter.op}(${filter.field.path.join('.')})`)
      return
    }
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      const { column } = resolveColumn(schema, filter.field.path)
      if (column.type !== 'int4') {
        // Text ordering depends on collation (JS compares UTF-16 code units; Postgres uses the database
        // collation), so ordering operators are restricted to numeric columns.
        throw new PolicyTypeError(`${filter.op} is only allowed on numeric fields (got ${column.type})`)
      }
      checkValue(literal(filter.value), column.type, `${filter.op}(${filter.field.path.join('.')})`)
      return
    }
    case 'contains': {
      const { column } = resolveColumn(schema, filter.field.path)
      if (column.type !== 'text') throw new PolicyTypeError(`contains is only allowed on text fields`)
      checkValue(literal(filter.value), column.type, `contains(${filter.field.path.join('.')})`)
      return
    }
    case 'eq':
    case 'ne': {
      const { column } = resolveColumn(schema, filter.field.path)
      checkValue(literal(filter.value), column.type, `${filter.op}(${filter.field.path.join('.')})`)
      return
    }
  }
}
