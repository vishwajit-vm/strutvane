/**
 * The framework's protections, each usable in every style (see `protection.ts`): app-wide, per
 * route, per group, per controller, as a handler wrapper, and imperatively.
 *
 * ```ts
 * static readonly middleware = [auth({ except: ['index'] }), csrf({ except: ['callback'] })]
 * export default withCsrf(async (ctx) => ctx.json({ ok: true }))
 * await csrf.verify(ctx)
 * ```
 */
import { Authenticate } from '../auth/authenticate.ts'
import { Authorize } from './authorize.ts'
import { csrfTokenFor, VerifyCsrfToken } from './csrf.ts'
import type { HttpContext } from './context.ts'
import { defineProtection, type Protection } from './protection.ts'
import { EnsureIdempotency } from './idempotency.ts'
import { ValidateSignature } from './signed.ts'
import { ThrottleRequests } from './throttle.ts'

/**
 * The CSRF protection, plus `csrf.token(ctx)` for forms, meta tags and SPA bootstraps.
 *
 * @example
 * static readonly middleware = [csrf({ except: ['callback'] })]
 * const token = csrf.token(ctx)
 */
export const csrf: Protection & { token(ctx: HttpContext): string } = Object.assign(defineProtection('csrf', VerifyCsrfToken), { token: csrfTokenFor })

/**
 * Wrap a handler so unsafe cookie requests must prove they come from our pages.
 *
 * @example
 * export default withCsrf(async (ctx) => ctx.json({ imported: true }))
 */
export const withCsrf = csrf.wrap

/**
 * The `auth` protection (`auth` or `auth:optional`).
 *
 * @example
 * static readonly middleware = [auth({ except: ['index', 'show'] })]
 */
export const auth: Protection = defineProtection('auth', Authenticate)

/**
 * Wrap a handler so it needs a signed-in user.
 *
 * @example
 * export default withAuth(async (ctx) => ctx.json({ me: ctx.requireUser() }))
 */
export const withAuth = auth.wrap

/**
 * The `can` protection: a named ability from `defineAbility()`.
 *
 * @example
 * static readonly middleware = [can({ params: ['view-stats'] })]
 */
export const can: Protection = defineProtection('can', Authorize)

/**
 * Wrap a handler so it needs an ability: `withCan(handler, 'view-stats')`.
 *
 * @example
 * export default withCan(async (ctx) => ctx.json(stats), 'view-stats')
 */
export const withCan = can.wrap

/**
 * The `throttle` protection: `throttle({ params: ['10', '1'] })` is `throttle:10,1`.
 *
 * @example
 * static readonly middleware = [throttle({ params: ['login'], only: ['store'] })]
 */
export const throttle: Protection = defineProtection('throttle', ThrottleRequests)

/**
 * Wrap a handler with a rate limit: `withThrottle(handler, '10', '1')`.
 *
 * @example
 * export default withThrottle(async (ctx) => ctx.json({ sent: true }), '5', '1')
 */
export const withThrottle = throttle.wrap

/**
 * The `signed` protection: the URL must carry a valid (and unexpired) signature.
 *
 * @example
 * static readonly middleware = [signed({ only: ['download'] })]
 */
export const signed: Protection = defineProtection('signed', ValidateSignature)

/**
 * Wrap a handler so only signed links reach it.
 *
 * @example
 * export default withSigned(async (ctx) => ctx.json({ unsubscribed: true }))
 */
export const withSigned = signed.wrap

/**
 * The `idempotent` protection: retries with the same `Idempotency-Key` replay the first response.
 *
 * @example
 * static readonly middleware = [idempotent({ only: ['store'] })]
 */
export const idempotent: Protection = defineProtection('idempotent', EnsureIdempotency)

/**
 * Wrap a handler so it runs at most once per idempotency key.
 *
 * @example
 * export default withIdempotency(async (ctx) => ctx.json(await charge(ctx), 201))
 */
export const withIdempotency = idempotent.wrap
