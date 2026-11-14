/**
 * CSRF settings: the app-wide exceptions from `validateCsrfTokens({ except })` and the origins
 * whose `Origin` header counts as "our own pages".
 *
 * Why exceptions are path patterns and not route names: webhooks are the usual reason for an
 * exception, and providers document their callback *paths*. Laravel uses the same format.
 */
import { failIfAny } from './setting-error.ts'
import type { SecurityEnvironment } from './settings.ts'

/**
 * Options for `validateCsrfTokens()`.
 *
 * @example
 * const options: CsrfOptions = { except: ['webhooks/*'], origins: ['https://admin.example.com'] }
 */
export interface CsrfOptions {
  /** Paths without the leading slash; `*` matches anything, including slashes. */
  readonly except?: readonly string[]
  /** Extra origins (scheme://host[:port]) trusted like APP_URL's. Never `null`, never `*`. */
  readonly origins?: readonly string[]
}

/**
 * The checked CSRF settings.
 *
 * @example
 * const csrf: ResolvedCsrf = { except: ['webhooks/*'], origins: ['http://localhost'] }
 */
export interface ResolvedCsrf {
  readonly except: readonly string[]
  /** APP_URL's origin first, then the extra trusted origins, all normalised. */
  readonly origins: readonly string[]
}

/**
 * Validate CSRF options. A pattern must be a non-empty path pattern; an origin must be exactly an
 * http(s) origin. `null` and `*` are refused, because either would accept any page.
 *
 * @example
 * resolveCsrf({ except: ['webhooks/*'] }, { appUrl: 'http://localhost', environment: 'local' })
 */
export function resolveCsrf(options: CsrfOptions, where: SecurityEnvironment): ResolvedCsrf {
  const problems: string[] = []
  for (const pattern of options.except ?? []) {
    if (pattern.trim() === '' || /\s/.test(pattern)) problems.push(`csrf except: "${pattern}" is not a path pattern (use something like "webhooks/*").`)
  }
  const origins = [new URL(where.appUrl).origin]
  for (const origin of options.origins ?? []) {
    const normalised = exactOrigin(origin)
    if (normalised === undefined) problems.push(`csrf origins: "${origin}" must be an exact origin such as https://admin.example.com (no path, no "*", never "null").`)
    else origins.push(normalised)
  }
  failIfAny(problems)
  return { except: (options.except ?? []).map((pattern) => pattern.replace(/^\/+/, '')), origins }
}

/**
 * The normalised origin of `value`, or `undefined` unless it is exactly `scheme://host[:port]`
 * over http or https.
 *
 * @example
 * exactOrigin('https://Admin.Example.com') // 'https://admin.example.com'
 * exactOrigin('https://example.com/path')  // undefined
 */
export function exactOrigin(value: string): string | undefined {
  if (!URL.canParse(value)) return undefined
  const url = new URL(value)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  // A path, query or credentials mean the author meant something narrower than an origin; refuse
  // rather than silently widen it to the whole origin.
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') return undefined
  return url.origin
}

/**
 * Does a request path match a Laravel-style pattern? Leading slashes are ignored and `*`
 * matches any run of characters (slashes included).
 *
 * @example
 * matchesPathPattern('webhooks/*', '/webhooks/stripe') // true
 * matchesPathPattern('webhooks', '/webhooks/stripe')   // false
 */
export function matchesPathPattern(pattern: string, path: string): boolean {
  const source = pattern
    .replace(/^\/+/, '')
    .split('*')
    .map((piece) => piece.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${source}$`).test(path.replace(/^\/+/, ''))
}
