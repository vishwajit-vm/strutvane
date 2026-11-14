/**
 * The "many ways" rule (blueprint §5.2): CSRF, auth, can and throttle applied by default, app-wide,
 * per route, per group, per controller, as a handler wrapper and imperatively, all running the same
 * middleware class; plus `route:list --security` and the attack-style CSRF bypass attempts.
 */
import { describe, expect, it } from 'vitest'
import { runConsole, type Output } from '#strutvane/console'
import { Application, StrutvaneError } from '#strutvane/foundation'
import { auth, can, csrf, csrf_field, csrf_meta, csrfToken, HttpContext, throttle, withAuth, withCan, withCsrf, withThrottle, type Next } from '#strutvane/http'
import { defineRoutes, Route } from '#strutvane/routing'
import { client } from '#strutvane/testing'
import { hasAdminRole } from '#strutvane/auth'
import { demoTokens } from '../fixtures/example-app/database/seeders/database.seeder.ts'
import { config } from '../fixtures/example-app/config/index.ts'
import { customApp, exampleApp, testEnv } from './helpers.ts'

const SESSION = 'session-abc'
const cookie = { cookie: `strutvane_session=${SESSION}` }
const token = (): string => csrfToken(SESSION, testEnv.APP_KEY)
const ok = (ctx: HttpContext): Response => ctx.json({ ok: true })

/** A raw POST with a session cookie and nothing proving where it came from. */
async function forgedPost(app: Application, path: string, extra: Record<string, string> = {}): Promise<number> {
  return (await client(app).withHeaders({ ...cookie, ...extra }).postJson(path, {})).status
}

function buffer(): Output & { out: string[]; err: string[] } {
  const out: string[] = []
  const err: string[] = []
  return { out, err, line: (text = '') => out.push(text), error: (text) => err.push(text) }
}

