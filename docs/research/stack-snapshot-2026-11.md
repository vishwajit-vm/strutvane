# Stack snapshot: 2026-11-13

**What this is:** the raw research snapshot used for [11-technology-decisions.md](../11-technology-decisions.md). **Re-verify everything before Phase 1 starts.**

**Legend:**

- **[npm]**: version read from npm registry dist-tags on 2026-11-13. Treat as verified.
- **[src]**: confirmed by official docs, blog or release notes, or by several consistent reports.
- **[UNVERIFIED]**: prior knowledge or a single secondary source.

Licenses are from prior knowledge unless stated. Spot-check each `package.json` before committing.

## Data / ORM

- **Drizzle ORM** (Apache-2.0)
  - `latest` is 0.45.4; drizzle-kit is 0.31.11 [npm]. **v1 is not GA:** builds are 1.0.0-rc.5 and beta.22 [npm].
  - MSSQL support (orm/kit/seed) exists only in the v1 beta/RC line, and its snapshot format changed in beta.3 [src]. MSSQL should cover Azure SQL [UNVERIFIED].
  - Very active.
  - Source: https://orm.drizzle.team/docs/latest-releases
- **Prisma** (Apache-2.0)
  - Prisma 7 shipped 2025-11-19 [src]: Rust-free TS query compiler by default, driver adapters required for every DB, ~90% smaller bundle.
  - `@prisma/client` `latest` is 7.10.1, and `@prisma/adapter-pg` / `@prisma/adapter-mssql` are also 7.10.1 [npm].
  - **Prisma 8 is in RC**, and the `prisma` CLI `latest` tag points to 8.0.0-rc.33 [npm]. GA was targeted for Oct 2026 and is not confirmed.
  - Prisma 8 is a major API rework [src]:
    - `PrismaClient` class removed; queries go through `db.orm.public.User.where(...)`.
    - `take`/`skip` become `limit`/`offset`.
    - Requires Node 22.18+ (or 24.11+) and TS 5.9+.
  - High churn risk.
  - Source: https://www.prisma.io/docs/orm/release-status
- **Kysely** (MIT): 0.29.9 `latest`, 0.30.0-beta.2 `next` [npm]. Still 0.x; last release 2026-11-12. Built-in PG/MySQL/SQLite/MSSQL dialects [UNVERIFIED]. https://www.npmjs.com/package/kysely
- **MikroORM** (MIT): 7.2.9 [npm]. v7 shipped 2026-03 [src].
  - Knex was replaced by Kysely; `@mikro-orm/knex` was renamed to `@mikro-orm/sql`.
  - ESM-only, Node 22.17+.
  - https://mikro-orm.io/blog/mikro-orm-7-released
- **TypeORM** (MIT): 1.0 shipped 2026-05-19, its first major in about five years, with a codemod via `npx @typeorm/codemod v1` [src]. Latest is 1.1.3; the 0.3.31 line is still published [npm]. https://typeorm.io/blog/typeorm-1-0
- **Migration tools** [npm]: drizzle-kit, prisma migrate, Kysely `Migrator`, node-pg-migrate 9.0.0, graphile-migrate 1.4.1 (2.0.0-rc.6), umzug 3.8.3.

## HTTP / OpenAPI

- **Hono** (MIT): 4.13.18 `latest`, **5.0.0-rc.1** `next` [npm]. v5 reportedly moves adapters to `@hono/<adapter>` packages and deprecates `app.mount` [UNVERIFIED]. https://github.com/honojs/hono/releases
- **Fastify** (MIT): 5.12.8 `latest`, 6.0.0-alpha.6 `next` [npm]. https://github.com/fastify/fastify/releases
- **Express** (MIT): 5.3.0 `latest`, 4.22.3 maintenance [npm].
- **Elysia** (MIT): 1.4.32 stable; 2.0 is at rc.3, a full rewrite with a codemod [npm][src]. Bun-first. https://elysiajs.com/blog/elysia-20
- **OpenAPI tooling** [npm]:
  - `@hono/zod-openapi` 1.6.3, `@scalar/api-reference` 1.78.1 (very active), orval 8.47.0.
  - `@hey-api/openapi-ts` 0.99.0 (0.x, last 2026-09-30).
  - `openapi-typescript` 7.13.0 (last 2026-06, slowing).
  - zod-openapi 6.0.2, oRPC 1.16.2 (2.0 beta).

