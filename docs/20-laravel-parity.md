# 20. Laravel parity matrix

- **Status:** Active checklist (2026-11-15). Phase 1 and 2 framework work must tick every row assigned to it.
- **Goal:** everything Laravel offers has a home in Strutvane, or a stated reason why not.
- **Sources:** Laravel docs table of contents (12.x, as recalled on 2026-11-15; *unverified* against the live site); [18 blueprint](18-v2-blueprint.md); [package catalogue v2](research/2026-11-14-package-catalogue-v2.md).

**Phases:** P1 = 0.2 (the full flow), P2 = 0.3 (background work), P3 = 1.0, P4–P8 = see the catalogue.

**Status values:**
- ✅ proven in a spike;
- 🟡 planned;
- 🆕 **gap found on 2026-11-15, now added**;
- ➖ not applicable, with the reason.

## Getting started

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| `laravel new` installer | `npm create strutvane@latest` (§2.1) | P1 | ✅ spike 13 |
| Configuration, `config()`, `.env`, `config:cache` | framework config, typed `config()` | P1 | ✅ spike 12 |
| `env:encrypt` / `env:decrypt` | same commands | P1 | ✅ spike 12 (in progress) |
| **Maintenance mode** `down` / `up` (`--secret`, `--retry`, `--refresh`, `--render`, `--redirect`) | `node strut down` / `up`, same options; secret bypass cookie; `/up` health route stays reachable | P1 | ✅ spike 12 (in progress); 🆕 add `--redirect` and `--with-secret` |
| Directory structure | `strutvane-skeleton` (MVC layout, §3.1) | P1 | 🟡 |
| Starter kits (React/Vue/Livewire) | installer + auth screens in the Crisp/Vivid designs | P1 | 🟡 |
| Deployment (`optimize`, recipes) | `optimize`, deploy recipes, opt-in Dockerfile (ADR-0021), `/up` | P1 | ✅ spike 13 |

## Architecture

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Request lifecycle | the framework kernel; a docs page | P1 | ✅ spike 12 |
| Service container, providers | the framework container (no reflection; `static inject`) | P1 | ✅ v1 core |
| Facades | typed static accessors (`Log`, `Cache`, `DB`, `Route`, `Mail`, `Storage`, `Http`) resolved from the container, no `__callStatic` magic; all swappable in tests | P1 | 🆕 |
| Contracts | `@strutvane/framework/contracts` | P1 | ✅ v1 |

## Basics

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Routing: groups, prefixes, names, model binding (id or slug), subdomains, rate limits | framework router | P1 | ✅ spike 12 |
| Fallback routes (`Route::fallback`) | `Route.fallback()` | P1 | 🆕 |
| Form method spoofing (`_method`) | `_method` field, POST only, to PUT/PATCH/DELETE; CSRF still applies | P1 | 🆕 |
| Middleware: global, groups, aliases, parameters | framework | P1 | ✅ spike 12 |
| Terminable middleware, `defer()` (work after the response) | `terminate()` hook + `defer(fn)`; errors are logged, never lost | P1 | 🆕 |
| CSRF | every style (§5.2) | P1 | ✅ spike 12 |
| Controllers: resource, API resource, invokable | framework | P1 | ✅ spike 12 (resource, API resource); 🟡 invokable |
| Singleton resources, shallow nesting | `Route.singleton()`, `{ shallow: true }` | P1 | 🆕 |
| Requests: input, files, old input, flash | framework + session flash | P1 | 🟡 |
| Responses: JSON, download, file, redirect | framework | P1 | ✅ spike 12 |
| Streamed responses, server-sent events (`response()->eventStream`) | `stream()` and `eventStream()` with back-pressure and abort on disconnect | P2 | 🆕 |
| Views / Blade | ➖ React UI is owned by the app; mail templates use React components | — | ➖ |
| Vite | Vite through `@strutvane/ui`; one port in dev | P1 | ✅ spike 14 |
| URL generation, signed URLs | typed `route()`, `url.signedRoute()`, `url.temporarySignedRoute()` | P1 | ✅ spike 12 |
| Session: drivers, flash, regenerate | framework (database/cookie/redis) | P1 | ✅ spike 20 |
| Session blocking (one request per session at a time) | `.block()` on routes | P2 | 🆕 |
| Validation: rules, form requests, nested arrays, files, conditional | Zod schemas from migrations + `make:request` | P1 | ✅ spike 10 |
| Custom rules (`make:rule`), database rules (`unique`, `exists`) | `make:rule`; `unique()` / `exists()` async rules, tenant-scoped | P1 | 🆕 |
| Error handling: `report`, `render`, `dontReport`, throttled reports, error pages | `withExceptions()` in `bootstrap/app.ts`; dev error page with "Copy as Markdown for AI" | P1 | ✅ spike 12 |
| Logging | channels from `.env` (ADR-0022) | P1 | 🟡 in progress |