describe('CSRF in every style', () => {
  it('is on by default for web and api routes', async () => {
    const { app } = await customApp({ web: defineRoutes([Route.post('/web-form', ok)]), api: defineRoutes([Route.post('/thing', ok)]) })
    expect(await forgedPost(app, '/web-form')).toBe(419)
    expect(await forgedPost(app, '/api/thing')).toBe(419)
    expect(await forgedPost(app, '/api/thing', { 'x-csrf-token': token() })).toBe(200)
  })

  it('validateCsrfTokens({ except }) exempts matching paths only', async () => {
    const { app } = await customApp({ api: defineRoutes([Route.post('/webhooks/stripe', ok), Route.post('/webhooksx', ok)]) }, (m) => m.validateCsrfTokens({ except: ['api/webhooks/*'] }))
    expect(await forgedPost(app, '/api/webhooks/stripe')).toBe(200)
    expect(await forgedPost(app, '/api/webhooksx')).toBe(419)
  })

  it('validateCsrfTokens({ origins }) trusts an extra exact origin, never a lookalike', async () => {
    const { app } = await customApp({ api: defineRoutes([Route.post('/thing', ok)]) }, (m) => m.validateCsrfTokens({ origins: ['https://admin.example.com'] }))
    expect(await forgedPost(app, '/api/thing', { origin: 'https://admin.example.com' })).toBe(200)
    expect(await forgedPost(app, '/api/thing', { origin: 'https://admin.example.com.evil.net' })).toBe(419)
    expect(await forgedPost(app, '/api/thing', { origin: 'http://admin.example.com' })).toBe(419)
  })

  it('refuses null, "*" and path-carrying trusted origins at boot', async () => {
    const app = Application.configure({ basePath: '.', env: testEnv }).withConfig(config).withMiddleware((m) => m.validateCsrfTokens({ origins: ['null', '*', 'https://a.example.com/path'] })).create()
    const error = await app.boot().then(() => undefined, (caught: unknown) => caught)
    expect(error).toBeInstanceOf(StrutvaneError)
    expect(String((error as StrutvaneError).message)).toMatch(/3 security settings are unsafe/)
  })

  it('route .withoutMiddleware(csrf) opts out; route .middleware(csrf) re-adds it inside an opted-out group', async () => {
    const { app } = await customApp({
      web: defineRoutes([
        Route.post('/hook', ok).withoutMiddleware('csrf'),
        Route.withoutMiddleware('csrf').group([Route.post('/open', ok), Route.post('/guarded', ok).middleware('csrf')]),
        Route.middleware('csrf').group([Route.post('/grouped', ok)]),
      ]),
    })
    expect(await forgedPost(app, '/hook')).toBe(200)
    expect(await forgedPost(app, '/open')).toBe(200)
    expect(await forgedPost(app, '/guarded')).toBe(419)
    expect(await forgedPost(app, '/grouped')).toBe(419)
  })

  it('controller static middleware: csrf({ except }) opts one action out, the rest stay protected', async () => {
    class PaymentController {
      static readonly middleware = [csrf({ except: ['callback'] })]
      callback(ctx: HttpContext): Response {
        return ctx.json({ received: true })
      }
      pay(ctx: HttpContext): Response {
        return ctx.json({ paid: true })
      }
    }
    const { app } = await customApp({ api: defineRoutes([Route.post('/pay/callback', [PaymentController, 'callback']), Route.post('/pay', [PaymentController, 'pay'])]) })
    expect(await forgedPost(app, '/api/pay/callback')).toBe(200)
    expect(await forgedPost(app, '/api/pay')).toBe(419)
  })

  it('withCsrf(handler) protects a plain function, routed or called directly', async () => {
    const handler = withCsrf(async (ctx) => ctx.json({ imported: true }))
    const { app } = await customApp({ web: defineRoutes([Route.withoutMiddleware('csrf').group([Route.post('/import', handler)])]) })
    expect(await forgedPost(app, '/import')).toBe(419)
    expect(await forgedPost(app, '/import', { 'x-csrf-token': token() })).toBe(200)
    // Called directly (no router), the wrapper runs the check itself.
    const direct = new HttpContext({ request: new Request('http://localhost/import', { method: 'POST', headers: cookie }) })
    await expect(app.run(() => handler(direct))).rejects.toMatchObject({ status: 419 })
  })

  it('csrf.verify(ctx) and csrf.token(ctx) work imperatively', async () => {
    const { app } = await customApp({
      web: defineRoutes([
        Route.withoutMiddleware('csrf').group([
          Route.post('/manual', async (ctx) => {
            await csrf.verify(ctx)
            return ctx.json({ ok: true })
          }),
        ]),
        Route.get('/form', (ctx) => ctx.html(`<head>${csrf_meta(ctx)}</head><form method="post">${csrf_field(ctx)}</form><p>${csrf.token(ctx)}</p>`)),
      ]),
    })
    expect(await forgedPost(app, '/manual')).toBe(419)
    expect(await forgedPost(app, '/manual', { 'x-csrf-token': token() })).toBe(200)
    const page = await client(app).withHeaders(cookie).get('/form')
    expect(page.text).toContain(`<input type="hidden" name="_token" value="${token()}">`)
    expect(page.text).toContain(`<meta name="csrf-token" content="${token()}">`)
    // No session, no token: a token bound to nothing would protect nothing.
    ;(await client(app).get('/form')).assertStatus(500)
  })

  it('accepts the _token field of a urlencoded form', async () => {
    const { app } = await customApp({ web: defineRoutes([Route.post('/form', ok)]) })
    const form = client(app).withHeaders({ ...cookie, 'content-type': 'application/x-www-form-urlencoded' })
    expect((await form.send('POST', '/form', `title=Hi&_token=${encodeURIComponent(token())}`)).status).toBe(200)
    expect((await form.send('POST', '/form', `title=Hi&_token=${encodeURIComponent(csrfToken('other', testEnv.APP_KEY))}`)).status).toBe(419)
  })

  it('withoutCsrf() works in tests and is refused outside APP_ENV=testing', async () => {
    const { app } = await customApp({ api: defineRoutes([Route.post('/thing', ok)]) })
    ;(await client(app).withHeaders(cookie).withoutCsrf().postJson('/api/thing', {})).assertStatus(200)
    const local = await customApp({ api: defineRoutes([Route.post('/thing', ok)]) }, () => {}, { APP_ENV: 'local' })
    await expect(client(local.app).withHeaders(cookie).withoutCsrf().postJson('/api/thing', {})).rejects.toThrow('withoutCsrf() was used with APP_ENV=local.')
  })
})

