/**
 * Better Auth specifics: things outside the engine-neutral contract that @strutvane/auth must know.
 * Tests named "TRIPWIRE" pin current Better Auth behaviour that the README documents as a risk or
 * workaround. If one fails after an upgrade, Better Auth changed: re-read the README and update it.
 */
import { randomBytes } from 'node:crypto'
import { getSchema } from 'better-auth/db'
import { getMigrations } from 'better-auth/db/migration'
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest'
import { buildBetterAuth, createBetterAuthEngine } from '../src/better-auth-adapter.ts'
import { browserRequest, createDatabase, DEV_URL, email, newJar, PASSWORD, PROD_URL, store } from './helpers.ts'

const secret = randomBytes(32).toString('base64')
const noop = async (): Promise<void> => undefined

describe('schema generation for the Strutvane migration stream', () => {
  let db: Awaited<ReturnType<typeof createDatabase>>
  beforeAll(async () => {
    db = await createDatabase()
  })
  afterAll(async () => db.drop())

  test('getSchema() describes every table without touching the database', () => {
    const auth = buildBetterAuth({ pool: db.pool, baseURL: DEV_URL, secret, deliverPasswordReset: noop })
    expect(Object.keys(getSchema(auth.options)).sort()).toEqual(
      ['account', 'invitation', 'member', 'organization', 'session', 'user', 'verification'].sort(),
    )
  })

  test('compileMigrations() emits SQL for an empty database, and nothing once migrated', async () => {
    const auth = buildBetterAuth({ pool: db.pool, baseURL: DEV_URL, secret, deliverPasswordReset: noop })
    const plan = await getMigrations(auth.options)
    const sql = await plan.compileMigrations()
    expect((sql.match(/create table/gi) ?? []).length).toBe(7)
    expect(sql).toContain('create table "user"')
    expect(sql).toContain('"activeOrganizationId" text') // organization plugin column on session
    await plan.runMigrations()
    const again = await getMigrations(auth.options)
    expect(again.toBeCreated).toEqual([])
    expect(again.toBeAdded).toEqual([])
    expect(again.unsafeChanges).toEqual([])
  })
})

