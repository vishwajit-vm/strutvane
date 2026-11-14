---
title: Middleware
description: Middleware is code that runs around your controllers. Use the built-in auth, throttle and csrf middleware, write your own, give it an alias, set up rate limiters, and understand the order things run in.
---

**Middleware** is code that runs before (and optionally after) your controller, for every request on a route. It's where you put checks that many routes share: "is someone signed in?", "is this user an admin?", "has this client sent too many requests?".

Each middleware gets the request and a `next` function. It can stop the request (by throwing or returning a response), or call `next()` to let it continue.

:::tip[Coming from Laravel?]
Same model: classes with `handle()`, aliases like `'auth'` and `'throttle:60,1'`, the `web` and `api` groups, `RateLimiter::for()` (here `middleware.rateLimiter()`), and a fixed priority like `$middlewarePriority`.

The difference: every alias is checked **when the app starts**, so `'auht'` fails `node strut route:list` with "Did you mean "auth"?" instead of failing on a live request.
:::

## The smallest example

```ts title="app/http/middleware/ensure-admin.ts"
import { ForbiddenError, type HttpContext, type Middleware, type Next } from '@strutvane/framework'

/** The `admin` middleware: only admins pass. */
export class EnsureAdmin implements Middleware {
  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    if (ctx.requireUser().is_admin) return next()
    throw new ForbiddenError('This area is for administrators.')
  }
}
```

Give it an alias in `bootstrap/app.ts`:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.alias({ admin: EnsureAdmin })
})
```

Use the alias on a route (after `auth`, so a user is signed in):

```ts title="routes/api.ts"
Route.get('/admin/stats', [StatsController, 'show']).name('admin.stats').middleware('auth', 'admin'),
```

What you'll see when a signed-in non-admin calls it:

```text
HTTP/1.1 403 Forbidden
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/forbidden","title":"Forbidden","status":403,"code":"forbidden","detail":"This area is for administrators."}
```

## How `handle()` works

```ts
async handle(ctx: HttpContext, next: Next, ...params: string[]): Promise<Response>
```

| Argument | What it is |
|---|---|
| `ctx` | The request context: `ctx.user`, `ctx.request`, `ctx.ip`, `ctx.method`… |
| `next` | Calls the rest of the chain (more middleware, then the controller) and returns its `Response` |
| `params` | The text after the colon in the alias: `'throttle:60,1'` → `['60', '1']` |

There are three things a middleware can do:

1. **Let the request through:** `return next()`.
2. **Stop it:** throw an HTTP error (`ForbiddenError`, `UnauthenticatedError`…) or return your own response.
3. **Change the response:** `const response = await next()`, then return a modified copy.

### Changing the response (after the controller)

```ts title="app/http/middleware/add-timing.ts"
import type { HttpContext, Middleware, Next } from '@strutvane/framework'

/** Adds how long the request took, in milliseconds. */
export class AddTiming implements Middleware {
  async handle(_ctx: HttpContext, next: Next): Promise<Response> {
    const started = performance.now()
    const response = await next()
    // Copy before setting headers: some responses can't be changed in place.
    const timed = new Response(response.body, response)
    timed.headers.set('server-timing', `app;dur=${(performance.now() - started).toFixed(1)}`)
    return timed
  }
}
```

What you'll see in the response headers:

```text
server-timing: app;dur=3.4
```

### Middleware with parameters

```ts title="app/http/middleware/require-header.ts"
import { HttpError, type HttpContext, type Middleware, type Next } from '@strutvane/framework'

/** `require-header:X-Client-Version` refuses requests without that header. */
export class RequireHeader implements Middleware {
  async handle(ctx: HttpContext, next: Next, name = 'x-client-version'): Promise<Response> {
    if (ctx.request.headers.get(name) !== null) return next()
    throw new HttpError(400, 'missing_header', 'Missing header', `Send the "${name}" header.`)
  }
}
```

```ts
middleware.alias({ 'require-header': RequireHeader })
Route.get('/sync', [SyncController, 'show']).middleware('require-header:x-client-version'),
```

### Middleware that needs services

Middleware is built by the [container](../container/), once per request, so it can use `static inject` like any class:

```ts title="app/http/middleware/audit-requests.ts"
import { LoggerToken, type HttpContext, type Logger, type Middleware, type Next } from '@strutvane/framework'

/** Logs every request's method and route template (never the URL: it can carry tokens). */
export class AuditRequests implements Middleware {
  static readonly inject = [LoggerToken] as const
  readonly #logger: Logger

  constructor(logger: Logger) {
    this.#logger = logger
  }

