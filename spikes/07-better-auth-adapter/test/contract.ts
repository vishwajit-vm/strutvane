/**
 * The IdentityEngine CONTRACT: behaviour every engine must have, written only against the
 * interface. Running it against two very different engines (Better Auth and the native stub) is
 * the proof that the seam is real.
 */
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import type { IdentityEngine, PasswordResetDelivery } from '../src/identity-engine.ts'
import {
  browserRequest,
  cookieAttributes,
  DEV_URL,
  email,
  type Jar,
  NEW_PASSWORD,
  newJar,
  PASSWORD,
  PROD_URL,
  store,
} from './helpers.ts'

export interface EngineFactoryOptions {
  readonly baseURL: string
  readonly deliverPasswordReset: PasswordResetDelivery
  readonly signInRateLimit: { readonly windowSeconds: number; readonly max: number }
}

export type EngineFactory = (
  options: EngineFactoryOptions,
) => Promise<{ engine: IdentityEngine; cleanup: () => Promise<void> }>

/** Captured password-reset messages, per email. */
class Mailbox {
  readonly messages: { email: string; token: string }[] = []
  readonly deliver: PasswordResetDelivery = async (m) => {
    this.messages.push({ email: m.email, token: m.token })
  }
  tokenFor(address: string): string | undefined {
    return this.messages.filter((m) => m.email === address).at(-1)?.token
  }
}

let ipCounter = 0
/** A fresh client IP per test, so rate limits never leak between tests. */
const freshIp = (): string => `198.51.100.${(ipCounter++ % 250) + 1}`

