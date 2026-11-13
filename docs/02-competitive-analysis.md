# 02 — Competitive Analysis

**Research date:** 2026-11-13.

**Method:**

- Official docs, GitHub repositories, release notes and vendor blogs, fetched on the research date.
- Star counts are orders of magnitude taken from GitHub on that date.
- Items marked *(unverified)* came only from secondary sources.

## 1. Landscape at a glance

| Tool | Layer | License (Nov 2026) | Model | Generated code owned? | RBAC | Multi-tenancy | Audit log |
|------|-------|--------------------|-------|-----------------------|------|---------------|-----------|
| **Laravel 13** (PHP) | Full stack | MIT | Framework + first-party packages + starter kits | ✅ (Artisan `make:*`, kits publish code) | Policies/gates; Spatie Permission (community) | Teams in 13.x starter kits | ❌ first-party |
| **NestJS 12** | Backend | MIT | DI framework, decorators | ✅ one-shot schematics | DIY | DIY | DIY |
| **AdonisJS 7** | Backend | MIT | Laravel-style MVC in TS, Lucid ORM | ✅ `node ace make:*` | Bouncer (authorization) | DIY | DIY |
| **Payload 3.x / 4 beta** | CMS / app framework | MIT (team acquired by Figma, Jun 2025) | Config-as-code, runtime admin | ⚠️ types/migrations only; admin is runtime | Function-level ACL incl. field-level | Official plugin (shared DB) | Enterprise (paid) |
| **Amplication** | Backend codegen platform | Apache-2.0 core + commercial `ee/` | UI modelling → NestJS + Prisma code in Git | ✅ (pushes to your repo) | ✅ modelled in UI | ❌ | ❌ |
| **Prisma 7 (8 in RC)** | ORM | Apache-2.0 | Schema-first, generated client | ❌ never hand-edited | ❌ | ❌ (extensions) | ❌ |
| **Refine (Core v5)** | Frontend | MIT | Headless React meta-framework + providers | ✅ one-shot Inferencer | Provider (CASL/Casbin) | ❌ | ❌ |
| **React Admin 5** | Frontend | MIT + paid EE | React SPA (MUI) + providers | ⚠️ Guessers print code | EE (paid) | ❌ | EE (paid) |
| **Directus 12** | Data platform | **MSCL** (source-available, from v12) | DB-first runtime engine + Vue Studio | ❌ runtime | ✅ policy-based | DIY via policies | ✅ built-in |
| **Strapi 5** | Headless CMS | MIT + commercial `ee/` | UI-driven content types written to JSON | ⚠️ partial | ✅ roles, field-level | ❌ | Enterprise (paid) |
| **Redwood GraphQL / RedwoodSDK** | Full stack | MIT | Classic: Prisma + GraphQL + scaffolds; SDK: Cloudflare RSC | ✅ (classic scaffolds) | DIY | ❌ | ❌ |

Secondary set: Wasp, Medusa, Supabase, Better Auth, Keystone, Hasura, Encore.ts, create-t3-app (see §3).

## 2. Deep dives

### 2.1 Laravel 13 (the benchmark for ecosystem *shape*)

- **Status:**
  - Released 2026-03-17. PHP 8.3+, MIT, ~35k stars on the framework repo.
  - Starter kits for React/Vue/Svelte (Inertia + shadcn) and Livewire use **Fortify**: 2FA on by default, rate limiting, optional **teams**.
  - A WorkOS AuthKit variant adds SSO and passkeys.
  - Breeze and Jetstream are legacy.
- **Strengths to emulate:**
  - First-party packages with consistent conventions (Sanctum, Passport, Horizon, Telescope, Scout, Cashier, Reverb).
  - Artisan's discoverable `make:*` grammar.
  - `vendor:publish` lets you "copy the package's code/config into your app".
  - Service-provider auto-discovery.
  - Legendary docs.
  - Kits are code you own.
- **Weaknesses / gaps:**
  - PHP only.
  - No first-party audit log or row-level tenancy.
  - Admin CRUD (Nova) is paid.
  - Starter-kit code has **no upgrade path**: the docs state there is no need to update the kit itself.