  async handle(ctx: HttpContext, next: Next): Promise<Response> {
    this.#logger.info('request', { method: ctx.method, route: ctx.route?.uri })
    return next()
  }
}
```

## Built-in middleware

| Alias | What it does |
|---|---|
| `auth` | Requires a valid `Authorization: Bearer <token>` header; otherwise `401` |
| `auth:optional` | Signs the user in if a token is sent, lets guests through otherwise |
| `throttle:api` | Rate limit with the named limiter `api` |
| `throttle:60,1` | Rate limit: 60 requests per 1 minute |
| `csrf` | Checks cookie-authenticated requests come from your own site (see [CSRF Protection](../csrf/)) |

### `auth` and `auth:optional`

```ts
Route.get('/me', (ctx) => ctx.json({ data: ctx.requireUser() })).middleware('auth'),
Route.apiResource('posts', PostController).middlewareFor(['index', 'show'], 'auth:optional'),
```

What you'll see without a token on an `auth` route:

```text
HTTP/1.1 401 Unauthorized
www-authenticate: Bearer

{"type":"https://strutvane.dev/problems/unauthenticated","title":"Unauthenticated","status":401,"code":"unauthenticated","detail":"Sign in first: send an \"Authorization: Bearer <token>\" header."}
```

On `auth:optional`, a **wrong** token is still a `401` (`That token is not valid. Sign in again to get a new one.`): the client tried to sign in and should learn that it failed, instead of silently seeing the guest view.

:::caution[Coming in 0.2]
Cookie sessions and the login screens come with `@strutvane/auth`. Today's `auth` middleware checks bearer tokens through the `UserProviderToken` binding (see [Service Providers](../providers/)).
:::

## Groups: `web` and `api`

Every route gets its file's group automatically:

| Group | Contains | Applied to |
|---|---|---|
| `web` | `csrf` | `routes/web.ts` |
| `api` | `csrf`, `throttle:api` | `routes/api.ts` |

Add your own middleware to a group for every route in it:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.alias({ timing: AddTiming })
  middleware.appendToGroup('api', 'timing')        // at the end
  middleware.prependToGroup('web', 'timing')       // at the start
})
```

## Rate limiters

`throttle` counts requests per **bucket**: each signed-in user gets their own bucket; guests share one per IP address (IPv6 clients per `/64` network, so they can't dodge the limit by changing addresses).

The `api` group uses the limiter named `api`: 60 requests per minute by default. Change it, or add your own:

```ts title="bootstrap/app.ts"
.withMiddleware((middleware) => {
  middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
  middleware.rateLimiter('login', { maxAttempts: 5, decaySeconds: 60, by: (ctx) => ctx.ip })
})
```

```ts title="routes/api.ts"
Route.post('/login', [LoginController, 'store']).middleware('throttle:login'),
```

Every throttled response carries the limit:

```text
x-ratelimit-limit: 120
x-ratelimit-remaining: 117
```

When the bucket is empty:

```text
HTTP/1.1 429 Too Many Requests
retry-after: 42

{"type":"https://strutvane.dev/problems/too_many_requests","title":"Too many requests","status":429,"code":"too_many_requests","detail":"Slow down: try again in 42 seconds."}
```

:::caution[Coming in 0.2]
Counts are kept in memory, per process. A cluster of servers needs a shared store (database or Redis), which plugs in behind the same `RateLimitStoreToken`.
:::

## The order middleware runs in

Middleware runs in the order it's listed: group first, then the route's own. **Except** for three, which always run in this order wherever they're listed:

```text
csrf  →  auth  →  throttle
```

**Why?** The `api` group lists `throttle` before your route's `auth`. If they ran in that order, the rate limiter wouldn't know who's signed in yet, and all users behind one office IP would share one bucket. Fixing the order gives every user their own bucket.

Your own middleware keeps its position; only those three are reordered among themselves.

## Common mistakes

### "No middleware is called …"

```text
✖ No middleware is called "admn" (used by GET /api/admin/stats).
→ Did you mean "admin"?
```

When nothing is close:

```text
✖ No middleware is called "audit" (used by GET /api/posts).
→ Register it in bootstrap/app.ts: withMiddleware((m) => m.alias({ audit: YourMiddleware })). Known: auth, throttle, csrf, admin.
```

**Fix:** correct the spelling, or register the alias.

### "No rate limiter is called …"

```text
No rate limiter is called "logins".
→ Define it in bootstrap/app.ts: withMiddleware((m) => m.rateLimiter('logins', { maxAttempts: 60, decaySeconds: 60 })), or use numbers: throttle:60,1.
```

### `ctx.requireUser()` throws 401 in my middleware

```text
{"status":401,"code":"unauthenticated","detail":"Sign in first: send an \"Authorization: Bearer <token>\" header.", …}
```

**Why:** your middleware runs on a route without `auth`, so nobody was signed in. (In local debug mode the response also has a `hint`: `Add the "auth" middleware to this route so guests get a 401 before the controller runs.`)

**Fix:** list `auth` on the route: `.middleware('auth', 'admin')`.

### Headers I set disappear or throw

**Why:** some `Response` objects are immutable.

**Fix:** copy first: `const copy = new Response(response.body, response)`, then set headers on `copy`.

## Next steps

- [CSRF Protection](../csrf/): what the `csrf` middleware checks.
- [Authorization](../authorization/): per-record permissions, beyond "is admin".
- [Routing](../routing/): attaching middleware to routes and groups.
