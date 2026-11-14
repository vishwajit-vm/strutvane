/**
 * The app's security settings, collected in `bootstrap/app.ts` through `withMiddleware((m) => …)`
 * and checked once at boot. Every protection is on by default; these settings only *adjust*
 * them (exceptions, allowlists, limits), and a setting that would weaken security in a way that
 * is never right (CORS `*` with credentials, a CSP source that injects a directive) stops boot.
 *
 * Why one collector with per-area resolvers: each area (CSRF, proxies, hosts, CORS, headers,
 * body limits) validates its own options in its own module, but the developer gets *every*
 * problem in one boot error instead of fixing them one restart at a time.
 */
import { token } from '../foundation/container.ts'
import { StrutvaneError } from '../support/errors.ts'
import { SecuritySettingError } from './setting-error.ts'
import type { BodyLimits } from '../http/request-state.ts'
import { resolveCors, type CorsOptions, type ResolvedCors } from './cors.ts'
import { resolveCsrf, type CsrfOptions, type ResolvedCsrf } from './csrf-settings.ts'
import { resolveLimits, type BodyLimitOptions } from './safe-json.ts'
import { resolveHeaders, type HeaderOptions, type ResolvedHeaders } from './secure-headers.ts'
import { resolveTrustedHosts, type ResolvedHosts, type TrustHostsOptions } from './trusted-hosts.ts'
import { resolveTrustedProxies, type ResolvedProxies, type TrustProxiesOptions } from './trusted-proxies.ts'

export type { BodyLimitOptions, CorsOptions, CsrfOptions, HeaderOptions, TrustHostsOptions, TrustProxiesOptions }

/**
 * Where the app runs, which some defaults depend on (HSTS only in production, loopback hosts
 * only in local and testing).
 *
 * @example
 * const where: SecurityEnvironment = { appUrl: 'https://blog.example.com', environment: 'production' }
 */
export interface SecurityEnvironment {
  readonly appUrl: string
  readonly environment: string
}

/**
 * Every security setting after validation, with defaults filled in. Bound in the container as
 * {@link SecurityToken} so middleware read one checked value.
 *
 * @example
 * app.make(SecurityToken).csrf.except // ['webhooks/*']
 */
export interface ResolvedSecurity {
  readonly csrf: ResolvedCsrf
  readonly proxies: ResolvedProxies
  readonly hosts: ResolvedHosts
  readonly cors: ResolvedCors
  readonly headers: ResolvedHeaders
  readonly limits: BodyLimits
}

/**
 * The collector behind `withMiddleware`'s security methods. Calls merge (lists append), so a
 * package provider and the app can both add CSRF exceptions.
 *
 * @example
 * settings.csrf({ except: ['webhooks/*'] }).trustProxies({ at: ['10.0.0.0/8'] })
 */
export class SecuritySettings {
  #csrf: CsrfOptions = {}
  #proxies: TrustProxiesOptions = { at: [] }
  #hosts: TrustHostsOptions | undefined
  #cors: CorsOptions | undefined
  #headers: HeaderOptions = {}
  #limits: BodyLimitOptions = {}

  /**
   * Add CSRF exceptions (path patterns) and trusted origins.
   *
   * @example
   * settings.csrf({ except: ['webhooks/*'], origins: ['https://admin.example.com'] })
   */
  csrf(options: CsrfOptions): this {
    this.#csrf = { except: [...(this.#csrf.except ?? []), ...(options.except ?? [])], origins: [...(this.#csrf.origins ?? []), ...(options.origins ?? [])] }
    return this
  }

  /**
   * Trust `X-Forwarded-*` headers only from these proxy addresses (CIDR or single IPs).
   *
   * @example
   * settings.trustProxies({ at: ['10.0.0.0/8'] })
   */
  trustProxies(options: TrustProxiesOptions): this {
    this.#proxies = { ...options, at: [...this.#proxies.at, ...options.at] }
    return this
  }

  /**
   * Replace the Host allowlist (default: APP_URL's host, plus loopback in local and testing).
   *
   * @example
   * settings.trustHosts({ at: ['blog.example.com'], subdomains: true })
   */
  trustHosts(options: TrustHostsOptions): this {
    this.#hosts = options
    return this
  }

  /**
   * Turn CORS on for an allowlist of origins. Off by default.
   *
   * @example
   * settings.cors({ origins: ['https://app.example.com'], credentials: true })
   */
  cors(options: CorsOptions): this {
    this.#cors = options
    return this
  }

  /**
   * Adjust the security headers (extra CSP sources, HSTS, Permissions-Policy…).
   *
   * @example
   * settings.headers({ csp: { 'img-src': ['https://images.example.com'] } })
   */
  headers(options: HeaderOptions): this {
    this.#headers = { ...this.#headers, ...options }
    return this
  }

  /**
   * Adjust the request body limits (bytes, JSON depth, JSON keys).
   *
   * @example
   * settings.limits({ maxBytes: 5 * 1024 * 1024 })
   */
  limits(options: BodyLimitOptions): this {
    this.#limits = { ...this.#limits, ...options }
    return this
  }

  /**
   * Validate everything and fill in defaults. Throws one {@link StrutvaneError} listing every
   * problem, so a misconfigured app never starts half-protected.
   *
   * @example
   * const security = settings.resolve({ appUrl: 'http://localhost', environment: 'local' })
   */
  resolve(where: SecurityEnvironment): ResolvedSecurity {
    const problems: string[] = []
    const collect = <TValue>(resolve: () => TValue, fallback: TValue): TValue => {
      try {
        return resolve()
      } catch (error) {
        if (!(error instanceof SecuritySettingError)) throw error
        problems.push(...error.problems)
        return fallback
      }
    }
    const resolved: ResolvedSecurity = {
      csrf: collect(() => resolveCsrf(this.#csrf, where), { except: [], origins: [] }),
      proxies: collect(() => resolveTrustedProxies(this.#proxies), { ranges: [], headers: [] }),
      hosts: collect(() => resolveTrustedHosts(this.#hosts, where), { patterns: [], configured: false }),
      cors: collect(() => resolveCors(this.#cors), { enabled: false, paths: [], origins: [], methods: [], headers: [], exposedHeaders: [], credentials: false, maxAge: 0 }),
      headers: collect(() => resolveHeaders(this.#headers, where), { csp: undefined, cspReportOnly: false, hsts: undefined, fixed: [] }),
      limits: collect(() => resolveLimits(this.#limits), { maxBytes: 1, maxDepth: 1, maxKeys: 1 }),
    }
    if (problems.length > 0) {
      throw new StrutvaneError(
        'INSECURE_CONFIGURATION',
        `The app can't start: ${problems.length} security ${problems.length === 1 ? 'setting is' : 'settings are'} unsafe or invalid.\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
        'Fix them in bootstrap/app.ts (withMiddleware). Each line above says what is wrong and what is allowed.',
      )
    }
    return resolved
  }
}

/**
 * The container token for the checked security settings, bound at boot.
 *
 * @example
 * app.make(SecurityToken).csrf.origins // ['http://localhost']
 */
export const SecurityToken = token<ResolvedSecurity>('Security')
