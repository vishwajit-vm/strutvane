# 05 — Developer Experience: From Zero to a Running B2B App in 1–2 Hours

This is the most important document in the blueprint. Every package decision exists to make this journey true.

## 1. The journey (target timings)

| Minute | Developer does | Strutvane does |
|--------|----------------|----------------|
| 0 | `npm create strutvane@latest acme` | Interactive prompts (§2) |
| 2 | — | Generates the full project: configs, `.env` + `.env.example` (with a generated `APP_KEY`), local Docker services, auth tables, admin user seed, UI shell, tests, README |
| 3 | `cd acme && pnpm sv up` | Starts local Docker services (DB, Valkey, Mailpit), waits for health checks, runs migrations and seeds |
| 4 | `pnpm dev` | API on `:3000/api/v1`, API docs on `:3000/docs`, UI on `:3000`. Login with the seeded admin. |
| 5–60 | `pnpm sv make:model Customer`, `Invoice`, `Product` … edit fields | Each model gets a migration, factory, seeder, policy, CRUD API, permissions, menu entry and UI pages: list, create, edit, detail |
| 60–100 | Tweak labels, validation, a custom action ("Approve invoice"), a dashboard widget | L1/L2 customisation (§6). No regeneration needed. |
| 100–120 | `pnpm test`, `pnpm build` | Generated tests, including cross-tenant and permission tests, pass. A production build is ready. |

## 2. `npm create strutvane@latest`

```
◆  Project name › acme
◆  What are you building?
│  ● Full-stack app   (API + UI + auth)          ← preset: full
│  ○ API only         (framework [+ auth])        ← preset: api
│  ○ UI only          (connect to an existing API) ← preset: ui
◆  Database › PostgreSQL | MySQL | SQLite | Azure Database for PostgreSQL | Azure Database for MySQL
◆  Authentication › Email + password · Magic link · Google · Microsoft (Entra ID) · GitHub · SSO (SAML/OIDC, later)
◆  Multi-tenant (organisations/workspaces)? › No | Yes (shared DB + row-level security)
◆  Extras › Queue & jobs · Cache · Mail · Audit log · OpenTelemetry · API versioning
◆  Local services with Docker (git-ignored)? › Yes
◆  Package manager › pnpm | npm | yarn | bun
◆  Initialise git? › Yes
```

Every prompt has a flag, for CI and scripting:

```bash
npm create strutvane@latest acme -- --preset full --db postgres --auth email,google --tenancy shared \
  --extras queue,cache,mail,audit,otel --docker --pm pnpm --yes
```

## 3. The generated project

### 3.1 Layout (preset `full`)

```
acme/
├─ app/                              ← your application code (owned)
│  ├─ models/
│  │  └─ user.model.ts               (from auth; extendable)
│  ├─ resources/                     ← optional per-model API behaviour (hooks, actions, overrides)
│  ├─ policies/                      ← per-model authorization rules
│  ├─ services/                      ← business logic
│  ├─ http/
│  │  ├─ routes/api.ts               ← custom routes (CRUD routes are auto-registered)
│  │  ├─ middleware/
│  │  └─ controllers/                ← custom controllers (optional)
│  ├─ jobs/  events/  listeners/  mail/  commands/
│  └─ providers/app.provider.ts      ← boot-time wiring (like Laravel's AppServiceProvider)
├─ config/                           ← typed config, reads validated env
│  ├─ app.ts  database.ts  auth.ts  tenancy.ts  api.ts  cors.ts  cache.ts
│  ├─ queue.ts  mail.ts  logging.ts  observability.ts  ui.ts
├─ database/
│  ├─ migrations/                    ← auto-generated SQL, reviewed and committed
│  ├─ seeders/   database.seeder.ts
│  └─ factories/
├─ web/                              ← UI (preset full | ui)
│  ├─ app.tsx  router.tsx
│  ├─ pages/                         ← optional page overrides (auto pages need no files)
│  ├─ components/ui/                 ← owned components (shadcn-registry style)
│  ├─ layouts/  dashboard/  theme/tokens.css
├─ tests/  feature/  unit/  e2e/
├─ storage/  logs/  app/             (git-ignored)
├─ docker/   compose.yaml            (LOCAL ONLY, git-ignored by default)
├─ .strutvane/                       (generated registry + types; git-ignored, rebuilt on dev/build)
├─ .env                              (git-ignored)
├─ .env.example                      (committed: every key, documented)
├─ strutvane.config.ts               ← which packages/providers are active
├─ package.json  tsconfig.json  biome.json  vitest.config.ts  playwright.config.ts
└─ README.md                         ← project-specific: how to run, commands, env reference
```

