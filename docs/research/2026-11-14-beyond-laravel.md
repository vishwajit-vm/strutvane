# Beyond Laravel: a product and DX review of the v2 blueprint (2026-11-14)

- **Date:** 2026-11-14
- **Type:** product/DX review and proposal. It changes no decision. Conflicts with the blueprint or with the research are listed in §0.2 and need the project lead's call (and an ADR where one applies).
- **Brief:** the project lead wants Strutvane v2 to be "a better project than Laravel: more advanced and more friendly", on TypeScript and npm.
- **Reviewed:**
  - [`../18-v2-blueprint.md`](../18-v2-blueprint.md) (DRAFT, 2026-11-14), cited as **[bp §n]**
  - [`../../spikes/SHARED-DESIGN.md`](../../spikes/SHARED-DESIGN.md), cited as **[board]**
  - the 2026-11-14 research set:
    - [Laravel ecosystem study](2026-11-14-laravel-ecosystem-study.md) **[eco §n]**
    - [JS alternatives study](2026-11-14-js-laravel-alternatives-study.md) **[js §n]**
    - [current-state audit](2026-11-14-current-state-audit.md) **[audit §n]**
    - [auth study](2026-11-14-laravel-auth-to-ts.md) **[auth §n]**
    - [auto admin UI design](2026-11-14-auto-admin-ui-design.md) **[admin §n]**
    - [installer design](2026-11-14-installer-and-local-env-design.md) **[installer §n]**
    - [package catalogue](2026-11-14-package-catalogue.md) **[cat §n]**
- **Priorities used throughout:**
  - **P0:** must be in 0.2.0 (phase 1).
  - **P1:** next (0.3, alongside background work).
  - **P2:** later (phase 3 or after).
- **Owners:**
  - `S10` to `S14` are spikes 10 to 14: schema, ORM, MVC core, installer and auto CRUD UI.
  - `docs` is the docs/versioning agent.
  - Packages: `framework`, `auth`, `ui`, `create-strutvane`, `log-viewer`.
- **Citations:**
  - Facts about Laravel come from the ecosystem study (read 2026-11-14) unless a new source is given.
  - Anything from prior knowledge is marked *(unverified)*.

---

## 0. Summary

### 0.1 The verdict in five lines

1. **The blueprint fully matches 16 of the 25 Laravel strengths below and partly matches 8; only testing is missing.** The gaps are concentrated in four places: testing helpers, a mail core that auth needs in 0.2, inspection commands (`model:show`), and the release, support and upgrade story.
2. **Where Strutvane can beat Laravel cheaply** is types:
   - relations that can't be lazy-loaded by accident, so N+1 becomes a compile error;
   - mass assignment that is a typed subset;
   - typed routes, a typed API client and form types, all generated from the migration replay that spike 10 already proves.
   Laravel needs Larastan, IDE Helper, Wayfinder and Precognition to get part of this [eco §9.1, §12.2].
3. **Where it can beat Laravel on safety** is defaults: deny-by-default policies, tenancy, unknown-field rejection, formula-safe exports and redacted logs. All are in the blueprint. The weak spot is that the **default database (MySQL) has no RLS**, so "secure multi-tenancy by default" needs the mitigations in §2.10.
4. **"Friendly" is mostly about error text.** Every touchpoint should follow one format: *what happened, why, how to fix it, where to read more*. §3 gives example messages for each touchpoint.
5. **The ranked top 15 for 0.2** (§5) is deliberately small. Each item is a few days of work on top of the blueprint and maps to one owner.

### 0.2 Conflicts and gaps found (reported, not resolved)

| # | Where | Issue | Suggested resolution (needs the lead's call) |
|---|---|---|---|
| X1 | [bp §2.2] `up`, `down` | In Laravel, `php artisan down`/`up` mean **maintenance mode** *(long-standing; unverified for 13.x wording)*. Laravel developers will type `node strut down` expecting maintenance mode and stop their database instead. | Rename the Docker commands to `services:up` / `services:down` (or `sail:*`), and keep `up`/`down` for maintenance mode (P1). If the names stay, `down` must print what it stopped and how to undo it. |
| X2 | [bp §2.1, §4] MySQL default + teams | With teams on MySQL, isolation rests only on the ORM scope. The installer research put PostgreSQL first when teams are chosen [installer §3.2 q6]. | Keep MySQL as the default, but **pre-select PostgreSQL when "Teams" is Yes**, still allowing MySQL with an explicit note. On MySQL, also generate cross-tenant attack tests and have `doctor` warn on raw SQL (§2.10). |
| X3 | [bp §6] vs [bp §10] | Phase 1 auth ships email verification and password reset, but the mail core is phase 2 (0.3). Those features can't work without mail. | Move a **minimal mail core** (SMTP + `log` transport + a dev inbox) into 0.2 (§5 #5). Queue-backed mail stays in 0.3. |
| X4 | [bp §4] "PGlite and SQLite for fast tests" vs MySQL default | Testing on a different engine from production hides dialect bugs: collation, `LIKE` case rules, JSON, strict mode. This is a known Laravel trap (`phpunit.xml` with SQLite `:memory:` *(unverified for 13.x)*). | The default test engine is **the app's own engine** (a per-worker test database, with a transaction rolled back per test). PGlite/SQLite is an opt-in `--fast` mode with a documented caveat (§2.5). |
| X5 | [bp §2.4] "in a transaction where the database supports it" | MySQL DDL commits implicitly (MySQL manual, "Statements That Cause an Implicit Commit" *(prior knowledge)*). On the **default** engine, a failed migration can therefore be half applied. | Be honest in the output, and record progress per operation. Because the replay knows the inverse of every operation, offer `migrate:repair` (§3.4; P0 for the message, P1 for repair). |
| X6 | [bp §3.1] `.strutvane/` git-ignored vs [cat §5] `database/schema.gen.ts` committed | If the generated types are git-ignored, a fresh clone fails `tsc` until `migrate` or `setup` runs. CI then needs the generation step, and npm 12 blocks `postinstall`-style fixes [installer §1.6.6]. | Either commit `models.d.ts` (Adonis commits `database/schema.ts` [js §1]), or make `typecheck` and `check` run `node strut types` first, and add `node strut types --check` to CI. Pick one in the ADR. |
| X7 | [installer §1.6.2] vs [bp §7] "Node 24+" | PowerShell argument passing through `npm.ps1` is only fixed from Node 24.3. | Set `engines.node` to `>=24.3` and check it in the starter's preflight. |
| X8 | [bp §5] standards table | No row for **OpenAPI / `/docs`** or the **typed client**, although ADR-0019 (the `/docs` page) and [cat §5] put them in phase 1. | Add both rows (§4.2, §4.3). |

