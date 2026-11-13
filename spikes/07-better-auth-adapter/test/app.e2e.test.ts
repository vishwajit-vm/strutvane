/**
 * End to end through a real Hono app that only knows the IdentityEngine interface. Runs the same
 * user journey against both engines, and checks that errors are RFC 9457 problems with stable codes
 * and no engine wording.
 */
import { randomBytes } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { createApp } from '../src/app.ts'
import { createBetterAuthEngine } from '../src/better-auth-adapter.ts'
import type { IdentityEngine } from '../src/identity-engine.ts'
import { createStubEngine } from '../src/stub-adapter.ts'
import { browserRequest, createDatabase, DEV_URL, email, newJar, PASSWORD, store } from './helpers.ts'

const engines: Record<string, () => Promise<{ engine: IdentityEngine; cleanup: () => Promise<void> }>> = {
  'better-auth': async () => {
    const db = await createDatabase()
    const engine = createBetterAuthEngine({
      pool: db.pool,
      baseURL: DEV_URL,
      secret: randomBytes(32).toString('base64'),
      deliverPasswordReset: async () => undefined,
    })
    await engine.migrate()
    return { engine, cleanup: db.drop }
  },
  stub: async () => ({
    engine: createStubEngine({ baseURL: DEV_URL, deliverPasswordReset: async () => undefined }),
    cleanup: async () => undefined,
  }),
}

for (const [name, make] of Object.entries(engines)) {
  describe(`Hono app end to end: ${name}`, () => {
    let app: ReturnType<typeof createApp>
    let cleanup: () => Promise<void>
    beforeAll(async () => {
      const made = await make()
      app = createApp(made.engine)
      cleanup = made.cleanup
    })
    afterAll(async () => cleanup())

    test('sign up → /me → create + switch tenant → sign out → /me is 401', async () => {
      const jar = newJar()
      const call = async (method: string, path: string, body?: unknown) => {
        const res = await app.fetch(browserRequest(DEV_URL, { jar, method, path, body, ip: '203.0.113.50' }))
        store(jar, res)
        return res
      }
      const signUp = await call('POST', '/auth/sign-up', { email: email('e2e'), password: PASSWORD, name: 'E' })
      expect(signUp.status).toBe(200)

      const me = await call('GET', '/me')
      expect(me.status).toBe(200)
      const { actor } = (await me.json()) as { actor: { id: string; roles: string[] } }
      expect(actor.roles).toEqual([])

      const tenant = await call('POST', '/tenants', { name: 'E2E Co', slug: `e2e-${randomBytes(3).toString('hex')}` })
      const { tenantId } = (await tenant.json()) as { tenantId: string }
      const switched = await call('POST', '/tenants/switch', { tenantId })
      expect(((await switched.json()) as { actor: { tenantId: string; roles: string[] } }).actor).toMatchObject({
        tenantId,
        roles: ['owner'],
      })

      expect((await call('POST', '/auth/sign-out')).status).toBe(200)
      expect((await call('GET', '/me')).status).toBe(401)
    })

    test('a failed sign-in is an RFC 9457 problem with a stable code and no engine wording', async () => {
      const res = await app.fetch(
        browserRequest(DEV_URL, {
          method: 'POST',
          path: '/auth/sign-in',
          body: { email: email('nobody'), password: 'wrong wrong wrong' },
          ip: '203.0.113.51',
        }),
      )
      expect(res.status).toBe(401)
      expect(res.headers.get('content-type')).toContain('application/problem+json')
      const body = await res.text()
      expect(JSON.parse(body)).toMatchObject({ status: 401, code: 'INVALID_CREDENTIALS' })
      expect(body.toLowerCase()).not.toContain('invalid email or password') // Better Auth's message
    })
  })
}

describe('interface purity: no engine type leaks above the adapter', () => {
  test.each(['src/identity-engine.ts', 'src/contracts.ts', 'src/app.ts', 'src/stub-adapter.ts'])(
    '%s does not import better-auth',
    (file) => {
      const source = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      expect(source).not.toMatch(/from ['"]better-auth/)
    },
  )
})
