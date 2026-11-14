/**
 * Group 4: the boot guards (debug in production, weak or missing keys) and the "secrets never in
 * logs" rule checked across a whole hostile session.
 */
import { randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { runConsole, type Output } from '#strutvane/console'
import { StrutvaneError } from '#strutvane/foundation'
import { client } from '#strutvane/testing'
import { createApp } from '../fixtures/example-app/bootstrap/app.ts'
import { demoTokens } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { exampleApp, testEnv } from './helpers.ts'

function buffer(): Output & { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { out, err, line: (text = '') => out.push(text), error: (text) => err.push(text) }
}

async function bootError(env: Readonly<Record<string, string>>): Promise<StrutvaneError> {
  const error = await createApp({ ...testEnv, ...env }).boot().then(() => undefined, (caught: unknown) => caught)
  if (error instanceof StrutvaneError) return error
  throw new Error(`Expected boot to fail, got ${String(error)}`)
}

describe('debug in production is refused at boot', () => {
  it('refuses APP_DEBUG=true with APP_ENV=production', async () => {
    const error = await bootError({ APP_ENV: 'production', APP_DEBUG: 'true' })
    expect(error.code).toBe('DEBUG_IN_PRODUCTION')
    expect(error.hint).toContain('--force-debug')
  })

  it('starts with --force-debug, logs a warning, and still never shows debug details', async () => {
    const { app, logger } = await exampleApp({ APP_ENV: 'production', APP_DEBUG: 'true' }, { forceDebug: true })
    expect(logger.entries.some((entry) => entry.level === 'warn' && entry.message.startsWith('Started with --force-debug'))).toBe(true)
    expect(app.showsDebugDetails).toBe(false)
  })

  it('node strut refuses without the flag and accepts it as a global option', async () => {
    const refused = buffer()
    expect(await runConsole(createApp({ ...testEnv, APP_ENV: 'production', APP_DEBUG: 'true' }), ['about'], { output: refused })).toBe(1)
    expect(refused.err.join('\n')).toContain('APP_DEBUG=true with APP_ENV=production')
    const forced = buffer()
    expect(await runConsole(createApp({ ...testEnv, APP_ENV: 'production', APP_DEBUG: 'true' }), ['about', '--force-debug', '--json'], { output: forced })).toBe(0)
  })

  it('debug off in production, and debug on locally, both boot normally', async () => {
    await expect(createApp({ ...testEnv, APP_ENV: 'production', APP_DEBUG: 'false' }).boot()).resolves.toBeDefined()
    await expect(createApp({ ...testEnv, APP_ENV: 'local', APP_DEBUG: 'true' }).boot()).resolves.toBeDefined()
  })
})

describe('APP_KEY is required and strong', () => {
  it.each([
    ['too short', 'short-key', 'APP_KEY is too short: 9 bytes, at least 32 are needed.'],
    ['short base64', `base64:${randomBytes(16).toString('base64')}`, 'APP_KEY is too short: 16 bytes, at least 32 are needed.'],
    ['broken base64', 'base64:%%%not-base64%%%', 'APP_KEY starts with "base64:" but the rest is not valid base64.'],
  ])('refuses a key that is %s, without printing it', async (_label, key, message) => {
    const error = await bootError({ APP_KEY: key })
    expect(error.code).toBe('INVALID_APP_KEY')
    expect(error.message).toBe(message)
    expect(`${error.message} ${error.hint}`).not.toContain(key)
    expect(error.hint).toContain('node strut key:generate')
  })

  it('refuses a missing key and a weak previous key', async () => {
    const missing = await createApp({ ...testEnv, APP_KEY: '' }).boot().then(() => undefined, (caught: unknown) => caught)
    expect(String(missing)).toContain('APP_KEY is required')
    expect((await bootError({ APP_PREVIOUS_KEYS: `base64:${randomBytes(32).toString('base64')},tiny` })).message).toBe('APP_PREVIOUS_KEYS[1] is too short: 4 bytes, at least 32 are needed.')
  })
})

describe('secrets never reach the logs', () => {
  it('a hostile session logs nothing secret: keys, tokens, cookies, CSRF tokens, report URLs', async () => {
    const { app, logger } = await exampleApp({ APP_DEBUG: 'false', APP_ENV: 'local' })
    const session = 'session-very-secret-0001'
    const secrets = [testEnv.APP_KEY, demoTokens.alice, session, 'hunter2-password', 'reset-token-xyz']
    await client(app).actingAs(demoTokens.alice).postJson('/api/posts', { title: 'Hi', body: 'hunter2-password' })
    await client(app).withHeaders({ cookie: `strutvane_session=${session}` }).postJson('/api/posts', { password: 'hunter2-password' })
    await client(app).actingAs('wrong-token-hunter2-password').getJson('/api/me')
    await client(app).get('/_diagnostics/boom?token=reset-token-xyz')
    await app.handle(new Request('http://localhost/_strutvane/csp-report', { method: 'POST', headers: { 'content-type': 'application/csp-report' }, body: JSON.stringify({ 'csp-report': { 'document-uri': 'http://localhost/reset?token=reset-token-xyz', 'blocked-uri': `https://x.example/?k=${session}` } }) }))
    const logged = JSON.stringify(logger.entries)
    expect(logger.entries.length).toBeGreaterThan(0)
    for (const secret of secrets) expect(logged, secret).not.toContain(secret)
  })
})
