---
title: Error Handling
description: What happens when your code throws. The developer error page with "Copy as Markdown for AI", the JSON debug member, plain 500s with a reference id in production, which errors are logged, and how to customise it all.
---

Sooner or later some code throws an error. Strutvane catches every error thrown while handling a request and decides two things:

1. **What to send** to the client: a helpful page while you develop, a safe and plain answer in production.
2. **What to log:** real bugs, with a reference id, but never expected errors like "not found".

You don't have to set anything up. This page shows what you'll see, and how to change it.

:::tip[Coming from Laravel?]
The developer page is Strutvane's Ignition (with a **"Copy as Markdown for AI"** button), `withExceptions()` in `bootstrap/app.ts` is the same place as Laravel 11's, and `render()`, `dontReport()` and `shouldRenderJson()` are here as `render()`, `dontReport()` and `shouldRenderJsonWhen()`.

One stricter rule: the debug page needs `APP_DEBUG=true` **and** `APP_ENV=local` or `testing`. In production, `APP_DEBUG=true` is ignored (and logged as a warning), so a forgotten flag can't leak your source code.
:::

## The smallest example

A route with a bug:

```ts title="app/http/controllers/diagnostics.controller.ts"
import { Controller, type HttpContext } from '@strutvane/framework'

export class DiagnosticsController extends Controller {
  boom(_ctx: HttpContext): Response {
    throw new TypeError('Cannot read properties of undefined (reading "title")')
  }
}
```

```ts title="routes/web.ts"
Route.get('/_diagnostics/boom', [DiagnosticsController, 'boom']).name('diagnostics.boom'),
```

Open `http://localhost:3000/_diagnostics/boom` in your browser with this in `.env`:

```ini
APP_ENV=local
APP_DEBUG=true
```

What you'll see: the **developer error page**, with

- a red header: `TypeError` and the message;
- the **exact line** in your file that threw (`app/http/controllers/diagnostics.controller.ts:7`), with the code around it;
- the stack (the chain of calls that led there);
- the request: method, URL and headers, with credentials masked;
- a **Copy as Markdown for AI** button.

## The three behaviours

