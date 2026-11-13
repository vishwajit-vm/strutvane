# 13 — Testing Strategy

> **Principle:** for a code-generating framework, *the generated app is the product*. Unit tests on our libraries are necessary but not enough. Every release must prove that freshly generated **and** upgraded apps typecheck, lint, pass their own tests and stay secure.
> Repos and CI are described in [10](10-repositories-publishing-versioning.md). Security controls under test are in [12](12-security-model.md).

## 1. Test pyramid

```
                 ┌──────────────────────────────┐
                 │  Exploratory / pentest / audit│  per major (external)
                 ├──────────────────────────────┤
                 │  Perf (k6) budgets            │  nightly + release
               ┌─┴──────────────────────────────┴─┐
               │  E2E: generated apps + Playwright │  integration repo (nightly, pre-release)
               │  + upgrade tests                  │  + e2e-siblings on PRs
             ┌─┴──────────────────────────────────┴─┐
             │  Contract tests (OpenAPI, manifest,  │  every PR
             │  installer idempotency, golden files)│
           ┌─┴──────────────────────────────────────┴─┐
           │  Integration (Testcontainers DB matrix,   │  PR (affected) + nightly
           │  Valkey, queue, mail, fake IdP)           │
         ┌─┴──────────────────────────────────────────┴─┐
         │  Unit + property-based + mutation (auth)      │  every PR, < 3 min per repo
         └───────────────────────────────────────────────┘
```

| Layer | Tool | Runs where | Time budget |
|-------|------|------------|-------------|
| Unit | Vitest 5 | Every repo, every PR | < 3 min |
| Property-based | fast-check + Vitest | `auth`, `framework` (filter AST, query compiler) | < 2 min |
| Mutation | Stryker (Vitest runner) | `auth` policy engine, token/session code, `framework` authorization path | Nightly; PR on changed files |
| Integration | Vitest + Testcontainers 12 | `framework`, `auth` | < 10 min affected, < 30 min full |
| Golden / snapshot | Vitest file snapshots | `devkit`, `cli`, `create-strutvane`, installers in every package | < 2 min |
| Contract | OpenAPI validators, Schemathesis-style fuzzing *(tool to confirm)* | `framework`, `integration` | < 10 min |
| E2E generated apps | `create-strutvane` → shell → Playwright | `integration` + `e2e-siblings` | < 25 min per preset × DB cell |
| UI | Playwright 1.65 + @axe-core/playwright | `ui`, `integration` | < 10 min |
| Performance | k6 | `integration` nightly | Budgets in §10 |
| CLI cross-platform | Vitest + smoke scripts | `cli`, `create-strutvane`, `devkit` | < 15 min per OS |

## 2. Unit tests

- **Scope:** pure logic. Includes:
  - model DSL compilation (model → Drizzle schema, Zod, OpenAPI, manifest)
  - filter/sort/pagination parsing
  - policy evaluation
  - config/env validation
  - hook ordering
  - route registry compilation
  - `.env` writer idempotency
- **Conventions:**
  - Colocated `*.test.ts`.
  - No network or DB.
  - Fakes for drivers (`memory` cache/queue/mail drivers ship as real features and double as test doubles).
- **Type tests:** `expectTypeOf` (Vitest) for public API inference, e.g. that `defineModel` infers the correct row/insert/update types and that `can('product.update')` only accepts known permissions. Type regressions are API breaks.

## 3. Integration tests (Testcontainers DB matrix)

| Cell | Image / target | Runs |
|------|----------------|------|
| PostgreSQL 16 | `postgres:16` | PR (affected) + nightly |
| PostgreSQL 17 | `postgres:17` | PR (affected) + nightly |
| PostgreSQL 18 | `postgres:18` | PR (affected) + nightly |
| MySQL 8.4 LTS | `mysql:8.4` | PR (affected) + nightly |
| SQLite | in-process (libSQL + better-sqlite3) | Every PR (no Docker needed) |
| Valkey 9 | `valkey/valkey:9` | Cache, rate limits, BullMQ |
| Postgres-backed queue | BullMQ 6 Postgres backend / pg-boss | Nightly |
| Mailpit | `axllent/mailpit` | Mail driver |
| Fake IdP | OIDC/SAML mock from `@strutvane/test-utils` (e.g. a node-oidc-provider based fixture) | Auth SSO flows |
| **Azure PostgreSQL / MySQL Flexible Server** | Real managed instances; Entra passwordless via `@azure/identity` + `@azure/postgresql-auth` (GitHub OIDC → Azure federated credential) | **Nightly** (`integration` repo), cost-capped, auto-teardown |

