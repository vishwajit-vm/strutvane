/**
 * Middleware: classes with a `handle(ctx, next, ...params)` method, referred to by alias strings
 * exactly like Laravel (`'auth'`, `'throttle:60,1'`), grouped into `web` and `api`.
 *
 * Every alias is resolved when the app is created, not when the first request arrives, so a typo
 * like `'auht'` fails `node strut route:list` and the test suite instead of production traffic.
 */
import { token, type Injectable } from '../foundation/container.ts'
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
    return sortByPriority(this.#expandGroups(references, where))
  }

  #expandGroups(references: readonly string[], where: string): MiddlewareReference[] {
    const expanded: MiddlewareReference[] = []
    for (const reference of references) {
      if (this.isGroup(reference)) {
        expanded.push(...this.#expandGroups(this.group(reference), `the "${reference}" group`))
        continue
      }
      const parsed = parseMiddleware(reference)
      if (this.#aliases.has(parsed.alias)) {
        expanded.push(parsed)
        continue
      }
      const suggestion = closestMatch(parsed.alias, this.aliasNames)
      throw new StrutvaneError(
        'UNKNOWN_MIDDLEWARE',
        `No middleware is called "${parsed.alias}" (used by ${where}).`,
        suggestion === undefined ? `Register it in bootstrap/app.ts: withMiddleware((m) => m.alias({ ${parsed.alias}: YourMiddleware })). Known: ${this.aliasNames.join(', ')}.` : `Did you mean "${suggestion}"?`,
      )
    }
    return expanded
  }
}

/**
 * Laravel's `$middlewarePriority`: whatever order routes and groups list them in, these run in
 * this order. It matters because the `api` group lists `throttle` before a route's `auth`, yet
 * throttling must see the signed-in user to give them their own bucket.
 */
const PRIORITY: readonly string[] = ['csrf', 'auth', 'throttle']

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
