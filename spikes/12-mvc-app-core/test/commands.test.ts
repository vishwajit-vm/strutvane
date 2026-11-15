/**
 * Group 5: the cache and maintenance commands, keys and env encryption, session:flush and
 * security:check. Every test works on its own copy of the example app (under test/.tmp, so
 * `#strutvane/*` imports resolve when a copy runs as a real `node strut` process).
 */
import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterAll, describe, expect, it } from 'vitest'
import { runConsole, type Output } from '#strutvane/console'
import { Application, ClockToken, defineConfig, LoggerToken, MemoryLogger } from '#strutvane/foundation'
import { Encrypter, Keyring, packSealed, signUrl, verifySignedUrl } from '#strutvane/security'
import { client, refreshDatabase } from '#strutvane/testing'
import { EnsureAdmin } from '../fixtures/example-app/app/http/middleware/ensure-admin.ts'
import { Author } from '../fixtures/example-app/app/models/author.ts'
import { Post } from '../fixtures/example-app/app/models/post.ts'
import { providers } from '../fixtures/example-app/bootstrap/providers.ts'
import { config } from '../fixtures/example-app/config/index.ts'
import api from '../fixtures/example-app/routes/api.ts'
import web from '../fixtures/example-app/routes/web.ts'
import { AuditRunnerToken } from '../src/console/commands/security-check.ts'
import { retryTransient, writeFileAtomic } from '../src/support/atomic-write.ts'
import { NOW, testEnv } from './helpers.ts'

const ROOT = join(import.meta.dirname, '..')
const EXAMPLE = join(ROOT, 'fixtures', 'example-app')
const SCRATCH = join(ROOT, 'test', '.tmp')
afterAll(() => rmSync(SCRATCH, { recursive: true, force: true }))

let copies = 0
/** A fresh copy of the example app, without its tests or any generated state. */
function appCopy(name: string): string {
  const target = join(SCRATCH, `${name}-${process.pid}-${Date.now()}-${copies++}`)
  mkdirSync(SCRATCH, { recursive: true })
  cpSync(EXAMPLE, target, { recursive: true, filter: (source) => !/[\\/](tests|framework|cache)([\\/]|$)/.test(source.slice(EXAMPLE.length)) })
  return target
}

/** The example app, built on another base path. */
function appAt(basePath: string, env: Readonly<Record<string, string>> = {}, files = config): { app: Application; logger: MemoryLogger } {
  const app = Application.configure({ basePath, env: { ...testEnv, ...env } })
    .withConfig(files)
    .withProviders(providers)
    .withRouting({ web, api, health: '/up', bindings: { post: Post, author: Author } })
    .withMiddleware((middleware) => middleware.alias({ admin: EnsureAdmin }))
    .create()
  const logger = new MemoryLogger()
  app.container.instance(LoggerToken, logger)
  app.container.instance(ClockToken, () => NOW)
  return { app, logger }
}

function buffer(): Output & { out: string[]; err: string[]; text: () => string } {
  const out: string[] = []
  const err: string[] = []
  return { out, err, line: (text = '') => out.push(text), error: (text) => err.push(text), text: () => [...out, ...err].join('\n') }
}

async function strut(app: Application, argv: string[]): Promise<{ code: number; text: string; out: string }> {
  const output = buffer()
  const code = await runConsole(app, argv, { output, now: () => NOW })
  return { code, text: output.text(), out: output.out.join('\n') }
}

/** Every file under a folder, for "this secret is nowhere on disk" checks. */
function allText(folder: string): string {
  return readdirSync(folder, { recursive: true, encoding: 'utf8' })
    .map((name) => join(folder, name))
    .filter((path) => statSync(path).isFile())
    .map((path) => readFileSync(path, 'latin1'))
    .join('\n')
}

