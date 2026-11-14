# Shared design board (v2 spikes)

> **Purpose:** every agent working on Strutvane v2 records here the interfaces and decisions that other parts depend on, and reads everyone else's entries before building, so the pieces fit together. The blueprint is `docs/18-v2-blueprint.md`.
>
> **Rules:**
> - Append under your own heading only. Never edit someone else's section.
> - If you need something changed in another section, add it under "Requests" at the bottom.
> - Keep entries short: the interface, the file path and format, a tiny example, and the date.

## Fixed decisions (project lead, 2026-11-14)

- **npm only:** never pnpm or yarn.
- **CLI:** `node strut <command>` (artisan-style `strut.js` in the app root); `npx strutvane` is an alias.
- **Default DB:** MySQL 8.4+. PostgreSQL and SQLite can be chosen. PostgreSQL adds RLS. On MySQL and SQLite, tenancy is enforced by the ORM's global tenant scope.
- **UI:** React only (React 19 + Vite + Tailwind 4 + shadcn-style components owned by the app).
- **Repository (REVISED 2026-11-14):** no single monorepo. Everything stays in the org `vishwajit-vm`, laid out like Laravel's GitHub:
  - `strutvane-framework` = `@strutvane/framework`; it absorbs core, contracts, cli and devkit, like `laravel/framework`;
  - `strutvane-skeleton` = the app template, like `laravel/laravel`;
  - `create-strutvane` = the installer, like `laravel/installer`;
  - `strutvane-docs` = the docs, with version branches, like `laravel/docs`;
  - `strutvane-auth` (Fortify + Sanctum) and `strutvane-ui` (Filament-like);
  - add-on repos (`strutvane-log-viewer`, `strutvane-files`, …), which depend on the PUBLISHED framework;
  - the hub `strutvane` stays the ecosystem hub.
- **Architecture:** MVC, Laravel layout: `app/http/controllers`, `app/models`, `app/policies`, `bootstrap/app.ts`, `routes/web.ts` + `routes/api.ts`, `config/`, `database/{migrations,seeders,factories}`, `resources/ui`.
- **Source of truth:** columns live in migrations. The schema is derived by in-memory replay (spike 10).
- **Code standard:**
  - every export has a friendly TSDoc block (what, why, an example);
  - comments explain the *why*;
  - small functions;
  - friendly error messages with a fix;
  - no `any`, no non-null assertions, no decorators;
  - tests for everything.
- **Everything is versioned**, code and docs together (Laravel-style version branches).

## Spike 10: migration-first schema (done, commit d4d225d)

- **Migration file format:** `export default migration({ up(schema) {...}, down(schema) {...} })` with a Laravel Schema builder (`t.id()`, `t.string(n, len)`, `t.slug(n).from(col)`, `t.decimal`, `t.enum`, `t.foreignId().constrained()`, `t.timestamps()`, `t.softDeletes()`, …). See `spikes/10-migration-first-schema/README.md`.
- **Generated outputs:**
  - `.strutvane/types/models.d.ts`: per table `Row`, `New`, `Patch` and `Json` shapes, plus a `TableRegistry` augmentation;
  - `.strutvane/resources.json`: labels, searchable, sortable, filters, relations, slug source, inputs, sidebar order.
- **SQL dialects:** SQLite, PostgreSQL and MySQL.

## Spike 11: ORM (in progress)
_(owner: ORM agent; add: Model base API, query builder signatures, how it reads the generated types, factory/seeder API)_

### Spike 11 interfaces (ORM agent, 2026-11-14)

Code: `spikes/11-orm-prototype/` (runs on real MySQL 8.4, PGlite and SQLite). Design: `docs/research/2026-11-14-strutvane-orm-design.md`. Build-vs-reuse: **own** query builder and grammars (no Drizzle, no Kysely at runtime).

**Model** (`app/models/post.ts`; options that change *types* go in the `Model()` call, behaviour goes in the class body):
```ts
export class Post extends Model('posts', { fillable: ['title', 'body', 'status'], hidden: [], casts: { meta: json<PostMeta>() } }) {
  static scopes = { published: (q) => q.where('status', 'published') } satisfies Scopes<'posts'>   // → Post.query().published()
  static globalScopes = { … } satisfies Scopes<'posts'>                                             // → withoutGlobalScope('name')
  author() { return this.belongsTo(User, 'author_id') }      // hasMany(Model, fk), belongsToMany(Model, 'pivot', fpk, rpk)
  get isPublished() { return this.status === 'published' }  // accessor; mutators = cast({ get, set })
}
```
- Statics: `query() find(id) findOrFail(id) all() create(input) forceCreate(input) make() with(...) where(col, v) withTrashed() onlyTrashed()`.
- Instance: `fill(input) forceFill(input) setAttribute(col, v) save() delete() forceDelete() restore() refresh() load(...paths) toJSON() getDirty() isDirty(col?) trashed() isPersisted()`.
- Columns are snake_case, exactly as in the migration (`created_at`, not `createdAt`). Loaded relations replace the method: `post.author` is a method until `with('author')`, then `User | null`.

