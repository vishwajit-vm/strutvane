/**
 * The `throttle` middleware: `throttle:60,1` (60 requests per minute) or `throttle:api` (a named
 * limiter from `withMiddleware`). Fixed windows, kept in memory.
 *
 * Why in memory: enough for one process and for the spike. A cluster needs a shared store
 * (database or Redis), which is a driver behind {@link RateLimitStore}.
 */
import { token } from '../foundation/container.ts'
import { ClockToken } from '../foundation/tokens.ts'
import { StrutvaneError } from '../support/errors.ts'
import type { HttpContext } from './context.ts'
import { MiddlewareConfigToken, type LimiterDefinition, type Middleware, type MiddlewareConfig, type Next } from './middleware.ts'
import { TooManyRequestsError } from './problem.ts'

/**
 * Counts hits per key in fixed windows.
 *
 * @example
 * const { count, resetAt } = store.hit('api:user:1', 60_000, now)
 */
export interface RateLimitStore {
  hit(key: string, windowMs: number, now: number): { readonly count: number; readonly resetAt: number }
}

/**
 * The default store: a `Map` of windows. Expired windows are replaced on the next hit, so memory
 * stays bounded by the number of active clients.
 *
 * @example
 * app.container.singleton(RateLimitStoreToken, () => new MemoryRateLimitStore())
 */
export class MemoryRateLimitStore implements RateLimitStore {
  readonly #windows = new Map<string, { count: number; resetAt: number }>()

  hit(key: string, windowMs: number, now: number): { readonly count: number; readonly resetAt: number } {
    const current = this.#windows.get(key)
    if (current === undefined || current.resetAt <= now) {
      const fresh = { count: 1, resetAt: now + windowMs }
      this.#windows.set(key, fresh)
      return fresh
    }
    current.count += 1
    return current
  }
}

/**
 * The container token for the rate limit store.
 *
 * @example
 * app.make(RateLimitStoreToken)
 */
export const RateLimitStoreToken = token<RateLimitStore>('RateLimitStore')

/**
 * The `throttle` middleware class.
 *
 * @example
 * Route.post('/login', [LoginController, 'store']).middleware('throttle:5,1')
 */
export class ThrottleRequests implements Middleware {
  static readonly inject = [MiddlewareConfigToken, RateLimitStoreToken, ClockToken] as const
  readonly #config: MiddlewareConfig
  readonly #store: RateLimitStore
  readonly #clock: () => Date

  constructor(config: MiddlewareConfig, store: RateLimitStore, clock: () => Date) {
    this.#config = config
    this.#store = store
    this.#clock = clock
  }

  async handle(ctx: HttpContext, next: Next, ...params: string[]): Promise<Response> {
    const { name, definition } = this.#limiterFor(params)
    const bucket = `${name}:${definition.by?.(ctx) ?? defaultKey(ctx)}`
    const now = this.#clock().getTime()
    const { count, resetAt } = this.#store.hit(bucket, definition.decaySeconds * 1000, now)
    const remaining = Math.max(0, definition.maxAttempts - count)
    const headers = { 'x-ratelimit-limit': String(definition.maxAttempts), 'x-ratelimit-remaining': String(remaining) }
    if (count > definition.maxAttempts) throw new TooManyRequestsError(Math.max(1, Math.ceil((resetAt - now) / 1000)), headers)
    const response = await next()
    // Copy before setting headers: responses built by `Response.json()` etc. can be immutable.
    const withHeaders = new Response(response.body, response)
    for (const [key, value] of Object.entries(headers)) withHeaders.headers.set(key, value)
    return withHeaders
  }

  #limiterFor(params: readonly string[]): { name: string; definition: LimiterDefinition } {
    const [first, second] = params
    if (first !== undefined && /^\d+$/.test(first)) {
      const minutes = second === undefined ? 1 : Number(second)
      return { name: `${first},${minutes}`, definition: { maxAttempts: Number(first), decaySeconds: minutes * 60 } }
    }
    const name = first ?? 'api'
    const definition = this.#config.limiter(name)
    if (definition !== undefined) return { name, definition }
    throw new StrutvaneError('UNKNOWN_RATE_LIMITER', `No rate limiter is called "${name}".`, `Define it in bootstrap/app.ts: withMiddleware((m) => m.rateLimiter('${name}', { maxAttempts: 60, decaySeconds: 60 })), or use numbers: throttle:60,1.`)
  }
}

/** Signed-in users get their own bucket; guests share one per IP (proxy headers aren't trusted). */
function defaultKey(ctx: HttpContext): string {
  return ctx.user === null ? `ip:${ipBucket(ctx.ip)}` : `user:${String(ctx.user.id)}`
}

/**
 * The rate-limit bucket for an address. IPv6 clients usually control a whole /64, so keying on
 * the full address would let them rotate past any limit (security review F-22).
 *
 * @example
 * ipBucket('2001:db8:1:2:3:4:5:6') // '2001:db8:1:2::/64'
 * ipBucket('203.0.113.7')          // '203.0.113.7'
 */
export function ipBucket(ip: string): string {
  if (!ip.includes(':')) return ip
  const [head = '', tail] = ip.split('::')
  const left = head === '' ? [] : head.split(':')
  const right = tail === undefined || tail === '' ? [] : tail.split(':')
  // Expand "::" so the first four groups are always the real /64 prefix.
  const groups = tail === undefined ? left : [...left, ...Array<string>(8 - left.length - right.length).fill('0'), ...right]
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`
}
