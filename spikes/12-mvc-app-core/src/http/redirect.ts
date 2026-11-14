/**
 * Redirect responses, Laravel's `redirect()`, with the open-redirect guard built in:
 *
 * - `redirect().intended(ctx, '/dashboard')` goes to the page the user wanted, **only** if that is
 *   a same-origin path; anything else falls back silently.
 * - `redirect().to('/posts')` is for your own paths and refuses anything else loudly (a bug).
 * - `redirect().away('https://partner.example')` is the one explicit way off-site.
 */
import { currentApplication } from '../foundation/context.ts'
import { safeRedirectPath } from '../security/redirect.ts'
import { StrutvaneError } from '../support/errors.ts'
import type { HttpContext } from './context.ts'

/** The query parameter `intended()` reads until the session layer stores the intended URL. */
export const INTENDED_PARAMETER = 'intended'

/**
 * Builds redirect responses for one app URL.
 *
 * @example
 * return new Redirector('https://blog.example.com').intended(ctx, '/dashboard')
 */
export class Redirector {
  readonly #appUrl: string

  constructor(appUrl: string) {
    this.#appUrl = appUrl
  }

  /**
   * Redirect to one of your own paths. Throws for anything that could leave the site.
   *
   * @example
   * return redirect().to('/posts', 303)
   */
  to(path: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    const safe = safeRedirectPath(path, this.#appUrl)
    if (safe === undefined) throw new StrutvaneError('UNSAFE_REDIRECT', `redirect().to() was given "${path}", which is not a same-origin path.`, 'Use redirect().away(url) for a deliberate external redirect.')
    return location(safe, status)
  }

  /**
   * Redirect to where the user was going (the `intended` value), or `fallback` when there is
   * none or it isn't a same-origin path.
   *
   * @example
   * return redirect().intended(ctx, '/dashboard')
   */
  intended(ctx: HttpContext, fallback = '/'): Response {
    const candidate = ctx.query.get(INTENDED_PARAMETER)
    const safe = candidate === null ? undefined : safeRedirectPath(candidate, this.#appUrl)
    return this.to(safe ?? fallback)
  }

  /**
   * A deliberate redirect to another site (http or https only).
   *
   * @example
   * return redirect().away('https://billing.example.com/portal')
   */
  away(url: string, status: 301 | 302 | 303 | 307 | 308 = 302): Response {
    const target = URL.canParse(url) ? new URL(url) : undefined
    if (target === undefined || (target.protocol !== 'https:' && target.protocol !== 'http:')) {
      throw new StrutvaneError('UNSAFE_REDIRECT', `redirect().away() needs an absolute http(s) URL, got "${url}".`, 'Pass a full URL such as https://example.com/page.')
    }
    return location(target.href, status)
  }
}

function location(target: string, status: number): Response {
  return new Response(null, { status, headers: { location: target } })
}

/**
 * A redirector for the current app.
 *
 * @example
 * return redirect().intended(ctx, '/dashboard')
 */
export function redirect(): Redirector {
  return new Redirector(String(currentApplication('redirect()').config.get('app.url')))
}
