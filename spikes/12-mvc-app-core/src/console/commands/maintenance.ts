/**
 * `node strut down` and `up`: maintenance mode, as in Laravel.
 *
 * ```
 * node strut down --retry=60 --refresh=15
 * node strut down --with-secret                 # prints the bypass URL once
 * node strut down --secret=team-preview-2026     # your own secret (8–128 URL-safe characters)
 * node strut down --redirect=/status             # same-origin paths only
 * node strut down --render=maintenance.html      # resources/views/maintenance.html, pre-rendered
 * node strut up
 * ```
 */
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { clearMaintenance, maintenanceRedirect, secretHash, writeMaintenance, type MaintenanceState } from '../../maintenance/maintenance.ts'
import { KeyringToken } from '../../security/keyring.ts'
import { StrutvaneError } from '../../support/errors.ts'
import { defineCommand } from '../command.ts'

const SECRET = /^[A-Za-z0-9_-]{8,128}$/
const SECONDS = /^\d{1,6}$/
const MAX_RENDER_BYTES = 256 * 1024

function seconds(name: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined
  if (!SECONDS.test(value)) throw new StrutvaneError('INVALID_OPTION', `--${name} must be a whole number of seconds (got "${value}").`, `Example: --${name}=60`)
  return Number(value)
}

/** Read `resources/views/<file>`, refusing anything outside that folder (`../.env`, symlinks out). */
function renderedPage(basePath: string, file: string): string {
  const views = join(basePath, 'resources', 'views')
  const target = resolve(views, file)
  const escapes = (path: string, root: string): boolean => {
    const rel = relative(root, path)
    return rel.startsWith('..') || isAbsolute(rel)
  }
  if (escapes(target, views) || !target.endsWith('.html') || !existsSync(target)) {
    throw new StrutvaneError('INVALID_RENDER', `--render must name an .html file inside resources/views (got "${file}").`, 'Example: --render=maintenance.html for resources/views/maintenance.html.')
  }
  if (escapes(realpathSync(target), realpathSync(views))) throw new StrutvaneError('INVALID_RENDER', `--render=${file} points outside resources/views.`, 'Use a regular file inside resources/views, not a link.')
  if (statSync(target).size > MAX_RENDER_BYTES) throw new StrutvaneError('INVALID_RENDER', `--render=${file} is larger than ${MAX_RENDER_BYTES / 1024} KiB.`, 'A maintenance page should be small and self-contained.')
  return readFileSync(target, 'utf8')
}

/** `node strut down`. */
export const downCommand = defineCommand({
  name: 'down',
  description: 'Put the application into maintenance mode',
  options: {
    secret: { type: 'string', description: 'A secret path that bypasses maintenance mode (8-128 URL-safe characters)' },
    'with-secret': { type: 'boolean', description: 'Generate a random bypass secret and print the bypass URL' },
    retry: { type: 'string', description: 'Retry-After header value, in seconds' },
    refresh: { type: 'string', description: 'Refresh header value, in seconds' },
    redirect: { type: 'string', description: 'Redirect every request to this same-origin path' },
    render: { type: 'string', description: 'An .html file in resources/views to show instead of the default page' },
  },
  run({ app, options, output, now }) {
    if (options.secret !== undefined && options['with-secret']) throw new StrutvaneError('INVALID_OPTION', 'Use --secret or --with-secret, not both.', '--with-secret generates the secret for you.')
    if (options.secret !== undefined && !SECRET.test(options.secret)) throw new StrutvaneError('INVALID_OPTION', '--secret must be 8 to 128 letters, digits, "-" or "_".', 'Or use --with-secret to generate a strong one.')
    const appUrl = String(app.config.get('app.url'))
    const redirect = options.redirect === undefined ? undefined : maintenanceRedirect(options.redirect, appUrl)
    if (options.redirect !== undefined && redirect === undefined) {
      throw new StrutvaneError('UNSAFE_REDIRECT', `--redirect must be a path on this site, such as /status (got "${options.redirect}").`, 'Absolute URLs, "//host" and encoded variants are refused, so maintenance mode can never send visitors elsewhere.')
    }
    const secret = options['with-secret'] ? randomBytes(24).toString('base64url') : options.secret
    const retry = seconds('retry', options.retry)
    const refresh = seconds('refresh', options.refresh)
    const html = options.render === undefined ? undefined : renderedPage(app.basePath, options.render)
    const state: MaintenanceState = {
      since: Math.floor(now().getTime() / 1000),
      ...(retry === undefined ? {} : { retry }),
      ...(refresh === undefined ? {} : { refresh }),
      ...(secret === undefined ? {} : { secretHash: secretHash(app.make(KeyringToken), secret) }),
      ...(redirect === undefined ? {} : { redirect }),
      ...(html === undefined ? {} : { html }),
    }
    writeMaintenance(app.basePath, state)
    output.line('  ✔ The application is now in maintenance mode.')
    if (secret !== undefined) {
      output.line(`  · Bypass it by visiting ${appUrl.replace(/\/+$/, '')}/${secret} (shown once; the secret is not stored).`)
    }
  },
})

/** `node strut up`. */
export const upCommand = defineCommand({
  name: 'up',
  description: 'Bring the application out of maintenance mode',
  needsBoot: false,
  run({ app, output }) {
    output.line(clearMaintenance(app.basePath) ? '  ✔ The application is now live.' : '  · The application was not in maintenance mode.')
  },
})
