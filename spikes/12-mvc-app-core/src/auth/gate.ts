/**
 * Policies and the gate: Laravel's authorization, with one deliberate change. **A missing
 * policy method denies.** (Laravel's Filament allows an action when the method is missing; the
 * Laravel study flags that as a trap.)
 */
import { ForbiddenError } from '../http/problem.ts'
import type { AuthUser } from '../registry.ts'

/** What a policy method may return: allowed or not, now or later. */
export type PolicyResult = boolean | Promise<boolean>

/**
 * A policy for one model. Every method is optional, and an absent one means "deny".
 * `before` runs first; returning `true`/`false` decides, `undefined` falls through.
 *
 * @example
 * export class PostPolicy implements Policy<Post> {
 *   viewAny() { return true }
 *   update(user: AuthUser | null, post: Post) { return user?.id === post.author_id }
 * }
 */
export interface Policy<TModel> {
  before?(user: AuthUser | null, ability: Ability): boolean | undefined
  viewAny?(user: AuthUser | null): PolicyResult
  view?(user: AuthUser | null, model: TModel): PolicyResult
  create?(user: AuthUser | null): PolicyResult
  update?(user: AuthUser | null, model: TModel): PolicyResult
  delete?(user: AuthUser | null, model: TModel): PolicyResult
}

/**
 * The abilities `ResourceController` checks, Laravel's policy vocabulary.
 *
 * @example
 * const ability: Ability = 'update'
 */
export type Ability = 'viewAny' | 'view' | 'create' | 'update' | 'delete'

/**
 * `true` when the user is an admin: an `is_admin` flag set to true, or `'admin'` in a `roles`
 * list. Generated policies use it in `before()`; apps with a real role system replace it.
 *
 * @example
 * hasAdminRole({ id: 1, is_admin: true }) // true
 */
export function hasAdminRole(user: AuthUser | null): boolean {
  if (user === null) return false
  if ('is_admin' in user && user.is_admin === true) return true
  return 'roles' in user && Array.isArray(user.roles) && user.roles.includes('admin')
}

/** Abilities that act on one record (the others act on the collection). */
const RECORD_ABILITIES: ReadonlySet<Ability> = new Set(['view', 'update', 'delete'])

/**
 * Decide an ability. Returns `true` only when a policy method exists and says yes.
 *
 * @example
 * await allows(new PostPolicy(), 'update', user, post) // false for someone else's post
 */
export async function allows<TModel>(policy: Policy<TModel>, ability: Ability, user: AuthUser | null, model?: TModel): Promise<boolean> {
  const early = policy.before?.(user, ability)
  if (early !== undefined) return early
  const method = policy[ability]
  if (method === undefined) return false
  if (RECORD_ABILITIES.has(ability)) {
    // A record ability without a record is a programming error, never a reason to allow.
    if (model === undefined) return false
    return (await (method as (user: AuthUser | null, model: TModel) => PolicyResult).call(policy, user, model)) === true
  }
  return (await (method as (user: AuthUser | null) => PolicyResult).call(policy, user)) === true
}

/**
 * Like {@link allows}, but throws a 403 with a friendly message (and, in debug mode, a hint
 * naming the missing policy method). Laravel's `$this->authorize()`.
 *
 * @example
 * await authorize(new PostPolicy(), 'delete', ctx.user, post, 'post')
 */
export async function authorize<TModel>(policy: Policy<TModel>, ability: Ability, user: AuthUser | null, model: TModel | undefined, label: string): Promise<void> {
  if (await allows(policy, ability, user, model)) return
  const policyName = policy.constructor.name
  const hint =
    policy[ability] === undefined
      ? `${policyName} has no ${ability}() method, so this is denied (Strutvane denies by default). Add ${ability}(user${RECORD_ABILITIES.has(ability) ? `, ${label}` : ''}) to the policy to allow it.`
      : `${policyName}.${ability}() returned false for this user.`
  throw new ForbiddenError(`You are not allowed to ${describeAbility(ability, label)}.`, hint)
}

function describeAbility(ability: Ability, label: string): string {
  switch (ability) {
    case 'viewAny':
      return `list ${label} records`
    case 'view':
      return `view this ${label}`
    case 'create':
      return `create a ${label}`
    case 'update':
      return `update this ${label}`
    case 'delete':
      return `delete this ${label}`
  }
}
