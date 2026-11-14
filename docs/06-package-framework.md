# 06 — Package Spec: `@strutvane/framework` (Backend & Database)

> The "Laravel" of the ecosystem: install it alone and you have a complete API platform. `auth` and `ui` light up extra capability when present.

## 1. Responsibilities

| Module (subpath export) | Responsibility |
|-------------------------|----------------|
| `@strutvane/framework` | `createApp`, `defineModel`, `field`, `defineResource`, re-exports of core |
| `/http` | Router, middleware, host adapters (Hono default; Express, Fastify, Nest), security headers, CORS, rate limiting, body limits, health endpoints |
| `/database` | Connections and pools, model DSL → table schema, migrations (auto-diff + manual), seeders, factories, query layer, transactions, soft deletes, tenancy scopes, RLS session variables, introspection (`db:pull`) |
| `/resource` | The CRUD engine: list/show/create/update/delete/restore/bulk/export/query, hooks, actions, overrides, serialisation, field visibility |
| `/validation` | Model → Zod schemas (create/update/partial), custom rules, i18n messages, Standard Schema interop |
| `/openapi` | OpenAPI 3.1 document at `/openapi.json`, `x-strutvane-*` extensions, a readable docs page at `/docs` (§5.5), typed client generation |
| `/queue` | Jobs, schedules, retries, idempotency, outbox relay; `sync` / `database` / `valkey` drivers |
| `/cache` | Cache facade, tags, tenant namespacing; `memory` / `database` / `valkey` drivers |
| `/mail` | Mailables, templates, drivers (SMTP, SES, Resend, Postmark, log) |
| `/storage` | Disk manager (`storage.disk(name)`), `local` + `memory` drivers, tenant key prefixing, streaming multipart upload pipeline with limits enforced while streaming, `UploadedFile` (magic-byte MIME, sha256, `store()`). Cloud drivers and file fields: `@strutvane/files` ([RFC-0002](rfcs/0002-file-storage-and-uploads.md)) |
| `/errors` | Central error handler: every error → `Problem` with a rendered message, `traceId` and redacted logging. DB error translation (unique/FK/not-null → issues). See [RFC-0003](rfcs/0003-errors-and-messages.md) |
| `/events` | Domain events, listeners, outbox |
| `/testing` | `createTestApp`, `refreshDatabase`, `factory()`, `actingAs(user)`, `withTenant(t)`, typed HTTP test client, fake mail/queue/cache |

Heavy drivers (`pg`, `mysql2`, `@libsql/client`, `better-sqlite3`, `ioredis`/`iovalkey`, `@azure/identity`, `@azure/postgresql-auth`, `nodemailer`) are **optional peer dependencies**. The installer adds only what you chose.

## 2. Model DSL → everything

`defineModel(name, fields, options)` produces a `ModelDefinition`. It is pure data plus types, so the same object can be consumed by:

| Consumer | Output |
|----------|--------|
| Schema compiler | Drizzle table definition (internal), indexes, FKs, check constraints, RLS policies |
| Migration differ | SQL migration files |
| Validation | Zod `create`, `update` and `filter` schemas |
| Resource engine | Handlers, filter/sort allow-lists, eager-load allow-lists |
| Auth | Permission catalogue entries, field-level rules |
| OpenAPI | Schemas, paths, parameters, examples |
| Manifest | `/.well-known/strutvane.json` for the UI and SDKs |
| Factories | Faker-based default factory per field type |
| Types | `Model<'Invoice'>`, `CreateInput<'Invoice'>`, typed relations |

### Options (per model)

| Option | Default | Effect |
|--------|---------|--------|
| `table` | snake_case plural | Table name |
| `id` | `uuidv7` | `uuidv7` \| `uuid` \| `ulid` \| `bigserial` |
| `timestamps` | `true` | `created_at`, `updated_at` (+ `created_by`, `updated_by` when auth is present) |
| `softDeletes` | `false` | `deleted_at`; default scopes; restore/forceDelete routes |
| `tenant` | from app config | `tenant_id` column + composite indexes + RLS policy + scoped queries |
| `audit` | `false` | Audit events for mutations (and reads if `{ reads: true }`) |
| `versioning` | `false` | Revision history table and restore-to-revision (Directus-style) |
| `api` | `true` | `false` keeps the model internal (no routes) |
| `ui` | `true` | `false` hides it from the UI |
| `title` | first string field | Display field |
| `searchable` | fields marked `.searchable()` | Postgres FTS (`tsvector` + GIN), `LIKE` fallback on MySQL/SQLite; search adapters later |
| `indexes` | — | Composite/partial/unique indexes |

