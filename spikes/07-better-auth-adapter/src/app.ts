/**
 * A Hono app that uses ONLY the {@link IdentityEngine} interface. It doesn't know (or care) whether
 * Better Auth or the stub is behind it: that is the integration shape `@strutvane/auth` will ship.
 *
 * Errors are answered as RFC 9457 problem details with a stable `code` (RFC-0003). Engine messages
 * are never forwarded.
 *
 * @module
 */
import { Hono } from 'hono'
import type { IdentityEngine, IdentityResult } from './identity-engine.ts'

const PROBLEM = 'application/problem+json'

/** Copy the engine's headers (Set-Cookie, Retry-After) and answer with JSON or a problem. */
function respond<T>(result: IdentityResult<T>, toBody: (value: T) => unknown): Response {
  const headers = new Headers(result.headers)
  if (result.ok) {
    headers.set('content-type', 'application/json')
    return new Response(JSON.stringify(toBody(result.value)), { status: 200, headers })
  }
  headers.set('content-type', PROBLEM)
  const { code, status, retryAfterSeconds } = result.error
  if (retryAfterSeconds !== undefined) headers.set('retry-after', String(retryAfterSeconds))
  return new Response(
    JSON.stringify({ type: `https://strutvane.dev/errors/${code.toLowerCase()}`, title: code, status, code }),
    { status, headers },
  )
}

async function json(request: Request): Promise<Record<string, unknown>> {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

export function createApp(engine: IdentityEngine): Hono {
  const app = new Hono()

  app.post('/auth/sign-up', async (c) => {
    const b = await json(c.req.raw.clone())
    return respond(
      await engine.signUp({ email: text(b.email), password: text(b.password), name: text(b.name) }, c.req.raw),
      (v) => v,
    )
  })

  app.post('/auth/sign-in', async (c) => {
    const b = await json(c.req.raw.clone())
    return respond(await engine.signIn({ email: text(b.email), password: text(b.password) }, c.req.raw), (v) => v)
  })

  app.post('/auth/sign-out', async (c) => respond(await engine.signOut(c.req.raw), () => ({ ok: true })))

  app.get('/me', async (c) => {
    const actor = await engine.getActor(c.req.raw)
    if (!actor) {
      return c.body(JSON.stringify({ title: 'UNAUTHENTICATED', status: 401, code: 'UNAUTHENTICATED' }), 401, {
        'content-type': PROBLEM,
      })
    }
    return c.json({ actor })
  })

  app.post('/tenants', async (c) => {
    const b = await json(c.req.raw.clone())
    return respond(await engine.createTenant({ name: text(b.name), slug: text(b.slug) }, c.req.raw), (v) => v)
  })

  app.get('/tenants', async (c) => respond(await engine.listTenants(c.req.raw), (v) => ({ tenants: v })))

  app.post('/tenants/switch', async (c) => {
    const b = await json(c.req.raw.clone())
    return respond(await engine.switchTenant({ tenantId: text(b.tenantId) }, c.req.raw), (v) => v)
  })

  return app
}
