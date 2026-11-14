/**
 * Middleware: classes with a `handle(ctx, next, ...params)` method, referred to by alias strings
 * exactly like Laravel (`'auth'`, `'throttle:60,1'`), grouped into `web` and `api`.
 *
 * Every alias is resolved when the app is created, not when the first request arrives, so a typo
 * like `'auht'` fails `node strut route:list` and the test suite instead of production traffic.
 */
import { token, type Container, type Injectable } from '../foundation/container.ts'
import type { AuthUser } from '../registry.ts'
import { SecuritySettings, type BodyLimitOptions, type CorsOptions, type CsrfOptions, type HeaderOptions, type TrustHostsOptions, type TrustProxiesOptions } from '../security/settings.ts'
import { StrutvaneError } from '../support/errors.ts'
import { closestMatch } from '../support/str.ts'
import type { HttpContext } from './context.ts'

/**
 * Call the rest of the pipeline (the next middleware, and finally the controller).
 *
 * @example
 * const response = await next()
 */
export type Next = () => Promise<Response>

/**
 * A middleware instance. `params` are the strings after the colon: `'throttle:60,1'` → `['60', '1']`.
 *
 * @example
 * class EnsureJson implements Middleware {
 *   async handle(ctx: HttpContext, next: Next): Promise<Response> {
 *     return ctx.wantsJson() ? next() : ctx.json({ error: 'JSON only' }, 406)
 *   }
 * }
 */
export interface Middleware {
  handle(ctx: HttpContext, next: Next, ...params: string[]): Promise<Response>
}

/**
 * A middleware class the container can build.
 *
 * @example
 * const alias: MiddlewareClass = EnsureJson
 */
export type MiddlewareClass = Injectable<Middleware>

/**
 * Build a middleware instance through the container (so its `static inject` list is honoured)
 * and check it really has a `handle` method, instead of trusting a cast.
 *
 * @example
 * const middleware = buildMiddleware(app.container, VerifyCsrfToken)
 */
export function buildMiddleware(container: Container, middlewareClass: MiddlewareClass): Middleware {
  const instance = container.build(middlewareClass)
  if (isMiddleware(instance)) return instance
  throw new StrutvaneError('NOT_MIDDLEWARE', `${middlewareClass.name} has no handle(ctx, next) method.`, 'A middleware class needs: async handle(ctx: HttpContext, next: Next): Promise<Response>.')
}

function isMiddleware(value: unknown): value is Middleware {
  return typeof value === 'object' && value !== null && 'handle' in value && typeof value.handle === 'function'
}

/**
 * A rate limiter definition, Laravel's `RateLimiter::for('api', …)`.
 *
 * @example
 * const api: LimiterDefinition = { maxAttempts: 60, decaySeconds: 60 }
 */
export interface LimiterDefinition {
  readonly maxAttempts: number
  readonly decaySeconds: number
  /** The bucket key. Defaults to the user id, then the client IP. */
  readonly by?: (ctx: HttpContext) => string
}

/**
 * A named ability for the `can:<ability>` middleware, Laravel's `Gate::define()`. It returns
 * `true` to allow; anything else denies (deny by default).
 *
 * @example
 * const viewStats: AbilityCheck = (user) => user !== null && hasAdminRole(user)
 */
export type AbilityCheck = (user: AuthUser | null, ctx: HttpContext) => boolean | Promise<boolean>

/**
 * A parsed middleware reference: `'throttle:60,1'` → `{ alias: 'throttle', params: ['60', '1'] }`.
 *
 * @example
 * parseMiddleware('throttle:60,1')
 */
export interface MiddlewareReference {
  readonly alias: string
  readonly params: readonly string[]
}

/**
 * Split an alias string into its name and parameters.
 *
 * @example
 * parseMiddleware('auth')          // { alias: 'auth', params: [] }
 * parseMiddleware('throttle:60,1') // { alias: 'throttle', params: ['60', '1'] }
 */
export function parseMiddleware(reference: string): MiddlewareReference {
  const colon = reference.indexOf(':')
  if (colon === -1) return { alias: reference, params: [] }
  return { alias: reference.slice(0, colon), params: reference.slice(colon + 1).split(',') }
}