export function runIdentityContract(label: string, factory: EngineFactory): void {
  describe(`IdentityEngine contract: ${label}`, () => {
    const mailbox = new Mailbox()
    let engine: IdentityEngine
    let cleanup: () => Promise<void>
    const RATE = { windowSeconds: 60, max: 3 }

    beforeAll(async () => {
      ;({ engine, cleanup } = await factory({
        baseURL: DEV_URL,
        deliverPasswordReset: mailbox.deliver,
        signInRateLimit: RATE,
      }))
    })
    afterAll(async () => cleanup())

    /** Sign up a new user; returns their jar, email and id. */
    async function signedUpUser(labelText: string) {
      const address = email(labelText)
      const ip = freshIp()
      const result = await engine.signUp({ email: address, password: PASSWORD, name: labelText }, browserRequest(DEV_URL, { ip }))
      if (!result.ok) throw new Error(`sign-up failed: ${result.error.code}`)
      const jar = store(newJar(), result)
      return { address, jar, ip, id: result.value.actor.id }
    }
    const req = (jar: Jar, ip = freshIp()) => browserRequest(DEV_URL, { jar, ip })

    describe('sign-up', () => {
      test('creates a signed-in user actor without a tenant', async () => {
        const address = email('signup')
        const result = await engine.signUp({ email: address, password: PASSWORD, name: 'Ann' }, req(newJar()))
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.value.actor).toMatchObject({ type: 'user', roles: [] })
        expect(result.value.actor.tenantId).toBeUndefined()
        expect(result.headers.getSetCookie().length).toBeGreaterThan(0)
        const actor = await engine.getActor(req(store(newJar(), result)))
        expect(actor?.id).toBe(result.value.actor.id)
      })

      test('rejects weak passwords and malformed emails with VALIDATION_FAILED', async () => {
        const weak = await engine.signUp({ email: email('weak'), password: 'short', name: 'W' }, req(newJar()))
        expect(weak.ok ? null : weak.error).toEqual({ code: 'VALIDATION_FAILED', status: 422 })
        const bad = await engine.signUp({ email: 'not-an-email', password: PASSWORD, name: 'B' }, req(newJar()))
        expect(bad.ok ? null : bad.error.code).toBe('VALIDATION_FAILED')
      })

      test('a duplicate email returns EMAIL_UNAVAILABLE (documented enumeration trade-off)', async () => {
        const { address } = await signedUpUser('dup')
        const again = await engine.signUp({ email: address, password: PASSWORD, name: 'Dup' }, req(newJar()))
        expect(again.ok ? null : again.error).toEqual({ code: 'EMAIL_UNAVAILABLE', status: 422 })
      })
    })

    describe('sign-in, sessions and sign-out', () => {
      test('wrong password and unknown email are indistinguishable (no user enumeration)', async () => {
        const { address } = await signedUpUser('enum')
        const wrong = await engine.signIn({ email: address, password: 'definitely wrong pw' }, req(newJar()))
        const unknown = await engine.signIn({ email: email('ghost'), password: 'definitely wrong pw' }, req(newJar()))
        expect(wrong.ok ? null : wrong.error).toEqual({ code: 'INVALID_CREDENTIALS', status: 401 })
        expect(unknown.ok ? null : unknown.error).toEqual(wrong.ok ? null : wrong.error)
        expect(wrong.headers.getSetCookie()).toEqual([])
        expect(unknown.headers.getSetCookie()).toEqual([])
      })

      test('sign-in issues a fresh session each time (no session fixation)', async () => {
        const { address } = await signedUpUser('fixation')
        const first = await engine.signIn({ email: address, password: PASSWORD }, req(newJar()))
        const second = await engine.signIn({ email: address, password: PASSWORD }, req(newJar()))
        expect(first.ok && second.ok).toBe(true)
        const a = [...store(newJar(), first).values()]
        const b = [...store(newJar(), second).values()]
        expect(a.length).toBeGreaterThan(0)
        expect(a).not.toEqual(b)
      })

      test('session cookies are HttpOnly, SameSite=Lax, Path=/ and NOT Secure on http dev URLs', async () => {
        const { address } = await signedUpUser('cookie-dev')
        const result = await engine.signIn({ email: address, password: PASSWORD }, req(newJar()))
        const cookies = result.headers.getSetCookie().map(cookieAttributes)
        expect(cookies.length).toBeGreaterThan(0)
        for (const { attrs } of cookies) {
          expect(attrs.has('httponly')).toBe(true)
          expect(attrs.get('samesite')?.toLowerCase()).toBe('lax')
          expect(attrs.get('path')).toBe('/')
          expect(attrs.has('secure')).toBe(false)
        }
      })

      test('getActor returns null without a cookie, with a forged cookie, and never throws', async () => {
        expect(await engine.getActor(req(newJar()))).toBeNull()
        const { jar } = await signedUpUser('forged')
        const forged = new Map([...jar].map(([k, v]) => [k, `${v.slice(0, -4)}AAAA`]))
        expect(await engine.getActor(req(forged))).toBeNull()
      })

      test('sign-out revokes the session server-side (an old copy of the cookie stops working)', async () => {
        const { jar } = await signedUpUser('signout')
        const stolenCopy = new Map(jar)
        expect(await engine.getActor(req(jar))).not.toBeNull()
        const out = await engine.signOut(req(jar))
        expect(out.ok).toBe(true)
        expect(await engine.getActor(req(stolenCopy))).toBeNull()
      })

      test('sign-in is rate limited per client IP; other IPs are unaffected', async () => {
        const { address } = await signedUpUser('ratelimit')
        const ip = freshIp()
        const results = []
        for (let i = 0; i < RATE.max + 1; i++) {
          results.push(await engine.signIn({ email: address, password: 'wrong wrong wrong' }, browserRequest(DEV_URL, { ip })))
        }
        const last = results.at(-1)
        expect(last?.ok ? null : last?.error.code).toBe('RATE_LIMITED')
        expect(last && !last.ok ? last.error.retryAfterSeconds : 0).toBeGreaterThan(0)
        // Even the correct password is refused while limited…
        const correct = await engine.signIn({ email: address, password: PASSWORD }, browserRequest(DEV_URL, { ip }))
        expect(correct.ok ? null : correct.error.code).toBe('RATE_LIMITED')
        // …but another client is not affected.
        const other = await engine.signIn({ email: address, password: PASSWORD }, browserRequest(DEV_URL, { ip: freshIp() }))
        expect(other.ok).toBe(true)
      })
    })

    describe('password reset', () => {
      test('start is identical for known and unknown emails; only known emails get a token', async () => {
        const { address } = await signedUpUser('reset-enum')
        const before = mailbox.messages.length
        const known = await engine.startPasswordReset({ email: address }, req(newJar()))
        const unknown = await engine.startPasswordReset({ email: email('nobody') }, req(newJar()))
        expect(known.ok).toBe(true)
        expect(unknown.ok).toBe(true)
        expect(mailbox.messages.length).toBe(before + 1)
        expect(mailbox.tokenFor(address)).toBeTruthy()
      })

      test('a bad token is INVALID_TOKEN; a good one changes the password, is single-use and revokes sessions', async () => {
        const { address, jar } = await signedUpUser('reset-flow')
        await engine.startPasswordReset({ email: address }, req(newJar()))
        const token = mailbox.tokenFor(address)
        expect(token).toBeTruthy()
        if (!token) return

        const bad = await engine.completePasswordReset({ token: 'not-a-real-token', newPassword: NEW_PASSWORD }, req(newJar()))
        expect(bad.ok ? null : bad.error).toEqual({ code: 'INVALID_TOKEN', status: 400 })

        const done = await engine.completePasswordReset({ token, newPassword: NEW_PASSWORD }, req(newJar()))
        expect(done.ok).toBe(true)
        const reused = await engine.completePasswordReset({ token, newPassword: 'yet another long password' }, req(newJar()))
        expect(reused.ok ? null : reused.error.code).toBe('INVALID_TOKEN')

        expect(await engine.getActor(req(jar))).toBeNull() // old session revoked
        const oldPw = await engine.signIn({ email: address, password: PASSWORD }, req(newJar()))
        expect(oldPw.ok ? null : oldPw.error.code).toBe('INVALID_CREDENTIALS')
        const newPw = await engine.signIn({ email: address, password: NEW_PASSWORD }, req(newJar()))
        expect(newPw.ok).toBe(true)
      })
    })

    describe('tenants (orgs) and roles', () => {
      test('creating a tenant makes the creator its owner, and the actor carries tenantId + roles', async () => {
        const owner = await signedUpUser('owner')
        const created = await engine.createTenant({ name: 'Acme', slug: `acme-${owner.id.slice(0, 8)}` }, req(owner.jar))
        expect(created.ok).toBe(true)
        if (!created.ok) return
        store(owner.jar, created)
        const switched = await engine.switchTenant({ tenantId: created.value.tenantId }, req(owner.jar))
        expect(switched.ok ? switched.value.actor : null).toMatchObject({ tenantId: created.value.tenantId, roles: ['owner'] })
        const actor = await engine.getActor(req(store(owner.jar, switched)))
        expect(actor).toMatchObject({ tenantId: created.value.tenantId, roles: ['owner'] })
        const list = await engine.listTenants(req(owner.jar))
        expect(list.ok ? list.value : null).toEqual([
          { tenantId: created.value.tenantId, name: 'Acme', slug: created.value.slug, roles: ['owner'] },
        ])
      })

      test('a non-member cannot switch into another tenant; unknown tenants look identical', async () => {
        const owner = await signedUpUser('tenant-a-owner')
        const outsider = await signedUpUser('outsider')
        const a = await engine.createTenant({ name: 'A', slug: `a-${owner.id.slice(0, 8)}` }, req(owner.jar))
        if (!a.ok) throw new Error('tenant A not created')
        const intoA = await engine.switchTenant({ tenantId: a.value.tenantId }, req(outsider.jar))
        const intoNothing = await engine.switchTenant({ tenantId: 'does-not-exist-123' }, req(outsider.jar))
        expect(intoA.ok ? null : intoA.error).toEqual({ code: 'FORBIDDEN', status: 403 })
        expect(intoNothing.ok ? null : intoNothing.error).toEqual({ code: 'FORBIDDEN', status: 403 })
        const actor = await engine.getActor(req(outsider.jar))
        expect(actor?.tenantId).toBeUndefined()
        const list = await engine.listTenants(req(outsider.jar))
        expect(list.ok ? list.value : null).toEqual([])
      })

      test('membership roles map to actor.roles; removing the membership drops the tenant immediately', async () => {
        const owner = await signedUpUser('roles-owner')
        const member = await signedUpUser('roles-member')
        const t = await engine.createTenant({ name: 'Roles Inc', slug: `roles-${owner.id.slice(0, 8)}` }, req(owner.jar))
        if (!t.ok) throw new Error('tenant not created')
        const added = await engine.addMemberAsSystem({ tenantId: t.value.tenantId, userId: member.id, role: 'member' })
        expect(added.ok).toBe(true)
        const switched = await engine.switchTenant({ tenantId: t.value.tenantId }, req(member.jar))
        expect(switched.ok ? switched.value.actor : null).toMatchObject({ tenantId: t.value.tenantId, roles: ['member'] })

        await engine.removeMemberAsSystem({ tenantId: t.value.tenantId, userId: member.id })
        const after = await engine.getActor(req(member.jar))
        expect(after).not.toBeNull()
        expect(after?.tenantId).toBeUndefined() // fail closed: no stale tenant access
        expect(after?.roles).toEqual([])
      })

      test('tenant operations require a session', async () => {
        const list = await engine.listTenants(req(newJar()))
        const sw = await engine.switchTenant({ tenantId: 'x' }, req(newJar()))
        expect(list.ok ? null : list.error.code).toBe('UNAUTHENTICATED')
        expect(sw.ok ? null : sw.error.code).toBe('UNAUTHENTICATED')
      })
    })
  })

  describe(`IdentityEngine contract (production URL): ${label}`, () => {
    test('session cookies are Secure when the app runs on https', async () => {
      const { engine, cleanup } = await factory({
        baseURL: PROD_URL,
        deliverPasswordReset: async () => undefined,
        signInRateLimit: { windowSeconds: 60, max: 100 },
      })
      try {
        const result = await engine.signUp(
          { email: email('secure'), password: PASSWORD, name: 'S' },
          browserRequest(PROD_URL, { ip: freshIp() }),
        )
        expect(result.ok).toBe(true)
        const cookies = result.headers.getSetCookie().map(cookieAttributes)
        expect(cookies.length).toBeGreaterThan(0)
        for (const { attrs } of cookies) {
          expect(attrs.has('secure')).toBe(true)
          expect(attrs.has('httponly')).toBe(true)
        }
      } finally {
        await cleanup()
      }
    })
  })
}