**What is covered:**

- Migrations: auto-diff → SQL → apply → rollback, per dialect.
- Golden SQL snapshots per dialect (guards against Drizzle v1 RC changes).
- CRUD with relations, soft deletes, timestamps, filters (every operator × field type), sorting, cursor and offset pagination, includes, field selection.
- Transactions and the outbox (audit + domain events written atomically; a forced failure rolls back both).
- **RLS:**
  - The app role cannot bypass it.
  - Missing tenant context returns zero rows.
  - `SET LOCAL` doesn't leak across pooled connections (run through PgBouncer in transaction mode in one cell).
- Session/refresh-token stores (DB + Valkey), rate-limit counters, queue retries/backoff/scheduling.

Containers start once per test file group (global setup) with per-test schema or transaction isolation to keep runs fast. Docker is never configured by committed compose files (D16). Testcontainers manages everything.

## 4. Generator tests

### 4.1 Golden-file tests

- Each generator/installer runs against a fixture project into a temp dir. The resulting tree (paths + contents) is compared with committed golden snapshots under `tests/__golden__/`.
- **Covered:**
  - `make:*` generators
  - `migrate` SQL output
  - every package installer (`sv add auth|ui`)
  - `create-strutvane` presets (full/api/ui) × options (DB, tenancy, Docker mode, package manager)
- Updating goldens requires an explicit `pnpm test -u` and reviewer sign-off. CODEOWNERS covers `__golden__`.

### 4.2 Installer contract tests (every package)

| Property | Test |
|----------|------|
| **Idempotent** | Running `sv add auth` twice produces no diff the second time |
| **Reversible** | `sv add auth && sv remove auth` returns to the original tree (except intentionally kept migrations, which are reported) |
| **Env discipline** | New keys are appended to **both** `.env` and `.env.example`. Existing values are never overwritten. `.env.example` contains no real secrets (entropy check). |
| **Sandbox** | No writes outside the project root. Symlinks and `..` are refused. |
| **Config patching** | `strutvane.config.ts` is patched via magicast and stays type-valid and formatted |
| **Dry-run fidelity** | `--dry-run` output equals the actual diff |

### 4.3 "Generate → typecheck → lint → test" end-to-end

The core quality gate. It runs in `integration` nightly and before every train release, and on affected PRs via `e2e-siblings`.

```
for preset in [full, api, ui]:
  for db in [postgres, mysql, sqlite]:            # ui preset runs against an example OpenAPI server
    npm create strutvane@<candidate> app -- --preset $preset --db $db --yes
    sv make:model Product name:string! price:decimal status:enum(draft,active) category:belongsTo(Category)
    sv make:model Category name:string! --tenant --audit
    sv add auth (if not included)  && sv migrate && sv db:seed
    pnpm typecheck && pnpm lint && pnpm test       # the app's OWN generated tests
    pnpm build && start server
    playwright: login → create category → create product → filter/sort/paginate → edit → delete
    openapi: validate /openapi.json (OpenAPI 3.1) + contract-fuzz the CRUD endpoints
    security: run generated cross-tenant suite + ZAP baseline scan (headers, cookies)
```

**Matrix additions:**

- Package managers npm/pnpm/yarn/bun (smoke subset).
- Docker modes local/commit/none.
- Tenancy off/shared/schema.

## 5. Cross-tenant isolation suite

Generated **into every app** for every tenant-scoped model (`--tenant`), and run in our CI on the example apps:

| Case | Expected |
|------|----------|
| Tenant A lists products | Sees only A's rows (the count matches seeded A rows) |
| Tenant A `GET /products/{idOfB}` | **404** (not 403, to avoid existence leaks) |
| Tenant A `PATCH/DELETE` B's row | 404; row unchanged |
| Tenant A `POST` with `tenantId: B` in body | Created under A (tenant comes from context) or rejected; never under B |
| Filter/include traversal (`include=category` where the category belongs to B) | B's related rows never appear |
| Bulk endpoints / export | Scoped to A |
| Direct SQL as the app role with no tenant set | 0 rows (RLS fail-closed, Postgres) |
| Queue job dispatched by A | Executes with A's tenant context only |
| Cache keys | Namespaced by tenant (no cross-tenant cache hits) |