- Preset `api` omits `web/` and Playwright.
- Preset `ui` omits `app/`, `database/` and `config/database.ts`, and adds `config/api-client.ts` pointing at the remote API's OpenAPI.

### 3.2 `.env.example` (generated, grouped and documented; keys depend on choices)

```dotenv
# ─── Application ────────────────────────────────────────────────
APP_NAME=acme
APP_ENV=local                 # local | test | staging | production
APP_KEY=                      # 32-byte base64. Generate: pnpm sv key:generate
APP_URL=http://localhost:3000
APP_PORT=3000
APP_DEBUG=true                # never true in production (boot refuses)
APP_TIMEZONE=UTC
APP_LOCALE=en

# ─── Logging & Observability ────────────────────────────────────
LOG_LEVEL=info                # trace | debug | info | warn | error
LOG_FORMAT=pretty             # pretty | json
OTEL_ENABLED=false
OTEL_SERVICE_NAME=acme-api
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318

# ─── Database ───────────────────────────────────────────────────
DB_CONNECTION=postgres        # postgres | mysql | sqlite | azure-postgres | azure-mysql
DB_HOST=127.0.0.1
DB_PORT=5432
DB_DATABASE=acme
DB_USERNAME=acme
DB_PASSWORD=secret
DB_SSL=false                  # true for any cloud database
DB_POOL_MIN=0
DB_POOL_MAX=10
# DATABASE_URL=postgres://acme:secret@127.0.0.1:5432/acme   # overrides the DB_* keys when set
# Azure passwordless (Entra ID): set DB_AUTH=entra and leave DB_PASSWORD empty
# DB_AUTH=password            # password | entra
# AZURE_CLIENT_ID=            # user-assigned managed identity (optional)

# ─── Cache / Queue (Valkey or Redis protocol) ───────────────────
CACHE_DRIVER=memory           # memory | valkey | database
QUEUE_DRIVER=sync             # sync | valkey | database
VALKEY_URL=redis://127.0.0.1:6379

# ─── Mail ───────────────────────────────────────────────────────
MAIL_DRIVER=smtp              # smtp | ses | resend | postmark | log
MAIL_HOST=127.0.0.1
MAIL_PORT=1025                # Mailpit locally: UI at http://localhost:8025
MAIL_FROM_ADDRESS=no-reply@acme.test
MAIL_FROM_NAME="${APP_NAME}"

# ─── Auth (@strutvane/auth) ─────────────────────────────────────
AUTH_SECRET=                  # generated; rotate with: pnpm sv auth:secret:rotate
AUTH_SESSION_DRIVER=database  # database | valkey | jwt
AUTH_SESSION_LIFETIME=120     # minutes idle
AUTH_JWT_TTL=900              # seconds (API tokens)
AUTH_ALLOW_REGISTRATION=true
AUTH_MFA=optional             # off | optional | required
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
AUTH_MICROSOFT_TENANT_ID=
AUTH_MICROSOFT_CLIENT_ID=
AUTH_MICROSOFT_CLIENT_SECRET=
SEED_ADMIN_EMAIL=admin@acme.test
SEED_ADMIN_PASSWORD=          # generated at create time, printed once

# ─── Tenancy ────────────────────────────────────────────────────
TENANCY_ENABLED=true
TENANCY_STRATEGY=shared       # shared | schema | database
TENANCY_RESOLVE=subdomain,header,session

# ─── HTTP / API ─────────────────────────────────────────────────
API_PREFIX=/api
API_VERSION=v1
API_DOCS=true                 # serves /docs (Scalar) and /openapi.json
CORS_ORIGINS=http://localhost:3000
RATE_LIMIT=120/min

# ─── UI (@strutvane/ui) — VITE_ keys are exposed to the browser ──
VITE_APP_NAME="${APP_NAME}"
VITE_API_URL=/api/v1
```

**Rules:**

- **`env.ts`** (generated) validates every key with Zod at boot. A missing or invalid key fails fast with a human message naming the key and where to set it.
- When a package is added, its installer appends its block to **both** `.env.example` (empty values, comments) and `.env` (local defaults, generated secrets).
- `sv env:check` diffs `.env` against `.env.example` and warns about missing or unknown keys.
- `sv env:encrypt` / `env:decrypt` handle teams that share encrypted env files (optional).