## Validation

- **Zod** (MIT): 4.6.7 [npm]. Native `z.toJSONSchema` / `z.fromJSONSchema`; Standard JSON Schema since 4.2 [src]. https://zod.dev/json-schema
- **Valibot** 1.5.0 and **ArkType** 2.2.9 [npm], both MIT.
- **Standard Schema**: `@standard-schema/spec` 1.1.0, published 2025-12 [npm]. 1.1 added the Standard JSON Schema interface [UNVERIFIED]. https://standardschema.dev

## Auth / authorization

- **Better Auth** (MIT): 1.7.23 `latest`, 1.8.0-beta.9 [npm]. Plugin packages are versioned in lockstep: `@better-auth/sso`, `/scim`, `/passkey`, `/oauth-provider` [npm].
  - **Acquired by Vercel 2026-07-07.** Stays MIT; the founder is full-time on it [src].
  - 1.7 (2026-08-17) added SCIM Groups, role projections and a SCIM-to-SSO bridge [src]. **SCIM was decoupled from the org plugin, with no in-place migration.**
  - Org/teams/access-control plugin is mature [UNVERIFIED for 1.7 specifics].
  - A SCIM provider-ownership advisory was not patched on 1.6.x.
  - https://better-auth.com/blog/1-7
- **Auth.js / NextAuth**: folded in. Better Auth took over maintenance 2025-09-22 and recommends Better Auth [src].
  - next-auth `latest` is still 4.24.15; v5 never reached GA (5.0.0-beta.32). `@auth/core` is 0.41.3; both last published 2026-07 [npm]. Maintenance-only.
  - https://better-auth.com/blog/authjs-joins-better-auth
- **Lucia**: deprecated (March 2025), now a learning resource; npm last version 3.2.2 [src][npm]. `oslo` is deprecated in favour of `@oslojs/*` (crypto 1.0.1) [src]. arctic 3.7.0 [npm]. https://github.com/lucia-auth/lucia
- **Primitives** [npm]: `@simplewebauthn/server` 14.1.0, jose 6.2.17.
- **Authorization engines** [npm]:
  - casbin 5.51.1 (Apache-2.0)
  - `@casl/ability` 7.1.3 (new major v7, MIT)
  - `@openfga/sdk` 0.9.8 (0.x; OpenFGA itself is Apache-2.0, CNCF)
  - `@cerbos/grpc` 0.29.3 (Apache-2.0)
  - oso-cloud 2.7.0 (SaaS client; OSS Oso library deprecated [UNVERIFIED])

## Jobs / queues / cache

- **BullMQ** (MIT): 6.7.6 [npm]. v6 shipped 2026-07-30 with **pluggable backends incl. Postgres**. Migration requires moving off legacy repeatable jobs to Job Schedulers first [src]. https://docs.bullmq.io/guide/migrations/migrate-from-v5-to-v6
- **pg-boss** 12.38.2 and **graphile-worker** 0.18.0 (2026-09) [npm], both MIT.
- **Trigger.dev**: SDK 4.8.5 [npm], Apache-2.0, self-host via Docker/Helm [src]. v3 tasks rejected from 4.5.1. https://trigger.dev/docs/self-hosting
- **Redis vs Valkey** [src]:
  - Redis 8 (May 2025 onward) is tri-licensed RSALv2 / SSPLv1 / **AGPLv3**; latest 8.10.3 (2026-10-26).
  - **Valkey is BSD-3**, latest 9.1.3 (2026-10-26).
  - Clients [npm]: ioredis 6.0.0, node-redis 6.3.1, iovalkey 0.4.0.
  - https://redis.io/blog/what-is-valkey/

