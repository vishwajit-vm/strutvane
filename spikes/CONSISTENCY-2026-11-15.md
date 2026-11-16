# Consistency decisions (coordinator, 2026-11-15)

The docs pass found places where the blueprint and the spikes disagree. When a mismatch like this ships, packages don't connect. This file **decides each one**.
- **Owner** is where the fix goes.
- Fixes are dispatched once the audit agents release those folders.
- Rows marked **(lead)** need the project lead's confirmation. Everything else is a coordinator decision under "whatever is best, you decide" (2026-11-14).

## Installer and Docker

| # | Topic | Decision | Owner |
|---|---|---|---|
| 1 | Setup step order | Follow spike 13: files → secrets → ports → database → install → migrate/seed → git. Update blueprint §2.1 to match. | blueprint |
| 2 | Exit code 1 | "Nothing was created" (spike 13). | blueprint |
| 3 | Unpublished packages in the installer | **A question that brings a package is shown only when that package is published and compatible** (from the catalogue). In 0.2 that hides agent-tools, redis, files, observability, health, sso, oauth-server, ai, mcp-server, realtime, activity-log and charts. Spike 13 keeps the full list behind a `--preview-catalogue` dev flag for testing. | spike 13 |
| 4 | Package phases | Blueprint §10 is the single source. The checklist, catalogue seed and docs data follow it. | checklist, spike 21, docs |
| 5 | Log viewer and backup names | `@strutvane/log-viewer` (ADR-0022) and `backup` (singular). | spike 13 fixture, spike 21 |
| 6 | Docker service commands | Keep all of them: `services:up`, `services:down`, `services:status`, `services:logs`, `db:shell`. `services:down --volumes` deletes data, so it asks for confirmation (and needs `--force` with no terminal). | spike 13 |
| 7 | Production Dockerfile logging | It sets `LOG_CHANNEL=stderr` and `LOG_FORMAT=json` (ADR-0022). | spike 13 |
| 8 | Node on the host in Docker mode | Correct the wording: the `strut.js` forwarder needs Node on the host, but nothing else does. | blueprint, docs |
| 9 | Fresh clone | `npm run setup` works from the **committed** `strutvane.json`. The local progress file is optional. | spike 13 |
| 10 | Is `.strutvane/` committed? | Yes, for generated types, resources and the client. Local state goes in `.strutvane/local/`, which is git-ignored. | spike 13, blueprint §3.1 |
| 11 | Strict profile label | It names HSTS preload. | spike 13 |
| 12 | Question 35 help text | "Docker image (Kubernetes, Fly, Cloud Run, ECS)" maps to the value `docker`. | spike 13 |
| 13 | `help` vs `list` | `node strut list` is the command; `help` is an alias. | spike 13 |
| 14 | `DB_CONNECTION` value | `pgsql`, as in Laravel, with `postgres` accepted as an alias. The values are `mysql`, `pgsql` and `sqlite`. | spikes 12 and 13 |
| 15 | Commands printed before they exist | The installer prints only commands that exist. Unbuilt ones are stubs that exit non-zero with a clear "coming in the framework" message. | spike 13 (audit in progress) |

## Security and CSRF

| # | Topic | Decision | Owner |
|---|---|---|---|
| 16 | Middleware syntax | `static readonly middleware = [...]` on controllers. Groups use the Laravel callback form, `Route.middleware('csrf').group(() => { … })`, and the array form stays as an overload. Helpers are `csrf_field(ctx)` and `csrf_meta(ctx)`. `<CsrfField />` is built in `@strutvane/ui`. | blueprint §5.2, spike 12, ui |
| 17 | Front-end token | The framework sets an `XSRF-TOKEN` cookie (readable by JS, `SameSite=Lax`). The generated client and ui forms send `X-XSRF-TOKEN`. | framework, ui |
| 18 | Exception patterns | Patterns match the full path (`api/webhooks/*`). The docs explain this, and a boot warning fires when a pattern can never match a registered route. | spike 12, docs |
| 19 | `APP_DEBUG=true` in production | The app **refuses to boot** unless `--force-debug` is given (fail closed, §5.2). | spike 12 |
| 20 | Untrusted Host status | 400 (Laravel/Symfony behaviour). | spike 13 README, docs |
| 21 | Named rate limiters | `api`, `login`, `password-reset` and `aggregate`. The store is the cache (the database by default, Redis optionally), not in-memory, so limits hold across processes. | framework |

