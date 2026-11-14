# 11 — Technology Decisions

> Canonical decisions D3, D8–D14 and D17 live in [00](00-executive-summary.md). This document gives the reasoning, the alternatives, the risks and the exit strategy for each choice.
> Versions are as of **2026-11-13** ([research/stack-snapshot-2026-11.md](research/stack-snapshot-2026-11.md)). **[npm]** means read from npm dist-tags that day, **[src]** means confirmed by official docs or release notes, and *(unverified)* means it comes from secondary sources.

## 1. Selection criteria

Every library was scored on six criteria:

1. **License** compatible with MIT redistribution: MIT, Apache-2.0, BSD or ISC. No AGPL/SSPL/BSL in runtime dependencies.
2. **Maintenance health**: release cadence, bus factor and governance.
3. **Standards alignment**: Web Fetch API, OpenAPI, Standard Schema, OTel.
4. **Typed DX**: inference quality and error messages.
5. **Escape hatch**: can we swap it behind an interface?
6. **Footprint**: install size, ESM support, edge/runtime portability.

**Rule:** every third-party dependency that sits in a user-facing seam (DB, HTTP, identity, queue, cache, mail, UI primitives) is wrapped behind a Strutvane interface. Users code against the interface, never against the vendor API.

## 2. Decision table

