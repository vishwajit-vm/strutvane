# 04 — Architecture

## 1. Layers

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Developer's app  (app/ config/ database/ web/ — owned code)                  │
├──────────────────────────────────────────────────────────────────────────────┤
│ First-party packages — each installable alone, each self-installing          │
│   @strutvane/framework   @strutvane/auth   @strutvane/ui                     │
│   (future) notify · files · payments · billing · logs · reports · analytics  │
├──────────────────────────────────────────────────────────────────────────────┤
│ Drivers / adapters (subpath exports first, split into packages when heavy)   │
│   db: postgres · mysql · sqlite · azure-postgres · azure-mysql               │
│   http: hono (default) · express · fastify · nest                            │
│   identity: better-auth (default) · oidc · saml · native                     │
│   cache/queue: memory · valkey · database   mail: smtp · ses · resend · log  │
├──────────────────────────────────────────────────────────────────────────────┤
│ @strutvane/core — kernel: Application, container, service providers, config, │
│                   env, context (AsyncLocalStorage), hooks, events, logger,   │
│                   errors, plugin host, registry runtime                      │
│ @strutvane/devkit — installer + generator + plugin SDK (used by CLI, authors)│
├──────────────────────────────────────────────────────────────────────────────┤
│ @strutvane/contracts — TYPES + PROTOCOLS ONLY, zero runtime dependencies     │
└──────────────────────────────────────────────────────────────────────────────┘
        strutvane CLI (unscoped launcher → @strutvane/cli) drives every layer
