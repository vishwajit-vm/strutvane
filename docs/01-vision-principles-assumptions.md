# 01 — Vision, Principles & Challenged Assumptions

## 1. Vision

> Give TypeScript teams the productivity of Laravel and the auditability of enterprise software, without lock-in to a runtime engine, a vendor, a UI kit or an ORM.

A B2B team should be able to go from an empty folder to a multi-tenant, RBAC-protected, audited, documented application (API **and** UI) in **1–2 hours**: declare models as field names and types, and the framework handles migrations, CRUD API, permissions and screens. Every line of the result must be readable, overridable TypeScript in their own repository.

### Target users

| Persona | Needs | What they get |
|---------|-------|---------------|
| **Agency / consultancy dev** | Ship B2B admin and portal apps quickly, then hand over the code | Fast generation, owned code, themable UI |
| **Enterprise platform team** | Standardise how 20+ internal services do auth, tenancy, audit and APIs | Shared conventions, plugins, internal generator presets |
| **SaaS startup** | Multi-tenant from day one, SSO/SCIM when the first enterprise customer asks | Tenancy and enterprise auth without a rewrite |
| **Plugin author / ISV** | Extend the ecosystem (payments, notifications) | Stable plugin and generator SDK (`@strutvane/devkit`) |

### Non-goals

- A no-code or low-code UI builder. (A visual resource editor *may* come later as a client of the same DSL.)
- A hosted backend-as-a-service.
- A replacement for a component library, ORM or identity provider.
- Supporting non-TypeScript backends in v1.

## 2. Design principles

1. **You own the output.** Generated code lands in the user's repo, is idiomatic and passes their lint. It has no hidden runtime magic and no `node_modules` black box. Removing Strutvane later must be possible.
2. **Independent, then integrated.** Each package is useful on its own. Integration happens through **shared contracts** (types, protocols, OpenAPI extensions), never through hard imports between product packages.
3. **One source of truth, many projections.** A resource is defined once. DB schema, validators, policies, routes, OpenAPI, the client SDK and UI are projections of it.
4. **Declare once, never regenerate for routine changes.** Generated files are thin and metadata-driven, so adding a field needs no regeneration. When a developer ejects full source, upgrades use three-way merge and never silently destroy edits.
5. **Secure by default, configurable by design.** Defaults follow OWASP ASVS L2. Unsafe options exist only behind explicit, greppable flags (e.g. `unsafe_disableRls`).
6. **Adapters over opinions.** Opinionated defaults ship (Postgres, Drizzle, Hono, React, Tailwind), but each sits behind an adapter interface with at least two implementations before 1.0, to prove the seam is real.
7. **Functions over frameworks.** Prefer plain functions, explicit composition and typed config over decorators, reflection and global DI magic. (NestJS-style DI is supported through an adapter, not required.)
8. **Boring infrastructure.** Standard protocols: OpenAPI 3.1, RFC 9457 problem details, OIDC, SAML, SCIM 2.0, OpenTelemetry, JSON Schema.
9. **Upgrades are a feature.** Every breaking change ships with a codemod (`sv upgrade`) and a migration guide.
10. **Docs and DX are product.** A feature isn't done without docs, an example and a test.

## 3. Challenged assumptions

The brief contains assumptions that deserve pushback before we commit.

