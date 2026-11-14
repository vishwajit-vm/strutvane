# Current-state audit: from "Strutvane ecosystem" to a Laravel-style TypeScript framework

- **Date:** 2026-11-14
- **Type:** research / gap analysis (read-only audit; nothing in any repo was changed)
- **Trigger:** the owner tried Strutvane end to end (`C:\personal_projects\demo-strutvane-project`) and judged it far too complicated. The goal is a rebuild that works like Laravel (MVC, one main framework, artisan-style CLI) on TypeScript/npm, keeping the solid parts.
- **New hard requirement (same day):** **npm (classic) everywhere**: generated projects, documented commands (`npm create …`, `npm run …`, `npx …`) and the framework's own repos and tooling. No pnpm, no Corepack. See §F.
- **Inputs read:** hub `CLAUDE.md`, docs 00, 04, 05, 06, 07, 08 (headings), 09 (headings), 10 (headings), 14, 17; ADR-0001…0019 (decision sections); RFC-0001…0004 (status); every package repo under `packages/` (src trees, package.json, git logs, key files); `create-strutvane/src` (prompts, options, post, next-steps, package-manager, release-channel, templates); `playground/ISSUES.md` (28 issues from building Northwind Ops); the demo project's generated files.
- **Numbers** are from `wc -l` on non-test `src/**/*.ts(x)` and a grep of `it(`/`test(` calls (an `it.each` counts once), taken on 2026-11-14. Treat them as approximate.

---

## Summary (read this if nothing else)

1. **The code is good; the shape is wrong.** About **59k lines of source and 42k lines of tests (~1,900 test cases, plus 419 spike tests)** across 10 package repos, all strict TypeScript, documented with failure scenarios, security-reviewed, with a regression test per fix. That quality is worth keeping.
2. **The complexity comes from five design choices, not from bugs:** (a) the *model* is the source of truth and migrations are diffed from it; (b) a static-analysis *registry compiler*; (c) *runtime* metadata-driven CRUD and UI with levels L0–L3 and a three-way-merge *eject* path; (d) a *polyrepo* of 12 repos joined only through contracts, tokens, hooks and installers; (e) a *staged pre-release channel* (`@next`) with a placeholder on `latest`.
3. **Of the 28 playground issues, about 17 are symptoms of that shape** (split security across packages wired by hooks, black-box CRUD that custom code could not reach, identity split from the app, docs promising unbuilt features). About 11 are ordinary bugs. Of the 11 demo pain points, 9 trace back to the shape or to pnpm.
4. **Several big pillars are built but unused or unfinished:** no first-party package ships an installer (the devkit installer protocol is exercised only by tests), `eject` doesn't exist (the merge engine only backs `sv upgrade`), and MySQL, Azure Entra, magic-link/social sign-in, queue, cache, mail and OTel are **offered in the starter's prompts but not implemented**.
5. **Verdict:** keep the kernel, security, tenancy, error, logging, storage, HTTP-hardening and testing code. Move it into **one `@strutvane/framework` package in one npm-workspaces monorepo**. Rework the model, CRUD, UI and CLI into Laravel's MVC flow (migration-first, generated owned controllers and pages). Retire the registry compiler, field-spec CLI parser, merge engine, launcher, release-channel logic and polyrepo tooling, marked obsolete rather than deleted.

---

## A. Inventory

### A.1 Package by package

| Repo / package | What it does today | Src LOC | Tests (files / cases) | Quality notes | Laravel analogue |
|---|---|---:|---:|---|---|
| **contracts** `@strutvane/contracts` | Types and wire protocols only: `Actor`, `Problem`, `QueryFilter` AST, `ListQuery`, `ResourceManifest`, HTTP hook payloads, `Installer`, `FieldType`, `StorageDisk`, `Logger` | 1,293 | 3 / 10 | Clean, zero deps; mostly types, so few tests are needed | `Illuminate\Contracts` |
| **core** `@strutvane/core` | Kernel: `createApp` lifecycle, typed DI container (scopes, disposal), providers, deep-frozen typed config, Standard-Schema env validation, AsyncLocalStorage context, hooks, in-process events, errors → RFC 9457 `Problem`, ICU message catalogs, default redacting logger, UUIDv7, clock | 2,770 | 9 / 121 | Strong and small. Hardened (prototype-key 500 fixed, `24478d0`) | `Illuminate\Container`, `Foundation\Application`, `Support\ServiceProvider`, `Config`, `Translation`, exception handler |
| **framework** `@strutvane/framework` | `defineModel` + `field.*` DSL (1.2k); migration planner over **drizzle-kit** diff + migrator (checksums, advisory lock, drift, package migrations) + RLS DDL (1.5k); repository + `QueryFilter` bind/compile/sort/cursor (1.7k); Hono HTTP app, auto resource routes, list-query parser, custom `route.*`, security headers, proxy trust, static/UI serving (2.7k); OpenAPI 3.1 + script-free `/docs` + manifest (0.6k); streaming multipart, disks, signed URLs, tenant disks (1.3k); runtime: boot, serve, `sv dev` with Vite middleware on one port, seeders (1.7k); testing: `createTestApp`, `defineFactory` (0.7k) | 12,904 | 27 / 275 | Feature-rich and hardened by 15+ fixes. Tests run on real Postgres (PGlite) and SQLite. **Missing vs spec:** MySQL (throws `NotImplementedError`), schema builder for hand-written migrations, queue, cache, mail, events/outbox, `db:pull`, eject, query builder/ORM | `illuminate/database` (migrations, schema), `illuminate/http` + `routing`, `illuminate/filesystem`, `illuminate/pagination`, `Foundation\Testing`. The auto CRUD is closer to Laravel's `apiResource` + Filament/Nova than to anything in core Laravel |
| **auth** `@strutvane/auth` | Identity through an `IdentityEngine` adapter: **Better Auth** (766) and a **native** engine (560), plus rate limits and the app identity store (2.0k total); policy DSL compiled to SQL, role map, field rules (2.7k); tenancy resolver + Postgres RLS helpers, `withTenant`, RLS lint (1.0k); audit (0.2k); Hono/Node/core middleware; admin API; CLI commands; adapter **contract test kit** | 8,450 | 21 / 272 | The most security-critical code, and well tested (contract suite run on both engines). Hardened: field rules, tenant switch, session fixation, proxy trust | Fortify + Sanctum (identity, tokens), Gates/Policies (but far stronger: compiled to SQL), Spatie Permission (roles), Stancl Tenancy / Spatie Multitenancy, Spatie Activitylog (audit) |
| **ui** `@strutvane/ui` | Framework-free `core` (HTTP client, problem/issue mapping, list-query URL codec, filter builder, validation, messages, session client) and React renderer: `StrutvaneApp` shell (sign-in, workspace switcher, menu, routing), `ResourceList` / `Form` / `Detail`, `FilterBar`, widgets, cells. **Renders everything at runtime from `/.well-known/strutvane.json`** | 5,498 | 17 / 183 | Solid accessibility and error mapping. Decimals and CSS specificity fixed (`efaf12e`). No owned page files: the developer cannot open a "Posts list page" file | Filament / Nova (runtime admin from resource metadata); Breeze/Jetstream screens for auth |
| **cli** `@strutvane/cli` + **launcher** `strutvane` | Command framework (parser, router, help, output, exit codes, prompter, errors; 2.3k); `make:*` generators + **field-spec parser** (708) + seeder auto-registration (2.1k); **registry compiler** using oxc-parser static analysis, emit, watch (2.0k); project detection, env check, plugin/package-migration gate, release channel (1.3k); `add`, `remove`, `upgrade` (three-way merge), `doctor`, `routes`, `models`, `permissions`; a separate global launcher (584) | 10,487 | 22 / 339 | Very defensive (Windows `.cmd` shim handling, ownership checks, symlink-safe contributions). Large for what a user sees | `artisan` (`Illuminate\Console`) + stubs. The launcher has no Laravel analogue (`laravel new` is the installer, not a proxy) |
| **devkit** `@strutvane/devkit` | Installer and generator SDK: staged FS, journaled transaction with crash recovery, env editor, deps editor, config patcher, secret files, protected paths (2.6k); **three-way merge engine** (965) | 3,584 | 16 / 174 | High quality, but **no first-party package ships an installer** (only `auth` and `framework` declare `commands` / `migrations`), so the installer path is exercised only by tests. The merge engine backs only `sv upgrade` | Artisan stubs, `vendor:publish`, `install:api`; the merge engine is closer to Laravel Shift (external) |
| **logs** `@strutvane/logs` | Non-blocking structured logger with its own pipeline: redaction (keys + patterns), bounded priority queue, O_APPEND per-process daily files, retention, request and exception logging, Express/Hono/Node adapters, built-in viewer at `/_strutvane/logs` (tail, search, CSV; locked down) | 4,812 | 12 / 196 | Strong and independent. Viewer access rules hardened (`ccb1bb7`) | `Illuminate\Log` (Monolog) + Laravel Pail / opcodesio log-viewer / a slice of Telescope |
| **files** `@strutvane/files` | Cloud disks (S3, Azure Blob), file/image fields, records store, image variants (sharp), ClamAV scan, quotas, MIME inspection, retries, spool | 5,175 | 13 / 157 | Built ahead of schedule; only 5 commits; not exercised by the starter | `Storage` + Flysystem S3/Azure adapters + Spatie Media Library |
| **create-strutvane** | `npm create` starter: clack prompts (preset, DB, auth methods, tenancy, extras, Docker, package manager, git), validation, templates for the whole project (2.1k template LOC), git init, optional install, next-steps text, release-channel logic | 4,430 | 14 / 179 | Well tested. **Defaults: `pnpm`, `install: false`**. Offers options that aren't implemented (§B.12) | `laravel new` / `composer create-project laravel/laravel` |
| **tooling** | Canonical tsconfig/biome/vitest, CI/release/scorecard workflows, Dependabot, `sync.mjs` with a drift check across all repos, `publish-if-new.mjs` (staged publishing), dependency boundary check | scripts only | 3 test files | Exists only because of the polyrepo | n/a (Laravel uses one monorepo + split) |
| **docs** | Starlight docs site | ~0 TS | none | Content follows the current design | laravel.com/docs |
| **hub** | Blueprint docs 00–17, ADR 0001–0019, RFC 0001–0004, research, 9 spikes (419 tests), `setup-workspace.mjs`, `e2e-local.mjs`, playground | ~6.2k doc lines | spikes: 419 | Thorough, but the spec runs well ahead of the implementation | n/a |

