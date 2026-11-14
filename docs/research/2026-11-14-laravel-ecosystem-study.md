# Laravel ecosystem study: the developer flow end to end

**Date:** 2026-11-14 · **Laravel version studied:** 13.x (released 2026-03-17) · **Purpose:** a faithful, sourced description of how Laravel works from `laravel new` to a working CRUD with UI, so Strutvane can replicate the flow on Node/TypeScript (npm only) and improve on it.

**How to read the citations.** `[L13:page]` means `https://laravel.com/docs/13.x/page`, read on 2026-11-14. Source files are cited by repository, branch and path, read the same day. Anything not confirmed against a primary source on that date is marked *(unverified)*. Code samples are short paraphrases written for this study, not copies of the docs.

**Scope note.** This is research only. It does not change any decision. Where a finding conflicts with a current Strutvane document, it is flagged under "Implications" for a future ADR.

---

## 0. Executive summary

### 0.1 The golden path in Laravel 13 (what a developer actually types)

```bash
# 1. Create the app. The installer asks: starter kit? which stack? auth provider? teams?
laravel new acme              # Pest, Boost, SQLite and npm are defaults; migrations run for the plain skeleton
cd acme
npm install && npm run build  # only if the installer didn't already do it
composer run dev              # -> php artisan dev: serve + queue:listen + pail (logs) + vite, multiplexed

# 2. Scaffold a resource in one command
php artisan make:model Post -a
#   app/Models/Post.php, database/migrations/..._create_posts_table.php,
#   database/factories/PostFactory.php, database/seeders/PostSeeder.php,
#   app/Policies/PostPolicy.php, app/Http/Controllers/PostController.php (resource),
#   app/Http/Requests/{StorePostRequest,UpdatePostRequest}.php

# 3. Fill in by hand: migration columns, #[Fillable] on the model, form request rules,
#    policy methods, factory definition, controller bodies, and the UI pages.
php artisan migrate

# 4. Wire the routes (one line gives 7 REST routes)
#    routes/web.php: Route::resource('posts', PostController::class)->middleware(['auth', 'verified']);
php artisan route:list --path=posts

# 5. Seed and test
php artisan migrate:fresh --seed
php artisan test
```

**What Laravel core does *not* do:** it generates no CRUD screens. The starter kits ship auth screens, a layout and a sidebar with a "Dashboard" link. The developer writes `posts/index.tsx`, `create.tsx` and `edit.tsx` and adds the sidebar link by hand. Generated UI comes from an admin panel package. The dominant free one is **Filament**:

```bash
composer require filament/filament:"^5.0"
php artisan filament:install --panels          # creates app/Providers/Filament/AdminPanelProvider.php
php artisan make:filament-user
php artisan make:filament-resource Post --generate --view
# -> /admin now has a "Posts" sidebar item plus List, Create, Edit and View pages,
#    with the form and table guessed from the live DB columns
```

### 0.2 The ten takeaways for Strutvane

1. **The flow is the product.** One installer with three or four questions and safe defaults, then one dev command, then `make:model -a`. Copy the rhythm exactly.
2. **Laravel spreads one entity's truth across about seven files:** migration (schema), model (fillable, casts, relations), form requests (validation), policy (authorization), API resource (serialization), controller, and UI pages or a Filament resource. Strutvane's single `defineModel` source is the main improvement. It must still let a developer *see and own* every one of those layers (L2/L3).
3. **Filament's `--generate` reads the live database**, not the model. It maps column types to form and table components using name heuristics (`*_id` becomes a relationship select; `email`, `password`, `phone` and `image` names; `NOT NULL` becomes required). Strutvane can do the same from typed field metadata, more precisely and without a database round trip.
4. **The sidebar is built by convention:** each resource registers a navigation item with its plural label, an optional icon, sort and group, and it is hidden when the policy's `viewAny` is false. Copy this.
5. **Authorization-aware UI** (Filament hides navigation and actions from policies) is loved. Note that Filament *allows* an action when the policy method is missing. Strutvane must deny by default.
6. **`artisan dev` is now a registry.** Packages register their own dev processes, such as queues, logs and Vite, and one command multiplexes them. Copy this directly as `npm run dev`, with packages contributing processes through the installer.
7. **Convention-driven generators:** `make:migration create_posts_table` infers the table, `make:model` infers table names, factories and policies, and route model binding infers the lookup. Keep name inference, but make it explicit in generated code.
8. **Laravel 13 moved toward attributes** (`#[Fillable]`, `#[Table]`, `#[RouteKey('slug')]`, `#[UsePolicy]`, `#[ObservedBy]`, `#[Middleware]`, `#[Authorize]`). This is declarative metadata colocated with the class. Strutvane's `defineModel` options are the TypeScript equivalent (no decorators, per the standards).
9. **Ownership beats packages for UI:** starter kits are copied into the app and never updated ("there is no need to update the starter kit"). Strutvane's L3 eject with three-way merge is strictly better. Keep the "you own it" message.
10. **Pain points to avoid:** facade and magic opacity for static analysis, the Breeze/Jetstream churn (both deprecated within about two releases), duplicated validation and schema, and auth starter kits that are hard to upgrade.

### 0.3 Laravel to Strutvane command map (npm only, as requested)

| Laravel | Strutvane (npm) proposal | Notes |
|---|---|---|
| `laravel new acme` / `composer create-project laravel/laravel acme` | `npm create strutvane@latest acme` | `docs/09` currently says `@next` (pre-release) and `--pm pnpm\|npm\|…` (see §1 implications) |
| `composer run dev` (→ `php artisan dev`) | `npm run dev` (→ `sv dev`) | one multiplexed process list |
| `php artisan <cmd>` | `npx sv <cmd>` (project-local bin) or `npm run sv -- <cmd>` | `npx` resolves `node_modules/.bin/sv` first, so no global install is needed |
| `php artisan make:model Post -a` | `npx sv make:model Post --all` | |
| `php artisan migrate`, `migrate:fresh --seed` | `npx sv migrate`, `npx sv migrate:fresh --seed` | |
| `php artisan db:seed --class=UserSeeder` | `npx sv db:seed --seeder user` | |
| `php artisan route:list` | `npx sv route:list` | |
| `php artisan tinker` | `npx sv repl` (alias `tinker`) | Node REPL with app container preloaded |
| `php artisan install:api` | `npx sv install api` | installer protocol |
| `composer require laravel/scout` | `npm install @strutvane/search` then `npx sv install search` | install, then run the installer |
| `php artisan test` | `npm test` | Vitest |
| `./vendor/bin/pint` | `npm run lint` | Biome |

---

## 1. Installation and project creation

### 1.1 Prerequisites and installers [L13:installation]
- Requirements: PHP, Composer, the Laravel installer, plus Node and npm, or Bun, for frontend assets. Laravel 13 needs PHP 8.3 or later [L13:releases].
- `php.new` offers one-line installers for macOS, Windows (PowerShell) and Linux that install PHP 8.5, Composer and the Laravel installer. With PHP already present, run `composer global require laravel/installer`.
- **Herd**, a native PHP and Nginx environment for macOS and Windows, bundles `php`, `composer`, `laravel`, `node`, `npm` and `nvm`. Apps in the parked `~/Herd` folder are served at `http://<dir>.test` automatically. Herd Pro adds MySQL, Postgres and Redis, a mail viewer and a log viewer.
- The docs now open with an **"agent-first" path**: a prompt telling Claude Code or OpenCode to fetch `https://laravel.com/for/agents` and follow it as the source of truth. **Laravel Boost** (`composer require laravel/boost --dev`, then `php artisan boost:install`) gives AI agents 15+ tools and version-specific docs.

### 1.2 `laravel new`: the exact interactive flow
Source: `laravel/installer` `master` `src/NewCommand.php`, read 2026-11-14.

Prompts, in order (each one is skipped when the matching flag is passed):
1. **Project name**, if not given. Letters, digits, `-`, `_` and `.` are allowed. An existing directory is refused unless `--force` is set.
2. **"Do you want to use a starter kit?"**, default *No*.
   - *No*, then **frontend stack**: Blade (default), React, Svelte, Vue or Livewire. No auth scaffolding is added.
   - *Yes*, then **starter kit stack**: React (default), Svelte, Vue or Livewire. Next comes **authentication provider**: Laravel built-in (default) or WorkOS AuthKit. Livewire with Laravel auth asks single-file or class components. Laravel auth also asks **"add teams support?"** (default No).
3. Testing framework (Pest/PHPUnit), Boost, database and "run npm install?" prompts exist in code but are effectively **unreachable**: `interact()` sets defaults first. The defaults are **Pest** (unless `--phpunit`), **Boost on** (unless `--no-boost`), **SQLite**, and **npm**.

Flags: `--react --svelte --vue --livewire --livewire-class-components --workos --teams --no-authentication --using=<packagist/kit>`, `--pest|--phpunit`, `--database=mysql|mariadb|pgsql|sqlite|sqlsrv`, `--npm|--pnpm|--bun|--yarn|--no-node`, `--git --branch= --github[=…] --organization=`, `--boost|--no-boost`, `--dev`, `--force`.

**What runs automatically after the prompts:**
1. `composer create-project` of `laravel/laravel`, or of `laravel/<stack>-starter-kit` (branch variants for WorkOS, teams and components). Community kits are cloned.
2. `composer run post-root-package-install`, which copies `.env.example` to `.env`. Then `php artisan key:generate` and `chmod 755 artisan`.
3. The kit's own `post-create-project-cmd` hooks run.
4. `.env` is rewritten. `APP_URL` becomes `http://<name>.test` if Herd or Valet serves it, otherwise `http://localhost:8000`. `DB_CONNECTION` is set. For SQLite, the `DB_HOST/PORT/DATABASE/USERNAME/PASSWORD` lines are commented out. For other drivers they are filled in, with the database name derived from the app name.
5. **SQLite:** creates `database/database.sqlite` and runs `php artisan migrate`. This is skipped for starter kits, which run their own hooks.
6. Optional git: `git init`, a first commit, then `git branch -M <branch>`.
7. **Pest by default:** swaps PHPUnit for Pest, runs `pest --init` and `pest --drift` (converts example tests), and commits.
8. Optional `gh repo create --source=. --push`, private by default.
9. **Node:** writes the chosen package manager into the Composer scripts, deletes other lock files, then runs `<pm> install` and `<pm> run build`.
10. **Boost:** `composer require laravel/boost --dev` and `php artisan boost:install`.
11. Prints "Application ready", followed by `cd <name>` and either the Herd URL or `composer run dev`.