## Digging deeper

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Artisan: commands, arguments, `make:command`, signals | `node strut`, `make:command` | P1 | ✅ spike 12; 🆕 `make:command` |
| Isolatable commands (one at a time) | `isolated: true` with a lock | P2 | 🆕 |
| Prompts (text, select, search, confirm, spinner, progress, table) | `@strutvane/framework/console` prompts API for app commands, with a test fake | P1 | 🆕 |
| Broadcasting | `@strutvane/realtime` | P6 | 🟡 |
| Cache: stores, `remember`, tags, atomic locks, `flexible` (stale-while-revalidate), `memo` | framework cache + `redis` | P2 | 🟡; 🆕 `flexible`, `memo` |
| Collections, lazy collections | typed helpers on ORM results (`pluck`, `keyBy`, `groupBy`, `chunk`) + `cursor()` / `lazy()` streaming. Not a full Collection clone (native arrays first) | P1 | 🆕 |
| Concurrency (`Concurrency::run`) | `Concurrency.run([...])` on worker threads or processes, with a sync driver for tests | P2 | 🆕 |
| Context (shared, hidden, flows into logs and jobs) | AsyncLocalStorage context → logs (ADR-0022) **and queued jobs** | P2 | 🆕 job propagation |
| Events: listeners, discovery, queued listeners, subscribers | framework events + `event:cache` | P2 | 🟡 |
| Events after the DB commit (`ShouldDispatchAfterCommit`) | `afterCommit: true` on events, jobs and mail | P2 | 🆕 |
| File storage: disks, temporary URLs, visibility | local disk in framework; S3/Azure in `files` | P1 / P3 | 🟡 |
| Helpers: `Str`, `Number`, `Arr`, `retry`, `rescue`, `once`, `tap`, `Benchmark`, `Pipeline`, `Sleep`, `Timebox`, `Lottery` | `@strutvane/framework/support`: `Str`, `Num` (Intl), `retry`, `rescue`, `once`, `Benchmark`, `Pipeline`, fakeable `Sleep`, `Timebox` (constant-time responses), `Lottery` | P1 | 🆕 |
| HTTP client: retry, pool, middleware, `Http::fake` | SSRF-safe client (§5.2) + `Http.fake()` and `Http.preventStrayRequests()` | P1 | 🟡 (spike 12 has only `safeFetch`); 🆕 fake |
| Localization: lang files, JSON strings, pluralisation, per-request locale | message catalogues (RFC-0003) + `t()` with ICU plurals | P1 | 🟡 |
| Mail: mailers, attachments, queueing, local dev inbox | framework mail core (SMTP + dev inbox) | P1 | 🟡 |
| Markdown mail, mail preview in the browser, failover/round-robin mailers | React mail templates, `/_strutvane/mail/preview/<mailable>`, `failover` and `roundrobin` transports | P2 | 🆕 |
| Notifications: mail, database, broadcast, on-demand | framework (P2) + `notification-channels` (SMS, Slack, Teams, push) | P2 / P6 | 🟡 |
| Package development, `vendor:publish` | installer protocol + `node strut publish <package> [--tag=config\|migrations\|views]` | P1 | 🆕 `publish` |
| Processes (`Process::run`, pool, pipe, fake) | `Process.run()` with no shell, timeouts, a pool and a fake | P2 | 🆕 |
| Queues: database/redis/SQS, middleware, chains, batches, unique jobs, rate-limited jobs, failed jobs, backoff, timeouts, `queue:monitor` | framework queue core + `redis` + `queue-dashboard`; SQS later | P2 | 🟡; 🆕 chains, batches, unique jobs, job middleware and `queue:monitor` named explicitly |
| Rate limiting | framework limiter (§5.2) | P1 | ✅ spike 12 |
| Task scheduling: cron, no overlap, one server, hooks, `schedule:work` | framework scheduler | P2 | 🟡 |