## Auth

| # | Topic | Decision | Owner |
|---|---|---|---|
| 22 | Default engine | **(lead)** The native engine (spike 20) replaces Better Auth as the default. Proposed ADR-0023 supersedes ADR-0005/0013. | ADR |
| 23 | Keyed token hashes vs `key:rotate` | Verification tries `APP_KEY` and then every `APP_PREVIOUS_KEYS` entry, and rehashes under the current key on success. Rotation signs nobody out. | spike 20 |
| 24 | Session cookie name | `strutvane_session`. | spike 20 |
| 25 | Feature names (one list, used everywhere) | `registration`, `emailVerification`, `passwordReset` (always on), `passwordConfirmation`, `twoFactor`, `passkeys`, `emailLink`, `apiTokens`, `teams`, `impersonation`. | spikes 20 and 13, blueprint §6 |
| 26 | Feature switches location | Features live in `config/auth.ts`, written by the installer, not in `AUTH_*` env keys. `AUTH_SECRET` is removed; `APP_KEY` is the root secret. | spike 13 |
| 27 | Role preset names | `admin-member` and `admin-manager-member-viewer`. | spike 13 |
| 28 | Defaults | The library defaults to everything optional off. The installer writes what the user chose explicitly. Both are documented. | docs |
| 29 | Generated admin password | **Must be changed at first sign-in**, enforced by auth. A typed password isn't forced. | spike 20 |
| 30 | Cross-origin refusal response | 419 with problem code `csrf_token_mismatch`, in the same RFC 9457 shape everywhere. | spike 20 |

## Designs, charts, API

| # | Topic | Decision | Owner |
|---|---|---|---|
| 31 | Theme override tokens | The design contract defines **public override tokens** `--brand-hue`, `--font-sans`, `--radius` and `--density`. Every design maps them onto its internal tokens (Crisp: `--accent*`, `--font-ui`, `--shape-*`). The conformance kit checks that an override changes the rendering. | spikes 19 and 17, ui contract |
| 32 | Where charts live | The `@strutvane/charts` package (catalogue), not `@strutvane/ui`. Blueprint §5.1 is corrected. | blueprint |
| 33 | API prefix | `/api`, as in Laravel. Versioning (`/api/v1`) is opt-in through `Route.prefix`. Spike 16 changes to `/api`. | spike 16 |

## CLI and files

| # | Topic | Decision | Owner |
|---|---|---|---|
| 34 | App file names | Models stay plain: `app/models/post.ts`. Every other kind of file takes a dot suffix: `post.policy.ts`, `post.seeder.ts`, `post.factory.ts`, `database.seeder.ts`, `post.controller.ts`. | spikes 12 and 13, blueprint §3.1 |
| 35 | `--seeder` flag | `make:migration … --seeder` creates the seeder **and** its factory, because the seeder uses it. `--factory` alone creates only the factory. | spike 12 |
| 36 | Migrations table | `migrations`, as in Laravel. | spike 13 |
| 37 | `ui:sync` | A `node strut ui:sync` command, also run by `sync` and by `migrate`. | spike 14 |
| 38 | What `sync` regenerates | Only outputs of installed packages (charts only when `@strutvane/charts` is installed). | blueprint §2.2 |
| 39 | Logging keys and flags | Add `LOG_PATH`, `LOG_SLACK_WEBHOOK_URL` and `LOG_DEPRECATIONS_CHANNEL` to blueprint §5.3. `log:tail` takes `--level=`, `--channel=`, `--grep=`, `--since=` and `--follow` (the default). A `custom` driver is `{ driver: 'custom', via: (config) => Transport }`. | blueprint, logs branch |