describe('config:cache, route:cache, event:cache, optimize', () => {
  it('caches config encrypted, uses it on the next boot, and ignores env changes until cleared', async () => {
    const base = appCopy('config')
    const first = appAt(base, { DB_PASSWORD: 'db-password-secret' })
    expect((await strut(first.app, ['config:cache'])).text).toContain('Configuration cached')
    const file = readFileSync(join(base, 'bootstrap', 'cache', 'config.json'), 'utf8')
    for (const secret of ['db-password-secret', testEnv.APP_KEY, 'Blog Test']) expect(file).not.toContain(secret)
    const second = appAt(base, { APP_NAME: 'Changed in .env' })
    await second.app.boot()
    expect(second.app.cacheStatus.config).toBe('used')
    expect(second.app.config.get('app.name')).toBe('Blog Test')
    await strut(second.app, ['config:clear'])
    const third = appAt(base, { APP_NAME: 'Changed in .env' })
    await third.app.boot()
    expect(third.app.config.get('app.name')).toBe('Changed in .env')
  })

  it('keeps optional (unset) values as keys, so config() reads them the same from the cache', async () => {
    const base = appCopy('undefined')
    await strut(appAt(base).app, ['config:cache'])
    const cached = appAt(base)
    await cached.app.boot()
    expect(cached.app.cacheStatus.config).toBe('used')
    expect(cached.app.config.has('database.connections.mysql.password')).toBe(true)
    expect(cached.app.config.get('database.connections.mysql.password')).toBeUndefined()
  })

  it('ignores, with a warning, a cache from another APP_KEY, other code, or edited by hand', async () => {
    const base = appCopy('stale')
    await strut(appAt(base).app, ['config:cache'])
    const otherKey = appAt(base, { APP_KEY: `base64:${randomBytes(32).toString('base64')}` })
    await otherKey.app.boot()
    expect(otherKey.app.cacheStatus.config).toBe('ignored')
    expect(otherKey.logger.entries.map((entry) => entry.message).join('\n')).toContain('built with a different APP_KEY')

    writeFileSync(join(base, 'routes', 'web.ts'), `${readFileSync(join(base, 'routes', 'web.ts'), 'utf8')}\n// a deploy changed this\n`)
    const newCode = appAt(base)
    await newCode.app.boot()
    expect(newCode.app.cacheStatus.config).toBe('ignored')
    expect(newCode.logger.entries.map((entry) => entry.message).join('\n')).toContain('built from another version of the code')

    await strut(appAt(base).app, ['config:cache'])
    const path = join(base, 'bootstrap', 'cache', 'config.json')
    const cache = JSON.parse(readFileSync(path, 'utf8')) as { payload: string }
    const bytes = Buffer.from(cache.payload, 'base64')
    bytes[bytes.length - 1] = (bytes[bytes.length - 1] ?? 0) ^ 1
    writeFileSync(path, JSON.stringify({ ...cache, payload: bytes.toString('base64') }))
    const tampered = appAt(base)
    await tampered.app.boot()
    expect(tampered.app.cacheStatus.config).toBe('ignored')
    expect(tampered.logger.entries.map((entry) => entry.message).join('\n')).toContain('changed after it was written')
  })

  it('route:cache lets boot skip the route checks, and a stale table is ignored', async () => {
    const base = appCopy('routes')
    const first = appAt(base)
    expect((await strut(first.app, ['route:cache'])).text).toMatch(/✔ \d+ routes cached/)
    const second = appAt(base)
    await second.app.boot()
    expect(second.app.cacheStatus.routes).toBe('used')
    // Same code, different table (a provider added a route): the cache no longer describes it.
    const extra = appAt(base)
    extra.app.addRoutes((await import('#strutvane/routing')).defineRoutes([(await import('#strutvane/routing')).Route.get('/extra', (ctx) => ctx.json({}))]))
    await extra.app.boot()
    expect(extra.app.cacheStatus.routes).toBe('ignored')
    expect(extra.logger.entries.map((entry) => entry.message).join('\n')).toContain('the routes changed since it was built')
    expect((await strut(appAt(base).app, ['route:clear'])).text).toContain('Route cache cleared')
  })

  it('discovers listeners, caches them, lists them and dispatches to them', async () => {
    const base = appCopy('events')
    const { app, logger } = appAt(base)
    const listed = await strut(app, ['event:list', '--json'])
    expect(JSON.parse(listed.out)).toEqual([{ event: 'post.published', listeners: ['LogPostPublished (app/listeners/log-post-published.listener.ts)'] }])
    await app.run(() => app.events.dispatch('post.published', { id: 7 }))
    expect(logger.entries.some((entry) => entry.message === 'Post published' && entry.context['post'] === '7')).toBe(true)
    expect((await strut(appAt(base).app, ['event:cache'])).text).toContain('1 listener cached')
    const cached = appAt(base)
    await cached.app.boot()
    expect(cached.app.cacheStatus.events).toBe('used')
  })

  it('optimize caches everything and optimize:clear removes everything', async () => {
    const base = appCopy('optimize')
    const optimize = await strut(appAt(base).app, ['optimize'])
    expect(optimize.text).toMatch(/Cached: configuration, \d+ routes, 1 listener\./)
    const booted = appAt(base)
    await booted.app.boot()
    expect(booted.app.cacheStatus).toEqual({ config: 'used', routes: 'used', events: 'used' })
    const clear = await strut(appAt(base).app, ['optimize:clear'])
    expect(clear.text).toContain('Configuration cache cleared')
    expect(readdirSync(join(base, 'bootstrap', 'cache'))).toEqual([])
  })

  it('refuses to cache config that JSON cannot hold exactly', async () => {
    const base = appCopy('uncacheable')
    const files = { ...config, hooks: defineConfig(() => ({ onBoot: () => 'code' })) }
    const result = await strut(appAt(base, {}, files as typeof config).app, ['config:cache'])
    expect(result.code).toBe(1)
    expect(result.text).toContain('config("hooks.onBoot") is a function, which can\'t be cached.')
  })
})