## Observability

- **OpenTelemetry JS** (Apache-2.0): **SDK 3.0** is out [src].
  - Stable packages 3.x, experimental 0.300.x, API 1.10.0.
  - **Logs stable**; `api-logs` folded into `@opentelemetry/api`. The 2.x line is supported for one year after 3.0.
  - `sdk-node` 0.301.2 [npm].
  - https://opentelemetry.io/blog/2026/otel-js-sdk-3-0/
- **pino** 10.4.0 [npm], MIT.

## Frontend

- **React** 19.3.1 [npm].
- **TanStack** [npm]:
  - Router 1.170.46.
  - **Start 1.0 stable 2026-10-13** (`@tanstack/react-start` 1.169.5) [src]: no RSC; RC-era `.inputValidator()` removed.
  - Query 5.107.1.
  - **Table 9.3.1** (new major).
  - Form 1.33.5 (2.0 alpha).
  - https://tanstack.com/blog/tanstack-start-1-0
- **React Router**: **v8** shipped 2026-06-17; `latest` 8.5.1 [npm][src]. ESM-only, middleware always on, needs React 19.2.7+. v7 gets security fixes; v6 and Remix v2 are EOL; Remix 3 is a non-React beta. https://remix.run/blog/react-router-v8
- **Next.js** 16.4.6 [npm].
- **shadcn**: CLI 4.23.0 [npm]. CLI v4 arrived 2026-03 [src] with namespaced registries (`@ns/item`) in `components.json`. Base UI became the default primitive layer ~2026-07, Radix still supported [UNVERIFIED-ish]. https://ui.shadcn.com/docs/changelog
- **Primitives and styling** [npm]: `radix-ui` 1.8.1; **`@base-ui/react` 1.9.0** (renamed from `@base-ui-components/react`); Tailwind 4.3.5.
- **Vite** 8.3.8 [npm]. Vite 8 (2026-03-12) uses Rolldown; Rolldown 1.0 shipped 2026-05 [src]. Vite+ (MIT, VoidZero) reportedly at 1.0 [UNVERIFIED date]. https://vite.dev/blog/announcing-vite8
- **Vue / Nuxt** [npm]: Vue 3.5.45 (3.6 rc.15), Nuxt 4.6.4; `@tanstack/vue-query` exists.

## Codegen / CLI

- **ts-morph** 28.0.0 (last 2026-04) [npm].
  - **Key risk: TypeScript 7.0 (Go native, 2026-07-08) ships with no compiler API** [src]. The npm `typescript` package is now 7.0.2.
  - A new, different API is planned for 7.1. In the meantime `@typescript/typescript6` re-exports the 6.0 API, so pin TS 6 for ts-morph/Compiler API work.
  - https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/
- **plop** 4.0.5 (last 2026-01). **hygen** 6.2.11, last published 2022-09: effectively abandoned [npm].
- **magicast** 0.5.5, **citty** 0.2.2 (both unjs, 0.x), **commander** 15.1.0, **@clack/prompts** 1.9.0, **@oclif/core** 5.1.12, **jscodeshift** 17.4.0 [npm].

## Repo tooling

- **pnpm** 12.18.0 [npm]. **v12 is a Rust rewrite**, stable ~2026-08-26 [src], and keeps v11's commands, settings and lockfile.
  - v11 (2026-04-28) went pure ESM, needs Node 22+, and made a 1-day minimum release age the default.
  - Catalogs fully supported (incl. `workspace:` in catalogs, `catalogPrune`, `pnpm deploy`).
  - https://pnpm.io/blog/releases/12.0
