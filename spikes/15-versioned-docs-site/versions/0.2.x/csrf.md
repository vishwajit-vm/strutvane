---
title: CSRF Protection
description: How Strutvane stops other websites from sending requests as your signed-in users. The exact rules, why bearer-token requests skip the check, and how to send the CSRF token from your own scripts.
---

**CSRF** (cross-site request forgery) is an attack where another website makes your user's browser send a request to your app. The browser attaches your app's session cookie automatically, so without protection the request would run as that user: "delete my account", "transfer money".

Strutvane checks every request that could change something (POST, PUT, PATCH, DELETE) and **arrives with a session cookie**. It must prove it came from your own pages. This is on by default in both the `web` and the `api` middleware groups; you don't add anything.

:::tip[Coming from Laravel?]
Same purpose as `VerifyCsrfToken`, same `X-CSRF-TOKEN` and `X-XSRF-TOKEN` headers, same `419 Page Expired` status.

Two differences: the check also covers `/api` routes when they're called with a cookie (Laravel's API routes are usually cookie-less), and modern browsers' `Sec-Fetch-Site: same-origin` header counts as proof, so most requests from your own React app pass without any token.
:::

## The smallest example (nothing to do)

Your React app calls your API from the same origin as `APP_URL`, with the session cookie:

```ts title="resources/ui/pages/new-post.tsx"
await fetch('/api/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ title: 'Hello' }),
})
```

What you'll see: the request passes. The browser added `Sec-Fetch-Site: same-origin`, which is proof enough.

## The rules, exactly

For each request, the `csrf` middleware decides in this order:

| # | Situation | Result |
|---|---|---|
| 1 | Method is GET, HEAD or OPTIONS (they must never change anything) | **Pass** |
| 2 | Has an `Authorization: Bearer …` header | **Pass** (see below) |
| 3 | Has no session cookie (`strutvane_session`) | **Pass** (nothing for an attacker to borrow) |
| 4 | `Sec-Fetch-Site: same-origin` | **Pass** |
| 5 | `Sec-Fetch-Site` is `same-site` or `cross-site` | **Fail** (a sibling subdomain is not your site) |
| 6 | No `Sec-Fetch-Site` (or `none`), and `Origin` equals the origin of `APP_URL` exactly | **Pass** (`Origin: null` never passes) |
| 7 | A valid token in `X-CSRF-TOKEN` or `X-XSRF-TOKEN` | **Pass** |
| — | Anything else | **419** |

A failure looks like this:

```text
HTTP/1.1 419
content-type: application/problem+json

{"type":"https://strutvane.dev/problems/csrf_token_mismatch","title":"Page expired","status":419,"code":"csrf_token_mismatch","detail":"This request could not be verified as coming from this site. Reload the page and try again."}
```

In local debug mode it also includes a `hint`:

```text
Send the X-CSRF-TOKEN header (csrfToken(sessionId, APP_KEY)) or make the request from the same origin as APP_URL.
```

## Why bearer tokens skip the check

A browser attaches cookies (and Basic credentials) to requests **by itself**, which is what makes CSRF possible. It never attaches an `Authorization: Bearer` header by itself: your code has to add it. So a request with a bearer token can't have been forged by another site.

Only `Bearer` skips the check. `Authorization: Basic …` doesn't, because browsers *do* attach Basic credentials automatically.

```bash
curl -X POST http://localhost:3000/api/posts \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"title":"From a script"}'
```

What you'll see: `201 Created`. Scripts, mobile apps and other servers use tokens and never deal with CSRF.

## Sending the token yourself

When a request can't prove its origin with headers (an old browser, or a page served from another origin that you trust), send the token. It's an HMAC of the session id under your `APP_KEY`, so it's tied to one session and useless in any other.

Create it on the server with `csrfToken()` and hand it to the page:

```ts title="app/http/controllers/spa.controller.ts"
import { config, Controller, csrfToken, readCookie, SESSION_COOKIE, type HttpContext } from '@strutvane/framework'

export class SpaController extends Controller {
  show(ctx: HttpContext): Response {
    const session = readCookie(ctx.request.headers.get('cookie') ?? '', SESSION_COOKIE)
    const token = session === undefined ? '' : csrfToken(session, config('app.key'))
    return ctx.html(`<!doctype html><html><head><meta name="csrf-token" content="${token}"></head><body><div id="root"></div></body></html>`)
  }
}
```

Send it back in a header:

```ts title="resources/ui/lib/api.ts"
const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? ''

await fetch('/api/posts', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-csrf-token': token },
  body: JSON.stringify({ title: 'Hello' }),
})
```

What you'll see: the request passes rule 7. The comparison is done in constant time, so the token can't be guessed byte by byte from response timings.

:::caution[Coming in 0.2]
Sessions, login, and rotating the token at sign-in come with `@strutvane/auth`. The CSRF middleware itself is complete and tested (11 cases in the application-core prototype).
:::

## Common mistakes

### My form post from another subdomain gets 419

```text
{"status":419,"code":"csrf_token_mismatch","detail":"This request could not be verified as coming from this site. Reload the page and try again.", …}
```

**Why:** `admin.example.com` calling `api.example.com` is `same-site`, not `same-origin`, and Strutvane never trusts a sibling subdomain on headers alone (rule 5).

**Fix:** send the `X-CSRF-TOKEN` header (rule 7), or serve the page from the same origin as `APP_URL`.

### 419 in local development only

**Why:** `APP_URL` in `.env` doesn't match the address in your browser (for example `http://localhost:3000` vs `http://127.0.0.1:3000`), so the `Origin` check fails.

**Fix:** open the app at exactly the address in `APP_URL`, or change `APP_URL`.

### My script gets 419

**Why:** it sends the session cookie but no bearer token.

**Fix:** authenticate scripts with a token (`Authorization: Bearer …`), not a copied browser cookie.

## Next steps

- [Middleware](../middleware/): where `csrf` sits in the order.
- [Authentication](../authentication/): sessions and tokens.
- [Authorization](../authorization/): what happens after the request is verified.