describe('atomic writes on Windows', () => {
  it('retries transient EPERM/EBUSY/EACCES, then succeeds', () => {
    let calls = 0
    retryTransient(() => {
      calls++
      if (calls < 3) throw Object.assign(new Error('locked'), { code: calls === 1 ? 'EPERM' : 'EBUSY' })
    })
    expect(calls).toBe(3)
  })

  it('gives up after the last attempt, and never retries a real error', () => {
    let calls = 0
    expect(() => retryTransient(() => {
      calls++
      throw Object.assign(new Error('denied'), { code: 'EACCES' })
    })).toThrow('denied')
    expect(calls).toBe(8)
    let enoent = 0
    expect(() => retryTransient(() => {
      enoent++
      throw Object.assign(new Error('gone'), { code: 'ENOENT' })
    })).toThrow('gone')
    expect(enoent).toBe(1)
  })

  it('leaves no temporary files behind', () => {
    const folder = join(appCopy('atomic'), 'out')
    for (let index = 0; index < 20; index++) writeFileAtomic(join(folder, 'state.json'), String(index))
    expect(readdirSync(folder)).toEqual(['state.json'])
    expect(readFileSync(join(folder, 'state.json'), 'utf8')).toBe('19')
  })
})

describe('cache:clear and cache:forget', () => {
  it('flushes and forgets in the file store, with a did-you-mean for stores', async () => {
    const base = appCopy('appcache')
    const { app } = appAt(base)
    await app.boot()
    const { CacheManagerToken } = await import('../src/cache/store.ts')
    const store = app.make(CacheManagerToken).store()
    store?.put('stats', { posts: 3 }, NOW, 60)
    store?.put('other', 1, NOW)
    expect(store?.get('stats', NOW)).toEqual({ posts: 3 })
    expect(store?.get('stats', new Date(NOW.getTime() + 61_000))).toBeUndefined()
    expect((await strut(app, ['cache:forget', 'stats'])).text).toContain('Removed "stats"')
    expect((await strut(app, ['cache:forget', 'stats'])).text).toContain('was not in the "file" store')
    expect((await strut(app, ['cache:clear'])).text).toContain('1 entry removed from the "file" store')
    const typo = await strut(app, ['cache:clear', '--store=flie'])
    expect(typo.code).toBe(1)
    expect(typo.text).toContain('Did you mean "file"?')
  })
})