describe('the same styles for auth, can and throttle (one generic helper)', () => {
  it('controller entries with only/except, wrappers and imperative checks', async () => {
    class ReportController {
      static readonly middleware = [auth({ except: ['index'] }), can({ params: ['view-reports'], only: ['secret'] }), throttle({ params: ['2', '1'], only: ['index'] })]
      index(ctx: HttpContext): Response {
        return ctx.json({ public: true })
      }
      mine(ctx: HttpContext): Response {
        return ctx.json({ me: ctx.requireUser().id })
      }
      secret(ctx: HttpContext): Response {
        return ctx.json({ secret: true })
      }
    }
    const { app } = await customApp(
      {
        api: defineRoutes([
          Route.get('/reports', [ReportController, 'index']),
          Route.get('/reports/mine', [ReportController, 'mine']),
          Route.get('/reports/secret', [ReportController, 'secret']),
          Route.get('/wrapped/me', withAuth(async (ctx) => ctx.json({ me: ctx.requireUser().id }))),
          Route.get('/wrapped/admin', withAuth(withCan(async (ctx) => ctx.json({ admin: true }), 'view-reports'))),
          Route.get('/wrapped/limited', withThrottle(async (ctx) => ctx.json({ ok: true }), '1', '1')),
          Route.get('/imperative', async (ctx) => {
            await auth.verify(ctx)
            return ctx.json({ me: ctx.requireUser().id })
          }),
        ]),
      },
      (m) => m.defineAbility('view-reports', (user) => hasAdminRole(user)),
    )
    const guest = client(app)
    const alice = client(app).actingAs(demoTokens.alice)
    const admin = client(app).actingAs(demoTokens.admin)
    ;(await guest.getJson('/api/reports')).assertStatus(200)
    ;(await guest.getJson('/api/reports/mine')).assertStatus(401)
    ;(await alice.getJson('/api/reports/mine')).assertStatus(200)
    ;(await alice.getJson('/api/reports/secret')).assertProblem(403, 'forbidden')
    ;(await admin.getJson('/api/reports/secret')).assertStatus(200)
    ;(await guest.getJson('/api/reports')).assertStatus(200)
    ;(await guest.getJson('/api/reports')).assertStatus(429)
    ;(await guest.getJson('/api/wrapped/me')).assertStatus(401)
    ;(await alice.getJson('/api/wrapped/me')).assertStatus(200)
    ;(await alice.getJson('/api/wrapped/admin')).assertStatus(403)
    ;(await admin.getJson('/api/wrapped/admin')).assertStatus(200)
    ;(await guest.getJson('/api/wrapped/limited')).assertStatus(200)
    ;(await guest.getJson('/api/wrapped/limited')).assertStatus(429)
    ;(await guest.getJson('/api/imperative')).assertStatus(401)
    ;(await alice.getJson('/api/imperative')).assertStatus(200)
  })

  it('a wrapped handler runs its middleware once when routed', async () => {
    let runs = 0
    class Counting {
      async handle(_ctx: HttpContext, next: Next): Promise<Response> {
        runs++
        return next()
      }
    }
    const { defineProtection } = await import('#strutvane/http')
    const counted = defineProtection('counted', Counting)
    const { app } = await customApp({ api: defineRoutes([Route.get('/once', counted.wrap(ok))]) }, (m) => m.alias({ counted: Counting }))
    ;(await client(app).getJson('/api/once')).assertStatus(200)
    expect(runs).toBe(1)
  })

  it('refuses contradictions and typos at boot', async () => {
    const bootError = async (routing: Parameters<typeof customApp>[0], configure?: Parameters<typeof customApp>[1]): Promise<StrutvaneError> => {
      const error = await customApp(routing, configure).then(() => undefined, (caught: unknown) => caught)
      if (error instanceof StrutvaneError) return error
      throw new Error(`Expected a boot error, got ${String(error)}`)
    }
    expect((await bootError({ api: defineRoutes([Route.post('/x', ok).middleware('auth').withoutMiddleware('auth')]) })).code).toBe('MIDDLEWARE_CONFLICT')
    expect((await bootError({ api: defineRoutes([Route.post('/x', ok).withoutMiddleware('cfrs')]) })).hint).toBe('Did you mean "csrf"?')
    expect((await bootError({ api: defineRoutes([Route.get('/x', ok).middleware('can:view-repots')]) }, (m) => m.defineAbility('view-reports', () => true))).hint).toBe('Did you mean "view-reports"?')
    class Typo {
      static readonly middleware = [auth({ only: ['indx'] })]
      index(ctx: HttpContext): Response {
        return ctx.json({})
      }
    }
    expect((await bootError({ api: defineRoutes([Route.get('/x', [Typo, 'index'])]) })).hint).toBe('Did you mean "index"?')
    class NotProtections {
      static readonly middleware = ['auth']
      index(ctx: HttpContext): Response {
        return ctx.json({})
      }
    }
    expect((await bootError({ api: defineRoutes([Route.get('/x', [NotProtections, 'index'])]) })).code).toBe('INVALID_CONTROLLER_MIDDLEWARE')
  })

  it('an ability must return exactly true', async () => {
    const { app } = await customApp({ api: defineRoutes([Route.get('/x', ok).middleware('can:truthy')]) }, (m) => m.defineAbility('truthy', () => 'yes' as unknown as boolean))
    ;(await client(app).getJson('/api/x')).assertStatus(403)
  })
})