## 3. Migrations

### 3.1 Model-first (default)

```
$ pnpm sv migrate
◇ Comparing models with database "acme" (postgres)…
│  + create table invoices (11 columns, 3 indexes, RLS policy tenant_isolation)
│  ~ alter table customers add column vat_number varchar(32) null
│  ! rename? customers.phone → customers.phone_number   [r]ename / [d]rop+add / [s]kip
◇ Wrote database/migrations/2026_11_13_143012_create_invoices_alter_customers.sql
◆ Apply now? › Yes
✔ Applied 1 migration (182 ms)
```

**Rules:**

- **Generated SQL is the artefact.** Migration files are plain SQL (with an optional `.ts` sidecar for data steps). They are committed, reviewed in PRs and **immutable once applied**. Drift is detected (`sv migrate:status`) and edited applied migrations fail CI.
- **Destructive changes need confirmation.** Drop, type narrowing and NOT NULL without a default require interactive confirmation or `--allow-destructive` in CI.
- **Renames are asked, never guessed silently.** Answers are recorded in the migration file header.
- **Zero-downtime helpers.** Opt-in two-phase migrations ("expand/contract"): add column → backfill job → enforce constraint → drop old.
- **Tenancy strategies:**
  - *shared*: a single migration run.
  - *schema*: run per tenant schema, in parallel with a concurrency limit.
  - *database*: run per tenant connection, resumable, with a progress report.
- **Locking.** An advisory lock on Postgres and `GET_LOCK` on MySQL prevent concurrent migrators across replicas.

### 3.2 Manual migrations (Laravel style, for special cases)

```ts
// database/migrations/2026_11_13_150000_backfill_invoice_numbers.ts
import { defineMigration } from '@strutvane/framework/database'
export default defineMigration({
  async up({ schema, db }) {
    await schema.alterTable('invoices', (t) => t.string('legacy_ref', 64).nullable().index())
    await db.update('invoices').set({ legacy_ref: sql`number` })
  },
  async down({ schema }) { await schema.alterTable('invoices', (t) => t.dropColumn('legacy_ref')) },
})
```

### 3.3 Brownfield databases

`sv db:pull` introspects an existing database and writes `app/models/*.model.ts`, including relations inferred from FKs. Ambiguities are listed for review. This makes Strutvane usable on legacy enterprise DBs, the main reason teams choose Directus today.

### 3.4 Package migrations

A package can ship SQL migrations that `sv migrate` applies together with the app's own, so installing it needs no separate migration step. The package declares `"strutvane": { "migrations": "./migrations" }` in its package.json and ships `<folder>/<dialect>/*.sql` (`postgres` or `sqlite`; statements separated by `--> statement-breakpoint`, as in the app's own `.sql` files). A package without a folder for the app's dialect contributes nothing.