| Area | Chosen | Alternatives considered | Why | Risk | Exit strategy |
|------|--------|-------------------------|-----|------|---------------|
| **Runtime** | Node.js **26 LTS** (min 24) | Bun 1.4, Deno 2.9 | Enterprise standard. Node 26 has been Active LTS since 2026-10-28 ([nodejs.org](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule)). | Bun/Deno users expect support | Code only to web standards + `node:` built-ins. Bun/Deno smoke tests after 1.0 (unverified compatibility today). |
| **Language** | TypeScript, strict, ESM-only | — | Core promise; types drive the DX | Toolchain churn (TS 7) | See §3 |
| **Type checker for users** | TS 6.x or **TS 7 (Go)** | — | TS 7.0 (2026-07-08) is ~10× faster for type-checking ([MS blog](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/)) | — | Generated apps work on both |
| **Compiler API for our codegen** | **`@typescript/typescript6`** pinned in `devkit`/`cli` (for ts-morph) | TS 7.1's planned new API; Babel/oxc AST for edits | **TS 7 ships no compiler API**, while ts-morph 28 needs the TS 6 API [src] | ts-morph stalls; TS 6 API eventually EOL | Codegen uses an internal `AstEditor` interface: ts-morph today, oxc-parser + magic-string or the TS 7.1 API later. Config edits use magicast (no TS dependency). |
| **Build (libraries)** | **tsdown** 0.23 | tsup, unbuild, raw `tsc` | Rolldown-based and fast; tsup points to it | 0.x; 0.23 removed tsup-compat options | Plain `tsc --build` + Rolldown fallback; the build config is ~10 lines per package |
| **Build (apps/UI)** | **Vite 8** (Rolldown) | webpack, Rspack | Default for React SPAs; one dev server for API + UI via a Hono dev-server plugin | Vite+ commercial direction *(unverified)* | Vite core is MIT; Rspack as backup |
| **Lint + format** | **Biome 2.6** | ESLint 9 + Prettier, oxlint 1.9x + oxfmt (0.x) | One fast tool, one config, also formats generated code | Fewer plugin rules than ESLint | Type-aware rules via oxlint (tsgo-based) in CI if needed. Generated apps can choose ESLint/Prettier (`--lint eslint`). |
| **Test runner** | **Vitest 5** | Jest, node:test | ESM/TS native, workspace projects, browser mode | v5 stopped looking up config in ancestor dirs, and reports moved to `.vitest/` [src] | Each package has its own `vitest.config.ts` (from `tooling/vitest`) |
| **E2E** | **Playwright 1.65** | Cypress | Multi-browser, trace viewer, a11y with axe | — | — |
| **Containers in tests** | **testcontainers 12** | docker-compose in CI | Hermetic, parallel, no committed compose files (D16) | Needs a Docker daemon in CI | SQLite/in-memory tier for contributors without Docker |
| **HTTP engine** | **Hono 4.13** (v5 when GA; 5.0.0-rc.1 on `next`) | Fastify 5.12, Express 5.3, Elysia 1.4/2.0 | Web-standard Request/Response, runs on Node/Bun/Deno/edge, tiny, first-class middleware typing | v5 may move adapters to `@hono/<adapter>` packages and deprecate `app.mount` *(unverified)* | Strutvane's router is our own thin layer over the engine. Express, Fastify and NestJS **mount adapters** are first-class (D8), so swapping engines is internal. |
| **Validation** | **Zod 4.6** behind **Standard Schema 1.1** | Valibot 1.5, ArkType 2.2 | Largest mindshare; native `z.toJSONSchema`, which feeds OpenAPI 3.1 ([zod.dev](https://zod.dev/json-schema)) | Zod major churn | All contracts accept any Standard Schema validator. Field builders compile to Zod by default, with a Valibot backend possible. |
| **Model DSL** | **Own** (`defineModel` + `field.*`) | Use Drizzle/Prisma schemas directly | One definition must carry DB, validation, UI, permissions, OpenAPI and audit metadata; no ORM schema can do all of that | We own a DSL forever | The DSL is small and declarative. Generators target adapters. `sv eject:schema` emits the plain Drizzle schema. |
| **SQL engine (DB driver + migration diff)** | **Drizzle ORM** behind `@strutvane/framework` `DataAdapter` | Prisma 7/8, Kysely-only, MikroORM 7, TypeORM 1.1 | Code-first TS schema (fits owned code); SQL-like query API; dialect coverage; drizzle-kit diffing; Apache-2.0 | **v1 is not GA**: `latest` is 0.45.4, and v1 is at 1.0.0-rc.5 / beta.22. MSSQL exists only in v1. [npm] | Target v1 RC behind the adapter and pin exactly. The migration diff runs through our own `SchemaDiffer` interface (drizzle-kit today). Kysely adapter as plan B. |
| **Raw / complex queries** | **Kysely 0.29** | knex | Type-safe SQL builder, multi-dialect, actively published (last 2026-11-12) | 0.x versioning | Exposed as `db.raw()` / `db.kysely()` escape hatch |
| **Prisma** | Community adapter **after** Prisma 8 GA | — | Large user base wants it | Prisma 8 RC removes `PrismaClient`; `prisma` `latest` already points at 8.0.0-rc.33 [npm] | Not on the critical path |
| **Postgres driver** | **pg 8.23** (+ `@azure/postgresql-auth` 1.0 for Entra) | postgres.js | Most compatible; Azure's official helper supports pg ([MS Learn](https://learn.microsoft.com/javascript/api/overview/azure/postgresql-auth-readme)) | — | postgres.js driver option |
| **MySQL driver** | **mysql2 3.24** | mariadb | Standard; Azure MySQL Entra uses the same token-as-password approach *(unverified)* | — | — |
| **SQLite** | **libSQL client** (default) + better-sqlite3 option | node:sqlite (built-in) | libSQL works locally and remotely (Turso); better-sqlite3 for max local perf | Native builds on Windows (better-sqlite3) | node:sqlite driver when stable |
| **Azure auth** | **@azure/identity 4.14** (`DefaultAzureCredential`) | Static passwords | Passwordless with managed identity. Token scope `https://ossrdbms-aad.database.windows.net/.default`, ~60-min tokens, fetched per connection via an async password function ([MS Learn](https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication)) | Token-refresh edge cases | Wrapped in `db.credentials` provider interface |
| **Identity engine** | **Better Auth 1.7** via `@strutvane/auth` adapter | Auth.js (maintenance-only, v5 never GA), Lucia (deprecated), WorkOS/Clerk (SaaS), native-only | MIT; orgs/teams/RBAC, 2FA, passkeys, SSO, SCIM and an OAuth 2.1 provider; maintains Auth.js since 2025-09 ([blog](https://better-auth.com/blog/authjs-joins-better-auth)) | **Acquired by Vercel 2026-07-07** (governance). SCIM decoupled from orgs in 1.7 with no in-place migration. An advisory was not patched on 1.6.x. [src] | `IdentityEngine` interface. Optional **native engine** on primitives. OIDC/SAML adapters for external IdPs. |
| **Crypto & token primitives** | **jose 6.2** (JWT/JWS/JWKS), **@oslojs/crypto** 1.0, **arctic 3.7** (OAuth clients), **@simplewebauthn/server 14** (passkeys), **@node-rs/argon2** (argon2id) | jsonwebtoken, bcrypt, oslo (deprecated) | Audited, maintained, web-crypto based. argon2id per OWASP. | Native binary for argon2 | WASM argon2 fallback; scrypt via `node:crypto` as last resort |
| **Authorization** | **Native policy engine** (RBAC + ABAC predicates that compile to SQL) | CASL 7.1, Casbin 5.51, OpenFGA (CNCF), Cerbos, Oso Cloud (SaaS) | The core differentiator: list queries must be filtered **in SQL**, and policies must also drive the UI manifest and OpenAPI | We own security-critical code | Property tests + external audit ([13](13-testing-strategy.md)). Optional OpenFGA/Cerbos adapters for ReBAC. |
| **Queue / jobs** | **BullMQ 6.7** with backend **Valkey** or **Postgres** (v6 pluggable backends) | pg-boss 12, graphile-worker 0.18, Trigger.dev 4 | Mature, rich features (retries, scheduling, rate limits, flows). v6 Postgres backend means one less service for small apps. [src](https://docs.bullmq.io/guide/migrations/migrate-from-v5-to-v6) | v6 migration required moving from legacy repeatable jobs to Job Schedulers | `QueueDriver` interface: `memory` (dev/test), `bullmq`, `pgboss` |
| **Cache / KV / rate-limit store** | **Valkey 9** (BSD-3) via **ioredis 6** / iovalkey | Redis 8 (RSALv2/SSPLv1/**AGPLv3**), Memcached, in-process LRU | License clarity for enterprises. Redis protocol compatible. | iovalkey is 0.x | `CacheDriver`: `memory`, `redis-protocol` (Valkey or Redis), `database` |
| **Mail** | **nodemailer** (SMTP) + **Mailpit** locally (Docker, local only) | Resend/Postmark/SES/SendGrid SDKs | SMTP works everywhere; Mailpit gives a local inbox UI | — | `MailDriver`: smtp, ses, resend, postmark, log, array (tests) |
| **Logging** | **`@strutvane/logs` (own pipeline, ADR-0015)** | pino 10, winston | Non-blocking, bounded delivery, built-in redaction and viewer; 1.3–4× faster than pino in spike 09 with no logging runtime dependency | — | `Logger` contract; core fallback |
| **Observability** | **OpenTelemetry JS SDK 3** (traces, metrics, **logs now stable**) | Vendor APMs | Vendor-neutral. SDK 3.0 folded `api-logs` into `@opentelemetry/api` ([OTel blog](https://opentelemetry.io/blog/2026/otel-js-sdk-3-0/)). | Experimental packages are 0.300.x | Optional `@strutvane/framework/otel`; no-op when disabled |
| **OpenAPI generation** | **Own generator**: model + Zod 4 JSON Schema → **OpenAPI 3.1** with `x-strutvane-*` extensions | @hono/zod-openapi 1.6, zod-openapi 6 | We need resource-level metadata (permissions, UI hints, filters) that route-level tools don't model | — | Output is plain OpenAPI 3.1, so any tool can consume it |
| **API reference UI** | **Built-in, script-free page** at `/docs`, rendered by the framework ([ADR-0019](adr/0019-script-free-api-docs-page.md), replacing Scalar) | Scalar (`@scalar/api-reference` 1.78), Swagger UI, Redoc | No third-party code, strict CSP (inline styles only), every document value escaped, `no-store`, same visibility as `/openapi.json` ([06 §5.5](06-package-framework.md#55-api-documentation-openapijson-and-docs)) | No interactive "try it" console | Load `/openapi.json` into any OpenAPI tool |
| **Typed client for UI** | Generated from the manifest; **@hey-api/openapi-ts** (0.99) for third-party APIs in UI-only mode | orval 8.47, openapi-typescript 7.13 (slowing) | hey-api has plugin-based output (TanStack Query hooks) | 0.x | orval as alternative |
| **UI framework** | **React 19.3** | Vue 3.5/Nuxt 4, Svelte, Solid | Largest talent pool for B2B admin UIs | React Server Components complexity | The UI core (manifest client, query state, permission logic) is framework-agnostic TS. Vue renderer later. |
| **Router** | **TanStack Router 1.170** (SPA) | React Router 8 (ESM-only, middleware always on), Next.js 16 | Fully type-safe routes and search params, which suits filters/sort/pagination in URLs | — | App targets: React Router 8 and TanStack Start (1.0 stable 2026-10-13, no RSC) after 1.0 |
| **Server state** | **TanStack Query 5.107** | SWR, RTK Query | Caching, mutations, optimistic updates | — | — |
| **Tables** | **TanStack Table 9.3** (new major) | AG Grid (commercial features), MUI DataGrid | Headless, so we own the markup | v9 API changes from v8 | Renderer isolates table API usage |
| **Forms** | **TanStack Form 1.33** (2.0 alpha) | React Hook Form | Standard Schema validation, type-safe field paths | 2.0 upcoming | Form engine wrapped in `useResourceForm` |
| **Styling** | **Tailwind CSS 4.3** + CSS variables design tokens | CSS Modules, vanilla-extract, Panda | Ubiquitous; tokens make themes swappable | — | Tokens are plain CSS variables, independent of Tailwind |
| **Components distribution** | **shadcn CLI v4 registry** (namespaced `@strutvane/*` items in `components.json`) | Shipping a compiled component library | Copy-into-project means the developer owns the code ([changelog](https://ui.shadcn.com/docs/changelog)) | Registry format changes | We host our own registry JSON. The installer can also copy files directly. |
| **UI primitives** | **Base UI** (`@base-ui/react` 1.9) default, **Radix** (`radix-ui` 1.8) supported | Ariakit, React Aria | shadcn reportedly moved its default to Base UI (~2026-07) *(unverified-ish)*. Both are accessible and headless. | Package rename history (`@base-ui-components/react` → `@base-ui/react`) | `--primitives radix` flag |
| **CLI framework** | **commander 15** + **@clack/prompts 1.9** | citty 0.2 (0.x), oclif 5, yargs | commander is stable and boring; clack gives polished prompts | — | Command definitions are our own objects; the parser is swappable |
| **Code editing** | **magicast 0.5** (config files), **ts-morph 28** (TS source, with TS 6) | jscodeshift 17, recast | magicast for safe config edits (`strutvane.config.ts`), ts-morph for structural edits and codemods | ts-morph/TS 7 gap (above) | `AstEditor` interface |
| **Templates** | TS template functions (tagged templates + typed context) | Handlebars, EJS, plop 4, hygen (abandoned: last publish 2022-09) | Type-checked templates, no new language | — | — |
| **Repository model** | **Polyrepo**: one GitHub repo per package under org `strutvane` (D17) | Monorepo (pnpm + Turborepo/Nx) | Laravel-style ownership, discoverability and independent cadence. Mitigated by reusable workflows, a `tooling` repo, an `integration` repo and Renovate. See [10](10-repositories-publishing-versioning.md). | Cross-repo contract changes are slower | RFC → `next` → coordinated release process. The repos could be merged into a monorepo later if needed (git history preserved via subtree). |
| **Package manager & release** | **pnpm 12** (catalogs within multi-package repos like `cli`, `tooling`), **Changesets 3** per repo | npm/yarn, release-please, semantic-release | pnpm is fast and strict, with supply-chain defaults. Changesets supports pre-release/snapshot channels. | Several 2026 majors (pnpm 12, Changesets 3, Vitest 5) | Pin via the `packageManager` field + Renovate |
| **Task runner** | **None for the org repos.** Plain `pnpm` scripts per repo (repos are small). Turborepo is *optional* in the local-only umbrella workspace. | Turborepo 2.11, Nx 24 | Single-package repos don't need orchestration or remote caching | — | Adopt Turborepo in a repo if it grows multiple packages |
| **Docs site** | Astro **Starlight** *(version to verify)* | VitePress, Docusaurus, Fumadocs | Fast, versioned, i18n, MDX | — | Content is MDX, portable |

## 3. Key reasoning notes

### 3.1 Why we own the model DSL but not the ORM

**Options considered:**

| Option | Why not |
|--------|---------|
| A. Expose Drizzle schemas as the user's model | Drizzle can't express UI labels, permissions, searchable/filterable flags, audit redaction or tenancy, so a second metadata file would be needed. That breaks "one source of truth". |
| B. Expose Prisma schema + generators | PSL is not TypeScript. Prisma 8 is rewriting the client, so it is unstable for a 1.0 foundation. |
| C. Own an ORM | Years of work, and a perpetual bug surface. |
| **D. Chosen** | A small declarative DSL (`defineModel`, `field.*`, relations) that **compiles** to a Drizzle schema, Zod validators, OpenAPI, UI metadata and permission catalogs. The CRUD/query layer is ours but deliberately thin, and executes via Drizzle/Kysely. |

### 3.2 Drizzle v1 RC handling

- Pin exact versions in the catalog: `drizzle-orm@1.0.0-rc.N`, `drizzle-kit@…`.
- Golden tests on generated SQL per dialect; any change fails CI.
- **Drizzle v1 GA is a gate for Strutvane 1.0.** If it is not GA by Phase 5, ship 1.0 on the last RC with a documented pin, or flip to the Kysely adapter. Decide by month 8.

### 3.3 Hono and mounting into existing apps

Strutvane apps use Hono internally. The same routers expose `toFetchHandler()`, plus `toExpress()`, `toFastify()` and a NestJS module. This lets `@strutvane/auth` and the CRUD API be added to legacy apps, which is an explicit requirement ("each package works independently").

### 3.4 Valkey over Redis

Redis 8 is tri-licensed RSALv2/SSPLv1/AGPLv3. Valkey is BSD-3 ([redis.io](https://redis.io/blog/what-is-valkey/)). Both speak the same protocol, so the driver is the same. Local Docker (local only) runs Valkey. Users may point at Redis or a managed service (Azure Cache, ElastiCache).

### 3.5 TypeScript 7 strategy

- **User projects:** generated apps include `typescript` (works with 6 or 7) for type-checking. Nothing at runtime depends on the compiler API.
- **Our tooling:** `@strutvane/devkit` depends on `@typescript/typescript6` + ts-morph. When the TS 7.1+ API stabilises, add a second `AstEditor` backend and drop TS 6 in the next major.

## 4. Versions snapshot (2026-11-13)

| Package | Version | Note |
|---------|---------|------|
| Node.js | 26.13.1 LTS | Active LTS; 24, 22 maintenance |
| typescript | 7.0.2 | Go native, no compiler API; `@typescript/typescript6` for API |
| ts-morph | 28.0.0 | Needs TS 6 API |
| pnpm | 12.18.0 | Rust rewrite |
| turbo (optional, local umbrella only) | 2.11.11 | Not used in org repos |
| @changesets/cli | 3.0.3 | ESM-only |
| tsdown | 0.23.7 | — |
| @biomejs/biome | 2.6.7 | — |
| vitest | 5.1.0 | — |
| @playwright/test | 1.65.0 | — |
| testcontainers | 12.2.1 | — |
| hono | 4.13.18 (5.0.0-rc.1 next) | — |
| zod | 4.6.7 | — |
| @standard-schema/spec | 1.1.0 | — |
| drizzle-orm / drizzle-kit | 0.45.4 / 0.31.11 latest; **1.0.0-rc.5** | Target v1 RC |
| kysely | 0.29.9 | — |
| pg / mysql2 | 8.23.1 / 3.24.6 | — |
| @azure/identity / @azure/postgresql-auth | 4.14.1 / 1.0.0 | — |
| better-auth | 1.7.23 (1.8.0-beta.9) | Vercel-owned |
| jose / arctic / @simplewebauthn/server | 6.2.17 / 3.7.0 / 14.1.0 | — |
| @casl/ability (alt) | 7.1.3 | — |
| bullmq | 6.7.6 | Postgres backend available |
| ioredis | 6.0.0 | — |
| Valkey | 9.1.3 | BSD-3 |
| @opentelemetry/sdk-node | 0.301.2 (stable pkgs 3.x) | — |
| @scalar/api-reference | 1.78.1 | — |
| @hey-api/openapi-ts | 0.99.0 | — |
| react | 19.3.1 | — |
| vite | 8.3.8 | — |
| @tanstack/react-router / query / table / form | 1.170.46 / 5.107.1 / 9.3.1 / 1.33.5 | — |
| tailwindcss | 4.3.5 | — |
| shadcn | 4.23.0 | — |
| @base-ui/react / radix-ui | 1.9.0 / 1.8.1 | — |
| commander / @clack/prompts / magicast | 15.1.0 / 1.9.0 / 0.5.5 | — |