## Databases without Docker (project lead, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 40 | Any database server, with or without Docker | MySQL (default), MariaDB, PostgreSQL and SQLite all work without Docker, using your own server: XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install, or remote/cloud. Docker is never required for MySQL or PostgreSQL. | installer, framework |
| 41 | Docker missing | Offer "use my own database server" first, then start Docker, then SQLite. | spike 13 |
| 42 | Connection details | host/port/database/user/password with local-friendly defaults; empty password allowed locally with a warning; `DB_URL`, `DB_SOCKET`, `DB_SSLMODE`/`DB_SSL_CA`; connection tested with plain-language errors; database created if missing (or the exact SQL is printed). | spike 13, framework config |
| 43 | MariaDB | A first-class engine (`DB_CONNECTION=mariadb`), auto-detected from the server version. The ORM grammar handles the MariaDB differences (`RETURNING`, JSON, CHECK). It's tested on MariaDB 11 alongside MySQL 8.4. | ORM (spike 11), framework |
| 44 | PostgreSQL without Docker + RLS | Create the owner and app roles when allowed. Otherwise print the SQL and warn that a superuser connection disables RLS; `security:check` keeps flagging it. | spike 13, framework |

## Second pass (docs writer C findings, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 45 | Health route | `/up` always exists and answers `200 {"status":"ok"}` to GET and HEAD. It stays reachable during maintenance. | spike 13 template |
| 46 | `bootstrap/app.ts` | `Application.configure({ basePath }).withRouting({ web, api }).withMiddleware(...).withExceptions(...).create()` (spike 12, Laravel 11 style). Route files export `(router) => {}` callbacks. | spike 13 template |
| 47 | Facades | Typed static accessors (`Log`, `Cache`, `DB`, `Route`, `Mail`, `Storage`, `Http`). They resolve from the **current application's container**, not from module-level global state, so tests can swap them. The menu label becomes "Facades", and "Helpers" is a separate page. | framework, docs nav |
| 48 | Sort parameter | It uses column names: `sort=-created_at,title`. | blueprint §5 |
| 49 | Slug collisions | Sequential `-2`, `-3` suffixes (friendly and predictable), guarded by the unique index plus a retry on conflict. Random suffixes are rejected. | spike 12, docs `orm-slugs` |
| 50 | Sidebar entry shape | `{ name, label, path, icon, group, order, badge?, permission }`. `order`, not `sort`. | spikes 12 and 14 |
| 51 | Parity status accuracy | Maintenance mode: built (spike 12 `b941053`). Invokable controllers: 🟡. `Http` client: 🟡; only `safeFetch` exists. Doc 20 is corrected. | doc 20 |
| 52 | Signed URL names | Laravel's names: `url.signedRoute()` and `url.temporarySignedRoute()`. | doc 20, spike 12 |
| 53 | Search semantics | The blueprint rule: words AND, columns OR, at most 10 searchable fields, an exact match for an id or UUID. | spikes 10 and 12 |
| 54 | Default page size | 25 for both the API and the UI (choices 10/25/50/100). | spikes 10 and 12 |
| 55 | Lookup by slug | Route model binding at `/api/posts/{post:slug}`. There's no separate `/by-slug/` path. | spikes 10 and 14 |
| 56 | Soft-deleted rows | The API supports `filter[trashed]=with\|only` plus `POST /api/posts/{post}/restore`. | spikes 10 and 12 |
| 57 | Spike 14 leftovers | Messages say `node strut migrate`, never `sv`. Icons are **Tabler**, per DESIGN.md. The real build serves API and UI on one port. | spike 14 |
| 58 | Recommended mode | The docs list the questions instead of quoting a number (0.2 asks 6; hidden questions appear when their packages ship). | docs |
| 59 | Model stub | `export class Post extends Model('posts', { fillable: [...] }) {}` (spike 11 ORM). | spike 12 generator |
| 60 | `withoutCsrf()` environment | Works only when `APP_ENV=testing`. The environments are `local`, `testing`, `staging` and `production`. | spike 12, docs |

