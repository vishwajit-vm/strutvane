# 00 — Executive Summary & Canonical Decisions

> This file is the **single source of truth** for decisions. If another document disagrees with it, this file wins until an ADR changes it.

## 1. What we are building

**Strutvane** is a TypeScript framework and package ecosystem for building enterprise B2B applications. What Laravel is to PHP, Strutvane aims to be for TypeScript, without copying PHP idioms.

**The promise:** a developer runs one command, declares models as *field name + type*, and gets the rest:

- database migrations, seeders and factories
- a validated, documented, versioned CRUD API, registered automatically
- authentication, roles and permissions wired into every endpoint
- a complete admin/app UI: list, search, filter, sort, paginate, create, edit, detail, auth screens and user/role management
- tenancy, audit logs, queues, cache, mail, observability and API docs

A realistic B2B app (10–20 models, auth, RBAC, UI) should be **running in 1–2 hours**. Every line of it stays readable, overridable TypeScript in the developer's repo.

```bash
npm create strutvane@latest acme      # choose: Full-stack | API only | UI only
cd acme && pnpm sv make:model Product # add fields: name:string price:decimal status:enum(draft,active)
pnpm sv migrate                       # migration auto-generated from the model and applied
pnpm dev                              # API + docs + UI live: /api/v1/products, /docs, /products
```

## 2. Ecosystem shape (Laravel model, TypeScript-native)

```
                         ┌───────────────────────────────┐
                         │   strutvane  (CLI, bin)       │  npx strutvane / pnpm sv
                         │   create-strutvane (starter)  │  npm create strutvane
                         └──────────────┬────────────────┘
          ┌─────────────────────────────┼─────────────────────────────┐
          ▼                             ▼                             ▼
┌───────────────────┐       ┌───────────────────┐        ┌───────────────────┐
│ @strutvane/       │       │ @strutvane/auth   │        │ @strutvane/ui     │
│   framework       │       │ identity, RBAC,   │        │ API-driven CRUD   │
│ backend + database│◄─────►│ tenancy, audit,   │◄──────►│ UI, auth screens, │
│ (the "Laravel")   │ via   │ auth API + screens│  via   │ layouts, themes   │
└─────────┬─────────┘ contracts └───────┬───────┘contracts└─────────┬─────────┘
          └──────────────┬─────────────┴────────────────────────────┘
                         ▼
          @strutvane/core  (kernel: app container, providers, config, env,
                            context, hooks, events, logger, errors, plugins)
          @strutvane/contracts (types + wire protocols, zero runtime deps)
          @strutvane/devkit (SDK for installers, generators, plugins)

 Future first-party packages: notify · files · payments · billing · logs · reports ·
 analytics · search · realtime · i18n · flags · webhooks · workflows
```

### Who installs what

| I want to… | Install | Command |
|------------|---------|---------|
| Build a full app (API + UI + auth) | framework + auth + ui | `npm create strutvane@latest acme -- --preset full` |
| Build only an API | framework (+ auth) | `npm create strutvane@latest acme -- --preset api` |
| Build only a UI against an existing API (any OpenAPI 3.x) | ui | `npm create strutvane@latest acme -- --preset ui` |
| Add auth to an existing Express/Fastify/Nest/Hono app | auth | `npx strutvane add auth` |
| Add a package later | any | `pnpm sv add ui` · `pnpm sv add auth` |

**Every package installs itself completely.** Its installer:

- adds dependencies
- writes typed `config/*.ts`
- appends documented keys to **`.env` and `.env.example`**
- registers its service provider
- generates migrations, seeders, routes, UI pages and tests
- is idempotent and reversible (`sv remove auth`)

## 3. Canonical decisions

