/**
 * The two things every aggregate is limited by before it runs: the **tenant** and the **policy**.
 *
 * This is a small stand-in for spike 11's ORM with the same rules, so the product can swap it for
 * `Model.query()` scopes without changing behaviour:
 * - the active tenant travels in AsyncLocalStorage (`runWithTenant`, set once per request by the
 *   HTTP layer); nothing in a controller passes tenant ids around;
 * - every table is `scoped` (has the tenant column), `global` (flagged in its migration) or
 *   `unscopable` (neither), and unscopable tables are **refused** when tenancy is on (F-04);
 * - a scoped table without an active tenant is refused (`TENANT_REQUIRED`, 403);
 * - the policy's `viewAny` must allow the actor (deny by default: no policy, no numbers), and its
 *   optional `scope` adds row conditions, the same rows the list endpoint would show.
 *
 * @module
 */
import { AsyncLocalStorage } from 'node:async_hooks'
import type { ResourceMetadata } from '../shared/metadata.ts'
import { parseValue } from './validate.ts'
import type { Condition, TypedValue } from './plan.ts'
import type { QueryScope } from './sql.ts'

const tenantStorage = new AsyncLocalStorage<string>()
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * A scope problem, with the HTTP status the endpoint answers and a stable code.
 *
 * @example
 * throw new ScopeError(403, 'TENANT_REQUIRED', 'Pick a team first.')
 */
export class ScopeError extends Error {
  override readonly name = 'ScopeError'
  readonly status: 403 | 500
  readonly code: 'TENANT_REQUIRED' | 'UNSCOPABLE_TABLE' | 'FORBIDDEN' | 'INVALID_TENANT_ID' | 'INVALID_POLICY_SCOPE'

  constructor(status: ScopeError['status'], code: ScopeError['code'], message: string) {
    super(message)
    this.status = status
    this.code = code
  }
}

/**
 * Run `fn` as tenant `tenantId` (a UUID, ADR-0007 rule 5), exactly like spike 11's helper.
 *
 * @example
 * await runWithTenant(acme.id, () => handler(request))
 */
export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  if (!UUID.test(tenantId)) throw new ScopeError(500, 'INVALID_TENANT_ID', `"${tenantId}" is not a valid tenant id. Tenant ids are UUIDs.`)
  return tenantStorage.run(tenantId.toLowerCase(), fn)
}

/**
 * The active tenant id, or `undefined` outside {@link runWithTenant}.
 *
 * @example
 * currentTenant() // '0190…' inside runWithTenant
 */
export function currentTenant(): string | undefined {
  return tenantStorage.getStore()
}

/**
 * The signed-in user, as far as policies need to know.
 *
 * @example
 * const actor: Actor = { id: '7', roles: ['admin'] }
 */
export interface Actor {
  readonly id: string
  readonly roles: readonly string[]
}

/**
 * One row condition a policy adds: "only rows where `field` is (one of) `value`".
 *
 * @example
 * const own: PolicyCondition = { field: 'owner_id', value: actor.id } // "only my rows"
 */
export interface PolicyCondition {
  readonly field: string
  readonly value: string | readonly string[]
}

/**
 * The part of a resource policy charts use (spike 12's `Policy<Model>` has the same `viewAny`).
 *
 * @example
 * const invoicePolicy: ChartsPolicy = {
 *   viewAny: (actor) => actor !== null && actor.roles.includes('finance'),
 *   scope: (actor) => (actor.roles.includes('admin') ? [] : [{ field: 'owner_id', value: actor.id }]),
 * }
 */
export interface ChartsPolicy {
  viewAny(actor: Actor | null): boolean
  /** Row conditions for this actor (none = every row of the tenant). */
  scope?(actor: Actor): readonly PolicyCondition[]
}

/**
 * Tenancy settings: the app's one tenant column, or `false` for single-tenant apps.
 *
 * @example
 * const tenancy: TenancyConfig = { column: 'tenant_id' }
 */
export type TenancyConfig = { readonly column: string } | false

/**
 * Build the tenant and policy scope for one request, or throw a {@link ScopeError}.
 *
 * @example
 * const scope = buildScope(invoices, invoicePolicy, actor, { column: 'tenant_id' }, currentTenant())
 */
export function buildScope(resource: ResourceMetadata, policy: ChartsPolicy | undefined, actor: Actor | null, tenancy: TenancyConfig, tenant: string | undefined): QueryScope {
  // Deny by default: a resource without a policy shows no numbers to anyone.
  if (policy === undefined || !policy.viewAny(actor)) {
    throw new ScopeError(403, 'FORBIDDEN', `You may not view ${resource.label.plural.toLowerCase()}.`)
  }
  // A row scope needs someone to scope to. Guests never fall through to "all rows".
  if (actor === null && policy.scope !== undefined) {
    throw new ScopeError(403, 'FORBIDDEN', `Sign in to view ${resource.label.plural.toLowerCase()}.`)
  }
  const tenantScope = tenantCondition(resource, tenancy, tenant)
  const policyConditions = actor === null || policy.scope === undefined ? [] : policy.scope(actor).map((condition) => policyCondition(resource, condition))
  return {
    conditions: [...(tenantScope === null ? [] : [tenantScope.condition]), ...policyConditions],
    tenant: tenantScope === null ? null : { column: tenantScope.condition.column, id: tenantScope.condition.tenant },
  }
}

/** The tenant condition for a scoped table, `null` for global tables, or a refusal. */
function tenantCondition(resource: ResourceMetadata, tenancy: TenancyConfig, tenant: string | undefined): { readonly condition: Extract<Condition, { kind: 'tenant' }> } | null {
  if (tenancy === false) return null
  const scoped = resource.fields.some((field) => field.name === tenancy.column)
  if (!scoped && resource.global === true) return null
  if (!scoped) {
    throw new ScopeError(
      500,
      'UNSCOPABLE_TABLE',
      `"${resource.table}" has no ${tenancy.column} column and is not marked global, so its rows can't be limited to one tenant. Add t.tenant() to its migration, or create it with { global: true } if it really is shared.`,
    )
  }
  if (tenant === undefined) throw new ScopeError(403, 'TENANT_REQUIRED', `${resource.label.plural} belong to a team. Choose a team first.`)
  return { condition: { kind: 'tenant', column: tenancy.column, tenant } }
}

/** A policy condition, checked like a filter (the field must exist; values parse for its type). */
function policyCondition(resource: ResourceMetadata, condition: PolicyCondition): Condition {
  const field = resource.fields.find((candidate) => candidate.name === condition.field)
  const raw = typeof condition.value === 'string' ? [condition.value] : condition.value
  const values = field === undefined ? [] : raw.map((value) => parseValue(field, value))
  if (field === undefined || values.length === 0 || !values.every((value): value is TypedValue => value !== undefined)) {
    // A broken policy must not widen access: refuse the request instead of dropping the condition.
    throw new ScopeError(500, 'INVALID_POLICY_SCOPE', `The ${resource.table} policy scopes on "${condition.field}" with a value that doesn't fit the column. Fix the policy's scope().`)
  }
  return { kind: 'in', column: field.name, values }
}
