/**
 * Group 3, part 1: the keyring and `encrypt()`/`decrypt()` (AES-256-GCM, full-length tags only,
 * key rotation), signed and temporary signed URLs with the `signed` middleware, the open-redirect
 * guard, and the `idempotent` middleware.
 */
import { createCipheriv, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { HttpContext, idempotent, redirect, signedRoute, temporarySignedRoute, withIdempotency } from '#strutvane/http'
import { defineRoutes, Route } from '#strutvane/routing'
import { DecryptError, decrypt, encrypt, Encrypter, Keyring, keyProblem, openSealed, safeRedirectPath, seal, signUrl, verifySignedUrl } from '#strutvane/security'
import { client } from '#strutvane/testing'
import { demoTokens } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { customApp, NOW, testEnv } from './helpers.ts'

const KEY_A = `base64:${randomBytes(32).toString('base64')}`
const KEY_B = `base64:${randomBytes(32).toString('base64')}`

describe('the keyring', () => {
  it('accepts 32+ byte keys, base64 or text, and explains every bad one', () => {
    expect(keyProblem(KEY_A)).toBeUndefined()
    expect(keyProblem(testEnv.APP_KEY)).toBeUndefined()
    expect(keyProblem(undefined)).toBe('is missing')
    expect(keyProblem('')).toBe('is missing')
    expect(keyProblem('short-key')).toBe('is too short: 9 bytes, at least 32 are needed')
    expect(keyProblem(`base64:${randomBytes(16).toString('base64')}`)).toBe('is too short: 16 bytes, at least 32 are needed')
    expect(keyProblem('base64:not*base64!')).toBe('starts with "base64:" but the rest is not valid base64')
  })

  it('derives different subkeys per purpose and per key', () => {
    const keyring = Keyring.from(KEY_A, KEY_B)
    expect(keyring.subkey('encrypt').equals(keyring.subkey('signed-url'))).toBe(false)
    expect(keyring.previous).toHaveLength(1)
    expect(keyring.current.id).toMatch(/^[0-9a-f]{16}$/)
    expect(() => Keyring.from(KEY_A, 'too-short')).toThrow('APP_PREVIOUS_KEYS[0] is too short')
  })
})

describe('encrypt() and decrypt()', () => {
  it('round-trips values and binds them to a purpose', () => {
    const encrypter = new Encrypter(Keyring.from(KEY_A))
    const payload = encrypter.encrypt({ card: '4111', amount: 12 })
    expect(payload).toMatch(/^sv1\.[0-9a-f]{16}\.[A-Za-z0-9_-]+$/)
    expect(encrypter.decrypt(payload)).toEqual({ card: '4111', amount: 12 })
    expect(encrypter.encryptString('same')).not.toBe(encrypter.encryptString('same'))
    const cookie = encrypter.encryptString('v', { purpose: 'cookie' })
    expect(() => encrypter.decryptString(cookie)).toThrow(DecryptError)
    expect(encrypter.decryptString(cookie, { purpose: 'cookie' })).toBe('v')
  })

  it('refuses tampering, truncation and unknown keys with one vague error', () => {
    const encrypter = new Encrypter(Keyring.from(KEY_A))
    const payload = encrypter.encryptString('secret')
    const [prefix, id, body = ''] = payload.split('.')
    const bytes = Buffer.from(body, 'base64url')
    const flipped = Buffer.from(bytes)
    flipped[flipped.length - 1] = (flipped[flipped.length - 1] ?? 0) ^ 1
    for (const bad of [`${prefix}.${id}.${flipped.toString('base64url')}`, `${prefix}.${id}.${bytes.subarray(0, 20).toString('base64url')}`, `${prefix}.0000000000000000.${body}`, `sv2.${id}.${body}`, `${payload}.x`, 'garbage']) {
      expect(() => encrypter.decryptString(bad), bad).toThrow(DecryptError)
    }
  })

  it('refuses authentication tags shorter than 16 bytes (Node would accept 4, 8 or 12)', () => {
    const key = randomBytes(32)
    const iv = randomBytes(12)
    for (const length of [4, 8, 12]) {
      // A *genuine* short tag made by Node itself: decryption must still refuse it.
      const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: length })
      cipher.setAAD(Buffer.from('aad'))
      const ciphertext = Buffer.concat([cipher.update('hello'), cipher.final()])
      expect(() => openSealed(key, { iv, tag: cipher.getAuthTag(), ciphertext }, 'aad'), `${length}-byte tag`).toThrow(DecryptError)
    }
    const good = seal(key, Buffer.from('hello'), 'aad')
    expect(good.tag).toHaveLength(16)
    expect(openSealed(key, good, 'aad').toString()).toBe('hello')
    expect(() => openSealed(key, { ...good, tag: good.tag.subarray(0, 12) }, 'aad')).toThrow(DecryptError)
  })

  it('keeps old values readable after key rotation, and writes with the new key', () => {
    const before = new Encrypter(Keyring.from(KEY_A))
    const old = before.encryptString('kept')
    const after = new Encrypter(Keyring.from(KEY_B, KEY_A))
    expect(after.decryptString(old)).toBe('kept')
    expect(() => before.decryptString(after.encryptString('new'))).toThrow(DecryptError)
    // Once the old key is dropped from APP_PREVIOUS_KEYS, its values are gone.
    expect(() => new Encrypter(Keyring.from(KEY_B)).decryptString(old)).toThrow(DecryptError)
  })

  it('is available as encrypt()/decrypt() helpers inside the app', async () => {
    const { app } = await customApp({}, () => {}, { APP_KEY: KEY_A })
    const payload = app.run(() => encrypt('note'))
    expect(app.run(() => decrypt(payload))).toBe('note')
  })
})