describe('key:generate and key:rotate', () => {
  it('writes a strong key without printing it, and refuses to replace one', async () => {
    const base = appCopy('keygen')
    const { app } = appAt(base)
    const result = await strut(app, ['key:generate'])
    expect(result.text).toContain('Application key set in .env.')
    const key = parseEnv(readFileSync(join(base, '.env'), 'utf8'))['APP_KEY'] ?? ''
    expect(key).toMatch(/^base64:[A-Za-z0-9+/]{43}=$/)
    expect(result.text).not.toContain(key)
    const again = await strut(app, ['key:generate'])
    expect(again.code).toBe(1)
    expect(again.text).toContain('key:rotate')
    expect((await strut(app, ['key:generate', '--force'])).code).toBe(0)
    expect(parseEnv(readFileSync(join(base, '.env'), 'utf8'))['APP_KEY']).not.toBe(key)
    expect((await strut(app, ['key:generate', '--show'])).out).toMatch(/^base64:/)
  })

  it('refuses a production .env without --force', async () => {
    const base = appCopy('keyprod')
    writeFileSync(join(base, '.env'), 'APP_ENV=production\nAPP_KEY=\n')
    const result = await strut(appAt(base).app, ['key:generate'])
    expect(result.code).toBe(1)
    expect(result.text).toContain('APP_ENV=production')
  })

  it('rotates: old encrypted values and signed links keep working, new ones use the new key', async () => {
    const base = appCopy('rotate')
    const original = `base64:${randomBytes(32).toString('base64')}`
    writeFileSync(join(base, '.env'), `APP_NAME="Blog"\n# comment kept\nAPP_KEY=${original}\n`)
    const before = new Encrypter(Keyring.from(original))
    const secret = before.encryptString('card-4111')
    const link = signUrl('/downloads/7', Keyring.from(original))
    const result = await strut(appAt(base).app, ['key:rotate'])
    expect(result.text).toContain('the old key is first in APP_PREVIOUS_KEYS')
    const text = readFileSync(join(base, '.env'), 'utf8')
    expect(text).toContain('# comment kept')
    const env = parseEnv(text)
    expect(env['APP_KEY']).not.toBe(original)
    expect(env['APP_PREVIOUS_KEYS']).toBe(original)
    const after = Keyring.from(env['APP_KEY'], env['APP_PREVIOUS_KEYS'])
    expect(new Encrypter(after).decryptString(secret)).toBe('card-4111')
    expect(verifySignedUrl(link, after, NOW)).toBe('valid')
    await strut(appAt(base).app, ['key:rotate'])
    expect(parseEnv(readFileSync(join(base, '.env'), 'utf8'))['APP_PREVIOUS_KEYS']?.split(',')).toHaveLength(2)
  })
})