- **Turborepo** 2.11.11 and **Nx** 24.0.6 [npm], both MIT. Nx 24 makes task-based affected the default. https://nx.dev/blog/nx-24-release *(Neither is used by the Strutvane org repos; see doc 10.)*
- **Changesets** **3.0.3** [npm]. v3 (~2026-08-11) is ESM-only and bumps peer dependents by patch; commands renamed (`tag` → `git-tag`, `--sinceMaster` → `--since`). v2 is maintained at 2.31.1.
- **Linting** [npm]: Biome 2.6.7 (MIT/Apache) vs oxlint 1.93.0; oxfmt is 0.x (0.78.0). Oxlint's type-aware mode runs on tsgo.
- **Bundlers**:
  - tsdown 0.23.7 [npm]; 0.23 removed the tsup-compat options.
  - tsup's README says it is unmaintained and points to tsdown [src], **but npm shows tsup 9.0.0 published 2026-10-14**, which conflicts.
  - unbuild 3.6.1 (last 2025-08) looks stale.
- **Vitest** **5.1.0** [npm]. v5 shipped 2026-09-03 [src]. **Gotcha:** it no longer looks up config in ancestor directories, and reports moved to `.vitest/`. 4.1.12 and 3.2.7 still tagged. https://vitest.dev/blog
- **Playwright** 1.65.0, **testcontainers** 12.2.1 [npm].
- **Node.js** [src, nodejs.org dist index]:
  - **Node 26 "Lithium" is the Active LTS** (26.13.1; LTS from 2026-10-28, EOL 2029-04).
  - Node 24 "Krypton" and 22 "Jod" are maintenance; Node 20 is EOL.
  - From Node 27: one major per year, every release becomes LTS.
  - https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule
- **Bun** 1.4.4, **Deno** 2.9.8 [GitHub releases]. Compatibility with this stack not checked [UNVERIFIED].
- **npm trusted publishing** [src]:
  - Classic tokens revoked 2025-12-09; granular tokens last at most 90 days and require 2FA.
  - OIDC trusted publishing works from GitHub-hosted Actions (`id-token: write`), GitLab.com and CircleCI (CircleCI per an Oct 2026 secondary source).
  - Provenance auto-attached with trusted publishing [UNVERIFIED].
  - https://github.blog/changelog/2025-09-29-strengthening-npm-security-important-changes-to-authentication-and-token-management/

## Azure

- **Postgres Flexible Server** auth modes: Postgres-only, Entra-only, or both [src]. https://learn.microsoft.com/azure/postgresql/flexible-server/how-to-configure-sign-in-azure-ad-authentication
- **Passwordless pattern** [src]:
  - Username is the Entra principal/role name.
  - Password is an access token for scope `https://ossrdbms-aad.database.windows.net/.default`, via `DefaultAzureCredential` or managed identity.
  - Tokens expire in ~60 min. Use pg's async `password` function so each new connection gets a fresh token [UNVERIFIED detail].
  - SSL with `rejectUnauthorized: true`.
- **Official helper:** `@azure/postgresql-auth` 1.0.0 (GA 2026-09; works with pg and Sequelize) [npm][src]. https://learn.microsoft.com/javascript/api/overview/azure/postgresql-auth-readme
- **Versions** [npm]: `@azure/identity` 4.14.1, pg 8.23.1, mysql2 3.24.6, tedious 20.3.9 (MSSQL).
- **MySQL Flexible Server** supports Entra auth with the same token approach [UNVERIFIED].

## Flags for the stack decision

1. **Drizzle v1 and Prisma 8 are both pre-GA** with big API changes. Target the Drizzle v1 RC (and Prisma 7 for any Prisma adapter) behind adapters we control.
2. **TypeScript 7 has no compiler API.** Pin TS 6 (`@typescript/typescript6`) for ts-morph/codemods.
3. **Better Auth is the de facto auth choice but is now Vercel-owned.** Plan for SCIM API churn; keep the adapter boundary.
4. **Use Valkey (BSD-3)** if AGPL is a concern. BullMQ 6 can also run on Postgres.
5. **Many majors landed in 2026**: pnpm 12, Vitest 5, Changesets 3, React Router 8, TanStack Table 9, CASL 7, OTel SDK 3, TypeORM 1, MikroORM 7, TS 7. Pin versions deliberately (catalogs within multi-package repos, `packageManager` field, Renovate).