**Which packages count.** Package migrations run as the database owner role, so the framework applies only the folders the CLI vetted and hands to the command (`ctx.packageMigrations()`): a direct dependency of the app, with a contributor name, enabled by a value import in `strutvane.config.ts`, with a satisfied `strutvane.compat` when third-party, and a folder that resolves inside the package. The full rule, and what `sv doctor` reports, is in [17 §6.1](17-integration-map.md#61-contributions-declared-in-packagejson-loaded-by-the-cli). The framework never scans `node_modules`, applies no package migrations when given none, and re-checks with `realpath` that every dialect folder and `.sql` file stays inside the package.

**Order and tracking.**

- The app's migrations (`database/migrations/*.sql` and `*.ts`) and the package migrations form **one list sorted by name**. Names start with a timestamp, so the order is chronological across the app and its packages. Two migrations with the same name stop the run.
- Pending migrations, the app's and the packages', are applied in that order in one transaction (under the migration advisory lock on PostgreSQL) and recorded in the same migrations table with their checksum. A package migration is pending until applied, whatever its timestamp, so a package added later still gets its migrations applied.
- Drift rules are the same as for the app's files: a package migration whose content changed after it was applied (for example after a package upgrade) is drift, and so is an applied package migration that is no longer provided (the package was removed or is no longer enabled). `sv migrate` refuses to run while there is drift.
- `sv migrate --pretend` lists the package migrations with their package (they run if not applied yet); `Applied …` lines name the package; `sv migrate:status` has a `Source` column (`app` or the package name).

**Auth's identity tables.** `@strutvane/auth` ships its identity and rate-limit tables as a package migration (`migrations/postgres/<timestamp>_strutvane_auth_identity.sql`, written with `IF NOT EXISTS`, so it is idempotent). On PostgreSQL, `sv migrate` therefore creates them; the separate `sv auth:migration` step is no longer needed. That command is kept as an optional tool: it writes the identity SQL into `database/migrations/` for apps that do not use the framework's migrator, or for a schema upgrade ([07 §2.3](07-package-auth.md#23-migrations-default-tables-prefix-configurable-eg-auth_)).

## 4. Seeders & factories

```ts
// database/factories/invoice.factory.ts (generated; field-type defaults, editable)
export default defineFactory(Invoice, ({ faker, related }) => ({
  number: faker.string.alphanumeric(8).toUpperCase(),
  customer: related('Customer'),
  amount: faker.number.float({ min: 10, max: 10_000, fractionDigits: 2 }),
  status: faker.helpers.arrayElement(['draft', 'sent', 'paid']),
  dueDate: faker.date.soon({ days: 60 }),
}))
// usage: await factory(Invoice).count(20).state({ status: 'paid' }).forTenant(t).create()
```

- `database/seeders/database.seeder.ts` orchestrates the order.
- `sv db:seed --class InvoiceSeeder` runs a single seeder.
- Seeders are tenant-aware: `--tenant acme` or all tenants.

## 5. The resource engine (CRUD API)

### 5.1 Default endpoints

These match the list in [05 §5](05-developer-experience.md#5-what-happens-automatically-no-files-needed).

### 5.2 List query semantics

| Feature | Wire format | Notes |
|---------|-------------|-------|
| Filter | `filter[status][in]=draft,sent`, `filter[amount][gte]=100`, `filter[customer.name][contains]=acme` | Operators per field type: `eq ne gt gte lt lte in nin contains startsWith endsWith between isNull` + JSON path for `json` fields. **Only `filterable` fields.** |
| Search | `search=quarterly` | Across `searchable` fields |
| Sort | `sort=-dueDate,number` | Only `sortable` fields, with a stable tiebreak on id |
| Pagination | `page[size]=25&page[cursor]=…` (default, keyset) or `page[number]=3` | Max page size enforced; `meta.total` optional (costly counts are opt-in) |
| Include | `include=customer,lines` | Allow-listed relations, N+1-safe batched loading, depth limit |
| Sparse fields | `fields[invoices]=id,number,amount` | Combined with field-level permissions |
| Complex | `POST /query` with a `QueryFilter` AST | For UI advanced filters and saved views |

Response:

```json
{ "data": [ { "id": "01J…", "number": "INV-0042", "amount": "1200.00", "status": "sent" } ],
  "meta": { "page": { "size": 25, "nextCursor": "…", "hasMore": true } },
  "links": { "next": "/api/v1/invoices?page[cursor]=…" } }
```

### 5.3 Pipeline and extension points

`parse → validate → authorize → scope (tenant + policy filter) → hooks.before → handler → hooks.after → audit/outbox → serialize`

| Extension | Where |
|-----------|-------|
| Hooks | `beforeList`, `beforeShow`, `beforeCreate`, `afterCreate`, `beforeUpdate`, `afterUpdate`, `beforeDelete`, `afterDelete`, `beforeRestore`, `transformResponse` |
| Custom actions | `actions: { approve: { permission, input, handler, ui } }` → `POST /:id/approve` |
| Collection actions | `collectionActions: { import: … }` → `POST /import` |
| Handler override | `handlers: { list: (ctx, next) => … }` (middleware-style; call `next` or replace) |
| Services | Business logic in `app/services/*`, injected via the container |
| Eject | `sv eject api Invoice` → a full controller file (L3) |

### 5.4 Custom routes (when CRUD is not the shape)

```ts
// app/http/routes/api.ts
import { route } from '@strutvane/framework/http'
export default [
  route.post('/reports/revenue', {
    permission: 'report.revenue',
    input: z.object({ from: z.coerce.date(), to: z.coerce.date() }),
    output: RevenueReport,                                // → OpenAPI response schema
    handler: async ({ input, actor }) => reports.revenue(actor.tenantId, input),
  }),
]
```

Typed input and output flow into OpenAPI and the generated client automatically.

### 5.5 API documentation (`/openapi.json` and `/docs`)

The framework serves the app's OpenAPI 3.1 document (resources and custom routes) at `GET /openapi.json` and a readable HTML page for the same document at `GET /docs`. Both follow **one visibility rule** (`openapi` option of the HTTP app, set from `config/api.ts` `docs` / `API_DOCS`):

| Setting | `APP_ENV=local` | Any other `APP_ENV` |
|---------|-----------------|---------------------|
| `docs: true` (the default) | public | identified callers only (anonymous requests get 401) |
| `docs: false` (`API_DOCS=false`) | not served | not served |

Why not public everywhere: the document lists every resource, field and filter, a map an anonymous visitor of a production API does not need. The generated `.env.example` ships `API_DOCS=false`; the local `.env` turns it on.

The `/docs` page is rendered on the server with no script at all. A docs UI loaded from a CDN would need a page CSP that allows third-party scripts on the API's origin, and an inline renderer would need `'unsafe-inline'` scripts. The page's own CSP allows only inline styles (`default-src 'none'; style-src 'unsafe-inline'; …; frame-ancestors 'none'`), every value taken from the document is HTML-escaped (model names, descriptions and enum values come from app code), responses are `Cache-Control: no-store`, and the page links to `/openapi.json` for tools such as Postman or a generated client.

## 6. Database providers

| Provider | Tier | Driver | Special handling |
|----------|------|--------|------------------|
| PostgreSQL 16–18 | 1 | `pg` | RLS, FTS, native enums, JSONB, advisory locks, `SET LOCAL` per transaction |
| Azure Database for PostgreSQL – Flexible Server | 1 | `pg` + `@azure/postgresql-auth` | Entra ID passwordless (token as password, refreshed per new connection), `ssl.rejectUnauthorized: true`, managed identity support |
| Neon / Supabase / AWS RDS & Aurora PG / Google Cloud SQL | 1 | `pg` (+ serverless drivers where useful) | Presets for SSL and pooling (PgBouncer transaction mode compatible) |
| MySQL 8.4 LTS | 2 | `mysql2` | App-level tenancy (no RLS), FULLTEXT search, `GET_LOCK` |
| Azure Database for MySQL – Flexible Server | 2 | `mysql2` + Entra token | Same token approach *(to be verified in Phase 4)* |
| PlanetScale / MariaDB 11 | 2 | `mysql2` | FK caveats documented |
| SQLite / libSQL (Turso) | 2 | `better-sqlite3` / `@libsql/client` | Zero-setup dev and tests; app-level tenancy only |
| MSSQL / Azure SQL | 3 (post-1.0) | `tedious` | Waits on Drizzle v1 MSSQL stabilising |

**Feature support matrix:** every feature declares its tiers. `sv doctor` warns, for example, "tenancy=shared on MySQL: no DB-level RLS; app-level scoping only".

## 7. Performance & scalability defaults

- Keyset pagination by default. No `COUNT(*)` unless requested. Batched relation loading.
- Connection pooling with sane limits. A read-replica connection option (`readFrom: 'replica'` per resource or query).
- Cache-aside helpers. HTTP caching (`ETag` / `If-None-Match`) for show and list endpoints.
- Indexes are generated for FKs, `tenant_id` composites, `filterable`/`sortable` fields, and soft-delete partial indexes.
- Request timeouts, query timeouts and body-size limits are on by default.
- Benchmarks in CI (k6): p95 list endpoint under 50 ms at 1k rows/page-25 on reference hardware, with regressions failing CI ([13](13-testing-strategy.md)).

## 8. What `sv new --preset api` produces

The same layout as [05 §3](05-developer-experience.md#3-the-generated-project) without `web/`, including:

- `config/*.ts` for app, database, api, cors, cache, queue, mail, logging and observability
- `.env` (secrets generated) and `.env.example` (documented)
- `env.ts` validation
- `app/providers/app.provider.ts`
- `app/http/routes/api.ts`, plus `/health` and `/ready`
- `database/{migrations,seeders,factories}`
- `tests/` with an example feature test
- `docker/compose.yaml` with Postgres/MySQL, Valkey and Mailpit (local, git-ignored)
- Biome + TS + Vitest configs, a project README with every command, a GitHub Actions CI workflow, `.gitignore`, `.editorconfig`, `.nvmrc`

## 9. Open questions

1. Should there be a GraphQL projection of models (`/graphql`) as an optional module? *(Lean: post-1.0 plugin.)*
2. Should realtime subscriptions on resources (SSE/WebSocket) live in framework or in a future `realtime` package? *(Lean: future package; framework emits events.)*
3. Should the default ID be UUIDv7 or bigserial plus a public ID? *(Lean: UUIDv7. Simple, sortable, non-enumerable.)*
