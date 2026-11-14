/**
 * Group 2 of the security kit: security headers with a per-request CSP nonce, the CSP report
 * endpoint, trusted hosts, trusted proxies, body/JSON limits with prototype-pollution-safe
 * parsing, and CORS (off by default, `*` with credentials refused at boot). Attack-style cases
 * include Host header poisoning, X-Forwarded spoofing, header injection and pollution payloads.
 */
import { describe, expect, it } from 'vitest'
import { Application, StrutvaneError } from '#strutvane/foundation'
import type { HttpContext } from '#strutvane/http'
import { MiddlewareConfig } from '#strutvane/http'
import { defineRoutes, Route } from '#strutvane/routing'
import { client } from '#strutvane/testing'
import { demoTokens } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { config } from '../fixtures/example-app/config/index.ts'
import { customApp, exampleApp, testEnv } from './helpers.ts'

const echo = (ctx: HttpContext): Response => ctx.json({ ip: ctx.ip, secure: ctx.state.secure, host: ctx.state.host, nonce: ctx.nonce })
const echoBody = async (ctx: HttpContext): Promise<Response> => ctx.json({ body: await ctx.body() })

/** Send a raw request with a chosen socket peer. */
function send(app: Application, url: string, init: RequestInit = {}, ip = '203.0.113.10'): Promise<Response> {
  return app.handle(new Request(url, init), { ip })
}

async function bootFailure(configure: (middleware: MiddlewareConfig) => void, env: Readonly<Record<string, string>> = {}): Promise<string> {
  const app = Application.configure({ basePath: '.', env: { ...testEnv, ...env } }).withConfig(config).withMiddleware(configure).create()
  const error = await app.boot().then(() => undefined, (caught: unknown) => caught)
  if (error instanceof StrutvaneError) return error.message
  throw new Error('Expected boot to fail.')
}