describe('signed and temporary signed URLs', () => {
  const keyring = Keyring.from(KEY_A)
  const now = new Date('2026-11-15T10:00:00Z')

  it('verifies untouched links and refuses every tampering', () => {
    const url = signUrl('/downloads/7?format=pdf', keyring)
    expect(verifySignedUrl(url, keyring, now)).toBe('valid')
    const tampered = [
      url.replace('/downloads/7', '/downloads/8'),
      url.replace('format=pdf', 'format=zip'),
      `${url}&extra=1`,
      url.replace(/signature=[^&]+/, 'signature=' + 'A'.repeat(43)),
      url.replace(/&signature=[^&]+/, ''),
      `${url}&signature=${'B'.repeat(43)}`,
      url.replace(/signature=([^&]+)/, (_match, value: string) => `signature=${value.toLowerCase()}`),
    ]
    for (const bad of tampered) expect(verifySignedUrl(bad, keyring, now), bad).toBe('invalid')
    // Parameter order doesn't matter (keys are sorted before signing).
    const reordered = signUrl('/x?b=2&a=1', keyring).replace('b=2&a=1', 'a=1&b=2')
    expect(verifySignedUrl(reordered, keyring, now)).toBe('valid')
  })

  it('expires temporary links, and the expiry itself is signed', () => {
    const url = signUrl('/reset', keyring, new Date(now.getTime() + 60_000))
    expect(verifySignedUrl(url, keyring, now)).toBe('valid')
    expect(verifySignedUrl(url, keyring, new Date(now.getTime() + 60_000))).toBe('expired')
    const extended = url.replace(/expires=\d+/, `expires=${Math.floor(now.getTime() / 1000) + 999_999}`)
    expect(verifySignedUrl(extended, keyring, now)).toBe('invalid')
    expect(verifySignedUrl(url.replace(/expires=\d+/, 'expires=1e99'), keyring, now)).toBe('invalid')
    expect(() => signUrl('/x?signature=abc', keyring)).toThrow('already has a "signature"')
  })

  it('regression (found by fuzzing): a path starting with // is a path, never a host', () => {
    const url = signUrl('//cdn.example/x', keyring)
    expect(url.startsWith('//cdn.example/x?signature=')).toBe(true)
    expect(verifySignedUrl(url, keyring, now)).toBe('valid')
    expect(verifySignedUrl(url.replace('//cdn.example/x', '/x'), keyring, now)).toBe('invalid')
    expect(verifySignedUrl('//?signature=x', keyring, now)).toBe('invalid')
  })

  it('accepts links signed with a previous key after rotation', () => {
    const url = signUrl('/x', keyring)
    expect(verifySignedUrl(url, Keyring.from(KEY_B, KEY_A), now)).toBe('valid')
    expect(verifySignedUrl(url, Keyring.from(KEY_B), now)).toBe('invalid')
  })

  it('the signed middleware: 200 for a good link, 403 for tampered or expired ones', async () => {
    const { app } = await customApp({ web: defineRoutes([Route.get('/files/{file}', (ctx) => ctx.json({ file: ctx.param('file') })).name('files.show').middleware('signed')]) })
    const permanent = app.run(() => signedRoute('files.show' as never, { file: 'report' } as never))
    ;(await client(app).getJson(permanent)).assertStatus(200).assertJsonPath('file', 'report')
    ;(await client(app).getJson(permanent.replace('report', 'secret'))).assertProblem(403, 'invalid_signature')
    ;(await client(app).getJson('/files/report')).assertProblem(403, 'invalid_signature')
    const temporary = app.run(() => temporarySignedRoute('files.show' as never, new Date(NOW.getTime() - 1000), { file: 'report' } as never))
    ;(await client(app).getJson(temporary)).assertProblem(403, 'signature_expired')
  })
})