| What was thrown | Logged? | Local/testing + `APP_DEBUG=true` | Production (or `APP_DEBUG=false`) |
|---|---|---|---|
| An HTTP error (`NotFoundError`, `ForbiddenError`, `ValidationError`…) | **No** (it's expected) | problem+json, with a developer `hint` when there is one | problem+json, no hint |
| Anything else (a bug), for a browser | **Yes**, with a reference id | The developer error page | A plain "500 · Server error" page with the reference id |
| Anything else (a bug), for an API client | **Yes**, with a reference id | problem+json with a `debug` member | problem+json with the reference id |

"For a browser" or "for an API client" is decided by `ctx.wantsJson()`: `/api/...` paths and requests whose `Accept` header mentions JSON get JSON.

## The developer error page

Shown only when **both** are true:

```ini
APP_DEBUG=true
APP_ENV=local     # or testing
```

It's built to be safe even on your machine:

- `Authorization`, `Cookie`, `X-CSRF-TOKEN`, `X-API-Key` and similar headers show `[redacted]`;
- query parameters named like `token`, `password`, `secret`, `key`, `signature` or `code` are masked;
- the request **body is never shown**;
- only **your app's own files** are quoted, never `node_modules`;
- everything is HTML-escaped, and the page's single script (the copy button) is locked down by a Content Security Policy, so an error message containing `<script>` can't run.

### Copy as Markdown for AI

The button copies the whole report as Markdown, ready to paste into an AI assistant or a GitHub issue:

````markdown
# TypeError: Cannot read properties of undefined (reading "title")

- **Request:** GET http://localhost:3000/_diagnostics/boom
- **Route:** diagnostics.boom
- **Environment:** local, Node v24.21.0

## Where: `app/http/controllers/diagnostics.controller.ts:7`

```ts
     5 | export class DiagnosticsController extends Controller {
     6 |   boom(_ctx: HttpContext): Response {
>    7 |     throw new TypeError('Cannot read properties of undefined (reading "title")')
     8 |   }
     9 | }
```

## Stack

- DiagnosticsController.boom (app/http/controllers/diagnostics.controller.ts:7:11)

## Request headers (credentials redacted)

- accept: text/html
- cookie: [redacted]
````

The Markdown is redacted exactly like the page.

## API errors in development: the `debug` member

When an API client hits a bug in local debug mode, it gets problem+json with an extra `debug` member:

```bash
curl -H "Accept: application/json" http://localhost:3000/_diagnostics/boom
```

```json
{
  "type": "https://strutvane.dev/problems/server_error",
  "title": "Server error",
  "status": 500,
  "code": "server_error",
  "detail": "See `debug` for the exception (shown because APP_DEBUG=true in a local environment).",
  "debug": {
    "exception": "TypeError",
    "message": "Cannot read properties of undefined (reading \"title\")",
    "at": "app/http/controllers/diagnostics.controller.ts:7",
    "route": "diagnostics.boom"
  }
}
```

## Production: a plain 500 with a reference id

With `APP_ENV=production` (whatever `APP_DEBUG` says), the client learns nothing about your code:

```json
{
  "type": "https://strutvane.dev/problems/server_error",
  "title": "Server error",
  "status": 500,
  "code": "server_error",
  "detail": "Something went wrong on our side. If it keeps happening, quote this reference: 3f2b9c1e-6a4d-4f0e-9b7a-2c8d5e1f0a42."
}
```

And the log gets one line with the **same** reference id, so support can find the full error in seconds:

```json
{"time":"2026-11-14T10:00:00.000Z","level":"error","message":"Cannot read properties of undefined (reading \"title\")","errorId":"3f2b9c1e-6a4d-4f0e-9b7a-2c8d5e1f0a42","exception":"TypeError","stack":"TypeError: Cannot read …","method":"GET","route":"/_diagnostics/boom"}
```

The log records the **route template** (`/posts/{post:slug}`), never the full URL, because URLs can carry slugs and tokens.

### The `APP_DEBUG` safety net

If `APP_DEBUG=true` is left on in production, Strutvane ignores it and logs this warning when the app starts:

```text
APP_DEBUG=true is ignored outside local and testing environments; production errors stay plain.
```

## Developer hints on 4xx errors

Some HTTP errors carry a `hint` for the developer. It's included only in local debug mode:

```json
{
  "type": "https://strutvane.dev/problems/forbidden",
  "title": "Forbidden",
  "status": 403,
  "code": "forbidden",
  "detail": "You are not allowed to delete this post.",
  "hint": "PostPolicy has no delete() method, so this is denied (Strutvane denies by default). Add delete(user, post) to the policy to allow it."
}
```

In production the same response has no `hint`, so it never tells an attacker how your policies are written.

## Customising: `withExceptions()`

All customisation lives in `bootstrap/app.ts`.

### Render one error type your own way

```ts title="bootstrap/app.ts"
.withExceptions((exceptions) => {
  exceptions.render(PaymentDeclined, (error, ctx) => ctx.json({ declined: true, reason: error.message }, 402))
})
```

```ts title="app/errors/payment-declined.ts"
/** The payment provider said no. Expected, not a bug. */
export class PaymentDeclined extends Error {
  override readonly name = 'PaymentDeclined'
}
```

What you'll see when a controller throws `new PaymentDeclined('Card expired')`:

```json
{ "declined": true, "reason": "Card expired" }
```

Return `undefined` from the renderer to fall back to the default rendering.

### Don't log expected errors

```ts
exceptions.dontReport(PaymentDeclined)
```

HTTP errors (401, 403, 404, 422, 429…) are never logged anyway.

### Decide when errors are JSON

The default is `ctx.wantsJson()`. Change it, for example to send JSON only under `/api/`:

```ts
exceptions.shouldRenderJsonWhen((ctx) => ctx.url.pathname.startsWith('/api/'))
```

## Errors before the app starts

Mistakes in your setup (a bad `.env` value, a typo in a middleware alias, a missing binding) are caught **when the app boots**, so they show up in `npm run dev`, `node strut …` and your tests, before any request. They print a message and a fix, with no stack trace:

```text
✖ The app can't start: 1 environment variable needs attention.
  - APP_DEBUG must be true or false (got "yes") (read in config/app.ts)
→ Fix the values in .env (see .env.example for every key) and start again.
```

## Common mistakes

### I see a plain 500 page locally instead of the error page

**Why:** one of the two conditions is missing.

**Fix:** set both in `.env`, then restart:

```ini
APP_ENV=local
APP_DEBUG=true
```

### My 404 is logged as an error

**Why:** you threw a plain `Error('not found')`, which counts as a bug.

**Fix:** throw `new NotFoundError('No report for that month.')`.

### The error page points at a framework file, not mine

**Why:** the error was thrown inside a package and the stack never passed through your files (the page then says `No source from your app is in this stack.`).

**Fix:** use **Copy as Markdown for AI** and read the stack list; look for the first call from your code, or the route shown in the report.

## Next steps

- [Responses](../responses/): throwing HTTP errors on purpose.
- [Configuration](../configuration/): `APP_ENV` and `APP_DEBUG`.
- [Logging](../logging/): where the error log goes.