describe('security headers', () => {
  it('are on every response, errors and 404s included', async () => {
    const { app } = await exampleApp()
    for (const path of ['/api/posts', '/nowhere', '/_diagnostics/boom']) {
      const response = await send(app, `http://localhost${path}`, { headers: { accept: 'application/json' } })
      expect(response.headers.get('x-content-type-options'), path).toBe('nosniff')
      expect(response.headers.get('referrer-policy')).toBe('strict-origin-when-cross-origin')
      expect(response.headers.get('cross-origin-opener-policy')).toBe('same-origin')
      expect(response.headers.get('cross-origin-resource-policy')).toBe('same-origin')
      expect(response.headers.get('permissions-policy')).toContain('camera=()')
      expect(response.headers.get('x-frame-options')).toBe('DENY')
      expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'")
    }
  })

  it('gives each response a fresh CSP nonce, the same one the view sees', async () => {
    const { app } = await customApp({ web: defineRoutes([Route.get('/page', echo)]) })
    const first = await send(app, 'http://localhost/page')
    const second = await send(app, 'http://localhost/page')
    const nonce = ((await first.json()) as { nonce: string }).nonce
    expect(first.headers.get('content-security-policy')).toContain(`script-src 'self' 'nonce-${nonce}'`)
    expect(first.headers.get('content-security-policy')).toContain('report-uri /_strutvane/csp-report')
    expect(second.headers.get('content-security-policy')).not.toContain(nonce)
  })

  it('keeps a CSP the response set itself (the debug page has its own)', async () => {
    const { app } = await exampleApp()
    const page = await send(app, 'http://localhost/_diagnostics/boom', { headers: { accept: 'text/html' } })
    expect(page.status).toBe(500)
    expect(page.headers.get('content-security-policy')).toMatch(/^default-src 'none'/)
  })

  it('sends HSTS only in production over HTTPS', async () => {
    const routes = { web: defineRoutes([Route.get('/page', echo)]) }
    const testing = await customApp(routes)
    expect((await send(testing.app, 'http://localhost/page')).headers.get('strict-transport-security')).toBeNull()
    const production = await customApp(routes, (m) => m.trustProxies({ at: ['10.0.0.0/8'] }), { APP_ENV: 'production', APP_DEBUG: 'false', APP_URL: 'https://blog.example.com' })
    const overHttps = await send(production.app, 'http://blog.example.com/page', { headers: { 'x-forwarded-proto': 'https' } }, '10.0.0.5')
    expect(overHttps.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    expect(overHttps.headers.get('content-security-policy')).toContain('upgrade-insecure-requests')
    const plain = await send(production.app, 'http://blog.example.com/page', {}, '10.0.0.5')
    expect(plain.headers.get('strict-transport-security')).toBeNull()
    // A client that is not a trusted proxy can't claim HTTPS.
    const spoofed = await send(production.app, 'http://blog.example.com/page', { headers: { 'x-forwarded-proto': 'https' } }, '198.51.100.9')
    expect(spoofed.headers.get('strict-transport-security')).toBeNull()
  })

  it('adds configured CSP sources and supports report-only', async () => {
    const { app } = await customApp({ web: defineRoutes([Route.get('/page', echo)]) }, (m) => m.securityHeaders({ csp: { 'img-src': ['https://images.example.com'], 'frame-ancestors': ['https://partner.example.com'] }, cspReportOnly: true }))
    const response = await send(app, 'http://localhost/page')
    expect(response.headers.get('content-security-policy')).toBeNull()
    const policy = response.headers.get('content-security-policy-report-only') ?? ''
    expect(policy).toContain("img-src 'self' data: https://images.example.com")
    expect(policy).toContain('frame-ancestors https://partner.example.com')
  })

  it('header injection: CSP sources and header values that smuggle directives or lines are refused at boot', async () => {
    const message = await bootFailure((m) =>
      m.securityHeaders({ csp: { 'script-src': ["'self'; script-src *", 'https://a.example.com\r\nX-Evil: 1', "'unsafe-inline' "], 'bad directive': ['x'] }, permissionsPolicy: 'camera=()\r\nSet-Cookie: a=b', referrerPolicy: 'unsafe-url' }),
    )
    expect(message).toContain('6 security settings are unsafe or invalid')
    expect(message).toContain('would inject another directive')
  })

  it('header injection: a CR/LF in a response header value is a 500, never a second header', async () => {
    const { app, logger } = await customApp({ web: defineRoutes([Route.get('/inject', (ctx) => ctx.json({}, 200, { 'x-name': `a\r\nset-cookie: admin=1` }))]) }, () => {}, { APP_DEBUG: 'false' })
    const response = await send(app, 'http://localhost/inject')
    expect(response.status).toBe(500)
    expect(response.headers.get('set-cookie')).toBeNull()
    expect(logger.entries.some((entry) => entry.level === 'error')).toBe(true)
  })
})

describe('the CSP report endpoint', () => {
  const report = (body: unknown, type = 'application/csp-report'): RequestInit => ({ method: 'POST', headers: { 'content-type': type }, body: JSON.stringify(body) })

  it('logs sanitised violations through the Logger, never query strings or control characters', async () => {
    const { app, logger } = await exampleApp()
    const response = await send(
      app,
      'http://localhost/_strutvane/csp-report',
      report({ 'csp-report': { 'document-uri': 'http://localhost/reset?token=SECRET123', 'effective-directive': 'script-src-elem', 'blocked-uri': 'https://evil.example/x.js?session=SECRET456', 'line-number': 7, 'source-file': 'http://localhost/app.js\n{"level":"error"}' } }),
    )
    expect(response.status).toBe(204)
    const entry = logger.entries.find((candidate) => candidate.message === 'CSP violation')
    expect(entry?.level).toBe('warn')
    expect(entry?.context).toEqual({ directive: 'script-src-elem', blocked: 'https://evil.example', document: '/reset', source: '/app.js%7B%22level%22:%22error%22%7D', line: 7 })
    expect(JSON.stringify(logger.entries)).not.toContain('SECRET')
  })

  it('accepts the Reporting API format and caps what it reads', async () => {
    const { app, logger } = await exampleApp()
    const many = Array.from({ length: 30 }, () => ({ type: 'csp-violation', body: { documentURL: 'http://localhost/', effectiveDirective: 'img-src', blockedURL: 'data' } }))
    expect((await send(app, 'http://localhost/_strutvane/csp-report', report(many, 'application/reports+json'))).status).toBe(204)
    expect(logger.entries.filter((entry) => entry.message === 'CSP violation')).toHaveLength(10)
    expect((await send(app, 'http://localhost/_strutvane/csp-report', report({}, 'text/plain'))).status).toBe(415)
    expect((await send(app, 'http://localhost/_strutvane/csp-report', report({ 'csp-report': { pad: 'x'.repeat(20_000) } }))).status).toBe(413)
  })
})

describe('trusted hosts (Host header poisoning)', () => {
  it('refuses a request for a host that is not on the allowlist', async () => {
    const { app } = await exampleApp()
    const poisoned = await send(app, 'http://evil.example/api/posts', { headers: { accept: 'application/json' } })
    expect(poisoned.status).toBe(400)
    const body = await poisoned.text()
    expect(body).toContain('untrusted_host')
    expect(body).not.toContain('evil.example')
    for (const host of ['localhost', '127.0.0.1', '[::1]']) expect((await send(app, `http://${host}/api/posts`)).status, host).toBe(200)
  })

  it('allows only APP_URL in production by default, and patterns when configured', async () => {
    const env = { APP_ENV: 'production', APP_DEBUG: 'false', APP_URL: 'https://blog.example.com' }
    const plain = await customApp({ web: defineRoutes([Route.get('/page', echo)]) }, () => {}, env)
    expect((await send(plain.app, 'https://blog.example.com/page')).status).toBe(200)
    expect((await send(plain.app, 'https://localhost/page')).status).toBe(400)
    expect((await send(plain.app, 'https://evilblog.example.com/page')).status).toBe(400)
    const patterns = await customApp({ web: defineRoutes([Route.get('/page', echo)]) }, (m) => m.trustHosts({ at: ['example.com'], subdomains: true }), env)
    expect((await send(patterns.app, 'https://api.example.com/page')).status).toBe(200)
    expect((await send(patterns.app, 'https://example.com/page')).status).toBe(200)
    expect((await send(patterns.app, 'https://example.com.evil.net/page')).status).toBe(400)
    expect((await send(patterns.app, 'https://notexample.com/page')).status).toBe(400)
  })

  it('X-Forwarded-Host counts only from a trusted proxy, and is then checked too', async () => {
    const { app } = await customApp({ web: defineRoutes([Route.get('/page', echo)]) }, (m) => m.trustProxies({ at: ['10.0.0.0/8'] }))
    const fromClient = await send(app, 'http://localhost/page', { headers: { 'x-forwarded-host': 'evil.example' } }, '198.51.100.9')
    expect(((await fromClient.json()) as { host: string }).host).toBe('localhost')
    expect((await send(app, 'http://localhost/page', { headers: { 'x-forwarded-host': 'evil.example' } }, '10.1.1.1')).status).toBe(400)
  })

  it('refuses "*" as a trusted host at boot', async () => {
    expect(await bootFailure((m) => m.trustHosts({ at: ['*', 'ok.example.com'] }))).toContain('"*" alone would trust every host')
  })
})

describe('trusted proxies (X-Forwarded spoofing)', () => {
  const routes = { web: defineRoutes([Route.get('/ip', echo)]) }
  const ipOf = async (response: Response): Promise<string> => ((await response.json()) as { ip: string }).ip

  it('ignores X-Forwarded-For from an untrusted peer', async () => {
    const { app } = await customApp(routes, (m) => m.trustProxies({ at: ['10.0.0.0/8'] }))
    expect(await ipOf(await send(app, 'http://localhost/ip', { headers: { 'x-forwarded-for': '1.2.3.4' } }, '198.51.100.9'))).toBe('198.51.100.9')
    // No proxies configured at all: never trusted, whoever sends it.
    const none = await customApp(routes)
    expect(await ipOf(await send(none.app, 'http://localhost/ip', { headers: { 'x-forwarded-for': '1.2.3.4' } }, '10.0.0.5'))).toBe('10.0.0.5')
  })

  it('takes the right-most untrusted address, so a client-written left entry is ignored', async () => {
    const { app } = await customApp(routes, (m) => m.trustProxies({ at: ['10.0.0.0/8', '192.168.1.1'] }))
    expect(await ipOf(await send(app, 'http://localhost/ip', { headers: { 'x-forwarded-for': '6.6.6.6, 203.0.113.7, 192.168.1.1' } }, '10.0.0.5'))).toBe('203.0.113.7')
    expect(await ipOf(await send(app, 'http://localhost/ip', { headers: { 'x-forwarded-for': '2001:db8::1' } }, '10.0.0.5'))).toBe('2001:db8:0:0:0:0:0:1')
  })

  it('distrusts the whole header when any entry is garbage', async () => {
    const { app } = await customApp(routes, (m) => m.trustProxies({ at: ['10.0.0.0/8'] }))
    for (const header of ['not-an-ip, 203.0.113.7', '203.0.113.7, 1.2.3.4:80', '127.0.0.1%eth0', '']) {
      expect(await ipOf(await send(app, 'http://localhost/ip', { headers: { 'x-forwarded-for': header } }, '10.0.0.5')), header).toBe('10.0.0.5')
    }
  })

  it('refuses "*" and malformed ranges at boot', async () => {
    expect(await bootFailure((m) => m.trustProxies({ at: ['*', '10.0.0.0/33', '10.0.0.0/8'] }))).toContain('2 security settings are unsafe or invalid')
  })
})

describe('body limits and prototype-pollution-safe JSON', () => {
  const routes = { api: defineRoutes([Route.post('/echo', echoBody)]) }
  const post = (app: Application, body: string) => client(app).actingAs(demoTokens.alice).send('POST', '/api/echo', body)

  it('refuses __proto__ and constructor.prototype payloads anywhere, and nothing is polluted', async () => {
    const { app } = await customApp(routes)
    for (const payload of ['{"__proto__":{"isAdmin":true}}', '{"a":[{"b":{"__proto__":{"x":1}}}]}', '{"constructor":{"prototype":{"isAdmin":true}}}', '{"\\u005f_proto__":{"x":1}}']) {
      ;(await post(app, payload)).assertProblem(400, 'forbidden_json_key')
    }
    expect(({} as Record<string, unknown>)['isAdmin']).toBeUndefined()
    // A plain "constructor" field is fine.
    ;(await post(app, '{"constructor":"Acme Builders"}')).assertStatus(200).assertJsonPath('body.constructor', 'Acme Builders')
  })

  it('refuses deep and key-heavy JSON before parsing it', async () => {
    const { app } = await customApp(routes)
    ;(await post(app, `${'['.repeat(100_000)}${']'.repeat(100_000)}`)).assertProblem(413, 'json_too_deep')
    const keys = `{${Array.from({ length: 1001 }, (_, index) => `"k${index}":1`).join(',')}}`
    ;(await post(app, keys)).assertProblem(413, 'json_too_many_keys')
    ;(await post(app, `"${'x'.repeat(1024 * 1024)}"`)).assertProblem(413, 'payload_too_large')
    ;(await post(app, '{"a":"[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[["}')).assertStatus(200)
  })

  it('takes custom limits and refuses nonsense ones', async () => {
    const { app } = await customApp(routes, (m) => m.limits({ maxDepth: 2, maxKeys: 3 }))
    ;(await post(app, '{"a":{"b":1}}')).assertStatus(200)
    ;(await post(app, '{"a":{"b":{"c":1}}}')).assertProblem(413, 'json_too_deep')
    ;(await post(app, '{"a":1,"b":2,"c":3,"d":4}')).assertProblem(413, 'json_too_many_keys')
    expect(await bootFailure((m) => m.limits({ maxBytes: 0, maxDepth: 1.5, maxKeys: 10_000_000 }))).toContain('3 security settings')
  })
})

describe('CORS', () => {
  const routes = { api: defineRoutes([Route.get('/data', (ctx) => ctx.json({ data: 1 }))]) }
  const preflight = (origin: string, headers = 'content-type'): RequestInit => ({ method: 'OPTIONS', headers: { origin, 'access-control-request-method': 'GET', 'access-control-request-headers': headers } })

  it('is off by default: no CORS headers, no preflight answers', async () => {
    const { app } = await customApp(routes)
    const response = await send(app, 'http://localhost/api/data', { headers: { origin: 'https://app.example.com' } })
    expect(response.headers.get('access-control-allow-origin')).toBeNull()
    expect((await send(app, 'http://localhost/api/data', preflight('https://app.example.com'))).headers.get('access-control-allow-origin')).toBeNull()
  })

  it('answers exact allowed origins only, with Vary: Origin', async () => {
    const { app } = await customApp(routes, (m) => m.cors({ origins: ['https://app.example.com'], credentials: true, exposedHeaders: ['x-ratelimit-remaining'] }))
    const allowed = await send(app, 'http://localhost/api/data', { headers: { origin: 'https://app.example.com' } })
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true')
    expect(allowed.headers.get('access-control-expose-headers')).toBe('x-ratelimit-remaining')
    expect(allowed.headers.get('vary')).toContain('Origin')
    for (const origin of ['https://evil.example', 'null', 'https://app.example.com.evil.net', 'http://app.example.com']) {
      expect((await send(app, 'http://localhost/api/data', { headers: { origin } })).headers.get('access-control-allow-origin'), origin).toBeNull()
    }
    const ok = await send(app, 'http://localhost/api/data', preflight('https://app.example.com'))
    expect(ok.status).toBe(204)
    expect(ok.headers.get('access-control-allow-methods')).toContain('PATCH')
    const odd = await send(app, 'http://localhost/api/data', preflight('https://app.example.com', 'x-evil'))
    expect(odd.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('allows "*" only without credentials', async () => {
    const { app } = await customApp(routes, (m) => m.cors({ origins: ['*'] }))
    expect((await send(app, 'http://localhost/api/data', { headers: { origin: 'https://any.example' } })).headers.get('access-control-allow-origin')).toBe('*')
  })

  it('refuses "*" with credentials and other misconfigurations at boot', async () => {
    const message = await bootFailure((m) => m.cors({ origins: ['*'], credentials: true }))
    expect(message).toContain('origins "*" can\'t be combined with credentials: true')
    expect(await bootFailure((m) => m.cors({ origins: ['null', 'https://a.example.com/path'] }))).toContain('2 security settings')
    expect(await bootFailure((m) => m.cors({ origins: [] }))).toContain('leave CORS off')
  })
})