describe('the open-redirect guard', () => {
  const app = 'https://blog.example.com'

  it('allows same-origin paths only', () => {
    expect(safeRedirectPath('/posts?page=2#top', app)).toBe('/posts?page=2#top')
    expect(safeRedirectPath('/a/../b', app)).toBe('/b')
  })

  it.each([
    '//evil.com',
    '/\\evil.com',
    '\\\\evil.com',
    '/%2F%2Fevil.com',
    '%2F%2Fevil.com',
    '/%5Cevil.com',
    '/%255Cevil.com',
    '/%252F%252Fevil.com',
    '/.//evil.com',
    '/..//evil.com',
    '////evil.com',
    'https://evil.com',
    'https:evil.com',
    'https://blog.example.com.evil.com/',
    'https://blog.example.com@evil.com/',
    'http://blog.example.com/',
    'javascript:alert(1)',
    ' //evil.com',
    '/\t/evil.com',
    '/%09/evil.com',
    '/\r\nLocation: https://evil.com',
    '/%0d%0aSet-Cookie:%20a=b',
    '',
    'evil.com',
    `/${'a'.repeat(3000)}`,
    '/%E0%A4%A',
  ])('refuses %j', (payload) => {
    expect(safeRedirectPath(payload, app)).toBeUndefined()
  })

  it('redirect().intended() falls back for hostile values; to() refuses them loudly', async () => {
    const { app: application } = await customApp({ web: defineRoutes([Route.get('/login/done', (ctx) => redirect().intended(ctx, '/dashboard'))]) })
    const location = async (query: string): Promise<string | null> => (await application.handle(new Request(`http://localhost/login/done${query}`))).headers.get('location')
    expect(await location('?intended=%2Fposts%2F7')).toBe('/posts/7')
    expect(await location('?intended=%2F%2Fevil.com')).toBe('/dashboard')
    expect(await location('?intended=https%3A%2F%2Fevil.com')).toBe('/dashboard')
    expect(await location('?intended=%2F%5Cevil.com')).toBe('/dashboard')
    expect(await location('')).toBe('/dashboard')
    expect(() => application.run(() => redirect().to('//evil.com'))).toThrow('not a same-origin path')
    expect(application.run(() => redirect().away('https://partner.example/x')).headers.get('location')).toBe('https://partner.example/x')
    expect(() => application.run(() => redirect().away('javascript:alert(1)'))).toThrow('absolute http(s) URL')
  })
})