### 3.3 Config files: typed, documented, readable

```ts
// config/database.ts (generated)
import { defineDatabaseConfig } from '@strutvane/framework/database'
import { env } from '../env'

export default defineDatabaseConfig({
  default: env.DB_CONNECTION,
  connections: {
    postgres: { host: env.DB_HOST, port: env.DB_PORT, database: env.DB_DATABASE,
                user: env.DB_USERNAME, password: env.DB_PASSWORD, ssl: env.DB_SSL,
                pool: { min: env.DB_POOL_MIN, max: env.DB_POOL_MAX } },
    'azure-postgres': { host: env.DB_HOST, database: env.DB_DATABASE, user: env.DB_USERNAME,
                        auth: env.DB_AUTH === 'entra' ? { type: 'entra', clientId: env.AZURE_CLIENT_ID }
                                                      : { type: 'password', password: env.DB_PASSWORD },
                        ssl: { rejectUnauthorized: true } },
  },
  migrations: { directory: 'database/migrations', table: 'strutvane_migrations' },
})
```

## 4. Models: field name + type, the rest is ours

### 4.1 Creating a model

Interactive:

```
$ pnpm sv make:model Invoice
◆ Fields (name:type[:modifiers], empty line to finish)
│ number:string:unique
│ customer:belongsTo(Customer)
│ amount:decimal(12,2)
│ status:enum(draft,sent,paid,void):default(draft):filterable
│ dueDate:date:sortable
│ notes:text:optional
│ lines:hasMany(InvoiceLine)
◆ Options › ☑ timestamps ☑ soft deletes ☑ tenant-scoped ☑ audit log ☑ UI pages ☑ API ☑ seed 20 rows
✔ app/models/invoice.model.ts
✔ app/policies/invoice.policy.ts
✔ database/factories/invoice.factory.ts
✔ database/seeders/invoice.seeder.ts
✔ tests/feature/invoice.test.ts
✔ permissions: invoice.viewAny view create update delete restore forceDelete export
✔ registered: API /api/v1/invoices · UI /invoices · menu "Invoices"
→ run `pnpm sv migrate` to create the table
```

One-liner:

```bash
pnpm sv make:model Invoice number:string:unique customer:belongsTo(Customer) amount:decimal(12,2) \
  "status:enum(draft,sent,paid,void):default(draft)" dueDate:date notes:text:optional --all
```

### 4.2 The model file (this is the whole definition)

```ts
// app/models/invoice.model.ts
import { defineModel, field } from '@strutvane/framework'

export default defineModel('Invoice', {
  number:   field.string().unique().searchable(),
  customer: field.belongsTo('Customer').required().filterable(),
  amount:   field.decimal(12, 2).min(0).sortable(),
  status:   field.enum(['draft', 'sent', 'paid', 'void']).default('draft').filterable(),
  dueDate:  field.date().sortable(),
  notes:    field.text().optional(),
  lines:    field.hasMany('InvoiceLine'),
}, {
  timestamps: true,
  softDeletes: true,
  tenant: true,        // adds tenant_id, RLS policy, tenant-scoped queries
  audit: true,         // every change recorded with actor + diff
  title: 'number',     // used in UI breadcrumbs, selects, search results
})
```

### 4.3 Field type catalogue (v1 target)

| Category | Types | Notes |
|----------|-------|-------|
| Text | `string(len?)`, `text`, `email`, `url`, `phone`, `slug(from)`, `password` (hashed, never serialised), `richText`, `markdown`, `color` | Format validation and the UI widget are inferred |
| Numbers | `integer`, `bigInteger`, `decimal(p,s)`, `float`, `money(currency?)`, `percent` | `money` stores minor units + currency |
| Boolean / choice | `boolean`, `enum([...])`, `set([...])` (multi-select) | Native enum on PG, check constraint elsewhere |
| Date / time | `date`, `time`, `datetime` (tz-aware), `timestamp`, `duration` | Stored UTC, displayed in the user's TZ |
| Identity | `id` (UUIDv7 default; `bigserial` optional), `uuid`, `ulid` | UUIDv7 = sortable and non-guessable |
| Structured | `json(schema?)`, `array(of)`, `address`, `geoPoint` | `json(schema)` is validated with Zod |
| Relations | `belongsTo`, `hasOne`, `hasMany`, `manyToMany(through?)`, `morphTo` / `morphMany` (polymorphic) | FKs, indexes, eager-load allow-lists, UI relation pickers |
| Files *(with the future `files` package)* | `file`, `image`, `files` | Storage adapters (S3, Azure Blob, local) |
| Computed | `computed(fn)`, `virtual(sql)` | Read-only, not stored or stored as generated columns |

