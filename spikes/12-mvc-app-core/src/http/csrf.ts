/**
 * The `csrf` middleware, in both the `web` and the `api` groups (security review F-07).
 *
 * CSRF only matters when the browser attaches credentials by itself, which means a session
 * cookie. So the rule is: for every unsafe request (POST, PUT, PATCH, DELETE) that carries the
 * session cookie and no bearer token, the request must prove it comes from our own pages:
 *
 * 1. `Sec-Fetch-Site: same-origin`, or
 * 2. an `Origin` header exactly equal to `APP_URL`'s origin or a configured trusted origin (never
 *    `null`, never a sibling subdomain), with no `Sec-Fetch-Site` saying otherwise, or
 * 3. a valid token in `X-CSRF-TOKEN` / `X-XSRF-TOKEN`, or in a urlencoded form's `_token` field:
 *    an HMAC of the session id under `APP_KEY`.
 *
 * `Referer` is never used: it is often stripped, and a same-site page can shape it.
 * Bearer-token requests skip the check: the browser never attaches a bearer header by itself,
 * and `ctx.sessionId()` ignores the cookie whenever a bearer header is present.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { currentApplication } from '../foundation/context.ts'
import { ConfigToken } from '../foundation/tokens.ts'
import type { ConfigRepository } from '../foundation/config.ts'
import { matchesPathPattern } from '../security/csrf-settings.ts'
import { SecurityToken, type ResolvedSecurity } from '../security/settings.ts'
import { StrutvaneError } from '../support/errors.ts'
import { readLimitedText, SESSION_COOKIE, type HttpContext } from './context.ts'
import type { Middleware, Next } from './middleware.ts'
import { HttpError } from './problem.ts'

export { readCookie } from './context.ts'
export { SESSION_COOKIE }

const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

/** Forms are small; a `_token` lookup never buffers more than this. */
const FORM_TOKEN_READ_LIMIT = 64 * 1024

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
 * The CSRF token for the current request's session, for forms, meta tags and SPA bootstraps.
 * Throws when there is no session yet, because a token bound to nothing would protect nothing.
 *
 * @example
 * const token = csrfTokenFor(ctx)
 */
export function csrfTokenFor(ctx: HttpContext): string {
  const sessionId = ctx.sessionId()
  if (sessionId === undefined) {
    throw new StrutvaneError(
      'NO_SESSION_FOR_CSRF',
      'There is no session on this request, so there is no CSRF token to give out.',
      'Start the session first (the auth package does it at login). Pre-session tokens for /login and /register belong to the session layer.',
    )
  }
  return csrfToken(sessionId, String(currentApplication('csrf.token()').config.get('app.key')))
}

/**
 * The `csrf` middleware class.
 *
 * @example
 * middleware.prependToGroup('web', 'csrf')
 */
export class VerifyCsrfToken implements Middleware {
  static readonly inject = [ConfigToken, SecurityToken] as const
  readonly #config: ConfigRepository
  readonly #security: ResolvedSecurity

  constructor(config: ConfigRepository, security: ResolvedSecurity) {
    this.#config = config
    this.#security = security
  }

  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    if (SAFE_METHODS.has(ctx.method) || ctx.state.skipCsrf) return next()
    const sessionId = ctx.sessionId()
    // No session cookie (or a bearer request): the browser attached nothing, so nothing to forge.
    if (sessionId === undefined) return next()
    if (this.#excepted(ctx) || this.#sameOrigin(ctx) || (await this.#validToken(ctx, sessionId))) return next()
    throw new HttpError(419, 'csrf_token_mismatch', 'Page expired', 'This request could not be verified as coming from this site. Reload the page and try again.', {
      hint: 'Send the X-CSRF-TOKEN header (csrf.token(ctx)), a _token form field (csrf_field(ctx)), or make the request from the same origin as APP_URL.',
    })
  }

  #excepted(ctx: HttpContext): boolean {
    return this.#security.csrf.except.some((pattern) => matchesPathPattern(pattern, ctx.url.pathname))
  }

  #sameOrigin(ctx: HttpContext): boolean {
    const fetchSite = ctx.request.headers.get('sec-fetch-site')
    if (fetchSite === 'same-origin') return true
    // `same-site` (a sibling subdomain) and `cross-site` never pass on headers alone.
    if (fetchSite !== null && fetchSite !== 'none') return false
    const origin = ctx.request.headers.get('origin')
    if (origin === null || origin === 'null') return false
    return this.#security.csrf.origins.includes(origin)
  }

  async #validToken(ctx: HttpContext, sessionId: string): Promise<boolean> {
    const sent = ctx.request.headers.get('x-csrf-token') ?? ctx.request.headers.get('x-xsrf-token') ?? (await formToken(ctx.request))
    if (sent === undefined) return false
    const expected = Buffer.from(csrfToken(sessionId, String(this.#config.get('app.key'))))
    const actual = Buffer.from(sent)
    // Constant-time comparison, so the token can't be guessed byte by byte from timings.
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
}

/**
 * The `_token` field of a urlencoded form body, read from a clone (the controller can still read
 * the body) and capped in size. Multipart bodies use the header instead.
 */
async function formToken(request: Request): Promise<string | undefined> {
  const essence = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase()
  if (essence !== 'application/x-www-form-urlencoded' || request.body === null) return undefined
  try {
    return new URLSearchParams(await readLimitedText(request.clone(), FORM_TOKEN_READ_LIMIT)).get('_token') ?? undefined
  } catch {
    // Too big to be a real form: treat as "no token" (the request is then refused).
    return undefined
  }
}
