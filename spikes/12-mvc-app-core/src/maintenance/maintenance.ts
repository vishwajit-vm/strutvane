/**
 * Maintenance mode, Laravel's `php artisan down` / `up`.
 *
 * The state is a file, `storage/framework/down`, written atomically: it survives restarts, and
 * every process serving the app (cluster workers, several containers on a shared volume) reads the
 * same state. Each request checks the file's modification time and re-reads it only when it
 * changed. A file that can't be read is treated as *down* (fail closed: a half-written deploy
 * should not serve traffic).
 *
 * While down:
 * - the health route (`/up`) still answers, so the load balancer keeps the instance;
 * - `/<secret>` (from `down --secret` or `--with-secret`) sets a bypass cookie and redirects home;
 * - `--redirect=/path` sends every other request to that same-origin path;
 * - everything else gets a 503 with `Retry-After`/`Refresh`, or the pre-rendered `--render` page.
 *
 * The secret is never stored: the file holds an HMAC of it under an APP_KEY subkey, and the
 * bypass cookie is an expiring HMAC that names the current secret, so `down` with a new secret
 * (or `key:rotate`) invalidates every old cookie.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { HttpContext } from '../http/context.ts'
import type { KernelStage } from '../http/kernel.ts'
import { HttpError } from '../http/problem.ts'
import type { Keyring } from '../security/keyring.ts'
import { safeRedirectPath } from '../security/redirect.ts'
import { parseJsonSafely } from '../security/safe-json.ts'
import { removeFile, writeFileAtomic } from '../support/atomic-write.ts'

/** The state file, relative to the app. */
export const DOWN_FILE = join('storage', 'framework', 'down')
/** The bypass cookie's name. */
export const BYPASS_COOKIE = 'strutvane_maintenance'
/** How long a bypass cookie lasts (12 hours, as in Laravel). */
export const BYPASS_SECONDS = 12 * 60 * 60

/**
 * What `down` wrote.
 *
 * @example
 * const state: MaintenanceState = { since: 1763200000, retry: 60 }
 */
export interface MaintenanceState {
  /** Unix seconds when maintenance started. */
  readonly since: number
  readonly retry?: number
  readonly refresh?: number
  /** HMAC of the bypass secret; the secret itself is never stored. */
  readonly secretHash?: string
  /** A same-origin path every request is redirected to. */
  readonly redirect?: string
  /** A pre-rendered HTML page (from `--render`), so it shows even if views can't load. */
  readonly html?: string
}

/**
 * Put the app into maintenance mode (atomic write).
 *
 * @example
 * writeMaintenance('/srv/blog', { since: 1763200000, retry: 60 })
 */
export function writeMaintenance(basePath: string, state: MaintenanceState): void {
  writeFileAtomic(join(basePath, DOWN_FILE), `${JSON.stringify(state, null, 2)}\n`)
}

/**
 * Bring the app back up. Returns `false` when it wasn't down.
 *
 * @example
 * clearMaintenance('/srv/blog')
 */
export function clearMaintenance(basePath: string): boolean {
  return removeFile(join(basePath, DOWN_FILE))
}

const cache = new Map<string, { readonly version: string; readonly state: MaintenanceState }>()

/**
 * The current state, or `undefined` when the app is up. Re-reads the file only when it changed.
 *
 * @example
 * if (readMaintenance(basePath) !== undefined) …
 */
export function readMaintenance(basePath: string): MaintenanceState | undefined {
  const path = join(basePath, DOWN_FILE)
  let version: string
  try {
    // Inode too: an atomic rename gives a new file even when the timestamp is the same millisecond.
    const stats = statSync(path)
    version = `${stats.mtimeMs}:${stats.size}:${stats.ino}`
  } catch {
    cache.delete(path)
    return undefined
  }
  const cached = cache.get(path)
  if (cached !== undefined && cached.version === version) return cached.state
  const state = parseState(path)
  cache.set(path, { version, state })
  return state
}

function parseState(path: string): MaintenanceState {
  try {
    const value = parseJsonSafely(readFileSync(path, 'utf8'), { maxDepth: 2, maxKeys: 20 })
    if (typeof value !== 'object' || value === null) return { since: 0 }
    const record = value as Record<string, unknown>
    const number = (name: string): number | undefined => (typeof record[name] === 'number' && Number.isInteger(record[name]) ? Number(record[name]) : undefined)
    const text = (name: string): string | undefined => (typeof record[name] === 'string' ? String(record[name]) : undefined)
    const retry = number('retry')
    const refresh = number('refresh')
    const secretHash = text('secretHash')
    const redirect = text('redirect')
    const html = text('html')
    return { since: number('since') ?? 0, ...(retry === undefined ? {} : { retry }), ...(refresh === undefined ? {} : { refresh }), ...(secretHash === undefined ? {} : { secretHash }), ...(redirect === undefined ? {} : { redirect }), ...(html === undefined ? {} : { html }) }
  } catch {
    // Unreadable or corrupt: stay down (fail closed) with the plain 503.
    return { since: 0 }
  }
}

