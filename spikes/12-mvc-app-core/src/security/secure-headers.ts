/**
 * Security headers on every response, errors included: a Content-Security-Policy with a fresh
 * nonce per response, HSTS in production over HTTPS, `nosniff`, `Referrer-Policy`,
 * `Permissions-Policy`, COOP/CORP, and `frame-ancestors 'none'` (plus the legacy
 * `X-Frame-Options`) against clickjacking.
 *
 * A header the response already set wins (the debug page sends its own CSP; a route may need
 * `frame-ancestors` for an embed). Settings are validated at boot so a configured source can never
 * smuggle in a second directive or a new header line.
 */
import { failIfAny } from './setting-error.ts'
import type { SecurityEnvironment } from './settings.ts'

/**
 * Options for `withMiddleware((m) => m.securityHeaders({ … }))`.
 *
 * @example
 * const options: HeaderOptions = { csp: { 'img-src': ['https://images.example.com'] } }
 */
export interface HeaderOptions {
  /** Extra sources per CSP directive, added to the defaults; `false` turns CSP off (flagged by security:check). */
  readonly csp?: Readonly<Record<string, readonly string[]>> | false
  /** Send `Content-Security-Policy-Report-Only` instead (to trial a policy). */
  readonly cspReportOnly?: boolean
  /** HSTS settings; `false` turns it off. Only ever sent in production over HTTPS. */
  readonly hsts?: { readonly maxAge?: number; readonly includeSubDomains?: boolean; readonly preload?: boolean } | false
  readonly permissionsPolicy?: string
  readonly referrerPolicy?: string
}

/**
 * The checked header settings. `csp` holds directives with `{nonce}` placeholders.
 *
 * @example
 * resolved.fixed // [['x-content-type-options', 'nosniff'], …]
 */
export interface ResolvedHeaders {
  readonly csp: ReadonlyMap<string, readonly string[]> | undefined
  readonly cspReportOnly: boolean
  readonly hsts: string | undefined
  readonly fixed: readonly (readonly [string, string])[]
}

/** The path the default CSP reports violations to (served by the framework). */
export const CSP_REPORT_PATH = '/_strutvane/csp-report'

const DEFAULT_CSP: readonly (readonly [string, readonly string[]])[] = [
  ['default-src', ["'self'"]],
  ['script-src', ["'self'", "'nonce-{nonce}'"]],
  ['style-src', ["'self'", "'nonce-{nonce}'"]],
  ['img-src', ["'self'", 'data:']],
  ['font-src', ["'self'"]],
  ['connect-src', ["'self'"]],
  ['object-src', ["'none'"]],
  ['base-uri', ["'self'"]],
  ['form-action', ["'self'"]],
  ['frame-ancestors', ["'none'"]],
  ['report-uri', [CSP_REPORT_PATH]],
]

