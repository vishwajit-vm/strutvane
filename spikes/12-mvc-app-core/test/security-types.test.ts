/**
 * Type-level tests for the security kit's public helpers. `npm test` runs `tsc --noEmit` first,
 * so every `@ts-expect-error` here must really be an error, and every `expectTypeOf` must hold.
 */
import { describe, expectTypeOf, it } from 'vitest'
import { auth, can, csrf, defineProtection, signedRoute, temporarySignedRoute, withCsrf, type ControllerMiddleware, type HttpContext, type Middleware, type Next, type ProtectedHandler, type Protection } from '#strutvane/http'
import { decrypt, encrypt, Encrypter, safeFetch, signUrl, verifySignedUrl, type HttpClientErrorCode, type SafeResponse, type SignatureVerdict } from '#strutvane/security'
import { MiddlewareConfig } from '#strutvane/http'
import { client } from '#strutvane/testing'
import { Post } from '../fixtures/example-app/app/models/post.ts'
import type { Application } from '#strutvane/foundation'

/** Wraps code that must type-check but never run. */
function typeOnly(_check: () => void): void {}

describe('protections', () => {
  it('the controller style returns a controller-middleware entry; options are typed', () => {
    expectTypeOf(csrf({ except: ['callback'] })).toEqualTypeOf<ControllerMiddleware>()
    expectTypeOf(auth).toMatchTypeOf<Protection>()
    typeOnly(() => {
      // @ts-expect-error: `except` is a list of action names, not one string
      csrf({ except: 'callback' })
      // @ts-expect-error: params are strings ('60', '1'), as in 'throttle:60,1'
      auth({ params: [60] })
      // @ts-expect-error: no such option
      csrf({ excpet: ['callback'] })
    })
  })

  it('wrappers keep the handler shape and say what they carry', () => {
    const wrapped = withCsrf(async (ctx) => ctx.json({ ok: true }))
    expectTypeOf(wrapped).toEqualTypeOf<ProtectedHandler>()
    expectTypeOf(wrapped).parameter(0).toEqualTypeOf<HttpContext>()
    typeOnly(() => {
      // @ts-expect-error: a handler must take the context and return a Response
      withCsrf(async () => 'not a response')
    })
  })

  it('only csrf has token(); verify() resolves to void', () => {
    expectTypeOf(csrf.token).returns.toEqualTypeOf<string>()
    expectTypeOf(can.verify).returns.toEqualTypeOf<Promise<void>>()
    typeOnly(() => {
      // @ts-expect-error: token() belongs to csrf only
      auth.token({} as HttpContext)
    })
  })

  it('defineProtection needs a real middleware class', () => {
    class Ok implements Middleware {
      async handle(_ctx: HttpContext, next: Next): Promise<Response> {
        return next()
      }
    }
    expectTypeOf(defineProtection('ok', Ok)).toEqualTypeOf<Protection>()
    typeOnly(() => {
      class NotMiddleware {
        run(): void {}
      }
      // @ts-expect-error: no handle(ctx, next) method
      defineProtection('bad', NotMiddleware)
    })
  })

  it('abilities must return a boolean (or a promise of one)', () => {
    typeOnly(() => {
      new MiddlewareConfig().defineAbility('view-stats', (user) => user !== null)
      // @ts-expect-error: an ability returns a boolean, not a string
      new MiddlewareConfig().defineAbility('view-stats', () => 'yes')
    })
  })
})

describe('signed URLs, encryption and the HTTP client', () => {
  it('signed route helpers are typed like route()', () => {
    typeOnly(() => {
      const post = new Post({} as never)
      expectTypeOf(signedRoute('posts.show', { post })).toEqualTypeOf<string>()
      temporarySignedRoute('posts.show', new Date(), { post })
      // @ts-expect-error: no route has this name
      signedRoute('posts.shwo', { post })
      // @ts-expect-error: posts.show needs {post}
      signedRoute('posts.show', {})
      // @ts-expect-error: the expiry is a Date, not a number of minutes
      temporarySignedRoute('posts.show', 30, { post })
    })
    expectTypeOf(verifySignedUrl).returns.toEqualTypeOf<SignatureVerdict>()
    expectTypeOf<SignatureVerdict>().toEqualTypeOf<'valid' | 'invalid' | 'expired'>()
    expectTypeOf(signUrl).parameter(2).toEqualTypeOf<Date | undefined>()
  })

  it('decrypt() returns unknown, so callers must check what they got', () => {
    expectTypeOf(decrypt).returns.toEqualTypeOf<unknown>()
    expectTypeOf(encrypt).returns.toEqualTypeOf<string>()
    expectTypeOf<Encrypter['decryptString']>().returns.toEqualTypeOf<string>()
    typeOnly(() => {
      // @ts-expect-error: unknown can't be used as a string without a check
      decrypt('sv1.x.y').toUpperCase()
    })
  })

  it('safeFetch options and results are typed', () => {
    expectTypeOf(safeFetch).returns.toEqualTypeOf<Promise<SafeResponse>>()
    expectTypeOf<HttpClientErrorCode>().toEqualTypeOf<'SSRF_BLOCKED' | 'INVALID_URL' | 'TIMEOUT' | 'RESPONSE_TOO_LARGE' | 'TOO_MANY_REDIRECTS' | 'DNS_FAILED' | 'CONNECTION_FAILED'>()
    typeOnly(() => {
      void safeFetch('https://example.com', { allow: ['10.0.0.0/8'], timeoutMs: 1000 })
      // @ts-expect-error: allow takes CIDR strings
      void safeFetch('https://example.com', { allow: true })
    })
  })
})

describe('settings and the test client', () => {
  it('CORS, proxy and header options are typed', () => {
    typeOnly(() => {
      const middleware = new MiddlewareConfig()
      middleware.cors({ origins: ['https://app.example.com'], credentials: true })
      middleware.trustProxies({ at: ['10.0.0.0/8'], headers: ['for', 'proto'] })
      middleware.securityHeaders({ csp: { 'img-src': ['https://images.example.com'] }, hsts: false })
      // @ts-expect-error: origins is required
      middleware.cors({ credentials: true })
      // @ts-expect-error: forwarded headers are 'for' | 'proto' | 'host'
      middleware.trustProxies({ at: [], headers: ['port'] })
    })
  })

  it('withoutCsrf() is a test-client method only', () => {
    typeOnly(() => {
      const app = {} as Application
      client(app).withoutCsrf().postJson('/api/posts', {})
      // @ts-expect-error: the application itself has no CSRF switch
      app.withoutCsrf()
    })
  })
})