## 6. Policy engine: property-based and mutation testing

**Property-based tests (fast-check):**

- Random actors (roles, attributes, tenants) × random rows × random policies (allow/deny/conditions).
- **Invariant 1, list/single consistency:** a row is returned by a list query filtered by the compiled SQL **iff** `can(actor, 'read', row)` is true in memory. Checked against SQLite and Postgres.
- **Invariant 2, deny precedence:** any matching `deny` yields `allowed=false` regardless of allows.
- **Invariant 3, monotonicity:** adding a role never reduces permissions unless a deny is attached. Removing all roles yields deny-all.
- **Invariant 4, field rules:** serialised output never contains a field whose read rule evaluates false.
- **Invariant 5, filter AST safety:** any generated filter AST compiles to parameterised SQL (no string interpolation of values) within the complexity limits.

**Mutation testing (Stryker):**

- **Targets:**
  - policy evaluator and SQL compiler
  - session/refresh rotation
  - API-key verification
  - CSRF
  - tenant resolver
- Mutation score gate **≥ 85%** on these modules. Surviving mutants are reviewed in PRs.

## 7. Contract tests

| Contract | Test |
|----------|------|
| OpenAPI 3.1 | Generated spec validates against the OpenAPI 3.1 schema. Every route in `sv routes` appears in the spec. Responses from real requests validate against the declared schemas. Property-based fuzzing of CRUD endpoints for 5xx and schema violations. |
| RFC 9457 errors | Every error path returns `application/problem+json` with `type`, `title`, `status`, `traceId` |
| Resource manifest (`/.well-known/strutvane.json`) | Validates against the `contracts` JSON Schema. Permission filtering per actor is correct. |
| List-query protocol | Shared conformance suite in `@strutvane/test-utils`, also usable by third-party backends that want to work with `@strutvane/ui` |
| `contracts` package | Type-level tests + JSON Schemas versioned; a breaking diff detected by `api-extractor`-style report *(tool to confirm)* fails CI unless the change is a major |
| Plugin compat kit | `@strutvane/test-utils/plugin-kit` runs a plugin through registration, hook ordering and capability enforcement. Required for the "verified" badge. |

## 8. Upgrade tests (vN-1 → vN)

- **Minor upgrades:** generate an app with the previous minor (and previous major on train releases), add models, eject a component, then edit it.
- Run `sv upgrade` to the candidate. Assert:
  - codemods applied
  - three-way merge preserved user edits (conflicts surfaced, never dropped)
  - app typechecks and its tests pass
  - DB migrations still apply cleanly to an existing database with data
- **Corpus:** the `examples` repo apps + a frozen "messy app" fixture (heavy customisations, ejected files, custom field types, plugins).
- **Gate:** no train release ships with a failing upgrade test.

## 9. UI tests (Playwright + axe)

- Browsers: Chromium, Firefox and WebKit on the full matrix nightly; Chromium on PRs.
- **Flows:**
  - auth (login, register, reset, MFA setup, SSO via fake IdP)
  - CRUD per field type (all `field.*` widgets)
  - table search/filter/sort/paginate with URL state
  - permission-aware UI (buttons/fields hidden for viewer role, and the API still rejects forced requests)
  - tenant switcher
  - theming (light/dark tokens)
- **Accessibility:** `@axe-core/playwright` on every generated page type. **Zero serious/critical violations** gate. Keyboard-only navigation tests for table, form, dialog and menu.
- **Visual regression:** screenshot comparisons for registry components (opt-in, Chromium only, to limit flakiness).
- Component tests: Vitest browser mode for registry components.

## 10. Performance budgets (k6, nightly)

The reference app (`examples/crm`, Postgres 17, 1M rows in the largest table, tenancy on with RLS) runs on a fixed-size CI runner.