const REFERRER_POLICIES = new Set(['no-referrer', 'no-referrer-when-downgrade', 'origin', 'origin-when-cross-origin', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'])
const DIRECTIVE = /^[a-z][a-z-]*$/
/** A CSP source: a keyword in single quotes, or a scheme/host source. No `;`, `,`, spaces or quotes elsewhere. */
const SOURCE = /^'(?:self|none|unsafe-inline|unsafe-eval|unsafe-hashes|strict-dynamic|report-sample|wasm-unsafe-eval|(?:nonce|sha256|sha384|sha512)-[A-Za-z0-9+/_=-]+)'$|^[A-Za-z0-9*][A-Za-z0-9+.\-*:/_%?=&@~[\]]*$/
const NO_CONTROL = /^[^\u0000-\u001f\u007f]*$/

/**
 * Validate header options and build the header values.
 *
 * @example
 * resolveHeaders({}, { appUrl: 'https://blog.example.com', environment: 'production' })
 */
export function resolveHeaders(options: HeaderOptions, where: SecurityEnvironment): ResolvedHeaders {
  const problems: string[] = []
  const csp = options.csp === false ? undefined : buildCsp(options.csp ?? {}, where, problems)
  const referrer = options.referrerPolicy ?? 'strict-origin-when-cross-origin'
  if (!REFERRER_POLICIES.has(referrer)) problems.push(`securityHeaders referrerPolicy: "${referrer}" is not a Referrer-Policy value.`)
  const permissions = options.permissionsPolicy ?? 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()'
  if (!NO_CONTROL.test(permissions)) problems.push('securityHeaders permissionsPolicy: control characters (such as a line break) are not allowed in a header value.')
  failIfAny(problems)
  return {
    csp,
    cspReportOnly: options.cspReportOnly === true,
    hsts: hstsValue(options.hsts),
    fixed: [
      ['x-content-type-options', 'nosniff'],
      ['referrer-policy', referrer],
      ['permissions-policy', permissions],
      ['cross-origin-opener-policy', 'same-origin'],
      ['cross-origin-resource-policy', 'same-origin'],
      ['x-frame-options', 'DENY'],
    ],
  }
}

function buildCsp(extra: Readonly<Record<string, readonly string[]>>, where: SecurityEnvironment, problems: string[]): Map<string, readonly string[]> {
  const directives = new Map<string, readonly string[]>(DEFAULT_CSP)
  for (const [name, sources] of Object.entries(extra)) {
    if (!DIRECTIVE.test(name)) {
      problems.push(`securityHeaders csp: "${name}" is not a directive name.`)
      continue
    }
    for (const source of sources) if (!SOURCE.test(source)) problems.push(`securityHeaders csp ${name}: "${source}" is not a CSP source (a ";", "," or space would inject another directive).`)
    // Adding to 'none' replaces it: "'none' https://x" is invalid CSP.
    const current = (directives.get(name) ?? []).filter((source) => source !== "'none'")
    directives.set(name, [...current, ...sources])
  }
  if (where.environment === 'production') directives.set('upgrade-insecure-requests', [])
  return directives
}

function hstsValue(options: HeaderOptions['hsts']): string | undefined {
  if (options === false) return undefined
  const maxAge = options?.maxAge ?? 31_536_000
  return `max-age=${maxAge}${options?.includeSubDomains === false ? '' : '; includeSubDomains'}${options?.preload === true ? '; preload' : ''}`
}

/**
 * The CSP header value for one response.
 *
 * @example
 * cspValue(resolved.csp, 'abc') // "default-src 'self'; script-src 'self' 'nonce-abc'; …"
 */
export function cspValue(csp: ReadonlyMap<string, readonly string[]>, nonce: string): string {
  return [...csp].map(([name, sources]) => [name, ...sources].join(' ').replaceAll('{nonce}', nonce)).join('; ')
}

/**
 * Add the security headers to a response's headers, keeping any the response set itself.
 *
 * @example
 * applySecurityHeaders(headers, resolved, { nonce: ctx.nonce, secure: true, environment: 'production' })
 */
export function applySecurityHeaders(headers: Headers, resolved: ResolvedHeaders, request: { readonly nonce: string; readonly secure: boolean; readonly environment: string }): void {
  const setDefault = (name: string, value: string): void => {
    if (!headers.has(name)) headers.set(name, value)
  }
  for (const [name, value] of resolved.fixed) setDefault(name, value)
  if (resolved.csp !== undefined && !headers.has('content-security-policy') && !headers.has('content-security-policy-report-only')) {
    headers.set(resolved.cspReportOnly ? 'content-security-policy-report-only' : 'content-security-policy', cspValue(resolved.csp, request.nonce))
  }
  // HSTS over plain HTTP is ignored by browsers, and in development it would pin localhost to HTTPS.
  if (resolved.hsts !== undefined && request.secure && request.environment === 'production') setDefault('strict-transport-security', resolved.hsts)
}

/**
 * A short verdict on the CSP for `security:check`: `undefined` when strong, else why it's weak.
 *
 * @example
 * cspWeakness(resolved.csp) // "script-src allows 'unsafe-inline'"
 */
export function cspWeakness(csp: ReadonlyMap<string, readonly string[]> | undefined): string | undefined {
  if (csp === undefined) return 'CSP is turned off'
  const scripts = csp.get('script-src') ?? csp.get('default-src') ?? []
  for (const risky of ["'unsafe-inline'", "'unsafe-eval'", '*', 'http:', 'https:', 'data:']) if (scripts.includes(risky)) return `script-src allows ${risky}`
  return undefined
}