## Security

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Authentication: guards, remember me, logout other devices, password confirmation | `@strutvane/auth` | P1 | ✅ spike 20 |
| Authorization: gates, policies, `before`, `can` middleware | policies compiled to SQL, `can`, and a UI `can()` hook | P1 | ✅ v1 + spike 12 |
| Email verification, password reset | auth | P1 | ✅ spike 20 |
| Encryption, key rotation (`APP_PREVIOUS_KEYS`) | framework | P1 | ✅ spike 12 (in progress) |
| Hashing (bcrypt/argon2) | scrypt by default, argon2 optional, rehash on login | P1 | ✅ spike 20 |

## Database

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Multiple connections, transactions, deadlock retries | ORM | P1 | ✅ spike 11 (connections, transactions); 🟡 multiple connections, deadlock retries |
| Read/write splitting, sticky writes | `read` / `write` hosts in `config/database.ts`, `sticky: true` | P3 | 🆕 |
| `db:show`, `db:table`, `db:monitor` | same commands (`--json`) | P2 | 🆕 |
| Query builder | ORM builder (Builder → Grammar → Connection) | P1 | ✅ spike 11 |
| Pagination: length-aware, simple, cursor | ORM + API | P1 | ✅ spikes 10 and 11 |
| Migrations: `fresh`, `refresh`, `rollback --step`, `--pretend`, `--isolated` | migration-first runner | P1 | ✅ spike 10 (`migrate`, rollback); 🟡 `fresh`, `refresh`, `--pretend`, `--isolated` |
| Migration squashing (`schema:dump`) | `schema:dump` per engine | P2 | 🆕 |
| Seeding | seeders tracked once, auto-registered | P1 | ✅ spike 10 |
| Redis | `@strutvane/redis` | P2 | 🟡 |
| MongoDB | ➖ relational focus; demand-driven later | — | ➖ |

## Eloquent → the Strutvane ORM

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Models, mass assignment, upserts, chunking, `cursor()` / `lazy()` | ORM | P1 | ✅ spike 11 (models, mass assignment); 🟡 upserts, chunking, `cursor()` / `lazy()` |
| Global and local scopes | ORM (the tenant scope is a global scope) | P1 | ✅ spike 11 |
| Model events, **observers** (`make:observer`) | model hooks + observer classes | P1 | 🆕 observers |
| Soft deletes, `restore`, `forceDelete` | ORM | P1 | ✅ spike 11 |
| Pruning (`Prunable`, `model:prune`) | `prunable()` on models + scheduled `model:prune` | P2 | 🆕 |
| `replicate()` | `model.replicate()` (also used by UI "Duplicate") | P1 | 🆕 |
| Strict mode (`preventLazyLoading`, silently discarded attributes, missing attributes) | `Model.strict()` on in development, throws with a fix hint | P1 | 🆕 |
| Relationships: one/many, belongs-to-many with pivot, has-many-through, polymorphic, eager-load constraints, `withCount` / `withSum`, `touches` | ORM | P1 / P2 | ✅ spike 11 (core); 🆕 polymorphic and through named explicitly |
| Mutators, casts, enum casts, encrypted casts, custom casts | ORM casts | P1 | ✅ spike 11 (casts); 🟡 enum, encrypted and custom casts |
| **API resources** (`JsonResource`, collections, conditional fields, pagination meta) | `make:resource` → typed transformers used by the auto API and controllers | P1 | 🆕 |
| Serialization: hidden, visible, appends | ORM | P1 | ✅ spike 11 (hidden); 🟡 visible, appends |
| Factories: states, sequences, `for` / `has`, **recycle** | factories (recycle stops new parents being created per row, a demo bug) | P1 | ✅ spike 10; 🆕 recycle |