| Scenario | Budget (p95) |
|----------|--------------|
| `GET /api/v1/products` (25 rows, 2 filters, sort, cursor) | ≤ 40 ms |
| `GET /api/v1/products/{id}` with 2 includes | ≤ 25 ms |
| `POST /api/v1/products` (validation + policy + audit + outbox) | ≤ 50 ms |
| Login (argon2id) | ≤ 250 ms (CPU-bound by design) |
| Cold start (`node dist/server`) | ≤ 1.5 s |
| CLI `sv make:model` | ≤ 1 s |
| `npm create strutvane` (excluding install) | ≤ 5 s |
| UI initial load (production build, LCP on CI profile) | ≤ 2.0 s |

A regression of more than 10% against the trailing 7-day median fails the nightly and opens an issue on the Projects board.

## 11. Cross-platform CLI matrix

| OS | Node | Package managers |
|----|------|------------------|
| Ubuntu (latest) | 24, 26 | npm, pnpm, yarn, bun |
| macOS (latest, arm64) | 24, 26 | npm, pnpm |
| **Windows (latest)** | 24, 26 | npm, pnpm |

Windows-specific checks:

- path separators
- CRLF handling in generated files (generators write LF and set `.gitattributes`)
- long paths
- PowerShell and cmd invocations of `pnpm sv`
- native-module fallbacks (argon2 WASM, libSQL instead of better-sqlite3)

## 12. Coverage gates

| Package | Line | Branch | Notes |
|---------|------|--------|-------|
| `contracts` | n/a | n/a | Type tests + JSON Schema validation |
| `core` | 90% | 85% | — |
| `framework` | 85% | 80% | Plus DB matrix green |
| `auth` | **95%** | **90%** | Plus mutation ≥ 85% on critical modules |
| `ui` | 80% | 70% | Plus Playwright + axe gates |
| `cli` / `devkit` / `create-strutvane` | 85% | 80% | Plus golden + e2e |

Coverage is a floor, not a target. PRs may not reduce coverage of touched files.

## 13. Testing helpers shipped to users: `@strutvane/framework/testing`

Generated apps get Laravel-grade testing ergonomics out of the box (Vitest preset included).

```ts
import { describe, it, expect } from 'vitest'
import { testApp, refreshDatabase, actingAs, factory, fakeMail, fakeQueue, travel } from '@strutvane/framework/testing'

describe('products', () => {
  refreshDatabase()                       // migrate once, wrap each test in a rolled-back transaction

  it('lists only my tenant products', async () => {
    const [a, b] = await factory('Tenant').count(2).create()
    await factory('Product').count(3).for(a).create()
    await factory('Product').count(2).for(b).create()

    const user = await factory('User').for(a).withRole('manager').create()
    const res = await actingAs(user).get('/api/v1/products?sort=-createdAt')

    expect(res.status).toBe(200)
    expect(res.json().data).toHaveLength(3)
  })

  it('queues a notification on create', async () => {
    const queue = fakeQueue(); const mail = fakeMail()
    await actingAs(await factory('User').withRole('admin').create())
      .post('/api/v1/products', { name: 'Desk', price: '199.00' })
      .expectStatus(201)
    queue.assertPushed('SendProductCreatedEmail')
    mail.assertNothingSent()
  })
})
```

| Helper | Purpose |
|--------|---------|
| `testApp()` | Boots the app in-process; HTTP client without a network socket (`fetch`-compatible) |
| `refreshDatabase()` / `useTransaction()` | Migrations once per worker; per-test transaction rollback; SQLite in-memory or Testcontainers Postgres |
| `factory(model)` | Typed factories generated from models (`database/factories/*.factory.ts`), with states, sequences, relations and `.for(tenant)` |
| `actingAs(user \| apiKey)` / `asGuest()` / `asTenant(t)` | Auth and tenant context for requests |
| `expectStatus`, `expectProblem(code)`, `expectJsonMatches(schema)` | Fluent assertions (problem+json aware) |
| `fakeMail()`, `fakeQueue()`, `fakeEvents()`, `fakeStorage()` | Swap drivers for in-memory fakes with assertions |
| `travel(to)` / `freezeTime()` | Time control for tokens, schedules, soft deletes |
| `seed(Seeder)` | Run specific seeders |
| `assertAudited({ action, resource })` | Audit log assertions |
| `generatedTenantIsolationSuite(model)` | The cross-tenant suite from §5, reusable for custom models |

Generated tests per model: CRUD happy paths, validation errors, permission denials per role, the tenant isolation suite (if tenant-scoped), and factory smoke tests. All of these are owned files the developer can extend.
