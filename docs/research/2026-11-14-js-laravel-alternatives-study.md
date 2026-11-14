# How JS/TS frameworks approach Laravel's workflow (research, 2026-11-14)

**What this is:** a dated research snapshot for rebuilding Strutvane as a "Laravel for TypeScript". The target developer flow is:

1. One interactive create command. It asks about the UI, auth and database, then installs, sets up the DB, migrates and seeds.
2. `make:migration` also creates the model, and creates a seeder when you pass a flag.
3. The developer writes the columns in the migration.
4. `migrate` runs the migration and seeds when the seeder has content.
5. Strutvane then generates the CRUD API (pagination, search on every field, slugs) and, if a UI was chosen, the UI screens with a sidebar entry.

**Hard constraint (from the user, 2026-11-14):** everything is managed with **npm (classic) and npm workspaces only**. pnpm and yarn are out.

**Legend** (same as [stack-snapshot-2026-11.md](stack-snapshot-2026-11.md)):

- **[npm]**: version read from npm registry dist-tags on 2026-11-14 (`npm view <pkg> dist-tags`). Treat it as verified.
- **[src]**: confirmed by official docs, a blog or release notes, fetched 2026-11-14.
- **[UNVERIFIED]**: prior knowledge or a single secondary source.

> **Conflict notice.** This direction contradicts several canonical decisions in [00-executive-summary.md](../00-executive-summary.md):
>
> - **D4/D5** say the model file is the source of truth and migrations are auto-diffed. This study's direction makes the migration the source of truth.
> - **D9** makes Drizzle the SQL engine underneath. A migration-first builder doesn't need Drizzle's diff engine.
> - **D15** uses `pnpm dev`.
> - **D17** sets up a polyrepo linked by a pnpm workspace.
> - The CLAUDE.md files say pnpm via corepack. That conflicts with the npm-only constraint.
>
> This document does not change any decision. Adopting its recommendations needs new ADRs (see §6).

---

## 1. AdonisJS (the closest Laravel analogue)

### 1.1 Versions and status

