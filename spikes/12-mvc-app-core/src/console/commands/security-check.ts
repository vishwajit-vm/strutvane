/**
 * `node strut security:check`: the checks from blueprint §2.2 in one report.
 *
 * | Check | Fails when |
 * |---|---|
 * | debug | APP_DEBUG=true with APP_ENV=production |
 * | app-key | APP_KEY missing, short or malformed |
 * | https | production APP_URL is not https |
 * | cookies | production cookies can't be `Secure` (APP_URL over http) |
 * | boot | the app refuses to boot (CORS `*` with credentials, unsafe headers, bad hosts…) |
 * | csp | (warning) CSP off, or scripts allowed from `unsafe-inline`, `*`, `data:`… |
 * | csrf-exceptions | (warning) an exception pattern that matches everything |
 * | cors | (warning) CORS open to `*` |
 * | dev-tools | `/_…` developer routes without auth (fail in production, warning elsewhere) |
 * | npm-audit | `--audit`: high or critical advisories |
 *
 * Exit code 1 when any check fails, so CI can gate deploys on it.
 */
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { token } from '../../foundation/container.ts'
import type { Application } from '../../foundation/application.ts'
import type { ConfigRepository } from '../../foundation/config.ts'
import { securityProfile } from '../../http/security-profile.ts'
import { keyProblem } from '../../security/keyring.ts'
import { cspWeakness } from '../../security/secure-headers.ts'
import { SecurityToken } from '../../security/settings.ts'
import { StrutvaneError } from '../../support/errors.ts'
import { defineCommand } from '../command.ts'
import { renderTable } from '../table.ts'

/**
 * One finding.
 *
 * @example
 * const finding: Finding = { check: 'https', status: 'fail', detail: 'APP_URL is http://…' }
 */
export interface Finding {
  readonly check: string
  readonly status: 'pass' | 'warn' | 'fail' | 'skip'
  readonly detail: string
}

/**
 * What `npm audit` found: counts of high and critical advisories, or why it couldn't run.
 *
 * @example
 * const result: AuditResult = { high: 0, critical: 1 }
 */
export type AuditResult = { readonly high: number; readonly critical: number } | { readonly error: string }

/**
 * Runs `npm audit` for an app folder. Tests bind a fake; the default runs npm's own CLI with the
 * current Node binary (an absolute path, never a bare `npm` resolved from the current folder).
 *
 * @example
 * app.container.instance(AuditRunnerToken, async () => ({ high: 0, critical: 0 }))
 */
export const AuditRunnerToken = token<(basePath: string) => Promise<AuditResult>>('AuditRunner')