describe('env:encrypt and env:decrypt', () => {
  const production = 'APP_ENV=production\nDB_PASSWORD="s3cret value"\nAPP_KEY=base64:abc\n'

  it('round-trips a file; a generated key is printed once and never written to disk', async () => {
    const base = appCopy('envcrypt')
    writeFileSync(join(base, '.env.production'), production)
    const { app } = appAt(base)
    const encrypted = await strut(app, ['env:encrypt', '--env=production'])
    const key = /(base64:[A-Za-z0-9+/=]{44})/.exec(encrypted.out)?.[1] ?? ''
    expect(key).not.toBe('')
    const file = readFileSync(join(base, '.env.production.encrypted'), 'utf8')
    expect(file.startsWith('STRUTVANE-ENV-1\n')).toBe(true)
    expect(file).not.toContain('s3cret')
    expect(allText(base)).not.toContain(key)
    rmSync(join(base, '.env.production'))
    expect((await strut(app, ['env:decrypt', '--env=production', `--key=${key}`])).code).toBe(0)
    expect(readFileSync(join(base, '.env.production'), 'utf8')).toBe(production)
    const exists = await strut(app, ['env:decrypt', '--env=production', `--key=${key}`])
    expect(exists.code).toBe(1)
    expect(exists.text).toContain('already exists')
  })

  it('takes the key from STRUT_ENV_KEY and writes nothing with a wrong key or a changed file', async () => {
    const base = appCopy('envkey')
    writeFileSync(join(base, '.env.production'), production)
    const { app } = appAt(base)
    const key = `base64:${randomBytes(32).toString('base64')}`
    process.env['STRUT_ENV_KEY'] = key
    try {
      const encrypted = await strut(app, ['env:encrypt', '--env=production'])
      expect(encrypted.text).not.toContain('Decryption key')
    } finally {
      delete process.env['STRUT_ENV_KEY']
    }
    rmSync(join(base, '.env.production'))
    const wrong = await strut(app, ['env:decrypt', '--env=production', `--key=base64:${randomBytes(32).toString('base64')}`])
    expect(wrong.code).toBe(1)
    expect(wrong.text).toContain('nothing was written')
    expect(existsSync(join(base, '.env.production'))).toBe(false)
    expect((await strut(app, ['env:decrypt', '--env=production'])).text).toContain('No decryption key')
    expect((await strut(app, ['env:encrypt', '--env=../../etc'])).text).toContain('is not an environment name')
    writeFileSync(join(base, '.env.production'), production)
    expect((await strut(app, ['env:encrypt', '--env=production', '--key=base64:c2hvcnQ=', '--force'])).text).toContain('32 bytes')
  })

  it('refuses truncated authentication tags (4, 8 and 12 bytes)', async () => {
    const base = appCopy('envtags')
    const { app } = appAt(base)
    const key = `base64:${randomBytes(32).toString('base64')}`
    for (const length of [4, 8, 12]) {
      // iv (12) | short tag | ciphertext: what a forger with a truncated tag would submit.
      const forged = packSealed({ iv: randomBytes(12), tag: randomBytes(length), ciphertext: randomBytes(20) })
      writeFileSync(join(base, '.env.encrypted'), `STRUTVANE-ENV-1\n${forged.toString('base64')}\n`)
      const result = await strut(app, ['env:decrypt', `--key=${key}`, '--force'])
      expect(result.code, `${length}-byte tag`).toBe(1)
      expect(existsSync(join(base, '.env'))).toBe(false)
    }
  })
})