### 1.3 `composer create-project` and the skeleton's own scripts
Source: `laravel/laravel` `13.x` `composer.json`.
- `post-create-project-cmd` runs `key:generate`, creates `database/database.sqlite`, then `migrate --graceful`. **A plain `composer create-project laravel/laravel` therefore produces a migrated SQLite app with no prompts.**
- The `setup` script runs `composer install`, copies `.env`, runs `key:generate` and `migrate --force`, then `npm install --ignore-scripts` and `npm run build`. It is a one-shot onboarding command for a cloned repo.
- The `dev` script runs **`php artisan dev`**, new in 13.x. It reads a registry (`Illuminate\Foundation\DevCommands`) with these defaults: `artisan serve` ("server"), `queue:listen --tries=1 --timeout=0` ("queue"), `pail --timeout=0` ("logs", when available) and `npm run dev` ("vite"). It runs them through the npm package `@laravel/multiplex` in tabs, inline or stream mode. **Packages can register extra dev processes, with priorities, `only`/`except` filters and colours.** The registry source is `laravel/framework` `13.x` `src/Illuminate/Foundation/DevCommands.php`. Earlier versions used `npx concurrently`.
- `.env.example` defaults: `APP_DEBUG=true`, `APP_URL=http://localhost:8000`, `DB_CONNECTION=sqlite`, `SESSION_DRIVER=database`, `LOG_STACK=single`.
- The skeleton also ships `AGENTS.md` and `CLAUDE.md` at the root (repository tree, `13.x`).

### 1.4 Sail (Docker) [L13:sail]
- Sail is "a `compose.yaml` plus a `sail` script". Install it into any app with `composer require laravel/sail --dev`, then `php artisan sail:install`, which asks for services and publishes `compose.yaml` and the matching `.env` variables. `--devcontainer` also writes `.devcontainer/devcontainer.json`. Add services later with `php artisan sail:add`.
- Start with `./vendor/bin/sail up` (`-d` for detached). The documented alias is `alias sail='sh $([ -f sail ] && echo sail || echo vendor/bin/sail)'`.
- Commands proxy into the `laravel.test` container: `sail artisan …`, `sail composer …`, `sail npm run dev`, `sail test`, `sail tinker`, `sail shell`, `sail share` (Expose tunnel) and `sail debug` (Xdebug).
- Services: MySQL (also creates a `testing` database), PostgreSQL, MariaDB, Redis or Valkey, Meilisearch, Typesense, MongoDB Atlas Local, RustFS (S3-compatible), Mailpit (UI on :8025) or Mailtrap Local, and Selenium (for Dusk). Defaults are PHP 8.5 and Node 24. `sail artisan sail:publish` ejects the Dockerfiles into `docker/`.

### Implications for Strutvane
- **Copy exactly:** the four-question flow (starter kit? stack, auth provider, teams), a default for every other choice, and an install that *finishes with a working, migrated SQLite app*. Copy "print the next two commands" at the end, plus `--flag` equivalents for every prompt (CI-friendly) and a `setup` script for cloned repos.
- **npm only (user directive 2026-11-14):** the entry point is `npm create strutvane@latest acme`. Day-to-day commands go through a project-local bin: `npx sv …`, which resolves `node_modules/.bin/sv` without a global install, or `npm run sv -- …`. This **conflicts with the current hub docs**. `docs/09-cli-reference.md` and `CLAUDE.md` describe `pnpm sv`, `--pm pnpm|npm|yarn|bun` and `npm create strutvane@next`. Record the npm-only choice in an ADR and run `blueprint-sync` before Phase 1 docs go public. `@next` versus `@latest` is a release-channel question: keep `@next` until the first stable release.
- **Adapt:** Laravel's SQLite default is great for "zero to running", but Strutvane's tenancy depends on Postgres RLS (ADR-0007). Offer SQLite only for presets that don't enable tenancy, or default to an embedded or ephemeral Postgres. Say clearly which features need Postgres.
- **Copy and improve `artisan dev`:** `npm run dev` should start the HTTP server, the queue worker, the log viewer (`@strutvane/logs`) and Vite from a registry that installed packages add to through the installer protocol. This fits rule 3 of ECOSYSTEM.md. Use a Node multiplexer with no extra dependency where possible.
- **Sail equivalent:** Docker stays local-only and is never committed (ADR-0006). A `npx sv docker:up` that generates a git-ignored compose file is the closest compliant analogue. Sail's "compose file plus thin proxy CLI" model is worth copying, but not its committed `compose.yaml`.
- **Agent-first onboarding** is now table stakes. Strutvane already ships `CLAUDE.md` files. Add a `/for/agents` style Markdown playbook and generate `AGENTS.md` in new apps.

---

## 2. Directory structure and MVC architecture

### 2.1 Layout of a fresh 13.x app [L13:structure; `laravel/laravel` 13.x tree]
```
app/Http/Controllers/Controller.php   # empty abstract base
app/Models/User.php
app/Providers/AppServiceProvider.php
bootstrap/app.php                     # fluent app configuration (routing, middleware, exceptions)
bootstrap/providers.php               # list of app service providers
config/{app,auth,cache,database,filesystems,logging,mail,queue,services,session}.php
database/{factories/UserFactory.php, migrations/0001_01_01_00000{0,1,2}_create_{users,cache,jobs}_table.php, seeders/DatabaseSeeder.php}
public/index.php                      # single entry point
resources/{css/app.css, js/app.js, views/welcome.blade.php}
routes/{web.php, console.php}         # api.php / channels.php only via install:api / install:broadcasting
storage/{app/{private,public}, framework/{cache,sessions,…}, logs}
tests/{Feature,Unit}
artisan, composer.json, package.json, phpunit.xml, vite.config.js, .env.example
```
- `app/` folders such as `Console`, `Events`, `Jobs`, `Listeners`, `Mail`, `Notifications`, `Policies` and `Rules` **do not exist until a `make:*` command creates them**. `php artisan list make` shows every generator.
- `routes/web.php` gets the `web` middleware group (session, CSRF, cookie encryption). `routes/api.php` is stateless and token-authenticated (Sanctum). `console.php` holds closure commands and the scheduler.

### 2.2 `bootstrap/app.php` (since Laravel 11)
A single fluent builder replaces the old HTTP kernel, console kernel and exception handler:
```php
return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(web: __DIR__.'/../routes/web.php', commands: __DIR__.'/../routes/console.php', health: '/up')
    ->withMiddleware(fn (Middleware $m) => /* aliases, groups, trustProxies… */ null)
    ->withExceptions(fn (Exceptions $e) => $e->shouldRenderJsonWhen(fn ($r) => $r->is('api/*') || $r->expectsJson()))
    ->create();
```
(Paraphrased from `laravel/laravel` 13.x. Note the built-in `/up` health route and JSON errors for `api/*`.)

