# First-party package catalogue: what lives in the framework, what ships as a package (research + design, 2026-11-14)

- **Date:** 2026-11-14
- **Type:** research and design proposal. It changes no decision. Every conflict with a canonical decision is listed in §8 and needs an ADR before anyone builds on it.
- **Brief:** Strutvane is being rebuilt to copy Laravel's flow, MVC architecture and **whole ecosystem**, friendlier and more advanced, on TypeScript with **npm only**. The owner wants a Laravel-sized family of first-party packages. This document designs the complete catalogue, the repository that holds it, how it is versioned, published and documented, and the order it gets built in.
- **Inputs (read first, all dated 2026-11-14):**
  - [`2026-11-14-laravel-ecosystem-study.md`](2026-11-14-laravel-ecosystem-study.md) (Laravel 13 flow and first-party packages; cited below as **[eco §n]**)
  - [`2026-11-14-current-state-audit.md`](2026-11-14-current-state-audit.md) (what exists, KEEP/MOVE/REWORK/RETIRE verdicts; **[audit §n]**)
  - [`2026-11-14-laravel-auth-to-ts.md`](2026-11-14-laravel-auth-to-ts.md) (**[auth §n]**)
  - [`2026-11-14-auto-admin-ui-design.md`](2026-11-14-auto-admin-ui-design.md) (**[admin §n]**)
  - [`2026-11-14-installer-and-local-env-design.md`](2026-11-14-installer-and-local-env-design.md) (**[installer §n]**)
  - [`2026-11-14-js-laravel-alternatives-study.md`](2026-11-14-js-laravel-alternatives-study.md) (**[js §n]**)
  - [`../00-executive-summary.md`](../00-executive-summary.md) (D1–D24), [`../14-roadmap.md`](../14-roadmap.md), [ADR-0001](../adr/0001-brand-strutvane-and-scoped-package-names.md), [ADR-0018](../adr/0018-staged-npm-publishing.md)
  - The ORM design (`2026-11-14-strutvane-orm-design.md`) is being written in parallel and **had not appeared** when this was finished. Everything here treats the ORM as "part of `@strutvane/framework/database`" and leaves the engine choice to that document.

**Citation legend.**

- `[L13:page]` = `https://laravel.com/docs/13.x/page`, read 2026-11-14 (either directly for this document or via the ecosystem study).
- `[npm 2026-11-14]` = `npm view <pkg> version license` run on 2026-11-14 with npm 11.19.0. It gives the latest version on the registry that day, not its release date.
- *(unverified)* = prior knowledge or a single secondary source.
- Size estimates are the author's rough judgement for one maintainer working with AI assistance. They are not measurements.

---

## 0. Summary

1. **One framework package does what `laravel/framework` does.** `@strutvane/framework` holds the kernel and everything a normal app needs: container and providers, config and env, routing, controllers, middleware, validation, ORM, migrations, seeders and factories, errors, logging, events, cache, queue, mail, notifications, scheduler, storage, HTTP client, i18n, encryption and hashing, rate limiting, broadcasting, **authorization (gates, policies compiled to SQL), tenancy (Postgres RLS) and audit**, OpenAPI, the console (`npx strutvane …`) and testing helpers. Each has a zero-dependency or small default driver.
2. **Everything else is an optional package**, like Laravel's family: 26 optional packages plus the starter, each named descriptively under `@strutvane` (ADR-0001 style: `@strutvane/queue-dashboard`, not "horizon").
3. **One dependency rule:** every package depends on `@strutvane/framework` (as a peer) and on **nothing else first-party**. Packages cooperate only through framework extension points (driver registries, events, the navigation and operator-panel registries, installer steps). The framework never imports a package.
4. **One install shape:** `npx strutvane install:<name>` runs `npm install @strutvane/<name>` at the matching version, then the package's installer: typed `config/<name>.ts`, keys in `.env` and `.env.example`, migrations published into `database/migrations/`, the provider line in `bootstrap/providers.ts`, routes, owned UI pages and sidebar entries. Every installer is idempotent and supports `--dry-run`.
5. **One operator panel:** dashboards (logs, queues, inspector, metrics, flags, webhook deliveries, backups) plug into one locked-down panel at `/_strutvane`, behind one deny-by-default gate. Laravel ships each dashboard with its own path and its own gate.
6. **Existing repos:** `framework`, `auth`, `ui`, `files`, `create-strutvane` and `docs` are **kept**. `core`, `contracts`, `cli`, `devkit` and the `logs` pipeline are **merged** into the framework. The logs viewer becomes `@strutvane/log-viewer`. `tooling` and the CLI launcher are **retired** (archived, never deleted).
7. **One npm-workspaces monorepo.** All first-party packages move in lockstep before 1.0, because pre-1.0 caret ranges lock the minor anyway. After 1.0, a fixed "framework train" (framework, auth, ui, log-viewer, create-strutvane, strutvane) plus independently versioned satellites. Publishing stays staged with 2FA approval (ADR-0018). One docs site has a section per package, with docs colocated in each package folder.
8. **Build order:**
   - Phase 1 is the user's whole flow: framework core, ORM, migrations, auth, ui, installer.
   - Phase 2 adds background work: queue, mail, notifications, scheduler, cache, Redis and the queue dashboard.
   - Phase 3 adds data and ops, then 1.0: files, search, import/export, inspector, observability and agent tools.
   - Later phases add identity add-ons, then money and realtime, then AI and workflows.

### 0.1 The catalogue at a glance

| # | Package | One line | Laravel equivalent | Default in a new full-stack app | Phase |
|---|---|---|---|---|---|
| 1 | `@strutvane/framework` (bin `strutvane`) | The framework: kernel, HTTP, ORM, migrations, security, background work, console, testing | `laravel/framework` | yes | 1 (core), 2 (background) |
| 2 | `@strutvane/auth` | Login, registration, reset, verification, 2FA, passkeys, API tokens, teams, auth screens | Fortify + Sanctum + starter-kit auth | yes (full, api) | 1 |
| 3 | `@strutvane/ui` | React UI kit plus an auto-generated admin (lists, forms, details, sidebar) from your tables | Starter-kit layouts + Filament/Nova | yes (full) | 1 |
| 4 | `create-strutvane` | `npm create strutvane@latest`: asks, installs, migrates, seeds, runs | `laravel new` + starter kits | entry point | 1 |
| 5 | `strutvane` (unscoped) | A safe `npx strutvane` outside a project: explains what to do, never runs app code | `laravel/installer` (partly) | — | 1 |
| 6 | `@strutvane/log-viewer` | Live tail, search and download of app logs at `/_strutvane/logs` | Pail + log-viewer (community) + part of Telescope | yes | 1 |
| 7 | `@strutvane/files` | Cloud disks (S3, Azure), file and image fields, variants, virus scan, quotas | Flysystem adapters + Spatie Media Library | no | 3 |
| 8 | `@strutvane/redis` | Redis/Valkey drivers for cache, queue, locks, sessions, rate limits, broadcasting | Redis drivers in `illuminate/*` | no | 2 |
| 9 | `@strutvane/queue-dashboard` | Jobs, failures, throughput, retries, schedules, in the operator panel | Horizon | no | 2 |
| 10 | `@strutvane/inspector` | Dev-time recorder: requests, queries, jobs, mail, policy decisions, with "why denied?" | Telescope | dev only | 3 |
| 11 | `@strutvane/observability` | OpenTelemetry export plus a self-hosted production metrics dashboard and health checks | Pulse (+ Nightwatch, paid) | no | 3 |
| 12 | `@strutvane/search` | External search engines (Meilisearch, Typesense) and hybrid vector search | Scout (engines) | no | 3 |
| 13 | `@strutvane/import-export` | CSV/XLSX import with mapping and dry run; policy-aware exports | Laravel Excel (community) | no | 3 |
| 14 | `@strutvane/agent-tools` | AGENTS.md/skills, a local MCP dev server, offline docs search for coding agents | Boost | yes (dev) | 3 (basic `AGENTS.md` in 1) |
| 15 | `@strutvane/social-login` | Sign in with Google, Microsoft, GitHub, Apple… with safe account linking | Socialite | no | 4 |
| 16 | `@strutvane/sso` | Per-tenant OIDC and SAML SSO, SCIM provisioning, domain verification | WorkOS starter-kit variant | no | 4 |
| 17 | `@strutvane/oauth-server` | Be an OAuth 2.1 provider (auth code + PKCE, client credentials, device) | Passport | no | 4 |
| 18 | `@strutvane/mcp-server` | Expose your app to AI agents as MCP tools, resources and prompts, under your policies | Laravel MCP | no | 4 |
| 19 | `@strutvane/feature-flags` | Typed flags per user, tenant or plan, with an operator UI | Pennant | no | 4 |
| 20 | `@strutvane/webhooks` | Signed outgoing webhooks with retries and a delivery log; incoming signature checks | spatie webhook-server/client (community) | no | 4 |
| 21 | `@strutvane/billing` | Subscriptions, seats, invoices and one-off payments (Stripe, Paddle) per tenant | Cashier | no | 5 |
| 22 | `@strutvane/realtime` | WebSocket server, private/presence channels, live-updating admin tables | Reverb + Echo | no | 5 |
| 23 | `@strutvane/notification-channels` | SMS, Slack, Microsoft Teams, web push, WhatsApp, plus a user preference centre | laravel-notification-channels (community) | no | 5 |
| 24 | `@strutvane/dashboards` | Metric cards, trends and charts on admin home pages; scheduled report emails | Nova metrics / Filament widgets | no | 5 |
| 25 | `@strutvane/ai` | Provider-agnostic LLM calls, typed structured output, embeddings, agents with policy-bound tools | Laravel AI SDK | no | 6 |
| 26 | `@strutvane/workflows` | Durable multi-step workflows with human approvals and timers | none first-party | no | 6 |
| 27 | `@strutvane/browser-testing` | Playwright fixtures: fresh DB, `actingAs`, tenants, page objects for generated screens, a11y | Dusk / Pest browser testing | no | 6 |
| 28 | `@strutvane/backup` | Encrypted database and storage backups with retention, restore drills and monitoring | spatie/laravel-backup (community) | no | 6 |

