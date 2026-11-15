# Spike 12: MVC application core (Laravel's flow, strict TypeScript)

**Date:** 2026-11-14; security kit and commands added 2026-11-15 (see [Security kit and commands](#security-kit-and-commands-extension-2026-11-15)).

**Environment:** Windows 11, Node v24.21.0 (native type stripping), TypeScript 6.0.3, Vitest 5.1.0, Hono 4.13.18, @hono/node-server 2.1.8, Zod 4.6.7, SQLite through `node:sqlite`. npm only.

```bash
cd spikes/12-mvc-app-core
npm install
npm test                         # tsc --noEmit (type-level tests) + vitest run
cd fixtures/example-app
APP_KEY=dev DB_CONNECTION=sqlite node strut route:list    # PowerShell: $env:APP_KEY='dev'; …
```

## Question

> Can Strutvane give a generated app **Laravel's application core** (the same folders, `bootstrap/app.ts`, providers, config, routes files with `Route.resource`, controllers, form requests, policies, route model binding, an Ignition-like error page and an artisan-like `node strut`) in strict TypeScript, **fully typed and without magic** (no decorators, no reflection, no facades over global state)?

## Answer

**Yes.** The example app (posts + authors) runs end to end on this core. 115 tests pass, and the type-level tests prove the parts that make it "Laravel, but typed":

- `route('posts.show', { post })` is checked against the routes files: a typo in the name, a missing `{post}` or a wrong value type fails to compile. Group prefixes (`admin.` + `stats`) are typed too.
- `[PostController, 'nope']` and `Route.resource('posts', ControllerWithoutCreate)` fail to compile.
- `config('app.debug')` is a `boolean` and `config('app.nmae')` fails to compile.
- `ctx.user` is the app's `Author | null`; `ctx.model(Post)` is a `Post` with typed columns from spike 10's generated types.
- Constructor injection is checked: a `static inject` list that doesn't match the constructor fails to compile.

None of it needs code generation: the app adds **one** `declare module '#strutvane/registry'` block that points at `typeof web`, `typeof api` and `typeof config`.

## What the developer writes

**`bootstrap/app.ts`** (Laravel 11+'s `bootstrap/app.php`):

```ts
export function createApp(env?: EnvSource): Application {
  return Application.configure({ basePath: dirname(import.meta.dirname), ...(env === undefined ? {} : { env }) })
    .withConfig(config)                       // config/index.ts: { app, database }
    .withProviders(providers)                 // bootstrap/providers.ts
    .withRouting({ web, api, health: '/up', bindings: { post: Post, author: Author } })
    .withMiddleware((middleware) => {
      middleware.alias({ admin: EnsureAdmin })
      middleware.rateLimiter('api', { maxAttempts: 120, decaySeconds: 60 })
    })
    .withExceptions((exceptions) => exceptions.shouldRenderJsonWhen((ctx) => ctx.wantsJson()))
    .create()
}
export default createApp()

declare module '#strutvane/registry' {
  interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
  interface ConfigRegistry extends ConfigOf<typeof config> {}
  interface UserRegistry { user: Author }
}
```

**`routes/api.ts`:**

```ts
export default defineRoutes([
  Route.apiResource('posts', PostController, { bindBy: 'slug' })        // 5 routes, {post:slug}
    .middlewareFor(['index', 'show'], 'auth:optional')
    .middlewareFor(['store', 'update', 'destroy'], 'auth'),
  Route.post('/posts/{post:slug}/publish', [PostController, 'publish']).name('posts.publish').middleware('auth'),
  Route.apiResource('authors', AuthorController, { only: ['index', 'show', 'store'] }).middlewareFor(['store'], 'auth'),
  Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth', 'admin'] }, [
    Route.get('/stats', [StatsController, 'show']).name('stats'),
  ]),
])
```

**A controller** (index/show/store/update/destroy are inherited; this is the whole file):

```ts
export class PostController extends ResourceController<typeof Post> {
  protected readonly model = Post
  protected readonly policy = new PostPolicy()
  protected override readonly storeRequest = new StorePostRequest()     // Zod via Standard Schema
  protected override readonly updateRequest = new UpdatePostRequest()

  protected override indexConstraints(ctx: HttpContext): Constraint[] {  // guests: published only
    if (ctx.user?.is_admin === true) return []
    const visible: Constraint[] = [{ column: 'status', equals: 'published' }]
    if (ctx.user !== null) visible.push({ column: 'author_id', equals: ctx.user.id })
    return [{ anyOf: visible }]
  }

  protected override prepareForStore(values: Record<string, unknown>, ctx: HttpContext): Record<string, unknown> {
    return { ...values, author_id: ctx.requireUser().id }                // never from the client
  }

  async publish(ctx: HttpContext): Promise<Response> {                   // a custom action
    const post = await this.visible(ctx)                                  // 404 if they can't see it
    await authorize(this.policy, 'update', ctx.user, post, 'post')       // 403 if they can't change it
    await post.update({ status: 'published', published_at: now() })
    return ctx.json({ data: post, links: { self: route('posts.show', { post }) } })
  }
}
```

The app layout is Laravel's, TS-cased: `app/http/{controllers,middleware,requests}`, `app/models`, `app/policies`, `app/providers`, `bootstrap/{app,providers}.ts`, `config/*.ts`, `routes/{web,api}.ts`, `database/{migrations,seeders,factories}`, `resources/ui` (React only), `storage/`, `tests/`, `strut.js`, `.env.example`. See [fixtures/example-app](fixtures/example-app).

## Evidence

`npm test` exits 0: `tsc --noEmit` over everything (including the type tests), then **9 files, 115 tests**. HTTP tests go through `app.handle(Request)` into real SQLite; the CLI tests also spawn real `node strut` processes.

| Test file | Tests | What it proves |
|---|---|---|
| `types.test.ts` | 13 | Route names, parameters and group prefixes are typed; bad `route()` calls, unknown controller methods and incomplete resource controllers don't compile; `inject` lists are checked; `config()` keys and values are typed; `ctx.user`/`ctx.model()` are typed; policy signatures and form-request output are typed; command options are typed. |
| `routing.test.ts` | 13 | The 7 and 5 resource routes (names, verbs, URIs, match order), `only`/`except`/`parameter`/`bindBy`/`middlewareFor`, nested groups, immutability, duplicate names and endpoints refused, malformed parameters refused, URL generation (models by bound field, query extras, absolute URLs, friendly errors with "did you mean"). |
| `http.test.ts` | 24 | The example app: visibility-constrained lists, pagination meta, case-insensitive search with literal `%`, sort, filters, every bad query reported at once (422), hidden columns never returned; binding by slug and id with 404s; drafts invisible as 404; the React shell on web routes; 401 / 422 (field issues) / unknown-field / 201 + `Location`; random slug suffixes; 415 / 400 / 413; metadata-derived validation with `fillable`; update/destroy policies (missing method denies); soft delete; custom action; constructor injection; `/up`; 405 with `Allow`; throttling with headers, user buckets and window reset. |
| `security.test.ts` | 21 | F-01 internal tables refused at boot; F-11 resource routes without a policy refused; mistyped middleware and missing bindings refused at boot; the CSRF matrix (11 cases); bearer and safe methods skip CSRF; IPv6 /64 buckets; middleware priority; 403 hints in development only (F-26). |
| `errors.test.ts` | 7 | The debug page (exception, code frame at the exact app line, redacted headers and query, CSP nonce, "Copy as Markdown for AI"), the JSON `debug` member, production's plain 500 with a reference id that matches the log, the APP_DEBUG-in-production warning, no logging of expected 4xx, HTML escaping, Markdown, frames limited to app files. |
| `console.test.ts` | 14 | `node strut` list, help, did-you-mean for commands and options, missing arguments; `route:list` (table, filters, `--json`), `about --json` without secrets, `model:show`; `make:migration` (spike 10 format, always the model for `create_*`, seeder, factory, alter, bad names), `make:controller` (plain, `--resource`, `--api`, `--model`, deny-all policy, no overwrite without `--force`); **a generated owned controller compiles under strict `tsc` and returns 403 for every action until the policy is edited**; the real `strut.js` process: `route:list`, typo exit 1, every bad env var listed, `make:*` before `.env` exists. |
| `foundation.test.ts` | 12 | Container (singletons, transients, `inject`, unbound token, loop), env (every problem at once, Laravel booleans, empty = unset), config (frozen, unknown keys refused, MySQL default), `.env` precedence, provider register-then-boot order, a package provider adding routes, a command and navigation, boot failing with all env problems. |
| `data.test.ts` | 8 | List SQL per dialect (SQLite numbered `?N`; **MySQL** positional `?`, backticks, `NULLS LAST` emulated, DATETIME literal format; PostgreSQL `$n` + `ILIKE`), fail-closed constraints, query limits, metadata-derived Zod rules, the F-10 writable-column rules. |
| `fixtures/example-app/tests/feature/posts.test.ts` | 3 | What a test in a generated app looks like. |

**Planted bugs:** a missing policy method allowing (3 tests fail), CSRF accepting `same-site` (1 fails), middleware priority removed (1 fails).

**Timings (shared laptop):** app boot (config, providers, 15 routes compiled and checked) 7 ms in-process; `node strut route:list` cold **0.75–1.0 s**, of which ~0.2 s is importing Hono + Zod and most of the rest is type-stripping ~60 TypeScript files.

## Design choices, and why

1. **HTTP on Hono, routes owned by Strutvane.** Our router builds the route table (names, groups, resources, bindings, middleware), then registers each route on Hono. Hono gives Web-standard `Request`/`Response` (tests call `app.handle(request)` with no port), a fast router, `@hono/node-server` for `node strut serve`, and it is already the stack's choice. Our table drives `route:list`, URL generation, 405s and the boot checks, which Hono alone can't.
2. **Routes are values, not side effects.** `Route.get()` returns an immutable object and `defineRoutes([...])` returns a list. Nothing registers globally on import, so routes files load twice safely (tests, `route:list`), and `typeof api` carries every name and path to the type checker. It reads like Laravel, but it's an array.
3. **Helpers without facades.** `route()`, `config()`, `now()`, `app()` and `Model.find()` read the *current app* from `AsyncLocalStorage`, set around every request and command. Two apps in one test process never see each other. Outside a request they fail with a message saying how to get the app explicitly.
4. **The container uses tokens and `static inject`, not reflection.** `CheckInjectable` makes a wrong `inject` list a compile error. Controllers and middleware are built per request (no state leaks between requests, unlike Laravel Octane's hazards).
5. **Deny by default, everywhere.** A missing policy method denies. `before()` lets admins through. A record the user can't `view` answers 404 from show, update, delete and custom actions (`visible()`). Unknown request fields are a 422 (Laravel's `#[FailOnUnknownFields]` is opt-in). Generated policies deny everything except admins.
6. **Start-up checks instead of first-request surprises.** Boot (and therefore `node strut route:list` and every test) fails with a friendly message for: an unknown middleware alias (with "did you mean"), `{post:slug}` without a binding, a resource controller with no policy, a ResourceController on an internal table, a controller action that doesn't exist, duplicate route names or endpoints, and every bad environment variable at once.
7. **Middleware priority like Laravel's `$middlewarePriority`.** `csrf → auth → throttle` regardless of listing order, so the `api` group's throttle sees the signed-in user (found by a failing test: users were throttled by IP).
8. **Errors.** One RFC 9457 shape (`problem+json` with `code`, `issues`, and a `hint` only in local/testing debug). The debug page is shown only when `APP_DEBUG=true` **and** `APP_ENV` is `local`/`testing`; production ignores `APP_DEBUG` and logs a warning. The page escapes everything, uses a CSP nonce for its one script, redacts credentials, never shows the body, and quotes only the app's own files.

## Findings

1. **A class silently matched the container's token overload.** `Token<T>` was `{ name }`, and every class has a `name`, so `container.make(WrongInject)` picked the token overload and skipped the `inject` check. A type test caught it; tokens now carry `kind: 'token'`. Lesson: phantom-typed keys need a brand classes can't have.
2. **Route-registry types are not circular in practice,** even though `typeof api` depends on controller types and controllers call `route()`. This holds because controller methods declare their return type (`Promise<Response>`). An inferred return type that calls `route()` could make TypeScript report a circularity, so the stubs always write the return type.
3. **Type-level inflection must equal runtime inflection.** `Route.resource('posts')` names its parameter `{post}` at runtime *and* in the types (`Singular<'posts'>`). Both use the same three rules (`-ies`, `-sses`, `-s`). Irregular words (`news` → `new`) use the `parameter` option. A full inflector can't be mirrored in types.
4. **Throttling by IP before auth runs** gave signed-in users a shared bucket. Fixed with middleware priority (design choice 7). IPv6 clients are bucketed per /64 (F-22).
5. **The 403-versus-404 oracle.** With Laravel's defaults, `PATCH /posts/{draft}` by another user returns 403, which proves the draft exists. `visible()` turns "can't view" into the same 404 as "missing" for every record action, while "can view but can't change" stays an honest 403.
6. **Counter slugs leak** (`hello-2` tells you a hidden `hello` exists). Spike 10's `-2`, `-3` was replaced by a 4-character random suffix (F-14).
7. **Mass assignment needs an allowlist, not heuristics.** Spike 10's metadata marks `author_id` and `is_admin` fillable. Here the model's `static fillable` is the whole allowlist; without it, `*_at`, `is_*` and owner foreign keys are excluded. Generated models start with `fillable = []`. This matches spike 11's `Model('posts', { fillable })`.
8. **Node won't strip types inside `node_modules`.** App files can stay `.ts` (`node strut` works with no build), but `@strutvane/framework` must ship compiled JavaScript. Cold `node strut` is 0.75–1.0 s here, too slow next to artisan. Lazy-loading command modules and shipping compiled JS are the obvious fixes *(unverified how much they save)*.
9. **The source maps worked:** under Vitest and plain Node type stripping, the debug page points at the exact throwing line (`diagnostics.controller.ts:7`). Node's stripping keeps positions, so no source-map support is needed in development.
10. **Dialect-sensitive spots in routing and controllers** (MySQL is the default database):
    - placeholders: MySQL has only positional `?`, so list SQL is built strictly left to right;
    - `NULLS LAST` doesn't exist in MySQL; it is emulated with `col IS NULL, col`;
    - `LIKE` case sensitivity depends on MySQL collation, so a binary collation on a searched column changes search (spike 11 asks for binary collation on identifier-like columns, which is correct for uniqueness but changes search);
    - DATETIME literals have no `T`/`Z`;
    - the unique-violation text for 409 differs (`Duplicate entry`, errno 1062);
    - `insertId` exists on MySQL and SQLite, but PostgreSQL needs `RETURNING`;
    - route binding by integer refuses non-digits *before* SQL, because MySQL compares `'1abc' = 1` as true.
    
    Only SQLite was executed here; the MySQL and PostgreSQL SQL text is pinned by tests *(unverified on a server)*.
11. **Spike 10's generator worked unchanged on this app's migrations** (it wrote `.strutvane/` here). Two small things to fix there: the doc comments say "a author", and `resources.json` has no `internal` flag yet (F-01 needs it from `schema.create(…, { internal: true })`).

## Security kit and commands (extension, 2026-11-15)

**Question.** Can every protection in blueprint §5.2 be on by default *and* usable in every style a Laravel developer reaches for (app-wide, route, group, controller, handler wrapper, imperative call) without decorators and without one implementation per style? And can the artisan cache, key, env and maintenance commands work safely across processes, keys and deploys?

**Answer: yes.** One helper, `defineProtection(alias, MiddlewareClass)`, gives `csrf`, `auth`, `can`, `throttle`, `signed` and `idempotent` all six styles, and `route:list --security` shows the result of all of them together, including every opt-out. The commands work, with one honest negative: in TypeScript the bootstrap caches don't make boot faster (finding 12).

### What the developer writes

| Style | Code |
|---|---|
| Default | `csrf` is in the `web` and `api` groups; security headers, trusted hosts, body limits and maintenance checks run for every request |
| App-wide | `.withMiddleware((m) => m.validateCsrfTokens({ except: ['webhooks/*'] }).trustProxies({ at: ['10.0.0.0/8'] }).cors({ origins: ['https://app.example.com'], credentials: true }).securityHeaders({ csp: { 'img-src': ['https://cdn.example.com'] } }).limits({ maxBytes: 5_000_000 }).defineAbility('view-stats', (user) => hasAdminRole(user)))` |
| Route | `Route.post('/hook', handler).withoutMiddleware('csrf')`, `.middleware('csrf', 'signed', 'can:view-stats', 'idempotent')` |
| Group | `Route.middleware('csrf').group([...])`, `Route.withoutMiddleware('csrf').group([...])`, `Route.group({ withoutMiddleware: ['csrf'] }, [...])` |
| Controller | `static readonly middleware = [csrf({ except: ['callback'] }), auth({ except: ['index'] }), throttle({ params: ['10', '1'], only: ['store'] })]` |
| Handler | `export default withCsrf(async (ctx) => …)`, also `withAuth`, `withCan(h, 'ability')`, `withThrottle(h, '5', '1')`, `withSigned`, `withIdempotency` |
| Imperative | `await csrf.verify(ctx)`, `csrf.token(ctx)`, `await auth.verify(ctx)`, `await can.verify(ctx, 'view-stats')` |
| Views | `csrf_field(ctx)`, `csrf_meta(ctx)`, `ctx.nonce` for `<script nonce>` |
| Tests | `client(app).withoutCsrf()` (refused unless `APP_ENV=testing`) |
| Helpers | `encrypt()`/`decrypt()`, `signedRoute()`/`temporarySignedRoute()` (typed like `route()`), `redirect().intended(ctx, '/home')`/`.to()`/`.away()`, `safeFetch(url, { timeoutMs, maxBytes, allow })` |

Opt-out rules (all checked at boot): a group opt-out yields to a more specific add (re-adding protection is always safe); a route or controller that both adds and opts out of the same alias is a boot error; an opt-out of an unknown alias, a `can:` naming an unknown ability, and controller `only`/`except` naming a missing action are boot errors with "did you mean".

`node strut route:list --security` (and `--json`) prints, per route, the protections that really apply, every opt-out with where it was written (`route`, `group`, `controller`, `app: webhooks/*`), and warnings for unsafe routes with no CSRF check and `/_…` developer routes without auth.

**Commands:** `optimize`, `optimize:clear`, `config:cache/clear`, `route:cache/clear`, `event:cache/clear/list`, `cache:clear [--store]`, `cache:forget <key>`, `key:generate [--show --force]`, `key:rotate`, `env:encrypt/env:decrypt [--env --key --force]` (key from `--key` or `STRUT_ENV_KEY`, never written to disk), `down [--secret | --with-secret] [--retry --refresh --redirect --render]`, `up`, `session:flush`, `security:check [--audit --json]`, and the global `--force-debug`.

### Evidence

`npm test`: **17 files, 307 tests** (before this extension: 9 files, 115). New files:

| Test file | What it proves |
|---|---|
| `protections.test.ts` | CSRF in every style; the same styles for auth, can and throttle; a wrapper runs once when routed; boot errors for contradictions and typos; an ability must return exactly `true`; `route:list --security`; CSRF bypass attempts (null Origin, sibling subdomains, missing `Sec-Fetch-Site`, `Referer`, method override, cookie + fake bearer, `text/plain` and other content-type tricks) |
| `request-security.test.ts` | Headers on every response (404 and 500 included), a fresh nonce per response, HSTS only in production over HTTPS (never from a spoofed `X-Forwarded-Proto`), header injection refused at boot and CR/LF never splitting a header, the CSP report endpoint (sanitised, capped), Host poisoning, `X-Forwarded-*` spoofing, pollution payloads, deep and key-heavy JSON, CORS off by default and `*` with credentials refused at boot |
| `crypto-urls.test.ts` | Keyring rules, encrypt/decrypt with purposes and rotation, **4/8/12-byte GCM tags refused**, signed and temporary URLs (tampering, expiry, rotation, the `//path` regression), the `signed` middleware, 26 open-redirect payloads, `redirect().intended()`, the idempotency matrix (replay, reuse, 409 in flight, cross-user isolation, retry after failure) |
| `ssrf.test.ts` | The special-range table; 15 blocked targets (`127.0.0.1`, `[::1]`, `2130706433`, `0x7f.0.0.1`, `0177.0.0.1`, `127.1`, `0`, `169.254.169.254`, `[fd00:ec2::254]`, `100.100.100.200`, mapped IPv6…) each proven to make **no connection**; mixed DNS answers; DNS rebinding (one resolution, socket pinned to the checked address); redirect hops re-checked; timeout, size cap, redirect limit |
| `boot-guards.test.ts` | Debug in production refused (and `--force-debug`), weak, short or malformed keys refused without echoing them, and a hostile session that leaves no key, token, cookie or report URL in the logs |
| `commands.test.ts` | Every command above, on copies of the example app: encrypted config cache (no secrets in the file), caches from another key, other code, a changed route table or edited by hand ignored with a warning; Windows EPERM retry; key rotation keeping old ciphertexts and links valid; env encryption round trip, wrong key and truncated tags; maintenance mode with retry/refresh, `/up` kept healthy, restart and **real multi-process** behaviour, `--with-secret` bypass cookie, `--redirect` (9 hostile values refused), `--render` path checks, corrupt state stays down; `session:flush`; `security:check` pass, production failures, refused boot and `--audit` |
| `fuzz.test.ts` | Seeded fuzzing: the JSON limit parser agrees with `JSON.parse` and measures depth and keys exactly (6,000 values), only throws its own error on 10,000 mutated inputs, never lets `__proto__` through; the signed-URL verifier accepts a one-character change only when it changes nothing (9,000 links) and never throws (5,000 inputs) |
| `security-types.test.ts` | Public helper types: protection options, wrappers, `csrf.token` only on `csrf`, `defineProtection` needs `handle()`, abilities return booleans, signed route helpers typed like `route()`, `decrypt()` is `unknown`, settings options, `withoutCsrf()` only on the test client |

Existing tests changed only where the new boot guard applies (a production app with `APP_DEBUG=true` now needs `forceDebug`) and where the fixture's test key was shorter than 32 bytes.

### Findings

1. **One generic helper is enough.** Each style runs the same middleware class. The only subtlety is a wrapper on a routed handler: the router runs the middleware at its priority and marks it applied, and the wrapper then skips it (`ctx.markApplied`), so it runs exactly once; called outside the router, the wrapper runs it itself. Wrappers carry their references on a symbol property, so `route:list` still sees inside the closure. Decorators would have hidden exactly this.
2. **Opt-outs need precedence rules, or they silently remove protection.** The rules above came out of the tests; the "same level contradiction is a boot error" rule is what keeps a forgotten `.withoutMiddleware()` from overriding a deliberate `.middleware()`.
3. **A cookie plus a junk bearer header** skips CSRF (bearer requests are exempt) and, without care, would still be authenticated by the cookie. `ctx.sessionId()` ignores the session cookie whenever a bearer header is present (review F-07).
4. **Content types must be compared by essence.** The original `includes('application/json')` accepted `text/plain; x=application/json`, which a cross-site form sends without a preflight.
5. **The fuzzer found a real bug:** `verifySignedUrl('//cdn/x?…')` resolved the path as a URL with host `cdn`, so the signed path and the checked path differed (and some inputs threw). Paths are now appended to a fixed base, never resolved.
6. **AES-GCM tag length.** Node accepts truncated tags unless told otherwise (DEP0182). Every decryption passes `authTagLength: 16` and refuses any tag that isn't exactly 16 bytes before `setAuthTag`; packed formats use fixed offsets so a short tag can't come in through a length field. Regression tests use genuine 4/8/12-byte tags made by Node.
7. **JSON limits must run before `JSON.parse`.** A linear pre-scan (depth, and keys counted as `:` outside strings) refuses hostile bodies in one pass. `JSON.parse` creates an *own* `__proto__` property (no pollution yet, but the next deep merge would), so `__proto__` and `constructor.prototype` are refused outright.
8. **SSRF: the URL parser is an ally, DNS is the enemy.** WHATWG URL already turns `2130706433`, `0x7f.1` and `0177.0.0.1` into `127.0.0.1` and strips tabs and newlines, so checks run on the normalised host. Rebinding is defeated by resolving once, checking every address, and pinning the socket's `lookup` to the checked address (the test's resolver is called exactly once while the request succeeds); TLS keeps the real name for SNI and certificate checks.
9. **Security headers belong outside the error handler**, or 404/500 pages ship without CSP and `nosniff`. A route's own CSP (the debug page) wins.
10. **A refused CORS preflight got its headers back** from the response decorator (found by a test); preflights are now answered only by the preflight stage.
11. **Optional config values are `undefined`, which JSON drops,** so a cached config lost keys and `config()` threw for them. The config cache encodes `undefined` explicitly.
12. **The bootstrap caches don't make boot faster in TypeScript.** Routes compile in milliseconds and config builders are cheap; the only expensive boot step the caches can skip is the per-controller route check. Meanwhile checking a cache's code fingerprint (hashing `app/`, `routes/`, `config/`, `bootstrap/`) costs about 22–55 ms on this example. Measured on a shared, heavily loaded laptop (noisy): boot without caches 110–190 ms, with all three caches 135–320 ms. The first version hashed once per cache and was worse; the fingerprint is now computed once per boot. The caches' real value here is parity (`config:cache` freezes config like Laravel), integrity (a tampered or copied cache is refused) and secrecy (the config cache is encrypted).
13. **Maintenance mode across processes** works with a file plus a per-request `stat` (modification time, size and inode, because an atomic rename can land in the same millisecond). A corrupt file keeps the app down. Unlike Laravel, the bypass secret is never stored (an HMAC under an `APP_KEY` subkey), and the bypass cookie is bound to the current secret, so a new `down` invalidates old cookies.

### Ready to port into `@strutvane/framework`

- `http/protection.ts` + `http/protections.ts` (the generic styles), `http/route-middleware.ts` (resolution and boot errors), `http/security-profile.ts` and `route:list --security`.
- `http/kernel.ts` (global stages and response decorators), `security/secure-headers.ts`, `http/csp-report.ts`, `security/trusted-hosts.ts`, `security/trusted-proxies.ts`, `security/cors.ts`, `security/safe-json.ts`, `security/settings.ts` (one boot error listing every bad setting).
- `security/aead.ts`, `security/keyring.ts`, `security/encrypter.ts`, `security/signed-url.ts` + `http/signed.ts`, `security/redirect.ts` + `http/redirect.ts`, `security/ip.ts` + `security/http-client.ts`, `http/idempotency.ts` (with a shared store).
- `security/boot-guards.ts`, `support/atomic-write.ts`, `support/env-file.ts`, `maintenance/maintenance.ts`, and the commands in `console/commands/{caches,cache-store,keys,env-crypt,maintenance,session-flush,security-check}.ts`.
- Port as is, with their tests. `foundation/bootstrap-cache.ts` and `cached-boot.ts` port too, but see open question 3.

### Open questions

1. **`withoutCsrf()` environment name.** The brief says `APP_ENV=test`; this app's environments are `local`, `testing` and `production` (Laravel's names), so it is allowed only for `testing`. Confirm.
2. **CSRF tokens still use an HMAC under the raw `APP_KEY`** (from the first version of this spike), not a keyring subkey, so `key:rotate` changes every token (open forms need one reload) and previous keys aren't tried. Move CSRF to the keyring?
3. **Keep the route and event caches?** They add integrity and parity but no speed here. For production, a deploy-time build id (for example `STRUT_BUILD_ID`) could replace hashing the files at boot.
4. **Pre-session CSRF tokens** (login and register forms) and token rotation at login belong to the session layer; `csrf.token(ctx)` refuses to issue a token without a session.
5. **Shared stores.** Rate limits, idempotency keys and the memory cache are per process; production needs the database or Redis behind the existing interfaces (review F-22).
6. **Request timeouts** (blueprint §5.2 "Requests") are not built; they belong in the server adapter (`serve`).
7. **`--key` on the command line** lands in shell history; the docs should push `STRUT_ENV_KEY`.
8. **`npm audit` in `security:check`** runs npm's CLI through the current Node binary (no bare `npm` lookup, review F-25) and is opt-in (`--audit`) because it needs the network.

## Limits (not done here)

- The data layer is a deliberately tiny stand-in (`Model('posts')` with find, paginate, create, update, delete). Spike 11's ORM replaces it. The contract `ResourceController` needs is listed below.
- No sessions, cookies or login (the auth package). The CSRF middleware is complete for cookie requests, but login CSRF and token rotation belong to the session layer. The `auth` guard is a bearer-token stub with hashed tokens.
- Not built: OpenAPI and `.strutvane/client.gen.ts` from the route registry (the compiled route table plus `resources.json` has everything they need), `migrate`/`db:seed` commands (spike 10 and spike 11), tenancy (`runWithTenant` around each request), a transaction per test, `Mail.fake`, and `asTenant`. Maintenance mode was added on 2026-11-15. Naming: `up`/`down` stay reserved for maintenance mode (Laravel); Docker gets `services:up`/`services:down`.
- Sessions, login and the session-bound CSRF token rotation still belong to the auth package; the security kit provides the seams (`ctx.sessionId()`, `SessionStoreToken`, `session:flush`).
- The rate limiter is a fixed window in memory. Production needs v1's sliding window and a shared store (F-22).
- Only Windows was measured.

## Recommendation

1. **Adopt this core shape for `@strutvane/framework`:**
   - the fluent `Application.configure()…create()`;
   - providers with `register()` then `boot()`;
   - typed config files over a collecting env reader;
   - routes as values with `defineRoutes`;
   - the one-block registry augmentation for route names, config and the user;
   - `ResourceController` as an overridable base class;
   - FormRequest over Standard Schema with unknown fields refused;
   - policies that deny by default;
   - boot-time checks;
   - `node strut` as a declarative command registry.
2. **Keep the security defaults as framework code with their tests:** deny-as-404 for invisible records, CSRF on all cookie-authenticated unsafe requests including `/api`, middleware priority, internal-table refusal, deny-all generated policies, authorizing generated controllers, random slug suffixes, and debug details only in local/testing.
3. **Ship the framework as compiled JS;** keep app code as TypeScript run by Node's type stripping. Measure `node strut` again with lazy command imports. The target is under 300 ms.
4. **Next:** wire spike 11's ORM under `ResourceController` (the contract below), generate OpenAPI and the typed client from the compiled route table, and add `migrate`, `db:seed` and `services:up`/`services:down`.

### The ResourceController contract with the ORM (spike 11)

| ResourceController needs | This spike's stand-in | Spike 11 equivalent |
|---|---|---|
| `Model.metadata()` (resources.json allow-lists) | ✔ | read `resources.json` beside the ORM snapshot |
| `Model.paginate(listRequest, constraints)` | ✔ | `query().search().filter().sort().paginate()`, with names checked against resources.json first |
| `Model.createFromValidated(values)` | ✔ | `Model.create(values)` (fillable only) or `forceCreate` after `prepareForStore` |
| `record.updateFromValidated(values)` | ✔ | `record.fill(values).save()` |
| `record.delete()` (soft when `deleted_at`) | ✔ | same |
| `Model.resolveRouteBinding(value, field?)` | ✔ | `query().where(field, value).first()` (tenant-scoped) |
| `Model.isTaken(column, value, exceptKey?)` | ✔ | an `exists()` query including trashed rows, tenant-scoped |
| `static fillable` | ✔ | `Model('posts', { fillable })` |
| error mapping | 404/409/422 | `MODEL_NOT_FOUND` 404, `MASS_ASSIGNMENT`/`INVALID_VALUE` 422, `UNKNOWN_COLUMN`/`INVALID_FILTER` 400, `TENANT_REQUIRED` 403 |
