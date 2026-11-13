/**
 * `definePolicy`: one rule set, two execution paths.
 *
 * - `can(actor, action, record)` → boolean, evaluated in memory (single-record checks).
 * - `filterFor(actor, action)`   → bound {@link Filter}; compile with `compileToSql` for list queries.
 *
 * Combination semantics (both paths):
 *
 *     result = (OR of matching allow rules) AND NOT (OR of matching deny rules)
 *
 * - **Deny-by-default:** no matching allow → `FALSE`.
 * - **Deny overrides allow.**
 * - A rule "matches" the actor when its `role` list is empty or shares a role with the actor; its `when`
 *   predicate then narrows WHICH records it covers (a rule without `when` covers all records).
 */
import { and, FALSE, type Filter, not, or, TRUE } from './ast.js'
import { type Actor, bindActor } from './bind.js'
import { type ActorProxy, createActorRefs, createRow, type ModelShape, type RowProxy } from './builder.js'
import { evaluate, type RecordValue } from './evaluate.js'
import type { ModelSchema } from './schema.js'
import type { Scalar } from './ast.js'

export interface RuleContext<S extends ModelShape, A extends { readonly [k: string]: Scalar }> {
  readonly actor: ActorProxy<A>
  readonly row: RowProxy<S>
}

export interface RuleOptions<S extends ModelShape, A extends { readonly [k: string]: Scalar }> {
  /** Actor must hold at least one of these roles. Omit for "any actor". */
  readonly role?: string | readonly string[]
  /** Structured, list-filterable condition on the record. */
  readonly when?: (ctx: RuleContext<S, A>) => Filter
  /**
   * Escape hatch: arbitrary JavaScript. Works for `can()`, but such a rule CANNOT be compiled to SQL, so
   * `filterFor()` throws {@link NotListFilterableError} when it applies. Use sparingly.
   */
  readonly check?: (ctx: { readonly actor: Actor; readonly record: RecordValue }) => boolean
}

interface Rule {
  readonly effect: 'allow' | 'deny'
  readonly action: string
  readonly roles: readonly string[]
  readonly when: Filter | undefined
  readonly check: ((ctx: { readonly actor: Actor; readonly record: RecordValue }) => boolean) | undefined
}

export class NotListFilterableError extends Error {
  override readonly name = 'NotListFilterableError'
}

export interface Policy {
  readonly resource: string
  can(actor: Actor, action: string, record: RecordValue): boolean
  filterFor(actor: Actor, action: string): Filter
}

export interface PolicyApi<S extends ModelShape, A extends { readonly [k: string]: Scalar }> {
  allow(action: string, options?: RuleOptions<S, A>): void
  deny(action: string, options?: RuleOptions<S, A>): void
}

export function definePolicy<S extends ModelShape, A extends { readonly [k: string]: Scalar } = Record<never, Scalar>>(
  resource: string,
  schema: ModelSchema,
  build: (api: PolicyApi<S, A>) => void,
): Policy {
  const rules: Rule[] = []
  const ctx: RuleContext<S, A> = { actor: createActorRefs<A>(), row: createRow<S>(schema) }

  const add = (effect: Rule['effect']) => (action: string, options: RuleOptions<S, A> = {}) => {
    const roles = options.role === undefined ? [] : typeof options.role === 'string' ? [options.role] : [...options.role]
    // `when` is evaluated ONCE against the reference proxies; the resulting AST is reused for every actor.
    rules.push({ effect, action, roles, when: options.when?.(ctx), check: options.check })
  }
  build({ allow: add('allow'), deny: add('deny') })

  const applicable = (actor: Actor, action: string) =>
    rules.filter((r) => r.action === action && (r.roles.length === 0 || r.roles.some((x) => actor.roles.includes(x))))

  const filterFor = (actor: Actor, action: string): Filter => {
    const matched = applicable(actor, action)
    const escape = matched.find((r) => r.check)
    if (escape) {
      throw new NotListFilterableError(
        `Policy "${resource}" action "${action}" has a check() rule that cannot be compiled to SQL`,
      )
    }
    const cover = (r: Rule): Filter => (r.when ? bindActor(r.when, actor) : TRUE)
    const allows = or(...matched.filter((r) => r.effect === 'allow').map(cover))
    const denies = or(...matched.filter((r) => r.effect === 'deny').map(cover))
    return allows.op === 'false' ? FALSE : and(allows, not(denies))
  }

  const can = (actor: Actor, action: string, record: RecordValue): boolean => {
    const matched = applicable(actor, action)
    if (!matched.some((r) => r.check)) {
      // Same code path as list queries: build the filter, then evaluate it.
      return evaluate(filterFor(actor, action), record, schema)
    }
    // Rule-by-rule evaluation when escape-hatch rules are present (logically identical combination).
    const covers = (r: Rule) =>
      (r.when ? evaluate(bindActor(r.when, actor), record, schema) : true) && (r.check ? r.check({ actor, record }) : true)
    const allowed = matched.some((r) => r.effect === 'allow' && covers(r))
    const denied = matched.some((r) => r.effect === 'deny' && covers(r))
    return allowed && !denied
  }

  return { resource, can, filterFor }
}