**Built in, so no package:** Sail (`npx strutvane up/down`), Prompts (the console's prompt layer), Pint (Biome config in every app), Precognition (shared validation), Wayfinder (typed client from OpenAPI), Folio (file routes in `@strutvane/ui`), Octane (Node is already long-lived), Envoy (out of scope; deploy recipes in the docs). **Not applicable:** Volt, Herd, Valet, Forge, Vapor, Cloud. See §3.

---

## 1. How the line is drawn

### 1.1 What goes into `@strutvane/framework`

A capability is built into the framework when **any** of these holds:

1. **The user's Phase-1 flow needs it.** That flow is create → `make:migration` → `migrate` → CRUD API + UI → protected by auth → tested.
2. **Security code calls it directly.** Authorization, tenancy, audit, sessions, hashing and CSRF must be one direct call away from controllers and the ORM. The audit traced 6 of the 28 playground issues (#1, #2, #11, #16, #18, #28) to the hook seam between `auth` and `framework` [audit §B.5, §B.14]. Laravel also keeps Gate, policies, guards, sessions and hashing in the framework [auth §2.1].
3. **It has a useful default driver with no heavy dependency.** Examples: the database queue, database or file cache, SMTP mail, the local disk and database search.
4. **Laravel ships it in `illuminate/*`**, because users expect it there [js §5.1].

### 1.2 What becomes an optional package

A capability becomes a separate package when **any** of these holds:

- It pulls a heavy or native dependency (`sharp`, cloud SDKs, `ioredis`/`iovalkey`, Playwright).
- It ships a dashboard UI.
- It wraps a third-party vendor (Stripe, Meilisearch, an IdP, an LLM provider).
- It serves a minority of apps (OAuth provider, SAML, billing).
- It is development-only tooling (inspector, agent tools, browser testing).

This is Laravel's own split: Horizon, Telescope, Pulse, Scout, Cashier, Socialite, Passport and Reverb are separate repositories and packages [js §5.1; eco §11].

### 1.3 The dependency rule (replaces D23 and the six-connection integration map)

- Every optional package declares `"peerDependencies": { "@strutvane/framework": "<train range>" }` and **no other `@strutvane/*` dependency**. A lint check in CI enforces this.
- **The framework never imports a package.** Inside the framework, module boundaries such as "`database` never imports `http`" are enforced by lint, not by repositories [audit §D.1].
- Packages cooperate **only** through documented framework extension points. This list replaces docs/17's six mechanisms:

| Extension point | Used by (examples) |
|---|---|
| **Service providers and container tokens** (`register`/`boot`, typed tokens) | every package |
| **Driver registries** for cache, queue, lock, session, mail transport, notification channel, disk, search engine, broadcaster, rate-limit store, feature-flag store | redis, files, search, notification-channels, realtime, feature-flags |
| **Events** (typed domain and framework events, dispatched after commit by default) | billing → notifications, webhooks (subscribe to model events), dashboards, inspector |
| **Navigation registry** (the app sidebar: label, icon, group, sort, badge, hidden by `viewAny`) | ui, billing, webhooks, import-export, feature-flags |
| **Operator panel registry** (`/_strutvane/*` pages behind one gate) | log-viewer, queue-dashboard, inspector, observability, feature-flags, webhooks, backup |
| **Dev process registry** (the processes `npm run dev` multiplexes, like `artisan dev` [eco §1.3]) | queue worker, scheduler, realtime server, Vite |
| **Installer steps** (config, env, migrations, provider line, routes, owned pages) | every package |
| **Agent resources** (each package ships `ai/guidelines.md` and `ai/skills/*/SKILL.md` in its tarball) | agent-tools reads them |
| **HTTP + OpenAPI** | ui and external clients read the API, never server internals |

- **Optional cooperation is by capability, not by import.** For example, billing can use feature flags for plan entitlements. It asks the container `has(FeatureFlags)` and uses the framework-defined `FeatureFlags` token. It never imports `@strutvane/feature-flags`. If flags aren't installed, billing falls back to its own `plan.features` list. Each such pairing is written down in the package's docs page under "Works with".
- **Generated code may import more than one package.** An installer may write *app-owned* files (pages, config) that import `@strutvane/ui` components, but only when that package is in the app's `package.json`. The app imports both; the packages still don't import each other.

### 1.4 The install shape (Laravel's `composer require` + `php artisan x:install`)

```bash
npx strutvane install:billing           # = npm install @strutvane/billing@<train> + the installer
npx strutvane install:billing --dry-run # print every file, env key and migration it would write
npm i @strutvane/billing && npx strutvane install:billing   # same result if you prefer to install first
npx strutvane packages                  # installed first-party packages, versions, registration status
npx strutvane remove:billing            # unregister provider + config; keeps migrations and data (prints how to drop them)
```

- **Registration is explicit.** The installer appends one line to `bootstrap/providers.ts`, like Laravel 11+'s `bootstrap/providers.php` [eco §2.3]. Implicit discovery from `node_modules` is *not* used: it is opaque and runs dependency code at boot without the app saying so. `npx strutvane doctor` warns when an installed `@strutvane/*` package isn't registered.
- **Installers reuse the devkit engine** (staged FS, journaled transaction with crash recovery, env editor, deps editor, config patcher) after it moves into `framework/console/support` [audit §C.2].
- **Migrations are published into the app** (`database/migrations/<ts>_create_subscriptions_table.ts`). They are app-owned and applied by `npx strutvane migrate`. This follows the auth research's C5 [auth §9] and removes the package-migration vetting gate: only the app's own folder runs.
- **CLI spelling conflict:** this document writes `npx strutvane …` as the brief asked. The installer research recommends `node strut …` for Windows-safety [installer §4]. The two are equivalent entry points to the same console kernel. The choice belongs in one ADR (§8).
- **`npx` safety:** if `@strutvane/framework` isn't installed locally, `npx strutvane` downloads the **unscoped `strutvane` npm package**. That package must therefore stay a tiny, safe package: it prints "run inside a Strutvane project, or `npm create strutvane@latest`" and never executes project code (§4.5).

---

## 2. Laravel framework components → `@strutvane/framework`

The "Today" column is the code state from the audit [audit §A]. Subpaths are proposals.

| Laravel component | Strutvane home | Today (2026-11-14) | Default driver(s) / notes |
|---|---|---|---|
| Container, providers, facades | `framework` root (`createApp`, `ServiceProvider`, typed tokens) | built (core) | Typed tokens and request-scoped helpers instead of facades [eco §2.3] |
| Config, env | `framework/config` | built (core) | Typed `config/*.ts`, env validated with Standard Schema at boot |
| Routing, controllers, middleware | `framework/http` (Hono inside) | partly (auto routes, no controllers) | `routes/api.ts`, `routes/web.ts`, `Route.resource()`, `ResourceController` [audit §B.3] |
| Validation, form requests | `framework/validation` | built (Zod derived from model) | Requests generated from columns; unknown fields rejected by default |
| Precognition | `framework/validation` + `ui` | not built | The same Zod schema runs in the browser; the server re-validates (§3) |
| Eloquent, query builder, pagination, API resources | `framework/database` | partial (repository, filters, cursor) | **ORM design pending** (parallel research). Offset, simple and cursor pagination |
| Migrations, schema builder, seeders, factories | `framework/database` | migrator built; schema builder missing | Migration-first `Schema.create()`, plus drift detection and safe-change lint |
| Errors and the exception page | `framework/errors` | built (RFC 9457 `Problem`, catalogs) | Debug page with "copy as Markdown for AI", redacted |
| Logging | `framework/log` | built (in `@strutvane/logs`) | Pipeline moves in; viewer is a package |
| Events, listeners, observers | `framework/events` | in-process events built | After-commit dispatch by default; transactional outbox |
| Cache, locks | `framework/cache` | not built | `database`, `file`, `memory`; Redis in `@strutvane/redis` |
| Queue | `framework/queue` | not built | `database` (Postgres `SKIP LOCKED`, SQLite), `sync`, `memory`; Redis in `@strutvane/redis` |
| Mail | `framework/mail` | not built | `smtp` (via nodemailer 10.5.0, MIT-0 [npm 2026-11-14]), `log`, `array`; HTTP-API transports (Resend, Postmark, SES) as small `fetch` drivers |
| Notifications | `framework/notifications` | not built | `mail`, `database` (in-app inbox), `broadcast`; more channels in a package |
| Scheduler | `framework/schedule` | not built | `schedule:run` / `schedule:work`, one-server lock; engine candidate croner 11.0.0 (MIT) [npm 2026-11-14] |
| Storage, uploads | `framework/storage` | built (local, memory, signed URLs) | Cloud disks in `@strutvane/files` (D21) |
| HTTP client | `framework/http-client` | not built | `fetch`-based: timeouts, retries, fakes, SSRF guard |
| Localisation | `framework/i18n` | built (ICU catalogs) | Shared with the UI; typed keys |
| Encryption, hashing | `framework/crypto` | built (argon2id in auth) | argon2id default; `APP_KEY` with previous keys for rotation |
| Rate limiting | `framework/http` | built (in auth) | Named limiters; `api` keyed by user, then tenant, then IP |
| Broadcasting | `framework/broadcasting` | not built | Channel definitions + auth via policies; `log`/`null` drivers; WebSocket server in `@strutvane/realtime` |
| Session, cookies, CSRF | `framework/http` | partly | Database session driver default |
| Auth primitives: guards, `auth` middleware, Gate, policies | `framework/auth` + `framework/authorization` | built (in auth) | Policy → SQL compiler, two-valued semantics (ADR-0008/0017) |
| Tenancy (no Laravel first-party) | `framework/tenancy` | built (in auth) | RLS under ADR-0007's five rules |
| Audit (Spatie Activitylog, community) | `framework/audit` | built (in auth) | Written in the same transaction as the change |
| OpenAPI (none in Laravel) | `framework/openapi` | built | `/openapi.json` + script-free `/docs` (ADR-0019) |
| Artisan, Tinker, Pail, `artisan dev` | `framework/console` (bin `strutvane`) | built (cli) | `make:*`, `migrate`, `repl`, `logs:tail`, `dev` with a process registry |
| Sail | `framework/console` (`up`, `down`) | partly (`services:up`) | Git-ignored `docker/compose.yaml` (ADR-0006) |
| Testing (`RefreshDatabase`, `actingAs`, fakes) | `framework/testing` | built (`createTestApp`, factories) | PGlite/SQLite per test; `Queue.fake()`, `Mail.fake()`, `Http.fake()` |
| Health route `/up` | `framework/http` | — | `/up` (liveness), `/ready` (DB, queue lag); checks registry |

---

## 3. Laravel first-party packages → Strutvane decision

| Laravel | Decision | Strutvane | Reason |
|---|---|---|---|
| **Fortify** | package | `@strutvane/auth` | Headless auth features plus routes; default in full and api apps [auth §5.1] |
| **Sanctum** | package (same) | `@strutvane/auth` (token guard, abilities); SPA cookie sessions are framework sessions | Token abilities share the RBAC permission vocabulary [eco §8] |
| **Passport** | package | `@strutvane/oauth-server` | A minority need; heavy [auth §5.9] |
| **Socialite** | package | `@strutvane/social-login` | Vendor-specific; the auth research said `@strutvane/social`, but "social" alone is ambiguous (§8) |
| **Starter kits** (React/Vue/Svelte/Livewire, teams, WorkOS) | starter templates | `create-strutvane` templates (React first) + `@strutvane/ui` + `@strutvane/auth` screens | Owned code [eco §8.2] |
| **WorkOS AuthKit variant** | package | `@strutvane/sso` | Vendor-neutral OIDC/SAML/SCIM |
| **Breeze, Jetstream** | not copied | — | Frozen by Laravel; avoid the churn [eco §8.1] |
| **Horizon** | package | `@strutvane/queue-dashboard` | A dashboard; works with the database driver too |
| **Telescope** | package | `@strutvane/inspector` | Dev tooling with a UI |
| **Pulse** | package | `@strutvane/observability` | Plus OpenTelemetry export and health checks |
| **Nightwatch** (paid, hosted) | covered | `@strutvane/observability` (self-hosted, MIT) | No hosted product (D19) |
| **Pennant** | package | `@strutvane/feature-flags` | |
| **Reverb + Echo** | package | `@strutvane/realtime` (server + `/client` subpath) | A long-running server process |
| **Scout** | split | database engine **in framework**; external engines in `@strutvane/search` | Scout itself says the database engine is "all you need" for most apps [eco §10.2] |
| **Cashier** (Stripe, Paddle) | package | `@strutvane/billing` | The roadmap's `payments` and `billing` merge into one package |
| **Octane** | built in | — | Node already serves from memory. AsyncLocalStorage request context prevents the state-leak class Octane warns about [eco §11] |
| **Sail** | built in | `npx strutvane up/down` | Local-only compose (ADR-0006) [installer §5] |
| **Prompts** | built in | console prompt layer (`@clack/prompts` 1.9.0, MIT [npm 2026-11-14]) | |
| **Pint** | built in (config) | generated `biome.json` + `npm run lint` (`@biomejs/biome` 2.6.7 [npm 2026-11-14]) | No wrapper package needed |
| **Pest / PHPUnit** | built in | Vitest (5.1.0 [npm 2026-11-14]) + `framework/testing` | |
| **Dusk** (and Pest 4 browser testing) | package | `@strutvane/browser-testing` | Playwright is heavy; dev only |
| **Envoy** | not copied | deploy recipes in the docs | D16: production deployment is docs, and Docker is never committed |
| **Precognition** | built in | shared validation in framework + ui | One schema, no round trip |
| **Wayfinder** | built in | `npx strutvane client:generate` → typed client from OpenAPI (ADR-0011) | Laravel needs a separate package [eco §9.1] |
| **Boost** (guidelines, skills, MCP dev server, docs API) [L13:boost] | package | `@strutvane/agent-tools` | Dev only |
| **Laravel MCP** (`laravel/mcp`: servers, tools, resources, prompts; OAuth via Passport or Sanctum) [L13:mcp] | package | `@strutvane/mcp-server` | |
| **AI SDK** (agents, tools, embeddings) [L13:releases] | package | `@strutvane/ai` | Vendor SDKs |
| **Folio** (page routes from files in `resources/views/pages`, `[Post:slug]` binding) [L13:folio] | built in (ui) | file routes in `resources/ui/pages/**` via TanStack Router (D14) | Strutvane's views are React pages |
| **Volt** (Livewire single-file components) | not applicable | — | No Livewire equivalent |
| **Nova** (paid) / **Filament** (community) | package (default) | `@strutvane/ui` admin | The flagship differentiator [admin §0] |
| **Herd, Valet** | not applicable | — | Node needs no PHP-FPM; `npm run dev` serves directly |
| **Forge, Vapor, Cloud** | out of scope | deployment guides | MIT, no platform (D19) |
| **Inertia** (community-official) | not copied | API + typed client + owned React pages | One API serves the UI and third parties |

---

## 4. The catalogue, package by package

Each card lists: what it is, why a developer wants it, the Laravel equivalent, the install command, what it adds to the app, its dependencies, and how the existing package maps to it. Advanced features are in §5.

### 4.1 `@strutvane/framework` (bin: `strutvane`)

- **What:** the framework (§2). It is the only package an API-only app strictly needs.
- **Why:** `npm create` gives a working, migrated, secured app. One package means one version to keep up with.
- **Laravel:** `laravel/framework` (36 `illuminate/*` components [js §5.1]).
- **Install:** pulled in by `create-strutvane`. Manual: `npm i @strutvane/framework`.
- **Adds to the app:** the skeleton [audit §D.2]: `app/`, `bootstrap/app.ts`, `bootstrap/providers.ts`, `config/{app,database,cache,queue,mail,session,storage,logging}.ts`, `database/migrations/*_create_{cache,jobs,sessions}_table.ts`, `routes/{api,web}.ts`, `/up`, `/ready`, `/openapi.json`, `/docs`, and the operator panel shell at `/_strutvane` (empty until a dashboard package registers).
- **Dependencies:** Hono 4.13.18, Zod 4.6.7 and the ORM engine (pending). Optional peers: `pg`, the SQLite driver, `nodemailer` [npm 2026-11-14].
- **Existing packages folded in:**
  - **KEEP** `framework`, reworked to MVC [audit §C.2]
  - **MERGE** `core` (foundation, support, errors, messages), `contracts` (internal types re-exported from `@strutvane/framework/contracts`; the `Problem`, `ListQuery` and `QueryFilter` wire formats stay normative), `cli` (console kernel, generators; registry compiler and field parser **retired**), `devkit` (installer engine → `framework/console/support` plus a public `@strutvane/framework/package` subpath for third-party package authors; merge engine **retired**), the `logs` pipeline, and auth's `policy/`, `sql/`, `tenancy/`, `postgres/`, `audit/`, guard and native identity engine.

### 4.2 `@strutvane/auth`

- **What:** authentication *features* on top of the framework's guards and policies:
  - registration, login and logout
  - password reset, email verification and password confirmation
  - TOTP 2FA with recovery codes, and passkeys
  - profile and security settings, and a browser-sessions list
  - personal access tokens with abilities
  - teams: personal team, invitations and the current team, mapped onto tenancy
  - owned auth screens
  - `user:create`, `team:create`, `team:member:add`, `tokens:prune`, `auth:clear-resets`
- **Why:** Laravel parity for "login works the moment the app runs", with every page owned [auth §0].
- **Laravel:** Fortify + Sanctum + starter-kit auth pages and settings.
- **Install:** chosen at `create` (on for full and api). Later: `npx strutvane install:auth --features=registration,verification,reset,2fa,passkeys,api-tokens [--teams]`.
- **Adds:**
  - `config/auth.ts` (features, role map)
  - migrations: `users` (2FA columns), `password_reset_tokens`, `personal_access_tokens`, `passkeys`, `teams`, `team_members`, `team_invitations` [auth §8]
  - `app/models/user.ts`, `app/actions/auth/*` (owned)
  - routes `/login`, `/register`, `/forgot-password`, `/reset-password/:token`, `/email/verify…`, `/two-factor-challenge`, `/user/confirm-password`, `/api/tokens`
  - pages `resources/ui/pages/auth/*` and `settings/{profile,security,api-tokens,team}` when ui is installed
  - user-menu entries
- **Dependencies:**
  - `@simplewebauthn/server` 14.1.0 and `otpauth` 9.6.0 [npm 2026-11-14]
  - argon2 comes from the framework
- **Existing:**
  - **KEEP**, rescoped: guard, Gate, policies, tenancy and audit **move to the framework** (§1.1). This package keeps features, tokens, teams and screens.
  - The Better Auth engine is **retired** from the default path. It may be re-homed inside `@strutvane/sso` or `@strutvane/social-login` if a spike prefers its providers [auth §9 C3].
  - Express/Node standalone adapters are **retired** [audit §C.2].

### 4.3 `@strutvane/ui`

- **What:**
  - the React 19 UI kit: shadcn-registry components copied into the app (D14) plus library components such as `ResourceList`, `ResourceForm`, `ResourceDetail` and `FilterBar`
  - the app shell: sidebar, header, user menu, tenant switcher, Cmd+K, breadcrumbs
  - **the auto admin**: on `migrate`, every new table gets list, create, edit and detail screens plus a sidebar entry, from typed column metadata [admin §0, §6]
- **Why:** this is the part Laravel needs Filament or Nova for. One UI system serves both the customer app and the back office [eco §12.2].
- **Laravel:** starter-kit layouts + Filament (Nova paid) + Folio-style file routing.
- **Install:** chosen at `create` (full preset). Later: `npx strutvane install:ui`.
- **Adds:**
  - `resources/ui/{app.tsx, navigation.ts, theme.css}`
  - `resources/ui/pages/<resource>/{index,create,edit,show}.tsx` (thin owned files that call library components)
  - `resources/ui/components/ui/*` (registry copies)
  - a Vite config and the dev process
  - `npx strutvane ui:add <component>`, `ui:sync`, `make:page`
- **Dependencies:** React 19, Vite 8, TanStack Router 1.170.46 / Query / Table / Form, Tailwind 4 [npm 2026-11-14 for the router; others per D14].
- **Existing:**
  - **KEEP**: `core/` and `react/` components.
  - **REWORK**: `StrutvaneApp` becomes `AppLayout` with an owned navigation file.
  - **RETIRE**: the manifest-only runtime rendering as the primary path [audit §C.2].
  - Note that the admin research [admin §6.3] proposes runtime rendering with owned config, while the audit proposes owned page files. The ORM/UI ADR must pick one (§8).

### 4.4 `create-strutvane`

- **What:** `npm create strutvane@latest acme`. It asks for the preset (full, api, ui), database (SQLite, or PostgreSQL via Docker or a URL), auth features, teams/tenancy, packages ("also install: files, search, queue-dashboard…") and git. It then writes the app, runs `npm install`, generates secrets, prepares the database, migrates, seeds, commits and offers `npm run dev` [installer §0].
- **Why:** Laravel's single biggest DX win is that one command gives a running app [eco §0.2].
- **Laravel:** `laravel new` + the starter kits.
- **Adds:** the whole project, including `AGENTS.md`/`CLAUDE.md` and a `/for/agents` link (the basic agent playbook ships in Phase 1). Choosing packages at create time simply runs their `install:*` steps.
- **Existing:** **KEEP** (prompts, render, env-spec, post). **REWORK** templates for npm-only and MVC. **RETIRE** `release-channel.ts` and multi-PM support [audit §C.2; installer §6.1].

### 4.5 `strutvane` (unscoped)

- **What:** a tiny guard package for `npx strutvane` run outside a project. It prints how to create a project, or how to install dependencies when the project has no `node_modules`. It never forwards to arbitrary code.
- **Why:** `npx` downloads the unscoped name when no local bin exists (§1.4). The name is already reserved on npm (`latest: 0.0.0-reserved.0`, `next: 0.1.0-next.0` [npm 2026-11-14]).
- **Existing:** the global launcher (`cli/packages/launcher`) is **RETIRED** as a proxy [audit §B.9]. This package replaces it.

### 4.6 `@strutvane/log-viewer`

- **What:** live tail, search, filters, download and request/trace correlation for the framework's log files, at `/_strutvane/logs`, locked down by default.
- **Why:** "what just broke?" without SSH. Laravel needs Pail (CLI) or a community viewer.
- **Laravel:** Pail + opcodesio/log-viewer (community) + Telescope's log tab.
- **Install:** default in new apps. Otherwise `npx strutvane install:log-viewer`.
- **Adds:** `config/log-viewer.ts`, an operator-panel entry, and the gate `viewLogs` (deny by default; loopback-only in `local`).
- **Dependencies:** framework only. It ships prebuilt, CSP-hashed static assets like the current viewer and the ADR-0019 docs page.
- **Existing:** `logs/viewer` **KEEP** under a new name. The `@strutvane/logs` npm name is **RETIRED** (deprecated placeholder). An alternative is to keep the reserved name for the viewer; see §8.

### 4.7 `@strutvane/files`

- **What:**
  - S3 and Azure Blob disks
  - `file`/`image`/`files` columns and attachments
  - presigned and resumable uploads
  - image variants (sharp 0.35.5)
  - ClamAV scan, quotas and MIME inspection
- **Why:** real apps store uploads in the cloud and need thumbnails and scanning.
- **Laravel:** Flysystem S3/Azure adapters + Spatie Media Library (community).
- **Install:** `npx strutvane install:files --disk=s3|azure`.
- **Adds:**
  - `config/storage.ts` disks
  - env `AWS_*` / `AZURE_STORAGE_*` (empty in `.env.example`)
  - migration `media` (records store)
  - `t.file()`/`t.image()` schema helpers, file and image widgets and cells in the UI, a quota page in settings
- **Dependencies:** `@aws-sdk/client-s3` 3.1169.0, `@azure/storage-blob` 12.34.0 and `sharp` 0.35.5, each an optional peer [npm 2026-11-14].
- **Existing:** **KEEP**. Layer 1 (disk manager, streaming uploads) stays in the framework (D21). Not on npm yet (`@strutvane/files` returns 404 on 2026-11-14), so the name needs reserving.

### 4.8 `@strutvane/redis`

- **What:** Redis/Valkey drivers for cache, locks, sessions, rate limits, broadcasting, plus a queue driver built on BullMQ.
- **Why:** the database drivers are enough to start. Redis is the scale-up path without changing app code.
- **Laravel:** the Redis drivers inside `illuminate/{cache,queue,redis}`.
- **Install:** `npx strutvane install:redis` sets `CACHE_STORE=redis`, `QUEUE_CONNECTION=redis` and `REDIS_URL`, and adds Valkey to the local compose file.
- **Adds:** `config/redis.ts`, env keys and a compose service. No migrations.
- **Dependencies:** `iovalkey` 0.4.0 or `ioredis` 6.0.0, `bullmq` 6.7.6 (all MIT) [npm 2026-11-14]. Which client to use is a spike.
- **Existing:** new.

### 4.9 `@strutvane/queue-dashboard`

- **What:** an operator-panel view of queues:
  - throughput, wait time, runtime and failures
  - retry, forget and purge
  - per-job payloads (redacted)
  - a scheduled-tasks tab (next run, last result, overlap lock)
  - worker balancing config in `config/queue-dashboard.ts`
- **Why:** queue operations become visible and the configuration is deployable [eco §11].
- **Laravel:** Horizon (Redis-only).
- **Install:** `npx strutvane install:queue-dashboard`.
- **Adds:** config, the `viewQueues` gate, a panel entry, and a metrics snapshot migration (`queue_metrics`).
- **Dependencies:** framework only. Works with both the database and Redis drivers.
- **Existing:** new.

### 4.10 `@strutvane/inspector`

- **What:** a development recorder for requests, queries (with N+1 detection), jobs, mail, notifications, cache operations, events, scheduled tasks, exceptions, logs and **authorization decisions**.
- **Why:** the "what just happened?" tool [eco §11].
- **Laravel:** Telescope.
- **Install:** `npx strutvane install:inspector`. It installs as a dev dependency and is registered only when `APP_ENV=local` unless `--production` is passed explicitly.
- **Adds:** config, an `inspector_entries` migration (or a SQLite side file to keep the app DB clean; to decide), and a panel entry.
- **Dependencies:** framework only.
- **Existing:** new. It reuses the logs pipeline's redaction.

### 4.11 `@strutvane/observability`

- **What:**
  - OpenTelemetry export (OTLP) of the spans and metrics the framework already emits
  - a self-hosted dashboard: slow requests, queries and jobs, error rates, top users and tenants, queue lag, SLO cards
  - a health-check registry (DB, queue, disk, cache, mail, certificate expiry) behind `/ready` and the panel
- **Why:** production insight without a SaaS bill.
- **Laravel:** Pulse (free) + Nightwatch (paid) + spatie/laravel-health (community).
- **Install:** `npx strutvane install:observability [--exporter=otlp]`.
- **Adds:** config, env `OTEL_EXPORTER_OTLP_ENDPOINT` etc., a `metrics_aggregates` migration and a panel entry.
- **Dependencies:** `@opentelemetry/sdk-node` 0.301.2 (Apache-2.0) [npm 2026-11-14]. The framework itself depends only on the OTel API (no-op by default) *(the exact API package is a spike)*.
- **Existing:** new (the roadmap's "OpenTelemetry" item, Phase 4).

### 4.12 `@strutvane/search`

- **What:**
  - Meilisearch 0.63.0 and Typesense 3.2.0 engines [npm 2026-11-14]
  - queued indexing on model events
  - `search:import` / `search:flush`
  - zero-downtime index swap
  - hybrid keyword + vector search (pgvector or engine-native)
- **Why:** typo tolerance, facets and relevance beyond what `ILIKE`/`tsvector` gives.
- **Laravel:** Scout engines.
- **Install:** `npx strutvane install:search --engine=meilisearch`. Adds the engine to the local compose file.
- **Adds:** `config/search.ts`, env keys, and `searchable` options on models. No UI changes: the admin's search box keeps calling the same API.
- **Dependencies:** the engine SDKs (optional peers).
- **Existing:** new. The **database engine stays in the framework** (escaped `LIKE` + trigram and `tsvector` per [admin §4.2]).

### 4.13 `@strutvane/import-export`

- **What:**
  - CSV/XLSX import with a column-mapping screen, a dry run that applies the model's validation, and row-level error reports
  - queued for large files
  - exports (CSV/XLSX, later PDF) that apply field read rules and the current filters
- **Why:** every B2B back office needs "upload a spreadsheet" and "download what I see".
- **Laravel:** Laravel Excel (community).
- **Install:** `npx strutvane install:import-export`.
- **Adds:** an `imports`/`exports` jobs table, "Import" and "Export" actions on every generated list page (via the navigation and action registry), and a download centre page.
- **Dependencies:** an XLSX engine. `exceljs` 4.4.0 (MIT) was last modified on the registry in 2024-12 [npm 2026-11-14], a maintenance risk; spike alternatives.
- **Existing:** new (the roadmap's `reports` export half).

### 4.14 `@strutvane/agent-tools`

- **What:**
  - writes and refreshes managed blocks in `AGENTS.md`/`CLAUDE.md`
  - installs **skills shipped by every installed `@strutvane/*` package** (§1.3)
  - runs a local MCP dev server (`npx strutvane mcp`) with tools: app info, routes, schema, read-only DB query, last error, log tail, **offline docs search** over the docs bundled in each package, and record-rule (`.ai/rules`)
- **Why:** agent-first onboarding is now table stakes [eco §1.1].
- **Laravel:** Boost [L13:boost]. Boost has guidelines, skills, project rules and an MCP server whose tools include DB query, schema, last error, logs and a *hosted* docs search.
- **Install:** offered at create (default yes). Otherwise `npx strutvane install:agent-tools` (dev dependency).
- **Adds:** `AGENTS.md`/`CLAUDE.md` blocks, `.mcp.json` (git-ignored, regenerated), `.ai/rules/` (committed). No runtime footprint.
- **Dependencies:** `@modelcontextprotocol/sdk` 1.32.2 (MIT) [npm 2026-11-14].
- **Existing:** the hub's `.claude/skills` and agents are prior art. The basic `AGENTS.md` is written by `create-strutvane` from Phase 1.

### 4.15 `@strutvane/social-login`

- **What:** OAuth/OIDC sign-in with Google, Microsoft, GitHub, Apple, GitLab, LinkedIn, Slack and others, plus a low-level `social.driver('github').redirect()/.user()/.fake()` API [auth §5.9].
- **Why:** "Sign in with Google" in ten minutes, safely.
- **Laravel:** Socialite 5.32.0 [auth §1].
- **Install:** `npx strutvane install:social-login --providers=google,github`.
- **Adds:** `config/services.ts` entries, env `GOOGLE_CLIENT_ID=` …, a `social_accounts` migration, routes `/auth/:provider/{redirect,callback}`, buttons on the login and register pages, and a "connected accounts" settings page.
- **Dependencies:** an engine spike: `arctic` 3.7.0 (registry modified 2026-07-29; the auth research recorded no *release* since 2025-05-21) vs Better Auth's providers [auth §5.9; npm 2026-11-14].
- **Existing:** part of the retired Better Auth path. Magic-link and social prompts were offered but never implemented [audit §B.12].

### 4.16 `@strutvane/sso`

- **What:**
  - per-tenant OIDC and SAML connections
  - SCIM 2.0 provisioning
  - JIT provisioning
  - verified email domains
  - an "enforce SSO for this tenant" switch
  - an admin screen for connections
- **Why:** enterprise B2B deals require SSO and SCIM. Most frameworks paywall it; Strutvane ships it MIT (D19).
- **Laravel:** the WorkOS starter-kit variant (vendor-bound).
- **Install:** `npx strutvane install:sso`.
- **Adds:** `sso_connections`, `sso_domains` and `scim_tokens` migrations, routes `/sso/:tenant/*` and `/scim/v2/*`, and settings pages.
- **Dependencies:** a SAML library spike *(candidates unverified)*. OIDC client via the social-login engine choice. Not a dependency on social-login itself: OIDC client code is shared through a framework `OidcClient` helper or duplicated.
- **Existing:** the docs/07 SSO/SCIM spec moves here [auth §5.9].

### 4.17 `@strutvane/oauth-server`

- **What:** authorization code + PKCE, client credentials, device code and refresh grants (no password or implicit grants), consent screen, `oauth:client`/`oauth:purge`, scopes in `config/oauth.ts`, introspection and revocation.
- **Why:** let third parties and AI agents act on behalf of users. Also the auth base for `@strutvane/mcp-server`.
- **Laravel:** Passport 13.11.0 [auth §1].
- **Install:** `npx strutvane install:oauth-server`.
- **Adds:** `oauth_*` migrations, keys in env (never committed), a consent page and a client-management page.
- **Dependencies:** `oidc-provider` 9.15.0 (MIT) or `@jmondi/oauth2-server` 5.0.0 [npm 2026-11-14; auth §1]. Needs a spike.
- **Existing:** new.

### 4.18 `@strutvane/mcp-server`

- **What:** define MCP servers, tools, resources and prompts in `app/mcp/*.ts` (`make:mcp-server`, `make:mcp-tool`), served over HTTP at `/mcp` or locally over stdio. Optionally **expose a resource as MCP tools automatically** (list, search, get, create, update) through the same controllers, policies and tenancy.
- **Why:** customers' AI agents can use your B2B app safely.
- **Laravel:** `laravel/mcp`: servers, tools, resources, prompts, `routes/ai.php`, OAuth 2.1 via Passport or Sanctum tokens [L13:mcp].
- **Install:** `npx strutvane install:mcp-server`.
- **Adds:** `routes/ai.ts`, `app/mcp/`, config and an audit category `agent`.
- **Dependencies:** `@modelcontextprotocol/sdk` 1.32.2. OAuth through the framework's `OAuthResourceServer` token if oauth-server is installed (capability check, §1.3); otherwise personal access tokens from auth.
- **Existing:** new.

### 4.19 `@strutvane/feature-flags`

- **What:** typed flags in `app/features/*.ts` (`defineFeature('new-ui', { scope: 'tenant', resolve })`) with:
  - database and memory stores
  - percentage rollouts
  - `feature.active('new-ui')`
  - a `<Feature>` UI component and `useFeature()` hook
  - an operator page to toggle per user, tenant or plan, with audit
  - an OpenFeature provider
- **Why:** trunk-based development and per-customer rollouts without a SaaS.
- **Laravel:** Pennant.
- **Install:** `npx strutvane install:feature-flags`.
- **Adds:** a `features` migration (Pennant-style), config, a panel entry, and `make:feature`.
- **Dependencies:** framework only. Optional `@openfeature/server-sdk` 1.23.0 (Apache-2.0) [npm 2026-11-14].
- **Existing:** new (the roadmap's `flags`).

### 4.20 `@strutvane/webhooks`

- **What:**
  - outgoing webhooks signed to the Standard Webhooks spec, with tenant-managed endpoints, event selection, queued delivery with backoff, a delivery log, replay and secret rotation
  - incoming helpers to verify Stripe, GitHub and Standard Webhooks signatures, with idempotent handlers
- **Why:** B2B customers integrate through webhooks. Delivering them reliably is surprisingly hard.
- **Laravel:** spatie/laravel-webhook-server and -client (community).
- **Install:** `npx strutvane install:webhooks`.
- **Adds:** `webhook_endpoints`, `webhook_deliveries` and `webhook_receipts` migrations, a settings page per tenant, and a panel page for deliveries.
- **Dependencies:** framework (queue, HTTP client with SSRF guard). Optional `svix` 2.10.0 for verification (MIT) [npm 2026-11-14].
- **Existing:** new.

### 4.21 `@strutvane/billing`

- **What:**
  - subscriptions (trials, swaps, quantities, grace periods, cancellation)
  - **per-tenant billables with seat counts synced from team membership**
  - one-off charges and checkout
  - invoices and receipts
  - customer portal links
  - webhooks with idempotency
  - plan entitlements
  - drivers: Stripe (`stripe` 23.1.0, MIT) and Paddle (`@paddle/paddle-node-sdk` 3.12.0) [npm 2026-11-14]; Razorpay as a later driver (the roadmap lists it; SDK not checked)
- **Why:** the most dreaded boilerplate [eco §11].
- **Laravel:** Cashier (Stripe, Paddle).
- **Install:** `npx strutvane install:billing --provider=stripe`.
- **Adds:** `config/billing.ts` (plans), env `STRIPE_SECRET=`/`STRIPE_WEBHOOK_SECRET=` (empty in `.env.example`), `subscriptions`/`subscription_items`/`billing_customers`/`invoices` migrations, the `/webhooks/billing/:provider` route, a billing settings page, and a "Billing" sidebar entry.
- **Dependencies:** framework + one provider SDK.
- **Existing:** new (the roadmap's `payments` + `billing`, merged).

### 4.22 `@strutvane/realtime`

- **What:**
  - a WebSocket server (run in-process on the same port in dev, or as a separate process in production)
  - private and presence channels authorized by policies
  - **model broadcasting**, so admin lists update live
  - a `@strutvane/realtime/client` subpath (the Echo equivalent) and React hooks
- **Why:** live dashboards, notifications and collaboration without Pusher.
- **Laravel:** Reverb + Echo.
- **Install:** `npx strutvane install:realtime`.
- **Adds:** `config/broadcasting.ts` driver, `routes/channels.ts`, a dev process, and a ui hook so list pages subscribe when installed.
- **Dependencies:** `ws` 8.23.0 (MIT) [npm 2026-11-14]. Horizontal scale through `@strutvane/redis`'s broadcaster, found by capability check. The wire protocol (Pusher-compatible like Reverb, or own) is an RFC decision *(Reverb's Pusher compatibility from prior knowledge, unverified)*.
- **Existing:** new.

### 4.23 `@strutvane/notification-channels`

- **What:**
  - channels: SMS (Twilio, Vonage, MSG91), Slack, Microsoft Teams, web push (VAPID) and WhatsApp
  - a per-user **preference centre** (channel × notification type)
  - quiet hours and digests
  - a delivery log
- **Why:** the framework ships mail, database (in-app inbox) and broadcast channels; real apps need more.
- **Laravel:** laravel-notification-channels (community).
- **Install:** `npx strutvane install:notification-channels --channels=slack,sms`.
- **Adds:** config, env keys, `notification_preferences` and `notification_deliveries` migrations, and a settings page.
- **Dependencies:** framework (fetch-based drivers, no vendor SDKs where an HTTP API suffices).
- **Existing:** this is the roadmap's `@strutvane/notify`, renamed. The core of "notify" is now in the framework.

### 4.24 `@strutvane/dashboards`

- **What:** typed dashboard definitions in `app/dashboards/*.ts` with:
  - value, trend, partition and table cards
  - queries scoped by policy and tenant, and cached
  - a dashboard page in the UI shell
  - scheduled report emails (PDF/CSV) through the framework's mail and scheduler
- **Why:** every admin home page needs numbers.
- **Laravel:** Nova metrics, Filament widgets.
- **Install:** `npx strutvane install:dashboards`.
- **Adds:** `app/dashboards/main.ts`, a "Dashboard" sidebar entry, and `make:metric`.
- **Dependencies:** framework only. Chart components are copied into the app from the ui registry by the installer (app-owned files).
- **Existing:** new (the roadmap's `reports` and `analytics` start here).

### 4.25 `@strutvane/ai`

- **What:**
  - provider-agnostic text and structured generation with Zod schemas
  - embeddings stored in `t.vector()` columns (pgvector)
  - agents whose tools are **app actions checked by policies**
  - queued AI jobs
  - token and cost accounting through observability
  - PII redaction before prompts
  - fakes for tests
- **Why:** AI features are routine in 2026 B2B apps.
- **Laravel:** the 13.x AI SDK [L13:releases].
- **Install:** `npx strutvane install:ai --provider=anthropic|openai|azure-openai`.
- **Adds:** `config/ai.ts`, env keys (empty in the example), `make:agent`, `make:tool`.
- **Dependencies:** candidates `ai` 7.0.173 (Apache-2.0) as the provider layer, or thin provider SDKs such as `@anthropic-ai/sdk` 1.8.0, plus `pgvector` 0.3.1 [npm 2026-11-14]. Needs a spike.
- **Existing:** new.

### 4.26 `@strutvane/workflows`

- **What:** durable workflows (`defineWorkflow`) whose steps are persisted, retried idempotently and resumed after crashes. Includes human approval steps, timers (scheduler), a visual history on the record's detail page, and SLA alerts.
- **Why:** approvals and multi-step processes are the backbone of B2B apps. Laravel has nothing first-party here.
- **Laravel:** none (community: laravel-workflow *(unverified)*).
- **Install:** `npx strutvane install:workflows`.
- **Adds:** `workflow_runs`, `workflow_steps` and `workflow_approvals` migrations, an approvals inbox page, a sidebar entry and `make:workflow`.
- **Dependencies:** framework (queue, events, scheduler).
- **Existing:** new (the roadmap's `workflows`).

### 4.27 `@strutvane/browser-testing`

- **What:** Playwright fixtures:
  - a fresh migrated DB per worker
  - `actingAs(user)` and `inTenant(t)`
  - generated page objects for generated CRUD screens
  - axe accessibility checks
  - trace on failure
- **Why:** end-to-end tests of the real UI with the same factories as the unit tests.
- **Laravel:** Dusk, now superseded by Pest 4 browser testing [eco §11].
- **Install:** `npx strutvane install:browser-testing` (dev). Adds `tests/browser/` and `npm run test:browser`.
- **Dependencies:** `@playwright/test` 1.65.1 [npm 2026-11-14].
- **Existing:** new. The e2e harness in the hub is prior art.

### 4.28 `@strutvane/backup`

- **What:**
  - scheduled, encrypted backups (`pg_dump`, SQLite online backup) of the database and selected disks to any disk
  - retention policy
  - `backup:restore --verify` drills into a scratch database
  - health check and alerts
- **Why:** self-hosted B2B apps need it on day one of production.
- **Laravel:** spatie/laravel-backup (community).
- **Install:** `npx strutvane install:backup`.
- **Adds:** config, a schedule entry and a panel page.
- **Dependencies:** framework (storage, scheduler, crypto). It shells out to `pg_dump` when present.
- **Existing:** new.

### 4.29 Existing packages: final mapping

| Existing (2026-11-14) | Verdict | Where it goes |
|---|---|---|
| `@strutvane/contracts` | **MERGE** into framework | `framework/contracts` (wire formats normative); `Installer`/`FieldType`/hook payloads retired. npm placeholder deprecated |
| `@strutvane/core` | **MERGE** into framework | `framework` foundation, support, errors, i18n, events |
| `@strutvane/framework` | **KEEP** (rework to MVC) | §4.1 |
| `@strutvane/auth` | **KEEP** (rescoped) + partial **MERGE** | authorization, tenancy, audit, guard, identity engine → framework; features, tokens, teams, screens stay (§4.2) |
| `@strutvane/ui` | **KEEP** | §4.3 |
| `@strutvane/cli` | **MERGE** into framework | console kernel + generators. **RETIRE** registry compiler, field-spec parser, `upgrade`, channel logic |
| `strutvane` (launcher) | **RETIRE** the launcher; **KEEP** the name | guard package (§4.5) |
| `@strutvane/devkit` | **MERGE** into framework | `framework/console/support` + public `@strutvane/framework/package`. **RETIRE** the three-way merge engine |
| `@strutvane/logs` | **MERGE** the pipeline into framework; viewer → **`@strutvane/log-viewer`** | npm name deprecated (or reused, §8) |
| `@strutvane/files` | **KEEP** | §4.7 |
| `create-strutvane` | **KEEP** (rework templates) | §4.4 |
| `tooling` | **RETIRE** as a repo | `publish-if-new.mjs`, `check-deps.mjs`, scorecard and Dependabot move to the monorepo root `tooling/` (private workspace) |
| `docs` (Starlight) | **KEEP** | the monorepo's `site/` |
| hub blueprint, ADRs, RFCs, spikes | **KEEP** | the monorepo's `docs/` and `spikes/` (archived evidence) |

---

## 5. Where Strutvane goes further than Laravel (concrete features per package)

### `@strutvane/framework`

- **End-to-end types.** `migrate` writes `database/schema.gen.ts`, so models, query results, route params, request bodies and resource output are typed. `client:generate` emits a typed client for the UI (Laravel needs Wayfinder plus IDE helpers [eco §12.2]). Config, env, events, job payloads and translation keys are typed and validated at the boundary.
- **Secure by default:**
  - every route needs a policy, a permission or an explicit `public: true`
  - a missing policy method **denies** (Filament allows [eco §9.3])
  - unknown request fields are rejected (Laravel's `#[FailOnUnknownFields]` is opt-in)
  - mass assignment is a typed writable subset
  - the `api` rate limiter is on
  - security headers, proxy trust and body limits are kept from today's hardening [audit §C.1]
- **Multi-tenancy with Postgres RLS built in.** `t.tenant()` in a migration emits `tenant_id`, the index and RESTRICTIVE + FORCE policies (ADR-0007). Tenant context also flows automatically to queued jobs, cache keys, storage prefixes, rate-limit keys, unique slugs and search filters. Laravel has no first-party tenancy.
- **Policies compile to SQL**, so list endpoints return only permitted rows with two-valued, NULL-safe semantics (ADR-0008/0017). Laravel filters lists by hand [auth §0].
- **One error model:** RFC 9457 `Problem` with stable codes. The debug page has "copy as Markdown for AI", redacted.
- **OpenAPI 3.1 + `/docs` generated** from routes and requests, with versioned APIs (`/api/v1`) as a first-class concept.
- **Observability built in:** OTel spans around HTTP, DB, queue, mail, cache and the HTTP client, no-op until an exporter exists. Every log line carries `request_id`/`trace_id`.
- **Background work that is correct by default:**
  - jobs and events dispatched inside a transaction are sent **after commit** (transactional outbox; Laravel's `afterCommit` is opt-in *(unverified default for 13.x)*)
  - idempotency keys on jobs
  - scheduler tasks take a one-server lock and refuse overlaps by default
- **HTTP client:** default timeout, retries with jitter, and an **SSRF guard** that blocks private and link-local ranges for URLs that come from user input.
- **Migrations:** drift detection (`migrate:status --drift`), safe-change lint, generated `down()` where reversible, an isolated deploy lock [eco §5].
- **Testing:** real Postgres via PGlite per test. Tenant-aware factories. **Generated attack-style tests per resource** (cross-tenant read/write by id, filter and include; field-rule leakage; enumeration).

### `@strutvane/auth`

- Passkeys and TOTP are ready at create time.
- Token abilities **are** RBAC permission strings: one vocabulary.
- Sessions are revoked on password change and sign-in elevation.
- Optional breached-password check (k-anonymity range API) *(service terms unverified)*.
- Impersonation with an audit trail and a visible banner.
- Teams are tenants enforced by RLS, not just middleware.
- **Owned screens stay upgradeable without a merge engine:** pages are thin and import the security-critical components and actions from the package, so a fix arrives through `npm update` while the layout stays the developer's.

### `@strutvane/ui`

- CRUD screens and a sidebar entry appear on `migrate`, derived from typed column metadata (Filament reads the live DB once and stops [admin §1.1]).
- Navigation is hidden by `viewAny`. Actions are hidden by policy. Field read and write rules are respected.
- **One UI for the customer app and the back office**, using areas or panels.
- Live validation from the shared schema (Precognition without a round trip).
- Cmd+K global search that respects policies.
- Saved views, column visibility, bulk actions.
- Live tables when realtime is installed. Import and export actions when import-export is installed.
- WCAG 2.2 AA checks in CI, dark mode, i18n and RTL.

### Operator dashboards (`log-viewer`, `queue-dashboard`, `inspector`, `observability`)

- **One panel, one gate, one look.** Laravel ships Horizon, Telescope and Pulse with separate paths and gates.
- Redaction happens **before storage** (RFC-0004), so payloads in dashboards never show secrets.
- Correlation: a log line links to the inspector entry and the trace. A failed job links to its exception and the request that dispatched it.
- `queue-dashboard` works on the database driver; Horizon requires Redis.
- `inspector` records **authorization decisions with the rule that matched**, and answers "why was this denied?" for any request. It also detects N+1 queries and offers "copy entry as Markdown for AI".
- `observability` is OpenTelemetry-native (export anywhere), shows **per-tenant usage** (noisy-neighbour detection), and runs `EXPLAIN` on captured slow queries in development.

### Identity add-ons (`social-login`, `sso`, `oauth-server`, `mcp-server`)

- `social-login`:
  - state, PKCE and nonce are always on
  - auto-linking happens only on a verified email from a provider trusted for that domain
  - provider tokens are encrypted at rest [auth §5.9]
- `sso`: per-tenant connections, SCIM 2.0, domain verification and "enforce SSO" in MIT. Elsewhere this is usually paid or vendor-bound.
- `oauth-server`: only OAuth 2.1 grants. Intended to satisfy the MCP authorization profile *(exact MCP auth spec requirements unverified)*.
- `mcp-server`: resource-to-tool exposure runs through the same controllers, so policies, RLS, rate limits and audit apply to agents exactly as to users. Every agent action is audited with its client id.

### Product add-ons

- `search`: a mandatory tenant filter that **fails closed** on external engines. The policy scope is pushed down as filterable attributes where possible. Hybrid keyword + vector ranking.
- `feature-flags`: typed definitions with plan-based scopes (billing entitlements via a capability check), an audit of every toggle, a stale-flag report, and an OpenFeature bridge.
- `webhooks`: Standard Webhooks signatures, SSRF-guarded delivery, per-tenant endpoints and replay.
- `billing`: the **tenant is the billable** (B2B), not the user. Seat quantity is synced from team membership. Entitlements tie into flags. Idempotent webhook handling.
- `realtime`: channel authorization reuses policies. Tenant-scoped channel names are enforced. Model broadcasting is redacted by field read rules.
- `notification-channels`: a preference centre, quiet hours and digests out of the box (Laravel leaves these to the app).
- `import-export`: dry-run imports with the model's validation messages (RFC-0003 catalogs). Exports apply field read rules. Large jobs are queued and resumable.
- `dashboards`: metric queries run inside the RLS session and the policy scope, so a manager sees only their tenant's numbers.

### AI and automation (`agent-tools`, `ai`, `workflows`)

- `agent-tools`: **offline**, version-matched docs search from the installed packages' own docs (Boost queries a hosted API [L13:boost]). Skills ship inside every package, so agents always match installed versions. The DB tool runs in a read-only transaction under the RLS session with redaction.
- `ai`: agent tools are app actions checked by policies. PII is redacted before prompts. Token and cost metrics go to observability. Structured output is validated with Zod.
- `workflows`: human approval steps with audit, durable timers and SLA alerts. Laravel has no first-party equivalent.

---

## 6. Repository, versioning, publishing and docs

### 6.1 One npm-workspaces monorepo

Every source agrees on this direction [audit §D.1; js §5.3]. Folder layout:

```
strutvane/                              (one GitHub repo; the hub repo promoted)
├─ package.json                         private; "workspaces": [ordered list, see below]
├─ package-lock.json                    the only lockfile (npm ci in CI)
├─ packages/
│  ├─ framework/                        @strutvane/framework   (bin: strutvane)
│  ├─ auth/  ui/  log-viewer/           the default train
│  ├─ create-strutvane/  strutvane/     entry points
│  ├─ files/  redis/  search/  import-export/
│  ├─ queue-dashboard/  inspector/  observability/  agent-tools/
│  ├─ social-login/  sso/  oauth-server/  mcp-server/  feature-flags/  webhooks/
│  ├─ billing/  realtime/  notification-channels/  dashboards/
│  └─ ai/  workflows/  browser-testing/  backup/
│     (each: src/, test/, docs/, ai/{guidelines.md,skills/}, stubs/ (installer templates), CHANGELOG.md, README.md)
├─ tooling/                             private workspace: shared tsconfig/biome/vitest presets, check-deps,
│                                       boundary lint, publish-if-new.mjs, pack-and-install e2e
├─ site/                                Starlight docs site; pulls packages/*/docs at build
├─ examples/                            northwind-ops (the playground port) and small per-package demos
├─ e2e/                                 create → make:migration → migrate → API + UI, from npm-packed tarballs
├─ docs/                                blueprint, ADRs, RFCs, research (today's hub content)
├─ spikes/                              archived evidence
└─ .github/workflows/                   ci.yml, release.yml, codeql.yml, scorecard.yml
```

- **Workspace order.** `npm run --workspaces` runs in listed order, not dependency order [js §5.2]. List `tooling`, `framework`, then everything else. Use `tsc -b` project references for builds.
- **Boundaries by lint, not repos:**
  - packages may import only `@strutvane/framework` (public entry points, never `src/` internals)
  - the framework imports no package
  - framework modules follow the internal layer rules (§1.3)
  - tool candidates: dependency-cruiser or Biome restricted imports *(choice open)*
- **Phantom-dependency guard.** npm hoists, so `check-deps.mjs` (or knip) runs in CI. The e2e job installs **packed tarballs** into a clean app, which tests the published shape [audit §F.2].
- **Package states:** packages are added to `packages/` only when their phase starts. Each new name is **reserved on npm first**, as was done for the current names.

### 6.2 Versioning

| Period | Rule | Why |
|---|---|---|
| **Before 1.0** | **One fixed group for every published package** (Changesets `fixed`) at `0.y.z` on `latest` [installer §0.6; audit §B.7] | A `^0.4.0` peer range already means `<0.5.0`, so every satellite must re-release on each framework minor anyway. Lockstep makes "which versions work together" trivial |
| **From 1.0** | **Framework train** (fixed group): `framework`, `auth`, `ui`, `log-viewer`, `create-strutvane`, `strutvane`. **Satellites** (all others) version independently with `peerDependencies: { "@strutvane/framework": "^1.0.0" }` and bump their major only when they must | Laravel's model: Horizon or Cashier majors don't follow the framework's. Fewer empty releases and fewer 2FA approvals (§6.3). An integration matrix runs every satellite against the current train on every PR |
| **Framework majors** | Yearly at most. Each satellite publishes a compatible release in the same week | Stability is a selling point (Laravel: 18 months of bug fixes, 2 years of security fixes [eco §12.1]) |

- Changesets 3.0.3 is current [npm 2026-11-14]. Its `fixed` and `linked` options and npm-workspaces support are from 2.x docs *(unverified for 3.x; check before adopting)*.
- `create-strutvane` writes **exact** versions of the train into new apps. `npx strutvane install:<x>` resolves the satellite version whose peer range matches the app's framework.

### 6.3 Publishing (ADR-0018 kept)

- CI runs `npm stage publish --access public --provenance --tag <tag>` per workspace whose version isn't yet published or staged (the existing `publish-if-new.mjs`, iterating npm workspaces instead of parsing `pnpm-workspace.yaml` [audit §F.1]). The release workflow pins npm 11.19.0 (ADR-0018).
- **Each package's trusted publisher is staging-only and bound to the monorepo's `release.yml`.** Every existing binding points at a `strutvane-*` repo and must be **re-pointed** before the first monorepo release. Several packages sharing one workflow is expected to work *(unverified for many packages per workflow [js §5.2]; spot-check)*.
- **A maintainer approves each staged version with 2FA.** Order: `@strutvane/framework` first, then the rest in any order (they depend only on the framework).
- **Cost and mitigation.** Lockstep before 1.0 means one approval per package per release. That is 6 in Phase 1, ~10 after Phase 2 and ~15 after Phase 3. Mitigations:
  - release less often (a weekly train)
  - from 1.0, satellites publish only when changed
  - whether npm allows bulk approval of a staged set is *(unverified)*; check on npmjs.com before Phase 3
- Dist-tags: `latest` for 0.x releases (so `npm create strutvane@latest` works), `next` for release candidates, `canary` for nightly. "Never publish below `latest`" stays (ADR-0016).
- Old npm names (`@strutvane/core`, `contracts`, `cli`, `devkit`, `logs`) get `npm deprecate` with a pointer, never unpublished.

### 6.4 Docs: one site, a section per package

- **One Starlight site** with Laravel's information architecture, which users already know. Top-level sections:
  - **Prologue:** release notes, upgrade guide.
  - **Getting started:** installation, configuration, directory structure, the frontend, starter options, **agents** (`/for/agents` playbook).
  - **Architecture:** request lifecycle, container, providers.
  - **The basics:** routing, middleware, CSRF, controllers, requests, responses, validation, errors, logging.
  - **Digging deeper:** CLI, broadcasting, cache, events, HTTP client, i18n, mail, notifications, queues, rate limiting, scheduling, storage.
  - **Security:** authentication, authorization, tenancy, audit, encryption, hashing.
  - **Database:** getting started, query builder, pagination, migrations, seeding, ORM (relations, factories, …).
  - **Admin UI:** generated screens, navigation, customising pages, components.
  - **Testing:** getting started, HTTP tests, database, mocking, browser.
  - **Packages:** one subsection per first-party package.
  - **Deployment:** recipes for Azure Container Apps, Fly, Render and plain VMs.
- **Every package page uses the same template:**
  - Overview (what, why, "Strutvane's equivalent of Laravel X")
  - Install (the exact `npx strutvane install:<x>` and what it writes)
  - Configuration (every config key and env key)
  - Usage
  - UI and operator panel
  - Security notes
  - Testing (fakes)
  - Works with (capability pairings, §1.3)
  - Upgrade notes
  - API reference (generated)
- **Docs live next to code** in `packages/<x>/docs/*.mdx`. The site assembles them at build, so a PR that changes behaviour changes its docs in the same diff (D20: "every feature ships with docs").
- Versioned per major (`/docs/1.x/…`). Each page has "Copy as Markdown" and `llms.txt` / `llms-full.txt`. The same Markdown is bundled into each package tarball for `agent-tools`' offline search.

---

## 7. Build order

Rough sizes are new or reworked source LOC, excluding moved code and tests. Weeks assume one maintainer with AI assistance working full-time. Both are estimates, not commitments.

| Phase | Scope | Packages released | Rough size | What it unlocks for the user |
|---|---|---|---|---|
| **0. Consolidate** (prerequisite) | ADRs (§8); create the monorepo; import repos with history; pure move of core, contracts, cli, devkit, logs pipeline and auth internals into `framework`, with all ~1,900 tests green before any redesign [audit §D.5]; npm-only tooling; re-point trusted publishers | none | ~2k (glue); **2–3 weeks** | Nothing visible. One repo, one CI, one lockfile, one version |
| **1. The full flow → `0.2`** | Framework: schema builder + `make:migration` (model always, `--seeder`/`--factory`), `schema.gen.ts`, **ORM** (per the ORM research), router + controllers + `ResourceController`, generated requests/resources/policies, `migrate` (+ seeding + scaffolding), session/CSRF, OpenAPI, `/docs`, `up`/`down`, `dev` registry. **auth** (persistent native engine on app tables, features, tokens, teams, screens). **ui** (layout, navigation file, generated CRUD pages, sidebar). **create-strutvane** (npm-only, runs setup end to end), **strutvane** guard, **log-viewer**, basic `AGENTS.md` | framework, auth, ui, log-viewer, create-strutvane, strutvane | ~15–20k new on top of ~45k moved; **12–16 weeks** | **The user's whole Laravel-style flow:** `npm create` → `make:migration` → columns → `migrate` → secured, documented CRUD API + admin screens + login, multi-tenant with RLS on Postgres, logs viewer. The Northwind Ops port passes as the acceptance test |
| **2. Background work → `0.3`** | Framework: events + outbox, queue (database driver, workers, retries, failed jobs), cache + locks, mail (SMTP/log/array + HTTP transports, React Email templates, dev mail preview), notifications (mail, database inbox, broadcast stub), scheduler, HTTP client. **redis**, **queue-dashboard** | + redis, queue-dashboard | ~10k; **6–8 weeks** | Password-reset and verification mail for real, invitations, queued exports, nightly jobs, an in-app notification bell, ops visibility of queues. Unblocks every later package that needs async work |
| **3. Data and operations → `1.0`** | **files** (integrated into fields and widgets), search database engine in the framework + **search** package, **import-export**, **inspector**, **observability** (OTel + metrics + health), **agent-tools** (MCP dev server, skills). Then hardening: API freeze, external security audit (auth, tenancy, generators, installers), docs complete, upgrade guide from 0.x | + files, search, import-export, inspector, observability, agent-tools | ~12k + hardening; **10–14 weeks** | Production-ready B2B apps: uploads with variants and scanning, real search, spreadsheet import and export, debugging and production metrics, agent-assisted development. **1.0** for the train and these satellites |
| **4. Identity and integration** | **social-login**, **sso** (OIDC, SAML, SCIM), **oauth-server**, **mcp-server**, **feature-flags**, **webhooks** | + 6 satellites (0.x → 1.0 each when ready) | ~12k; **8–10 weeks** | Enterprise sales checklists (SSO, SCIM), third-party and AI-agent integrations, safe rollouts, outbound integrations |
| **5. Money and realtime** | **billing** (Stripe, Paddle; per-tenant seats), **realtime** (server, channels, model broadcasting), **notification-channels**, **dashboards** | + 4 satellites | ~12k; **8–10 weeks** | SaaS monetisation, live UIs, multi-channel notifications, admin home dashboards and scheduled reports |
| **6. AI, automation, quality** | **ai**, **workflows**, **browser-testing**, **backup**; MySQL 8.4 driver in the framework; deployment recipes; Vue renderer (later) | + 4 satellites | ~12k+; **10+ weeks**, demand-driven | AI features under policies, approval workflows, full browser tests, backups, MySQL shops |

**Notes on the order:**

- Phase 1 is deliberately big. Splitting it (for example, API first and UI later as the old roadmap did) recreates the "promised but not built" gap the owner hit [audit §B.11]. The flow must work end to end before anything else ships.
- `agent-tools` sits in Phase 3 because its MCP tools need the stable schema, routes and logs APIs. The `AGENTS.md` written by `create` (Phase 1) covers early adopters.
- Each later phase can reorder by demand. The constraint is dependencies on framework features: anything async needs Phase 2, and `mcp-server` prefers `oauth-server`.
- The starter must **never offer a package before it exists** (playground lesson [audit §B.12]). The create prompt's package list is generated from the packages actually published on the train.

---

## 8. Conflicts with current decisions (reported, not resolved)

| # | Current decision | This catalogue | Needed |
|---|---|---|---|
| K1 | **D2 / ADR-0001**: packages `framework`, `auth`, `ui`, `core`, `contracts`, `devkit`, `cli` | core, contracts, cli and devkit merged into framework; 20+ new descriptive names | ADR (supersedes D2's list; keeps ADR-0001's naming rule) |
| K2 | **D17 / ADR-0002** polyrepo; D23 + docs/17 six connections; "product packages never import each other" | one npm-workspaces monorepo; packages depend on the framework; the extension-point list in §1.3 replaces the map | ADR + rewrite of docs/17, ECOSYSTEM.md and CLAUDE.md |
| K3 | **D12 / ADR-0005 / ADR-0013**: identity adapter, Better Auth default; auth owns authorization, tenancy and audit | authorization, tenancy, audit and guards in the framework; native engine default; `@strutvane/auth` = features + tokens + teams + screens | ADR (matches auth research C2 option (b) and C3) |
| K4 | **D24 / RFC-0004**: `@strutvane/logs` installed by default | pipeline in the framework; viewer as `@strutvane/log-viewer` (default). **Alternative:** keep the reserved `@strutvane/logs` name for the viewer to avoid a rename | Owner choice + ADR |
| K5 | **D18 / ADR-0016**: independent versions, shared major train, `next` pre-releases | lockstep before 1.0 on `latest`; train + satellites after 1.0 | ADR amending 0016 (ADR-0018 staging kept) |
| K6 | **D15** and current CLI docs: `pnpm sv` | `npx strutvane …` (brief, auth research) vs `node strut …` (installer research) | One ADR picking the documented spelling (both can exist) |
| K7 | **D6 / ADR-0012 / ADR-0014**: runtime metadata UI, L0–L3, three-way merge | admin research: runtime render + owned config; audit: owned page files, merge engine retired. This catalogue assumes thin owned pages importing package components | ADR together with the ORM/UI decision |
| K8 | **D21 / RFC-0002**: files layer 1 in core, layer 3 in `@strutvane/files` | unchanged in substance (layer 1 now in the framework) | blueprint-sync only |
| K9 | **Roadmap (docs/14)**: `notify`, `payments` + `billing`, `reports`, `analytics`, `flags`, `i18n` as future packages; queue/cache/mail in Phase 4 | `notify` core → framework, channels → `notification-channels`; `payments` merged into `billing`; `reports`/`analytics` start as `dashboards` + `import-export`; `i18n` stays in the framework; queue/cache/mail move to Phase 2 | roadmap rewrite |
| K10 | **D16 / ADR-0006** Docker never committed | unchanged. Deploy recipes stay docs; no package writes production Dockerfiles into the repo | none (noted so nobody proposes a `deploy` package that commits Docker files) |
| K11 | Auth research name `@strutvane/social` | `@strutvane/social-login` (descriptive; "social" could mean social media) | owner choice |
| K12 | Admin research §6.1: "no separate admin package" | agreed: the admin stays inside `@strutvane/ui` | none |

---

## 9. Open questions for the owner

1. **Default packages in the full preset:** framework, auth, ui and log-viewer are proposed. Should `agent-tools` (dev) and `inspector` (dev) also be on by default, as Laravel turns Boost on by default [eco §1.2]?
2. **Teams/tenancy on by default** for the B2B full preset? (The auth research also asks this.)
3. **Satellite independence after 1.0** versus one train forever. One train is simpler for users but costs ~25 approvals per release under ADR-0018.
4. **Engine spikes** before each phase: ORM engine (parallel research); `iovalkey` vs `ioredis`; `arctic` vs Better Auth providers; `oidc-provider` vs `@jmondi/oauth2-server`; a SAML library; an XLSX library (`exceljs` maintenance risk); `ai` (Apache-2.0) vs thin provider SDKs; the realtime wire protocol.
5. **Inspector storage:** a table in the app DB (simple) or a separate SQLite file (keeps the app DB clean, and works when the app DB is the problem).
6. **Razorpay** in billing's first release, given the India B2B audience in the admin research [admin §8.7]?

---

## Sources

**Laravel docs** (13.x, read 2026-11-14):

- read directly for this document: [Folio](https://laravel.com/docs/13.x/folio), [Boost](https://laravel.com/docs/13.x/boost), [MCP](https://laravel.com/docs/13.x/mcp)
- via the ecosystem study (same date): installation, starter-kits, releases, sail, horizon, telescope, pulse, pennant, reverb, scout, billing, socialite, sanctum, passport, fortify, octane, prompts, pint, dusk, envoy, precognition, broadcasting, testing, vite
- the Laravel site's package list (footer of every 13.x docs page, 2026-11-14): Cashier, Dusk, Horizon, Octane, Scout, Pennant, Pint, Sail, Sanctum, Socialite, Telescope, Pulse, Reverb, Echo; products Cloud, Forge, Nightwatch, Vapor, Nova

**npm registry** (`npm view <pkg> version license`, npm 11.19.0, 2026-11-14):

- hono 4.13.18
- zod 4.6.7
- kysely 0.29.9
- bullmq 6.7.6 (MIT)
- pg-boss 12.38.2 (MIT)
- croner 11.0.0 (MIT)
- nodemailer 10.5.0 (MIT-0)
- @react-email/components 1.0.12 (MIT)
- stripe 23.1.0 (MIT)
- @paddle/paddle-node-sdk 3.12.0
- meilisearch 0.63.0 (MIT)
- typesense 3.2.0 (Apache-2.0)
- ws 8.23.0 (MIT)
- @opentelemetry/sdk-node 0.301.2 (Apache-2.0)
- @modelcontextprotocol/sdk 1.32.2 (MIT)
- @clack/prompts 1.9.0
- @biomejs/biome 2.6.7
- vitest 5.1.0
- @playwright/test 1.65.1
- @changesets/cli 3.0.3 (MIT)
- oidc-provider 9.15.0 (MIT)
- @simplewebauthn/server 14.1.0
- otpauth 9.6.0
- arctic 3.7.0
- iovalkey 0.4.0 (MIT)
- ioredis 6.0.0
- sharp 0.35.5
- @aws-sdk/client-s3 3.1169.0
- @azure/storage-blob 12.34.0
- @tanstack/react-router 1.170.46
- @openfeature/server-sdk 1.23.0 (Apache-2.0)
- ai 7.0.173 (Apache-2.0)
- @anthropic-ai/sdk 1.8.0
- pgvector 0.3.1
- exceljs 4.4.0 (MIT; registry last modified 2024-12-20)
- @react-pdf/renderer 4.9.0 (MIT)
- svix 2.10.0 (MIT)
- rate-limiter-flexible 11.4.1

**Strutvane names on npm** (2026-11-14):

- `@strutvane/framework`, `@strutvane/logs` and `strutvane`: `latest: 0.0.0-reserved.0`, `next: 0.1.0-next.0`
- `create-strutvane`: `latest: 0.0.0-reserved.0`
- `@strutvane/contracts`, `@strutvane/core` and `@strutvane/devkit` are reserved placeholders
- `@strutvane/files`: not found (404)

**Strutvane internal:** the six research documents listed at the top; docs/00, docs/14, ADR-0001, ADR-0018.