/** The default audit runner. */
export async function runNpmAudit(basePath: string): Promise<AuditResult> {
  const cli = process.env['npm_execpath'] ?? join(dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
  if (!existsSync(cli)) return { error: 'npm was not found next to Node' }
  const result = spawnSync(process.execPath, [cli, 'audit', '--json', '--omit=dev'], { cwd: basePath, encoding: 'utf8', timeout: 60_000 })
  try {
    const report: unknown = JSON.parse(result.stdout)
    const counts = typeof report === 'object' && report !== null && 'metadata' in report && typeof report.metadata === 'object' && report.metadata !== null && 'vulnerabilities' in report.metadata ? report.metadata.vulnerabilities : undefined
    if (typeof counts !== 'object' || counts === null) return { error: 'npm audit returned no counts' }
    const high = 'high' in counts && typeof counts.high === 'number' ? counts.high : 0
    const critical = 'critical' in counts && typeof counts.critical === 'number' ? counts.critical : 0
    return { high, critical }
  } catch {
    return { error: 'npm audit did not return JSON (offline?)' }
  }
}

/**
 * Run every check. Exported so tests and `doctor` can reuse it.
 *
 * @example
 * const findings = await securityFindings(app, { audit: false })
 */
export async function securityFindings(app: Application, options: { readonly audit: boolean }): Promise<Finding[]> {
  const findings: Finding[] = []
  let config: ConfigRepository
  try {
    config = app.loadFreshConfig()
  } catch (error) {
    if (!(error instanceof StrutvaneError)) throw error
    return [{ check: 'config', status: 'fail', detail: error.message }]
  }
  const environment = String(config.get('app.env'))
  const production = environment === 'production'
  const debug = config.get('app.debug') === true
  const appUrl = String(config.get('app.url'))
  const https = appUrl.startsWith('https://')
  const keyIssue = keyProblem(String(config.get('app.key')))
  findings.push(debug && production ? { check: 'debug', status: 'fail', detail: 'APP_DEBUG=true with APP_ENV=production. Set APP_DEBUG=false.' } : { check: 'debug', status: 'pass', detail: `APP_DEBUG=${String(debug)}, APP_ENV=${environment}` })
  findings.push(keyIssue === undefined ? { check: 'app-key', status: 'pass', detail: 'APP_KEY is set and at least 32 bytes' } : { check: 'app-key', status: 'fail', detail: `APP_KEY ${keyIssue}. Run node strut key:generate.` })
  findings.push(!production ? { check: 'https', status: 'pass', detail: `not production (${appUrl})` } : https ? { check: 'https', status: 'pass', detail: appUrl } : { check: 'https', status: 'fail', detail: `production APP_URL is not https (${appUrl}).` })
  findings.push(production && !https ? { check: 'cookies', status: 'fail', detail: 'cookies can\'t be Secure while APP_URL is http; session and bypass cookies would travel in clear text.' } : { check: 'cookies', status: 'pass', detail: production ? 'Secure, HttpOnly, SameSite=Lax' : 'HttpOnly, SameSite=Lax (Secure in production)' })

  // Boot with --force-debug when debug is the only reason boot would refuse: the debug finding is
  // already reported, and the remaining checks still need a booted app.
  if (debug && production) app.forceDebug()
  try {
    await app.boot()
  } catch (error) {
    if (!(error instanceof StrutvaneError)) throw error
    findings.push({ check: 'boot', status: 'fail', detail: `the app refuses to boot: ${error.message.split('\n').join(' ')}` })
    return [...findings, ...(options.audit ? [await auditFinding(app)] : [])]
  }
  findings.push({ check: 'boot', status: 'pass', detail: 'every boot-time security check passed (CORS, headers, hosts, proxies, limits, routes)' })
  const security = app.make(SecurityToken)
  const weakness = cspWeakness(security.headers.csp)
  findings.push(weakness === undefined ? { check: 'csp', status: 'pass', detail: 'nonce-based script-src, frame-ancestors none' } : { check: 'csp', status: 'warn', detail: weakness })
  const everything = security.csrf.except.filter((pattern) => /^\*+$/.test(pattern.replace(/\//g, '')))
  findings.push(everything.length === 0 ? { check: 'csrf-exceptions', status: 'pass', detail: `${security.csrf.except.length} exception pattern(s)` } : { check: 'csrf-exceptions', status: 'warn', detail: `"${everything.join('", "')}" turns CSRF off for every path` })
  findings.push(security.cors.origins.includes('*') ? { check: 'cors', status: 'warn', detail: 'CORS allows any origin (without credentials)' } : { check: 'cors', status: 'pass', detail: security.cors.enabled ? `allowlist: ${security.cors.origins.join(', ')}` : 'off' })
  const exposed = app.routes.filter((route) => securityProfile(route, app.routeMiddleware(route), security).warnings.includes('developer tool route without auth')).map((route) => route.uri)
  findings.push(exposed.length === 0 ? { check: 'dev-tools', status: 'pass', detail: 'no /_ routes without auth' } : { check: 'dev-tools', status: production ? 'fail' : 'warn', detail: `exposed without auth: ${exposed.join(', ')}` })
  if (options.audit) findings.push(await auditFinding(app))
  else findings.push({ check: 'npm-audit', status: 'skip', detail: 'run with --audit (needs the network)' })
  return findings
}

async function auditFinding(app: Application): Promise<Finding> {
  const runner = app.container.has(AuditRunnerToken) ? app.make(AuditRunnerToken) : runNpmAudit
  const result = await runner(app.basePath)
  if ('error' in result) return { check: 'npm-audit', status: 'warn', detail: `could not run: ${result.error}` }
  const total = result.high + result.critical
  return total === 0 ? { check: 'npm-audit', status: 'pass', detail: 'no high or critical advisories' } : { check: 'npm-audit', status: 'fail', detail: `${result.critical} critical and ${result.high} high advisories; run npm audit` }
}

const MARK: Readonly<Record<Finding['status'], string>> = { pass: '✔', warn: '!', fail: '✖', skip: '·' }

/** `node strut security:check`. */
export const securityCheckCommand = defineCommand({
  name: 'security:check',
  description: 'Check the configuration for common security mistakes',
  needsBoot: false,
  options: {
    audit: { type: 'boolean', description: 'Also run npm audit (needs the network)' },
    json: { type: 'boolean', description: 'Print JSON for scripts and agents' },
  },
  help: ['Exit code 1 when any check fails, so CI can block a deploy.'],
  async run({ app, options, output }) {
    const findings = await securityFindings(app, { audit: options.audit })
    const failed = findings.filter((finding) => finding.status === 'fail').length
    if (options.json) output.line(JSON.stringify({ passed: failed === 0, findings }, null, 2))
    else {
      output.line(renderTable(['', 'Check', 'Detail'], findings.map((finding) => [MARK[finding.status], finding.check, finding.detail])))
      const warned = findings.filter((finding) => finding.status === 'warn').length
      output.line(`\n  ${failed === 0 ? '✔ No failures' : `✖ ${failed} failure${failed === 1 ? '' : 's'}`}, ${warned} warning${warned === 1 ? '' : 's'}.`)
    }
    return failed === 0 ? 0 : 1
  },
})