- **Lesson:** ecosystem shape plus docs culture is the moat. The runtime idioms (facades, Active Record) don't translate to TS.
- **Sources:** [starter kits](https://laravel.com/docs/13.x/starter-kits) · [Laravel 13 release](https://laravel-news.com/laravel-13-released) · [Spatie Permission](https://github.com/spatie/laravel-permission/releases)

### 2.2 NestJS 12

- **Status:**
  - v12 GA in Aug 2026; v12.5.0 on 2026-11-12. MIT, ~77k stars.
  - v12 brings full ESM, Standard Schema validation and Vitest as the default runner *(per secondary sources)*.
- **Strengths:**
  - Enterprise-familiar module/DI structure.
  - Huge ecosystem.
  - Microservice transports.
- **Weaknesses:**
  - Boilerplate-heavy.
  - Decorator/reflection-centric.
  - `nest g resource` is a one-shot skeleton with no DB-driven generation and no regeneration.
  - Auth, RBAC, tenancy and audit are all recipes, not products.
- **Lesson:** we should offer a **NestJS adapter**, because many enterprises have standardised on it, rather than compete with its DI model.
- **Sources:** [releases](https://github.com/nestjs/nest/releases) · [InfoQ on v12](https://www.infoq.com/news/2026/04/nestjs-12-roadmap-esm)

### 2.3 AdonisJS 7

- **Status:**
  - Released 2026-02-25, Node 24+. MIT, ~19k stars.
  - End-to-end type safety, zero-config OpenTelemetry, reworked starter kits.
- **Strengths:** the closest TS analogue to Laravel (ace CLI, providers, Lucid ORM, Bouncer). Cohesive first-party stack.
- **Weaknesses:**
  - Small community, leader-concentrated maintenance.
  - Knex-based Active Record ORM.
  - No admin/CRUD UI generation, tenancy or audit.
- **Lesson:** proves demand for "Laravel in TS". We differ by being **modular packages you add to *any* app**, not a monolithic framework.
- **Sources:** [v7 announcement](https://adonisjs.com/blog/v7) · [repo](https://github.com/adonisjs/core)

### 2.4 Payload CMS

- **Status:**
  - MIT, ~46k stars. Team acquired by Figma (June 2025).
  - 3.x stable. **4.0 beta announced 2026-10-19**: redesigned admin on Figma's design system, framework adapters starting with TanStack Start, MCP tools.
- **Strengths:**
  - Config-as-code collections.
  - Excellent access-control functions, including field-level.
  - Hooks at every level.
  - Drizzle-based SQL adapters.
  - Official multi-tenant plugin.
- **Weaknesses:**
  - The admin is a runtime black box beyond override points.
  - The Local API bypasses access control by default (`overrideAccess`).
  - Audit logs are an enterprise (paid) feature.
  - A multi-tenant cross-tenant-create CVE was fixed in 3.90.0.
  - Strategy risk under Figma.
- **Lesson:** emulate the access-control function model and hooks. Avoid a runtime admin. Make **"deny unless explicitly bypassed"** the default for server-side calls.
- **Sources:** [4.0 beta](https://payloadcms.com/posts/blog/payload-4-beta-redesigned-admin-tanstack-mcp) · [multi-tenant plugin](https://payloadcms.com/docs/v3/plugins/multi-tenant) · [repo](https://github.com/payloadcms/payload)

### 2.5 Amplication (cautionary tale)

- **Status:**
  - amplication.com **301-redirects to overcut.ai**, an AI "software factory".
  - The repo (Apache-2.0 core + commercial `ee/`, ~16k stars) is not archived, but no releases are listed and the docs domain no longer resolves.
- **What it did well:**
  - UI-modelled entities, roles and permissions generated **owned** NestJS + Prisma code, delivered to Git via PRs.
  - Custom code was preserved on regeneration *(per earlier docs; unverified now)*.
  - Plugin API for templates.
- **Weaknesses:**
  - Hosted-platform dependency.
  - UI-first modelling.
  - Merge friction when regenerating over edits.
  - Vendor pivot stranded users.
- **Lesson:** owned-code regeneration is valuable **and** hard. It must be local-first, CLI-driven and offline, with no platform dependency.
- **Sources:** [repo](https://github.com/amplication/amplication) · [overcut.ai](https://overcut.ai/)

### 2.6 Prisma

- **Status:**
  - Prisma 7 GA 2025-11-19: Rust-free TS query compiler, mandatory driver adapters, `prisma.config.ts`, MongoDB dropped.
  - **Prisma 8 is in RC**: a full TS rewrite that removes `PrismaClient` in favour of a "data contract" API. Its GA date was not confirmed at research time.
  - Apache-2.0, ~48k stars.
- **Strengths:** best-in-class DX and mindshare, Prisma Migrate, a large generator ecosystem.
- **Weaknesses:**
  - Two breaking majors in about a year.
  - No native RLS or tenancy.
  - Generated client is not hand-editable.
- **Lesson:** do **not** hard-wire codegen to Prisma's API. Offer it as an adapter once v8 stabilises.
- **Sources:** [Prisma 7 changelog](https://www.prisma.io/changelog/2025-11-19) · [next evolution](https://www.prisma.io/blog/the-next-evolution-of-prisma-orm) · [release status](https://www.prisma.io/docs/orm/release-status)

### 2.7 Refine

- **Status:**
  - Brand split: "Refine" is now a paid AI internal-app builder; **Refine Core** (MIT, v5, React 19 / TanStack Query 5) continues as OSS, with vendor focus shifted to AI.
  - ~36k stars.
- **Strengths:**
  - Headless architecture.
  - Excellent **provider interfaces**: data, auth, access control, live, router.
  - 15+ data providers.
  - UI adapters (AntD, MUI, Mantine, Chakra, shadcn).
- **Weaknesses:**
  - Inferencer output is one-shot.
  - No backend, so RBAC and tenancy enforcement live elsewhere.
  - No audit.
  - Vendor focus has moved.
- **Lesson:** adopt the provider-interface idea for `@strutvane/ui` so it works with non-Strutvane APIs. Add regeneration and backend-aware metadata.
- **Sources:** [v5](https://refine.dev/blog/refine-v5-announcement) · [AI direction](https://refine.dev/blog/ai-future-of-internal-enterprise-apps) · [repo](https://github.com/refinedev/refine)

### 2.8 React Admin (Marmelab)

- **Status:** v5.15.x (Nov 2026), no v6 found. MIT, ~27k stars.
- **Paid Enterprise Edition** (roughly €145–590+/month):
  - `ra-rbac`
  - `ra-audit-log`
  - `ra-realtime`
- **Strengths:** mature, stable, huge component set, `dataProvider`/`authProvider` abstraction.
- **Weaknesses:**
  - Tied to MUI.
  - RBAC and audit are paywalled.
  - Client-side RBAC only.
  - Guessers print code to the console rather than generating files.
- **Sources:** [releases](https://github.com/marmelab/react-admin/releases) · [EE](https://react-admin-ee.marmelab.com/)

### 2.9 Directus

- **Status:**
  - **License changed in v12 (May 2026)** to the Monospace Sustainable Core License: source-available, free under $5M revenue / 50 employees, GPLv3 after 4 years.
  - Previously BSL 1.1 from v10.
  - ~39k stars.
- **Strengths:**
  - Wraps *any existing SQL DB* (introspection).
  - Granular policy permissions.
  - Built-in activity and revision logs.
  - Flows automation.
- **Weaknesses:**
  - Not OSI open source, with repeated license churn.
  - UI-first config is hard to code-review (improving via `@directus/cli` schema sync).
  - Tenancy is DIY.
  - Runtime engine.
- **Lesson:** **database introspection** (`strutvane db:pull`) for brownfield DBs is a must-have. Built-in revision history is a strong feature to match.
- **Sources:** [v12 license change](https://directus.com/resources/directus-v12-license-change) · [v12 overview](https://directus.com/resources/v12-built-for-the-whole-team) · [repo](https://github.com/directus/directus)

### 2.10 Strapi 5

- **Status:**
  - v5.5x, no v6 found. MIT outside `ee/`, ~73k stars.
  - Paid tiers include SSO, Review Workflows and **Audit Logs**.
- **Strengths:**
  - Largest community.
  - Content-Type Builder writes schema files into the project.
  - Free custom roles and field-level permissions.
- **Weaknesses:**
  - Painful major upgrades (v4→v5).
  - No native tenancy.
  - Audit and SSO are paywalled.
- **Sources:** [features](https://docs.strapi.io/cms/features) · [LICENSE](https://raw.githubusercontent.com/strapi/strapi/develop/LICENSE)

### 2.11 RedwoodJS → Redwood GraphQL + RedwoodSDK (+ CedarJS fork)

- **Status:**
  - The classic framework was renamed **Redwood GraphQL**: maintained, but not the focus.
  - **RedwoodSDK 1.0** (2026-03-11) is a Vite/RSC framework tied to Cloudflare.
  - The community fork **CedarJS** continues classic Redwood *(version unverified)*.
- **Strengths:** classic `rw g scaffold` was the gold standard for TS Rails-style scaffolding (SDL, services, cells, pages from Prisma models).
- **Weaknesses:**
  - Re-running scaffolds overwrites edits.
  - The pivot fragmented users.
  - The new SDK has no CRUD scaffolding.
- **Sources:** [RedwoodJS → RedwoodSDK](https://rwsdk.com/blog/redwoodjs-to-redwoodsdk) · [repo](https://github.com/redwoodjs/graphql)

## 3. Secondary set (brief)

| Tool | Status (Nov 2026) | Takeaway |
|------|-------------------|----------|
| **Better Auth** | MIT, 1.7.x (1.8 beta). **Acquired by Vercel 2026-07-07** (stays MIT). Took over **Auth.js** maintenance 2025-09-22. Plugins: organization/teams/access control, 2FA, passkeys, SSO, SCIM, OAuth 2.1 provider. | The best default identity engine. Abstract it behind an adapter because of the governance risk and SCIM API churn. [blog 1.7](https://better-auth.com/blog/1-7) · [Auth.js joins](https://better-auth.com/blog/authjs-joins-better-auth) |
| **Wasp** | 0.26 (Oct 2026), 1.0 announced as "coming". Moved from its DSL to a TS spec. MIT. | Compiler-generated output is not meant to be edited. That is the opposite of our ownership model. [blog](https://wasp.sh/blog) |
| **Medusa v2** | MIT core. RBAC EE materials need a commercial agreement. | Its **module isolation + workflow engine** is a great pattern for our future packages. [repo](https://github.com/medusajs/medusa) |
| **Supabase** | Apache-2.0, ~115k stars. Series F, June 2026. | Postgres **RLS** is the proven tenancy/RBAC enforcement layer. We should embrace it. [repo](https://github.com/supabase/supabase) |
| **Keystone 6** | MIT, still releasing (RCs July 2026). Maintainer focus is questioned *(unverified)*. | Another runtime admin. [repo](https://github.com/keystonejs/keystone) |
| **Hasura** | v2 Apache-2.0. Company pivoted to PromptQL. | Excellent declarative row/column permission model to learn from. [blog](https://hasura.io/blog/from-graphql-to-promptql-a-new-chapter-begins) |
| **Encore.ts** | MPL-2.0. Rust runtime with infra-from-code. | Strong infra DX, but runtime and platform lock-in. [docs](https://encore.dev/docs/community/open-source) |
| **create-t3-app** | MIT, maintained. | One-shot scaffold with no CRUD, RBAC or tenancy. Shows demand for opinionated starters. [repo](https://github.com/t3-oss/create-t3-app) |

## 4. Cross-cutting findings → our differentiators

| Finding | Evidence | Strutvane response |
|---------|----------|--------------------|
| **Enterprise features are paywalled** | Strapi EE (audit, SSO), Payload enterprise (audit), React Admin EE (RBAC, audit), Medusa EE (RBAC) | RBAC, audit, tenancy and SSO hooks are **MIT, in core**, forever (written into governance) |
| **Regeneration gap** | Nest, Redwood, Refine and Artisan are one-shot. Runtime engines avoid the problem by being black boxes. Amplication tried and pivoted. | Thin metadata-driven generation (no regeneration for routine changes) + eject with three-way merge + `--dry-run --diff` ([04 §4](04-architecture.md#4-levels-of-control-the-key-dx-idea)) |
| **Multi-tenancy is DIY** | Only Laravel kits (teams), the Payload plugin (with a CVE), Better Auth orgs and Supabase RLS | Tenancy is a first-class contract, with RLS enforcement and a cross-tenant test suite shipped with generated code |
| **License/pivot churn** | Directus (BSL→MSCL), Amplication→Overcut, Redwood split, Hasura→PromptQL, Refine→AI, Payload→Figma, Better Auth→Vercel | MIT + public governance + no CLA-to-relicense ([16](16-docs-and-ecosystem-strategy.md)) |
| **Frontend tools are backend-blind** | Refine and React Admin enforce RBAC client-side only | The backend publishes a permission-aware manifest. The UI hides what the API forbids, and the API still enforces. |
| **Brownfield DBs are underserved by code-first tools** | Directus's main appeal | `strutvane db:pull` introspects an existing DB into resource definitions |
| **Third-party churn is high** | Prisma 7→8, Drizzle v1 RC, TS 7 has no compiler API, many 2026 majors | Adapters, catalogs, pinned toolchain, codemods |

## 5. What we deliberately borrow

| From | Borrow |
|------|--------|
| Laravel | Ecosystem shape, `make:*` grammar, `vendor:publish`-style ejection, starter kits, docs culture |
| Payload | Access-control *functions* and field-level policies, hook lifecycle |
| Refine | Provider interfaces for data, auth, access and router |
| Directus | DB introspection, revision history |
| Hasura / Supabase | Declarative row/column permissions, RLS enforcement |
| Medusa | Module isolation, workflow/saga engine for future packages |
| shadcn/ui | "Copy the code into your project" distribution via a registry |
| Redwood | Scaffold UX and a cohesive generator story |