**Modifiers (chainable):**

- Constraints: `required` / `optional`, `nullable`, `unique`, `index`, `default(v)`
- Validation: `min/max/length/regex`, `validate(zodSchema)`
- List behaviour: `searchable`, `filterable(ops?)`, `sortable`
- Visibility: `hidden` (never in API), `readOnly`, `writeOnce`, `sensitive` (redacted in logs and audit)
- UI: `label('…')`, `help('…')`, `placeholder`, `widget('…')`, `column({ width, visible })`
- Lifecycle and access: `since('v2')`, `deprecated()`, `permission({ read, write })` (field-level RBAC)

## 5. What happens automatically (no files needed)

When a model exists and `pnpm dev` is running (watch mode) or `sv build` runs:

1. **Registry compile.** `.strutvane/registry.gen.ts` collects models, policies, resources, custom routes, jobs, listeners, commands and UI page overrides into a typed registry.
2. **API.** For each model with `api: true` (default), these routes are registered:

   ```
   GET    /api/v1/invoices              list   (filter, search, sort, cursor|offset pagination, include, fields)
   GET    /api/v1/invoices/:id          show
   POST   /api/v1/invoices              create  (validated from the model)
   PATCH  /api/v1/invoices/:id          update  (partial, validated)
   PUT    /api/v1/invoices/:id          replace (optional)
   DELETE /api/v1/invoices/:id          delete  (soft if softDeletes)
   POST   /api/v1/invoices/:id/restore  restore
   POST   /api/v1/invoices/bulk         bulk create/update/delete (transactional, opt-in)
   GET    /api/v1/invoices/export       CSV/XLSX export (permission: invoice.export)
   POST   /api/v1/invoices/query        complex filter AST (JSON body)
   ```

   Each route goes through validation, authorization (policy + field rules + tenant scope), hooks, audit, events, problem+json errors and OpenAPI docs.
3. **Permissions.** `invoice.viewAny|view|create|update|delete|restore|forceDelete|export` plus custom actions are synced to the auth permission catalogue. The default role mapping comes from `config/auth.ts`, e.g. admin = all, member = view+create+update own.
4. **OpenAPI 3.1** at `/openapi.json` and interactive docs at `/docs`. A typed client SDK (`.strutvane/client.gen.ts`) is used by the UI and can be exported for other apps (`sv api:client --out ../mobile/src/api`).
5. **UI.** Routes and pages, all permission-aware:
   - `/invoices`: data table with search, filter chips, sort, column toggles, pagination, bulk actions, export, saved views
   - `/invoices/new` and `/invoices/:id/edit`: form with widgets inferred from field types, relation pickers, client + server validation
   - `/invoices/:id`: detail page with relation tabs (lines) and an "Activity" tab (audit)
   - a sidebar menu entry, breadcrumbs and global search
6. **Tests.** The generated feature test covers CRUD, validation, permissions (allowed and denied), tenant isolation (a cross-tenant read returns 404) and soft delete.

`pnpm sv routes` prints everything that was registered:

```
METHOD  PATH                         NAME              PERMISSION        SOURCE
GET     /api/v1/invoices             invoices.list     invoice.viewAny   model:Invoice (auto)
POST    /api/v1/invoices/:id/approve invoices.approve  invoice.approve   app/resources/invoice.resource.ts
```

## 6. Customisation without losing the magic

### L1 — Configure (in the model or resource file)

```ts
// app/resources/invoice.resource.ts   (pnpm sv make:resource Invoice)
import { defineResource } from '@strutvane/framework'
import Invoice from '../models/invoice.model'

export default defineResource(Invoice, {
  api: { except: ['replace'], defaultSort: '-dueDate', pageSize: 50, include: ['customer'] },
  ui:  { icon: 'receipt', group: 'Billing', list: { columns: ['number', 'customer', 'amount', 'status', 'dueDate'] } },
})
```