describe('Better Auth runtime behaviour', () => {
  let db: Awaited<ReturnType<typeof createDatabase>>
  let prodDb: Awaited<ReturnType<typeof createDatabase>>
  const reported: string[] = []
  let engine: ReturnType<typeof createBetterAuthEngine>

  beforeAll(async () => {
    db = await createDatabase()
    prodDb = await createDatabase()
    engine = createBetterAuthEngine({
      pool: db.pool,
      baseURL: DEV_URL,
      secret,
      deliverPasswordReset: () => new Promise((resolve) => setTimeout(resolve, 300)), // a slow mailer
      signInRateLimit: { windowSeconds: 60, max: 2 },
      onUnexpectedError: (context) => {
        reported.push(context)
      },
    })
    await engine.migrate()
  })
  afterAll(async () => {
    await prodDb.drop()
    await db.drop()
  })

  test('cookie names: plain in dev, __Secure- prefixed (and Secure) on https', async () => {
    const dev = await engine.signUp({ email: email('dev'), password: PASSWORD, name: 'D' }, browserRequest(DEV_URL, { ip: '192.0.2.1' }))
    expect([...store(newJar(), dev).keys()]).toEqual(['better-auth.session_token'])

    const prod = createBetterAuthEngine({ pool: prodDb.pool, baseURL: PROD_URL, secret, deliverPasswordReset: noop })
    await prod.migrate()
    const res = await prod.signUp({ email: email('prod'), password: PASSWORD, name: 'P' }, browserRequest(PROD_URL, { ip: '192.0.2.2' }))
    const cookie = res.headers.getSetCookie()[0] ?? ''
    expect(cookie.startsWith('__Secure-better-auth.session_token=')).toBe(true)
    expect(cookie).toMatch(/;\s*Secure/i)
  })

  test('user and tenant ids are UUIDs, so tenant ids work in the RLS policy cast (ADR-0007)', async () => {
    const s = await engine.signUp({ email: email('uuid'), password: PASSWORD, name: 'U' }, browserRequest(DEV_URL, { ip: '192.0.2.10' }))
    if (!s.ok) throw new Error('sign-up failed')
    const jar = store(newJar(), s)
    const t = await engine.createTenant({ name: 'Uuid', slug: `uuid-${randomBytes(3).toString('hex')}` }, browserRequest(DEV_URL, { jar }))
    if (!t.ok) throw new Error('tenant not created')
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    expect(s.value.actor.id).toMatch(uuid)
    expect(t.value.tenantId).toMatch(uuid)
    // Exactly what the RLS policy does with the setting:
    const cast = await db.pool.query<{ id: string }>("select nullif($1, '')::uuid as id", [t.value.tenantId])
    expect(cast.rows[0]?.id).toBe(t.value.tenantId)
  })

  test('password reset takes the same time for known and unknown emails, even with a slow mailer', async () => {
    const known = email('timing')
    await engine.signUp({ email: known, password: PASSWORD, name: 'T' }, browserRequest(DEV_URL, { ip: '192.0.2.3' }))
    const time = async (address: string): Promise<number> => {
      const start = performance.now()
      const result = await engine.startPasswordReset({ email: address }, browserRequest(DEV_URL, { ip: '192.0.2.4' }))
      expect(result.ok).toBe(true)
      return performance.now() - start
    }
    const knownMs = await time(known)
    const unknownMs = await time(email('nobody'))
    // Without the backgroundTasks handler the known email waited for the 300 ms mailer.
    expect(knownMs).toBeLessThan(200)
    expect(Math.abs(knownMs - unknownMs)).toBeLessThan(150)
  })

  test('TRIPWIRE: switching tenant does NOT rotate the session token (README §Findings)', async () => {
    const s = await engine.signUp({ email: email('rot'), password: PASSWORD, name: 'R' }, browserRequest(DEV_URL, { ip: '192.0.2.5' }))
    const jar = store(newJar(), s)
    const before = jar.get('better-auth.session_token')
    const t = await engine.createTenant({ name: 'Rot', slug: `rot-${randomBytes(3).toString('hex')}` }, browserRequest(DEV_URL, { jar }))
    if (!t.ok) throw new Error('tenant not created')
    const sw = await engine.switchTenant({ tenantId: t.value.tenantId }, browserRequest(DEV_URL, { jar }))
    store(jar, sw)
    expect(jar.get('better-auth.session_token')).toBe(before)
  })

  test('TRIPWIRE: a spoofed, rotating X-Forwarded-For bypasses the per-IP sign-in limit (README §Findings)', async () => {
    const target = email('xff')
    await engine.signUp({ email: target, password: PASSWORD, name: 'X' }, browserRequest(DEV_URL, { ip: '192.0.2.6' }))
    const codes = []
    for (let i = 0; i < 5; i++) {
      const r = await engine.signIn({ email: target, password: 'wrong wrong wrong' }, browserRequest(DEV_URL, { ip: `100.64.${i}.1` }))
      codes.push(r.ok ? 'ok' : r.error.code)
    }
    expect(codes).toEqual(Array(5).fill('INVALID_CREDENTIALS')) // limit is 2, never triggered
  })

  test('TRIPWIRE: requests without a usable client IP share ONE rate-limit bucket (README §Findings)', async () => {
    const target = email('noip')
    await engine.signUp({ email: target, password: PASSWORD, name: 'N' }, browserRequest(DEV_URL, { ip: '192.0.2.7' }))
    const attempt = async (xff: string | null) => {
      const req = browserRequest(DEV_URL)
      if (xff === null) req.headers.delete('x-forwarded-for')
      else req.headers.set('x-forwarded-for', xff)
      const r = await engine.signIn({ email: target, password: 'wrong wrong wrong' }, req)
      return r.ok ? 'ok' : r.error.code
    }
    expect(await attempt(null)).toBe('INVALID_CREDENTIALS')
    expect(await attempt(null)).toBe('INVALID_CREDENTIALS')
    // A *different* client with a multi-hop header lands in the same exhausted bucket.
    expect(await attempt('1.2.3.4, 10.0.0.9')).toBe('RATE_LIMITED')
  })

  test('a database outage becomes INTERNAL_ERROR / null actor, is reported once, and never hits stderr', async () => {
    const outageDb = await createDatabase()
    const contexts: string[] = []
    const fragile = createBetterAuthEngine({
      pool: outageDb.pool,
      baseURL: DEV_URL,
      secret,
      deliverPasswordReset: noop,
      onUnexpectedError: (context) => {
        contexts.push(context)
      },
    })
    await fragile.migrate()
    const s = await fragile.signUp({ email: email('down'), password: PASSWORD, name: 'O' }, browserRequest(DEV_URL, { ip: '192.0.2.8' }))
    const jar = store(newJar(), s)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await outageDb.pool.end()
    const signIn = await fragile.signIn({ email: email('down2'), password: PASSWORD }, browserRequest(DEV_URL, { ip: '192.0.2.9' }))
    expect(signIn.ok ? null : signIn.error).toEqual({ code: 'INTERNAL_ERROR', status: 500 })
    expect(await fragile.getActor(browserRequest(DEV_URL, { jar }))).toBeNull()
    expect(consoleError).not.toHaveBeenCalled()
    expect(contexts).toContain('signIn')
    consoleError.mockRestore()
    await outageDb.drop().catch(() => undefined)
  })
})