| # | Area | Decision |
|---|------|----------|
| D1 | **Brand** | **Strutvane**: npm scope `@strutvane`, unscoped CLI package `strutvane`, starter `create-strutvane`, GitHub org `strutvane`, domains strutvane.com/.dev/.io/.org (all unregistered on 2026-11-13). Evidence and legal caveats are in [03](03-naming-and-brand.md). |
| D2 | **Package names** | Descriptive capability names under the owned scope: `@strutvane/framework`, `@strutvane/auth`, `@strutvane/ui` (+ `core`, `contracts`, `devkit`, `cli`). The scope makes every name globally unique; descriptive names make them instantly understood. This is the NestJS, Angular and TanStack model, and it scales to 50+ packages without per-package trademark clearance. |
| D3 | **Language/runtime** | TypeScript (strict), ESM-only, Node 26 LTS (minimum Node 24). Bun/Deno best-effort after 1.0. |
| D4 | **Source of truth** | The **model file** (`app/models/*.model.ts`, `defineModel()` with typed `field.*` builders). Migrations, validation, API, OpenAPI, permissions, client types and UI are all derived from it. |
| D5 | **Migrations** | **Model-first, auto-diffed.** `sv migrate` compares models with the DB, writes a timestamped SQL migration file for review/commit, and applies it. Hand-written migrations (`sv make:migration`) with a schema builder are supported for data migrations and special cases. |
| D6 | **Code generation philosophy** | **Metadata-driven, thin generated files.** Generated files are small and call framework helpers, so adding a field needs **no regeneration**: API and UI read the model at runtime. There are four levels of control: L0 declare → L1 configure → L2 override → L3 eject ([04 §4](04-architecture.md#4-levels-of-control-the-key-dx-idea)). Ejected files are owned; regeneration of them uses three-way merge. |
| D7 | **Auto-registration** | Models, resources, policies, routes, jobs, listeners, commands and UI pages are discovered by convention and compiled into a typed registry (`.strutvane/registry.gen.ts`). No manual route wiring. `sv routes` lists everything. |
| D8 | **HTTP** | Hono is the default engine (web-standard Request/Response). Express, Fastify and NestJS adapters let auth and framework mount inside existing apps. |
| D9 | **Data** | Strutvane owns the model DSL and the query/CRUD layer. **Drizzle** is the SQL engine underneath (driver + migrations diff), behind an internal adapter. Kysely is used for raw queries. We are not writing an ORM, and we are not hard-wired to one. |
| D10 | **Databases** | Tier 1: PostgreSQL (incl. Azure Database for PostgreSQL Flexible Server with Entra passwordless, Neon, Supabase, RDS/Aurora). Tier 2: MySQL 8.4 (incl. Azure MySQL Flexible), SQLite/libSQL. Tier 3 (post-1.0): MSSQL/Azure SQL. |
| D11 | **Validation** | Standard Schema as the contract, **Zod 4** as the default implementation (JSON Schema → OpenAPI 3.1). |
| D12 | **Auth** | Native authorization (RBAC + ABAC conditions compiled to SQL, field-level rules), tenancy and audit. Authentication goes through an identity adapter: **Better Auth** is the default, OIDC/SAML enterprise IdPs are supported, and an optional native engine is built on audited primitives. |
| D13 | **Tenancy** | Optional; enabled per app. Shared schema + `tenant_id` + Postgres RLS by default; schema-per-tenant and DB-per-tenant as strategies. |
| D14 | **UI** | React 19, Vite 8, TanStack Router/Query/Table/Form, Tailwind 4 and shadcn-registry components copied into the app (owned). It is a metadata-driven resource renderer with per-field/per-page overrides and full ejection. Next.js / TanStack Start targets come after 1.0. Vue later. |
| D15 | **Project layout** | One project, Laravel-like folders (`app/`, `config/`, `database/`, `web/`, `tests/`, `storage/`). One `pnpm dev` runs API + UI on one port in dev. One build outputs server + static UI. See [05 §3](05-developer-experience.md#3-the-generated-project). |
| D16 | **Docker** | **Local development only, never committed.** Our monorepo git-ignores all Docker files. Generated apps produce `docker/compose.yaml` for local services (Postgres/MySQL, Valkey, Mailpit) and git-ignore it by default. `--docker=commit` is an opt-in. Production deployment guides are separate docs. |
| D17 | **Repositories** | **One GitHub repository per package** (polyrepo, like Laravel's first-party packages) under the `strutvane` org: `framework`, `auth`, `ui`, `core`, `contracts`, `cli`, `devkit`, `create-strutvane`, plus `tooling` (shared configs), `.github` (reusable CI workflows), `docs`, `blueprint` (this planning folder), `examples` and `integration` (nightly cross-package e2e). Locally, the umbrella folder holds each repo under `packages/<name>`, linked by a **local-only, git-ignored** pnpm workspace. Per-repo toolchain: pnpm, tsdown, Biome, Vitest, Playwright, Testcontainers. See [10](10-repositories-publishing-versioning.md). |
| D18 | **Publishing** | npmjs.com public packages, each repo publishing its own package via npm **trusted publishing (OIDC)** from GitHub Actions with provenance. Channels: `latest`, `next`, `canary`. Each repo versions independently (Changesets), but the core packages (contracts, core, framework, auth, ui, cli) share a **major release train**, enforced by peer-dependency ranges and the integration repo. |
| D19 | **License** | MIT for everything, including enterprise features (RBAC, audit, tenancy, SSO hooks). No CLA that permits relicensing. |
| D20 | **Docs** | Diátaxis structure, versioned docs site, every feature ships with docs, an example and tests. |

## 4. Why this can win (from [02](02-competitive-analysis.md))

- **No TypeScript ecosystem covers model → API → auth → UI with owned code.** NestJS and AdonisJS stop at the backend; Refine and React Admin stop at the frontend. Payload, Strapi and Directus are runtime CMS engines.
- **Enterprise features are paywalled elsewhere**: audit (Strapi, Payload, React Admin EE) and RBAC (React Admin EE, Medusa EE). We ship them MIT.
- **Generators elsewhere are one-shot** and break after edits. Our metadata-driven thin files mostly remove the regeneration problem.
- **The category churns**: Amplication pivoted, Directus relicensed twice, Redwood split, Payload went to Figma, Better Auth went to Vercel. Stable governance plus MIT is itself a feature.

## 5. Delivery ([14](14-roadmap.md))

| Phase | Timing | Scope | Release |
|-------|--------|-------|---------|
| 0 | weeks 0–4 | Foundations | — |
| 1 | months 1–3 | Core + CLI + framework | `0.1` |
| 2 | months 3–5 | Auth | `0.2` |
| 3 | months 5–7 | UI | `0.3` |
| 4 | months 7–9 | Enterprise layer | `0.9` beta |
| 5 | months 9–12 | Hardening + audit | `1.0` |
| 6 | year 2 | notify, files, payments, logs, reports, analytics | — |

## 6. Top risks ([15](15-risks-and-tradeoffs.md))

1. Scope explosion: mitigated by phase gates.
2. Auth security liability: mitigated by the identity adapter and an external audit.
3. Magic vs. control: mitigated by the levels of control and an eject path.
4. Upstream churn: Drizzle v1 is RC, TypeScript 7 has no compiler API, Better Auth is now owned by Vercel.
5. Maintainer bandwidth.
