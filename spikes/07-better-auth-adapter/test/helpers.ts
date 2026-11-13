/**
 * Shared test helpers: per-file databases, request builders and cookie handling. Kept engine-agnostic
 * so the contract suite can run against any IdentityEngine.
 */
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { inject } from 'vitest'
import type { IdentityResult } from '../src/identity-engine.ts'

export const DEV_URL = 'http://localhost:3000'
export const PROD_URL = 'https://app.example.com'

/** Create an isolated database for one test file. Returns a pool and a cleanup function. */
export async function createDatabase(): Promise<{ pool: pg.Pool; drop: () => Promise<void> }> {
  const adminUrl = inject('pgAdminUrl')
  const name = `t_${randomBytes(6).toString('hex')}`
  const admin = new pg.Client({ connectionString: adminUrl })
  await admin.connect()
  await admin.query(`CREATE DATABASE ${name}`)
  await admin.end()
  const url = new URL(adminUrl)
  url.pathname = `/${name}`
  const pool = new pg.Pool({ connectionString: url.toString(), max: 5 })
  return {
    pool,
    drop: async () => {
      await pool.end().catch(() => undefined)
      const cleanup = new pg.Client({ connectionString: adminUrl })
      await cleanup.connect()
      await cleanup.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      await cleanup.end()
    },
  }
}

/** A cookie jar of `name=value` pairs, as a browser would keep them. */
export type Jar = Map<string, string>

export function newJar(): Jar {
  return new Map()
}

/** Apply a result's Set-Cookie headers to a jar (Max-Age=0 / empty value deletes). */
export function store(jar: Jar, result: IdentityResult<unknown> | { headers: Headers }): Jar {
  for (const cookie of result.headers.getSetCookie()) {
    const [pair = '', ...attrs] = cookie.split(';')
    const eq = pair.indexOf('=')
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    const expired = attrs.some((a) => /^\s*max-age=0\s*$/i.test(a)) || value === ''
    if (expired) jar.delete(name)
    else jar.set(name, value)
  }
  return jar
}

/** Build an incoming request as a same-origin browser would send it. */
export function browserRequest(
  baseURL: string,
  options: { jar?: Jar; ip?: string; path?: string; method?: string; body?: unknown } = {},
): Request {
  const headers = new Headers({ origin: baseURL, 'user-agent': 'spike07-tests/1.0' })
  headers.set('x-forwarded-for', options.ip ?? '203.0.113.10')
  if (options.jar && options.jar.size > 0) {
    headers.set('cookie', [...options.jar].map(([n, v]) => `${n}=${v}`).join('; '))
  }
  const init: RequestInit = { method: options.method ?? 'GET', headers }
  if (options.body !== undefined) {
    headers.set('content-type', 'application/json')
    init.body = JSON.stringify(options.body)
  }
  return new Request(`${baseURL}${options.path ?? '/'}`, init)
}

/** Unique, valid email for a test. */
export function email(label: string): string {
  return `${label}-${randomBytes(4).toString('hex')}@example.com`
}

export const PASSWORD = 'correct horse battery staple'
export const NEW_PASSWORD = 'an even longer new passphrase'

/** Parse one Set-Cookie header into its attributes (lower-cased names). */
export function cookieAttributes(setCookie: string): { name: string; attrs: Map<string, string> } {
  const [pair = '', ...rest] = setCookie.split(';')
  const attrs = new Map<string, string>()
  for (const part of rest) {
    const [k = '', ...v] = part.trim().split('=')
    attrs.set(k.toLowerCase(), v.join('='))
  }
  return { name: pair.split('=')[0]?.trim() ?? '', attrs }
}