**Totals:** about **59k source LOC** and **42k test LOC** (~1,900 test cases) in 10 package repos, 12 repos counting tooling and docs. Every package is `0.1.0-next.0`. Nothing real is on npm: `latest` is a name placeholder, and pre-releases are staged and need manual 2FA approval (ADR-0018).

### A.2 Concept map: Strutvane today vs Laravel

| Laravel concept | Strutvane today | Gap |
|---|---|---|
| `laravel new app` (one command, working app) | `npm create strutvane@next` + install + `services:up` + `sv migrate` + `sv db:seed` + `pnpm dev` | 5–6 commands; `@latest` broken |
| `php artisan` | `pnpm sv` → `strutvane-cli` (plus a separate global launcher) | `sv` is a built-in PowerShell alias (`Set-Variable`); pnpm-specific spelling |
| `make:migration create_posts_table` → columns in the migration | `make:model Post title:string …` → fields in the model; `sv migrate` diffs and writes SQL | Inverted source of truth |
| `make:model Post -msf` (migration, seeder, factory) | `make:model` writes model, policy, factory, seeder, test; seeder auto-registered (since `349201c`) | Close, but driven by CLI field specs |
| Blueprint `$table->string('title')` | No schema builder. Hand-written migrations get `db.execute(sql)` only (spec 06 §3.2 promises `schema.alterTable`, not built) | Missing |
| Eloquent models (`Post::where()->paginate()`, relations, casts, `$fillable`, `$hidden`) | `defineModel` metadata + `Repository` returning `Record<string, unknown>`; no fluent query builder, no model instances, no relation methods | Missing |
| Controllers (`make:controller --resource`, `--api`) | No controllers. CRUD is auto-registered at runtime; custom code goes into `route.*` handlers or resource hooks | Missing (the user's main ask) |
| Form Requests (validation) | Zod schemas derived from the model at runtime | Not owned or visible |
| API Resources (transformers) | `resource.serialize` hook + field visibility | Not owned or visible |
| `routes/web.php`, `routes/api.php` | `app/http/routes/*.ts` (custom only) + auto CRUD + compiled registry | No single routes file to read |
| Middleware (`bootstrap/app.php`) | Global pipeline in `create-http-app.ts`; no app-level middleware API in the starter | Partial |
| Gates / Policies | `definePolicy` rules compiled to SQL + role map in `config/auth.ts` | **Stronger than Laravel**; surface differs |
| Auth scaffolding (Breeze) | `StrutvaneApp` sign-in screen; identity tables owned by the auth package; "no User model" | No `User` model or `users` migration in the app |
| Seeders / factories | `defineSeeder`, `defineFactory`, `related()` reuses seeded parents (since `2451dda`) | Close |
| Queues, cache, mail, events, scheduler | Specified, offered in the starter, **not implemented** | Missing |
| Storage | Local + memory disks in framework; S3/Azure in `files` | Good |
| Logging + viewer | `@strutvane/logs` | Good (better defaults than Laravel) |
| Exception handler + JSON errors | RFC 9457 `Problem` + catalogs | Good |
| Telescope / Horizon / Pulse | Logs viewer only | Partial |
| `php artisan serve` + Vite | `sv dev` with Vite middleware on one port (since `bfefa42`) | Good now |
| `laravel/framework` monorepo split into read-only `illuminate/*` packages (unverified, from memory) | 12 independent repos, link overrides for local dev | Inverted |

---

## B. Where the design diverges from the Laravel flow, and what each costs the user

### B.1 The model, not the migration, is the source of truth (D4, D5, ADR-0003, ADR-0009)

- **Today:** `app/models/*.model.ts` (`defineModel` + `field.*`) drives everything. `sv migrate` diffs models against a `snapshot.json` using **drizzle-kit**, writes a timestamped `.sql` file (`…_auto.sql`) and applies it. Renames must be resolved interactively (ADR-0009).
- **Laravel / target:** `make:migration create_posts_table` writes a migration; the developer writes columns there; the model is a thin class.
- **Cost to the user:**
  - They have to learn a field DSL with 30+ types and 20+ modifiers before they can make a table.
  - Migration files are auto-named `…_auto.sql`, so the history is unreadable.
  - Rename prompts interrupt `migrate`.
  - `drizzle-kit` bundles **esbuild**, whose install script is what triggered pnpm 12's `ERR_PNPM_IGNORED_BUILDS` (demo pain point 2; the generated `pnpm-workspace.yaml` says so).
  - Field specs passed on the command line (`enum(draft,paid)`) broke inside Windows `.cmd` shims (pain point 5). Fixing that took a 708-line parser with a bracket syntax.
- **Symptom or bug:** architectural. Pain points 2 and 5 vanish if columns are written in a migration file and drizzle-kit leaves the runtime.

### B.2 Static-analysis registry compiler (D7, ADR-0010)

- **Today:** oxc-parser reads `app/**` without executing it and writes `.strutvane/registry.gen.ts`. It powers models, policies, routes and typed permissions. Names must be **string literals**. There are a watch mode, `registry:build`, `registry:watch` and `registry:check` (2.0k LOC).
- **Laravel:** routes are code in `routes/*.php`; models are classes loaded on use; nothing is compiled.
- **Cost:**
  - A hidden build step the user must keep fresh. A stale registry needed a "catch-up rebuild" fix (`8ad6be5`).
  - Literal-only restrictions, which are surprising.
  - One more generated folder to explain.
  - Type safety for permission strings is nice but not worth the concept.
- **Replacement:** explicit `routes/api.ts` / `routes/web.ts`, plus runtime discovery of models, policies, seeders and commands by folder at boot (a cached `readdir` + dynamic `import`). Generate types from the **database schema** after `migrate` (§D.4), not from user code.

### B.3 Runtime metadata-driven CRUD and UI, levels L0–L3, three-way merge (D6, ADR-0003, ADR-0012, ADR-0014)

- **Today:** CRUD routes and every UI page are produced **at runtime** from model metadata (`resource-routes.ts`, `/.well-known/strutvane.json`, `StrutvaneApp`). Customisation goes L1 options → L2 hooks/overrides → L3 eject with three-way merge on upgrade. **`eject` isn't implemented.** The 965-line merge engine backs only `sv upgrade`.
- **Laravel / target:** generated **files** (controller, request, resource, routes entry, pages, sidebar entry) that the developer owns and edits directly.
- **Cost:**
  - The user can't open "the posts controller" or "the posts list page", because they don't exist.
  - Custom behaviour had to go through hooks, and hooks couldn't reach other models, repositories or storage. Playground #4 and #7 needed framework changes before a dashboard or a "mark paid" action could be written.
  - Four "levels" plus a merge engine is a lot to explain, and the promised escape hatch is missing.
- **Keep the engine, change the surface:** the runtime CRUD code (list query, filters, search, cursor/offset pagination, field visibility, problem mapping) becomes the *implementation* behind generated thin controllers (`class PostController extends ResourceController<Post>`) and generated pages that import `@strutvane/ui` components. That is "owned code" without regeneration conflicts.

### B.4 Polyrepo: 12 repos, link overrides, synced tooling (D17, ADR-0002)

- **Today:** one GitHub repo per package; a git-ignored umbrella folder; packages pin **exact published pre-release versions** of each other (`0.1.0-next.0`). Local integration needs pnpm `overrides` to `file:` checkouts (`scripts/e2e-local.mjs`). Shared config is copied into every repo by `tooling/scripts/sync.mjs` with a drift check. Ten `pnpm-workspace.yaml` files, ten CI pipelines, ten release pipelines.
- **Laravel:** one `laravel/framework` monorepo (split into read-only `illuminate/*` packages) plus a handful of optional first-party packages (unverified, from memory).
- **Cost to the maintainer, and through them to the user:**
  - A cross-cutting fix (for example playground #1: auth field rules plus a framework hook) is several commits in several repos and several staged publishes.
  - Version skew between packages.
  - Users depend on 5–6 `@strutvane/*` packages that must move in lockstep.
  - The fixes from the playground are on GitHub `main` but **not on npm** (versions unchanged), so `npm create` users still get the old bugs.

### B.5 Contracts-only integration, "product packages never import each other" (D23, integration map, CLAUDE.md working rules)

- **Today:** framework, auth, ui and files talk only through contracts, container tokens, hooks, events, installer `enhances` and the HTTP manifest. Authorization lives in auth; enforcement lives in framework.
- **Cost:** a whole class of security bugs came from this seam:
  - #1: field read/write rules silently not enforced, because auth never registered the handler for framework's serialize hook.
  - #2: hook refusals became 500s.
  - #11: a record-less `can()` meant `own: true` grants and `when:` rules never worked on show/update/delete.
  - #16 and #18: the manifest disagreed with the API.

  Each passed both packages' unit tests and failed only when composed.
- **Laravel:** Gates and Policies are part of the framework; `authorize()` in the controller gets the model instance.
- **Change:** authorization, tenancy and audit move **into the framework**, called directly by the CRUD/controller code. The QueryFilter → SQL compiler stays; the cross-package hook wiring goes.

### B.6 Identity as a separate store behind an adapter, and "no User model" (D12, ADR-0005, ADR-0013, commit `dee09d9`)

- **Today:**
  - Two identity engines (Better Auth default, native fallback) behind `IdentityEngine`.
  - The tables are shipped as a **package migration** applied by `sv migrate` (which needed a whole vetting gate, #28).
  - The app has no `User` model. The demo still has one, generated before `dee09d9`, which is "unrelated to the identity store" (#23).
- **Cost:**
  - Identity was in memory for a while (#8, demo pain point "lost on restart").
  - A second port needed a `trustedOrigins` edit (because of Better Auth's origin check).
  - The user can't add a column to users the Laravel way (edit the `users` migration and `User` model).
  - #17 and #20 were Better Auth semantics leaking through the adapter.
- **Change:** one default engine (the **native** one, built on argon2id/jose: smaller, already contract-tested). The `users`, `sessions` and `password_reset_tokens` migrations are **published into the app** like Laravel's, with an app-owned `User` model. Better Auth becomes optional (social/OIDC) or is retired.

### B.7 Staged releases on a `next` channel, placeholder on `latest` (D18, ADR-0016, ADR-0018)

- **Cost:**
  - `npm create strutvane@latest` fails ("could not determine executable": demo pain point 1).
  - The starter, launcher and CLI each carry release-channel logic (`release-channel.ts`, `project/channel.ts`).
  - pnpm's minimum-release-age then had to be bypassed (`minimumReleaseAgeExclude`).
  - Every release needs manual 2FA approval of N packages.
- **Change:** one lockstep version for the monorepo. Publish real `0.x` versions to `latest` (pre-1.0 semver already signals instability). Keep OIDC trusted publishing with provenance. Keep staging optional: one approval per release train, not per package.

### B.8 Many commands where one should do (docs 05 §1 vs reality)

- **Today:** `npm create strutvane@next` (default `install: false`) → `cd` → `pnpm install` → `pnpm services:up` → `pnpm sv migrate` → `pnpm sv db:seed` → `pnpm dev`. Docs 05 already names "a single `pnpm sv up`" as the target, but it isn't built.
- **Change:** `create` runs install, Docker up (`--wait`), migrate and seed itself, and offers to start the dev server. `migrate` seeds when seeders are pending (§D.3).

### B.9 Global launcher + project CLI + `sv` script

- **Today:** an unscoped `strutvane` launcher delegates to the project-local `@strutvane/cli`, exposed as the `sv` package script (`"sv": "strutvane-cli"`), so users type `pnpm sv …`. With npm this is `npm run sv -- make:model …`, which is clumsy. In PowerShell, `sv` is a built-in alias for `Set-Variable` (pain point 9).
- **Change:** the framework package ships the bin. Users run `npx strutvane <command>` (npx resolves the project-local bin), with an optional short bin name that isn't a shell builtin. Drop the launcher.

### B.10 Installer protocol and `sv add` (docs 04 §7, D23 mechanism 5)

- **Today:** a complete transactional installer SDK (devkit), but **no package has an installer**. The starter templates do all the setup instead, so `sv add auth` installs the dependency and says "nothing else to do".
- **Change:** in a monolith, optional features are `install:*` commands of the framework (Laravel's `install:api` / `install:broadcasting` model), built on devkit's staged FS and env editor. The protocol and `enhances` matrix go.

### B.11 Spec far ahead of code

Docs 04/05/06 describe queue, cache, mail, outbox, `db:pull`, `eject`, `sv tinker`, Express/Fastify/Nest adapters, schema-per-tenant, export, bulk and saved views. Playground #6, #19, #21 and #22 were "the docs promise X, X is a 404". The redesign should cut the spec to what is built plus a short roadmap.

### B.12 The starter offers choices that don't work

| Offered in prompts | Status in code (2026-11-14) |
|---|---|
| MySQL, Azure Database for MySQL | `connect.ts` throws `NotImplementedError` |
| Azure PostgreSQL passwordless (Entra) | throws "not implemented yet" |
| Magic link, Google, Microsoft, GitHub sign-in | Only a `methods` config key in `auth/src/config.ts`; no implementation found in auth `src` |
| Queue, Cache, Mail, OpenTelemetry extras | No implementation found in framework/core/logs `src` |
| UI-only preset against any OpenAPI | Manifest-driven only; OpenAPI inference not found |
| yarn, bun package managers | Templates exist, but only pnpm is exercised by `e2e-local.mjs` |

**Cost:** a new user can pick a combination that fails at first boot. The redesign should offer only what works: PostgreSQL and SQLite, email + password, with or without UI, Docker or not.

### B.13 Tenancy with RLS needs two database roles

ADR-0007 rule 4 (runtime role is never the table owner) is correct and should stay. Today it shows up as a manual setup in the playground (`northwind_owner` migrates, `northwind_app` serves). The redesigned `create` must provision both roles automatically (Docker init script, or a `db:setup` step for an existing server), or tenancy stays expert-only.

### B.14 Playground ISSUES.md classified: architecture vs plain bugs

| Class | Issues | Lesson for the redesign |
|---|---|---|
| **Seam between packages** (auth ↔ framework via hooks, tokens, manifest) | #1, #2, #11, #16, #18, #28 | Put authorization, tenancy and the manifest in one package and call them directly. Fewer seams, fewer silent no-ops |
| **Black-box CRUD, custom code second-class** | #4, #7, #9, #10, #13 | Generated controllers and an Eloquent-like model with typed queries remove the need for hook plumbing and type gymnastics over a metadata DSL |
| **Identity split from the app** | #8, #17, #20, #23 | App-owned `users` migration and `User` model; one default engine |
| **Promised but not built** | #5, #6, #19, #21, #22 | Spec only what exists; the starter and docs are generated from the same source as the code |
| **Plain bugs** (would happen in any design) | #3, #12, #14, #15, #24, #25, #26, #27 | Keep the fixes and their regression tests; they carry over unchanged |

That is about 20 architecture or process symptoms against 8 plain bugs. Applied to the owner's 11 demo pain points:

| Pain point | Class |
|---|---|
| `@latest` placeholder | release design (B.7) |
| pnpm `IGNORED_BUILDS` | pnpm + drizzle-kit (B.1, §F) |
| Too many commands | B.8 |
| `sv dev` didn't serve the UI | fixed (`bfefa42`); design (separate Vite server) |
| Static UI shell, no sign-in | fixed (`5e5023d`); B.3 / B.11 |
| Parentheses broke on Windows | B.1 |
| Seeders not registered | fixed (`349201c`); in a Laravel design `--seeder` registers by construction |
| Factories created a parent per row | fixed (`2451dda`); plain bug |
| PowerShell `sv` alias | B.9 |
| Identity in memory | fixed (`188fa73`); B.6 |
| `trustedOrigins` for a second port | B.6 + two-port dev |

---

## C. Reuse verdicts

**Legend:**

- **KEEP:** use as-is.
- **MOVE:** keep the code, move it into the monorepo or framework, with path and import changes only.
- **REWORK:** keep the tested internals, change the public surface.
- **RETIRE:** mark obsolete (README banner + ADR "Superseded"), archive the repo or folder, don't delete.

### C.1 Strong parts to preserve (non-negotiable)

1. **Security hardening across the HTTP edge** (framework `http/`): security headers, CORS, body limits, `TRUST_PROXY` hop counting, problem+json everywhere, NUL/blank-text refusal, the prototype-key fix, bounded drain of abandoned bodies, port-bind errors, deny-by-default routes (`public: true` opt-in).
2. **RLS tenancy** (ADR-0007's five rules, `framework/migrations/rls.ts`, `auth/postgres/*`, `withTenant`, RLS lint): RESTRICTIVE + FORCE policies, `NULLIF(current_setting…)`, transaction-local `set_config`, non-owner runtime role. Plus the cross-tenant tests ("no cross-tenant rows leak by id, filter, include, query or references").
3. **Policy → SQL compiler with two-valued NULL-safe semantics** (ADR-0008, ADR-0017; `auth/policy`, `auth/sql`, `framework/query`): fail-closed allow rules, one bind step for both the in-memory and SQL paths, field read/write rules, `filterableFields`.
4. **One error model** (RFC-0003; core `errors/`, `messages/`): `Problem` with stable `code` and `issues`, ICU catalogs, the 16 form-failure categories, UI issue-to-field mapping (`ui/core/problems.ts`, `issues.ts`).
5. **Logging** (RFC-0004, ADR-0015): redaction before storage, bounded queue, per-process files, a locked-down viewer.
6. **Uploads** (RFC-0002): streaming multipart with limits enforced while bytes arrive, magic-byte MIME, sha256, signed URLs, tenant key prefixing.
7. **Migrator runtime:** checksums, drift refusal, advisory lock, one transaction, `.ts` + `.sql` migrations, and the vetted package-migration gate (#28 lesson: never run SQL from an unvetted dependency).
8. **Identity hardening:** argon2id, constant-time reset, per-account and per-IP limits, session revocation on sign-in and password reset, the adapter **contract test kit**.
9. **Test suites:** ~1,900 cases, real Postgres via PGlite, type-level tests, regression tests per issue. They are the safety net for the move and should be moved with the code they test.
10. **Starter mechanics:** clack prompts with flag equivalents, name validation, `.env` + `.env.example` generation with secrets, git init, Windows-safe spawning.

### C.2 Module-by-module verdict

| Module | Verdict | Reason |
|---|---|---|
| **contracts** (`Problem`, `QueryFilter`, `ListQuery`, `Actor`, `TenantContext`, `StorageDisk`, `Logger`) | **MOVE** into `framework/src/contracts` (internal types, re-exported) | Still the right shapes. A separate zero-dependency package is no longer needed when consumers depend on the framework directly. `Installer`, `FieldType` and HTTP-hook payloads → **RETIRE** with the installer and manifest protocols |
| **core**: container, application, providers, config, env, context, errors, messages, clock, uuid | **MOVE** into `framework/src/foundation` + `support` | The Laravel kernel in TS; small and hardened |
| core: `hooks.ts`, `events.ts` | **KEEP but MOVE**; demote hooks to internal | Events stay (Laravel events). Hooks were the cross-package seam; the app-facing extension point becomes controllers, middleware, model events and observers |
| core: default logger | **MOVE** (merge with logs pipeline) | One logger implementation in the framework |
| framework `http/` (create-http-app, security, proxy, errors, list-query, static-files, ui-paths, docs-page) | **KEEP** (move) | Proven, hardened |
| framework `http/resource-routes.ts`, `resource.ts` | **REWORK** into `ResourceController` base class + `Route.resource()` | Same pipeline (validate → authorize with the record → tenant scope → hooks → audit → serialize), surfaced as owned controller files |
| framework `http/route.ts` (custom routes) | **REWORK** into the router (`routes/api.ts`, `Route.get(path, [Controller, 'method'])`) | Keep typed params, deny-by-default, OpenAPI documentation of custom routes |
| framework `model/` (`defineModel`, `field.*`, schemas, naming, policy-schema) | **REWORK** | Becomes a `Model` class (`table`, `fillable`, `hidden`, `casts`, `searchable`, relations) typed from the generated DB schema. Keep `naming.ts`, `sensitive-keys.ts`, the Zod schema derivation (now from column metadata) and `policySchema` typing |
| framework `migrations/planner.ts` + `schema/compile.ts` (drizzle-kit diffing, snapshot) | **RETIRE** (obsolete; keep in repo history) | Migration-first removes diffing. An optional `migrate:diff` assistant can come later |
| framework `migrations/migrator.ts`, `files.ts`, `rls.ts`; `runtime/migrations.ts`, package-migration gate | **KEEP** (move) | Runner, drift, lock and RLS DDL are independent of the source-of-truth choice |
| *(new)* schema builder `Schema.create('posts', t => …)` for pg + sqlite | **NEW** (reuse `rls.ts` DDL and Drizzle's or our own column DDL) | The user writes columns here |
| framework `data/repository.ts`, `query/*` (bind, compile, evaluate, sort/cursor, fields) | **REWORK** into a query builder / model layer (`Post.query().where().search().paginate()`); keep bind/compile/sort as its engine | Repository semantics (scope, soft deletes, tenant, includes) are right; records need to be typed instances, not `Record<string, unknown>` |
| framework `openapi/` | **KEEP** (move); manifest → **REWORK** (optional, only for the UI runtime helpers) | OpenAPI and `/docs` (ADR-0019) are good. The manifest stops being the source of the UI |
| framework `storage/` | **KEEP** (move) | — |
| framework `runtime/` (boot, serve, server, dev-ui with Vite middleware, seeders, database-config, app-env) | **KEEP** (move) and simplify boot to read `bootstrap/app.ts` | One-port dev is exactly the Laravel `serve` + Vite experience |
| framework `testing/` (`createTestApp`, `defineFactory`, `related()`) | **KEEP** (move); factories become `Post.factory()` | — |
| **auth** `policy/`, `sql/`, `field-rules.ts`, `roles` | **MOVE** into `framework/src/authorization` | Expose Laravel-like policy classes (`viewAny(user)`, `update(user, post)`) plus the SQL `scope()` for lists. Keep the DSL as the advanced form |
| auth `tenancy/`, `postgres/` (RLS, `withTenant`, lint, rate-limit store) | **MOVE** into `framework/src/tenancy` | Strong part |
| auth `audit/` | **MOVE** into framework | — |
| auth `identity/native.ts`, `engine.ts`, `limiter`, `rate-limit`, `app-identity` | **REWORK** into framework `auth/` with app-owned `users` / `sessions` migrations and `User` model; keep the contract test kit | One default engine |
| auth `identity/better-auth.ts` | **RETIRE** from the default path; optionally re-home as `@strutvane/better-auth` for social/OIDC later | Source of #17, #20 and the origin friction |
| auth `middleware/` (express, node, hono adapters), standalone mode | **RETIRE** (obsolete) for now | "Add auth to an Express app" isn't the Laravel goal |
| auth `commands.ts`, `admin.ts` | **REWORK** into framework commands (`user:create`, `tenant:create`, `tenant:member:add`) | — |
| **ui** `core/` (http-client, problems, issues, list-query-url, filter-builder, validation, messages, session-client) | **KEEP** (move) | Framework-free and well tested |
| ui `react/` components (ResourceList, ResourceForm, ResourceDetail, FilterBar, widgets, cells, FieldShell) | **KEEP** as the component library generated pages import | — |
| ui `StrutvaneApp` (runtime shell) | **REWORK** into an `AppLayout` (sidebar, sign-in, tenant switcher) driven by a generated `resources/ui/navigation.ts` | Owned sidebar entries instead of a runtime menu from the manifest |
| ui runtime manifest rendering | **RETIRE** as the primary path (keep as a fallback "admin auto mode" if wanted) | — |
| **cli** `framework/` (parser, router, help, output, exit codes, prompter, errors, services) | **MOVE** into `framework/src/console` (the artisan kernel) | Solid, and Windows-aware |
| cli `make/` generators, names, apply, seeder-registration | **REWORK** for `make:migration --seeder --factory`, `make:controller`, `make:crud`, … | Reuse templating, idempotency, `--dry-run`/`--diff`/`--force` |
| cli `make/fields.ts` (CLI field-spec parser) | **RETIRE** | Columns go in migration files |
| cli `registry/` (oxc-parser compiler, watch, emit) | **RETIRE** (obsolete) | Replaced by explicit routes, runtime discovery and schema-based typegen |
| cli `commands/upgrade.ts`, devkit `merge/` | **RETIRE** (obsolete, archived) | No regeneration of owned files. A future upgrade guide can be a separate tool |
| cli `project/` (detection, env-check, boundary, contributions, package-migrations gate, plugin-commands) | **KEEP**, simplified | Ownership and symlink safety stay; channel logic goes |
| cli `project/channel.ts`, create `release-channel.ts`, `cli/packages/launcher` | **RETIRE** | Real `latest` releases; one bin |
| cli `doctor`, `env:check`, `routes`, `about`, `key:generate` | **KEEP** (move) | Artisan staples |
| **devkit** staged-fs, transaction, env-editor, deps-editor, config-patcher, secret-files, paths, io, text | **MOVE** into `framework/src/console/support` (and the starter) | Used by `make:*`, `install:*` and `create` |
| devkit `installer.ts` protocol, `generator.ts` | **REWORK** into internal `install:*` commands | No external installer protocol needed |
| **logs** pipeline (redact, queue, files, transports, record, serialize, shutdown, http) | **MOVE** into `framework/src/log` (default logger) | Laravel's `Log` is in the framework |
| logs `viewer/` | **KEEP** as optional first-party `@strutvane/log-viewer` (installed by default in dev), or ship inside framework behind config | Keeps the default install lean |
| logs express/node adapters | **RETIRE** for now | Only the framework host matters |
| **files** | **KEEP** as optional first-party `@strutvane/files`, depending on `@strutvane/framework` directly | Cloud disks, variants and scanning are opt-in, like Laravel's Flysystem adapters |
| **create-strutvane** prompts, args, validate-name, env-spec, render, post (git), versions | **KEEP** (move into the monorepo) | — |
| create-strutvane templates, options (presets, extras, pm), next-steps, package-manager | **REWORK** | npm only; MVC layout; only working choices; run install, Docker, migrate and seed |
| **tooling** sync.mjs, per-repo canonical copies, `pnpm-workspace.yaml` parser | **RETIRE** | One monorepo has one config |
| tooling `publish-if-new.mjs`, `check-deps.mjs`, scorecard, Dependabot | **KEEP** (move to monorepo root, npm-based) | Supply-chain hygiene stays |
| **docs** site (Starlight) | **KEEP**, rewrite content | — |
| **hub** blueprint docs | **REWORK** (00, 04, 05, 06, 07, 08, 09, 10, 14, 17 rewritten); keep 12, 13, 15 | — |
| **spikes** 01–09 | **KEEP** as archived evidence (01, 04, 06 document retired approaches) | — |
| ADRs 0007, 0008, 0015, 0017, 0019 | **KEEP** | §E |

---

## D. Target: a Laravel-style TypeScript framework built from these parts (first cut)

### D.1 Package map (one monorepo, npm workspaces, lockstep versions)

```
github.com/<org>/strutvane            (one repo; the hub folds in as /docs)
├─ package.json                       "workspaces": ["packages/*"], private
├─ package-lock.json
├─ packages/
│  ├─ framework/   → @strutvane/framework   THE framework (bin: strutvane)
│  ├─ ui/          → @strutvane/ui          React admin kit: layout, list/form/detail components, Vite plugin
│  ├─ files/       → @strutvane/files       optional: S3/Azure disks, image variants, ClamAV, quotas
│  ├─ log-viewer/  → @strutvane/log-viewer  optional: /_strutvane/logs (default in new apps)
│  └─ create/      → create-strutvane       the starter (npm create strutvane)
├─ docs/           blueprint + ADRs + RFCs + research (hub content)
├─ site/           Starlight docs site
├─ spikes/         archived evidence
└─ .github/        one CI, one release workflow (npm)
```

`@strutvane/framework` internal layout (Laravel's `Illuminate` namespaces, TS-cased):

```
src/
  foundation/     application, container, providers, config, env, context      (from core)
  support/        str (slug, plural), collection helpers, clock, uuid           (from core + framework/model/naming)
  contracts/      Problem, QueryFilter, ListQuery, Actor, TenantContext…        (from contracts)
  errors/         Problem rendering, exception handler, catalogs, i18n          (from core)
  log/            redacting non-blocking logger                                 (from logs)
  http/           server, router, middleware, controllers, ResourceController,
                  form requests, API resources, list-query, security, docs page (from framework/http)
  database/       connections, schema builder (new), migrator, seeders,
                  query builder, models + relations, pagination, factories      (framework/database, migrations, data, query)
  authorization/  gates, policies, policy→SQL compiler, roles, field rules      (from auth/policy, auth/sql)
  auth/           guards (session, token), native identity engine, User model  (from auth/identity)
  tenancy/        resolver, RLS DDL + withTenant, lint                          (from auth/tenancy, auth/postgres)
  audit/          audit events in the write transaction                         (from auth/audit)
  storage/        disks, uploads, signed URLs                                   (from framework/storage)
  openapi/        /openapi.json + /docs                                         (from framework/openapi)
  console/        command kernel + make:*, migrate, db:seed, serve/dev, doctor  (from cli + devkit)
  testing/        createTestApp, actingAs, factories                            (from framework/testing)
```

Boundary rule (replaces D23): optional packages (`ui`, `files`, `log-viewer`) **may import `@strutvane/framework`**; the framework never imports them. Inside the framework, module boundaries are enforced by lint (for example `database` never imports `http`), not by separate repos.

### D.2 Generated app layout

```
acme/
├─ app/
│  ├─ models/            user.ts  post.ts                     (always created with a create_* migration)
│  ├─ http/
│  │  ├─ controllers/    post.controller.ts                   (generated CRUD, owned)
│  │  ├─ requests/       post.request.ts                      (validation, derived from columns, owned)
│  │  ├─ resources/      post.resource.ts                     (API transformer, owned)
│  │  └─ middleware/
│  ├─ policies/          post.policy.ts
│  └─ providers/         app.provider.ts
├─ bootstrap/app.ts      providers, middleware, exception handling   (replaces strutvane.config.ts)
├─ config/               app.ts database.ts auth.ts …                (typed, env-validated: kept)
├─ database/
│  ├─ migrations/        2026_11_14_120000_create_posts_table.ts     (developer writes columns here)
│  ├─ seeders/           database.seeder.ts  post.seeder.ts
│  ├─ factories/         post.factory.ts
│  └─ schema.gen.ts      typed tables + column metadata, written by `migrate` (git-ignored or committed)
├─ routes/               api.ts  web.ts                              (Route.resource('posts', PostController))
├─ resources/ui/         pages/posts/{index,create,edit,show}.tsx, navigation.ts, app.tsx, theme.css
├─ storage/  tests/  docker/compose.yaml (local only)  .env  .env.example
└─ package.json          scripts: dev, build, start, test (npm run …)
```

### D.3 The user's flow mapped onto the parts

1. **`npm create strutvane@latest acme`.** Prompts:
   - Full-stack (API + UI) or API only
   - Database: SQLite (zero setup) or PostgreSQL (Docker or an existing URL)
   - Auth (email + password) on or off
   - Multi-tenant (PostgreSQL only)
   - git

   Then it writes the files (create-strutvane templates, reworked), runs `npm install`, runs `docker compose up -d --wait` if chosen (with an init script creating the owner and runtime roles, B.13), runs `strutvane migrate --seed` (users, sessions, the seed admin printed once) and offers to run `npm run dev`. **Reuse:** prompts, render, env-spec, post, the devkit staged FS.
2. **`npx strutvane make:migration create_posts_table [--seeder] [--factory] [--no-crud]`.** Writes the migration stub (`Schema.create('posts', (t) => { t.id(); /* columns */ t.timestamps() })`) and **always** `app/models/post.ts`. With `--seeder`, it also writes `database/seeders/post.seeder.ts` and registers it in `database.seeder.ts` (reuse `seeder-registration.ts`). The table name maps to the model name through the existing `names.ts` / `naming.ts`.
3. **The developer writes columns in the migration:** `t.string('title')`, `t.slug('slug').from('title')`, `t.text('body').nullable()`, `t.enum('status', ['draft', 'published']).default('draft')`, `t.foreignId('user_id').constrained()`, `t.decimal('price', 12, 2)`, `t.tenant()` (adds `tenant_id`, the RLS policy and the index; reuse `rls.ts`).
4. **`npx strutvane migrate`:**
   - Applies pending migrations (reuse the migrator: lock, checksums, drift, one transaction).
   - Dumps `database/schema.gen.ts` (table types, plus column metadata: type, nullable, unique, enum values, FKs, slug source).
   - Runs pending seeders. **Decision needed:** "seed if the seeder has content" is fragile to detect. Recommend tracking run seeders in a `seeders` table (like migrations) so each runs once, and `db:seed` reruns explicitly.
   - If CRUD scaffolding is on (from setup, stored in `config/app.ts`), generates for each newly created table that has no controller yet: controller, request, resource, policy, `routes/api.ts` entry, UI pages, sidebar entry and a feature test. It **never overwrites** an existing file and prints every file it wrote. `--no-scaffold` skips this; `make:crud Post` (re)creates missing files on demand.
   - **API standards** (reuse `list-query.ts`, `query/*`, `sort.ts`):
     - `GET /api/posts?search=…&filter[status]=draft&sort=-created_at&page[size]=25&page[number]=2` (or `page[cursor]`)
     - every string or text column searchable by default (ILIKE; `pg_trgm` index opt-in)
     - every column filterable by its type's operators
     - `GET /api/posts/{id|slug}`, `POST`, `PATCH`, `DELETE` (soft if `deleted_at`), `restore`
     - problem+json errors; OpenAPI and `/docs` automatic
     - slugs: unique, generated from the source column, regenerated only when empty; route binding by `id` or `slug`
5. **MVC like Laravel:** models (typed active-record-style over the query builder), controllers, requests, resources, policies, routes files, middleware, providers, events. Authorization, tenancy and audit run inside `ResourceController` with the loaded record (fixes the #11 class by construction).

### D.4 Open technical choices (each needs an ADR before implementation)

- **Query builder / ORM engine:**
  - (a) Kysely as the typed builder under our `Model` (ADR-0004 already names Kysely for raw queries), typed from `schema.gen.ts`. This is the recommendation.
  - (b) Keep drizzle-orm (drop drizzle-kit).
  - (c) Our own builder on the existing `QueryFilter` compiler.
- **Typing the model from the DB:** generate `schema.gen.ts` from the migrated database (introspection) or from the schema builder's recorded operations. Introspection is simpler and always true.
- **Seeder-run semantics:** a tracking table vs "fresh only".
- **CLI bin name:** `strutvane` (long) plus a short alias that isn't a shell builtin (not `sv`; also check `npx` collisions).
- **Server-rendered views:** Laravel has Blade. Here the UI is a React SPA via Vite; decide whether a `web` (HTML) stack is in scope or "UI" always means the React admin.

### D.5 Migration path from today's repos

1. **Freeze and record.** Write ADR-0020 "Laravel-style monolith" superseding the decisions in §E. Mark retired repos and folders obsolete (README banner) without deleting them. Publish nothing new from the old repos.
2. **Create the monorepo** (new repo, or the hub repo promoted): `npm init` with `workspaces`. Import each package **with history** (`git subtree add` or `git filter-repo --to-subdirectory-filter`) so blame and regression-test provenance survive.
3. **Fold** core, contracts, devkit (minus merge), cli (minus registry, fields, launcher, channel, upgrade), logs pipeline and auth (minus Better Auth and standalone adapters) **into `packages/framework/src/*`**. Fix imports. Run the moved test suites; they must stay green before any redesign (pure move, no behaviour change).
4. **Build the new surface on the moved engine**, in this order:
   - schema builder + `make:migration` (model always, `--seeder`)
   - `schema.gen.ts` + `Model` / query builder
   - router + controllers + `ResourceController`
   - app-owned `users` migrations + native auth guard
   - `migrate` seeding + scaffolding
   - generated UI pages + layout + navigation
   - `create` orchestration
5. **Port the playground** (Northwind Ops) to the new flow as the acceptance test. All 28 regression tests must keep passing in their new homes.
6. **Release:** one version for all packages (Changesets `fixed` group), real `0.2.0` on `latest`, OIDC provenance.
7. **Archive** the old package repos on GitHub (read-only, README pointing to the monorepo). Deprecate the old npm placeholders with `npm deprecate`.

---

## E. Decisions that would need superseding or refining

| Decision | Today | Proposed status |
|---|---|---|
| D1 / ADR-0001 | CLI = unscoped `strutvane` launcher; project alias `pnpm sv` | **Refine:** one bin from the framework (`npx strutvane`); drop the `sv` alias and launcher; `strutvane` npm name reused or left reserved |
| D2 | Descriptive packages `framework`, `auth`, `ui`, `core`, `contracts`, `devkit`, `cli` | **Supersede:** one `@strutvane/framework` + optional `ui`, `files`, `log-viewer` + `create-strutvane` |
| D4 / ADR-0003 | Model is the source of truth | **Supersede:** migrations are the source of truth; models are thin, typed from the migrated schema |
| D5 / ADR-0009 | Model-first auto-diffed migrations; engine owns rename resolution | **Supersede / obsolete:** hand-written TS migrations with a schema builder; no diffing |
| D6 / ADR-0003 / ADR-0012 | Thin runtime metadata files; L0–L3; eject + three-way merge | **Supersede:** generated owned files (controller, request, resource, pages) on a reusable base; never regenerated over edits; merge engine archived |
| D7 / ADR-0010 | Convention discovery compiled into `registry.gen.ts` by static analysis | **Supersede:** explicit routes files + runtime folder discovery + schema typegen |
| D8 | Hono default + Express/Fastify/Nest adapters | **Refine:** Hono only (internal); adapters dropped from scope |
| D9 / ADR-0004 | Drizzle (diff + driver) behind an internal adapter; Kysely for raw | **Refine / supersede:** drizzle-kit removed; choose the query engine (§D.4) |
| D10 | Postgres tier 1; MySQL, SQLite tier 2; Azure variants | **Refine:** Postgres + SQLite only until MySQL exists; the starter offers only those |
| D12 / ADR-0005 / ADR-0013 | Identity adapter, Better Auth default | **Refine:** native engine default, app-owned `users` tables; Better Auth optional or retired. Keep ADR-0013's hardening rules as requirements of the native engine |
| D14 / ADR-0014 | UI rendered at runtime from the manifest | **Refine:** keep the component and registry design, plus generated owned pages and a navigation file; the manifest becomes optional |
| D15 | `app/ config/ database/ web/ …`, `strutvane.config.ts` | **Refine:** add `routes/`, `bootstrap/app.ts`, `resources/ui/`; drop `strutvane.config.ts` and `.strutvane/` |
| D16 / ADR-0006 | Docker local only; `sv up` | **Keep**, plus `create` and `dev` start and wait for it; init script provisions owner and runtime roles |
| D17 / ADR-0002 | Polyrepo, one repo per package, umbrella pnpm workspace | **Supersede:** one monorepo with npm workspaces |
| D18 / ADR-0016 / ADR-0018 | Independent versions, shared major train, `next` pre-releases, staged publish per package | **Refine:** lockstep version, real `latest` 0.x, OIDC provenance kept, staging optional per train |
| D21 / RFC-0002 | Contracts + framework core + `@strutvane/files` | **Refine:** layer 1 moves into the framework; otherwise kept |
| D23 / doc 17 | Six connection mechanisms; product packages never import each other | **Supersede:** optional packages import the framework; internal module boundaries enforced by lint |
| D24 / RFC-0004 / ADR-0015 | `@strutvane/logs` default package | **Refine:** pipeline in the framework; viewer as an optional package. ADR-0015 kept |
| RFC-0001 (contracts v0) | Public contracts package | **Supersede:** internal types; the `ListQuery` / `QueryFilter` / `Problem` wire formats stay normative |
| Integration-map "installer `enhances`" (doc 04 §7) | Installer protocol | **Supersede:** `install:*` commands |
| CLAUDE.md / ECOSYSTEM.md rules | "contracts ← core ← products", "never import each other", `corepack pnpm@12.18.0`, polyrepo map, synced files | **Rewrite** after the ADR |
| GOVERNANCE.md, docs 10 (repos & publishing), 14 (roadmap) | Polyrepo process | **Rewrite** |
| **Keep unchanged** | — | D3, D11, D13, D19, D20, D22; ADR-0007, 0008, 0011 (OpenAPI part), 0015, 0017, 0019; RFC-0003; RFC-0004 rules |

---

## F. npm instead of pnpm: every assumption and what switching implies

### F.1 Where pnpm or Corepack is assumed today

| Place | What assumes pnpm | Change for npm |
|---|---|---|
| `create-strutvane/src/options.ts:122` | `DEFAULTS.packageManager = 'pnpm'`; `PACKAGE_MANAGERS` = pnpm, npm, yarn, bun | Remove the choice. npm only (drop the prompt, `--pm`, yarn and bun templates) |
| `create-strutvane/src/templates/root.ts:106, 120, 332–384` | `"sv": "strutvane-cli"` script; `"packageManager": "pnpm@12.18.0"`; generates `pnpm-workspace.yaml` (`allowBuilds: esbuild`, `minimumReleaseAgeExclude`) | No `packageManager` field (or `npm@x`), no workspace file. Scripts `dev`, `build`, `start`, `test`; CLI via `npx strutvane` |
| `create-strutvane/src/package-manager.ts` | `runScript`, `svCommand`, `ciInstallCommand`, `corepackRunner` (`corepack pnpm@…`) | Reduce to npm: `npm run x`, `npx strutvane x`, `npm ci` |
| `create-strutvane/src/next-steps.ts` | Corepack fallback line; `services:up`, `sv migrate`, `sv db:seed`, `dev` | Next steps become `cd acme && npm run dev`, since `create` does the rest |
| `create-strutvane/src/versions.ts:53, 60` | `pnpm: '12.18.0'`, `pnpm/action-setup` pinned SHA in the generated CI | Generated CI uses `actions/setup-node` with `cache: npm` + `npm ci` |
| `create-strutvane/src/release-channel.ts` | `createCommand(…, pm: 'npm' \| 'pnpm')`, the `@next` logic | Retire (real `latest`) |
| `create-strutvane/src/templates/*` (13 `pnpm sv` / `svCommand` uses), generated README, CLAUDE.md and code comments (`pnpm sv db:seed` in `cli/src/make/seeder-registration.ts:32`) | Command spellings | `npx strutvane …` / `npm run …` |
| `cli/src/project/project.ts:113–160` | Lockfile detection order (`pnpm-lock.yaml` first); fallback command `pnpm` | npm only (`package-lock.json`) |
| `cli/src/commands/doctor.ts:69` | Hint `pnpm add -D …` | `npm install -D …` |
| `cli/src/make/fields.ts`, `commands/make.ts`, `framework/messages.ts` | Windows `.cmd` shim notes for corepack, pnpm and npx | Moot once fields leave the CLI (`npx` has the same `.cmd` issue) |
| `cli/src/project/contributions.ts:71` and the package-migration gate | Realpath must stay inside the project's `node_modules`; symlinked packages refused | **Blocker for local development under npm workspaces:** workspace packages are symlinks to `packages/*`, so the gate would refuse them. Either drop the gate for first-party code compiled into the framework (it disappears in a monolith) or allow realpaths inside the declared workspace root |
| Every package repo: `package.json` `"packageManager": "pnpm@12.18.0"`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (`allowBuilds`, `minimumReleaseAgeExclude`; cli's lists `packages/*`) | Repo tooling | Monorepo root `package.json` with `"workspaces": ["packages/*"]`, one `package-lock.json` |
| `tooling/canonical/.github/workflows/{ci,release}.yml` (synced into every repo) | `pnpm/action-setup`, `cache: pnpm`, `pnpm install --frozen-lockfile`, `pnpm run ci` | `actions/setup-node` (`cache: npm`), `npm ci`, `npm run ci --workspaces --if-present` |
| `.github/scripts/workspace-packages.mjs` (synced) | Parses `pnpm-workspace.yaml` to find packages for release | Read `workspaces` from the root `package.json` (or `npm query .workspace`) |
| `.github/scripts/publish-if-new.mjs` | Already uses `npm stage publish` (npm 11.19.0) | Works with npm; iterate the workspaces |
| `tooling/scripts/sync.mjs` | "Run: `pnpm sync`" | Retire (one repo) |
| Package scripts (`ci`: `biome check . && tsc --noEmit && vitest run --coverage && tsdown`) | Tools called directly | **Already npm-compatible**; run with `npm run ci` |
| Hub `scripts/e2e-local.mjs` | `corepack pnpm@12.18.0`; writes a `pnpm-workspace.yaml` with `overrides` to `file:` checkouts; `--pm pnpm` | In the monorepo, workspaces link locally. The e2e becomes `npm pack` of each workspace + `npm install ./*.tgz` into a fresh app (tests the published shape) |
| Hub `CLAUDE.md`, `.claude/ECOSYSTEM.md` (synced), docs 05, 09, 10, 11–15, docs site, rfcs/adr mentions, spikes `package.json`s, `playground/`, `integration-local/` | `corepack pnpm@12.18.0 <cmd>`; `pnpm sv`; umbrella pnpm workspace | Rewrite to `npm …` / `npx strutvane …`; spikes and playground can stay as archived pnpm artefacts or be converted |
| The demo project (`C:\personal_projects\demo-strutvane-project`) | `pnpm-workspace.yaml`, `pnpm-lock.yaml`, `packageManager` | The user's own; regenerate with the new starter rather than convert |

**Verified:** no `workspace:`, `catalog:` or `link:` protocol is used in any `package.json` under `packages/`. Inter-package dependencies are exact published versions, so there is no pnpm-only dependency syntax to unwind.

### F.2 What switching to npm implies

- **Monorepo:** npm workspaces link `packages/*` into `node_modules` automatically. There is one `package-lock.json`. Use `npm run <script> -w @strutvane/framework` or `--workspaces --if-present`. Changesets supports npm workspaces; use a `fixed` group for lockstep versions.
- **Lockfiles:** `package-lock.json` everywhere, CI uses `npm ci`. Generated apps commit `package-lock.json`.
- **Scripts:** `npm run dev`, `npm run build`, `npm test`. Arguments to a script need `--` (`npm run x -- --flag`), which is why the CLI should be invoked as `npx strutvane …` (resolves the project-local bin, no `--` needed) rather than through an `sv` script.
- **Install scripts:** npm runs dependency lifecycle scripts by default, so `ERR_PNPM_IGNORED_BUILDS` (esbuild) disappears. **Trade-off:** we lose pnpm's build-script allowlist and its `minimumReleaseAge` "too new" protection, both supply-chain guards.
  - **Mitigations:** `npm ci` with a reviewed lockfile, `npm audit signatures` in CI, Dependabot with a cooldown, minimal runtime dependencies (dropping drizzle-kit and esbuild from the runtime helps).
  - Whether npm 11 has a minimum-release-age equivalent is *(unverified)*; check before claiming parity.
- **Hoisting:** npm hoists, so a package can import a dependency it didn't declare and still work locally (phantom dependencies). Keep `check-deps.mjs` (or `knip`) in CI, and test with `npm pack` + install into a clean app.
- **`npm create strutvane@latest`:** needs a real version on `latest` (§B.7). `npm create` passes flags only after `--` (`npm create strutvane@latest acme -- --api`), so prompts should cover everything and flags stay optional.
- **Windows:** `npx` also runs through `.cmd` shims, so parentheses and quotes in arguments stay fragile. Another reason to keep schema details out of command-line arguments.
- **Corepack:** no longer needed anywhere. Remove all `corepack` instructions, and drop `COREPACK_ENABLE_DOWNLOAD_PROMPT` from scripts.

### F.3 Blockers and risks

1. **The CLI contribution / package-migration realpath gate** refuses symlinked packages, which is what npm workspaces produce (and what e2e-local had to work around with `file:`). Resolve it in the redesign (§F.1).
2. **Release scripts** (`workspace-packages.mjs`) parse `pnpm-workspace.yaml`. They need rewriting before the first npm-based release.
3. **Supply-chain guard regression** (build-script allowlist, release age): accept it and mitigate (§F.2), or decide otherwise in an ADR.
4. **None found** in package code itself: no pnpm-specific protocols, and package scripts call tools directly.