| Assumption in brief | Challenge | Resolution |
|---------------------|-----------|------------|
| "Install packages **globally**" | Global CLIs drift from project versions, causing "works on my machine" failures and generator/runtime mismatches. | The global `strutvane` binary is a thin launcher. It always **delegates to the project-local version** pinned in `package.json`, as Angular CLI and Nx do. `npx strutvane` / `pnpm dlx` work with no global install. |
| "Authentication package supporting OAuth, JWT, sessions, SSO…" built by us | Hand-rolling password storage, OAuth flows, WebAuthn and SAML is where real breaches happen. Mature MIT engines exist (Better Auth, now also maintaining Auth.js). | **Auth = authorization + tenancy + audit (native) + an identity adapter layer.** Better Auth is the default identity engine, and we own only a thin layer on audited primitives (jose, @oslojs, arctic, @simplewebauthn). See [07](07-package-auth.md). |
| "Support PostgreSQL, MySQL, SQLite, Azure… and other providers" equally | Equal support forces a lowest-common-denominator design. RLS, JSONB, partial indexes and `LISTEN/NOTIFY` are Postgres-only. | **Tiered support.** Tier 1 is Postgres (incl. Azure Flexible Server, Neon, Supabase, RDS/Aurora). Tier 2 is MySQL 8.4 (incl. Azure Flexible), SQLite/libSQL. Tier 3 is MSSQL/Azure SQL (post-1.0, once Drizzle v1 MSSQL is stable). Features declare which tiers they support. |
| "Every package must work independently" | Full independence can duplicate types and concepts (Tenant, Actor, Permission) across packages. | A tiny shared **`@strutvane/contracts`** package holds types and protocols only, with zero runtime dependencies. First-party packages depend on contracts and core, never on each other. |
| "Automatically generate frontend from backend APIs" | Pure inference from OpenAPI gives mediocre UIs: no labels, no relationships, no permissions. | The backend publishes a **resource manifest** (OpenAPI 3.1 plus `x-strutvane-*` extensions and `/.well-known/strutvane.json`). The frontend uses rich metadata when available and degrades to plain OpenAPI inference for third-party APIs. |
| "Developers must have complete control over generated source" **and** "auto-generate" | These conflict after the first edit. | Four levels of control (declare → configure → override → eject) with thin, metadata-driven generated files; three-way merge only for ejected files (see [04 §4](04-architecture.md#4-levels-of-control-the-key-dx-idea)). |
| "Enterprise-grade" from day one | Building SSO, SCIM, sharding and HA before anyone uses the core kills projects. | Design the seams for enterprise features in Phase 1 and implement them in Phase 4. Contracts (tenant context, audit events, permission checks) are stable from `0.1`. |
| "Inspired by Laravel" | Copying Laravel's Active Record and facades into TS fights the type system. | We take Laravel's **ecosystem shape**: first-party packages, artisan-style CLI, starter kits, conventions and docs culture. We do not take its runtime idioms. |
| "Docker-based development" | Docker is required for prod parity but heavy for quick starts and CI. | Docker is local-only: a git-ignored `docker/compose.yaml` is generated for local services (`sv up`). Nothing Docker-related is committed by default. SQLite and in-memory drivers allow `pnpm dev` with zero containers for tutorials. Testcontainers covers tests. |
| "A separate Git repository per package" | Polyrepos make cross-package changes (e.g. a contracts change touching framework, auth and ui) slower to coordinate than a monorepo. | **Adopted** (Laravel works the same way). Mitigations: strict contracts discipline, a shared `tooling` repo, reusable org-wide CI workflows, a nightly `integration` repo that tests every package together, and a local-only umbrella pnpm workspace for cross-repo development ([10](10-repositories-publishing-versioning.md)). |
| "Developer only gives field names and types; the framework handles the rest" | Pure magic becomes a ceiling the moment business rules appear. | Magic is the **default level**, not the only one: L0 declare → L1 configure → L2 override → L3 eject ([04 §4](04-architecture.md#4-levels-of-control-the-key-dx-idea)). |

## 4. Success metrics (first 18 months)

| Metric | Target |
|--------|--------|
| Time from `npm create strutvane` to a running tenant-aware app with API + UI | ≤ 3 min to first page; a 10–20 model B2B app in ≤ 2 hours |
| Regeneration after user edits with zero lost changes | 100% in the test corpus; conflicts surfaced, never dropped |
| Generated app passes its own typecheck, lint and tests | 100% of generator matrix |
| Security | Independent audit of auth before 1.0; zero unpatched high CVEs older than 14 days |
| Adoption | 1,000 weekly downloads of `@strutvane/cli` 3 months after 1.0; 10 community plugins |