## Testing

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Test setup, parallel tests, coverage | Vitest kit, a database per worker | P1 | 🟡 |
| HTTP tests (`actingAs`, fluent JSON assertions, validation assertions) | testing kit | P1 | ✅ spike 12 |
| Console tests (`expectsQuestion`, `expectsOutput`, `assertExitCode`) | `strut('cmd').expectsQuestion()...` | P1 | 🆕 |
| Database tests (`RefreshDatabase`, `assertDatabaseHas`, seeders in tests) | a transaction per test + assertions | P1 | 🟡 |
| Fakes: Bus, Event, Mail, Notification, Queue, Storage, Http; time travel (`travelTo`) | `Mail.fake()` … `Http.fake()`, `travelTo()` / `freezeTime()` | P1 / P2 | 🆕 (named explicitly) |
| Browser tests (Dusk) | `@strutvane/browser-testing` (Playwright) | P7 | 🟡 |

## First-party packages

| Laravel | Strutvane | Phase | Status |
|---|---|---|---|
| Breeze / starter kits | installer + designs | P1 | 🟡 |
| Fortify, Sanctum | `@strutvane/auth` | P1 | ✅ spike 20 |
| Sail | Docker mode (everything in containers) | P1 | ✅ spike 13 |
| Prompts | console prompts API | P1 | 🆕 |
| Precognition (live validation using backend rules) | shared Zod schemas, plus a `Precognition` request header that runs only server-side rules (`unique`, `exists`) without saving | P1 | 🆕 |
| Pint | Biome config in every generated app + `node strut lint` / `format` | P1 | 🆕 commands |
| Socialite | `social-login` | P2 | 🟡 |
| Boost | `agent-tools` | P2 | 🟡 |
| Horizon | `queue-dashboard` | P2 | 🟡 |
| Telescope | `inspector` | P3 | 🟡 |
| Pulse, Nightwatch | `observability` (self-hosted) | P3 | 🟡 |
| Scout | database full-text in the framework + `search` (engines) | P3 | 🟡 |
| Octane | ➖ Node servers are long-running already; 🆕 `node strut serve --workers=N` cluster mode | P3 | 🆕 |
| Passport | `oauth-server` | P5 | 🟡 |
| Pennant | `feature-flags` | P5 | 🟡 |
| MCP | `mcp-server` | P5 | 🟡 |
| Cashier | `billing` | P6 | 🟡 |
| Reverb + Echo | `realtime` (server + client) | P6 | 🟡 |
| AI SDK | `ai` | P7 | 🟡 |
| Dusk | `browser-testing` | P7 | 🟡 |
| Folio (file-based pages) | ➖ for now: the React UI owns its routes. Revisit if users ask | — | ➖ |
| Envoy | ➖ deploy recipes in the docs | — | ➖ |
| Homestead, Valet, Herd | ➖ Node + Docker mode cover local development | — | ➖ |
| Inertia, Livewire | ➖ the React SPA is owned by the app | — | ➖ |
| Forge, Vapor, Cloud (hosting) | ➖ hosting products, not framework features; deploy recipes cover the targets | — | ➖ |

## Beyond Laravel (already decided)

Generated CRUD API and UI on `migrate`, the two designs, the package catalogue for 100+ packages, policies compiled to SQL, PostgreSQL RLS tenancy, the "Copy as Markdown for AI" error page, `security:check`, typed routes/config end to end, and the production readiness protocol (doc 19).

## How this is used

- Phase 1 and 2 framework briefs reference this file. A phase is complete only when every row assigned to it is ✅ in a package (not just a spike) and passes doc 19's gates.
- New Laravel features go in here first. Then they get a home and a phase.