describe('down and up', () => {
  async function running(base: string): Promise<Application> {
    const { app } = appAt(base)
    await refreshDatabase(app)
    return app
  }

  it('answers 503 with Retry-After and Refresh, keeps /up healthy, and survives a restart', async () => {
    const base = appCopy('down')
    const app = await running(base)
    expect((await strut(app, ['down', '--retry=60', '--refresh=15'])).text).toContain('maintenance mode')
    const page = await client(app).getJson('/api/posts')
    page.assertProblem(503, 'maintenance')
    expect(page.headers.get('retry-after')).toBe('60')
    expect(page.headers.get('refresh')).toBe('15')
    ;(await client(app).getJson('/up')).assertStatus(200)
    // A new process (a restart, or another worker) reads the same file.
    const restarted = await running(base)
    ;(await client(restarted).getJson('/api/posts')).assertStatus(503)
    expect((await strut(app, ['up'])).text).toContain('now live')
    ;(await client(restarted).getJson('/api/posts')).assertStatus(200)
    expect((await strut(app, ['up'])).text).toContain('was not in maintenance mode')
  })

  it('works across real processes: `node strut down` in one, requests in another', async () => {
    const base = appCopy('downproc')
    const app = await running(base)
    const env = { ...process.env, ...testEnv }
    const down = spawnSync(process.execPath, ['strut', 'down', '--with-secret'], { cwd: base, env, encoding: 'utf8' })
    expect(down.status).toBe(0)
    ;(await client(app).getJson('/api/posts')).assertStatus(503)
    expect(spawnSync(process.execPath, ['strut', 'up'], { cwd: base, env, encoding: 'utf8' }).status).toBe(0)
    ;(await client(app).getJson('/api/posts')).assertStatus(200)
  })

  it('--with-secret prints the bypass URL once; the secret path sets a bypass cookie', async () => {
    const base = appCopy('secret')
    const app = await running(base)
    const result = await strut(app, ['down', '--with-secret'])
    const secret = /http:\/\/localhost\/([A-Za-z0-9_-]+) /.exec(result.out)?.[1] ?? ''
    expect(secret).toHaveLength(32)
    expect(readFileSync(join(base, 'storage', 'framework', 'down'), 'utf8')).not.toContain(secret)
    const bypass = await app.handle(new Request(`http://localhost/${secret}`))
    expect(bypass.status).toBe(302)
    const cookie = (bypass.headers.get('set-cookie') ?? '').split(';')[0] ?? ''
    expect(bypass.headers.get('set-cookie')).toMatch(/HttpOnly; SameSite=Lax/)
    ;(await client(app).withHeaders({ cookie }).getJson('/api/posts')).assertStatus(200)
    ;(await client(app).getJson(`/${secret}x`)).assertStatus(503)
    ;(await client(app).withHeaders({ cookie: 'strutvane_maintenance=99999999999.forged' }).getJson('/api/posts')).assertStatus(503)
    // A new `down` (new secret) invalidates old cookies.
    await strut(app, ['down', '--secret=team-preview-2026'])
    ;(await client(app).withHeaders({ cookie }).getJson('/api/posts')).assertStatus(503)
    expect((await app.handle(new Request('http://localhost/team-preview-2026'))).status).toBe(302)
    expect((await strut(app, ['down', '--secret=short'])).text).toContain('8 to 128')
  })

  it('--redirect sends every request to a same-origin path, except the health route', async () => {
    const base = appCopy('redirect')
    const app = await running(base)
    await strut(app, ['down', '--redirect=/status'])
    const redirected = await app.handle(new Request('http://localhost/api/posts'))
    expect(redirected.status).toBe(302)
    expect(redirected.headers.get('location')).toBe('/status')
    expect((await app.handle(new Request('http://localhost/status'))).status).toBe(503)
    expect((await app.handle(new Request('http://localhost/up'))).status).toBe(200)
  })

  it.each(['//evil.com', 'https://evil.com', '/%2F%2Fevil.com', '%2F%2Fevil.com', '/\\evil.com', '/%5Cevil.com', 'http://localhost/status', 'javascript:alert(1)', '/.//evil.com'])('refuses --redirect=%s', async (value) => {
    const base = appCopy('badredirect')
    const app = await running(base)
    const result = await strut(app, ['down', `--redirect=${value}`])
    expect(result.code).toBe(1)
    expect(result.text).toContain('--redirect must be a path on this site')
    expect(existsSync(join(base, 'storage', 'framework', 'down'))).toBe(false)
  })

  it('--render shows a pre-rendered page, and only from resources/views', async () => {
    const base = appCopy('render')
    mkdirSync(join(base, 'resources', 'views'), { recursive: true })
    writeFileSync(join(base, 'resources', 'views', 'maintenance.html'), '<h1>Back at noon</h1>')
    writeFileSync(join(base, '.env'), 'APP_KEY=leak-me-if-you-can-0123456789abcdef\n')
    const app = await running(base)
    await strut(app, ['down', '--render=maintenance.html'])
    const page = await app.handle(new Request('http://localhost/', { headers: { accept: 'text/html' } }))
    expect(page.status).toBe(503)
    expect(await page.text()).toBe('<h1>Back at noon</h1>')
    for (const file of ['../../.env', '../../.env.html', 'missing.html', 'maintenance.txt']) {
      expect((await strut(app, ['down', `--render=${file}`])).text, file).toContain('--render')
    }
  })

  it('a corrupt state file keeps the app down (fail closed)', async () => {
    const base = appCopy('corrupt')
    const app = await running(base)
    mkdirSync(join(base, 'storage', 'framework'), { recursive: true })
    writeFileSync(join(base, 'storage', 'framework', 'down'), '{not json')
    ;(await client(app).getJson('/api/posts')).assertStatus(503)
  })
})