describe('route:list --security', () => {
  it('shows protections, flags every opt-out and unprotected unsafe routes', async () => {
    class HookController {
      static readonly middleware = [csrf({ except: ['receive'] })]
      receive(ctx: HttpContext): Response {
        return ctx.json({})
      }
    }
    const { app } = await customApp(
      {
        web: defineRoutes([Route.post('/hook', ok).withoutMiddleware('csrf'), Route.withoutMiddleware('csrf').group([Route.post('/grouped', ok)])]),
        api: defineRoutes([Route.post('/webhooks/stripe', ok), Route.post('/receive', [HookController, 'receive']), Route.get('/me', ok).middleware('auth')]),
      },
      (m) => m.validateCsrfTokens({ except: ['api/webhooks/*'] }),
    )
    const output = buffer()
    expect(await runConsole(app, ['route:list', '--security', '--json'], { output })).toBe(0)
    const rows = JSON.parse(output.out.join('\n')) as { uri: string; protections: string[]; optOuts: { alias: string; source: string; detail?: string }[]; warnings: string[] }[]
    const row = (uri: string) => rows.find((entry) => entry.uri === uri)
    expect(row('/hook')?.optOuts).toEqual([{ alias: 'csrf', source: 'route' }])
    expect(row('/grouped')?.optOuts).toEqual([{ alias: 'csrf', source: 'group' }])
    expect(row('/api/webhooks/stripe')?.optOuts).toEqual([{ alias: 'csrf', source: 'app', detail: 'api/webhooks/*' }])
    expect(row('/api/receive')?.optOuts).toEqual([{ alias: 'csrf', source: 'controller' }])
    expect(row('/api/me')?.protections).toEqual(['csrf', 'auth', 'throttle:api'])
    const table = buffer()
    await runConsole(app, ['route:list', '--security'], { output: table })
    expect(table.out.join('\n')).toContain('! csrf (route)')
    expect(table.out.join('\n')).toMatch(/\d+ routes, 4 opt-outs, 0 warnings\./)
  })

  it('warns about unsafe routes without CSRF and developer routes without auth', async () => {
    const app = Application.configure({ basePath: '.', env: testEnv }).withConfig(config).create()
    app.addRoutes(defineRoutes([Route.post('/_tools/reset', ok)]))
    const output = buffer()
    await runConsole(app, ['route:list', '--security', '--json'], { output })
    const [row] = JSON.parse(output.out.join('\n')) as { warnings: string[] }[]
    expect(row?.warnings).toEqual(['unsafe method with no CSRF check', 'developer tool route without auth'])
  })
})