### 2.3 Container, providers and facades [L13:container, L13:providers, L13:facades]
- **Service container:** constructor and method injection with auto-resolution of type-hinted classes (zero-config for concrete classes), plus `bind`, `singleton` and `scoped` for interfaces. Controllers, commands, jobs, listeners and seeders are all resolved through it.
- **Service providers** have a `register()` method (bind only) and a `boot()` method (use other services: rate limiters, gates, observers, `Model::preventLazyLoading`). App providers are listed in `bootstrap/providers.php`. Package providers are **auto-discovered** from `composer.json` `extra.laravel.providers` (`package:discover` runs on `post-autoload-dump`).
- **Facades**, such as `Route::`, `DB::`, `Cache::` and `Gate::`, are static proxies to container bindings. Real-time facades are available with the `Facades\` prefix.
- **MVC in practice:** Route → (middleware) → Controller → Eloquent Model, then a View (Blade), an Inertia page, or a JSON Resource. Form Requests and Policies sit in front of controller logic.

### Implications for Strutvane
- **Copy:** one obvious place per concept (`app/models`, `app/policies`, and so on), folders created lazily by generators, one fluent app bootstrap file (`app/bootstrap.ts` with `withRouting / withMiddleware / withErrors`), a built-in health route, and JSON errors for `/api/*` (as RFC 9457 `Problem`, per RFC-0003).
- **Adapt:** facades rely on global static state and hurt type inference. Use typed container tokens (already one of the six allowed connections) plus small typed helper functions that resolve from the per-request context. Package auto-discovery maps naturally to an `"strutvane": { "provider": … }` field in `package.json`, read by the installer. Never rely on implicit global registration at import time.
- **Do better:** Laravel's `register` and `boot` phases are untyped conventions. Make the provider lifecycle typed, and fail at boot with a clear `Problem` when a token is missing.

---

## 3. Artisan: the scaffolding catalogue

### 3.1 `make:model` [L13:eloquent; source `laravel/framework` 13.x `ModelMakeCommand.php`]
| Flag | Generates |
|---|---|
| `-m` / `--migration` | `database/migrations/<ts>_create_flights_table.php` |
| `-f` / `--factory` | `database/factories/FlightFactory.php` |
| `-s` / `--seed` | `database/seeders/FlightSeeder.php` |
| `-c` / `--controller` | `app/Http/Controllers/FlightController.php` |
| `-r` / `--resource` | the controller is a 7-action resource controller type-hinting the model |
| `--api` | the controller is an API resource controller (5 actions, no `create`/`edit`) |
| `-R` / `--requests` | `StoreFlightRequest` and `UpdateFlightRequest` form requests |
| `--policy` | `app/Policies/FlightPolicy.php` |
| `-a` / `--all` | migration, factory, seeder, policy, resource controller and form requests |
| `-p` / `--pivot`, `--morph-pivot` | a pivot model |
| `--test` / `--pest` | a feature test for the controller |

Common combinations from the docs are `-mfsc`, `-crR` and `-a`. **Running `make:model Flight` with no flags opens an interactive multiselect** asking which companions to generate (source, `afterPromptingForMissingArguments`). `php artisan model:show Flight` prints the model's columns, casts, relations and observers by inspecting the database.

### 3.2 Other generators relevant to CRUD
- `make:migration create_flights_table`: the name is parsed. `create_*_table` pre-fills `Schema::create('flights', …)` and `add_*_to_*_table` pre-fills `Schema::table(…)`. `--create=` and `--table=` override the guess [L13:migrations].
- `make:controller PhotoController --resource|--api|--invokable|--model=Photo|--requests` [L13:controllers].
- `make:request StorePostRequest` writes `app/Http/Requests` with `authorize()` and `rules()` [L13:validation].
- `make:policy PostPolicy --model=Post` stubs `viewAny`, `view`, `create`, `update`, `delete`, `restore` and `forceDelete` [L13:authorization].
- `make:resource UserResource`. Use `--collection`, or a name ending in `Collection`, for a collection resource, and **`--json-api`** (new in 13) for a JSON:API resource [L13:eloquent-resources].
- `make:factory`, `make:seeder`, `make:observer UserObserver --model=User`, `make:test [--unit]`, `make:command`, `make:job`, `make:event`, `make:listener`, `make:mail`, `make:notification`, `make:rule` and `make:cast`.
- Stubs can be customized with `php artisan stub:publish`, which writes a `stubs/` folder used in preference to the defaults [L13:artisan].

### 3.3 Database and introspection commands [L13:migrations, L13:seeding, L13:routing, L13:artisan]
- `migrate` (`--step`, `--pretend`, `--isolated`, `--force`), `migrate:status`, `migrate:rollback [--step=N|--batch=N]`, `migrate:reset`, `migrate:refresh [--seed]`, `migrate:fresh [--seed] [--seeder=X]` (drops all tables), `schema:dump [--prune]`, `db:seed [--class=X] [--force]`, `model:prune [--pretend]`, `db:show`, `db:table` and `db:monitor` (the last three from prior knowledge, *(unverified)* for 13.x).
- `route:list` (`-v`/`-vv` show middleware; `--path=`, `--except-vendor`, `--only-vendor`), and `route:cache` for production.
- `tinker`, a PsySH REPL with the app booted, models auto-aliased and an allow-list of artisan commands.
- Installers: `install:api` (adds `routes/api.php`, installs Sanctum 4, publishes its migration, offers to migrate, and wires `api:` into `bootstrap/app.php`; `--passport` installs Passport instead; source `ApiInstallCommand.php`) and `install:broadcasting` (prompts for a driver, Reverb among them, and creates `config/broadcasting.php` and `routes/channels.php`) [L13:broadcasting].

### Implications for Strutvane
- **Copy exactly:** the `make:<thing>` vocabulary, `-a/--all`, the interactive multiselect when no flags are given, name-parsing for migrations, `route:list` filters, `migrate:fresh --seed`, `--pretend` (dry-run SQL), `stub:publish` (Strutvane's equivalent is template override and eject), and `install:<feature>` installers that edit config and routes and offer to migrate.
- **Adapt:** in Strutvane, `npx sv make:model Post title:string body:text --all` *declares fields*. The migration is derived (diffed) and never hand-written first, which reverses Laravel's order. Keep `npx sv make:migration` for raw SQL or data migrations only.
- **Do better:**
  - Laravel's `-a` produces six empty or near-empty files the developer must keep in sync. Strutvane's `--all` should produce a working, tested slice: API, UI, policy (deny-by-default with generated permissions), factory, seeder and test. This matches `docs/09` §make:model.
  - Add `npx sv model:show Post` that prints the *declared* model, the *live* schema and any drift between them. Laravel can only show the live schema.
  - Every generator should be idempotent and support `--dry-run` with a diff preview (Laravel only offers `--force` to overwrite).

---

## 4. Eloquent ORM

### 4.1 Model conventions [L13:eloquent]
- **Active record:** `class Flight extends Model {}`. The table is the snake_case plural (`flights`; `AirTrafficController` maps to `air_traffic_controllers`). The primary key is `id` (auto-incrementing bigint). `created_at`/`updated_at` are managed automatically. The model does **not** declare its columns; attributes come from the row at runtime.
- **Laravel 13 attribute style:** `#[Table('my_flights')]`, `#[Table(key: 'flight_id', keyType: 'string', incrementing: false)]`, `#[Table(timestamps: false)]` or `#[WithoutTimestamps]`, `#[Connection('mysql')]`, `#[WithoutIncrementing]`, `#[Refreshes(['slug'])]` (re-read DB-computed columns after a write). The older `protected $table` properties still work.
- **UUID/ULID keys:** the `HasUuids` trait generates **UUIDv7** by default (sortable); `HasUlids` generates 26-character ULIDs.
- **Mass assignment:** protected by default. You must declare `#[Fillable(['name'])]`, `#[Guarded([...])]` or `#[Unguarded]` before using `create([...])`. JSON paths work (`options->enabled`). Opt in to strictness with `Model::preventSilentlyDiscardingAttributes()`, `preventLazyLoading()` and `preventAccessingMissingAttributes()`, typically `! app()->isProduction()`. The skeleton User model uses `#[Fillable(['name','email','password'])]` and `#[Hidden(['password','remember_token'])]`, with casts `email_verified_at => datetime` and `password => hashed`.
- **Casts and accessors** [L13:eloquent-mutators]: `casts()` returns, for example, `datetime`, `hashed`, `encrypted`, `array`, `AsCollection`, enum classes and custom `CastsAttributes`. Accessors and mutators are a method returning `Attribute::make(get: …, set: …)` (cacheable with `->shouldCache()`). Use `#[Appends]` to add computed attributes to serialization.
- **Relationships** [L13:eloquent-relationships]: `hasOne`, `hasMany`, `belongsTo`, `belongsToMany` (pivot), `hasOneThrough`, `hasManyThrough`, polymorphic `morphTo`/`morphMany`/`morphToMany`. Foreign keys are inferred (`user_id`). Eager loading uses `with()`, `load()`, `withCount()` and `whereHas()`. `chaperone()` avoids reverse N+1. **Automatic eager loading** is available globally with `Model::automaticallyEagerLoadRelationships()` or per collection with `->withRelationshipAutoloading()`.
- **Scopes:** local scopes are `#[Scope] protected function popular(Builder $q)` and are called as `User::popular()`. Global scopes are classes attached with `#[ScopedBy([...])]`. `withAttributes` scopes also set attributes on create (pending attributes).
- **Soft deletes:** the `SoftDeletes` trait plus a `$table->softDeletes()` column. Use `withTrashed()`, `onlyTrashed()`, `restore()` and `forceDelete()`.
- **Pruning:** `Prunable` or `MassPrunable` with a `prunable()` query, then schedule `model:prune`.
- **Events and observers:** `retrieved`, `creating/created`, `updating/updated`, `saving/saved`, `deleting/deleted`, `trashed`, `forceDeleting/forceDeleted`, `restoring/restored` and `replicating`. Observers are generated with `make:observer --model=User` and attached with `#[ObservedBy([UserObserver::class])]`.
- **Large reads:** `chunk`, `chunkById` (safe when updating the filter column), `lazy`/`lazyById` (LazyCollection) and `cursor()`.

### 4.2 Pagination [L13:pagination]
- `paginate(15)` returns a `LengthAwarePaginator`: count query plus offset, with page numbers. `simplePaginate(15)` returns a `Paginator` (next/previous only, no count). `cursorPaginate(15)` returns a `CursorPaginator` (keyset "where" on the ordered columns; needs an ordered, unique sort; no page numbers).
- The page parameter is `page` (customizable). `withQueryString()` and `appends()` keep filters, and `withPath()` changes the base URL. Paginators serialize to JSON with `data`, `links` and `meta`-style fields automatically.

### 4.3 API Resources [L13:eloquent-resources]
- `JsonResource::toArray()` maps a model to a response shape, with conditional helpers like `whenLoaded`. Collections wrap the result in `data` and add pagination `links` and `meta`.
- **13.x conveniences:** `$model->toResource()` and `$collection->toResourceCollection()` discover `App\Http\Resources\<Model>Resource` by convention, or by `#[UseResource]` and `#[UseResourceCollection]`.
- **13.x JSON:API:** `JsonApiResource` (`make:resource PostResource --json-api`) declares `$attributes` and `$relationships`. It handles resource objects, `include`, sparse fieldsets, links and the JSON:API content type. Spatie's `laravel-query-builder` is recommended for *parsing* filters and sorts.

### 4.4 Query builder
`DB::table('users')->where(…)->orderBy(…)->get()` is the same fluent builder that Eloquent wraps. 13.x adds `whereVectorSimilarTo('embedding', 'text')` on PostgreSQL with pgvector [L13:releases].

### Implications for Strutvane
- **Copy exactly:** pluralized snake_case table names, `id`/`created_at`/`updated_at` defaults, UUIDv7 keys as the sortable default, protection against mass assignment, strict modes (no lazy loading, no silently discarded attributes) **on by default in development**, soft deletes as a model option, the three pagination flavours with a stable JSON envelope, and `toResource()`-style convention discovery.
- **Adapt for TypeScript:** no active record with runtime-only attributes. `defineModel` declares fields, so types flow end to end. Mass-assignment safety becomes "writable fields are an explicit typed subset" (derived from field metadata such as `readonly` and `serverOnly`). Accessors become typed computed fields. Observers map to the core hooks and domain events, which are already allowed connections.
- **Do better:**
  - Cursor pagination should be the API default for large tenant tables. Offset `paginate` stays for UI pages that need page numbers.
  - Strutvane can generate the JSON:API/OpenAPI shape from the same model, so the "resource" layer is optional (L1/L2 overrides) rather than a required parallel class.
  - N+1 protection: Laravel's opt-in `preventLazyLoading` and automatic eager loading show the demand. Strutvane should make relation loading explicit in the query API and fail in development.

---

## 5. Migrations and the schema builder [L13:migrations]

- **Generate:** `make:migration create_flights_table` creates a timestamped file. The name is parsed to pre-fill `Schema::create` or `Schema::table`.
- **Structure:** an anonymous class (`return new class extends Migration`) with `up()` and `down()`.
  ```php
  Schema::create('posts', function (Blueprint $t) {
      $t->id(); $t->foreignId('user_id')->constrained()->cascadeOnDelete();
      $t->string('title'); $t->string('slug')->unique(); $t->text('body')->nullable();
      $t->boolean('published')->default(false); $t->timestamps(); $t->softDeletes();
  });
  ```
- **Column types** (more than 60): `id`, `bigIncrements`, `string(len)`, `text`/`mediumText`/`longText`, `integer` families, `decimal(p,s)`, `float`, `double`, `boolean`, `date`, `dateTime(Tz)`, `time`, `timestamp(s)(Tz)`, `json`/`jsonb`, `uuid`, `ulid`, `enum`, `set`, `binary`, `ipAddress`, `macAddress`, `geometry`/`geography`, `vector`, `foreignId`/`foreignIdFor(User::class)`/`foreignUuid`/`foreignUlid`, `morphs`/`nullableMorphs`/`uuidMorphs`, `rememberToken`, `softDeletes`.
- **Modifiers:** `nullable()`, `default()`, `unsigned()`, `useCurrent()`, `useCurrentOnUpdate()`, `comment()`, `after()`/`first()` (MySQL), `charset()`/`collation()`, `storedAs()`/`virtualAs()` (generated columns), `generatedAs()`/`always()` (identity), `invisible()`, `from()` (auto-increment start), `autoIncrement()`. Columns can be changed with `->change()`, renamed with `renameColumn` and dropped with `dropColumn`.
- **Indexes:** `unique()`, `index()`, `primary()`, `fullText()` and `spatialIndex()`, with conventional names like `users_email_unique`. Foreign keys use `foreignId('user_id')->constrained()` (table inferred from the name) and `cascadeOnDelete()`, `restrictOnDelete()`, `nullOnDelete()` and `cascadeOnUpdate()`.
- **Running:** a `migrations` table records the batch number. Rollback works by batch or step. `--isolated` takes a cache lock so only one server migrates during a deploy.
- **Squashing:** `schema:dump [--prune]` writes `database/schema/<connection>-schema.sql`. On a fresh database it runs first, then any newer migrations.
- **Relation to the model:** none, structurally. The migration owns the schema; the model only *assumes* matching column names. Drift between the two is the developer's problem, and tools like Filament's `--generate` and `model:show` read the live database to bridge it.

### Implications for Strutvane
- **Copy exactly:** timestamped, ordered, reviewable SQL migrations with a batch table, `--pretend`, `--step`, an isolated lock for concurrent deploys, `migrate:fresh --seed`, squash or dump, and conventional index and FK names.
- **Adapt:** the model is the source of truth and migrations are *diffed* from it (already D-level decisions and spike 01). Generated migration files must remain plain, readable and committed, so reviewers see SQL exactly like Laravel users do.
- **Do better:**
  - Drift detection (`npx sv migrate:status --drift`) comparing model, migrations and the live database.
  - Safe-change linting (blocking renames that look like drop plus add, `NOT NULL` without a default on large tables).
  - Generated `down()` steps where reversible, and explicit "irreversible" markers where not. Laravel leaves `down()` to the developer and it is often wrong.
  - RLS policies emitted alongside table DDL (ADR-0007), which Laravel has no concept of.

---

## 6. Seeders and factories [L13:seeding, L13:eloquent-factories]

- **Seeders** live in `database/seeders`. `DatabaseSeeder::run()` calls `$this->call([UserSeeder::class, PostSeeder::class])` to control order. Mass-assignment protection is off during seeding. `WithoutModelEvents` mutes observers. Seeders run with `db:seed`, `db:seed --class=UserSeeder`, `migrate:fresh --seed [--seeder=…]` and `migrate --seed`. In production they prompt for confirmation unless `--force` is passed.
- **Factories** (`database/factories/UserFactory.php`): `definition()` returns attributes built with `fake()` (FakerPHP; locale from `config/app.php` `faker_locale`). The skeleton's `UserFactory` caches one hashed password for speed and has an `unverified()` state.
- **API:** `User::factory()->count(3)->make()` builds without saving; `->create([...overrides])` persists. States are methods that call `$this->state(fn ($attrs) => [...])`, and `trashed()` is built in. `afterMaking` and `afterCreating` callbacks are registered in `configure()`. `Sequence` alternates values and exposes `$sequence->index`.
- **Relationships:** `has(Post::factory()->count(3))` or the magic `hasPosts(3)`. `for(User::factory())` or `forUser([...])` sets the owner. `hasAttached(Role::factory()->count(3), ['active' => true])` adds pivot data. A `'user_id' => User::factory()` value inside `definition()` creates the owner on demand. `recycle($airline)` reuses one parent across a whole graph.
- **Discovery:** the `HasFactory` trait finds `Database\Factories\<Model>Factory` by convention, or by `#[UseFactory]`/`#[UseModel]`.

### Implications for Strutvane
- **Copy exactly:** the factory API shape (`count`, `make`/`create`, `state`, sequences, `has`/`for`/`hasAttached`, `recycle`, callbacks), seeders that call other seeders, a production confirmation, and `migrate:fresh --seed`.
- **Adapt:** generate the factory's default `definition` from field types and validation (an email field gets a fake email; an enum gets a random member; a `belongsTo` gets the parent factory). Laravel stubs an empty `definition()`. Use a deterministic seed by default so test data is reproducible. Tenancy-aware factories should create inside a tenant context, so RLS is exercised in tests.
- **Do better:** typed magic methods. `hasPosts(3)` is untyped in PHP. In TypeScript, `factory(User).has('posts', 3)` can be fully typed from the model's relations.

---

## 7. Routing and controllers [L13:routing, L13:controllers, L13:validation, L13:rate-limiting]

### 7.1 Resource routing
`Route::resource('photos', PhotoController::class)` registers seven routes:

| Verb | URI | Action | Name |
|---|---|---|---|
| GET | /photos | index | photos.index |
| GET | /photos/create | create | photos.create |
| POST | /photos | store | photos.store |
| GET | /photos/{photo} | show | photos.show |
| GET | /photos/{photo}/edit | edit | photos.edit |
| PUT/PATCH | /photos/{photo} | update | photos.update |
| DELETE | /photos/{photo} | destroy | photos.destroy |

- `apiResource` drops `create`/`edit`. `resources([...])` and `apiResources([...])` register several at once, and `softDeletableResources` adds `withTrashed`.
- Partial resources use `only([...])`/`except([...])`. Nested resources use `'photos.comments'` and `->shallow()`. Names and parameters are customizable with `->names()` and `->parameters()`. `->scoped(['comment' => 'slug'])` makes the child resolve through the parent's relationship.
- `->missing(fn …)` customizes the 404 for a missing model. `Route::singleton` (with `creatable` and `destroyable`) and `apiSingleton` cover one-per-parent resources.
- Middleware can target specific actions: `->middleware()`, `->middlewareFor('show', 'auth')` and `->withoutMiddlewareFor(…)`.
- Supplementary routes must be declared before the resource.

### 7.2 Route model binding (incl. slugs)
- **Implicit binding:** `{user}` plus a `User $user` type-hint resolves the model, or returns 404 if it is missing. Soft-deleted rows are excluded unless `->withTrashed()` is set.
- **Slug per route:** `Route::get('/posts/{post:slug}', …)`. When nested (`/users/{user}/posts/{post:slug}`), Laravel automatically scopes the child to the parent's `posts` relation. `scopeBindings()` forces scoping; `withoutScopedBindings()` disables it.
- **Slug always:** in 13.x, put `#[RouteKey('slug')]` on the model. The classic way is overriding `getRouteKeyName()`, which is still supported via `resolveRouteBinding` customization.
- **Explicit binding:** `Route::bind('user', fn ($v) => User::where('name', $v)->firstOrFail())`. Enum parameters bind to backed enums.

### 7.3 Controllers
- `make:controller` generates classes under `app/Http/Controllers`, resolved by the container with constructor and method injection.
- Middleware can be declared three ways: on routes, in a static `middleware()` method (`HasMiddleware`, with `only`/`except`), or (13.x) as **`#[Middleware('auth')]`/`#[WithoutMiddleware]`** attributes on the class or method.
- Authorization can be declared with **`#[Authorize('update', 'post')]`**, a shortcut for the `can` middleware.

### 7.4 Validation and Form Requests
- Inline: `$request->validate([...])`. For HTML forms, a failure redirects back with errors and old input flashed to the session. For XHR or JSON requests it returns **422** with `{message, errors: {field: [msgs]}}`.
- **Form requests** (`make:request`) have `authorize()` (returns bool; false means 403) and `rules()`. Type-hinting one in a controller validates the input before the method runs. `$request->validated()` and `$request->safe()->only([...])` return clean input.
- 13.x attributes: `#[StopOnFirstFailure]`, `#[FailOnUnknownFields]` (rejects unexpected keys), `#[RedirectTo]`/`#[RedirectToRoute]` and `#[ErrorBag]`. `prepareForValidation()` normalizes input. *(Hook name from prior knowledge, unverified for 13.x.)*

### 7.5 Rate limiting and API versioning
- Define limiters in `AppServiceProvider::boot()`, for example `RateLimiter::for('api', fn ($r) => Limit::perMinute(60)->by($r->user()?->id ?: $r->ip()))`, then apply `throttle:api` to routes. Responses carry `X-RateLimit-*` and `Retry-After` headers *(headers from prior knowledge, unverified)*.
- `install:api` adds the `/api` prefix, which is configurable with `withRouting(apiPrefix: 'api/admin')`.
- **Versioning** has no first-party convention. Community practice is URI prefixes (`Route::prefix('v1')->group(...)`) with namespaced controllers or resources (`App\Http\Controllers\Api\V1`). Header-based versioning comes from packages *(community practice, unverified as a standard)*.

### Implications for Strutvane
- **Copy exactly:** the 7-action table and names (`posts.index` and so on), `apiResource`, `only`/`except`, nested and shallow resources, scoped child binding, slug binding per route and per model, 404 on a missing model, `withTrashed` opt-in, the 422 validation shape (as a `Problem` with `issues`, per RFC-0003), and named limiters attached by name.
- **Adapt:** routes are generated from the model registry. In Hono, emit them from the same metadata and expose them in `npx sv route:list`. Validation rules come from field definitions (Zod or Standard Schema), so "form request" becomes an L1/L2 override (`beforeCreate`, extra rules) rather than a separate class. Middleware attributes map to resource-level options (no decorators).
- **Do better:**
  - `#[FailOnUnknownFields]` should be the default in Strutvane (deny unknown input). Laravel makes it opt-in.
  - Typed route helpers for the client (Laravel needs the separate Wayfinder package; see §9). Strutvane gets them from the OpenAPI client (spike 05).
  - First-party API versioning (`/api/v1`, with the version recorded in the manifest), since Laravel leaves it to convention. Noted as `extras: versioning` in `docs/09`.
  - A default `api` limiter keyed by user, then tenant, then IP, on by default.

---

## 8. The auth ecosystem

### 8.1 What exists in 13.x (and what was retired)
| Package | Role | Status (2026-11-14) |
|---|---|---|
| **Starter kits** (React, Svelte, Vue, Livewire) | Full app skeleton: auth screens, settings, sidebar layout, optional **teams**, optional **WorkOS** variant | Current, recommended [L13:starter-kits] |
| **Fortify** | Headless auth backend: routes, controllers and actions with no UI | Current; powers all starter kits [L13:starter-kits, L13:fortify] |
| **Sanctum** | SPA cookie auth plus personal access tokens with abilities | Current; installed by `install:api` [L13:sanctum] |
| **Passport** | Full OAuth2 server (auth code with PKCE, client credentials, device grant, refresh, personal tokens) | Current; `install:api --passport` [L13:passport] |
| **Socialite** | OAuth *client* login (Facebook, X, LinkedIn (OpenID), Google, GitHub, GitLab, Bitbucket, Slack), plus community providers | Current [L13:socialite] |
| **Breeze** | Minimal auth scaffolding: Blade, Livewire (Volt or class), React or Vue (Inertia), or API | **No further updates** since Laravel 12 ([12.x release notes](https://laravel.com/docs/12.x/releases)) |
| **Jetstream** | Breeze plus teams, 2FA, profile, API tokens and browser sessions (Livewire or Inertia-Vue) | **No further updates** since Laravel 12 (same source) |
| **laravel/ui** | Legacy Bootstrap/Vue/React scaffolding via `php artisan ui bootstrap --auth` | Still published (4.x supports 9.x–13.x); README marks it legacy ([laravel/ui README](https://github.com/laravel/ui)) |

The Breeze and Jetstream feature lists above come from their Laravel 11.x docs and prior knowledge *(not re-read for this study)*.

### 8.2 Starter kits in detail [L13:starter-kits]
- **React:** Inertia 3, React 19, TypeScript, Tailwind 4, shadcn/ui. **Vue:** Inertia 3, Composition API, TypeScript, shadcn-vue. **Svelte:** Inertia 3, Svelte 5, shadcn-svelte. **Livewire:** Livewire 4 and Flux UI.
- **All code is copied into the app.** Frontend code lives in `resources/js/{components,hooks|composables,layouts,lib,pages,types}`, and more shadcn components can be added with `npx shadcn@latest add switch`.
- **Layouts:** a "sidebar" layout (default; variants sidebar, inset and floating) or a "header" layout. Auth layouts come in "simple", "card" and "split". Switching is a one-line import change.
- **Fortify routes:** `/login`, `/logout`, `/register`, `/forgot-password`, `/reset-password/{token}`, `/email/verify…`, `/user/confirm-password` and `/two-factor-challenge`. Features are toggled in `config/fortify.php` (`registration`, `resetPasswords`, `emailVerification`, `twoFactorAuthentication(['confirm' => true, 'confirmPassword' => true])`).
- **Customization hooks** live in `app/Actions/Fortify/{CreateNewUser,ResetUserPassword,PasswordValidationRules}.php`.
- **Rate limiting:** the default login limiter is 5 per minute per email plus IP, in `FortifyServiceProvider`.
- **2FA (TOTP) is enabled by default.** Email verification is turned on by implementing `MustVerifyEmail` on `User` and adding the `verified` middleware.
- **Wayfinder pitfall:** disabling a Fortify feature means removing its route references from the frontend, otherwise the Wayfinder-typed build fails.
- **Teams (new):** personal team on registration, a current team, invitations, team-scoped URLs such as `/{current_team}/dashboard`, membership enforced on `{current_team}` and `{team}` parameters, URL defaults so `route('dashboard')` includes the team slug, and reserved team names (`settings`, `login`, `dashboard`).
- **WorkOS AuthKit variant:** social login (Google, Microsoft, GitHub, Apple), passkeys, Magic Auth and SSO. The docs recommend disabling passwords entirely. It needs `WORKOS_CLIENT_ID`, `WORKOS_API_KEY` and `WORKOS_REDIRECT_URL`.
- **Upgrades:** "there is no need to update the starter kit"; you own the code. Community kits use `laravel new app --using=vendor/kit`, with post-install commands in the kit's `post-create-project-cmd`.

### 8.3 Sanctum, Passport and Socialite
- **Sanctum** [L13:sanctum]:
  - `HasApiTokens` on `User`. `$user->createToken('name', ['server:update'])->plainTextToken` stores the token SHA-256 hashed.
  - `tokenCan('server:update')` checks an ability; the `abilities` and `ability` middleware check on routes. Guard with `auth:sanctum`.
  - **SPA mode uses no tokens at all:** it uses the session cookie via the `web` guard (with CSRF) when the request comes from a configured first-party domain, and falls back to the `Authorization: Bearer` header otherwise.
- **Passport** [L13:passport] is used "if your application absolutely needs to support OAuth2". Otherwise the docs steer you to Sanctum.
- **Socialite** [L13:socialite]: credentials go in `config/services.php` keyed by provider. `Socialite::driver('github')->redirect()` starts the flow, then `->user()` in the callback is followed by `User::updateOrCreate([...github_id...])` and `Auth::login($user)`.

### 8.4 Authorization: gates and policies [L13:authorization]
- **Gates** are closures defined in `AppServiceProvider::boot()`, for example `Gate::define('update-post', fn (User $u, Post $p) => $u->id === $p->user_id)`. Check them with `Gate::allows`/`denies`/`authorize` (which throws 403), `Gate::inspect` for the response, and `Response::deny('msg')`, `denyWithStatus(404)` or `denyAsNotFound()`. `Gate::before` gives super-admin bypass.
- **Policies** (`make:policy PostPolicy --model=Post`) are **auto-discovered** from `App\Models\Post` → `App\Policies\PostPolicy`. They can be registered explicitly with `Gate::policy(...)` or `#[UsePolicy(PostPolicy::class)]`. Methods: `viewAny`, `view`, `create`, `update`, `delete`, `restore`, `forceDelete`.
- **Using them:**
  - `$user->can('update', $post)` in code.
  - The `can` middleware: `->middleware('can:update,post')`, or `->can('update', 'post')` on routes. Class-level abilities use `->can('create', Post::class)`.
  - Blade: `@can`/`@cannot`/`@canany`.
  - 13.x attribute: `#[Authorize('update', 'post')]`.
  - Form request `authorize()`.

### Implications for Strutvane
- **Copy exactly:**
  - One install question for auth provider (built-in or an external IdP such as WorkOS or Entra), then a working login, registration, reset, verification and 2FA with *all code owned by the app*.
  - Sidebar and header layouts with auth layout variants. Teams with personal teams, a current team in URLs and reserved names.
  - The Sanctum split: cookie sessions for first-party SPAs, hashed personal tokens with abilities for third parties.
  - Policy auto-discovery by name, the `viewAny`…`forceDelete` vocabulary, and the `can` route shortcut.
- **Adapt:**
  - Strutvane's Better Auth adapter (ADR-0013) plays Fortify's role (headless) and the UI package plays the starter kit's role.
  - Teams map onto Strutvane tenancy, enforced by Postgres RLS, which is stronger than Laravel's app-level middleware membership checks.
  - Abilities should be the same permission strings the RBAC compiler uses, so a token's abilities and a role's permissions share one vocabulary.
- **Do better:**
  - **Deny by default.** In Laravel a route with no `can` middleware is open to any authenticated user. Generated Strutvane resources require a policy or a permission for every action (D-level and ADR-0008 semantics).
  - Avoid Laravel's churn (Breeze, then Jetstream, then kits). Strutvane's auth UI must be upgradeable through three-way merge (L3), so security fixes reach existing apps. The Laravel docs say kits never need updating, which is a known gap.
  - Fortify's "remove the feature, then fix the frontend build by hand" problem disappears if the UI reads enabled auth features from the manifest at build time.

---

## 9. The UI side

### 9.1 Blade, Livewire and Inertia [L13:frontend]
- **Blade:** server templates with components (`<x-…>`), layouts and slots. Combine with Alpine.js for sprinkles.
- **Livewire (v4):** "reactive UIs using just PHP". A component is a class (or a single-file component) with public state and actions, re-rendered over AJAX. **Flux** is the official Livewire component library (used by the Livewire starter kit; has a paid Pro tier *(unverified)*).
- **Inertia (v3):** a server-side router and controllers return `Inertia::render('posts/index', ['posts' => …])`. The client renders a React, Vue or Svelte page component with those props, giving SPA navigation with no client router and no separate API.
- **Wayfinder** (beta): generates typed TypeScript functions for Laravel routes and controllers, via `@laravel/vite-plugin-wayfinder` ([laravel/wayfinder README](https://github.com/laravel/wayfinder)). The starter kits use it.
- **Precognition:** sends a "precognitive" request that runs middleware and form-request validation *without* executing the controller, for live frontend validation using backend rules. It is built into Inertia 2.3+ forms [L13:precognition].

### 9.2 Vite integration [L13:vite]
- `vite.config.js` uses `laravel-vite-plugin` with inputs `resources/css/app.css` and `resources/js/app.js`, plus `@tailwindcss/vite`. In Blade, `@vite([...])` emits dev-server tags or built manifest tags.
- Use `npm run dev` for HMR and `npm run build` for production. Skeleton 13.x `package.json`: Vite 8, `laravel-vite-plugin` ^3.1, Tailwind 4, `concurrently`, optional `@laravel/multiplex`.

### 9.3 Admin panels that auto-build CRUD and a sidebar

#### Filament (v5.x, the current major on 2026-11-14)
Sources: [filamentphp.com/docs/5.x](https://filamentphp.com/docs/5.x/introduction/installation) and the `filamentphp/filament` `5.x` source.
- **Requirements:** PHP 8.2+, Laravel 11.28+, Tailwind 4.1+. **Support policy:** 4.x gets bug fixes to 2027-01-15 and security fixes to 2028-01-15; 5.x is supported until the 6.x release; 3.x gets security fixes until 2028-01-01. Built on Livewire, with no JS framework to learn. MIT licensed *(license from prior knowledge, unverified)*.
- **Install:** `composer require filament/filament:"^5.0"`, then `php artisan filament:install --panels`. This writes `app/Providers/Filament/AdminPanelProvider.php` and registers it in `bootstrap/providers.php`. `php artisan make:filament-user` creates a login, after which `/admin` is ready.
- **Panels:** the panel provider configures `id`, `path('admin')`, `login()`, colours, `discoverResources/Pages/Widgets(in: app_path('Filament/...'))`, `middleware`/`authMiddleware`, optional `spa()` mode and tenancy. Several panels per app are allowed (for example `admin` and `app`). *(Discover-method names from prior knowledge of v3/v4; the 5.x panel docs confirm `path`, `spa` and `authMiddleware`.)*
- **Resources:** `php artisan make:filament-resource Customer` creates:
  ```
  app/Filament/Resources/Customers/CustomerResource.php
  app/Filament/Resources/Customers/Pages/{ListCustomers,CreateCustomer,EditCustomer}.php
  app/Filament/Resources/Customers/Schemas/CustomerForm.php
  app/Filament/Resources/Customers/Tables/CustomersTable.php
  ```
  Flags: `--generate` (build the form and table from DB columns), `--view` (add a View page with an infolist), `--simple` (one "Manage" page with modals), `--soft-deletes` (restore and force-delete actions, trashed filter), `--model --migration --factory` (create those too) and `--model-namespace=`.
  - Pages are full-page Livewire components. Forms and infolists live in `Schemas/`, tables in `Tables/`.
  - `$recordTitleAttribute` drives global search. Relation managers handle related records on the Edit and View pages.
- **How `--generate` works** (source `packages/forms/.../CanGenerateModelForms.php`, `packages/tables/.../CanGenerateModelTables.php`, `packages/support/.../CanReadModelSchemas.php`, branch 5.x):
  1. Instantiate the model, get its **connection's schema builder** and `getTable()`, then iterate `Schema::getColumns($table)` from the **live database**.
  2. **Form, skipped columns:** auto-increment columns, the primary key, `created_at`, `updated_at`, `deleted_at` and `*_token`.
  3. **Form, type mapping:** `boolean` → `Toggle`; `date` → `DatePicker`; `time` → `TimePicker`; `datetime`/`timestamp` → `DateTimePicker`; `text` → `Textarea`; a name of `image`, `image_*`, `*_image_*` or `*_image` → `FileUpload->image()`; anything else → `TextInput`.
  4. **Form, enums:** a DB `enum` column *or* an enum cast becomes a `Select`, with options from the enum class or from the column values humanized ("in_progress" becomes "In progress"), and the default from the column default.
  5. **Form, foreign keys:** `*_id` guesses a `belongsTo` relation named by stripping `_id`. If the model has that method, it becomes `Select->relationship('author', <title column>)`. The title column is `name`, then `title`, then the primary key.
  6. **Form, modifiers:** a name containing `email` adds `->email()`, `password` adds `->password()`, and `phone`/`tel` add `->tel()`. `NOT NULL` adds `->required()`. Numeric types add `->numeric()` and a typed default. String length adds `->maxLength(n)`. Unsupported types are skipped and reported.
  7. **Table:** skips `password` and `*_token` columns. `boolean` becomes `IconColumn->boolean()`; image-named columns become `ImageColumn`; everything else is a `TextColumn`. Dates get `->date()`/`->dateTime()`; numbers get `->numeric()`, or `->money()` for money types.
  8. **Table, search and sort:** `string`/`char` columns and relationship columns (`author.name`) are `->searchable()`. Date and numeric columns are `->sortable()`. `created_at`, `updated_at` and `deleted_at` are `->toggleable(isToggledHiddenByDefault: true)`.
  9. **Table, actions:** edit and delete actions plus bulk delete are added by the resource stub *(stub contents not re-read, unverified)*.
- **How the sidebar is built** ([resources/overview](https://filamentphp.com/docs/5.x/resources/overview), [navigation/overview](https://filamentphp.com/docs/5.x/navigation/overview)):
  - Every discovered resource and page **registers a navigation item automatically**, labelled with the model's **plural label**.
  - Customization: `$navigationLabel`, `$navigationIcon` (any Blade icon; Heroicons by default), `$navigationSort`, `$navigationGroup` (string or enum), `$navigationParentItem`, and `getNavigationBadge()` with a colour and tooltip.
  - Group order and appearance are set with `->navigationGroups([...])`. Groups are collapsible. The sidebar can be made collapsible on desktop, a top-navigation mode exists, and a fully custom builder is possible *(top-nav and custom builder from prior knowledge, unverified for 5.x)*.
  - **The policy's `viewAny()` hides the item and blocks the pages.** "Missing from navigation" is usually a `viewAny()` that returns false.
- **Authorization:** observes model policies (`viewAny`, `create`, `update`, `view`, `delete`/`deleteAny`, `forceDelete`/`forceDeleteAny`, `restore`/`restoreAny`, `reorder`). **Warning from the docs: by default Filament *allows* an operation when the policy or the method is missing**, unless a `Gate::before` denies it. A "strict authorization" mode detects missing policies. `$shouldSkipAuthorization` bypasses checks. On every Livewire request the record is re-queried and authorization repeated.

#### Laravel Nova (v5, first-party, paid)
Source: [nova.laravel.com/docs/v5](https://nova.laravel.com/docs/v5/resources/the-basics).
- Supports Laravel 10–13, Inertia 2, and **Laravel Mix 6** with Node 18+ for its own build (notably still Mix, not Vite). Installed from a private Composer repository with a purchased license (pricing *(unverified)*).
- `php artisan nova:resource Post` creates `app/Nova/Post.php` with `public static $model = Post::class`. **Fresh resources contain only an `ID` field**; you declare `fields()` (`Text::make`, `BelongsTo::make` and so on) by hand. There is no schema-based generation.
- Resources in `app/Nova` are auto-registered and appear in the Nova sidebar. Nova also offers optimistic-lock 409 handling, polling, lenses, actions, filters, metrics and cards. Reserved resource names include Card, Dashboard, Field, Metric, Resource and Search.

#### Backpack for Laravel (v7)
Source: [backpackforlaravel.com/docs/7.x](https://backpackforlaravel.com/docs/7.x/crud-tutorial).
- Install with `composer require backpack/crud:"^7.0"`, then `php artisan backpack:install`.
- `php artisan backpack:crud tag` (singular) generates a migration and table (`id`, `name`), a model with `CrudTrait`, `app/Http/Controllers/Admin/TagCrudController.php` (operations List, Create, Update, Delete and Show; `setup()` with `CRUD::setModel/setRoute/setEntityNameStrings`; `setupListOperation()` with `CRUD::column(...)`; `setupCreateOperation()` with `CRUD::setValidation(TagRequest::class)` and `CRUD::field(...)`), a form request, a `Route::crud('tag', 'TagCrudController')` line in `routes/backpack/custom.php`, and **a sidebar entry appended to `resources/views/vendor/backpack/ui/inc/menu_items.blade.php`**.
- Core is free; add-ons and "DevTools" (a GUI generator) are paid. The docs point to Laracasts Generators or Blueprint (YAML) for schema-first generation.
- Older versions generated `CRUD::setFromDb()` to infer fields from the database *(prior knowledge, unverified for 7.x)*.

### Implications for Strutvane
- **Copy exactly:**
  - Inertia's *mental model*: server routes and controllers, page components with typed props, no hand-written client API layer.
  - A sidebar layout by default with layout variants, shadcn-style owned components (`npx shadcn add` analogue: `npx sv ui:add <component>` from the Strutvane registry).
  - Filament's resource anatomy (List, Create, Edit and View pages; separate form, table and infolist schemas; relation managers; global search via a title attribute; soft-delete actions and filter).
  - Filament's navigation contract (plural label, icon, sort, group, parent, badge, hidden by `viewAny`).
- **Adapt:**
  - Generate forms and tables from **typed field metadata**, not the live database. Keep Filament's heuristics as *defaults the field type can override*: `email`, `password`, `phone`, `image`, `*_id` → relation select; enum → select; not-nullable → required; string → searchable; date and number → sortable; timestamps hidden by default.
  - Strutvane's registry compiler (spike 04) and UI renderer (spike 08) are the analogue of `make:filament-resource --generate`. The difference is that they run at build time and regenerate safely.
  - Laravel needs Wayfinder plus Inertia plus Precognition to get typed routes, shared props and live validation. Strutvane gets all three from one model and OpenAPI manifest.
- **Do better:**
  - **Deny when a policy is missing.** Filament's documented default allows; Strutvane must fail closed (ECOSYSTEM.md §4.6).
  - **Re-generation without losing edits.** Filament and Backpack generate once and you own the files from then on; changing a column means editing by hand. Strutvane's L0–L3 levels with three-way merge (spike 06) remove this pain.
  - **No admin/app split.** Laravel teams often build the customer UI by hand (Inertia) and the back office in Filament or Nova, which means two UI stacks. Strutvane's metadata-driven UI should serve both, with panels or areas for different audiences, like Filament's multi-panel support.
  - **Precognition-style live validation** using the same Zod schema on the client, with no extra round trip, keeping server re-validation.

---

## 10. Slugs and search conventions

### 10.1 Slugs
- **Binding by slug:** per route with `{post:slug}`; per model with `#[RouteKey('slug')]` (13.x) or the classic `getRouteKeyName()` override [L13:routing]. Nested slug bindings auto-scope to the parent relation. A slug column is a plain `$table->string('slug')->unique()`.
- **Generating slugs:** Laravel has `Str::slug()` but no automatic model slugging. The de facto package is **`spatie/laravel-sluggable`**. Version 6.0.0 was released 2026-11-13 (GitHub releases). It provides:
  - `#[Sluggable(from: 'title', to: 'slug')]` on the model. The slug is generated on create and update and made **unique with `-1`, `-2` suffixes**.
  - The `HasSlug` trait with `getSlugOptions()` (`SlugOptions::create()->generateSlugsFrom()->saveSlugsTo()`) for closures, scoped uniqueness and conditional skips.
  - **Self-healing URLs** (`selfHealing: true`): the route key is `slug-id` (`hello-world-5`), and a stale slug gets a **308 redirect** to the canonical one. This needs `HasSlug`, which overrides the route key and binding.
  - `HasTranslatableSlug` with spatie/laravel-translatable.
  - Source: [spatie/laravel-sluggable README](https://github.com/spatie/laravel-sluggable).

### 10.2 Search
- **Scout** [L13:scout]: add the `Searchable` trait to a model. Observers keep the index in sync, optionally queued. `toSearchableArray()` picks the indexed fields; otherwise the whole `toArray()` is indexed.
  - Query with `Post::search('term')->where(...)->paginate()`.
  - Engines: a built-in **`database`** engine (MySQL/Postgres full-text and `LIKE`, "for most applications, this is all you need"), `collection` (local), Algolia, Meilisearch, Typesense and Turbopuffer (`SCOUT_DRIVER=…`). Import and flush with `scout:import` and `scout:flush`.
  - The database engine can mark columns with `#[SearchUsingFullText]`/`#[SearchUsingPrefix]` *(attribute names from prior knowledge, unverified for 13.x)*.
- **Semantic search (13.x):** vector columns, `whereVectorSimilarTo()` on pgvector, and `Str::of(...)->toEmbeddings()` via the AI SDK [L13:releases].
- **How "searchable" is declared in practice:**
  1. Scout's `Searchable` trait plus `toSearchableArray()` for full-text.
  2. Filament's `->searchable()` per table column, plus a `$recordTitleAttribute` and `getGloballySearchableAttributes()` for the panel's global search.
  3. Query scopes such as `scopeSearch($q, $term)` with `LIKE`.
  4. Spatie query-builder `allowedFilters([...])` for API filtering.

  **There is no single declaration**; the same field list is repeated in every layer.

### Implications for Strutvane
- **Copy exactly:** `{post:slug}`-style binding per route and a model-level route key option, unique slugs with numeric suffixes, self-healing `slug-id` URLs with a 308, and Scout's "a database engine by default, external engines by config" stance.
- **Adapt:** declare it once on the field: `field.slug({ from: 'title', unique: 'tenant', selfHealing: true })` and `field.string({ searchable: true, sortable: true })`. Then the API filter, the UI table search, the global search and the full-text index (Postgres `tsvector` plus a GIN index, generated in the migration) all read that flag. This matches the existing `filterableFields` direction (commit `edda4f5`).
- **Do better:** slug uniqueness must be **tenant-scoped by default** (two tenants can both have `/posts/welcome`). Search indexes must respect RLS; with the database engine this is automatic because the search runs inside the RLS session. External engines need a mandatory tenant filter, failing closed.

---

## 11. The wider first-party ecosystem (one paragraph each)

Each paragraph covers what the tool is and why developers love it. Sources: [L13:<page>] where named; otherwise prior knowledge, marked *(unverified)*.

- **Sail** [L13:sail]: a Docker dev environment that is just a `compose.yaml` plus a thin CLI (`sail up`, `sail artisan`, `sail npm`). People love it because it needs no Docker knowledge, selects services from prompts, and gives MySQL a separate testing database.
- **Herd** [L13:installation]: a native, one-installer PHP and Nginx environment for macOS and Windows. `~/Herd/<app>` is served instantly at `<app>.test`, and Pro adds databases, Redis, a mail viewer and a log viewer. People love it for zero config, speed and no Docker.
- **Valet** [L13:valet]: the older macOS-only minimalist predecessor of Herd (Nginx plus DnsMasq, `*.test`, about 7 MB of RAM). The docs now point to Herd.
- **Horizon** [L13:horizon]: a dashboard and code-driven configuration for Redis queues (throughput, runtime, failures, worker balancing) in one version-controlled config file. People love it because queue operations become visible and the configuration is deployable.
- **Telescope** [L13:telescope]: a local debug assistant that records requests, exceptions, logs, queries, jobs, mail, notifications, cache operations, scheduled tasks and dumps in a web UI. It is the "what just happened?" tool.
- **Pulse** [L13:pulse]: at-a-glance production insights (slow requests, jobs and queries, top users, usage) with a self-hosted dashboard. Cheap enough to run in production.
- **Pennant** [L13:pennant]: lightweight feature flags (`Feature::active('new-ui')`), scoped to users or teams, with database or array storage. Supports trunk-based development without a SaaS.
- **Reverb** [L13:reverb]: a first-party, scalable WebSocket server that plugs into broadcasting and Echo (`install:broadcasting`). Real-time features without Pusher.
- **Cashier** [L13:billing]: a fluent Stripe (and Paddle) subscription layer covering trials, swaps, quantities, grace periods, invoices and webhooks. It removes the most dreaded boilerplate.
- **Scout** [L13:scout]: driver-based full-text search on models (database, Algolia, Meilisearch, Typesense, Turbopuffer); see §10.
- **Socialite** [L13:socialite]: OAuth login in about ten lines per provider; see §8.
- **Octane** [L13:octane]: boots the app once and serves requests from memory (FrankenPHP, Swoole, Open Swoole, RoadRunner). A large throughput gain for a config change, with the caveat of memory leaks from state held between requests.
- **Forge, Vapor, Cloud and Nightwatch:**
  - Forge provisions and deploys to your own VPS.
  - Vapor is serverless on AWS Lambda.
  - **Laravel Cloud** is the fully managed platform the company now centres on. It was funded by a $57M Accel round reported by Fortune ([Yahoo Finance mirror](https://sg.finance.yahoo.com/news/exclusive-laravel-raises-57-million-114408132.html)); I recall the date as September 2024, but some secondary sites give 2025 *(date unverified)*.
  - Nightwatch is first-party production monitoring.
  - Developers love "git push to deploy" without DevOps *(product details from prior knowledge, unverified)*.
- **Pint** [L13:pint]: a zero-config, opinionated code-style fixer built on PHP-CS-Fixer and installed in every app. It ends style debates.
- **Pest / PHPUnit** [L13:testing]: both are supported out of the box. The installer defaults to **Pest**, an expressive `it()`/`expect()` API. Pest 4 includes browser testing that the Dusk docs now recommend for new projects. `php artisan test` (with `--parallel`) gives pretty output. `RefreshDatabase` gives an isolated database per test.
- **Dusk** [L13:dusk]: Chrome browser automation without Selenium (a standalone ChromeDriver). Now superseded by Pest 4 browser testing for new projects.
- **Envoy** [L13:envoy]: Blade-syntax task runner for SSH deploy scripts (macOS and Linux). Simple, readable deploy recipes.
- **Precognition** [L13:precognition]: live validation by running middleware and form requests without the controller; see §9.
- **Prompts** [L13:prompts]: beautiful, validated CLI forms (text, select, multiselect, search, confirm, progress) used by `laravel new` and `make:*`. It is why Laravel's CLI feels friendly.
- **Boost and the AI SDK:** Boost gives agents tools, guidelines and version-matched docs [L13:installation]. The 13.x **AI SDK** offers agents, tools, embeddings, images and audio with a provider-agnostic API [L13:releases]. This is where Laravel's marketing is now heading ("Artisans and agents").

### Implications for Strutvane
- **Copy the shape:** each concern is a separate, optional, first-party package with one install command and a dashboard where relevant. Strutvane's polyrepo plus installer protocol is the right structure.
- **Map:** Telescope and Pulse correspond to `@strutvane/logs` (viewer at `/_strutvane/logs`, RFC-0004) plus OpenTelemetry. Pennant becomes a future `flags` package. Horizon becomes a queue dashboard in `framework`. Cashier becomes the planned payments/billing package. Scout becomes search in `framework` (database engine first). Socialite becomes Better Auth providers. Prompts becomes the CLI's prompt library. Pint becomes Biome. Pest becomes Vitest.
- **Do better:** Strutvane has no hosted platform (MIT, everything open). Compete on "deploy anywhere": generated Dockerfiles stay local-only, so offer documented recipes for Azure (Container Apps or App Service), Fly and Render. Keep observability first-party and free; Laravel splits it into Telescope (free), Pulse (free) and Nightwatch (paid).

---

## 12. Why Laravel's DX is loved, and where it hurts

### 12.1 What makes it loved
1. **Conventions over configuration:**
   - Table names, foreign keys, factory, policy and resource discovery, route-model binding and migration-name parsing are all inferred.
   - The 13.x attribute style (`#[Fillable]`, `#[RouteKey]`, `#[UsePolicy]`) keeps the remaining configuration next to the code.
   - The installation docs pitch this as *"agent ready"*: predictable locations mean AI agents put things in the right place [L13:installation].
2. **Zero-config defaults:**
   - A new app runs with SQLite, migrated, with a `/up` health route, JSON errors under `/api`, database sessions and queues.
   - One dev command starts everything.
3. **`artisan make` muscle memory:** `make:model -a` is the shared language of tutorials, Laracasts and AI agents. Every generator is discoverable through `php artisan list make` and prompts for missing input.
4. **Error pages:**
   - Ignition (Spatie) shaped expectations, with code context, suggested solutions and "share".
   - Since 11.9 Laravel ships its own minimal debug exception page, and since 12.25 it has a **"Copy as Markdown" for AI** button ([Laravel News 12.25](https://laravel-news.com/laravel-12-25-0)). Having Ignition installed hides it.
   - Production behaviour is controlled by `APP_DEBUG` [L13:errors].
5. **Docs quality:** one site, task-oriented pages with runnable snippets, versioned per major, "Copy as markdown" on every page, and an agent playbook URL. Laracasts provides the video curriculum.
6. **A coherent first-party ecosystem** (§11) with consistent naming, install commands and quality, plus a dense community (Spatie, Livewire, Filament).
7. **Stability:** annual majors with "upgrade in a day" goals, 18 months of bug fixes and 2 years of security fixes [L13:releases]. Laravel 13 was explicitly a "minimal breaking changes" release.

### 12.2 Known pain points and criticisms
1. **Magic versus static analysis:** facades, magic methods (`hasPosts()`), dynamic properties and container string keys hurt IDE navigation, refactoring and static analysis. The community has drifted toward constructor injection; Larastan and IDE helpers exist to compensate ([Rector blog](https://getrector.com/blog/laravel-facades-to-constructor-injection-replace-facade-aliases-with-full-classes-in-2-hours); [freeCodeCamp critique](https://www.freecodecamp.org/news/moving-away-from-magic-or-why-i-dont-want-to-use-laravel-anymore-2ce098c979bd/)).
2. **Schema and model duplication:** columns live in migrations, fillable and casts in the model, rules in form requests, shape in resources, and UI in pages or Filament. Drift is common, and no tool keeps them aligned.
3. **Starter-kit churn:** laravel/ui, then Breeze and Jetstream, then the Laravel 12 starter kits, with Breeze and Jetstream frozen. The new kits launched without Jetstream's teams (teams came back later). Generated code is never updated, so security and UX fixes don't reach old apps. Source: 12.x release notes, plus community reaction ([DEV](https://dev.to/hichemtab-tech/laravel-12-removed-breeze-and-jetstream-from-the-installer-so-i-built-laravelfs-3beo); [desarrollolibre](https://www.desarrollolibre.net/blog/laravel/why-kill-breeze-the-2-things-i-dont-like-about-the-laravel-framework)).
4. **Two UI worlds:** customer UI in Inertia, Livewire or Blade, and admin in Filament or Nova. Different component models and duplicated field definitions.
5. **Authorization is opt-in:** routes are open to any authenticated user unless `can` or a policy is wired, and Filament *allows* when a policy method is missing (its own docs warn about this). Multi-tenancy is not first-party (community packages, app-level scoping).
6. **Commercial gravity:** VC funding and the platform focus (Cloud, Nightwatch, Nova and Flux Pro as paid tiers) raise community concerns about priorities *(opinion pieces; see §11 sources)*.
7. **Performance model:** per-request boot unless Octane is used, and Octane introduces state-leak hazards.

### Implications for Strutvane
- **Copy exactly:**
  - Defaults that run (no config needed to see a working app), one dev command, the `make:*` vocabulary, interactive prompts for missing input, and docs written as tasks with copyable snippets.
  - A versioned docs site with a Markdown export and an agent playbook.
  - A debug error page with "copy as Markdown for AI" (render RFC 9457 `Problem` details plus request context, with secrets redacted, per RFC-0004).
- **Adapt:** replace "magic" with **inference you can read**. Generators write explicit code and metadata, so IDEs and `tsc` see everything. Conventions live in the compiler, not in runtime lookups.
- **Do better** (the pitch that wins Laravel developers):
  1. **One declaration, every layer:** schema, validation, API, docs and UI from `defineModel`, with drift detection.
  2. **Upgradeable scaffolding:** auth, CRUD and admin screens get security fixes through a three-way merge.
  3. **Secure by default:** deny-by-default authorization, RLS tenancy, unknown-field rejection and redacted logs. All are opt-in or absent in Laravel.
  4. **One UI system** for app and admin.
  5. **End-to-end types** from the database to the React props, without extra packages (Wayfinder, IDE helpers, Larastan).

---

## Appendix A. End-to-end flow side by side (target UX for Strutvane, npm only)

| Step | Laravel 13 | Strutvane target |
|---|---|---|
| Create | `laravel new acme` (starter kit? stack? auth provider? teams?) | `npm create strutvane@latest acme` (preset? database? auth providers? tenancy? see `docs/05` §2) |
| Run | `composer run dev` → serve, queue, logs, Vite | `npm run dev` → API, worker, logs viewer, Vite, from a package-extensible registry |
| Model | `php artisan make:model Post -a`, then edit 7 files | `npx sv make:model Post title:string slug:slug(title) body:text? published:boolean --all` |
| Schema | hand-write migration → `php artisan migrate` | `npx sv migrate` (diff generated from the model; file committed) |
| Validation | form requests by hand | derived from fields; overrides in `app/resources/post.resource.ts` |
| Authz | `make:policy`, wire `can` by hand | policy and permissions generated, deny by default, enforced in SQL/RLS |
| API | `Route::apiResource` + `JsonResource` by hand | auto-registered, documented (OpenAPI), versioned |
| UI | write Inertia pages and the sidebar link by hand, *or* add Filament (`make:filament-resource Post --generate`) | list, detail, create and edit screens plus a sidebar entry (label, icon, group, badge; hidden without `viewAny`) generated and owned |
| Seed | write factory `definition()`, `db:seed` | factory derived from the field types; `npx sv db:seed` |
| Test | `php artisan test` | `npm test` (generated API, UI and attack-style tests) |
| Inspect | `route:list`, `model:show`, `tinker` | `npx sv route:list`, `npx sv model:show Post` (with drift), `npx sv repl` |

## Appendix B. Sources (all read 2026-11-14 unless noted)

Laravel 13.x docs (`https://laravel.com/docs/13.x/<page>`): installation, starter-kits, releases, structure, sail, eloquent, eloquent-relationships, eloquent-mutators, eloquent-factories, eloquent-resources, migrations, seeding, controllers, routing, validation, authorization, sanctum, fortify, socialite, passport, pagination, scout, vite, frontend, artisan, errors, precognition, prompts, pennant, reverb, horizon, telescope, pulse, octane, billing, pint, dusk, envoy, valet, facades, container, providers, middleware, rate-limiting, broadcasting, testing, deployment.

Source code (GitHub, read 2026-11-14):
- `laravel/installer` `master` `src/NewCommand.php`
- `laravel/laravel` `13.x`: `composer.json`, `package.json`, `bootstrap/app.php`, `routes/web.php`, `app/Models/User.php`, `.env.example`, repository tree
- `laravel/framework` `13.x`: `src/Illuminate/Foundation/DevCommands.php`, `Console/DevCommand.php`, `Console/ModelMakeCommand.php`, `Console/ApiInstallCommand.php`
- `filamentphp/filament` `5.x`: `packages/forms/src/Commands/FileGenerators/Concerns/CanGenerateModelForms.php`, `packages/tables/src/Commands/FileGenerators/Concerns/CanGenerateModelTables.php`, `packages/support/src/Commands/Concerns/CanReadModelSchemas.php`
- `laravel/wayfinder` `main` README; `laravel/ui` `4.x` README; `spatie/laravel-sluggable` `main` README and the latest release (6.0.0, 2026-11-13)

Third-party docs:
- Filament 5.x: <https://filamentphp.com/docs/5.x/introduction/installation>, `/introduction/version-support-policy`, `/resources/overview`, `/navigation/overview`, `/panel-configuration`
- Laravel Nova v5: <https://nova.laravel.com/docs/v5/installation>, `/resources/the-basics`
- Backpack 7.x: <https://backpackforlaravel.com/docs/7.x/installation>, `/crud-tutorial`

Secondary (context, criticism, dates):
- Laravel 12.x release notes on Breeze and Jetstream: <https://laravel.com/docs/12.x/releases>
- Laravel News 12.25.0 ("Copy as Markdown"): <https://laravel-news.com/laravel-12-25-0>
- Yahoo Finance / Fortune on the $57M Accel round: <https://sg.finance.yahoo.com/news/exclusive-laravel-raises-57-million-114408132.html>
- Rector blog on facades: <https://getrector.com/blog/laravel-facades-to-constructor-injection-replace-facade-aliases-with-full-classes-in-2-hours>
- freeCodeCamp critique: <https://www.freecodecamp.org/news/moving-away-from-magic-or-why-i-dont-want-to-use-laravel-anymore-2ce098c979bd/>
- DEV (LaravelFS): <https://dev.to/hichemtab-tech/laravel-12-removed-breeze-and-jetstream-from-the-installer-so-i-built-laravelfs-3beo>
- desarrollolibre on Breeze: <https://www.desarrollolibre.net/blog/laravel/why-kill-breeze-the-2-things-i-dont-like-about-the-laravel-framework>
