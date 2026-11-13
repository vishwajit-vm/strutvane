/**
 * Mirrors @strutvane/contracts v0 (packages/contracts/src/actor.ts and tenancy.ts).
 *
 * Copied, not imported, because spikes are standalone and must never depend on real packages.
 * If these drift from the real contracts, the real contracts win.
 *
 * @module
 */

/** The kind of principal making a request. */
export type ActorType = 'user' | 'service' | 'system'

/** `"<resource>.<action>"`, `"<resource>.*"` or `"*"`. */
export type Permission = `${string}.${string}` | '*'

/** The authenticated principal making the current request. */
export interface Actor {
  readonly id: string
  readonly type: ActorType
  readonly tenantId?: string
  readonly roles: readonly string[]
  readonly permissions?: readonly Permission[]
  readonly attrs: Readonly<Record<string, unknown>>
}

/** How tenant data is isolated. */
export type TenantStrategy = 'shared' | 'schema' | 'database'

/** The resolved tenant for the current request. */
export interface TenantContext {
  readonly id: string
  readonly strategy: TenantStrategy
  readonly connection?: string
  readonly region?: string
}