### L2 — Override behaviour (hooks, actions, single handlers, single UI pieces)

```ts
export default defineResource(Invoice, {
  hooks: {
    beforeCreate: async ({ data, actor }) => ({ ...data, number: await nextInvoiceNumber(actor.tenantId) }),
    afterUpdate:  async ({ record, changes, events }) => {
      if (changes.status === 'sent') events.emit('invoice.sent', record)
    },
  },
  actions: {
    approve: {                                  // → POST /api/v1/invoices/:id/approve + UI button
      permission: 'invoice.approve',
      input: z.object({ comment: z.string().optional() }),
      handler: async ({ record, input }) => invoiceService.approve(record, input),
      ui: { label: 'Approve', variant: 'primary', confirm: true, visibleWhen: (r) => r.status === 'sent' },
    },
  },
  handlers: { list: async (ctx, next) => next({ ...ctx, query: ctx.query.where('archived', false) }) },
})
```

```tsx
// web/pages/invoices/columns.tsx   — override one column renderer only
export const amount = ({ row }) => <Money value={row.amount} currency={row.currency} />
```

### L3 — Eject (full ownership of generated source)

```bash
pnpm sv eject api Invoice            # writes app/http/controllers/invoice.controller.ts (full CRUD code)
pnpm sv eject ui Invoice --page form # writes web/pages/invoices/form.tsx (full form code)
pnpm sv eject ui --components        # copies every UI component into web/components/ui
```

- Ejected files are recorded in `.strutvane/lock.json`.
- On framework upgrades, `sv upgrade` applies template changes to ejected files by **three-way merge**: original template → new template, merged into your edited file. Conflicts get standard markers plus a summary. Changes are never silently dropped.

## 7. Adding packages later

```bash
pnpm sv add auth     # → config/auth.ts, auth migrations, /api/v1/auth/* routes, login/register/forgot/reset/
                     #   verify/profile/MFA screens, Users/Roles/Permissions admin, admin seed, env keys,
                     #   all existing resources now protected by generated permissions
pnpm sv add ui       # → web/ shell, layouts, theme, pages for every existing model, auth screens if auth exists
pnpm sv remove ui    # reverses the installer (keeps your edited files, lists them)
pnpm sv add notify   # future first-party packages use the same installer protocol
```

## 8. API-only and UI-only modes

- **API only.** Everything above minus `web/`. The UI-related metadata (`ui:` options) is still accepted and published in the manifest, so a separate UI repo (`--preset ui`) or a mobile app can consume it.
- **UI only.** Point at any API:
  - `VITE_API_URL` + `API_OPENAPI_URL`.
  - With a Strutvane backend, the UI reads `/.well-known/strutvane.json` (rich metadata: labels, relations, permissions, actions).
  - With any other OpenAPI 3.x API, it infers resources from paths and schemas. A `ui.resources.ts` file maps or overrides anything inference gets wrong.
  - Auth works through provider interfaces: Strutvane auth, OIDC (Entra ID/Okta/Keycloak) or custom.

## 9. Daily commands (the "artisan" feel)

```bash
pnpm dev                    # API + UI + watchers (registry, types, migrations check)
pnpm sv make:model | make:resource | make:policy | make:action | make:job | make:event | make:listener
pnpm sv make:mail | make:command | make:seeder | make:factory | make:migration | make:test | make:page
pnpm sv migrate [--dry-run] | migrate:status | migrate:rollback | migrate:fresh --seed | db:seed | db:pull
pnpm sv routes | sv models | sv permissions | sv doctor | sv env:check | sv about
pnpm sv tinker              # typed REPL with app + models loaded
pnpm sv queue:work | schedule:run | cache:clear
pnpm sv up | sv down        # local Docker services (git-ignored compose file)
pnpm test | pnpm build | pnpm start
```

The full command reference is in [09](09-cli-reference.md).

## 10. DX quality bars (release-blocking)

- `npm create strutvane` to first page load in **≤ 3 minutes** on a typical laptop with Docker installed (≤ 90 s with SQLite and no Docker).
- `make:model` to working API + UI in **≤ 10 seconds**, with no restart.
- Every error message names the cause, the file and the fix, with a docs link.
- The generated project passes `typecheck`, `lint` and `test` with zero warnings.
- Windows, macOS and Linux are first-class (CI matrix). No bash-only scripts in generated projects.