describe('CSRF bypass attempts (attack-style)', () => {
  it('missing Sec-Fetch-Site and Origin needs the token; Referer is never trusted', async () => {
    const { app } = await exampleApp()
    expect(await forgedPost(app, '/api/posts')).toBe(419)
    expect(await forgedPost(app, '/api/posts', { referer: 'http://localhost/posts' })).toBe(419)
    expect(await forgedPost(app, '/api/posts', { 'sec-fetch-site': 'none' })).toBe(419)
  })

  it('null Origin and sibling subdomains never pass, with or without fetch metadata', async () => {
    const { app } = await exampleApp()
    for (const origin of ['null', 'http://evil.localhost', 'http://localhost.evil.com', 'http://localhost:8080', 'https://localhost']) {
      expect(await forgedPost(app, '/api/posts', { origin }), origin).toBe(419)
    }
    expect(await forgedPost(app, '/api/posts', { 'sec-fetch-site': 'same-site', origin: 'http://localhost' })).toBe(419)
  })

  it('method override never turns an unsafe request safe, or a safe one unsafe', async () => {
    const { app } = await exampleApp()
    expect(await forgedPost(app, '/api/posts', { 'x-http-method-override': 'GET' })).toBe(419)
    expect(await forgedPost(app, '/api/posts?_method=GET')).toBe(419)
    // A GET asking to be a POST stays a GET: it lists, it never creates.
    const listing = await client(app).withHeaders({ ...cookie, 'x-http-method-override': 'POST' }).getJson('/api/posts?_method=POST')
    listing.assertStatus(200)
  })

  it('a cookie plus a fake bearer skips CSRF but is never authenticated by the cookie', async () => {
    const { app } = await exampleApp()
    const response = await client(app).withHeaders({ ...cookie, authorization: 'Bearer forged' }).postJson('/api/posts', { title: 'Forged' })
    response.assertProblem(401, 'unauthenticated')
    const ctx = new HttpContext({ request: new Request('http://localhost/', { headers: { ...cookie, authorization: 'Bearer x' } }) })
    expect(ctx.sessionId()).toBeUndefined()
  })

  it('JSON content-type tricks: text/plain bodies are refused, before and after CSRF', async () => {
    const { app } = await exampleApp()
    const body = JSON.stringify({ title: 'Simple request' })
    for (const type of ['text/plain', 'text/plain; charset=application/json', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) {
      const forged = await client(app).withHeaders({ ...cookie, 'content-type': type }).send('POST', '/api/posts', body)
      expect(forged.status, type).toBe(419)
      const bearer = await client(app).actingAs(demoTokens.alice).withHeaders({ 'content-type': type }).send('POST', '/api/posts', body)
      expect(bearer.status, type).toBe(415)
    }
    const json = await client(app).actingAs(demoTokens.alice).withHeaders({ 'content-type': 'application/json; charset=utf-8' }).send('POST', '/api/posts', body)
    expect(json.status).toBe(201)
  })
})
