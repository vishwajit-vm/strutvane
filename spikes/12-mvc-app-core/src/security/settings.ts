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
import { resolveCsrf, type CsrfOptions, type ResolvedCsrf } from './csrf-settings.ts'

export type { CsrfOptions }

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