describe('session:flush', () => {
  it('deletes every session file', async () => {
    const base = appCopy('sessions')
    const folder = join(base, 'storage', 'framework', 'sessions')
    mkdirSync(folder, { recursive: true })
    for (const name of ['a', 'b', 'c']) writeFileSync(join(folder, name), '{}')
    const { app } = appAt(base)
    expect((await strut(app, ['session:flush'])).text).toContain('3 sessions deleted')
    expect(readdirSync(folder)).toEqual([])
  })
})

describe('security:check', () => {
  type Report = { passed: boolean; findings: { check: string; status: string; detail: string }[] }
  const statusOf = (report: Report, check: string): string | undefined => report.findings.find((finding) => finding.check === check)?.status

  it('passes a sound local app, warning about exposed developer routes', async () => {
    const result = await strut(appAt(appCopy('check')).app, ['security:check', '--json'])
    const report = JSON.parse(result.out) as Report
    expect(result.code).toBe(0)
    expect(report.passed).toBe(true)
    expect(statusOf(report, 'dev-tools')).toBe('warn')
    expect(report.findings.find((finding) => finding.check === 'dev-tools')?.detail).toContain('/_diagnostics/boom')
    expect(statusOf(report, 'npm-audit')).toBe('skip')
  })

  it('fails debug in production, a non-https APP_URL, insecure cookies and exposed tools', async () => {
    const result = await strut(appAt(appCopy('checkprod'), { APP_ENV: 'production', APP_DEBUG: 'true', APP_URL: 'http://localhost' }).app, ['security:check', '--json'])
    const report = JSON.parse(result.out) as Report
    expect(result.code).toBe(1)
    for (const check of ['debug', 'https', 'cookies', 'dev-tools']) expect(statusOf(report, check), check).toBe('fail')
    expect(statusOf(report, 'boot')).toBe('pass')
  })

  it('reports a weak key and a refused boot (CORS * with credentials)', async () => {
    const base = appCopy('checkcors')
    const app = Application.configure({ basePath: base, env: { ...testEnv, APP_KEY: 'too-short' } })
      .withConfig(config)
      .withMiddleware((m) => m.cors({ origins: ['*'], credentials: true }))
      .create()
    const report = JSON.parse((await strut(app, ['security:check', '--json'])).out) as Report
    expect(statusOf(report, 'app-key')).toBe('fail')
    expect(statusOf(report, 'boot')).toBe('fail')
    const cors = Application.configure({ basePath: base, env: testEnv }).withConfig(config).withMiddleware((m) => m.cors({ origins: ['*'], credentials: true })).create()
    const corsReport = JSON.parse((await strut(cors, ['security:check', '--json'])).out) as Report
    expect(corsReport.findings.find((finding) => finding.check === 'boot')?.detail).toContain('can\'t be combined with credentials')
  })

  it('--audit fails on high or critical advisories', async () => {
    const { app } = appAt(appCopy('audit'))
    app.container.instance(AuditRunnerToken, async () => ({ high: 2, critical: 1 }))
    const result = await strut(app, ['security:check', '--audit'])
    expect(result.code).toBe(1)
    expect(result.text).toContain('1 critical and 2 high advisories')
  })
})