**Generated inputs the ORM reads:**
- Types: the `TableRegistry` augmentation, one entry per table: `{ row, insert, update, json }` (spike 10's shape). The ORM uses `row` (attribute types) and `insert` (create/fill input types). The module to augment is the ORM's registry module (`@strutvane/framework` in the product).
- Runtime: `registerSchema(snapshot)` with the replayed `TableState` per table (`{ name, columns: ColumnDef[], indexes, global? }`), called at boot from generated code. It is needed for casts (booleans on MySQL/SQLite, JSON, dates), timestamps, soft deletes, slugs, the tenant classification and column validation. See Requests.

**Query builder** (`Builder<TClass, TResult>`; mutable, `clone()` to branch; every column checked against the snapshot, every value bound):
- typed: `where(col, v) | where(col, op, v) | where(q => …)`, `orWhere`, `whereIn`, `whereNotIn`, `whereNull`, `whereNotNull`, `whereRaw(sql\`…\`)`, `whereHas(rel, q => …)`, `orderBy(col, dir)`, `latest(col?)`, `limit`, `offset`, `with(...paths | { rel: q => … })`, `withCount(...rels)`, `withTrashed`, `onlyTrashed`, `withoutGlobalScope(name)`, `unsafeWithoutTenancy(reason)`;
- terminals: `get() first() firstOrFail() find(id) findOrFail(id) count() exists() paginate(perPage?, page?) → { data, total, perPage, currentPage, lastPage }`, `cursorPaginate(perPage?, cursor?) → { data, perPage, nextCursor }`, `toSql() → { sql, params }`;
- operators: `= != <> < <= > >=` only. `!=`/`whereNotIn` are NULL-safe (NULL rows match).

**ResourceController surface** (request strings; each name is validated against the snapshot, unknown → `OrmUsageError` code `UNKNOWN_COLUMN` = 400; the controller must ALSO check `resources.json` allow-lists, since existing ≠ allowed):
```ts
index:   Model.query().search(term, searchableCols).filter(col, op, value)….sort('-created_at,title').paginate(perPage, page)   // op: eq ne gt gte lt lte in contains startsWith null
show:    Model.query().with(...includes).findOrFail(id)        // 404 for other tenants / trashed
store:   await Model.create(validatedBody)                     // fillable only; unknown/guarded keys → MassAssignmentError (422)
update:  await (await Model.findOrFail(id)).fill(body).save()
destroy: await (await Model.findOrFail(id)).delete()           // soft when the table has deleted_at
```
Error codes to map: `MODEL_NOT_FOUND` 404, `MASS_ASSIGNMENT` / `INVALID_VALUE` 422, `UNKNOWN_COLUMN` / `INVALID_FILTER` / `INVALID_CURSOR` / `INVALID_PAGE_SIZE` 400, `TENANT_REQUIRED` 403, `TENANT_SCOPE_MISSING` 500 (a bug; log it).

**Tenant-scope hook** (rules from the security review F-04/F-05/F-08/F-10/F-14):
- One canonical tenant column per app: `configureOrm({ tenancy: { column: 'tenant_id' } | false })` (`team_id` for teams). The active tenant is AsyncLocalStorage: `runWithTenant(uuid, fn)`; the HTTP layer wraps each request.
- Every table is `scoped` (has the column), `global` (snapshot flag `global: true`) or `unscopable` → refused (fail closed).
- One choke point: before rendering, every tenant table in FROM/JOIN/subquery/EXISTS/UPDATE/DELETE/INSERT must carry `<alias>.<tenant col> = <active tenant>` as a top-level AND, or `TenantScopeMissingError`. Raw SQL naming a tenant table inside a tenant context is refused unless wrapped in `unsafeRaw(reason, sql)`. Bypasses (`unsafeWithoutTenancy(reason)`, `unsafeRaw`) need a reason and call `configureOrm({ onUnsafeTenancy })` for the audit log.
- Writes: the tenant column is never fillable, is stamped from the context, can't change on save; updates/deletes are `WHERE id = ? AND tenant = ?`. Pivot `attach/sync` verify ids with a scoped query in the same transaction.
- On PostgreSQL every tenant statement runs in a transaction with `set_config('app.tenant_id', $1, true)` so RLS (ADR-0007) is the second layer.
- Schema rules the ORM relies on (spike 10 / recorder): composite FKs `(tenant, x) → parent(tenant, id)` + `UNIQUE(tenant, id)` on parents; tenant-prefixed unique keys; MySQL binary collation (`utf8mb4_0900_bin`) on identifier-like columns (email, slug, uuid, enum, tokens).
- Mass assignment: `create()`/`fill()` accept only an explicit `fillable` list (no fillable = compile error + runtime refusal); sensitive-looking names (`is_*`, `*_at`, `*_by`, `role`, `plan`, `user_id`, `owner_id`) need `allowSensitive` too. Typed binds: `'1abc'` for an integer, `0` for an email, objects/arrays are `CastError` before any SQL.
- MySQL sessions are pinned on connect: strict `sql_mode` (+`NO_BACKSLASH_ESCAPES`), `time_zone '+00:00'`, utf8mb4; statements are server-side prepared (`execute`).
- Slug collisions get a random 4-char suffix (`launch-k3f9`), looked up within the tenant: no counters that reveal hidden rows.

**Factories and seeders** (designed, not in the prototype):
```ts
// database/factories/post-factory.ts
export default defineFactory(Post, ({ faker, sequence }) => ({ title: faker.sentence(), status: 'draft' }))   // keys typed by ForceCreateInput
await Post.factory().count(10).for(user, 'author').state({ status: 'published' }).create()   // .make() = unsaved; .has(Tag.factory().count(2), 'tags')
// database/seeders/post-seeder.ts
export default defineSeeder({ after: ['users'], async run() { await Post.factory().count(20).create() } })
```
Factories write through `forceCreate` (trusted code), inside `runWithTenant` when the model is scoped; `definition()` defaults are derived from column kinds with a deterministic seed.

**Answers to the Beyond-Laravel requests to Spike 11:**
- unloaded relations: done. Before `with()`, `post.author` is the relation method, so `post.author.email` is a compile error; after `with('author')` it is `User | null`.
- `create`/`fill`: accept only the explicit `fillable` (typed from `New`), with the sensitive-name guard (`allowSensitive`); `tenant_id` and timestamps are never fillable.
- hide defaults: stay explicit `hidden` per model (to be written by make:model from spike 10's secret/hidden markers).
- N+1: list members refuse `load()` (`preventLazyLoading`). The "same query shape > 5 times per request" detector is designed, not built.
- factory defaults from column kinds with a deterministic seed: designed (above), not built.

## Spike 12: MVC app core (in progress)
_(owner: MVC agent; add: bootstrap/app.ts API, Route API, ResourceController contract, the `node strut` command registry API, how packages register commands/providers)_

### Spike 12 interfaces (MVC agent, 2026-11-14)

Code and findings: `spikes/12-mvc-app-core/` (README; 115 tests; example app in `fixtures/example-app`). Imports below are `#strutvane/<x>` in the spike and `@strutvane/framework/<x>` in the product.

**`bootstrap/app.ts`:**
```ts
export function createApp(env?: EnvSource) {
  return Application.configure({ basePath: dirname(import.meta.dirname), ...(env ? { env } : {}) })
    .withConfig(config)                 // config/index.ts exports { app, database, … } built with defineConfig((env) => …)
    .withProviders(providers)           // bootstrap/providers.ts: ProviderClass[]; installers append one line
    .withRouting({ web, api, apiPrefix: '/api', health: '/up', bindings: { post: Post } })
    .withMiddleware((m) => { m.alias({ admin: EnsureAdmin }); m.appendToGroup('api', '…'); m.rateLimiter('api', { maxAttempts: 60, decaySeconds: 60 }) })
    .withExceptions((e) => { e.dontReport(X); e.render(X, (err, ctx) => …); e.shouldRenderJsonWhen((ctx) => …) })
    .withCommands([...])
    .create()                           // no I/O; boot() is lazy (first request or command)
}
export default createApp()
declare module '#strutvane/registry' {   // the ONLY typing hook: no codegen
  interface RouteRegistry extends RoutesOf<[typeof web, typeof api]> {}
  interface ConfigRegistry extends ConfigOf<typeof config> {}
  interface UserRegistry { user: User }
}
```
- `app.handle(request, { ip })` is the fetch handler (Hono inside). `app.run(fn)` sets the current app for the helpers (`route()`, `config()`, `now()`, `app()`, models), carried by AsyncLocalStorage.
- Container: `token<T>(name)` keys (branded `kind: 'token'`) and `bind`, `singleton`, `instance`, `make`. Classes declare `static readonly inject = [Token, …] as const`, checked against the constructor at compile time. Core tokens: `ClockToken`, `LoggerToken`, `ConfigToken`, `ConnectionToken`, `MetadataToken`, `UserProviderToken`, `RateLimitStoreToken`. A default is bound only when the app or test hasn't bound one first.

**Routes** (`routes/web.ts`, `routes/api.ts`; values, no global registry):
```ts
export default defineRoutes([
  Route.get('/posts/{post:slug}', [PostController, 'show']).name('posts.page').middleware('auth:optional'),
  Route.resource('photos', PhotoController, { only, except, parameter: 'person', bindBy: 'slug' }),  // 7 actions, Laravel names and order
  Route.apiResource('posts', PostController).middlewareFor(['store', 'update', 'destroy'], 'auth'),   // 5 actions
  Route.group({ prefix: 'admin', name: 'admin.', middleware: ['auth', 'admin'] }, [ … ]),
])
```
- **Binding:** `withRouting({ bindings: { post: Post } })`. `{post}` uses `Post.routeKeyName` (default `id`); `{post:slug}` uses the named column. A missing record is a 404 problem. Integer keys refuse non-digits before any SQL.
- **Typed:** `route('posts.show', { post })` (a model gives its route key or the bound field; extra params become the query string), `ctx.model(Post)`, `ctx.user`, `config('app.debug')`.
- **Middleware aliases:** `auth`, `auth:optional`, `throttle:60,1` / `throttle:<name>`, `csrf`.
  - Groups: `web` = [csrf]; `api` = [csrf, throttle:api].
  - Priority is always csrf → auth → throttle.
- **Boot fails** (so `node strut route:list` and the tests fail too) on:
  - an unknown alias (with "did you mean");
  - `{x:field}` without a binding;
  - a resource route whose controller has no `policy`;
  - a ResourceController on an internal table;
  - a missing action;
  - a duplicate route name or endpoint;
  - any bad env var (all are listed at once).

**Controllers:** an action is `(ctx: HttpContext) => Response | Promise<Response>`, with an explicit return type. `ResourceController<typeof Post>` gives index, show, store, update and destroy. Set `model` and `policy`; `storeRequest`, `updateRequest`, `indexConstraints(ctx)` and `prepareForStore`/`prepareForUpdate` are optional.
- **List query:** spike 10's format, `?page&perPage(≤100)&search&sort=-a,b&filter[f]=v&filter[f][op]=v`, returning `{ data, meta: { page, perPage, total, lastPage, from, to } }`. Spike 14: call exactly this.
- **show/update/destroy** go through `visible(ctx)`. If the user can't `view` the record → **404** (the same as missing). If they can view it but not change it → 403.
- **store** returns 201 + `Location`. Unique columns are checked first (422 `taken`); a unique race returns 409.
- **Errors:** RFC 9457 `application/problem+json`: `{ type, title, status, code, detail, issues?: [{ field, code, message }], hint? }`. `hint` is sent only when APP_DEBUG is on and APP_ENV is local or testing.
- **ORM contract (spike 11):**
  - statics: `Model.metadata()`, `Model.paginate(listRequest, constraints)`, `Model.createFromValidated(values)`, `Model.resolveRouteBinding(value, field?)`, `Model.isTaken(col, value, exceptKey?)`, `static fillable`, `static routeKeyName`;
  - instance: `record.updateFromValidated(values)`, `record.delete()`.
  
  The mapping to spike 11's API is in the spike 12 README. The ORM error codes map to 404/422/400/403.

**Form requests:** `class StorePostRequest extends FormRequest<Out> { rules(ctx) { return zodSchema } authorize?(ctx) prepareForValidation?(input, ctx) }`, with any Standard Schema library.
- **Unknown fields → 422 `unknown_field`.**
- Default rules come from `resources.json`, narrowed by `static fillable`.
- Without a `fillable` list, these are never writable: `*_at`, `is_*`, hidden columns, and foreign keys to owner tables.

**Policies:** `class PostPolicy implements Policy<Post> { before?(user, ability) viewAny? view? create? update? delete? }`.
- A missing method denies.
- `authorize(policy, ability, ctx.user, record, 'post')` throws a 403.
- `hasAdminRole(user)` checks for an admin.

**`node strut`** (`strut.js` in the app root: `process.exitCode = await runConsole(app, process.argv.slice(2))`):
- **Commands are data:** `defineCommand({ name: 'ns:cmd', description, arguments: [{ name, description, required }], options: { force: { type: 'boolean', short: 'f', description } }, help: [...], needsBoot?: false, run({ app, args, options, output, now }) })`. Options are typed from the declaration.
- **Core commands here:**
  - `about`, `route:list` and `model:show`, each with `--json`;
  - `make:controller [--resource|--api|--model=X|--force]`;
  - `make:migration <name> [--seeder] [--factory]`: spike 10's stub; `create_*` always writes the model, with `fillable = []`;
  - `serve`, on 127.0.0.1 by default.
- **Help and errors:**
  - `list`, `help <cmd>` and `<cmd> --help`;
  - did-you-mean for commands and options;
  - a `StrutvaneError` prints the message and the hint, then exits 1.
- **Reserved names:** `up`/`down` mean maintenance mode (Laravel); Docker uses `services:up`/`services:down`.

**Packages register through their provider.** The installer adds it to `bootstrap/providers.ts`; nothing is discovered from node_modules.
```ts
class BillingProvider extends ServiceProvider {
  override register(app) {                     // bind + routes + commands
    app.container.singleton(BillingToken, () => new Billing())
    app.addRoutes(billingRoutes, { prefix: '/api/billing', group: 'api' })   // before boot only
    app.addCommand(billingSyncCommand)
  }
  override boot(app) { app.navigation.add({ label: 'Billing', route: 'billing.plans', group: 'Account', icon, order }) }
}
```
`app.navigation.items` is the sidebar registry. Spike 14 reads it and hides entries the user can't `viewAny`.

**Security rules implemented and tested** (review F-01/02/07/10/11/14/22/23/26):
- **Internal tables never get a ResourceController.** A table is internal if it has the `internal: true` flag or is on the list: users, sessions, cache*, jobs, failed_jobs, password_reset_tokens, personal_access_tokens, passkeys, roles, permissions, user_roles, team_*, audit_events, migrations, seeders.
- **Generated policies** deny everyone but admins.
- **Generated owned controllers** call `authorize()` in every action. A test shows 403 everywhere until the policy is edited.
- **CSRF** applies to every unsafe cookie-authenticated request, `/api` included. A failure is 419 `csrf_token_mismatch`.
  - Passes: `Sec-Fetch-Site: same-origin`; an `Origin` exactly equal to APP_URL's; or a session-bound HMAC token in `X-CSRF-TOKEN`/`X-XSRF-TOKEN`.
  - Never passes on `same-site` or `Origin: null`.
  - Bearer requests skip the check; Basic auth doesn't.
- **Slugs** get random suffixes.
- **Rate limits** bucket IPv6 by /64.
- **The debug page** appears only in local/testing; it is redacted and its script is CSP-nonced.
- **Export and bulk endpoints** don't exist yet. When added, they are off by default per resource.

**Testing kit (`#strutvane/testing`):**
- `refreshDatabase(app)` loads `.strutvane/sql/schema.<engine>.sql`.
- `client(app).actingAs(token).withHeaders(h)` sends with `getJson`, `postJson`, `patchJson`, `putJson`, `deleteJson` and `get`.
- `TestResponse` offers `assertStatus`, `assertJsonPath`, `assertProblem` and `path`.
- Not yet: a transaction per test, a per-worker DB, `asTenant`, `Mail.fake`.

**Not built (next):**
- OpenAPI and `.strutvane/client.gen.ts`, from the compiled route table plus resources.json;
- `migrate` and `db:seed`;
- `runWithTenant` around each request once tenancy is on;
- maintenance mode.

## Spike 13: installer v2 (in progress)
_(owner: installer agent; add: the prompt list, the generated file tree, the setup step contract, how it calls `node strut migrate --seed`)_

### Spike 13 interfaces (installer agent, 2026-11-14)

Code, findings and the PowerShell first-run transcript: `spikes/13-installer-v2/README.md` (106 tests, including real npm/git/SQLite and real Docker runs for SQLite, MySQL 8.4 and PostgreSQL 18).

**Prompts** (in order; each has a flag; `--yes`, `CI` or no TTY means defaults; labels are 74 characters or fewer):
1. name (`[folder]`/`--name`);
2. stack `--stack full|api`;
3. React UI `--ui admin|blank` (full stack only);
3b. design `--design crisp|vivid` (full stack only; default **crisp**; added 2026-11-15, see below);
4. sign-in `--auth email|none`;
5. features `--features registration,verification,2fa|none` (default **none**: registration off, F-02);
6. teams `--teams` (sign-in only);
7. database `--db mysql|postgres|sqlite` (default **mysql**; **postgres pre-selected with teams**; a note on MySQL/SQLite: "isolated by the ORM tenant scope, PostgreSQL adds RLS");
8. **"Set up with Docker or without Docker?"** `--docker|--no-docker` (Docker pre-selected for MySQL/PostgreSQL; allowed for SQLite);
9. without Docker and a server DB: `--db-host/--db-port/--db-name/--db-user`, then the password (masked; `STRUT_DB_PASSWORD` in CI; written to `.env` only);
10. tests `--testing vitest|vitest-playwright|none`;
11. git `--git|--no-git`;
12. review: Create / Change an answer / Cancel;
13. after setup: "Start the development server now?" (`--dev|--no-dev`).

Exit codes: 0 ready, 1 nothing created, 2 created but setup unfinished (`npm run setup`), 130 cancelled. npm-swallowed flags (`npm_config_*`) stop with the corrected `npm create strutvane@latest x -- …` command.

**Generated tree** (MVC layout from the fixed decisions; `*` = git-ignored):
```text
package.json  package-lock.json (shipped)  .npmrc (ignore-scripts=true)  strut.js  .env*  .env.example  .gitignore  README.md  AGENTS.md
app/http/controllers/health-controller.ts  app/models/user.ts  app/policies/user-policy.ts
bootstrap/app.ts  routes/web.ts  routes/api.ts  config/{app,database,auth?,tenancy?}.ts
database/migrations/0001_01_01_00000{0..3}_create_{users,sessions,cache,teams}_table.ts  database/seeders/database-seeder.ts  database/factories/user-factory.ts
resources/ui/{index.html,main.tsx}  tests/feature/health.test.ts
docker/compose.yaml* + docker/initdb/*   (Docker mode only)
.strutvane/setup.json*  .strutvane/env.json*  .strutvane/logs/*   database/*.sqlite*   node_modules*
```
Scripts: `dev: node strut dev`, `build: node strut build`, `start: node build/server.js`, `test: node strut test`, `setup: node strut setup`, `strut: node strut`. `engines.node >=24.3`. Dependencies are pinned exactly (`mysql2` or `pg` by database). `package.json` `"strutvane": { "rebuild": [] }` is the install-script allowlist.

**Setup step contract** (`.strutvane/setup.json` = `{ version: 1, resumeWith: [node, cli, '--resume'], options (no secrets), steps: { files|secrets|ports|database|install|migrate|git: { status: pending|done|failed|skipped, at, note } } }`, saved after every step):
- A step = `{ id, title, needs(options) → StepId[], applies(options), run(ctx) → done{message, showOnce?} | skipped{reason} | failed{kind, message, hint, details} }`.
- `done` steps never run again. Steps whose needs are not done wait. Resume re-checks secrets rather than trusting `done`.
- Failure kinds decide the choices: `docker-missing` → Continue without Docker (SQLite)/Skip/Stop; `docker-stopped` → Retry/SQLite/Skip/Stop; anything else → Retry/Skip/Stop. In CI the run stops at the first failure.
- What each step does:
  - **install:** `npm ci --ignore-scripts`, then `npm rebuild <allowlist> --ignore-scripts=false`;
  - **database:** Docker mode runs `docker compose -p <name> --env-file .env -f docker/compose.yaml up -d --wait`; otherwise it creates the SQLite file, or runs a TCP check on the user's own server;
  - **git:** it commits only after `git check-ignore` proves `.env*`, `.strutvane/`, `docker/`, `*.sqlite*` and `storage/` are ignored and none of them is staged.

**How setup calls `node strut migrate --seed`:**
- Without Docker: `<node> strut.js migrate --seed`, run in the project folder, with no shell.
- Docker mode: `docker compose -p <name> --env-file .env -f docker/compose.yaml exec -T -e STRUT_SEED_ADMIN_PASSWORD app node strut migrate --seed`.
- The one-time admin password travels only in `STRUT_SEED_ADMIN_PASSWORD` (environment). It is never in argv or `.env`, and it is redacted from the log.
- The seeder calls `createAdminOnce({ name, email: SEED_ADMIN_EMAIL })`, which hashes the password and sets `must_change_password`. It prints `Admin created: <email>` (the installer then shows the password once, interactively) or `Admin exists: <email>`.
- Seeding refuses `APP_ENV=production|staging`.
- Exit codes: `0` = done, `3` = database unreachable (the installer offers Retry/Skip), anything else = failed.
- PostgreSQL migrations connect as `DB_MIGRATION_USERNAME` (the owner role); everything else connects as `DB_USERNAME` (the app role).

**Docker-mode contract** (Sail-like; local-only and git-ignored, ADR-0006):
- **Services** in `docker/compose.yaml`, all under `-p $COMPOSE_PROJECT_NAME`:
  - `app`: `node:24`; `working_dir /app`; `user ${STRUT_UID:-1000}:${STRUT_GID:-1000}` (the host uid on Linux); `init: true`; `command: sleep infinity`; `env_file: ../.env`; `environment: STRUTVANE_IN_CONTAINER=1, APP_HOST=0.0.0.0, HOME=/tmp, npm_config_cache=/tmp/.npm, CHOKIDAR_USEPOLLING=1, STRUT_WATCH_POLLING=1`; ports `127.0.0.1:${APP_PORT}:${APP_PORT}`; `depends_on db: service_healthy`;
  - `db`: `mysql:8.4` or `postgres:18-alpine`, absent for SQLite; `127.0.0.1:${FORWARD_DB_PORT}`; a TCP health check; `initdb/` creates `<db>_test`, and for PostgreSQL also an `<id>_owner` role and an `<id>_app` role (NOSUPERUSER, NOBYPASSRLS);
  - `mailpit`: `axllent/mailpit:v1.33`; only the inbox is published, at `127.0.0.1:${FORWARD_MAILPIT_PORT:-8025}` (SMTP 1025 stays internal).
- **Volumes:**
  - `..:/app` (bind);
  - `node-modules:/app/node_modules` (named; the installer runs `chown <uid>:<gid> /app/node_modules` as root once, because a fresh volume is root-owned);
  - `db-data`.
  No image is built and no secret is baked in.
- **`.env` in Docker mode:** `DB_HOST=db`, `DB_PORT=<container port>`, `FORWARD_DB_PORT`, `MAIL_HOST=mailpit`, `MAIL_PORT=1025`, `FORWARD_MAILPIT_PORT`, `COMPOSE_PROJECT_NAME`, `STRUT_UID/GID`.
- **Forwarding (strut.js runs this before importing anything from the app):**
  - Read `.strutvane/env.json` `{ mode: 'docker'|'host', composeFile, service: 'app' }`.
  - If `mode === 'docker'` and `STRUTVANE_IN_CONTAINER !== '1'`:
    - `setup` runs on the host (it resumes the installer, which starts the containers itself);
    - `services:up|down [--volumes]|status` run `compose up -d --wait` / `down [-v]` / `ps` on the host;
    - every other command checks `compose ps --status running --services` for `app` (if it is missing: "The app container is not running. Start it with: node strut services:up", exit 1), then runs `compose exec [-T when not a TTY] app node strut <argv…>` with stdio inherited and its exit code passed through.
  - Inside the container, or in host mode, the command runs locally. In host mode `services:*` explains that there is no Docker.
  - Docker is resolved through absolute PATH entries only.
- **Dev server:** listens on `APP_HOST` (`127.0.0.1` on the host, `0.0.0.0` in the container). A Host allowlist (`localhost`, `127.0.0.1`, `[::1]`, APP_URL's host) answers everything else with 403. So `npm run dev` is the same command in both modes.

**Prompt 3b: design (installer agent, 2026-11-15).** "Which design for the React UI? (switch any time later)", asked right after the React UI question, full stack only. Choices come from one data list, `DESIGNS = [{ value, packageName, label }]` in `src/options.ts` (first entry = default), so a future design is one new entry: `crisp` → `@strutvane/design-crisp` "Crisp   Clean, minimal and business-first (recommended)" (default); `vivid` → `@strutvane/design-vivid` "Vivid   Colourful, modern dashboards". Flag `--design crisp|vivid`; unknown values list the valid ones; `--design` with `--stack api` is refused like `--ui`. The review shows `Design  crisp (@strutvane/design-crisp)` and "Change an answer" can revisit it. Generated: the design package in `package.json` dependencies (a `file:` stub pinned like `@strutvane/framework` in the spike), `config/ui.ts` (`export default { design: 'crisp' }` with a comment: switch with `node strut design:use vivid`, overrides go in theme.css), `resources/ui/theme.css` (owned, all overrides commented: `--brand-hue`, `--font-sans`, `--radius`, plus a `.dark` example), a README "Design" section, and "Design" + "Restyle" lines in the Ready box. Stored in `setup.json` options so a resume keeps it.

**Full question list (installer agent, 2026-11-15; blueprint §2.1 rows 1–36, ADR-0021).** The prompt list above is superseded by one data-driven registry, `spikes/13-installer-v2/src/question-registry.ts` (one array: id, group, title, choices + the packages they bring, default, flag, `when`, ★). Opener after the name: Recommended (7 ★: stack, design, sign-in, teams, database, Docker, AI assistants) or Custom (~35, grouped); `--mode`. Order follows the blueprint, so **design (row 3) now comes before the UI starter (row 4)**. Every question has a flag (`--yes`/CI/no TTY = defaults); secrets only via `STRUT_DB_PASSWORD` / `STRUT_ADMIN_PASSWORD`. Sign-in features moved from `--features` to `--security` (default 2fa,verification; registration off); `--features` is now question 22 (catalogue ids, default log-viewer) with `--feature-option <id>.<q>=<v>` for declarative follow-ups; the catalogue fixture is `src/data/catalogue.json` (published + `frameworkRange` filter, popular grouped, search for the rest). Answers (never secrets) go to the generated `strutvane.json`; packages become `package.json` deps. `--deploy docker` writes a committed secure `Dockerfile` + `.dockerignore`, `--dev-container` a committed `.devcontainer/` (ADR-0021); `docker/compose.yaml` stays git-ignored (ADR-0006). Docker mode: `node strut shell|npm|npx|node <args>` pass-throughs, arguments verbatim, exit codes passed through.

## Spike 14: auto CRUD UI (in progress)
_(owner: UI agent; add: ui.gen.ts and <resource>.ui.ts formats, how the sidebar is built, which API endpoints and params it calls)_

### Spike 14 interfaces (UI agent, 2026-11-14)

Code: `spikes/14-auto-crud-ui/` (React 19 + Vite + Tailwind 4 + TanStack Router/Query/Table, owned shadcn-style components; 101 tests, axe 0 violations on 9 screens). Design: `docs/research/2026-11-14-auto-admin-ui-design.md`.

**`ui:sync`** (`node strut ui:sync`; `migrate` should call it through the `schema.migrated` hook) reads `.strutvane/resources.json` (spike 10's format) and writes:

| File | Owner | When | Content |
|---|---|---|---|
| `.strutvane/ui.gen.ts` | machine | every sync | the `UiRegistry` augmentation (field names per resource, secrets excluded), `metadata` (internal tables removed), static imports of owned files |
| `.strutvane/ui.lock.json` | machine, committed | every sync | `{ version: 1, resources: { posts: ['id', 'title', …] } }`, so the next sync knows which columns are new |
| `resources/ui/<route>.ui.ts` | developer | **once**, for a new table only (create-once `wx` write; never overwritten, never recreated) | see below |

```ts
// resources/ui/posts.ui.ts
import { auto, defineResourceUi } from '#strutvane/ui'          // product: '@strutvane/ui/define'
export default defineResourceUi('posts', {
  columns: auto(),                                               // follows the schema: new columns appear
  form: auto({ except: ['meta'], order: ['title', 'status'] }),  // options form, NOT auto().except(): chaining loses type checks
  filters: ['title', 'status'],                                  // explicit list: never rewritten; ui:sync REPORTS new columns
  navigation: { icon: 'file-text', group: 'Content', sort: 1, hidden: false },  // icon: a closed Lucide-name union
  label: { singular: 'Article', plural: 'Articles' }, pageSize: 25, defaultSort: '-created_at',
  actions: { export: false, bulk: false },                       // opt-in only (security review F-15)
})
```
- Every field name is type-checked against `UiRegistry`: a migration that drops a column the file names gives `TS2322` after `ui:sync`.
- `ui:sync` reads owned files **statically** (oxc, never executed). Non-literal settings are reported with `file:line` and skipped, never guessed.
- **The report** after migrate lists:
  - new screens;
  - new columns shown automatically;
  - new columns NOT shown, because a list is explicit;
  - names that no longer exist;
  - orphaned or deleted owned files;
  - skipped internal tables.

**Sidebar:** `buildNavigation(resources, canSee, pages)`.
- **Entries:** one per resource that is not `navigation.hidden` and that the user may `viewAny`, plus package pages.
- **Order:** ungrouped entries first, then groups A to Z. Inside a group: `sort` ascending (unset sorts last), then label A to Z. A new table never reshuffles the menu.
- **Package entries** (logs viewer, settings): `{ name, label, path, icon, group?, sort?, permission }` from spike 12's `app.navigation.items`. Each is shown only when `canSee(permission)`.
- **Never shown:** internal tables (`internal: true` or the F-01 name list) are dropped before generation and again at runtime. Secret or hidden columns (`secret: true`, `hidden`, or the logs pipeline's sensitive-key matcher) never appear in columns, forms, filters, sort, search or typed names.

**API calls** (exactly spike 10's contract, which spike 12's ResourceController adopts; the mock is byte-identical to spike 10 over 47 requests):
- `GET /api/:route?page&perPage(10|25|50|100)&search&sort=-a&filter[f][op]=v` → `{ data, meta: { page, perPage, total, lastPage, from, to } }`.
  - `in` values are comma-joined (`filter[status][in]=draft,published`).
  - Ops used: `eq` (boolean, relation), `in` (enum), `gte`/`lte` (number, date; timestamps as UTC ISO of the user's local day), and `contains`/`startsWith`/`eq` (text).
- The same list call also serves:
  - relation selects (`search` + `perPage=20`);
  - relation titles (`filter[id][in]=1,2,3`, one call per relation column per page);
  - hasMany tabs (`filter[<fk>][eq]=<id>`);
  - global search (Ctrl/Cmd+K: `search` + `perPage=5` per listable resource, in parallel).
- `GET /api/:route/:id`, and `GET /api/:route/by-slug/:slug` when the resource has a slug. UI URLs are `/posts/my-first-post`, or `/tags/7` without a slug.
- `POST /api/:route` (201), `PATCH /api/:route/:id` (only changed fields), `DELETE /api/:route/:id` (204).
- Errors are read as problem+json. `issues[].field` decides which form field shows the message, and focus goes to the first one. On create, an untouched slug is not sent, so the server de-duplicates it.
- **Extensions the UI uses that spike 10 doesn't have yet** (the mock has them):
  - `filter[trashed]=with|only`;
  - `POST /api/:route/:id/restore`.
- The UI assumes nothing about the engine: search case rules, collation and NULL order stay server-side (MySQL default).

**UI design standard** (2026-11-14): `spikes/14-auto-crud-ui/DESIGN.md` applies to `@strutvane/ui` and every package that adds screens. It is an original design in the premium-admin style: a vertical menu (260/76 px), a floating sticky 62 px navbar, cards with soft shadows, light and dark.
- **Tokens:** OKLCH CSS variables in `src/app/styles.css`, with **one accent knob** (`--brand-hue`).
- **Assets:** Tabler Icons (MIT), Public Sans (OFL), Recharts (MIT).
- **Rules for packages (enforced by tests):**
  - no literal colours in components (`test/shared/design-tokens.test.ts`);
  - WCAG AA per token pair for any accent hue (`test/shared/contrast.test.ts`);
  - axe with 0 violations on every screen.
- **Packages extend through data only:**
  - **Menu entries:** `{ name, label, path, icon, group?, sort?, badge?, permission }`.
  - **Navbar:** notifications and account-menu items.
  - **Dashboard widgets:** a planned registry.
  - **Themes:** by overriding tokens.

  Never their own CSS colours or layout.

## Docs site and versioning (starting)
_(owner: docs agent and versioning agent)_

### Versioning (versioning agent, 2026-11-14; DRAFT pending ADR-0020 approval)

**Where it's written:**
- full design: `docs/research/2026-11-14-versioning-and-support-design.md`;
- `docs/adr/0020-versioning-branches-and-support-policy.md` (Proposed);
- page drafts for the docs agent: `docs/research/2026-11-14-release-notes-and-support-policy-page.md` and `docs/research/2026-11-14-upgrade-guide-template.md`.

**The rules:**
- **Numbers.** Before 1.0, `0.N.0` may break (changeset `minor`); `0.N.z` never breaks (changeset `patch`; fixes plus compatible features); `major` changesets are rejected. From 1.0: semver, one major a year (~Q1).
- **Support.** From 1.0: bug fixes 18 months, security fixes 24 months (Laravel). Before 1.0: the newest line gets everything; the previous line gets security fixes for 6 months after its successor ships.
- **Train.** Before 1.0, every published package is in one Changesets `fixed` group. From 1.0: framework, auth, ui, create-strutvane and strutvane; add-ons go independent.
- **Branches.**
  - `main` is the next line. `0.N.x` (later `N.x`) is created from tag `v0.N.0` at release.
  - Fixes go to the oldest supported line that has the bug, then the release tag is **merged up** (`scripts/merge-up.mjs`).
  - Tags: one train tag `vX.Y.Z`; add-ons after 1.0 use `<name>@<version>`.
- **npm dist-tags:** `latest` (current line), `latest-<line>` (older maintained lines, e.g. `latest-0.2`), `next` (previews from `main`).
- **`versions.json` on `main`** (also served at `strutvane.dev/versions.json`) is the one support table: `{ current, lines: [{ line, branch, distTag, node, released, bugFixesUntil, securityUntil, docs, status: active|security|eol }] }`.
- **Docs agent:**
  - build each maintained branch, plus `main`, separately at `/docs/<branch>/` (`/docs/0.2.x/`, `/docs/main/`); `/docs/` redirects to the current line;
  - EOL versions are frozen with a banner;
  - render the support table from `versions.json` in every version;
  - use relative or `{{version}}`-style links only.
- **Installer:** templates get `"@strutvane/framework": "^<create-strutvane's own version>"`; `npm create strutvane@0.2` builds a 0.2 app; `--allow-eol` is needed for EOL lines.
- **MVC (`strut`):**
  - `about` shows the version and support status;
  - `doctor` warns about EOL lines and deprecated keys;
  - the deprecation registry lives at `packages/framework/src/support/deprecations.ts`;
  - runtime warnings fire once per process with code `STRUTVANE_DEPRECATED_<NAME>`, controlled by `STRUTVANE_DEPRECATIONS=off|throw`.

### Docs site (docs agent, 2026-11-14; prototype in `spikes/15-versioned-docs-site/`)

- **Stack:** Starlight (Astro), **one build per branch**, merged into one static site for GitHub Pages (`https://vishwajit-vm.github.io/strutvane-docs/`, or a custom domain with `DOCS_SITE` + `DOCS_BASE=/`). Search is Pagefind, one index per version, so results stay in the version being read.
- **URLs:** `/docs/<branch>/<page>/` (`/docs/0.2.x/installation/`), `/docs/main/…` for next-line previews; `/docs/`, `/docs/latest/<page>/` and `/docs/<page>/` redirect to the current line (static redirect pages). Per version: `<page>.md` (Copy as Markdown), `llms.txt`, `llms-full.txt`. `/versions.json` is served at the site root.
- **Versions → branches:** `versions.json` (ADR-0020 format) decides which lines exist and their status (switcher labels, banners, the support table via `<SupportTable />`). `docs.sources.ts` maps each branch to its content: in `strutvane-docs`, branch `N.x` (and `main`) holds its pages in `content/` with its own `navigation.json` (our `documentation.md`); released lines are read with `git ls-tree`/`git show` from `origin/N.x` (no checkout). Each branch builds with `DOCS_VERSION=<branch> DOCS_MANIFEST=<manifest from main> astro build`. "Edit this page" → `strutvane-docs/edit/<branch>/content/<file>`; EOL lines have none.
- **Links between pages:** relative within a version; across versions only via `/docs/latest/…`.
- **Page slugs** are flat like Laravel's (`installation`, `first-crud`, `orm-relationships`), packages under `packages/<name>`.

## Requests
_(anyone: "to <section>: please …")_

### Beyond Laravel (product/DX review, 2026-11-14; details in `docs/research/2026-11-14-beyond-laravel.md`)
- to Spike 10: please emit a Zod schema per table (create/update) from the replay, add `migrate --pretend` and `--step`, a pre-flight lint (NOT NULL without default on non-empty table, drop-looks-like-rename, dropped column used in `resources/ui`), and per-operation progress so a failed MySQL migration reports exactly what was applied (DDL auto-commits there).
- to Spike 11: please make unloaded relations absent from the row type (`with('author')` → `Post & { author: User }`; `post.author()` stays a builder), add a dev N+1 detector (same query shape > 5 times per request), make `create/update` accept only `New`/`Patch` with name-based guard + hide defaults (`password`, `*_token`, `is_admin`, `role*`, `tenant_id`), and derive factory `definition()` from column types with a deterministic seed.
- to Spike 12: please add a testing kit (transaction per test, per-worker DB on the app's engine, `actingAs`, `asTenant`, HTTP assertions, `Mail.fake`), a typed route registry + `.strutvane/client.gen.ts`, OpenAPI from the same registry, `/up` health route, `model:show` (from resources.json), `--json` on inspect commands, and dev-only "why denied" details on 403 problems. Naming: `up`/`down` mean maintenance mode in Laravel; consider `services:up`/`services:down` for Docker.
- to Spike 13: please pre-select PostgreSQL when Teams = Yes (MySQL still allowed, with the note), create a `testing` database next to the dev one, write `AGENTS.md`, set `engines.node >=24.3`, print the equivalent `--yes` command at the end, and run the e2e flow on Windows/macOS/Linux in CI.
- to Spike 14: please use the generated client and Zod schemas for forms (live validation), keep owned pages thin (import package components so fixes arrive via `npm update`), add the first-run welcome checklist and the empty states, and run axe on every generated screen.
- to Docs: please give every problem `code` a page (`/docs/errors/<code>`), add `llms.txt`, "Copy as Markdown", a Laravel → Strutvane cheat sheet, `UPGRADE.md` per minor, and a written 0.x support policy.

### From Spike 11 (ORM agent, 2026-11-14)
- to Spike 10: please also emit `.strutvane/schema.json`: the replayed `TableState` per table (columns with kind, nullable, length, scale, enum values, `slugFrom`; **all** indexes including composite unique ones; and a `global: true` flag from `schema.create(name, fn, { global: true })`). The ORM needs composite unique indexes (slug scope) and the global flag, which `resources.json` doesn't carry. Please also add `t.tenant()`, composite tenant FKs + `UNIQUE(tenant, id)` for `foreignId().constrained()` between tenant tables, tenant-prefixed `unique()`, and `COLLATE utf8mb4_0900_bin` for slug/uuid/enum/email/token columns in MySQL DDL.
- to Spike 10: `resources.json` `fillable`/`hidden` should come from the model's `Model('x', { fillable, hidden })` (or the make:model template), not from heuristics; the ORM refuses writes to anything not in the model's explicit `fillable`.
- to Spike 12: wrap every request in `runWithTenant(tenantId, …)` once tenancy is on; map the ORM error codes listed in the Spike 11 section; never pass request strings to typed methods (`with`, `orderBy`): use `search/filter/sort` (runtime-validated) and check names against `resources.json` allow-lists first; `include=` must be validated against `resources.json` relations before `with()`.
- to Spike 13: the generated `config/database.ts` for MySQL should not need any session settings: the ORM's MySQL driver pins `sql_mode`, time zone and charset itself.
- to the blueprint (`18` §4): the example `orderBy('createdAt')` should be `orderBy('created_at')` (columns keep their migration names), and "the whole model can be one line" holds for reading; writing via `create()` needs `fillable` (F-10).

## Repository layout dry run (2026-11-14; details in `docs/research/2026-11-14-monorepo-dryrun.md`)
_(owner: repo-layout agent; dry run on scratch copies only, nothing committed)_
- **Repos (Laravel's org layout, `vishwajit-vm`):**
  - `strutvane-framework` → `@strutvane/framework`, ONE npm package that absorbs contracts, core, devkit and cli, with history;
  - `strutvane-skeleton` (app template);
  - `create-strutvane` (installer);
  - `strutvane-docs` (a branch per version);
  - `strutvane-auth`, `strutvane-ui`, `strutvane-log-viewer` (from logs), `strutvane-files` and later add-ons, each its own repo;
  - the hub `strutvane` stays the hub;
  - the `strutvane` launcher package is retired (the framework ships the `strutvane` bin; `node strut` is primary).
- **Framework tree:**
  - source: `src/{contracts,core,devkit,console}/` next to the existing `src/{http,database,model,query,openapi,storage,runtime,testing,…}`;
  - tests: `test/<part>/`;
  - exports: `.`, `./provider`, `./http`, `./database`, `./commands`, `./testing`, `./contracts`, `./core`, `./devkit`, `./console`;
  - bin: `strutvane` → `dist/console/bin.mjs`.
  - Verified: 1,286 tests pass (+14 skipped), the same as the five old suites.
- **How code references the framework:**
  - inside the framework, by relative `.ts` path only (`../core/index.ts`), never its own package name;
  - everywhere else, by subpath: `@strutvane/framework/core`, `/contracts`, `/http`, `/database`, `/testing`, …;
  - `@strutvane/core`, `@strutvane/contracts`, `@strutvane/devkit` and `@strutvane/cli` are retired names: do not use them in new code, templates or generated apps.
- **Dependency rules:**
  - add-ons and ui declare `@strutvane/framework` as a **peerDependency** (plus a devDependency for their own tests), so an app holds exactly one framework copy;
  - add-ons may import the framework; the framework never imports an add-on;
  - add-ons never import each other (use framework hooks, events and container tokens);
  - `create-strutvane` must NOT depend on the framework (keep `npm create` light);
  - inside the framework, keep a lint rule for module direction: `contracts` ← `core` ← everything else; `console` never imports `http`.
- **Build and test order** (npm runs workspace scripts in the LISTED order, not by dependency): framework → log-viewer → auth → files → ui → create-strutvane. Consumers import the framework's `dist`, so build the framework before testing dependents.
- **Local multi-repo dev:**
  - the hub is the umbrella: `scripts/setup-workspace.mjs` clones the repos into `packages/<name>` and writes an UNCOMMITTED root `package.json` whose `workspaces` lists them in the order above;
  - `npm install` at the hub root links siblings automatically when versions satisfy the declared ranges, so never add `file:` or `link:` specs;
  - check that every dependent resolves to `packages/framework` with `npm ls @strutvane/framework` (a range mismatch silently installs the registry copy instead).
- **CI per repo:** published versions only (`npm ci` from the committed lockfile). An optional, non-blocking job tests against `strutvane-framework@main` via `npm pack`. Releases go framework first: staged, then approved, then the dependents.
- **npm settings for every repo** (npm ≥ 11.19, pnpm parity):
  - `.npmrc`: `strict-allow-scripts=true`, `min-release-age=1`, `min-release-age-exclude[]=@strutvane/*`, `allow-git=none`, `engine-strict=true`;
  - approved install scripts live in `package.json` `allowScripts`, pinned (`npm approve-scripts esbuild`).
- **Constraints for other spikes:**
  - Spike 12/13: generated apps depend on `@strutvane/framework` only (no `@strutvane/core` or `@strutvane/cli`); the CLI's project detection must accept the framework dependency or `strut.js`.
  - Spike 12: the CLI package-migration gate must accept realpaths inside an npm workspace root (workspace links are junctions on Windows).
  - Spike 13: the installer should copy `strutvane-skeleton` rather than depend on framework internals.
  - Everyone: never put a test helper on `<package>/node_modules` (npm hoists); resolve tools with `createRequire` or walk up to the nearest `node_modules`.
  - Everyone: anchor `.gitignore` entries such as `/logs/` (a bare `logs/` hides `packages/logs`).

### From Spike 12 (MVC agent, 2026-11-14)
- to Spike 10: please add the `internal` flag to `resources.json` (from `schema.create(name, fn, { internal: true })`). Spike 12 already reads `resource.internal` and refuses ResourceControllers on internal tables. Small: the generated type comments say "a author".
- to Spike 11: the ResourceController contract (spike 12 section) needs `isTaken(col, value, exceptKey?)` (counting trashed rows, tenant-scoped) and `resolveRouteBinding(value, field?)`. Please also confirm whether `search` on MySQL columns with a binary collation is meant to become case-sensitive, or whether search should use a `_ci` collation.
- to framework packaging: Node refuses to type-strip files under `node_modules`, so `@strutvane/framework` must ship compiled JS. A cold `node strut route:list` takes 0.75–1.0 s today; the target is under 300 ms (lazy command imports).
- to Spike 14: the list endpoint's params and response shape are in the spike 12 section. Sidebar entries come from `app.navigation.items` plus the `sidebar` field in resources.json.

### From Spike 13 (installer agent, 2026-11-14)
- to Spike 12: the generated `strut.js` must run the Docker-mode forwarding prelude (Spike 13 section) **before** it imports `@strutvane/framework`, because in Docker mode the host has no `node_modules`. It must also handle `setup` and `services:*` itself, then do `process.exitCode = await runConsole(app, argv)`. Please also give `migrate --seed` exit code **3** for "database unreachable", read `STRUT_SEED_ADMIN_PASSWORD`, provide `createAdminOnce` (development only; `must_change_password`), add `user:password <email>`, and make `dev` listen on `APP_HOST` (default `127.0.0.1`) with the Host allowlist.
- to Spike 11: the installer pins the drivers `mysql2@3.24.6` and `pg@8.23.1` in the shipped lockfile (both published at least 3 days earlier). Tell me if the ORM needs different ones. The PostgreSQL app role is not the table owner, so DDL must run with the `DB_MIGRATION_*` credentials.
- to Spike 10: migrations run as the owner role on PostgreSQL, and default privileges give the app role SELECT/INSERT/UPDATE/DELETE plus sequence USAGE. A migration that needs other grants must say so.
- to Docs: `npm create strutvane@latest my-app -- --flags` (the `--` is required), the PowerShell `npm.cmd` / execution-policy note, "Docker mode = everything in containers; on Windows use WSL2", and the `STRUT_DB_PASSWORD` variable for CI.

### From Spike 14 (UI agent, 2026-11-14)
- to Spike 10: please emit in `resources.json`:
  - `internal: true` per table, and `secret: true` per column (from `.secret()`); the UI reads both already;
  - per-field Zod (or Standard Schema) create/update schemas, for live form validation.

  Please also reject the reserved slug words (`new`, `edit`, …; design doc §4.7): `/posts/new` is the create route, so a slug `new` can never be opened.
- to Spike 10 / Spike 12 (API): please add `filter[trashed]=with|only` and `POST /:route/:id/restore` on soft-delete resources. The UI's "Deleted records" filter and Restore action call exactly these; today spike 10 answers 422.
- to Spike 12: two details of the ResourceController contract:
  - **show by slug:** spike 10 serves `GET /api/:route/by-slug/:slug`, while spike 12's `bindBy: 'slug'` binds `GET /api/:route/:slug`. Please pick one and state it here. The UI switches in one function (`findByRouteKey` in `src/app/api/client.ts`).
  - **the unique-violation code:** spike 10 says `unique`, spike 12 says `taken`. The UI only shows `message`, so either works, but please make it one code.

  Please also keep the 422 hint "Filterable fields: …" free of fields the actor can't read (F-13): the mock already drops secret columns from it.
- to Spike 12: `app.navigation.items` entries need `{ name, label, path, icon (a Lucide name), group?, sort?, permission }`. The sidebar shows an entry only when the user has `permission` (deny by default). This is how packages add pages (the logs viewer, settings).
- to Spike 11: `paginate()` returns `{ data, total, perPage, currentPage, lastPage }`. The HTTP layer must map it to spike 10's `meta: { page, perPage, total, lastPage, from, to }`, which the UI reads.
- to Security: `users` is not on the UI's internal list. The blog uses it as the author relation, and spike 12 lists `users` as internal (F-01.3). If `users` gets no auto resource, relation selects for `author_id` need an owned "options" endpoint for users. Decide where it lives.

### From the coordinator (visual check of spike 14, 2026-11-14)
- to @strutvane/ui (real build): at 1440px the Posts table is wider than the content column, so the PAGE scrolls horizontally and content slides under the sidebar (light and dark). Wide tables must scroll inside their card (`overflow-x: auto` on the table wrapper, `min-width: 0` on the content column), never the page. Add a visual/regression test at 1280 and 1440 px.
- DECIDED (project lead, 2026-11-15): **two designs, both shipped as separate packages, chosen in the installer.** Crisp (`@strutvane/design-crisp`, from spike 19) is the DEFAULT; Vivid (`@strutvane/design-vivid`, from spike 17) is the alternative. `@strutvane/ui` = behaviour only (CRUD screens, tables, forms, conveniences, a11y); a design package = tokens (light/dark), fonts, shell (sidebar/top bar/auth layout), component skins, chart palette, illustrations, its own DESIGN.md. `defineDesign()` + `designConformance()` test kit (slots, AA contrast, no hard-coded colours, axe 0, no 375 px overflow). Installer: `--design crisp|vivid`; `node strut design:use <name>` / `design:eject`. Spike 18 (Glass) is shelved as a future design; the Classic/Glass/Soft theme-styles idea is retired. Spike 16 charts must take their palette from the design's chart tokens. Blueprint §5.1.
- DECIDED (coordinator, 2026-11-14): app file names use dot-suffixes: `database/seeders/post.seeder.ts`, `database/seeders/database.seeder.ts`, `database/factories/post.factory.ts`, `app/policies/post.policy.ts`; `make:migration … --seeder` and `make:seeder` REGISTER the seeder in database.seeder.ts automatically (parents first). Docs should drop "Coming in 0.2" for registration once the real CLI ships it.

### Package catalogue v2 (catalogue agent, 2026-11-14; details in `docs/research/2026-11-14-package-catalogue-v2.md`, master list in `docs/research/2026-11-14-package-checklist.md`)
47 packages (all 28 v1 entries kept, per the lead's decision, plus 19 new). Add-ons import only `@strutvane/framework` and may use `@strutvane/ui` as an OPTIONAL peer for a `/ui` subpath, through ui registries only. Extension points the framework and ui must expose:
- to framework (0.2 if possible, since phase-3 packages build on them): **F1 `ResourceService`**: transport-agnostic list/show/create/update/delete/restore/aggregate/options running the policy (+ row predicate), validation, fillable guard, tenant scope, ETag and audit. `ResourceController` becomes a thin adapter; graphql, mcp-server, import-export, charts and dashboards call it. **F2** typed public `ResourceMetadata` (column kind, enum values, relations, flags `internal`/`secret`/`hidden`/`personal`/`aggregatable`/`translatable`). **F3** `schema.migrating` (lint-rule registry) and `schema.migrated` (diff payload) hooks.
- to framework (0.3): **F7** `query().aggregate({ groupBy: { column, bucket: day|week|month|quarter|year, tz }, metrics })` on MySQL/PG/SQLite (≤ 100 groups); **F8** `model.changed` after-commit event with a redacted before/after diff; **F13** health-check registry behind `/ready`; **F14** public `toProblem(err)`; **F16** tagged cache with a mandatory tenant prefix; **F19** `prunable()` + `model:prune`.
- to framework (1.x): **F4** column-type registry (`defineColumnType`, replayable); **F5** decorator-free model behaviours (`Model('posts', { behaviours: [hasTags()] })`); **F6** morph relations with a stable morph map; **F9** capability tokens (interfaces only): `PdfRenderer`, `SettingsStore`, `TranslationLoader`, `MailTemplateResolver`, `MediaUrlGenerator`, `PaymentLinkProvider`, `HumanVerification`, `Broadcaster`; **F10** `.personal()` column marker + `app.personalData.register(table, { export, erase })`; **F11** driver registries for pdf, geocoder, payment gateway and virus scanner; **F12** reserved `/api/_<pkg>` prefixes (add `_*` to the slug reserved words); **F15** weighted `limiter.consume(key, cost)`; **F17** `Route…public().meta({ sitemap, seo })`; **F18** signed URLs for any named route; **F20** `t.richText()` + one hardened sanitiser; **F21** `t.money()` + `Money` cast.
- to Spike 14 / `@strutvane/ui`: please make these public, versioned registries: **U1** dashboard widgets; **U2** record detail tabs; **U3** record/bulk/toolbar actions; **U4** field widgets, cells and filters (exist; make public); **U5** list view modes (table/board/calendar/map); **U6** shell slots (header items, global banner, user menu, settings sections); **U8** theme tokens `--chart-1…--chart-8` + status colours in light and dark; **U9** lazy package chunks. Also: the notification bell + `/notifications` inbox page belongs to ui (0.3).
- to Spike 10: please add the `personal` and `aggregatable` column flags to `resources.json` (default `aggregatable` = non-sensitive numeric/enum/boolean/date).
- DECIDED (coordinator, 2026-11-14, on catalogue v2 conflicts): (C-mono) one repo per package in the org supersedes the single-monorepo plan; (C-npx) keep the tiny unscoped `strutvane` npx package (the promised `npx strutvane` alias; delegates to the project's framework bin); (C-tooling) keep `strutvane-tooling` for cross-repo config sync; (C-ui) add-ons may take `@strutvane/ui` as an OPTIONAL peer for their screens via the ui registries; (C-files) `files` = storage/uploads, `media-library` = attachments/conversions UI, separate packages; (C-pay) `payments`, `billing`, `invoicing` are separate packages. All 47 catalogue packages will be built (user decision).

## Spike 16: charts (charts agent, 2026-11-14; code in `spikes/16-charts/`, README has the evidence)

**Library:** Recharts 3.10.1 (MIT, SVG, so colours are `var(--chart-n)`; keyboard tooltip via `accessibilityLayer`), behind our own components that take `ChartData`. Compared with ECharts, Chart.js, visx and Nivo on 2026-11-14 (bundle deltas measured). 178 tests; SQLite and PGlite give identical numbers; MySQL SQL is pinned, not executed.

**Aggregate endpoint** (for framework F1/F7 `ResourceService.aggregate`):
```text
GET /api/v1/<resource>/aggregate?metric=count|sum|avg&field=&groupBy=&interval=day|week|month&splitBy=&dateField=&from=&to=&limit=1..50&filter[f][op]=v
200 { data: [{ key, values: { <series>: number|null }, suppressed?: [series] }], series: [{ key }], meta: { groupKind, interval, from, to, timezone: 'UTC', minGroupSize, suppressedCells, truncated, … } }
```
- **Keys:**
  - bucket start `YYYY-MM-DD` (UTC; weeks start Monday; zero-filled);
  - enum options in schema order;
  - `true`/`false`;
  - related ids;
  - `__other__` (rest of a top N), `__none__` (NULL), `__total__` (no groupBy);
  - without `splitBy`, the single series key is `value`.
- **Order of checks:** resource → 404 (unknown, internal and `aggregates: false` all get the same body) → policy `viewAny` + row scope and tenant → 403 → strict validation → 422 with all issues listing allowed names only → run.
- **Validation:**
  - unknown or repeated params are refused;
  - every field must be on the allow-list;
  - values are parsed per type;
  - ranges are aligned to whole buckets, with at most 400 buckets and years 1900–9998.
- **Execution:**
  - the tenant condition must be a top-level AND, checked before rendering (spike 11 rule);
  - on PostgreSQL, `set_config('app.tenant_id', …, true)` for RLS;
  - PostgreSQL uses `AT TIME ZONE 'UTC'` and `NULLS LAST`;
  - no `min`/`max`.
- **Allow-list (`resolveCharts`, the same function in the browser and on the server):** exposed fields only. Never: id, tenant column, `deleted_at`, secret, hidden, sensitive-name, `aggregatable: false`, `personal: true`, or anything from an internal table.
- **Privacy:** `minGroupSize: k` hides cells of 1..k−1 rows plus complementary cells, and limits filters to `eq`/`in` on group fields.

**Owned config:** `resources/charts/<route>.charts.ts`, written once by `node strut charts:sync`. The machine-owned files are `.strutvane/charts.gen.ts` (the `ChartsRegistry` augmentation, trimmed metadata and `ownedCharts`) and `.strutvane/charts.lock.json` (suggestion ids per resource).
```ts
export default defineResourceCharts('invoices', {
  widgets: auto({ except: ['invoices.avg-tax'] }) /* or ['invoices.new', { id: 'invoices.x', kind: 'bar', metric: 'sum', field: 'total', groupBy: 'issued_on', interval: 'month', splitBy: 'paid' }] */,
  dashboard: auto() /* | [...ids] | false */, aggregates: auto() /* | { numeric: [...], groupBy: [...] } | false */,
  privacy: { minGroupSize: 5 }, sort: 1,
})
```
- **Suggestion ids:** `<r>.new` (KPI), `<r>.per-period`, `<r>.by-<enum|bool>`, `<r>.per-period-by-<first enum>`, `<r>.sum-<decimal>`, `<r>.avg-<decimal>`, `<r>.top-<relation>`.
- **Typing:** names and ids are typed, and misuse is a compile error.
- **On sync:**
  - an explicit list is never rewritten; new suggestions are reported instead;
  - a dropped column turns the owned file into `TS2322`.

**Widgets on dashboards and the sidebar:**
- **Home:** `homeDashboardWidgets(resolved, canViewAny)` (each resource's `dashboard` picks, by `sort`).
- **Insights:** a resource's Insights tab shows all its widgets.
- **Named dashboards:** packages add them with `app.dashboards.add(defineDashboard({ name, label, icon?, group?, sort?, permission, widgets: ids }))`. `dashboardNavigation()` turns each into a spike-14 nav entry `{ name: 'dashboards.<name>', label, path: '/dashboards/<name>', icon, group: 'Dashboards', permission }`. Widgets of resources without `viewAny` are dropped.

### From Spike 16 (charts agent, 2026-11-14)
- to Spike 14 / DESIGN.md (U8): please add chart tokens `--chart-5`, `--chart-6` (enums with 5–6 options; the catalogue asks for up to `--chart-8`) and `--chart-other` (the neutral colour for "Other"/"None"), light and dark. Spike 16 defines them locally with the same pattern (brand hue + 180°/+300°, low-chroma neutral). Also: an atomic writer in `ui:sync` should retry `rename` on EPERM/EBUSY (Windows, spike 16 Finding 6).
- to Spike 10: please emit `global: true` per table (the aggregate scope refuses unscopable tables), plus the `aggregatable` and `personal` column flags (spike 16 already honours them). Please also emit `(tenant_id, created_at)` indexes for `timestamps()` on tenant tables: the time-series range filter needs them.
- to Spike 12 / framework: route `GET /api/v1/:resource/aggregate` through `throttle:aggregate` (suggested 30/min per user, 120/min per tenant, weighted cost via F15), set a statement timeout per engine, and add `app.dashboards` next to `app.navigation`.

## Spike 20: auth v2 interfaces (auth agent, 2026-11-15; code and findings in `spikes/20-auth-v2/README.md`)

Engine-agnostic `@strutvane/auth` core: pure services over seven ports, one runtime dependency (`@simplewebauthn/server` 14.1.0, MIT). 215 tests on an in-memory store and real SQLite (`node:sqlite`).

**Wiring** (the auth provider does this once at boot and binds the result):
```ts
const auth = createAuth({ config: defineAuthConfig({ appUrl, features, passkeys?, roles: 'admin-member' | 'admin-manager-member-viewer' }),
  store, counters, mailer, events, appKey: env.APP_KEY, clock?, logger?, hasher?, passwordCheck? })
await auth.state(req)            // AuthState | null: user, session, impersonator (banner flag), team, roles
await auth.passwords.login(req, { email, password, remember })   // { status: 'signed-in' } | { status: 'two-factor-required', methods }
await auth.tokens.authenticate(request.headers.get('authorization'))  // { user, token, can(ability) } | undefined
```
Services: `passwords`, `passwordReset`, `verification`, `emailLink`, `twoFactor`, `passkeys`, `sessions`, `tokens`, `teams`, `impersonation`, `system.createUser` (seeders, `user:create`). Every method takes `req: AuthRequest = { cookies: CookieJar, ip, userAgent }` and throws `AuthError` with a stable `code` + `status` (map to problem+json).

**Ports the framework implements** (`spikes/20-auth-v2/src/ports/`):
- `AuthStore` (42 methods): must make `consumeOneTime`, `consumeRecoveryCode`, `consumeInvitation`, `advanceTotpStep` atomic (`DELETE … RETURNING` / conditional `UPDATE`); emails byte-compared. Tables (all `internal: true`): `users` (+ `two_factor_secret` ciphertext, `two_factor_confirmed_at`, `two_factor_last_step`, `current_team_id`), `user_roles`, `sessions` (id = keyed digest; `state`, `method`, `expires_at`, `idle_ms`, `password_confirmed_at`, `impersonator_id`), `auth_one_time_tokens` (`(purpose, digest)`), `two_factor_recovery_codes`, `passkeys`, `personal_access_tokens`, `teams`, `team_members`, `team_invitations`. DDL reference: `src/store/sqlite-schema.ts`.
- `CounterStore`: `increment(key, ttlMs)`, `get`, `set`, `delete` on the SHARED cache (rate limits + lockouts).
- `AuthMailer.send(mail)`: closed union `password-reset | verify-email | email-link | registration-attempt | password-changed | team-invitation`; always to the stored address; the URL is a secret.
- `Clock.now()`, `AuthEventSink.emit(event)` (closed union, ids only), `AuthLogger.warn(message, ids)`.
- `CookieJar` (`get/set/clear`; HttpOnly, SameSite=Lax, Path=/, Secure on https; the core requests `__Host-` names on https) and the client IP already resolved via trusted proxies.

**Rules other spikes must keep:**
- to Spike 12: the `auth`, `verified`, `password.confirm`, `abilities` middleware wrap `auth.state()`, `auth.verification.assertVerified()`, `requireRecentConfirmation` (423 `PASSWORD_CONFIRMATION_REQUIRED`) and `auth.tokens.authenticate()`. A bearer header never falls back to the cookie. CSRF stays the framework's (the spike adapter only does the same-origin half). A pending-2FA session is a guest to every guard.
- to Spike 11 / tenancy: the current team is `auth.teams.current(req)` (re-read per request); feed it to `runWithTenant`.
- to Spike 13: `features` maps 1:1 to installer questions 5, 6, 9, 11 (`passwordLogin`, `registration` (default off), `emailVerification`, `emailLink`, `twoFactor`, `passkeys`, `tokens`, `teams`, `impersonation`). The admin seeder calls `auth.system.createUser({ …, roles: ['admin'] })`.
- Disabled features: no routes AND services throw `NOT_FOUND`; the 404 must be byte-identical to an unknown path.