/**
 * The object handed to `withMiddleware((middleware) => …)` in `bootstrap/app.ts`.
 *
 * @example
 * .withMiddleware((middleware) => {
 *   middleware.alias({ admin: EnsureAdmin })
 *   middleware.appendToGroup('api', 'throttle:api')
 *   middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
 * })
 */
export class MiddlewareConfig {
  readonly #aliases = new Map<string, MiddlewareClass>()
  readonly #groups = new Map<string, string[]>([
    ['web', []],
    ['api', []],
  ])
  readonly #limiters = new Map<string, LimiterDefinition>()
  readonly #abilities = new Map<string, AbilityCheck>()
  /** CSRF exceptions, trusted proxies and hosts, CORS, headers and body limits. */
  readonly security = new SecuritySettings()

  /**
   * App-wide CSRF exceptions and extra trusted origins, Laravel 11's `validateCsrfTokens()`.
   * Patterns are paths without the leading slash; `*` matches anything.
   *
   * @example
   * middleware.validateCsrfTokens({ except: ['webhooks/*'] })
   */
  validateCsrfTokens(options: CsrfOptions): this {
    this.security.csrf(options)
    return this
  }

  /**
   * Believe `X-Forwarded-For/-Proto/-Host` only from these proxies, Laravel's `trustProxies()`.
   *
   * @example
   * middleware.trustProxies({ at: ['10.0.0.0/8'] })
   */
  trustProxies(options: TrustProxiesOptions): this {
    this.security.trustProxies(options)
    return this
  }

  /**
   * Replace the Host allowlist, Laravel's `trustHosts()`.
   *
   * @example
   * middleware.trustHosts({ at: ['blog.example.com'], subdomains: true })
   */
  trustHosts(options: TrustHostsOptions): this {
    this.security.trustHosts(options)
    return this
  }

  /**
   * Turn CORS on for exact origins (off by default; `*` with credentials is refused at boot).
   *
   * @example
   * middleware.cors({ origins: ['https://app.example.com'], credentials: true })
   */
  cors(options: CorsOptions): this {
    this.security.cors(options)
    return this
  }

  /**
   * Adjust the security headers (CSP sources, HSTS, Permissions-Policy, Referrer-Policy).
   *
   * @example
   * middleware.securityHeaders({ csp: { 'img-src': ['https://images.example.com'] } })
   */
  securityHeaders(options: HeaderOptions): this {
    this.security.headers(options)
    return this
  }

  /**
   * Adjust request body limits (bytes, JSON depth, total JSON keys).
   *
   * @example
   * middleware.limits({ maxBytes: 5 * 1024 * 1024 })
   */
  limits(options: BodyLimitOptions): this {
    this.security.limits(options)
    return this
  }

  /**
   * Define a named ability for `can:<name>`.
   *
   * @example
   * middleware.defineAbility('view-stats', (user) => hasAdminRole(user))
   */
  defineAbility(name: string, check: AbilityCheck): this {
    this.#abilities.set(name, check)
    return this
  }

  /** A named ability, if defined. */
  ability(name: string): AbilityCheck | undefined {
    return this.#abilities.get(name)
  }

  /** Every ability name, for boot errors. */
  get abilityNames(): readonly string[] {
    return [...this.#abilities.keys()]
  }

  /**
   * Name middleware classes so routes can refer to them by string.
   *
   * @example
   * middleware.alias({ admin: EnsureAdmin })
   */
  alias(aliases: Readonly<Record<string, MiddlewareClass>>): this {
    for (const [name, middleware] of Object.entries(aliases)) this.#aliases.set(name, middleware)
    return this
  }

  /**
   * Add middleware to the end of a group (`web` or `api`, or a new one).
   *
   * @example
   * middleware.appendToGroup('api', 'throttle:api')
   */
  appendToGroup(group: string, ...references: string[]): this {
    this.#groups.set(group, [...(this.#groups.get(group) ?? []), ...references])
    return this
  }

  /**
   * Add middleware to the start of a group.
   *
   * @example
   * middleware.prependToGroup('web', 'secure-headers')
   */
  prependToGroup(group: string, ...references: string[]): this {
    this.#groups.set(group, [...references, ...(this.#groups.get(group) ?? [])])
    return this
  }

  /**
   * Define a named rate limiter for `throttle:<name>`.
   *
   * @example
   * middleware.rateLimiter('login', { maxAttempts: 5, decaySeconds: 60, by: (ctx) => ctx.ip })
   */
  rateLimiter(name: string, definition: LimiterDefinition): this {
    this.#limiters.set(name, definition)
    return this
  }

  /** The class behind an alias, if any. */
  resolveAlias(alias: string): MiddlewareClass | undefined {
    return this.#aliases.get(alias)
  }

  /** The references in a group (empty for unknown groups). */
  group(name: string): readonly string[] {
    return this.#groups.get(name) ?? []
  }

  /** `true` if `name` is a middleware group. */
  isGroup(name: string): boolean {
    return this.#groups.has(name)
  }

  /** A named limiter. */
  limiter(name: string): LimiterDefinition | undefined {
    return this.#limiters.get(name)
  }

  /** Every alias, for `about` and error hints. */
  get aliasNames(): readonly string[] {
    return [...this.#aliases.keys()]
  }

  /**
   * Expand groups into their members and check every alias exists. Throws a friendly error with
   * a "did you mean" for typos.
   *
   * @example
   * config.expand(['api', 'auth']) // [{ alias: 'throttle', params: ['api'] }, { alias: 'auth', params: [] }]
   */
  expand(references: readonly string[], where: string): MiddlewareReference[] {
    return sortByPriority(this.expandGroups(references, where))
  }

  /**
   * Expand groups and check aliases, keeping the listed order (no priority sort, no dedupe).
   *
   * @example
   * config.expandGroups(['web'], 'GET /') // [{ alias: 'csrf', params: [] }]
   */
  expandGroups(references: readonly string[], where: string): MiddlewareReference[] {
    const expanded: MiddlewareReference[] = []
    for (const reference of references) {
      if (this.isGroup(reference)) {
        expanded.push(...this.expandGroups(this.group(reference), `the "${reference}" group`))
        continue
      }
      const parsed = parseMiddleware(reference)
      if (this.#aliases.has(parsed.alias)) {
        expanded.push(parsed)
        continue
      }
      throw this.unknownAlias(parsed.alias, where)
    }
    return expanded
  }

  /**
   * The friendly error for an alias nobody registered, with a "did you mean".
   *
   * @example
   * throw config.unknownAlias('auht', 'GET /api/x')
   */
  unknownAlias(alias: string, where: string): StrutvaneError {
    const suggestion = closestMatch(alias, this.aliasNames)
    return new StrutvaneError(
      'UNKNOWN_MIDDLEWARE',
      `No middleware is called "${alias}" (used by ${where}).`,
      suggestion === undefined ? `Register it in bootstrap/app.ts: withMiddleware((m) => m.alias({ ${alias}: YourMiddleware })). Known: ${this.aliasNames.join(', ')}.` : `Did you mean "${suggestion}"?`,
    )
  }
}

/**
 * Laravel's `$middlewarePriority`: whatever order routes and groups list them in, these run in
 * this order. It matters because the `api` group lists `throttle` before a route's `auth`, yet
 * throttling must see the signed-in user to give them their own bucket. `signed` runs before
 * `auth` (a bad link is a 403 whoever you are), `can` needs the user, and `idempotent` runs
 * last so a replayed response is scoped to the user and never skips the checks before it.
 */
export const MIDDLEWARE_PRIORITY: readonly string[] = ['csrf', 'signed', 'auth', 'can', 'throttle', 'idempotent']
const PRIORITY = MIDDLEWARE_PRIORITY

/**
 * Reorder only the priority middleware among themselves, leaving every other entry in place.
 *
 * @example
 * sortByPriority([throttle, custom, auth]) // [auth, custom, throttle]
 */
export function sortByPriority(references: readonly MiddlewareReference[]): MiddlewareReference[] {
  const slots = references.flatMap((reference, index) => (PRIORITY.includes(reference.alias) ? [index] : []))
  const ordered = slots.map((index) => references[index]).filter((reference) => reference !== undefined).sort((a, b) => PRIORITY.indexOf(a.alias) - PRIORITY.indexOf(b.alias))
  const result = [...references]
  slots.forEach((slot, position) => {
    const reference = ordered[position]
    if (reference !== undefined) result[slot] = reference
  })
  return result
}

/**
 * The app's middleware configuration, bound at boot so middleware like `throttle` can read named
 * limiters.
 *
 * @example
 * app.make(MiddlewareConfigToken).limiter('api')
 */
export const MiddlewareConfigToken = token<MiddlewareConfig>('MiddlewareConfig')
