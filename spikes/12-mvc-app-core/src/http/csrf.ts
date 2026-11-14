/**
 * The `csrf` middleware, in both the `web` and the `api` groups (security review F-07).
 *
 * CSRF only matters when the browser attaches credentials by itself, which means a session
 * cookie. So the rule is: for every unsafe request (POST, PUT, PATCH, DELETE) that carries the
 * session cookie and no bearer token, the request must prove it comes from our own pages:
 *
 * 1. `Sec-Fetch-Site: same-origin`, or
 * 2. an `Origin` header exactly equal to `APP_URL`'s origin (never `null`, never a sibling
 *    subdomain), with no `Sec-Fetch-Site` saying otherwise, or
 * 3. a valid token in `X-CSRF-TOKEN` / `X-XSRF-TOKEN`: an HMAC of the session id under `APP_KEY`.
 *
 * Bearer-token requests skip the check: the browser never attaches a bearer header by itself,
 * and the guard never falls back to the cookie when a bearer header is present.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { ConfigToken } from '../foundation/tokens.ts'
import type { ConfigRepository } from '../foundation/config.ts'
import type { HttpContext } from './context.ts'
import type { Middleware, Next } from './middleware.ts'
import { HttpError } from './problem.ts'

/** The session cookie name (owned by the session layer of the auth package). */
export const SESSION_COOKIE = 'strutvane_session'

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * The CSRF token for a session: HMAC-SHA256 of the session id under a subkey of `APP_KEY`.
 * Bound to the session, so a token stolen from another session is useless.
 *
 * @example
 * csrfToken('session-id', appKey) // 'k1Yq…'
 */
export function csrfToken(sessionId: string, appKey: string): string {
  const subkey = createHmac('sha256', appKey).update('strutvane:csrf').digest()
  return createHmac('sha256', subkey).update(sessionId).digest('base64url')
}

/**
 * The `csrf` middleware class.
 *
 * @example
 * middleware.prependToGroup('web', 'csrf')
 */
export class VerifyCsrfToken implements Middleware {
  static readonly inject = [ConfigToken] as const
  readonly #config: ConfigRepository

  constructor(config: ConfigRepository) {
    this.#config = config
  }

  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    // Only *Bearer* skips the check: browsers attach Basic credentials automatically, Bearer never.
    if (SAFE_METHODS.has(ctx.method) || /^Bearer\s/i.test(ctx.request.headers.get('authorization') ?? '')) return next()
    const sessionId = readCookie(ctx.request.headers.get('cookie') ?? '', SESSION_COOKIE)
    if (sessionId === undefined) return next()
    if (this.#sameOrigin(ctx) || this.#validToken(ctx, sessionId)) return next()
    throw new HttpError(419, 'csrf_token_mismatch', 'Page expired', 'This request could not be verified as coming from this site. Reload the page and try again.', {
      hint: 'Send the X-CSRF-TOKEN header (csrfToken(sessionId, APP_KEY)) or make the request from the same origin as APP_URL.',
    })
  }

  #sameOrigin(ctx: HttpContext): boolean {
    const fetchSite = ctx.request.headers.get('sec-fetch-site')
    if (fetchSite === 'same-origin') return true
    // `same-site` (a sibling subdomain) and `cross-site` never pass on headers alone.
    if (fetchSite !== null && fetchSite !== 'none') return false
    const origin = ctx.request.headers.get('origin')
    if (origin === null || origin === 'null') return false
    return origin === new URL(String(this.#config.get('app.url'))).origin
  }

  #validToken(ctx: HttpContext, sessionId: string): boolean {
    const sent = ctx.request.headers.get('x-csrf-token') ?? ctx.request.headers.get('x-xsrf-token')
    if (sent === null) return false
    const expected = Buffer.from(csrfToken(sessionId, String(this.#config.get('app.key'))))
    const actual = Buffer.from(sent)
    // Constant-time comparison, so the token can't be guessed byte by byte from timings.
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

/**
 * One cookie's value from a `Cookie` header.
 *
 * @example
 * readCookie('a=1; strutvane_session=abc', 'strutvane_session') // 'abc'
 */
export function readCookie(header: string, name: string): string | undefined {
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}