/**
 * The stored form of a bypass secret: an HMAC under an APP_KEY subkey, so a leaked `down` file
 * doesn't reveal it (and a guessable secret can't be brute-forced offline without the key).
 *
 * @example
 * secretHash(keyring, 'let-me-in')
 */
export function secretHash(keyring: Keyring, secret: string): string {
  return createHmac('sha256', keyring.subkey('maintenance-secret')).update(secret).digest('hex')
}

function bypassMac(keyring: Keyring, state: MaintenanceState, expires: number): string {
  return createHmac('sha256', keyring.subkey('maintenance-bypass')).update(`${state.secretHash ?? ''}|${expires}`).digest('base64url')
}

function equal(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * `true` when the bypass cookie is valid for the current secret and not expired.
 *
 * @example
 * hasBypass(ctx, state, keyring, new Date())
 */
export function hasBypass(ctx: HttpContext, state: MaintenanceState, keyring: Keyring, now: Date): boolean {
  const cookie = ctx.cookie(BYPASS_COOKIE)
  if (cookie === undefined || state.secretHash === undefined) return false
  const [expiresText = '', mac = ''] = cookie.split('.')
  const expires = /^\d{1,12}$/.test(expiresText) ? Number(expiresText) : 0
  return expires * 1000 > now.getTime() && equal(mac, bypassMac(keyring, state, expires))
}

/**
 * Options for the maintenance stage.
 *
 * @example
 * const options: MaintenanceOptions = { basePath, keyring, health: '/up', clock: () => new Date(), secureCookies: true }
 */
export interface MaintenanceOptions {
  readonly basePath: string
  readonly keyring: Keyring
  readonly health: string | undefined
  readonly clock: () => Date
  /** Mark the bypass cookie `Secure` (production, or HTTPS requests). */
  readonly secureCookies: boolean
}

/**
 * The kernel stage that enforces maintenance mode.
 *
 * @example
 * maintenanceStage({ basePath, keyring, health: '/up', clock, secureCookies })
 */
export function maintenanceStage(options: MaintenanceOptions): KernelStage {
  return async (ctx, next) => {
    const state = readMaintenance(options.basePath)
    if (state === undefined) return next()
    const path = ctx.url.pathname
    if (options.health !== undefined && path === options.health) return next()
    const now = options.clock()
    const candidate = path.slice(1)
    if (state.secretHash !== undefined && candidate !== '' && !candidate.includes('/') && equal(secretHash(options.keyring, candidate), state.secretHash)) {
      return bypassResponse(options, state, now, ctx.state.secure)
    }
    if (hasBypass(ctx, state, options.keyring, now)) return next()
    if (state.redirect !== undefined && path !== new URL(state.redirect, ctx.url).pathname) return new Response(null, { status: 302, headers: { location: state.redirect } })
    const headers: Record<string, string> = {}
    if (state.retry !== undefined) headers['retry-after'] = String(state.retry)
    if (state.refresh !== undefined) headers['refresh'] = String(state.refresh)
    if (state.html !== undefined && !ctx.wantsJson()) return new Response(state.html, { status: 503, headers: { ...headers, 'content-type': 'text/html; charset=utf-8' } })
    throw new HttpError(503, 'maintenance', 'Service unavailable', 'The application is down for maintenance. Please try again soon.', { headers })
  }
}

function bypassResponse(options: MaintenanceOptions, state: MaintenanceState, now: Date, secureRequest: boolean): Response {
  const expires = Math.floor(now.getTime() / 1000) + BYPASS_SECONDS
  const secure = options.secureCookies || secureRequest ? '; Secure' : ''
  const cookie = `${BYPASS_COOKIE}=${expires}.${bypassMac(options.keyring, state, expires)}; Path=/; Max-Age=${BYPASS_SECONDS}; HttpOnly; SameSite=Lax${secure}`
  return new Response(null, { status: 302, headers: { location: '/', 'set-cookie': cookie } })
}

/**
 * Validate a `--redirect` value: a same-origin path only.
 *
 * @example
 * maintenanceRedirect('/status', 'https://blog.example.com') // '/status'
 * maintenanceRedirect('//evil.com', 'https://blog.example.com') // undefined
 */
export function maintenanceRedirect(value: string, appUrl: string): string | undefined {
  return safeRedirectPath(value, appUrl)
}
