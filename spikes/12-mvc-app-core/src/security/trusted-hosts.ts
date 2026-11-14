/**
 * Trusted hosts: requests whose `Host` (or trusted `X-Forwarded-Host`) isn't on the allowlist get
 * a 400 before any app code runs.
 *
 * Why it's on by default: any code that builds a URL from the request's host (a password-reset
 * link, a redirect, a cache key) can be poisoned by `Host: evil.example`, and DNS rebinding lets a
 * website the developer visits talk to `localhost` under its own host name (security review F-19).
 * The default allowlist is APP_URL's host, plus the loopback names in local and testing.
 */
import { failIfAny } from './setting-error.ts'
import type { SecurityEnvironment } from './settings.ts'

/**
 * Options for `withMiddleware((m) => m.trustHosts({ … }))`. Replaces the default list.
 *
 * @example
 * const options: TrustHostsOptions = { at: ['blog.example.com'], subdomains: true }
 */
export interface TrustHostsOptions {
  /** Host names, or `*.example.com` for any subdomain. */
  readonly at: readonly string[]
  /** Also allow every subdomain of each listed host. */
  readonly subdomains?: boolean
}

/**
 * The checked allowlist.
 *
 * @example
 * const hosts: ResolvedHosts = { patterns: ['localhost'], configured: false }
 */
export interface ResolvedHosts {
  readonly patterns: readonly string[]
  /** `true` when the app set its own list (shown by `security:check`). */
  readonly configured: boolean
}

const HOST_PATTERN = /^(\*\.)?([a-z0-9-]+\.)*[a-z0-9-]+$|^\[[0-9a-f:.]+\]$/

const LOOPBACK = ['localhost', '127.0.0.1', '[::1]']

/**
 * Validate the allowlist and fill in the default.
 *
 * @example
 * resolveTrustedHosts(undefined, { appUrl: 'https://blog.example.com', environment: 'production' }) // ['blog.example.com']
 */
export function resolveTrustedHosts(options: TrustHostsOptions | undefined, where: SecurityEnvironment): ResolvedHosts {
  const appHost = new URL(where.appUrl).hostname.toLowerCase()
  if (options === undefined) {
    const local = where.environment === 'local' || where.environment === 'testing'
    return { patterns: [...new Set([appHost, ...(local ? LOOPBACK : [])])], configured: false }
  }
  const problems: string[] = []
  const patterns: string[] = []
  for (const entry of options.at) {
    const host = entry.trim().toLowerCase().replace(/\.$/, '')
    if (host === '*' || !HOST_PATTERN.test(host)) problems.push(`trustHosts: "${entry}" is not a host name or "*.domain" pattern ("*" alone would trust every host).`)
    else patterns.push(host, ...(options.subdomains === true && !host.startsWith('*.') ? [`*.${host}`] : []))
  }
  failIfAny(problems)
  return { patterns, configured: true }
}

/**
 * `true` when the host matches the allowlist. `*.example.com` matches `a.example.com` and
 * `a.b.example.com`, never `example.com` itself or `evilexample.com`.
 *
 * @example
 * isTrustedHost('api.example.com', { patterns: ['*.example.com'], configured: true }) // true
 */
export function isTrustedHost(host: string, hosts: ResolvedHosts): boolean {
  const name = host.toLowerCase().replace(/\.$/, '')
  return hosts.patterns.some((pattern) => (pattern.startsWith('*.') ? name.endsWith(pattern.slice(1)) && name.length > pattern.length - 1 : name === pattern))
}
