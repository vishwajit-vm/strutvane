/**
 * The `can` middleware: `can:view-stats` runs the named ability defined with
 * `withMiddleware((m) => m.defineAbility('view-stats', (user) => …))`, Laravel's `can:` middleware
 * over `Gate::define()`.
 *
 * Abilities on a *record* (update this post) stay in the controller with `authorize(policy, …)`,
 * because route model binding runs after middleware: a guest must get its 401 or 403 before
 * learning whether the record exists.
 */
import { ForbiddenError } from './problem.ts'
import type { HttpContext } from './context.ts'
import { MiddlewareConfigToken, type Middleware, type MiddlewareConfig, type Next } from './middleware.ts'
import { StrutvaneError } from '../support/errors.ts'

/**
 * The `can` middleware class.
 *
 * @example
 * Route.get('/admin/stats', [StatsController, 'show']).middleware('auth', 'can:view-stats')
 */
export class Authorize implements Middleware {
  static readonly inject = [MiddlewareConfigToken] as const
  readonly #config: MiddlewareConfig

  constructor(config: MiddlewareConfig) {
    this.#config = config
  }

  async handle(ctx: HttpContext, next: Next, ability?: string): Promise<Response> {
    const check = ability === undefined ? undefined : this.#config.ability(ability)
    // Boot already refuses unknown abilities; this guards the imperative style (can.verify).
    if (ability === undefined || check === undefined) {
      throw new StrutvaneError('UNKNOWN_ABILITY', `can:${ability ?? ''} names no ability.`, `Define it in bootstrap/app.ts: withMiddleware((m) => m.defineAbility('${ability ?? 'name'}', (user) => …)).`)
    }
    // Only a literal `true` allows: a check that returns a truthy object or a string denies.
    if ((await check(ctx.user, ctx)) !== true) throw new ForbiddenError('You are not allowed to do this.', `The "${ability}" ability denied this request.`)
    return next()
  }
}