- **AdonisJS v7** was released on **2026-02-25** [src: [blog/v7](https://adonisjs.com/blog/v7), [core 7.0.0 release](https://newreleases.io/project/github/adonisjs/core/release/v7.0.0)]. It requires **Node ≥ 24 and npm ≥ 11** [src: [installation](https://docs.adonisjs.com/guides/getting-started/installation)].
- Current versions:
  - `@adonisjs/core` 7.6.0
  - `@adonisjs/lucid` 22.4.2
  - `create-adonisjs` 3.4.0
  - `@adonisjs/auth` 10.1.0
  - `@adonisjs/ally` 6.3.2
  - `@vinejs/vine` 4.4.0
  - Source: [npm]

### 1.2 Create command and starter kits

- The create command is `npm create adonisjs@latest [name]`. With npm, flags go after `--`, for example `npm create adonisjs@latest my-app -- --kit=react --pkg=npm` [src: [installation](https://docs.adonisjs.com/guides/getting-started/installation)].
- **Interactive prompts:** only the starter kit. Everything else is decided by the kit.
- **Non-interactive use** (CI, AI agents) needs both the directory and `--kit`.
- **Flags:**
  - `--kit`
  - `--pkg` (npm, yarn or pnpm)
  - `--git-init`
  - `--skip-migrations`
  - `--token` (for private kit repos)
  - `--verbose`
- **What it does:** downloads the kit, installs dependencies, creates `.env`, generates `APP_KEY` and **runs migrations** [src].
- **Kits:**
  - `hypermedia` (Edge templates and Alpine.js)
  - `react` and `vue` (Inertia)
  - `api` (session and access-token auth)
  - `api-monorepo` (a Turborepo backend plus an empty frontend)
  - **Every kit includes Lucid and Auth with working login and signup** [src: [blog/v7](https://adonisjs.com/blog/v7)].
- **Custom kits** can be hosted on GitHub, GitLab or Bitbucket [src].
- **Not found:** no `--db` or `--auth-guard` prompts on the current page. The database is chosen afterwards, through `node ace add @adonisjs/lucid --db=<sqlite|libsql|mysql|postgres|mssql>` [src: [Lucid guide](https://docs.adonisjs.com/guides/database/lucid)].
- Laravel's `laravel new` asks for the testing framework, database and starter kit, and creates and migrates an SQLite DB by default [src: [Laravel installation (master)](https://laravel.com/docs/master/installation)]. **Strutvane's planned flow (asking UI + auth + DB + seeding) is richer than both.**

### 1.3 Commands (`node ace …`)

- **`ace` is a project file.** You run `node ace <cmd>`, so npm is never in the invocation path: no `npx` resolution and no `npm run x -- --flag` escaping.
- **Lucid commands** [src: [Lucid commands](https://lucid.adonisjs.com/docs/commands)]:
  - **`make:model <name>`**:
    - `--migration`, `--controller`, `--transformer`, `--factory`, `--contents-from`, `--force`
    - **There is no seeder flag on make:model**, and the commands page documents no short flags.
    - Laravel's `make:model` has `-m -f -s -c -R -a --pivot --policy` and combinations such as `-mfsc` [src: [Eloquent (master)](https://laravel.com/docs/master/eloquent)].
  - **`make:migration <name>`**:
    - `--create <table>` (the default), `--alter <table>`, `--connection`, `--folder`, `--contents-from`, `--force`
    - Lucid 22.0.0-next.7 "auto-detected migration intent from the name" [src: [releases](https://docs.adonisjs.com/releases)]. The commands page itself documents only explicit `--create`/`--alter`.
  - **`make:seeder`** and **`make:factory`**
  - **`migration:run`**:
    - `--force` (required in production)
    - `--dry-run` (prints SQL)
    - `--disable-locks`
    - `--schema-path` (bootstraps from a dump)
    - `--no-schema-generate`
  - **`migration:rollback`**: `--batch N` (`0` rolls back everything) and `--step N`
  - **`migration:refresh --seed`** and **`migration:reset`**
  - **`migration:fresh --seed`**: also takes `--drop-views`, plus `--drop-types` and `--drop-domains` (PostgreSQL only)
  - **`migration:status`**
  - **`db:seed`**: `-i` (interactive) and `--files`
  - **`db:wipe`**
  - **`schema:generate`**
  - **`schema:dump`**: takes `--prune`, which squashes old migrations
- **`node ace add <pkg>`** installs a package and runs its configure hook. It is the equivalent of the Strutvane installer protocol.
- **`@adonisjs/core` 7.3.0** added `--force` overwrite to make commands [src: releases].

### 1.4 Lucid ORM

- **Active Record on Knex.** Supported databases are PostgreSQL, MySQL, SQLite, MSSQL and libSQL/Turso [src: [Lucid guide](https://docs.adonisjs.com/guides/database/lucid)].
- **Migrations:**
  - Each migration is a class with `up`/`down` methods that uses the Knex-style schema builder.
  - Migrations run in transactions by default.
  - Concurrent runs are blocked by an advisory lock [src: commands page, `--disable-locks`].
- **The v7 change that matters most to Strutvane:** **migrations are the source of truth, and model column types are generated from the database.**
  - After `migration:run`, `rollback`, `refresh`, `reset` or `fresh`, Lucid **introspects the database** and writes **`database/schema.ts`**.
  - That file holds one class per table (for example `PostsSchema extends BaseModel`) with `@column` decorators and `declare`d typed properties.
  - **Models extend the generated class:** `export default class Post extends PostsSchema {}`.
  - Sources: [blog/v7](https://adonisjs.com/blog/v7), [schema generation](https://lucid.adonisjs.com/docs/schema-generation), [schema classes](https://lucid.adonisjs.com/docs/schema-classes).
  - This shipped in Lucid **22.0.0 (Feb 2026)** [src: releases].
- **Schema generation details** [src]:
  - Table `users` becomes `UsersSchema`. snake_case columns become camelCase properties. Columns are sorted **alphabetically**.
  - The file is **overwritten every time**. Customisation goes through `database/schema_rules.ts`:
    - rules for types, columns and tables, with `tsType`, `decorators` and `imports`
    - precedence: table column → table type → global column → primary key → global type
  - Model overrides can narrow a type but not change it incompatibly.
  - Configuration (`schemaGeneration` in `config/database.ts`):
    - `enabled`
    - `outputPath`
    - `rulesPaths`
    - `excludeTables`
    - `schemas` (Postgres)
  - Behaviour:
    - Generation is **skipped in production** [src: Lucid guide; 22.0.0-next.4 release note].
    - The docs recommend **committing `database/schema.ts`** and adding a CI step that runs `schema:generate` and fails on any diff [src: schema generation].
    - `schema:generate` also adopts **legacy databases**.
- **Default type mapping and its weaknesses** [src: schema classes]:

  | Database type | TypeScript type |
  |---|---|
  | `integer` | `number` |
  | `bigint` | `bigint \| number` |
  | `decimal` | `string` |
  | `boolean` (and MySQL `tinyint`) | `boolean` |
  | `date`/`timestamp` | Luxon `DateTime` |
  | **`json`** | **`any`** |
  | **`enum`** | **`string`** |
  | `uuid` | `string` |
  | unknown types | `any` |

  - Nullable columns get `| null`.
  - **These gaps are the price of introspection.** The database doesn't know the JSON shape or that an enum should be a literal union, so you have to restate that knowledge in rules.
- **Relationships:** `belongsTo`, `hasOne`, `hasMany`, `manyToMany` and `hasManyThrough`, declared with decorators on the model [src: [models](https://lucid.adonisjs.com/docs/models)].
- **Pagination** [src: [pagination](https://lucid.adonisjs.com/docs/pagination)]:
  - **Offset only:** `.paginate(page, perPage = 20)`, which runs `LIMIT/OFFSET` plus a `COUNT`.
  - Keyset/cursor pagination is "build it yourself".
  - Meta fields: `total`, `perPage`, `currentPage`, `lastPage`, `firstPage`, `firstPageUrl`, `lastPageUrl`, `nextPageUrl`, `previousPageUrl`.
  - Helpers: `baseUrl()` and `queryString()`.
- **Serialization:** v7 added **Transformers** (`BaseTransformer.toObject`). Relationships serialize one level deep by default, and `InferData` types flow to the frontend [src: blog/v7].
  - `BaseSerializer` intentionally exposes few extension points [src: [insiders changelog](https://insiders.adonisjs.com/changelog), via search].
- **Factories and seeders:** `Factory.define(...)` and `make:factory`. Seeders run through `db:seed` or `migration:fresh --seed`. **Migrate never seeds automatically** [src].

### 1.5 Routing, controllers and validation

- **Resource routes:** `router.resource('posts', controllers.Posts)` creates `index/create/store/show/edit/update/destroy` with automatic names such as `posts.index`.
- **Controller barrel:** in v7, controllers come from a **generated barrel**, `#generated/controllers` [src: [routing](https://docs.adonisjs.com/guides/basics/routing)].
- **End-to-end types:** v7 codegen produces route types (`urlFor`, frontend `<Link>`/`<Form>`), Inertia page prop types and a **Tuyau** API client registry [src: blog/v7].
- **Validation:** **VineJS** (`@vinejs/vine` 4.4.0 [npm]), Adonis's own schema validator. Adonis doesn't use Zod by default [UNVERIFIED detail].

### 1.6 Auth

`@adonisjs/auth` uses guards plus user providers [src: [auth intro](https://docs.adonisjs.com/guides/auth/introduction), [access tokens guard](https://docs.adonisjs.com/guides/auth/access-tokens-guard)]:

- **Install:** `node ace add @adonisjs/auth --guard=session|access_tokens|basic_auth`.
- **Access tokens:** the token guard adds a migration for the tokens table, and its middleware throws `E_UNAUTHORIZED_ACCESS` when a token is missing, invalid or expired.
- **Social login:** comes from **Ally** (`node ace add @adonisjs/ally --providers=…`). Ally handles the OAuth dance, and then you create a session (web) or issue a token (API/mobile) [src: [social auth](https://docs.adonisjs.com/guides/auth/social-authentication)].
- **Authorization:** Bouncer (policies/abilities) [UNVERIFIED for v7 specifics].

### 1.7 Views, container and providers

- **Views:** Edge templates (hypermedia kit) or Inertia with React/Vue.
- **IoC container:** `@adonisjs/fold`.
  - Constructor injection uses the **`@inject()` decorator with `experimentalDecorators` + `emitDecoratorMetadata`**.
  - `import type` silently breaks injection (the value becomes `undefined`).
  - Interfaces can't be tokens; use abstract classes.
  - Source: [dependency injection](https://docs.adonisjs.com/guides/concepts/dependency-injection).
- **Service providers** register bindings in `register()` and have startup and shutdown hooks [src].

### 1.8 Packaging

- **`@adonisjs/core` 7.6.0 is not a monorepo** [src: [core package.json](https://raw.githubusercontent.com/adonisjs/core/7.x/package.json)].
- It is a **facade package**:
  - It depends on about 13 separately published `@adonisjs/*` packages: `ace`, `application`, `bodyparser`, `config`, `env`, `events`, `fold`, `hash`, `health`, `http-server`, `http-transformers`, `logger`, `repl`.
  - It re-exports them through **about 50 subpath exports**, such as `@adonisjs/core/http`, `/hash`, `/env`, `/container`, `/vine`, `/transformers` and `/ace/codemods`.
- **Optional first-party packages** each live in their own repo and npm package, and you add them with `node ace add`: `lucid`, `auth`, `ally`, `session`, `shield`, `drive`, `mail`, `bouncer`, `otel`, …
  - The repo layout is [UNVERIFIED per package; typical of the `adonisjs` GitHub org].

### 1.9 Known pain points (sourced; treat as signals, not consensus)

- **Lucid is coupled to Adonis through Ace.** The Adonis team itself says this will be removed in a future major [src: [roadmap to v7](https://adonisjs.com/blog/roadmap-to-adonisjs-7), via search].
- **Lucid's typing is weaker than Kysely's.** Lucid's own docs concede Kysely "sets the bar" [src: Lucid intro on GitHub, via search]. Introspected types fall back to `any` for JSON and `string` for enums (§1.4).
- **Decorators everywhere:** columns, relationships and `@inject`. The Adonis "we hear you" page lists "structural ceremony: decorators, module registration, IoC containers" as a general pain point of the TS ecosystem [src: [we-hear-you](https://adonisjs.com/we-hear-you)].
- **Small ecosystem, "non-mainstream" internals** (its own router, ORM and validator), and long-term lock-in [src: [Edana 2026-01](https://edana.ch/en/2026/01/15/advantages-and-drawbacks-of-adonisjs-a-structured-full-stack-accelerator-or-a-long-term-constraining-framework/), a consultancy opinion; HackerNoon summary of Reddit threads, undated].
- **No auto-CRUD.** `make:model --controller` generates an empty resourceful controller. There is no generated API or admin UI from the schema.

### Implications for Strutvane

1. **Adonis v7 already validates the migration-first, types-generated-after model** (`database/schema.ts`, committed, CI-checked). Strutvane should copy its *workflow* (regenerate after every migrate or rollback, commit the file, a `--check` mode in CI, skip in production) but **not its source of types** (see §3: introspection loses enums, JSON shapes, renames and offline determinism).
2. **Copy `node ace` for npm.** Ship a project-local entry file so the CLI runs as **`node sv make:migration create_posts_table`**. That avoids `npx` resolution latency and npm's `npm run sv -- --flag` escaping. Also expose a `sv` bin so `npx sv …` works.
3. **Copy the create command's shape** (`npm create strutvane@latest my-app`, flags after `--`, kits, `--skip-migrations`, non-interactive mode for CI/agents). Go further than Adonis by asking about the UI, auth, DB and seeding in the wizard.
4. **Beat Adonis where it is weakest:**
   - no decorators (already an ecosystem rule)
   - strict types for enums and JSON
   - auto CRUD API and UI from the schema
   - built-in keyset pagination
   - auto-seed on migrate in development
5. **Copy the facade-package pattern:** one installable `@strutvane/framework` with subpath exports, internally composed of smaller modules (§5).

---

## 2. Other JS/TS frameworks and tools compared

| Tool (version on 2026-11-14) | Source of truth | What it generates | Notes |
|---|---|---|---|
| **NestJS** (`@nestjs/cli` 12.0.13 [npm]) | Hand-written code | `nest g resource` asks for a transport (REST, GraphQL code/schema-first, microservice, WebSocket) and generates the module, controller/resolver, service, entity, DTOs and specs, then registers the module | **The service methods are empty stubs and ORM-agnostic**, so there is no real CRUD [src: [CRUD generator](https://docs.nestjs.com/recipes/crud-generator)]. Heavy decorators and DI. |
| **RedwoodJS** (`@redwoodjs/cli` 8.9.0 [npm], docs v8.8) | `schema.prisma` | `yarn rw g scaffold <model>` generates SDL, services, layout, pages, Cells and components, and adds routes. That is a **complete CRUD UI** [src: [CLI docs](https://docs.redwoodjs.com/docs/cli-commands#generate-scaffold)] | Since April 2025 the team's focus has moved to **RedwoodSDK** (RSC on Cloudflare). The original framework is "fully supported" per the team [src: [redwoodjs.com/blog/redwoodsdk](https://redwoodjs.com/blog/redwoodsdk)]. A competitor (Wasp) calls it "RedwoodGraphQL, maintenance mode" [src: [wasp.sh 2026-09](https://wasp.sh/resources/2026/09/09/redwoodjs-alternatives-2026)]. **Unclear long-term future.** Yarn-only CLI. |
| **Blitz.js** (`blitz` 3.0.2 [npm]) | `schema.prisma` | `blitz g all|resource|model|crud|queries|mutations|pages <model> name:string age:int? belongsTo:project` generates the Prisma model, queries, mutations and pages [src: [cli-generate](https://blitzjs.com/docs/cli-generate)] | **Field syntax on the command line** (`name:string:unique`) is a good DX idea. Activity is low [UNVERIFIED]. |
| **Wasp** (`wasp` 1.0.11 on npm [npm]; docs show `^0.26` [src]) | `main.wasp(.ts)` config plus Prisma entities | `crud("Tasks", "Task", { getAll, get, create, update, delete })` generates server operations with full-stack types. Operations are **private by default**, and `isPublic` / `overrideFn` change that | **It generates no UI**, has no authorization or validation yet, and is in "early preview" [src: [Wasp CRUD](https://wasp.sh/docs/data-model/crud)]. Note: the npm package named `wasp` may not be the Wasp installer [UNVERIFIED]. |
| **Sails.js** (`sails` 1.5.18 [npm]) | Waterline model files | **Blueprints**: an automatic REST API (`find`, `create`, `update`, `destroy`, `populate`, …) for every model, which you can override or disable [src: [blueprints](https://sailsjs.com/documentation/concepts/blueprints)] | This is the original "auto CRUD from model" in Node. No types, and the project looks dormant (last major in 2018 [UNVERIFIED]). |
| **LoopBack 4** (`@loopback/cli` 8.0.0 [npm]) | Model classes (decorators) | `lb4 discover` **introspects an existing DB into model classes** (MySQL, PG, Oracle, MSSQL, …; `--relations`, `--all`, camelCase with the original `columnName` kept). A REST-CRUD model-endpoint builder also exists [src: [Discovering models](https://loopback.io/doc/en/lb4/Discovering-models.html)] | Enterprise-oriented and heavy on decorators. |
| **Strapi 5** (`@strapi/strapi` 5.62.0 [npm]) | `schema.json` content types (built in an admin UI) | REST, GraphQL and an admin edit/list UI | **The schema auto-syncs on every startup, "without any warning or confirmation prompt"**. Migrations are only one-time scripts that run *before* the sync. **There are no down migrations** [src: [database migrations](https://docs.strapi.io/cms/database-migrations)]. |
| **Directus** (`@directus/api` 41.0.1 [npm]) | **The live SQL database** (mirrors any schema) | REST, GraphQL, SDK, realtime and the admin app, "immediately" after you connect | Licensed under the **Monospace Sustainable Core License**, not MIT/OSI; above a size limit you need a paid license [src: [overview](https://directus.com/docs/getting-started/overview)]. |
| **Payload 3** (`payload` 3.93.0, v4 in beta [npm]) | `payload.config.ts` collections | Local, REST and GraphQL APIs, the admin list/edit UI, and migrations diffed from the config (Postgres/SQLite through Drizzle). `migrate:create`, `migrate`, `migrate:down`, `migrate:fresh` | `slug`, `admin.useAsTitle`, `defaultColumns`, `listSearchableFields` (defaults to the ID or `useAsTitle`, and should be indexed), `group` and `pagination.defaultLimit = 10` [src: [collections](https://payloadcms.com/docs/configuration/collections)]. In development it uses **Drizzle push**, with the warning "do not mix 'push' and migrations" [src: [migrations](https://payloadcms.com/docs/database/migrations)]. The closest TS analogue to "config → admin + API". |
| **Refine** (`@refinedev/inferencer` 7.0.0 [npm]) | The API response at runtime | The Inferencer generates list, show, edit and create pages by **sampling records** | Detects relations by property names ending in `id`/`ids` or objects with `id`, then confirms by probing the data provider. Experimental and "for development"; you copy the generated code out [src: [inferencer](https://refine.dev/docs/packages/inferencer/)]. |
| **React-admin** (`react-admin` 5.15.7 [npm]) | The API response at runtime | `<ListGuesser>`/`<EditGuesser>` log component code to the console for you to copy | "Do not use the guessers in production" [src: [ListGuesser](https://marmelab.com/react-admin/ListGuesser.html)]. |
| **AdminJS** (`adminjs` 7.8.17 [npm]) | ORM models through adapters (TypeORM, Prisma, Sequelize, Mongoose, …) | Admin panel, with `navigation {name, icon}` grouping and `list/filter/show/editProperties` | **No default sort order** unless you configure one [src: [resource](https://docs.adminjs.co/basics/resource)]. |
| **Prisma 7** (stable line 7.10.1, **`latest` tag = 8.0.0-rc.33** [npm]) | `schema.prisma` | `migrate dev` diffs the schema into SQL migrations. `db pull` introspects. Prisma 7 (2025-11-19) is Rust-free and uses `prisma.config.ts` [src: [changelog](https://www.prisma.io/changelog/2025-11-19)] | **Down migrations aren't native.** You hand-generate `down.sql` with `migrate diff` and apply it with `db execute` + `migrate resolve --rolled-back` [src: [down migrations, v7](https://www.prisma.io/docs/orm/prisma-migrate/workflows/generating-down-migrations)]. Prisma 8 is a major API rework (see the stack snapshot). |
| **Drizzle Kit** (`latest` 0.31.11; v1 at `1.0.0-rc.5` [npm]) | TS schema (`pgTable(...)`) | `generate`, `migrate`, `push`, `pull` (introspection → TS schema), `check`, `export` [src: [kit overview](https://orm.drizzle.team/docs/kit-overview)] | **No built-in down/rollback.** PR #5476 ("feat: add rollback/down migrations support", 2026-03) appeared still open in search results [UNVERIFIED status]. |
| **kysely-codegen** (0.20.0 [npm]) | **The live DB** | Introspects the database into a `DB` interface `.d.ts` for `Kysely<DB>`. Supports PG, MySQL, SQLite, MSSQL and libSQL. Flags include `--camel-case`, `--runtime-enums`, `--overrides` and **`--verify`** (fails if types are stale) [src: [repo](https://github.com/RobinBlomberg/kysely-codegen)] | The default output goes into `node_modules`; override it with `--out-file` to commit the file. |

**Precedents outside JS** (for the type question in §3):

- **Rails** writes `db/schema.rb` after every migration and recommends committing it. It notes that migrations "are not the authoritative source for your database schema": new databases load the schema file instead of replaying history [src: [Rails migrations guide](https://guides.rubyonrails.org/active_record_migrations.html)]. `change` migrations reverse themselves for operations such as `rename_column`.
- **Laravel** itself keeps no typed model. Typed model help comes from introspection tools such as `barryvdh/laravel-ide-helper` [UNVERIFIED].
- **Laravel's current docs are 13.x** [src: the Scout 12.x page says "Consider upgrading your project to Laravel 13.x"].

### Implications for Strutvane

1. **Nobody in JS delivers the full Laravel flow.** The pieces exist in different places:
   - migration-first with generated types: Adonis
   - a CRUD UI scaffold: Redwood/Blitz
   - auto API plus admin: Payload/Strapi/Directus
   - runtime-inferred admin: Refine/react-admin
   - So **"migration → typed model + API + UI + sidebar, offline, with rollbacks" is a real gap** and a credible differentiator.
2. **Avoid the failure modes these tools document:**
   - silent schema sync at boot (Strapi)
   - no down migrations (Strapi, Prisma, Drizzle)
   - generated services that are empty stubs (Nest)
   - UI guessers that aren't production-grade (Refine, react-admin)
   - frameworks tied to one package manager (Redwood/yarn)
   - non-OSI licensing (Directus)
3. **Payload's collection admin options are the best TS vocabulary for UI metadata.** Mirror their names where sensible: `useAsTitle`, `defaultColumns`, `listSearchableFields`, `group`, `labels`, `pagination.defaultLimit`.
4. **Blitz-style field syntax** is worth offering as an optional fast path: `node sv make:migration create_posts_table title:string body:text? status:enum(draft,published)`. It pre-fills the migration, which the developer then edits.

---

## 3. The key question: full TypeScript types when the migration is the source of truth

### 3.1 Requirements

- **Fast**, and **offline**: no DB needed to get types.
- **Deterministic and git-diffable.**
- Works on **Postgres, MySQL and SQLite**.
- Supports **rollbacks/down migrations** and **renames**.
- Gives **full end-to-end types**: model → API → client → UI.

### 3.2 Approaches

#### (a) Introspect the DB after migrate

Precedents: Adonis/Lucid `database/schema.ts`, `kysely-codegen`, `prisma db pull`, `drizzle-kit pull`, `lb4 discover`, Rails `schema.rb`.

- **Pros:**
  - Always reflects reality, including raw SQL, triggers and manual changes.
  - Adopts legacy databases for free.
  - Simple mental model.
  - Proven in production by Adonis v7.
- **Cons:**
  - **Needs a running DB** to produce types, so it isn't offline. A fresh clone without a DB has no types unless the file is committed.
  - **Information loss** (each fallback has to be restated in rules or overrides):
    - JSON becomes `any`.
    - Enums become `string`, or, on MySQL/SQLite, lose their values entirely when stored as varchar or check constraints.
    - `decimal` becomes `string`.
    - Boolean-vs-`tinyint` is ambiguous.
    - SQLite type affinity is loose: almost anything is `TEXT`/`NUMERIC`.
  - **Not deterministic across engines.** The same migration introspects differently on PG, MySQL and SQLite, so the generated file differs by engine.
  - **Renames are invisible.** A renamed column looks like drop + add, so any metadata attached to the old name is lost.
  - **No UI/API metadata.** Labels, searchable fields, slugs and relations beyond FKs aren't stored in the DB.
  - **Slow.** Each regeneration is a catalog query.

#### (b) A statically analysable TS schema DSL inside the migration

Two variants:

- **(b1) Parse the migration file's AST.** This is fragile. Loops, helper functions, conditionals and imported constants break it. Not recommended.
- **(b2) Run the migration's `up()`/`down()` against a recording schema builder with no DB attached.** The builder appends typed operations to an in-memory schema model. Replaying all migrations in order produces a **schema snapshot**, from which the framework emits types plus metadata.

Assessment of (b2):

- **Pros:**
  - Fully **offline** and **fast** (pure JS, milliseconds).
  - **Deterministic and engine-independent**, because the snapshot is in Strutvane's logical types, not SQL types.
  - **Renames are first-class** (`renameColumn` is an operation), so metadata follows the column.
  - **Down migrations are exact.** Rolling back to N−1 means replaying N−1 migrations.
  - It can carry **richer types than the DB knows**: `t.enum('status', ['draft','published'])` becomes a literal union on every engine, `t.json<Address>('address')`-style declarations type the JSON, and `t.slug('slug').from('title')` carries meaning.
  - It is already how Laravel works: the migration builder is the declaration.
- **Cons:**
  - **Raw SQL (`schema.raw(...)`) is opaque** to the recorder. Mitigations, in order of preference:
    - require a declared effect, for example `schema.raw(sql, { alters: t => t.string('x') })`
    - otherwise mark the table "needs verification" and require approach (a) to confirm it
  - Migrations must be **pure with respect to the schema**: no reading the DB to decide what DDL to run. Data migrations still run normally at real migrate time; the recorder ignores data statements.
  - Generic type parameters such as `json<Address>` don't exist at runtime. The recorder only sees `'address'`. Two ways to carry the TS type into generated code:
    - pass a **type reference** (`t.json('address').type('Address', '#types/address')`, the way Lucid rules carry `tsType` + `imports`)
    - or have a tiny compile-time extractor read only the type argument
  - **Old migrations must keep working forever.** The builder API is a long-term compatibility contract. Kysely makes the same point: migrations must be "frozen in time" and use `Kysely<any>`, not the typed DB [src: [Kysely migrations](https://kysely.dev/docs/migrations)]. Mitigate with a `schema:dump`/squash (Adonis `schema:dump --prune`, Rails `db:schema:load`): the snapshot becomes the new baseline.

#### (c) Decorators or declarations on the model

Adonis ≤ v6 and still the generated schema classes, LoopBack, TypeORM.

- **Pros:** types sit next to behaviour.
- **Cons:**
  - Duplicates the migration, so two sources of truth drift. That is exactly why Adonis v7 moved to generation.
  - Needs `experimentalDecorators` or TC39 decorators.
  - Strutvane's ecosystem rules ban decorators and reflection.
- **Rejected.**

### 3.3 Scorecard

| Criterion | (a) Introspection | (b2) Recording replay | (c) Model decorators |
|---|---|---|---|
| Offline / no DB | ✗ | ✓ | ✓ |
| Speed | slow (catalog queries) | fast | n/a |
| Deterministic across PG/MySQL/SQLite | ✗ | ✓ | ✓ |
| Git-diffable output | ✓ (if committed) | ✓ | ✓ |
| Enums / JSON / slug semantics | ✗ (rules needed) | ✓ | ✓ |
| Renames | ✗ | ✓ | manual |
| Rollback correctness | ✓ (re-introspect) | ✓ (replay N−1) | ✗ |
| Raw SQL / manual DB changes | ✓ | ✗ (needs declaration or verify) | ✗ |
| Legacy DB adoption | ✓ | ✗ (needs `schema:pull` bootstrap) | ✗ |
| Single source of truth | ✓ | ✓ | ✗ |

### 3.4 Recommendation: (b2) as the generator, with (a) as the verifier and the legacy bootstrap

**Generation.** On every `make:migration`, `migrate`, `rollback`, `fresh` and `refresh` (and on file save in `node sv dev` watch mode), replay `database/migrations/*` through the recording builder and write two committed files:

- `database/schema.gen.ts`:
  - one `const` table definition per table (plain objects plus `as const`, **no decorators**)
  - the exported row, insert and update types (`Post`, `NewPost`, `PostPatch`)
  - ordering follows **migration/declaration order, not alphabetical**, so new columns appear where they were added
- `.strutvane/schema.snapshot.json`: the canonical logical schema, keyed by stable IDs, used for diffs, the API, the UI and OpenAPI.

Output must be byte-stable: sorted keys, a fixed formatter and no timestamps.

**Model.** `make:migration create_posts_table` creates `app/models/post.ts` if it doesn't exist:

```ts
export default defineModel(posts, { /* optional overrides */ })
```

It adds relations, slug rules, labels, hooks, scopes and hidden fields. **The model never redeclares columns.** It can only narrow them, type-checked against the generated table, which is Lucid's override rule.

**Verification.**

- `node sv schema:check` (run in CI and after `migrate` in development) introspects the live DB (approach (a)) and diffs it against the replayed snapshot.
- Drift fails with a `Problem` that names each column.
- `node sv schema:generate --check` fails CI if the committed generated files are stale. This is the pattern from Adonis docs and `kysely-codegen --verify`.

**Legacy and raw SQL.**

- `node sv schema:pull` introspects an existing DB once and writes a **baseline migration** in the DSL, so replay works from then on.
- `schema.raw()` must declare its effect, or `schema:check` becomes mandatory for that table.

**Types end to end.**

- Read and write types come from `schema.gen.ts`.
- Validators: Standard Schema/Zod is generated from the same snapshot, which matches D11.
- Codegen emits API route types and a typed client, which is the Adonis Tuyau pattern.
- UI field metadata comes from the snapshot plus model overrides, so adding a column needs only `migrate`.

**Engines.** The recorder's logical types map to dialect DDL through one emitter per dialect (PG, MySQL, SQLite). Use Kysely's schema builder underneath for real execution; it's already in D9.

- Enums become a native `enum` on PG and MySQL and a `CHECK` constraint on SQLite. The TS type is identical everywhere.

**Rollbacks and renames.**

- Every builder operation has a known inverse, so `down()` can be **auto-derived** for reversible operations (Rails `change` semantics).
- An explicit `down()` is needed only for irreversible operations: drops of data and `raw`.
- `renameColumn`/`renameTable` keep the stable column ID, so model overrides and UI metadata survive renames.

**Failure scenarios to design for up front:**

1. Generated files are stale on a teammate's clone. `schema:generate --check` in CI fixes it, and `node sv dev` regenerates on start.
2. Partial migration failure. Wrap each migration in a transaction where the engine allows it. MySQL DDL auto-commits, so record the per-migration state, and regenerate types only from *successfully applied* migrations.
3. A migration that imports app code. Lint it: migrations may import only `@strutvane/framework/migrations`.
4. Production. Never generate there; it is read-only (Adonis skips generation in production too).
5. Concurrent `migrate` from several instances. Use an advisory lock (as Lucid and Kysely do).

**Relationship to D4/D5.** This **inverts D4/D5** from model-first to migration-first. It keeps D6 (thin metadata-driven files, no regeneration of owned code), because the API and UI read the snapshot at runtime. It also removes the need for Drizzle's diff engine (D9). **Requires an ADR.**

### Implications for Strutvane

- Adopt **(b2) replay-generated types plus (a) verification**.
- Make the migration builder a **versioned public contract** (an RFC before implementation).
- Commit `database/schema.gen.ts` and the snapshot, and gate CI on `--check`.
- Never use decorators.
- Spike it before the ADR: run the recorder against the 20 most common Laravel migration operations on PG, MySQL and SQLite, and fuzz it with random migration sequences. The property to prove: replay(up₁..ₙ, down₁..ₖ) == introspect(DB).

---

## 4. Auto-generated CRUD API and admin UI patterns

### 4.1 Labels, titles and navigation

- **Filament 4.x** [src: [resources overview](https://filamentphp.com/docs/4.x/resources/overview)]:
  - **Labels:** the model label comes from the class name (`Customer` → "customer"), the plural from pluralisation, title-cased automatically.
  - **Navigation:** defaults to the plural label, with `$navigationIcon`, `$navigationGroup`, `$navigationSort` and `$navigationParentItem`.
  - **Title and search:** `$recordTitleAttribute` drives the record title and global search.
  - **Generation:** `make:filament-resource --generate` **introspects the DB columns** to build the form and table.
  - **URL slug:** derived from the resource name, overridable with `$slug`.
- **Payload** [src]:
  - `labels` are generated from `slug`.
  - `useAsTitle` defaults to the ID.
  - `listSearchableFields` defaults to the ID or `useAsTitle`, and the docs say to index those fields.
  - `admin.group` groups the navigation.
- **AdminJS** [src]: `navigation {name, icon}` and per-property visibility arrays. There is **no default sort**.
- **Refine and react-admin** [src]: relation detection by `*_id`/`*Id` naming, then confirmed by probing.

### 4.2 Pagination

- **Lucid** [src]: offset only, `perPage` 20, meta with URLs.
- **Laravel** has `paginate` (offset with total), `simplePaginate` (no count) and `cursorPaginate` (keyset) [UNVERIFIED for 13.x wording; long-standing API].
- **Payload's admin** defaults to a limit of 10 [src].
- **Trade-off:**
  - Offset with total is what admin UIs need: page numbers and "x of y".
  - It degrades on large tables because of the `COUNT` plus deep `OFFSET`.
  - Cursor/keyset is stable under inserts and O(1) per page, but has no page numbers.

### 4.3 Search

- **Laravel Scout's database engine** [src: [Scout 12.x](https://laravel.com/docs/12.x/scout)]:
  - Runs **`LIKE` against every attribute you configured as searchable**.
  - `#[SearchUsingPrefix]` switches to `term%` (index-friendly).
  - `#[SearchUsingFullText]` uses a full-text index.
- **Payload** searches only the configured fields, and recommends indexing them [src].
- **"Search on every field"** with `LIKE '%term%'` means a full table scan per column, and type mismatches occur (searching `abc` against an integer column).

### 4.4 Slugs

- **spatie/laravel-sluggable** [src: [repo README](https://github.com/spatie/laravel-sluggable)]:
  - Generates from a source field into a slug field, on create or update.
  - Uniqueness uses a `-1`, `-2` suffix.
  - Supports scoped uniqueness, conditional skipping and custom suffix generators.
  - Optional **"self-healing" URLs** (slug plus ID, with a 308 redirect for a stale slug).
- **Regenerating on update breaks existing links.** Most CMSs freeze the slug after publish [UNVERIFIED as a general claim].

### Implications for Strutvane

**Conventions, all overridable in `app/models/*.ts`:**

- **Labels:**
  - Table `blog_posts` → model `BlogPost`.
  - Labels are "Blog post" / "Blog posts", from catalogs (RFC-0003), so they can be translated.
  - Column labels come from humanising the column name (`created_at` → "Created at").
- **Title attribute:** the first of `name`, `title`, `label`, `email`, `slug`, otherwise `id`.
- **Sidebar:**
  - one entry per resource, in migration order
  - group = `null` by default
  - a default icon chosen by a name heuristic, with a generic fallback
  - **only shown if the viewer's policy allows `list`** (deny by default, matching our security rules)
  - pivot tables (two FKs plus timestamps only) get no entry
- **Relations:**
  - from **foreign keys declared in the migration** (`t.foreignId('user_id').constrained()`), not name guessing
  - name-based guessing only as a *suggestion* in `make:` output

**Pagination:**

- **Offset by default for the UI and API:** `?page=&perPage=`, default 20 (Lucid and Laravel), and **a server-enforced maximum (100)**.
- Meta follows Lucid and Laravel naming (`total`, `perPage`, `currentPage`, `lastPage`, plus links).
- **Keyset** is available with `?cursor=` on any resource, and is the automatic choice for API clients that ask for it.
- `COUNT` can be disabled per resource for huge tables (`simplePaginate` semantics).
- There is always a deterministic order, `ORDER BY <sort>, id`. AdminJS's "no default order" is a bug source.

**Search (`?search=term`):**

- Applies to **text-like columns only** (string, text, slug, email, enum), combined with `OR`:
  - Postgres: `ILIKE`
  - MySQL: `LIKE` with the column's case-insensitive collation
  - SQLite: `LIKE`, which is case-insensitive for ASCII only. Document this.
- Numeric, UUID and date columns are matched **only when the term parses** as that type, using exact equality.
- **Escape `%` and `_`.** Cap the term length.
- Per-column filters: `?filter[status]=published`, with operators as an allow-list.
- Searchable and filterable columns are **only those visible to the viewer** (field-level policy), so search can't be used as an enumeration oracle.
- Opt-in `prefix` (`term%`) and `fulltext` modes per column, Scout-style, the latter requiring an index declared in the migration.
- **Generate a warning at `migrate` time** when a table above N rows is searched on unindexed columns [design idea].

**Slugs:**

- **Trigger:**
  - automatic when the migration declares `t.slug('slug')`, optionally `.from('title')`
  - or when a column is literally named `slug` and a `title`/`name` column exists
- **Uniqueness:**
  - unique per table
  - scoped per tenant when tenancy is on
  - backed by a **unique index in the migration**, never only by app logic, which fails closed under races
  - on collision, retry with a `-2`, `-3` suffix
- **Generation:** on create only by default, so URLs stay stable. `regenerate: 'onUpdate'` opts in. An optional slug-history table gives 301/308 redirects.
- **Format:** ASCII transliteration, lowercase, `-` separator, a max length, and a reserved-word blocklist (`new`, `edit`, `create`).
- **Routes accept the ID or the slug.**

**Generated API surface per resource:**

- `GET /api/<plural>` and `GET /api/<plural>/:idOrSlug`, plus `POST`, `PATCH` and `DELETE`
- an OpenAPI 3.1 description
- `Problem` errors
- policy checks deny by default; the scaffolded policy grants an admin role only

---

## 5. Repository and package structure (npm only)

### 5.1 How Laravel and Adonis are organised

- **Laravel:**
  - `laravel/framework` is **one monorepo package** that `replace`s **36 `illuminate/*` components** (`auth`, `database`, `queue`, `routing`, `validation`, …) [src: [composer.json 12.x](https://raw.githubusercontent.com/laravel/framework/12.x/composer.json)].
  - Each component is mirrored to a **"[READ ONLY] Subtree split"** repository, such as `illuminate/database`, so it can be installed alone [src: [illuminate/database](https://github.com/illuminate/database)].
  - **First-party add-ons** each live in **their own repo and package**: Sanctum, Socialite, Horizon, Telescope, Scout, Cashier, Pulse, Reverb, starter kits, … [src: the laravel.com package list].
- **Adonis:**
  - Separate packages in separate repos.
  - `@adonisjs/core` is a **facade** that depends on about 13 packages and re-exports them via subpaths.
  - Optional packages are added with `node ace add` (§1.8).

### 5.2 npm-specific facts that shape the choice

- **npm workspaces** [src: [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces)]:
  - You declare them in root `package.json` under `"workspaces"`.
  - `npm install` symlinks each workspace into the root `node_modules`.
  - Internal dependencies are saved as **normal semver ranges** (`"^1.0.0"`).
  - `npm run <s> --workspaces --if-present` runs scripts **"in the order listed in package.json"**, which is **not topological**. Build order must come from that list order or from `tsc -b` project references.
- **npm does not support pnpm's `workspace:*` protocol** [UNVERIFIED against current npm 11 docs; it isn't mentioned on the workspaces page]. Changesets must bump internal ranges, which it does for npm workspaces [UNVERIFIED].
- **npm and the CLI:**
  - **`npm create strutvane@latest`** runs the `create-strutvane` package. Flags go after `--`, as in Adonis's docs.
  - **`npm run sv -- make:migration x --seed`** needs the `--`. **`npx sv …`** doesn't, but it pays bin-resolution time.
  - **`node sv …`** (a project file, the Adonis `node ace` pattern) avoids both issues.
- **npm trusted publishing (OIDC)** works per package from GitHub Actions, as D18 already plans. It's the same for a monorepo with several packages [UNVERIFIED for multiple packages per workflow; spot-check before release].

### 5.3 Recommended structure for a TS framework that is "one framework package plus optional first-party packages"

- **One GitHub monorepo** (`strutvane/strutvane`) using **npm workspaces**:

  ```
  packages/
    framework/      → @strutvane/framework   (the facade users install; subpath exports)
    core/           → internal kernel (container, config, env, errors, events)  — may stay a separate published pkg for plugin authors
    database/       → migration builder + recorder + query/CRUD layer (exported via @strutvane/framework/db)
    http/           → router, controllers, resource API (exported via @strutvane/framework/http)
    cli/            → strutvane (bin: sv)
    create/         → create-strutvane
    auth/           → @strutvane/auth        (optional, installed by wizard or `node sv add @strutvane/auth`)
    ui/             → @strutvane/ui          (optional admin/resource UI)
    queue/, mail/, logs/, files/ …           (optional first-party)
  docs/  examples/  playground/
  ```

- **`@strutvane/framework` is a facade**, like Adonis core:
  - It depends on the internal packages with exact versions and re-exports them through subpaths: `@strutvane/framework/db`, `/http`, `/validation`, `/testing`.
  - Users install **one package** for the monolith experience.
  - Internals stay separately testable, and plugin authors can depend on `core` alone.
- **Optional packages** are installed independently with `node sv add <pkg>`, which runs `npm install` plus the package's installer (the `enhances` protocol). Each declares a **peer range** on `@strutvane/framework`.
- **Versioning:** Changesets with a **fixed (lockstep) group** for `framework` and its internals, plus the first-party packages that share the major train (the D18 intent). Satellites can version independently.
- **Read-only splits (Laravel style) are not needed.** npm installs subpackages straight from the registry, so splitting repos adds no install capability. Mirror repos are an option later, for discoverability only.
- **Why one repo beats the current 12-repo polyrepo (D17) for this goal:**
  - atomic cross-package changes, such as changing the migration builder and the UI renderer together
  - one CI and one lockfile (`package-lock.json`)
  - the e2e flow (`create` → `make:migration` → `migrate` → API + UI) tested in a single PR
  - **no local-only git-ignored workspace glue**
- **Costs:**
  - a larger clone
  - you must order the workspaces list (or use `tsc -b`) because npm isn't topological
  - one CODEOWNERS file instead of per-repo permissions

### Implications for Strutvane

- Move to **one npm-workspaces monorepo** with a facade `@strutvane/framework`, optional first-party packages in the same repo, Changesets in a fixed group, and per-package trusted publishing.
- This **supersedes D17 and the pnpm rules** in the CLAUDE.md files and ECOSYSTEM.md. It needs an ADR, plus a tooling change: `npm ci`/`npm run ci` instead of `corepack pnpm@12.18.0`.
- Keep the package boundary rules (contracts ← core ← products) as **lint rules inside the monorepo** (for example dependency-cruiser or Biome import restrictions), not as repo walls.

---

## 6. Summary of recommendations and ADRs needed

1. **Create command:** `npm create strutvane@latest my-app`.
   - Prompts: UI (none/React), auth (none/session/token, plus social), DB (SQLite/Postgres/MySQL, plus a connection test), seed demo data (y/n).
   - Then: `npm install` → write `.env` and `APP_KEY` → create the DB (SQLite file, or `CREATE DATABASE` when permitted) → migrate → seed.
   - A non-interactive flag set mirrors every prompt (as Adonis's `--kit` does), with `--skip-migrations`.
2. **CLI:** `node sv <cmd>` (a project file), with `npx sv` as an alias. Commands:
   - `make:migration create_posts_table [-s|--seed] [-f|--factory] [fields…]` creates the migration and, for `create_*` intents, the model `app/models/post.ts`. `add_*_to_*` intents don't create models.
   - `migrate`, `migrate:rollback --step`, `migrate:fresh --seed`, `db:seed`, `schema:generate --check`, `schema:check`, `schema:pull`
3. **Seeding on migrate:**
   - In development, `migrate` runs seeders whose `run()` is non-empty and that **haven't run yet**, tracked in a `strutvane_seeders` table so they run once and stay idempotent.
   - In production, never without `--seed --force`.
   - Laravel and Adonis never auto-seed, so this needs a clear note in the docs and an opt-out (`--no-seed`).
4. **Types:** migration DSL → recording replay → committed `database/schema.gen.ts` plus a snapshot. Introspection is only for verification and legacy pull (§3.4).
5. **CRUD API and UI:** runtime-driven from the snapshot plus model overrides, following the conventions in §4. A sidebar entry is created per resource when the UI is installed, gated by policy.
6. **Structure:** an npm-workspaces monorepo with a facade framework package (§5.3).

**ADRs or decision changes required before implementation:**

- **D4/D5/D9** (source of truth and migrations)
- **D15** (`pnpm dev` → `node sv dev` / `npm run dev`)
- **D17** (polyrepo → monorepo)
- the **pnpm → npm** tooling rules in `CLAUDE.md` / `ECOSYSTEM.md` and the synced tooling
- an RFC for the migration builder and recorder contract
- an RFC for the auto-CRUD conventions (pagination, search and slug rules)