describe('the idempotent middleware', () => {
  async function paymentsApp(): Promise<{ app: Awaited<ReturnType<typeof customApp>>['app']; charges: () => number }> {
    let charges = 0
    class PaymentController {
      static readonly middleware = [idempotent({ only: ['store'] })]
      async store(ctx: HttpContext): Promise<Response> {
        charges++
        const body = (await ctx.body()) as { amount?: number }
        return ctx.json({ charge: charges, amount: body.amount }, 201, { location: `/payments/${charges}`, 'set-cookie': 'tracking=1' })
      }
    }
    const { app } = await customApp({
      api: defineRoutes([
        Route.post('/payments', [PaymentController, 'store']).middleware('auth'),
        Route.post('/optional', withIdempotency(async (ctx) => ctx.json({ ran: true }), 'optional')),
        Route.post('/broken', withIdempotency(async () => {
          charges++
          throw new Error('payment provider down')
        })),
      ]),
    })
    return { app, charges: () => charges }
  }

  it('runs once per key and replays the first response (without per-request headers)', async () => {
    const { app, charges } = await paymentsApp()
    const alice = client(app).actingAs(demoTokens.alice).withHeaders({ 'idempotency-key': 'pay-1' })
    const first = await alice.postJson('/api/payments', { amount: 10 })
    first.assertStatus(201).assertJsonPath('charge', 1)
    const retry = await alice.postJson('/api/payments', { amount: 10 })
    retry.assertStatus(201).assertJsonPath('charge', 1)
    expect(retry.headers.get('idempotent-replayed')).toBe('true')
    expect(retry.headers.get('location')).toBe('/payments/1')
    expect(retry.headers.get('set-cookie')).toBeNull()
    expect(charges()).toBe(1)
  })

  it('refuses a missing key, a malformed key, and a reused key with a different body', async () => {
    const { app } = await paymentsApp()
    const alice = client(app).actingAs(demoTokens.alice)
    ;(await alice.postJson('/api/payments', { amount: 1 })).assertProblem(400, 'idempotency_key_required')
    ;(await alice.withHeaders({ 'idempotency-key': 'has space' }).postJson('/api/payments', { amount: 1 })).assertProblem(400, 'idempotency_key_invalid')
    await alice.withHeaders({ 'idempotency-key': 'k' }).postJson('/api/payments', { amount: 1 })
    ;(await alice.withHeaders({ 'idempotency-key': 'k' }).postJson('/api/payments', { amount: 999 })).assertProblem(422, 'idempotency_key_reused')
    ;(await client(app).postJson('/api/optional', {})).assertStatus(200)
  })

  it('never serves one user the response stored for another user\'s key', async () => {
    const { app, charges } = await paymentsApp()
    await client(app).actingAs(demoTokens.alice).withHeaders({ 'idempotency-key': 'shared' }).postJson('/api/payments', { amount: 5 })
    const bob = await client(app).actingAs(demoTokens.bob).withHeaders({ 'idempotency-key': 'shared' }).postJson('/api/payments', { amount: 5 })
    bob.assertStatus(201).assertJsonPath('charge', 2)
    expect(bob.headers.get('idempotent-replayed')).toBeNull()
    expect(charges()).toBe(2)
  })

  it('answers 409 while the first request is still running, and lets a failed one retry', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    const { app } = await customApp({ api: defineRoutes([Route.post('/slow', withIdempotency(async (ctx) => (await gate, ctx.json({ done: true }))))]) })
    const guest = client(app).withHeaders({ 'idempotency-key': 'slow-1' })
    const first = guest.postJson('/api/slow', {})
    ;(await guest.postJson('/api/slow', {})).assertProblem(409, 'idempotency_in_progress')
    release()
    ;(await first).assertStatus(200)
    const failing = await paymentsApp()
    const retry = client(failing.app).withHeaders({ 'idempotency-key': 'b-1' })
    ;(await retry.postJson('/api/broken', {})).assertStatus(500)
    ;(await retry.postJson('/api/broken', {})).assertStatus(500)
    expect(failing.charges()).toBe(2)
  })
})