## Third pass (docs writer D findings, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 61 | Password rules | Follow NIST by default: at least 12 characters, at most 128, a breached-password check, **no composition rules**. `Password.min(12).uncompromised()` is the default; `mixedCase()`, `numbers()` and `symbols()` exist for apps that are required to use them. | blueprint §5.2, auth |
| 62 | argon2 | scrypt is the default. argon2 is a later opt-in hasher package; it's not in 0.2. | doc 20 |
| 63 | Where hashing lives | `Hash` in the framework; auth uses it. | framework |
| 64 | Signed links | **One signer** in the framework, used by signed routes, auth verification and reset links, and storage temporary URLs. It's an HMAC over the path, the sorted query, the expiry and a `purpose`. | framework, spikes 12 and 20, v1 storage |
| 65 | Signed URL API | `url.signedRoute(name, params, { expiresIn?, oneTime? })` and `url.temporarySignedRoute(name, expiresAt, params)` (Laravel's names). Catalogue F18 follows them. | doc 20, catalogue |
| 66 | Key derivation | One keyring: `keyring.derive(purpose)` = HKDF-SHA256(APP_KEY, salt `strutvane`, info `strutvane:<purpose>:v1`), with `APP_PREVIOUS_KEYS` support. Every feature derives through it. | framework |
| 67 | Invalid or expired signed links | 403 with code `invalid_signature` or `signature_expired`, for every link (auth links included). | spikes 12 and 20 |
| 68 | Error code casing | lowercase `snake_case` everywhere (`invalid_credentials`, `validation_failed`). | spike 20, all packages |
| 69 | Validation issue shape | RFC-0003 plus a convenience field: `{ path: (string\|number)[], field: 'items.0.title', code, message }`. | spikes 12 and 20, v1 |
| 70 | Impersonation | Needs the `impersonate` ability (only the admin role has it by default). Nobody can impersonate a user who also holds `impersonate` or a higher role. | spike 20, catalogue |
| 71 | TOTP | Built on `node:crypto` with no dependency. The catalogue entry is corrected. | catalogue |
| 72 | Encrypted casts | Status 🟡 (designed). Spike 11 doesn't have it yet. | doc 20 |
| 73 | Policy discovery | Auto-discovered by name: model `Post` → `app/policies/post.policy.ts`. An explicit policy overrides it. | spike 12 |
| 74 | Audit | The framework writes security events to the `audit_events` table. `@strutvane/activity-log` adds per-record history. | framework, docs |
| 75 | Test helper names | `Mail.fake()`, `Queue.fake()`, `Event.fake()`, `Notification.fake()`, `Http.fake()`, `travelTo()`, `freezeTime()`, `assertStatus()`. `actingAs(user)` takes a user model; use `withToken(token)` for API tokens. Doc 13 is updated later. | framework, docs |
| 76 | Generated tests | Vitest, never `node:test`. | spike 13 |
| 77 | Browser testing in the installer | Hidden in 0.2 (#3). Only Vitest is offered. | spike 13 |
| 78 | `migrate` in production | Asks for confirmation unless `--force` (Laravel behaviour). The deploy recipe uses `migrate --force`. | docs, framework |
| 79 | Example keys | Examples and tests use a generated 32-byte `APP_KEY`, never `dev` or `testing-key`. | spike 12 |
| 80 | Facade list | `Log`, `Cache`, `DB`, `Route`, `Mail`, `Storage`, `Http`, `Queue`, `Event`, `Bus`, `Notification`, `Hash`, `Crypt`, `Url`. `research/…beyond-laravel` "no facades" is superseded by #47. | doc 20 |
| 81 | Queue worker commands | `queue:work`, `queue:listen`, `queue:monitor`, `queue:restart`, `queue:retry`, `queue:flush` (0.3). | blueprint §2.2 |
| 82 | Phases | ORM model events P1. Application events, `afterCommit`, pruning and the scheduler P2. | doc 20 |
| 83 | Domain events before the queue | In 0.2 they're dispatched in-process after the transaction commits. The durable outbox ("never lost") arrives with the queue in 0.3. The docs say so plainly. | docs |
| 84 | `/ready` | Comes in 0.3 with the health-check registry (F13). `/up` (liveness) is in 0.2. | blueprint §5 |
| 85 | Phase wording | "Coming in 0.3", never "After 0.2". | docs |
| 86 | `Process.run` on Windows | `npm`/`npx` run as `node <npm-cli.js>`, as the installer already does. Other `.cmd` files are refused with a friendly error unless `{ windowsShell: true }` (safe quoting). | framework |
| 87 | `Concurrency.run` | Worker drivers take module tasks (`task('reports/build', args)`), not closures. Closures work only with the `sync` driver. Tenant and request context are passed explicitly and re-established in the worker. | framework, docs |

## Fourth pass (docs writer B findings, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 88 | Seeder shape | `export default defineSeeder({ after?: ['users'], async run({ db, factory, env }) { … } })` in `database/seeders/post.seeder.ts`. `database.seeder.ts` is maintained by auto-registration. | spikes 12 and 13, docs |
| 89 | Factory shape | `export default defineFactory(Post, ({ faker, sequence }) => ({ … }))` with `.state()`, `.for()`, `.has()`, `.recycle()`. | spike 12, docs |
| 90 | Turning tenancy off | `config/tenancy.ts` = `{ enabled, column: 'tenant_id' }`. `enabled` is `false` unless the installer's teams answer was yes. The ORM tenant scope is active only when enabled. | spikes 11 and 13 |
| 91 | Opting a model out of the generated API or UI | `Model('posts', { fillable, api: false, ui: false })`. | blueprint §2.4, spikes 10 and 14 |
| 92 | Slug uniqueness with teams | A composite unique index on `(tenant_id, slug)` when tenancy is on, otherwise `(slug)`. Suffixes stay sequential (#49). | spike 10 |
| 93 | Primary keys | `t.id()` = bigint auto-increment (Laravel's default). `t.uuid('id').primary()` = UUIDv7 primary key. | spike 10 |
| 94 | Public exports | `unsafeRaw` and `TenantScopeMissingError` are exported from the ORM entry. | spike 11 |
| 95 | MySQL timestamps | `DATETIME(3)` storing UTC (no 2038 limit). | spikes 10 and 11 |
| 96 | SQLite default file | `database/database.sqlite` (Laravel). | spikes 12 and 13 |
| 97 | Column modifiers and helpers | `.secret()`, `.hidden()`, `t.tenant()`, `schema.create(name, { global: true })` and `{ internal: true }` are part of the Schema builder. Spike 10 adds them. | spike 10 |
| 98 | Parity accuracy (ORM, migrations) | Upserts, chunking, `cursor()`/`lazy()`, deadlock retries, encrypted and enum casts, `visible`/`appends`, simple pagination, multiple connections, `migrate:fresh`/`refresh`, `--pretend` and `--isolated` are 🟡 (designed), not ✅. Doc 20 is corrected. | doc 20 |
| 99 | Blueprint §4 feature list | Each unbuilt feature is marked "planned for 0.2". | blueprint §4 |
| 100 | `db:seed` options | `--class=PostSeeder`, `--force` (production). | framework, docs |
| 101 | Error texts in spikes | Every message says `node strut …`, never `sv …`. | spikes 10, 11 and 14 |

## Fifth pass (docs writer B, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 102 | Observers | Laravel style. `make:observer PostObserver --model=Post` writes `app/observers/post.observer.ts`, a class with one method per event. Register it with `observe(Post, new PostObserver())` in a provider. `restore()` fires `restoring` → `saving` → `updating` → `updated` → `saved` → `restored`. | ORM |
| 103 | Cancelling a write from a "before" hook | Returning `false` from `creating`, `updating`, `saving`, `deleting` or `restoring` cancels the write. `save()` then resolves to `false`, and the generated API answers 422 with code `write_cancelled`. Throwing aborts the write and rolls back the transaction. | ORM, framework |
| 104 | `database.seeder.ts` contents | `export default defineSeeder({ async run({ call }) { await call([UsersSeeder, PostsSeeder]) } })`. The `call([...])` list sits between `// strut:seeders:start` and `// strut:seeders:end` markers and is kept in dependency order by the CLI. Everything outside the markers belongs to you. | spikes 12 and 13, docs |

## Sixth pass (docs writer A findings, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 105 | CSRF and the session cookie name (**security**) | The CSRF check keys on the **configured** session cookie name, from the same single source the session layer uses. In production over HTTPS the cookie is `__Host-strutvane_session`; in local HTTP it's `strutvane_session`. Tests prove the check runs under both names, and under any custom name. Supersedes the name-only wording of #24. | spikes 12 and 20, framework |
| 106 | Route groups | `Route.middleware('csrf').group(() => { Route.get(…) })` registers routes inside the callback, Laravel-style. Returning an array is also accepted. | docs `routing`, spike 12 |
| 107 | Password sign-in switch | Add the feature `password` (default on). "Email link only" = `password: false, emailLink: true`. "No sign-in" = auth isn't installed. | #25, spike 20, installer |
| 108 | Test runner question | The choices are `vitest` (default) or `none`. Browser tests are hidden until `@strutvane/browser-testing` ships. | spike 13 |
| 109 | Flags of hidden installer questions | A flag for a package that isn't published yet is refused with "`@strutvane/x` isn't available yet (planned for 0.N)", unless `--preview-catalogue` is set. | spike 13 |
| 110 | Where Docker mode is recorded | The project choice (`docker: true/false`) lives in the committed `strutvane.json`. A per-machine override can go in the git-ignored `.strutvane/local/env.json`. | spike 13 |
| 111 | `.dockerignore` | Excludes `.strutvane/local/` (not all of `.strutvane/`, whose generated files the build needs), along with `.env*`, `.git`, `node_modules`, `storage/` and tests. | spike 13 |
| 112 | `queue:clear` | Included with the other queue commands (#81), coming in 0.3. | blueprint, docs |
| 113 | Maximum password length | 256 characters (spike 20; scrypt cost doesn't grow with length). Amends #61's 128. | docs, auth |

## Seventh pass (UI, design and auth audit, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 114 | Account pre-hijacking (**security**) | With email verification on, **password sign-in is refused until the address is verified**. On the first proof of mailbox ownership (the verification link or an email-link sign-in) for an account that was registered but never verified, the pre-verification password and every session and token are cleared, and the owner sets a new password. | spike 20, auth |
| 115 | Audit events while impersonating | Every audit event carries both `actorId` (the impersonator) and `subjectId` (the impersonated user). | spike 20, framework audit |
| 116 | Session list while impersonating | Impersonation sessions are labelled "Signed in by an administrator" and don't show the admin's IP or user agent to the user. | spike 20 |
| 117 | Races in auth | The last-admin check and the passkey counter update are atomic store operations (a conditional update or row lock). The email-link nonce cookie is `__Host-` + `Secure` and needs HTTPS outside `local`. | spike 20, auth |
| 118 | UI error parsing | The 422 parser reads `issues[].path` first and falls back to `field` (#69). | spike 14, ui |
| 119 | Inline theme script and CSP | The static inline theme script is allowed by a CSP **hash**, generated at build time. Components that inject styles take a `nonce` prop. | spikes 14, 17 and 19, ui, designs |

## Eighth pass (installer audit, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 120 | Flags that npm swallows without a trace | Rename `--auth` to `--sign-in` and `--ci`/`--no-ci` to `--ci-workflow`/`--no-ci-workflow`. npm consumes the old names silently even after `npm create …`. The old names stay accepted after `--` and print a one-line rename hint. Docs and the question table use the new names. | spike 13, docs |
| 121 | Atomic migrations | A migration's statements and its `migrations` record are written in one transaction where the engine allows it (PostgreSQL, SQLite). On MySQL/MariaDB, each statement is recorded as it completes, so a re-run resumes inside the migration (blueprint §2.4). | spike 10, framework |

## Ninth pass (refines #114, 2026-11-15)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 122 | Pre-hijacking without punishing normal sign-ups | Registration binds the account to the registering browser with a `__Host-` nonce cookie (same pattern as the email-link binding). When the verification link is opened **in that same browser**, the password the user chose is kept: no extra step. When it's opened **in a different browser**, or through an email-link sign-in, the pre-verification password and every session and token are cleared and the owner sets a new password (#114). A completed password reset also marks the address verified. | spike 20, auth |

## Tenth pass (framework fix pass, 2026-11-16)

| # | Topic | Decision | Owner |
|---|---|---|---|
| 123 | Uppercase framework error codes | Move every existing framework code to lowercase `snake_case` within the 0.2 line (a breaking change is allowed before 1.0). The registry accepts both for one minor version, with a deprecation warning; the upgrade guide lists every renamed code. | framework, docs |
| 124 | Bearer + session cookie together | Still CSRF-checked (fails closed). Only a request with **no** session cookie skips the check. Blueprint §5.2 wording follows. | blueprint |
| 125 | Behaviour changes accepted | A failing `after*`/`afterCommit` hook is logged and never turns a committed write into a 500. CSRF covers hook-answered routes. Reaching the dev server by LAN IP or another hostname needs `trustedHosts`. | docs |
| 126 | Include cap signal; idempotency store | Single-record responses use the `Strutvane-Truncated-Includes` header; lists use `meta.truncated`. The in-memory idempotency store is per-process; clusters bind a shared store (`@strutvane/redis` in 0.3). | docs |
| 127 | `sv` in generated text | Every generated file, hint and message says `node strut …`, never `sv`. | framework, installer |