```

### Dependency rules (CI-enforced with a boundary linter)

1. `contracts` → nothing.
2. `core` → `contracts`.
3. `framework`, `auth` and `ui` → `core` + `contracts`. **They never import each other.**
4. Drivers/adapters → their package + the third-party library. Heavy third-party libs are **optional peer dependencies**, so you install only the driver you use.
5. `cli` → `core` + `devkit`. It loads package installers and commands **from the user's project** at runtime, so the CLI version always matches the project.
6. Cross-package cooperation happens only through **contracts resolved via the container** (e.g. `framework` asks for a `PermissionProvider`; `auth` provides one).

This is what makes the packages independent but seamlessly integrated: each one is useful alone, and together they light up automatically.

## 2. The kernel (`@strutvane/core`)

Laravel's power comes from a small set of kernel ideas. We keep the ideas and express them in idiomatic, type-safe TS (no decorators or reflection required).

| Concept | Strutvane form | Purpose |
|---------|----------------|---------|
| **Application** | `createApp(config)` → `app.boot()` | Lifecycle: register → boot → serve / run command / run worker |
| **Container** | Typed tokens: `const Mailer = token<Mailer>('mailer')`, `app.bind(Mailer, () => new SmtpMailer())`, `app.make(Mailer)` | Swappable services, scoped per request when needed. No reflection. |
| **Service providers** | `defineProvider({ register(app), boot(app) })` | How every package and app module plugs in (auth, ui, queue…) |
| **Config** | `config/*.ts` with `defineXConfig()`; `config('database.default')` typed access | Typed, validated, environment-aware |
| **Env** | `env.ts` (Zod schema), loaded once, frozen | Fail-fast validation, no `process.env` sprawl |
| **Context** | AsyncLocalStorage: `requestId`, `traceId`, `actor`, `tenant`, `locale`, `transaction` | Implicit, safe access to the current actor and tenant anywhere |
| **Hooks** | Typed lifecycle hooks with ordering and short-circuit | Extension without forking |
| **Events** | `events.emit('invoice.sent', payload)`; listeners auto-registered; sync or queued | Decoupling; feeds webhooks, notify, analytics |
| **Errors** | Typed error classes → RFC 9457 problem+json | Consistent API errors |
| **Logger** | pino-based, context-enriched, redacting | Structured logs |
| **Plugin host** | Packages register providers, commands, generators, field types, UI extensions | One extension model for first- and third-party packages |
| **Registry runtime** | Loads `.strutvane/registry.gen.ts` | Zero-config discovery (§3) |

## 3. Convention-based discovery and the typed registry

Laravel discovers routes, commands and providers by convention. We do the same, but compile the result into a **typed, inspectable file** instead of scanning the filesystem at runtime:

```
app/models/*.model.ts         → models + auto CRUD + permissions + UI resources
app/resources/*.resource.ts   → API/UI behaviour for a model (hooks, actions, overrides)
app/policies/*.policy.ts      → authorization rules
app/http/routes/*.ts          → custom routes
app/jobs/*.job.ts             → queue jobs
app/listeners/*.listener.ts   → event listeners
app/commands/*.command.ts     → custom CLI commands
app/providers/*.provider.ts   → app service providers
web/pages/**                  → UI page overrides
          │
          ▼  (compiled by `pnpm dev` watcher, `sv build`, `sv registry:build`)
.strutvane/registry.gen.ts    → typed imports + metadata (git-ignored, deterministic)
.strutvane/types.gen.ts       → augmented types (e.g. typed route names, permission strings, model types)
.strutvane/client.gen.ts      → typed API client used by the UI
```

- **Why compile instead of scanning at runtime?** Fast cold starts (serverless-friendly), bundler-friendly, type-safe (`can('invoice.aprove')` is a compile error), and fully inspectable (`sv routes`, `sv models`, `sv permissions`).
- **Determinism:** the same inputs always produce the same registry. CI runs `sv registry:check`.

## 4. Levels of control (the key DX idea)

The tension in the brief is that developers want the framework to "handle everything" *and* "own every line". We resolve it with four levels, chosen per model, per action and per UI piece:

| Level | What the developer writes | What the framework does | Typical use |
|-------|---------------------------|-------------------------|-------------|
| **L0 Declare** | Model fields only | Full CRUD API, validation, permissions, OpenAPI, UI pages, tests | 70% of B2B screens |
| **L1 Configure** | Options in the model/resource (`label`, `filterable`, `pageSize`, `columns`, `group`) | Same engine, different behaviour | Most remaining screens |
| **L2 Override** | Hooks, custom actions, a single handler, a single column/widget/page file | Engine runs everything else | Business rules, custom flows |
| **L3 Eject** | Full source of a controller or page, copied into the app | Nothing; it's your code. Upgrades are offered via three-way merge. | Truly bespoke screens and endpoints |

### Why this beats both "generate everything" and "runtime black box"

| Approach | Problem | Strutvane |
|----------|---------|-----------|
| Heavy codegen (Amplication, Redwood scaffolds) | Thousands of generated lines; regeneration conflicts with edits | Thin files: adding a field needs **no regeneration** |
| Runtime engine (Payload admin, Directus, Strapi) | Can't see, step through or replace internals | The engine is plain TS in the open; override at any granularity; eject to source |

### Regeneration and upgrade safety (for L3 files)

1. `.strutvane/lock.json` records each ejected file's template id, template version and content hash at ejection.
2. `.strutvane/base/` stores the pristine original template output.
3. `sv upgrade` / `sv generate --update` computes `merge(base, newTemplate, yourFile)` (diff3). Clean merges apply; conflicts get markers plus a report. `--dry-run --diff` previews everything.
4. Golden tests in our CI guarantee templates merge cleanly across adjacent minor versions.

## 5. Request lifecycle (framework + auth + ui installed)

```
HTTP request ─► Host (Hono default | Express | Fastify | Nest adapter)
  └─► Global middleware: requestId, OTel span, security headers, CORS, body limits, rate limit
      └─► core.context.run({ requestId, traceId })
          └─► auth middleware (if installed): session/JWT/API key → Actor; tenant resolver → TenantContext
              └─► Router (from registry) → Resource pipeline:
                  1. parse ListQuery / body
                  2. validate (Zod from the model)
                  3. authorize: PermissionProvider.can(actor, 'invoice.update', record)
                     + field rules + tenant scope (QueryFilter AST compiled to SQL)
                  4. begin transaction: SET LOCAL app.tenant_id / app.actor_id (Postgres RLS)
                  5. hooks.before*  → handler (default CRUD | override | ejected controller) → hooks.after*
                  6. audit.record(AuditEvent) + outbox.write(DomainEvent)     ← same transaction
                  7. commit → serialize (field visibility) → response | problem+json
  Outbox relay ─► queue (BullMQ on Valkey or Postgres) ─► listeners, webhooks, notify, search index
```

If `auth` is *not* installed, the framework uses a `PermissionProvider` from config:

- `allowAll` is allowed only when `APP_ENV=local`, and logs a warning banner.
- Production boot **refuses** to start without an explicit provider or `security.publicApi: true`.

## 6. Shared contracts (`@strutvane/contracts`)

| Contract | Purpose |
|----------|---------|
| `Actor` | `{ id, type: user\|service\|system, tenantId?, roles, permissions?, attrs }` |
| `TenantContext` | `{ id, strategy: shared\|schema\|database, connection?, region? }` |
| `PermissionProvider` / `Decision` | `can(actor, action, resource?, ctx?) → { allowed, reason, filter? }`; `filterFor(actor, action, model) → QueryFilter` |
| `QueryFilter` AST | Portable predicate tree: auth → backend SQL; UI filter chips → API |
| `ListQuery` | Wire protocol: `filter[field][op]=`, `sort=-a,b`, `page[size]`, `page[cursor]` / `page[number]`, `include`, `fields`, `search` |
| `ResourceManifest` | Models, fields (type, label, validation, widget), relations, actions, permissions per actor. Served at `/.well-known/strutvane.json` and as `x-strutvane-*` OpenAPI extensions. |
| `Problem` | RFC 9457 + `code`, `traceId`, `fieldErrors` |
| `AuditEvent` | Actor, tenant, action, resource, before/after/diff (redacted), request metadata |
| `DomainEvent` | `{ type, version, payload, tenant, actor, occurredAt, idempotencyKey }` |
| `Installer` | The protocol every package installer implements (§7) |
| `FieldType` | The interface custom field types implement: DB column, Zod schema, OpenAPI schema, filter operators, UI widget hint |

Contracts follow strict semver. A major bump happens at most yearly, and the previous major is supported for 12 months.

## 7. Installer protocol (how "install backend → full project setup" works)

Every package ships `installer.ts` (built with `@strutvane/devkit`) and declares it in `package.json`:

```jsonc
{ "name": "@strutvane/auth",
  "strutvane": { "installer": "./dist/installer.js", "provider": "./dist/provider.js",
                 "requires": { "@strutvane/core": "^1" }, "enhances": ["@strutvane/framework", "@strutvane/ui"] } }
```

```ts
export default defineInstaller({
  name: 'auth',
  prompts: [{ key: 'methods', type: 'multiselect', choices: ['email', 'magic-link', 'google', 'microsoft', 'github'] }],
  async install({ project, answers, fs, env, deps, config, migrations, has }) {
    await deps.add({ '@strutvane/auth': '^1', 'better-auth': 'catalog:' })
    await fs.template('config/auth.ts', templates.config, answers)
    await env.add('Auth', { AUTH_SECRET: env.secret(32), AUTH_SESSION_DRIVER: 'database', /* … */ })  // .env + .env.example
    await config.registerProvider('@strutvane/auth/provider')              // AST edit via magicast
    await migrations.fromModels(authModels)
    if (has('@strutvane/ui')) await fs.templateDir('web/auth', templates.uiScreens)
    if (has('@strutvane/framework')) await fs.template('database/seeders/admin.seeder.ts', templates.adminSeed)
  },
  async uninstall(ctx) { /* reverse; keep user-edited files and list them */ },
})
```

**Guarantees:**

- **Idempotent:** re-running is a no-op or repairs drift.
- **Transactional:** all file writes are staged and committed at the end. On failure the project is untouched.
- **Previewable:** `--dry-run --diff` shows every change.
- **Git-aware:** the installer warns on a dirty tree and offers to stash.
- **Composable:** `enhances` lets packages add pieces to each other, e.g. auth adds screens when ui is present and ui adds pages when framework is present, in any install order.

## 8. Multi-tenancy, audit, jobs, cache, observability (cross-cutting)

| Concern | Owner | Design summary |
|---------|-------|----------------|
| Tenancy | auth (resolution) + framework (enforcement) | Resolver chain → `TenantContext`; scoped queries + Postgres RLS (`SET LOCAL`); schema/database strategies route connections; cross-tenant tests generated |
| Audit | auth (record model, explorer UI) + framework (emits in the transaction) | Outbox in the same transaction; redaction; optional hash chain |
| Jobs/queues | framework (`/queue`) | `defineJob`, retries with backoff, idempotency keys, scheduled jobs (`defineSchedule`), BullMQ driver (Valkey or Postgres), `sync` driver for dev/tests |
| Cache | framework (`/cache`) | `cache.remember(key, ttl, fn)`, tenant-namespaced keys, tags, memory/Valkey/database drivers |
| Events/outbox | core + framework | `DomainEvent` → outbox → queue → listeners/webhooks |
| Observability | core | OTel traces/metrics/logs (SDK 3), pino logs with trace ids, `/health` and `/ready` endpoints |
| API versioning | framework | `/v1` prefix; per-field `since`/`deprecated`; `Deprecation` + `Sunset` headers; `sv api:version v2` scaffolds a version |
| Mail | framework (`/mail`) | `defineMail` with React Email or plain templates; SMTP/SES/Resend/Postmark/log drivers; Mailpit locally |

## 9. Deployment topologies

| Topology | How |
|----------|-----|
| **Single process** | `pnpm start` serves API + static UI + an in-process worker (small installs) |
| **Split roles** | The same build runs as `sv serve` (API), `sv queue:work` (workers) and `sv schedule:run` (scheduler); UI as static assets on a CDN |
| **Platforms** | Production deployment guides (not committed Docker files in our repo) for Azure Container Apps / App Service, AWS ECS/Fargate, Fly.io, Railway, Render, Kubernetes |
| **Serverless (post-1.0)** | Hono's portability enables an edge/serverless API mode for read-heavy workloads |

**Docker policy (D16):** Docker is a local development tool here. `sv up` / `sv down` manage `docker/compose.yaml`, which is git-ignored by default. Teams can opt in with `--docker=commit`. The `sv docker:prod` command (Phase 4) generates a production Dockerfile on demand for teams that deploy containers. It is never auto-committed.