---

## 1. Laravel's top 25 DX strengths, checked against the blueprint

The columns say whether the blueprint has the strength (**Yes**, **Partly** or **No**), what's missing, and where to add it.

| # | Laravel strength | Blueprint | What's missing → where to add it |
|---|---|---|---|
| 1 | **One installer with a few questions, flags for each, and Prompts-quality CLI** (`laravel new`) [eco §1.2, §11] | Yes [bp §2.1] | Show the review screen and the `--yes` equivalent command at the end ("to recreate this: `npm create strutvane@latest acme -- --db mysql --auth email --teams`"). → S13 |
| 2 | **A working, migrated app straight after create** (SQLite plus `migrate` in `post-create-project-cmd`) [eco §1.3] | Yes, and better: it also seeds an admin and offers `dev` [bp §2.1] | Nothing. The SQLite fallback when Docker is missing is the key safety net; keep it. |
| 3 | **One dev command** (`artisan dev`: server, queue, logs and Vite multiplexed; packages register processes) [eco §1.3] | Yes [bp §5 Dev] | A one-screen dev banner listing every URL (app, `/docs`, logs, mail inbox). Prefixed coloured output per process, and `--only`/`--except` filters like Laravel's registry. → S12 |
| 4 | **`make:*` vocabulary with interactive prompts for missing input** [eco §3] | Partly [bp §2.2] | In 0.2, add `make:test`, `make:command`, `make:observer`, `make:resource` (API resource), `make:middleware` and `make:rule`, plus `node strut list make`. `make:job`, `make:mail`, `make:notification` and `make:event` come in 0.3. Every generator gets `--dry-run` [eco §3 "do better"]. → S12 |
| 5 | **Migration name parsing** (`create_x_table`, `add_y_to_x_table`) [eco §3.2] | Yes [bp §2.3] | Nothing. |
| 6 | **Migration commands** (`--pretend`, `--step`, `--isolated`, `rollback`, `status`, `fresh --seed`, `schema:dump`) [eco §5] | Partly [bp §2.2] | `migrate --pretend` (print the SQL) is P0, and cheap because the replay already produces SQL. `--step` is P0. `--isolated` reuses v1's lock (P0). `schema:dump` is P2. → S10 |
| 7 | **Eloquent's fluent API, relationships and eager loading** [eco §4] | Yes [bp §4] | Make lazy loading impossible by type (§2.3). → S11 |
| 8 | **Model features** (casts, accessors, scopes, soft deletes, events, observers, pruning) [eco §4.1] | Yes [bp §4] | Pruning (`prunable()` plus a scheduled `model:prune`) is P1, with the scheduler. → S11 |
| 9 | **Factories and seeders** (states, sequences, `has`/`for`, `recycle`, `DatabaseSeeder` ordering) [eco §6] | Partly [bp §2.3, §4] | Factory `definition()` derived from column types and names (an `email` column gets a fake email; an enum gets a member; a `foreignId` gets the parent factory). Deterministic seeds by default. Typed `has('posts', 3)` instead of magic `hasPosts(3)`. → S11 |
| 10 | **`Route::resource`, route model binding and slug binding** [eco §7] | Yes [bp §5 REST, Slugs] | Self-healing `slug-id` URLs with a 308 redirect (spatie-sluggable 6) are P2 [eco §10.1]. |
| 11 | **Form requests and the 422 error shape** [eco §7.4] | Partly [bp §2.2 `make:request`, §5 Errors] | The blueprint doesn't say where the base rules come from. Proposal: the replay generates a **Zod schema per table** (required from `NOT NULL` without a default, max from length, enum members, numeric scale), and form requests `extend` it. The same schema validates on the client (§4.11). → S10, S12 |
| 12 | **API resources and a stable pagination envelope** [eco §4.2–4.3] | Yes [bp §4 "API resources", §5 Pagination] | Nothing; the `Json` type from spike 10 is the resource's output type. |
| 13 | **Policies auto-discovered by name; Gate; `can` middleware** [eco §8.4] | Yes, and better (deny by default, compiled to SQL) [bp §6] | A typed `before()` hook for super-admins (Laravel's `Gate::before`), and `denyAsNotFound()` as the default for `view` (no enumeration). → `framework` (S12) |
| 14 | **Starter-kit auth with owned screens** (Fortify features list) [eco §8.2] | Yes [bp §6] | How security fixes reach owned screens once the merge engine is retired: write it into the blueprint (§2.7). → `auth`, S14 |
| 15 | **Sanctum: SPA cookie plus hashed tokens with abilities** [eco §8.3] | Yes [bp §6] | Nothing. Abilities are the same strings as RBAC permissions [cat §5 auth]. |
| 16 | **Error page with "Copy as Markdown" for AI** [eco §12.1 item 4] | Yes [bp §5 Dev] | Define what the page shows (§3.3), including a solution line, the SQL with bindings, and redaction. → `framework` |
| 17 | **`tinker`** [eco §3.3] | Yes (`repl`) [bp §2.2] | Top-level `await`, models and `app` preloaded, `.strutvane/types` loaded for completion, and a read-only `--safe` mode for production shells. → S12 |
| 18 | **Introspection** (`route:list`, `about`, `model:show`, `db:show`, `db:table`) [eco §3.3] | Partly [bp §2.2] | `model:show Post` is P0. It reads `resources.json`, so no database is needed, and adds a `--live` diff against the database. `db:show` is P1. `route:list` shows the policy ability per route. → S12 |
| 19 | **`.env` plus `config()`; `/up` health route; JSON errors under `/api`** [eco §2.2] | Yes, and better (typed config, validated env) [bp §3.1] | The `/up` health route isn't named in the blueprint. Add it to `bootstrap/app.ts` `withRouting({ health: '/up' })`. → S12 |
| 20 | **Logging plus Pail** (live tail in the terminal) [eco §1.3] | Yes (pipeline plus `log-viewer`) [bp §3.2] | A terminal tail (`node strut logs:tail`, Pail's role) inside `npm run dev`. Note: the Docker `logs` command name clashes; see X1. → `framework` |
| 21 | **Testing** (`php artisan test`, `RefreshDatabase`, `actingAs`, HTTP assertions, `Mail::fake`, `--parallel`) [eco §11] | **No**: only "Vitest" and "PGlite/SQLite for fast tests" | A testing kit is P0 (§2.5). → `framework` (S12), the starter's test files (S13) |
| 22 | **Sail: local services through a compose file and a thin CLI** [eco §1.4] | Yes [bp §2.2] | A separate `testing` database created next to the dev database, as Sail does for MySQL. → S13 |
| 23 | **Operational niceties** (maintenance mode, `optimize`, health checks, graceful queue restarts) | Partly | Maintenance mode is P1 (see X1). `node strut build` → `build/server.js` plus graceful shutdown and the migrate lock are P0 [installer §3.6]. |
| 24 | **Docs:** one site, task-oriented, versioned, "Copy as Markdown", an agent playbook (`/for/agents`, Boost, `AGENTS.md` in the skeleton) [eco §1.1, §1.3, §12.1] | Partly: "docs" in phase 1 [bp §10]; versioning in [board] | The IA and per-package template from [cat §6.4]; `llms.txt`; a docs page for every error `code`; a generated `AGENTS.md` per app. All P0 (§3.8). → `docs`, S13 |
| 25 | **A coherent first-party ecosystem plus a stability promise** (`install:*`, annual majors, 18 months of bug fixes and 2 years of security fixes, an upgrade guide) [eco §11, §12.1] | Partly [bp §3.2, §8] | Write a **support policy for 0.x** (e.g. "the latest 0.y gets fixes; security fixes are backported to the previous 0.y for 3 months"), an `UPGRADE.md` per minor, and runtime deprecation warnings one minor ahead (§2.7). → `docs`, `framework` |

**Score:** 16 Yes, 8 Partly, 1 No. The "No" (testing) and two of the "Partly" items (mail, X3; upgrades, #25) are the gaps that matter most for a first impression.

---

## 2. Laravel's pain points and what Strutvane does better

Each row names the concrete feature, its priority and its owner. The paragraphs after the table add design notes where the table is too short.

| # | Laravel pain point | Strutvane feature that does better | Priority | Owner |
|---|---|---|---|---|
| 2.1 | **Magic facades, magic methods and container string keys** that defeat static analysis [eco §12.2 item 1] | **No facades and no string keys.** Services resolve from typed tokens, and small typed helpers (`cache()`, `log()`, `auth()`, `db()`) read the per-request context from `AsyncLocalStorage`. Every helper has go-to-definition and TSDoc. Models expose static, fully typed builders (`Post.query()`), not `__callStatic`. No decorators [board]. | P0 | S12, S11 |
| 2.2 | **Runtime errors that types would catch:** a wrong column name, an unknown route name, a missing config key, a mistyped ability, a dropped column still used in Blade | Generated types for **columns, routes, config, env, policy abilities and resource UI fields**. `Post.query().where('titel', …)` fails `tsc`. `route('posts.show', { post })` is typed by the route registry. `can(user, 'udpate', post)` fails to compile. A dropped column used in `posts.ui.ts` is a type error [bp §2.4]. Translation keys and event names follow in P1. | P0 (columns, routes, config/env, abilities); P1 (i18n keys, events) | S10, S11, S12, S14 |
| 2.3 | **N+1 queries.** Laravel's guard (`preventLazyLoading`, `shouldBeStrict`) is opt-in and is often turned off in tests ([Laravel News](https://laravel-news.com/shouldbestrict); [laraveldaily tip](https://laraveldaily.com/tip/disable-lazy-loading-when-running-your-tests), read 2026-11-14) | **Lazy loading is impossible by type.** A relation is a *method* that returns a builder; its *data* exists on the object only when it was loaded. `Post.query().with('author')` returns `Post & { author: User }`, while `post.author` without `with()` is a builder, not a `User`. Accessing it as data fails `tsc`. In development, a request-scoped **N+1 detector** (the same query shape run more than 5 times in one request) logs a warning with the call site and shows it on the error page. | P0 | S11 |
| 2.4 | **Mass-assignment pitfalls:** `$fillable`/`$guarded` maintained by hand; `#[Unguarded]`; `#[FailOnUnknownFields]` opt-in [eco §4.1, §7.4] | `create()` and `update()` accept only the generated **`NewPost` / `PostPatch`** types. These exclude `id`, timestamps, `deleted_at`, `tenant_id` and columns guarded by name (`password`, `*_token`, `is_admin`, `role`, `role_id`, which also stay hidden from JSON), and each guard can be overridden on the model. At the HTTP boundary unknown keys are rejected with a 422 issue per key. | P0 | S11, S12 |
| 2.5 | **Slow test suites:** a per-test migrate or truncate; SQLite in tests vs MySQL in production; slow bcrypt in factories | A **testing kit**:<br>- the schema is built once per Vitest worker (from the replay's SQL, not by replaying migration files);<br>- each test runs in a transaction that is rolled back;<br>- parallel by default;<br>- fast password hashing in tests;<br>- `actingAs(user)`, `asTenant(team)`;<br>- `http.get('/api/v1/posts').assertOk().assertJsonPath(...)`;<br>- `Mail.fake()`.<br>`make:migration` generates a feature test plus a cross-tenant attack test per resource. Default engine = the app's engine (X4). | P0 (kit + generated tests); P1 (`--fast` PGlite mode, snapshot of seeded DB) | `framework` (S12), S13 |
| 2.6 | **Upgrade churn of starter kits** (laravel/ui → Breeze/Jetstream → kits; owned code never updated) [eco §12.2 item 3] | **Thin owned files:**<br>- owned pages compose package components and actions, so security fixes arrive via `npm update` while the layout stays yours [cat §5 auth];<br>- `node strut upgrade --check` compares owned files with the new stubs and prints a diff per file (no merge engine);<br>- deprecations warn at runtime one minor ahead;<br>- `UPGRADE.md` per minor.<br>Codemods (`node strut upgrade --apply`) come in P2. | P0 (thin files, `--check`, `UPGRADE.md`); P2 (codemods) | `auth`, `ui`, S14, `docs` |
| 2.7 | **PHP deployment and ops** (PHP-FPM plus a web server, Octane state leaks, Forge/Vapor/Cloud as paid answers) [eco §11, §12.2 item 7] | **One Node process:**<br>- `node strut build` → `build/server.js` + `build/public`;<br>- `npm start` needs no devDependencies [installer §3.6];<br>- `/up` health, graceful shutdown (drain HTTP, close the pool), `migrate --force --isolated` with v1's lock, and a JSON log format in production;<br>- deploy recipes (Azure Container Apps, Fly, Render, a plain VM with systemd).<br>Node is long-lived by design, so there's no Octane-style mode switch. | P0 (build/start/health/shutdown/lock); P1 (recipes) | `framework`, `docs` |
| 2.8 | **Admin panels are separate products** (Filament/Nova, a second UI stack; Filament allows when a policy is missing) [eco §9.3, §12.2 item 4] | **Generated CRUD screens are part of `ui`,** in the same React stack as the customer app, generated on `migrate`, hidden by `viewAny`, and denied when a policy is missing [bp §2.4, §5]. Areas or panels (`/admin`, `/app`) come in P1. | P0 (exists in bp); P1 (areas) | S14 |
| 2.9 | **Inconsistent API conventions** (no first-party filter/sort/include convention, no versioning convention) [eco §7.5, §10.2] | One standard for query params, errors, pagination, slugs and search [bp §5], `/api/v1` from day one, **OpenAPI 3.1 generated from the same registry**, and a **conformance test** that requests every generated route and checks the response against its OpenAPI schema. | P0 | S12 |
| 2.10 | **No built-in multi-tenancy** (community packages, app-level scoping) [eco §12.2 item 5] | The tenant global scope (all engines) plus RLS on PostgreSQL (ADR-0007), tenant context in `AsyncLocalStorage` that flows to jobs, cache keys, slugs and search. **MySQL mitigations (X2):**<br>- generated cross-tenant attack tests per resource;<br>- `doctor` flags raw SQL (`db.raw`, `db.unsafe`) in `app/` when teams are on;<br>- `tenancyAudit` lists tables without `tenant_id`;<br>- the installer pre-selects PostgreSQL when teams are chosen. | P0 | S11, S13, `framework` |
| 2.11 | **Opt-in security** (open routes, Filament allows, `FailOnUnknownFields` opt-in, `afterCommit` opt-in) [eco §8.4, §12.2] | Deny by default everywhere:<br>- each route needs a policy, a permission or `public: true`;<br>- unknown fields are rejected;<br>- the `api` rate limiter is on;<br>- CSRF and origin checks;<br>- security headers;<br>- formula-safe CSV;<br>- redaction before storage.<br>`node strut security:check` (part of `doctor`) lists every `public: true` route and every policy method returning `true` unconditionally. | P0 (defaults, exist in v1); P0 (the `doctor` checks) | `framework`, `auth`, S13 |
| 2.12 | **No end-to-end typing between backend and frontend** (needs Wayfinder + Inertia + Precognition + IDE helper) [eco §9.1, §9.3] | **One chain from one source:** migration → replay → `models.d.ts` and per-table Zod → typed request/response → **generated API client** (`.strutvane/client.gen.ts`) → form types and live validation in the UI. No extra package. | P0 | S10, S12, S14 |
| 2.13 | **Docs scattered across packages** (Horizon, Telescope, Cashier, Filament and Spatie each document separately; mixed versions) | One versioned site with docs colocated in `packages/<x>/docs` and assembled at build [cat §6.4]; the same template per package; `llms.txt`; "Copy as Markdown"; and **the installed version's docs bundled in the tarball** for offline and agent use. Every error `code` links to its page. | P0 (site, versioning, error pages, `llms.txt`); P1 (offline bundle) | `docs` |
| 2.14 | **Schema duplicated across seven files** (migration, fillable, casts, rules, resource, UI, search lists) [eco §12.2 item 2, §10.2] | Columns live only in migrations; types, validation, API, OpenAPI, UI and search flags are derived from the replay [bp §2.4]. | P0 (exists) | S10 |
| 2.15 | **Half-applied migrations on MySQL** (shared with Laravel) | Per-operation progress records, an exact report of what ran, and `migrate:repair` that applies the recorded inverse ops (X5). | P0 (report); P1 (repair) | S10 |

### Design notes

**2.3 Typed relation loading (S11).** The key type is `Loaded<M, 'author' | 'comments'>`: `with()` widens the row type, and the relation *method* (`post.author()`) stays a builder for explicit queries. Serialization (`toJSON`) includes only loaded relations, so API output is typed, and an `include=` param maps to `with()` at the controller boundary. This one change removes the most common performance bug in Laravel apps without any runtime "strict mode" switch.

**2.4 Guard heuristics (S11).** Names come from the same list the UI uses to hide fields [eco §9.3 Filament heuristics]. A model can override them with a typed `static guarded = ['role'] as const` or `static fillable = [...] as const`, keyed by column name from the generated types, so a typo is a compile error. Seeders and factories bypass the guard, as in Laravel, but only through an explicit `Model.unguarded(() => …)`.

**2.5 Test speed (framework).** Three things make Laravel suites slow *(practitioner experience, unverified as a measurement)*: migrating per test class, bcrypt in factories, and serial runs. The kit avoids all three:
- build the schema once per worker from the replay's SQL;
- use one transaction per test, rolled back in `afterEach`;
- set the hash cost to its minimum when `NODE_ENV=test`;
- let Vitest run workers in parallel, each with its own database (`app_test_1`, `app_test_2`, …) created by `node strut test:db` (Sail's separate `testing` database, generalised).

Target: 200 generated feature tests in under 20 s on MySQL in Docker *(target, unverified)*.

---

## 3. "Friendly" checklist for every touchpoint

**The common format:** every message follows *what happened → why (if known) → the fix as a copyable command → a docs link*. It never shows a stack trace unless `--verbose` is set or the error is a bug in Strutvane itself, and when it is a bug, it says so and links to "report a bug".

### 3.1 Installer prompts (S13)

| Check | Example / rule |
|---|---|
| Plain-language questions with the consequence in the hint | `Teams? (each customer company sees only its own data)` [installer §3.2]. With MySQL: hint `On MySQL, isolation is enforced by Strutvane's tenant scope. PostgreSQL adds database-level row security.` |
| A default for everything, shown in bold, and `--yes` takes them all | — |
| A review screen with "change an answer" | [installer §3.2 q11] |
| The equivalent one-line command printed at the end | `Recreate this setup: npm create strutvane@latest acme -- --stack full --auth email --db mysql --teams --yes` |
| Never offer what isn't built | The package list is generated from the published train [cat §7 notes] |
| Failure recovery as a menu, not a stack trace | `Docker is installed but not running.` → `Start Docker Desktop and wait` · `Retry` · `Use SQLite instead` · `Skip for now` [installer §3.4] |
| A secret shown once, with where it lives | `Password  q7Vd-3kPz-Xm2c-8RtL  (shown once; also SEED_ADMIN_PASSWORD in .env)` |
| Windows execution-policy hint at the top of the install page and in the preflight error | `npm couldn't run because PowerShell blocks scripts. Run: npm.cmd create strutvane@latest acme  (or once: Set-ExecutionPolicy -Scope CurrentUser RemoteSigned)` |

### 3.2 CLI help and errors (S12)

- `node strut` with no arguments prints grouped commands (Make, Database, Inspect, Packages, Services), the app name, the version and the environment, like `php artisan`.
- `node strut help make:migration` shows usage, every flag with its default, **three examples**, and the docs URL.
- Typos get a suggestion:
  ```text
  Unknown command "migrate:fersh".
  Did you mean: migrate:fresh ?
  See all commands: node strut list
  ```
- Missing arguments are prompted for in a TTY and are an error in CI:
  ```text
  make:migration needs a name, e.g. create_posts_table.
  Run: node strut make:migration create_posts_table --seeder
  ```
- Dangerous commands confirm, and production needs `--force`:
  ```text
  migrate:fresh drops all 14 tables in "acme" (MySQL, 127.0.0.1:3306) and re-runs every migration.
  This deletes all data. Continue? (y/N)
  ```
- Exit codes are documented (0, 1, 2, 130). Non-TTY output has no spinners; `NO_COLOR` and `--json` are respected for scripts and agents.

### 3.3 The error page (framework)

The development error page shows:
- the `Problem` title and `code`;
- **a solution line** (from the error catalogue);
- the code frame of the *app's* file first (framework frames collapsed);
- the request (method, path, redacted headers and body);
- the SQL with bindings and its duration, and the authenticated user and tenant;
- for a 403, the policy decision (§4.12);
- **"Copy as Markdown for AI"**, with the same redaction as logs (RFC-0004).

Example solution lines:

| Error | Solution line |
|---|---|
| `ECONNREFUSED 127.0.0.1:3306` | `The database isn't reachable at 127.0.0.1:3306. Start it with: node strut up   (or check DB_HOST/DB_PORT in .env)` |
| `ER_NO_SUCH_TABLE posts` | `Table "posts" doesn't exist yet. You have 1 pending migration: 2026_11_14_101502_create_posts_table. Run: node strut migrate` |
| Missing policy | `No policy for Post, so every action is denied (deny by default). Create one: node strut make:policy PostPolicy --model=Post` |
| `APP_KEY` missing | `APP_KEY isn't set. Generate one: node strut key:generate` |
| Env validation | `.env is invalid: DB_PORT must be a number (got "33o6").` |

Production shows a plain page with the `traceId` and no details. Under `/api/*` the response is always problem+json.

### 3.4 Migration errors (S10)

```text
✖ 2026_11_14_101544_create_invoices_table failed after 2 of 4 operations

  MySQL: Referencing column 'customer_id' and referenced column 'id' in foreign key
         constraint 'invoices_customer_id_foreign' are incompatible. (errno 3780)
  Why:   invoices.customer_id is INT, but customers.id is BIGINT UNSIGNED.
  Fix:   use t.foreignId('customer_id').constrained('customers'), which matches t.id().
         database/migrations/2026_11_14_101544_create_invoices_table.ts:9

  MySQL can't roll back schema changes, so these operations were applied:
    ✔ create table invoices
    ✔ add column invoices.number
  Undo them with: node strut migrate:repair     (drops the half-created table)
```

On PostgreSQL and SQLite, the last block is replaced by `Nothing was changed (the migration ran in a transaction).`

Pre-flight lint warnings come before applying anything (P0):
- `Adding NOT NULL column "status" to "orders" (12,408 rows) without a default will fail. Add .default('draft') or make it nullable.`
- `Dropping column "posts.title" also removes it from the UI and API. It is used in resources/ui/posts.ui.ts:7.`

### 3.5 Validation messages (S12, S14)

These come from the catalogue (RFC-0003). `{attribute}` is the column label, the server and the client use the same text, and focus moves to the first error [admin §4.11].

- `Title is required.`
- `Title may not be longer than 200 characters (it has 214).`
- `Price must be a number with at most 2 decimal places.`
- `Status must be one of: Draft, Published.`
- `This slug is already taken by "Hello world".` The link to that record appears only when the viewer may view it.
- `Unknown field "isAdmin". Allowed fields: title, body, price, status.` This message is for API clients only, never shown in the UI.
- Bulk results: `3 of 5 posts deleted. 2 weren't allowed.`

### 3.6 Empty states and first run (S14)

| State | Example |
|---|---|
| A resource with no rows | Icon + `No posts yet` + `Posts you create appear here.` + **Create post**, shown only with `create` permission [admin §4.12] |
| Filters with no match | `No posts match "invoice" and Status = Draft.` + **Clear filters** |
| The first sign-in on a fresh app (dashboard, no resources yet) | A **welcome checklist** that ticks itself off from the app's state:<br>☐ Create your first table: `node strut make:migration create_posts_table --seeder`<br>☐ Add columns in `database/migrations/…_create_posts_table.ts`<br>☐ Run `node strut migrate`, and Posts appears in this sidebar<br>☐ Invite a teammate (with teams)<br>The checklist is hidden after the first resource exists and can be dismissed. |
| Error | `Couldn't load posts. Retry` with the `traceId` on 5xx. A 403 or 404 shows `Not found, or you don't have access.` |

### 3.7 Docs (docs)

- Every page starts with a copyable 30-second example, then explains the *why*.
- A "Coming from Laravel" box maps the page's concept (`Eloquent → ORM`, `php artisan → node strut`).
- Every error `code` has a page at `/docs/errors/<code>` with its causes and fixes. CLI and error-page messages link to it.
- Versioned per minor before 1.0 (`/docs/0.2/…`), with a version switcher and a banner on old versions.
- "Copy as Markdown" on every page, plus `llms.txt` and `llms-full.txt`.
- A **"Laravel → Strutvane" cheat sheet** generated from the command map [eco §0.3].

### 3.8 Agents (S13, docs)

- `create` writes `AGENTS.md` (and `CLAUDE.md` pointing to it) with the app's commands, layout and conventions, and the rule "columns only in migrations".
- The docs site has a `/for/agents` playbook, as Laravel's docs now do [eco §1.1].

### 3.9 Upgrade path (framework, docs)

- `npm run dev` notices a newer patch or minor at most once a day, with no telemetry and skipped offline: `Strutvane 0.2.3 is available (you have 0.2.1): npm install @strutvane/framework@0.2.3 …   Release notes: …`
- `node strut about` prints every `@strutvane/*` version and warns on a mismatched train.
- `node strut upgrade --check` lists owned files whose stub changed, with a unified diff per file.
- Deprecations are logged once per process: `Route.resource(..., { slug: true }) is deprecated and will be removed in 0.4. Use routeKey: 'slug'. See /docs/0.3/upgrade#route-key`.

### 3.10 Windows, macOS and Linux parity (S13, CI)

- CI runs the **e2e flow** (create → `make:migration` → `migrate` → `dev` → HTTP checks) on `windows-latest`, `macos-latest` and `ubuntu-latest`, under PowerShell, cmd and bash.
- `node strut` everywhere; no `.ps1`/`.cmd` shims; no parentheses or `?` in documented syntax [installer §1.6].
- Paths are joined with `node:path` and printed with forward slashes in messages.
- Generated files use LF with a `.gitattributes` entry. CRLF in user edits is tolerated by every parser.
- **Case-insensitive file systems:** generators refuse to create `Post.ts` next to `post.ts`, with a clear message.
- Watchers are tested on Windows (polling fallback for network drives).
- Docker detection covers the named pipe (Windows), the socket (macOS) and `docker.sock` permissions (Linux) [installer §3.4].
- Ports are probed on `127.0.0.1` and `::1`.

### 3.11 Accessibility

- **Generated UI:** WCAG 2.2 AA as a release blocker; axe checks in a real browser on every generated screen in CI, in both themes [admin §4.13].
- **CLI:**
  - every prompt works with a screen reader (no information conveyed by colour or spinner alone);
  - `--no-interactive` and `NO_COLOR` are respected;
  - an ASCII fallback for box drawing when the console can't render Unicode (old `conhost`).

### 3.12 i18n

- All UI strings, labels and validation messages come from catalogues (`lang/en/*.ts`, typed keys in P1).
- `Intl` formats numbers, money and dates in the user's time zone; logical CSS properties make RTL work.
- The locale comes from the user's preference, then `Accept-Language` [admin §4.13].
- CLI output is English only in 0.2, with every string kept in one module so it can be translated later.
- Labels are generated from table names (`invoice_lines` → "Invoice lines") and can be translated per locale without touching the migration.

---

## 4. "Advanced" features worth having

| # | Feature | Priority | Owner |
|---|---|---|---|
| 4.1 | End-to-end types: migration → model → request → response → client → form | P0 | S10, S11, S12, S14 |
| 4.2 | Generated typed API client | P0 | S12, S14 |
| 4.3 | OpenAPI 3.1 + `/docs` | P0 | S12 |
| 4.4 | Built-in tenancy + RLS | P0 | S11, `framework` |
| 4.5 | Policy-to-SQL | P0 | `framework`, `auth` |
| 4.6 | Audit log | P0 (auth and security events); P1 (record history) | `framework`, `ui` |
| 4.7 | Observability | P0 (correlation IDs); P1 (OTel); P2 (dashboards) | `framework`, `observability` |
| 4.8 | AI-agent playbooks and MCP | P0 (`AGENTS.md`, `llms.txt`); P1 (dev MCP); P2 (app MCP) | S13, `docs`, `agent-tools`, `mcp-server` |
| 4.9 | Realtime | P2 | `realtime` |
| 4.10 | Offline-first | P2 (drafts only); full offline sync: not recommended | `ui` |
| 4.11 | Live validation from the shared schema | P0 | S10, S14 |
| 4.12 | "Why was this denied?" | P0 (dev only) | `framework` |
| 4.13 | Migration safety lint + repair | P0 (lint, report); P1 (repair) | S10 |
| 4.14 | Generated attack-style tests | P0 | S12, S13 |
| 4.15 | Optimistic concurrency and idempotency keys | P1 | S12, S14 |

**4.1 End-to-end types.** Spike 10's replay is the single source: it already produces `Row`, `New`, `Patch` and `Json` per table plus `resources.json`. Extend the same pass to emit:
- (a) a Zod schema per table for create and update;
- (b) a route registry type (name → params → body → response);
- (c) the typed client (4.2).

Controllers get `request.validated()` typed from the form request, which extends the table schema. Responses are checked against `Json`. Owned UI files import the client and the form types, so a dropped column propagates as compile errors all the way to the page. Nothing in the chain is hand-maintained, and `node strut types --check` in CI fails on stale output (X6).

**4.2 Generated typed API client.** `.strutvane/client.gen.ts` is regenerated on `migrate` and on route changes in `dev`. Usage: `api.posts.list({ filter: { status: 'draft' }, sort: '-createdAt', include: ['author'] })`, typed from the resource's filterable, sortable and includable fields. It handles problem+json errors as typed results (`{ ok: false, problem }`), CSRF, `If-Match` (ETag) and cursor pagination. The UI's TanStack Query hooks wrap it. This is Laravel's Wayfinder plus Inertia props, without a Vite plugin; external clients use the OpenAPI document instead.

**4.3 OpenAPI 3.1 + `/docs`.** Generated from the same route registry and schemas (ADR-0019 covers the `/docs` page). Each operation lists:
- its policy ability (`x-strutvane-ability`);
- its errors by `code`;
- the query-parameter standard of [bp §5] as reusable components.

A conformance test validates every generated route's real response against the document. The document is public in development and behind a setting in production.

**4.4 Built-in tenancy + RLS.** Kept from v1 (ADR-0007), with the blueprint's per-engine split [bp §4]. The tenant id lives in `AsyncLocalStorage` and is set by the auth middleware from the current team. The ORM's global scope reads it, and on PostgreSQL the connection sets `app.tenant_id` for RLS inside the request transaction. It also flows to queued jobs, cache keys, storage prefixes, slugs and search. MySQL needs the mitigations in §2.10 (X2).

**4.5 Policy-to-SQL.** Kept from v1 (ADR-0008/0017). One policy method returns a boolean *or* a row predicate, so `view(post)` checks one record and `viewAny` filters list, count, aggregate, export and search in SQL. The selling line: "Laravel checks a record; Strutvane also filters the list." Owned policy files must stay readable; the predicate builder is the ORM's `where` API, not a separate DSL.

**4.6 Audit log.** P0 covers what v1 already does: auth events (sign-in, failure, 2FA, token creation, role change), with the actor, tenant, IP and request id. P1 adds record change history for generated resources: a diff of changed columns (hidden columns redacted) written in the same transaction, plus a "History" tab on the detail page. Retention is configurable, and the audit table is append-only (on PostgreSQL, enforced by a grant).

**4.7 Observability.**
- **P0:** every log line carries `request_id` and `trace_id` (kept from v1); 5xx error pages show the `traceId`; slow-query warnings in development log the SQL and the call site.
- **P1:** OpenTelemetry spans around HTTP, the database, the queue, mail and the HTTP client, no-op until an exporter is configured.
- **P2:** the self-hosted metrics dashboard (`observability`) and per-tenant usage [cat §5].

**4.8 AI-agent playbooks and MCP.**
- **P0:** a generated `AGENTS.md`, `/for/agents`, `llms.txt`, "Copy as Markdown" on the error page and the docs, and machine-readable CLI output (`--json` on `route:list`, `model:show`, `migrate:status`, `about`). These are cheap and make agents effective from day one.
- **P1:** pull a **minimal dev-only MCP server** forward from `agent-tools` (phase 3 [cat §7]). It exposes `route:list`, `model:show`, `migrate:status`, the last 50 log lines, versioned docs search, and a read-only database query run inside a rolled-back transaction under the RLS session. Laravel Boost does this and Laravel ships an official `laravel/mcp` package ([packagist.org/packages/laravel/mcp](https://packagist.org/packages/laravel/mcp), read 2026-11-14; version not checked).
- **P2:** `mcp-server` exposes the *app's* resources to agents through the same controllers and policies.

**4.9 Realtime.** P2. It is valuable for B2B admin screens (a list updates when a teammate edits a row; presence on a record), but it needs the queue and a broadcaster. The design rule for later: channel authorization reuses policies, channel names are tenant-scoped by construction, and broadcast payloads go through the same `Json` serializer with hidden fields removed [cat §5 product add-ons]. Until then, `ui` uses ETag-based refetch on window focus, which is free with TanStack Query.

**4.10 Offline-first.** Not recommended as a framework feature. B2B admin apps are online, authorization and tenancy are server decisions, and offline writes create conflict-resolution UX that a generator can't make correct in general. Keep what [admin §4.12] already specifies: an offline banner, disabled actions and **form drafts kept locally** (P1). Revisit only if a customer use case appears (field-service apps, say), as a separate package built on ETags and an outbox.

**4.11 Live validation from the shared schema.** The Zod schema from 4.1 runs in the browser on blur and submit, giving instant messages with no round trip (better than Precognition's request per field [eco §9.1]). The server always re-validates. Checks that need the database (`unique`, `exists`, slug collisions) run only on submit, or through a debounced `POST /:res/validate` that returns 422 issues without writing (P1).

**4.12 "Why was this denied?"** In development, a 403 problem includes `x-debug.policy`: the ability, the policy file and line, and the predicate that failed (for example `post.authorId = user.id → false`). The error page renders it. Production never includes it. This is the most common question in an RBAC app and costs little, because the compiler already knows the rule. It is a slice of the planned `inspector` [cat §5].

**4.13 Migration safety lint + repair.** The replay knows each operation before it runs. The lint warns on:
- `NOT NULL` without a default on a non-empty table;
- a drop that looks like a rename;
- an index created on a large MySQL table without `ALGORITHM=INPLACE` *(advice, unverified per version)*;
- a drop of a column referenced by owned UI files.

In production, warnings block unless `--force` is set. The repair half is in X5.

**4.14 Generated attack-style tests.** `make:migration … create_x_table` writes `tests/feature/x.test.ts` with:
- list, show, create, update and delete happy paths;
- an unknown field → 422;
- unauthenticated → 401;
- no policy → 403;
- with teams: cross-tenant read, write, filter, include and search, each expected to return 404 or no rows.

This is how the MySQL tenant guarantee (X2) becomes a tested claim, not a promise.

**4.15 Optimistic concurrency and idempotency keys.** P1. `ETag` and `If-Match` are already in the standards [bp §5]; the UI shows `This post was changed by Asha 2 minutes ago. Review changes / Overwrite` on 412. `Idempotency-Key` on `POST` and bulk actions stores the result for 24 hours.

---

## 5. Ranked top 15 to build into 0.2, beyond the blueprint

Each item is small (days, not weeks) and has one owner. The rank is by impact on the first hour of use, then by how much it differentiates Strutvane from Laravel.

| Rank | What | Why it matters | Owner | Size *(estimate)* |
|---|---|---|---|---|
| 1 | **Testing kit + generated feature and attack tests per resource** (transaction per test, per-worker database on the app's engine, `actingAs`, `asTenant`, HTTP assertions, `Mail.fake`) | Closes the only "No" in §1, and turns the MySQL tenancy claim into tests (X2, X4) | `framework` (S12), S13 | 4–6 days |
| 2 | **Typed relation loading + a dev N+1 detector** | Makes N+1 a compile error, the clearest "better than Laravel" demo | S11 | 3–4 days |
| 3 | **Per-table Zod schema from the replay, shared by form requests and UI forms** (live validation) | One validation source; Precognition without a round trip | S10, S12, S14 | 3–4 days |
| 4 | **Generated typed API client** (`.strutvane/client.gen.ts`) used by the generated pages | End-to-end types with no Wayfinder-style extra | S12, S14 | 3–5 days |
| 5 | **Minimal mail core** (SMTP + `log` transport) and a **dev inbox** at `/_strutvane/mail` | Password reset and verification are 0.2 features (X3) | `framework`, `auth` | 3 days |
| 6 | **Friendly error catalogue:** a solution line for every `code`, CLI messages in the what/why/fix/docs format, the error page sections of §3.3, docs pages per code | "Friendly" is mostly error text | `framework`, `docs` | 4 days, then ongoing |
| 7 | **Migration UX:** `--pretend`, `--step`, the pre-flight lint, honest partial-apply reporting on MySQL (X5) | The first error most users hit is a migration error | S10 | 3 days |
| 8 | **Typed writable subset + name-based guard/hide heuristics** (`password`, `*_token`, `is_admin`, `role*`, `tenant_id`) | Mass assignment and leakage safe by default | S11 | 2 days |
| 9 | **`doctor` and `model:show`** (Node ≥ 24.3, Docker, ports, env schema, pending migrations, stale generated files, unregistered packages, `public: true` routes, raw SQL with teams on MySQL; `model:show` from `resources.json`) | One command answers "why doesn't it work?" | S12, S13 | 3 days |
| 10 | **Teams-safe installer defaults:** pre-select PostgreSQL when teams = Yes; the MySQL note; the `testing` database created next to the dev database | Secure by default on the default path (X2) | S13 | 1 day |
| 11 | **"Why denied?" policy explanation in dev 403s** and on the error page | The most common RBAC question, almost free | `framework`, `auth` | 2 days |
| 12 | **Production shape:** `node strut build` → `build/server.js`, `/up`, graceful shutdown, `migrate --force --isolated`, JSON logs; one deploy recipe | "Deploy is just Node" beats PHP-FPM ops | `framework`, `docs` | 3 days |
| 13 | **First-run welcome checklist** in the generated UI plus the empty states of §3.6 | The first screen teaches the flow | S14 | 2 days |
| 14 | **Agent kit:** generated `AGENTS.md`, `/for/agents`, `llms.txt`, `--json` on inspect commands, "Copy as Markdown" | Laravel's "agent-first" docs are now table stakes | S13, `docs` | 2 days |
| 15 | **Upgrade basics:** `about` with train-mismatch warning, `upgrade --check` (a diff of owned files against new stubs), `UPGRADE.md`, a 0.x support policy, the update notice in `dev` | Answers Laravel's starter-kit churn before users ask | `framework`, `docs`, S14 | 2–3 days |

**Also decide before 0.2 (no build cost):**
- the X1 command naming;
- the X6 generated-types location;
- `engines.node >=24.3` (X7);
- the OpenAPI and typed-client rows in [bp §5] (X8).

---

## Sources

- Strutvane documents listed at the top (all dated 2026-11-14); Laravel facts via [eco], which cites `laravel.com/docs/13.x` and the `laravel/*` sources read 2026-11-14.
- Laravel strict mode and lazy-loading guards: [Laravel News, "shouldBeStrict"](https://laravel-news.com/shouldbestrict); [Laravel Daily tip on disabling lazy-loading prevention in tests](https://laraveldaily.com/tip/disable-lazy-loading-when-running-your-tests) (both read 2026-11-14).
- Laravel Shift, the paid automated-upgrade service that shows the size of the upgrade problem: [laravelshift.com](https://laravelshift.com/) (read 2026-11-14; pricing not relied on).
- Laravel MCP: [packagist.org/packages/laravel/mcp](https://packagist.org/packages/laravel/mcp), [github.com/laravel/mcp](https://github.com/laravel/mcp) (read 2026-11-14; version not checked).
- MySQL implicit commit on DDL: MySQL Reference Manual, "Statements That Cause an Implicit Commit" *(prior knowledge; not re-read for 8.4)*.
- Laravel maintenance mode (`artisan down`/`up`) and `phpunit.xml` SQLite defaults: *(prior knowledge, unverified for 13.x)*.
