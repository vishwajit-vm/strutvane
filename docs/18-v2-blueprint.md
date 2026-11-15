# 18. Strutvane v2 blueprint: Laravel's flow, in TypeScript

> **Status: DRAFT for the project lead's approval (2026-11-14).** Nothing in the package repos changes until this is approved. Once approved, the decisions in §12 become ADRs, and every older document that conflicts with them is updated.
>
> **Evidence** (all in `docs/research/`, dated 2026-11-14): the Laravel ecosystem study, the Laravel-style JS frameworks study, the current-state audit, the auth study, the auto-admin UI design, the installer design and the package catalogue. Plus spike 10 (migration-first schema, 248 tests passing) and spikes 11–14 (ORM, MVC core, installer, auto CRUD UI), which are in progress.

## 1. Why v2

On 2026-11-14 the project lead built a demo app with v1 and had to fight it:
- the starter was only reachable through `@next`;
- pnpm blocked esbuild;
- there were five separate commands after `create`;
- the UI wasn't served by `dev`;
- Windows quoting broke field specs;
- seeders weren't registered, and identity was lost on every restart.

The audit's verdict is **"good code, wrong shape"**. About 59k lines of strict, tested and security-reviewed code is organised around five choices that make it hard to use:
1. the model file is the source of truth;
2. a registry compiler;
3. CRUD and UI rendered at runtime behind override levels;
4. 12 repos that may only talk through contracts;
5. `@next`-only releases.

v2 keeps the code that's good and replaces the shape with Laravel's.

## 2. The promise (the whole developer flow)

```text
npm create strutvane@latest my-app        ← asks questions, then installs, migrates, seeds, commits
cd my-app
npm run dev                               ← API + UI on http://localhost:3000, one port, hot reload

node strut make:migration create_posts_table --seeder
                                          ← writes the migration, the model, a factory and a seeder
  (edit database/migrations/…_create_posts_table.ts: add your columns)
node strut migrate                        ← migrates, seeds, generates types, the CRUD API, UI pages and the sidebar entry
```

That's it. You open the browser, and **Posts** is in the sidebar, with search, pagination, sorting, filters, create/edit forms, a detail page and slug URLs, behind sign-in and permissions.

### 2.1 `npm create strutvane@latest my-app`

The installer starts by asking **how much you want to decide**:

```text
? How do you want to set up acme-portal?
❯ Recommended   7 quick questions, sensible defaults for the rest
  Custom        Choose everything (about 35 questions, grouped)
```

Every question has a flag, so `--yes` (or CI, or no terminal) takes the defaults. A **review screen** lists every answer, the defaults included, with *Create / Change an answer / Cancel*. Answers are saved in `strutvane.json`, so `node strut install:<name>` later knows what you picked. Anything you skip is one command away later: every optional feature installs with `node strut install:<name>` through the same installer protocol.

**The full question list.** Questions marked ★ are asked in Recommended mode; the rest take their default unless you choose Custom.

| # | Group | Question | Choices (default **bold**) | Package it brings |
|---|---|---|---|---|
| 1 | Project | ★ Project name / folder | `[folder]` | — |
| 2 | App | ★ What are you building? | **Full app (API + admin UI)**, API only | — |
| 3 | App | ★ Design (full app only) | **Crisp**, Vivid (§5.1) | `@strutvane/design-*` |
| 4 | App | UI starter | **Admin screens from your models**, blank React app | `@strutvane/ui` |
| 5 | Sign-in | ★ How do people sign in? | **Email and password**, email link only (passwordless), no sign-in | `@strutvane/auth` |
| 6 | Sign-in | Extra sign-in security (multi-select) | **two-factor (authenticator app + recovery codes)**, **email verification**, passkeys, public registration (off by default) | `@strutvane/auth` |
| 7 | Sign-in | Social login (multi-select) | **none**, Google, Microsoft, GitHub, Apple | `@strutvane/social-login` |
| 8 | Sign-in | Enterprise SSO for your customers (SAML/OIDC + SCIM; needs teams) | **no**, yes | `@strutvane/sso` |
| 9 | Sign-in | API access for other apps | **personal access tokens**, OAuth 2.1 server, none | `@strutvane/auth` / `@strutvane/oauth-server` |
| 10 | Sign-in | Starting roles | **admin + member**, admin + manager + member + viewer | framework |
| 11 | Teams | ★ Teams / multi-tenancy (each customer company is a team) | **no**, yes | framework |
| 12 | Teams | How a request picks its team | **team switcher in the app**, subdomain (`acme.yourapp.com`) | framework |
| 13 | Data | ★ Database | **MySQL** (MariaDB detected automatically), PostgreSQL (pre-selected with teams), SQLite | framework |
| 14 | Data | ★ With Docker or without? | **with Docker** when Docker is installed and running, otherwise **without** (use your own server); never required | — |
| 15 | Data | ★ Connection details (without Docker, server DB: XAMPP, WAMP, MAMP, Laragon, a local install, remote or cloud) | host **127.0.0.1**, port **3306/5432**, database, user **root/postgres**, masked password (empty allowed locally, with a warning) → `.env` only; or one `DB_URL`; connection tested, database created if missing | — |
| 16 | Data | First admin account | email **admin@\<name\>.test**; password generated and shown once (or typed, masked) | — |
| 17 | Data | Sample data | **yes for the admin starter**, no | — |
| 18 | Infra | Cache, queue and sessions | **database (no extra service)**, Redis | `@strutvane/redis` |
| 19 | Infra | File storage | **local disk**, S3-compatible | `@strutvane/files` |
| 20 | Infra | Production mailer | **decide later** (dev uses the inbox/Mailpit), SMTP, Resend, Postmark, SES | framework |
| 21 | Infra | Language, time zone, currency | **en**, **detected time zone**, **USD** | framework |
| 22 | Features | Extra features (multi-select, grouped, popular first, type to search) | **log viewer** preselected; see below | one per pick |
| 23 | Quality | Tests | **Vitest**, Vitest + Playwright browser tests, none | `@strutvane/browser-testing` |
| 24 | Quality | ★ AI coding assistants (AGENTS.md, skills, local docs MCP) | **yes**, no | `@strutvane/agent-tools` |
| 25 | Workflow | Git: first commit, plus a GitHub Actions CI workflow | **git yes**, **CI yes** | — |
| 26 | Security | Security profile | **Standard**; Strict (2FA required for admins, breached-password check, 8-hour sessions, strict CSP, HSTS preload) | framework + auth |
| 27 | Security | Record who changed what (activity history on every record) | **yes for teams apps**, no | `@strutvane/activity-log` |
| 28 | AI | AI features inside your app | **no**; yes → provider: Anthropic, OpenAI, Google, local (Ollama). Keys go only into `.env`, typed later and never asked in the installer | `@strutvane/ai` |
| 29 | AI | Let AI agents use your app safely (MCP server, under your policies and tenancy) | **no**, yes | `@strutvane/mcp-server` |
| 30 | UI | Languages for the UI (multi-select) | **English**; add any | framework (i18n) |
| 31 | UI | Default appearance | **follow the system**, light, dark | design |
| 32 | UI | Installable app (PWA: home-screen icon, offline page) | **no**, yes | `@strutvane/ui` |
| 33 | UI | Live updates (tables refresh when others change data) | **no**, yes | `@strutvane/realtime` |
| 34 | Ops | Monitoring | **none**; OpenTelemetry export; plus a health page | `@strutvane/observability`, `@strutvane/health` |
| 35 | Ops | Where will you deploy? | **decide later**; any Node host (VPS, Railway, Render); **Docker image** (Kubernetes, Fly, Cloud Run, ECS). Writes a deploy recipe and the `/up` health route; "Docker image" also writes a committed, secure multi-stage `Dockerfile` + `.dockerignore` (non-root, no secrets, `HEALTHCHECK /up`; ADR-0021) | framework |
| 36 | Workflow | Editor setup (VS Code settings + recommended extensions, Biome format on save; optional **dev container** for Codespaces, committed; ADR-0021) | **yes**, no; dev container **no** | — |
| 37 | After | Start the dev server and open the browser now? | **yes**, no | — |

**Docker files (decided 2026-11-15, ADR-0021):** generated apps may commit a production `Dockerfile` and a `.devcontainer/`, but only when the developer picks them. The local Sail-style compose stays git-ignored, and Strutvane's own repos still never commit Docker files.

**Question 22, extra features,** never shows a flat list of every package; there will be 100+ (see §3.3). It shows:
- a short **popular** list, grouped: Operations (log viewer, queue dashboard, inspector, health), Data (charts and dashboards, search, import/export, API explorer), Back office (activity log, settings, media library, PDF, privacy, backups), Integrations (feature flags, webhooks, GraphQL, realtime, notification channels), Money (billing, invoicing), AI (AI SDK, MCP server);
- **type-to-search** across the whole official catalogue.

The list is read from the published catalogue index (§3.3), so it only ever offers packages that are published and compatible with the framework version being installed. Packages can add their **own follow-up questions** declaratively, as data rather than code, so nothing runs before install. Billing asking "Stripe or Paddle?" is an example.

**Sign-in details for question 5:**
- **Email and password** follows Fortify's model: password reset is always on, and the passwords table is a normal app migration.
- **Email link only:** passwordless magic links (single-use, 15 minutes, bound to the browser that asked), plus the same optional 2FA and passkeys.
- **No sign-in:** for internal tools behind a gateway. The generated API then requires an API token unless you opt out per route, which keeps deny-by-default intact.

**Database and Docker details (questions 13 and 14):**
- database: **MySQL by default** (decided by the project lead, 2026-11-14), or PostgreSQL or SQLite, whichever you pick. When **teams** is Yes, PostgreSQL is pre-selected because of row-level security; MySQL is still allowed. A `testing` database is created next to the dev one. **Any database server works, with or without Docker** (decided 2026-11-15), exactly as in Laravel:
  - your own MySQL or **MariaDB**, from XAMPP, WAMP, MAMP, Laragon or a normal install;
  - PostgreSQL, for example Postgres.app or a normal install;
  - a cloud or remote database.

  **Without Docker,** you enter the host, port, database name, user and password (masked; stored only in `.env`). The defaults suit local servers: `127.0.0.1`, port 3306 or 5432, user `root` or `postgres`. An empty password is accepted for a local server, with a warning.

  The installer then:
  - **tests the connection** and explains failures in plain words: "MySQL isn't running: start it in the XAMPP control panel", "Access denied for user root", "Unknown host", "Wrong port: MAMP uses 8889";
  - **creates the database** if it's missing and you have the rights to, or tells you the one SQL line to run;
  - **detects MariaDB vs MySQL** by itself.

  `DB_URL` (a full connection string), `DB_SOCKET` (Unix socket) and `DB_SSLMODE` / `DB_SSL_CA` (remote or cloud databases) are supported as in Laravel.

  **With Docker,** the installer starts the database container for you. If Docker isn't available, it offers, in this order: use your own database server (connection details as above), install or start Docker, or SQLite.

  **PostgreSQL without Docker:** row-level security needs an app role that isn't a superuser and has no `BYPASSRLS`. If your account may create roles, the installer creates `<app>_owner` and `<app>_app`. Otherwise it prints the exact SQL and warns clearly that connecting as a superuser turns RLS off. `security:check` repeats that warning until it's fixed.

  Choosing teams on MySQL gets a short note: isolation is enforced by the ORM's tenant scope, and PostgreSQL adds database-level row security on top;
- **With Docker or without Docker?** (decided 2026-11-14)
  - **With Docker,** everything runs inside containers, like Laravel Sail. The services are:
    - `app`: Node 24, with `npm run dev` serving API and UI on one port with hot reload;
    - the database: MySQL 8.4 by default, or PostgreSQL;
    - Mailpit: the dev inbox.

    `npm install`, `migrate` and `seed` all run inside the container. `node strut <command>` typed on the host is forwarded into the container automatically, like `sail artisan`. `node_modules` lives in a named volume, file watching works on Windows and macOS (WSL2 recommended on Windows), the container runs as your user on Linux, and ports are bound to 127.0.0.1. These local Docker files stay git-ignored (ADR-0006). A production `Dockerfile` or dev container is a separate, opt-in choice (questions 35 and 36, ADR-0021).
  - **Without Docker,** the app runs on your machine. SQLite needs nothing; for MySQL or PostgreSQL you give connection details.

It then does **everything**, with friendly progress output:
1. writes the project;
2. generates secrets into `.env` (never into `.env.example`);
3. picks free ports (and retries with fresh ones if a port is taken between the check and the start);
4. starts the database (`docker compose up -d --wait` from a git-ignored `docker/compose.yaml`) when Docker was chosen;
5. `npm ci` from the shipped lockfile (inside the container in Docker mode);
6. `migrate` with default seeding. This creates the first admin user; a generated password must be changed at first sign-in;
7. git init and a first commit;
8. offers to run `npm run dev`.

(Order decided in `spikes/CONSISTENCY-2026-11-15.md` #1, which is the source for every naming and default decision of 2026-11-15.)

When a step fails, it recovers:
- **Docker is missing or stopped:** it offers to use your own database server (XAMPP, a local install, or a remote server), to start Docker, to fall back to SQLite, or to retry.
- **Your database server can't be reached or refuses the login:** it explains why in plain words, lets you correct the details, and retries.
- **A port is taken:** it picks the next free one.

Your answers are saved in the committed `strutvane.json`, and progress is saved in the git-ignored `.strutvane/local/setup.json`. `npm run setup` resumes from the failed step, and it also works on a fresh clone for a teammate, using only `strutvane.json`. Exit codes: `0` success, `1` nothing was created, `2` created but setup incomplete, `130` cancelled.

### 2.2 `node strut <command>`: the project CLI (our `php artisan`)

`strut.js` lives in the project root and is run with `node`. It works the same in PowerShell, cmd, bash and zsh: there's no `.cmd`/`.ps1` wrapper, no execution-policy block, no `--` rule and no alias clash (`sv` is a built-in PowerShell alias). `npx strutvane <command>` works too.

Command vocabulary copied from artisan:
- **Make:** `make:migration`, `make:model` (`-m -f -s -c -a`), `make:controller --resource`, `make:policy`, `make:request`, `make:seeder`, `make:factory`.
- **Database:** `migrate`, `migrate:fresh --seed`, `migrate:rollback`, `migrate:status`, `db:seed`.
- **Inspect:** `route:list`, `about`, `doctor`, `model:show`, `repl` (tinker). Inspect commands accept `--json`.
- **Packages:** `install:<package>`.
- **Docker services:** `services:up`, `services:down`, `services:logs`, `db:shell`, plus Sail-style pass-throughs `shell` (a shell inside the app container), `npm <args>`, `npx <args>` and `node <args>`. They run in the container in Docker mode and on the host otherwise.
- **Maintenance mode:** `down` (`--secret`, `--retry`, `--refresh`, `--render`) and `up`, exactly as in Laravel.
- **Caches and optimisation** (like artisan's `optimize` family):

  | Command | Clears or builds |
  |---|---|
  | `optimize` / `optimize:clear` | every production cache below, in one go |
  | `config:cache` / `config:clear` | the merged config snapshot |
  | `route:cache` / `route:clear` | the compiled route table |
  | `event:cache` / `event:clear` / `event:list` | discovered listeners |
  | `cache:clear [--store=redis]` / `cache:forget <key>` | the application cache |
  | `ui:clear` | Vite's dev cache and the built UI assets |
  | `sync` | regenerates everything in `.strutvane/` (types, resources, UI, plus the outputs of installed packages such as charts) from the migrations |
  | `queue:restart` / `queue:clear` / `queue:retry <id\|all>` / `queue:flush` | workers and jobs |
  | `schedule:list` / `schedule:run` / `schedule:work` | the scheduler |
  | `log:clear` | local log files |
  | `storage:link` / `storage:prune-temp` | the public disk link and stale uploads |

- **Security commands:**
  - `key:generate` and `key:rotate` (the old key moves to `APP_PREVIOUS_KEYS`, so existing cookies and encrypted values keep working);
  - `env:encrypt` / `env:decrypt` for committing an encrypted `.env.production`;
  - `session:flush` and `token:revoke --all`, which sign everyone out after an incident;
  - `security:check`, which flags debug on in production, a missing key, non-HTTPS `APP_URL`, insecure cookies, CORS `*` with credentials, a weak CSP, `npm audit` highs, and exposed `/_strutvane/*` tools.

**Docker mode runs everything in the container** (decided 2026-11-14, re-confirmed 2026-11-15). This happens only when you chose Docker:
- The API, the React UI dev server (Vite), queue workers, the scheduler, `migrate`, `npm install` and every other `node strut` command run inside the `app` container.
- `npm run dev` on the host is `node strut dev`, which is forwarded into the container. On the host, Node only runs the small `strut.js` forwarder. Everything else (npm packages, the build, the database) lives in the containers.
- Without Docker, the same commands run on your machine.

Run with no arguments, `make:*` commands ask interactively.

### 2.3 `make:migration create_posts_table --seeder`

The name is parsed as in Laravel: `create_x_table` creates a table, `add_y_to_x_table` alters one, anything else gets a blank stub. It **always** writes the model (`app/models/post.ts`) when it creates a table. `--seeder` adds a seeder and a factory, and registers the seeder in `database/seeders/database.seeder.ts` (file names follow `post.seeder.ts`, `post.factory.ts`, `post.policy.ts`; decided 2026-11-14), after the seeders of any parent tables.

The migration is TypeScript with Laravel's Schema builder (proven in spike 10):

```ts
export default migration({
  up(schema) {
    schema.create('posts', (t) => {
      t.id()
      t.string('title', 200)
      t.slug('slug').from('title')
      t.text('body').nullable()
      t.decimal('price', 12, 2).default(0)
      t.enum('status', ['draft', 'published']).default('draft')
      t.foreignId('author_id').constrained('users')
      t.timestamps()
      t.softDeletes()
    })
  },
  down(schema) {
    schema.drop('posts')
  },
})
```

Columns go **only** in migrations, the source of truth, as in Laravel. You never type them on the command line, so the Windows quoting problem is gone.

### 2.4 `node strut migrate`

In order:
1. **Apply pending migrations.**
   - **PostgreSQL and SQLite:** each migration runs in a transaction, so a failure leaves nothing behind.
   - **MySQL:** schema changes auto-commit, so `migrate` reports progress for each operation. When a migration fails partway, it states exactly what was applied and how to recover.
   - **Pre-flight safety lint:** flags NOT NULL without a default on a non-empty table, a drop that looks like a rename, and a dropped column still used in `resources/ui`.
   - **Flags:** `--pretend` prints the SQL; `--step` applies one migration at a time.
2. **Regenerate types and metadata** by replaying every migration in memory (spike 10: about 50 ms for 100 tables, no database needed). This writes `.strutvane/types/models.d.ts` (`Post`, `NewPost`, `PostPatch`, `PostJson`) and `.strutvane/resources.json` (labels, searchable, sortable and filterable fields, relations, slug source, sidebar order). The same recorded operations produce the SQL, so the types, the database and the UI cannot drift apart.
3. **Seed.**
   - In development, seeders that haven't run yet and aren't empty run once. They're tracked in a `seeders` table, so they never run twice.
   - `--seed` runs them again on purpose.
   - In production nothing is seeded unless you pass `--seed --force`.
4. **Generate the CRUD API.** Every table with a model gets an API resource (§5), registered through a machine-owned `routes/resources.gen.ts` that `routes/api.ts` imports. Opt out per model, or replace it with your own controller (`make:controller PostController --resource`).
5. **If the project has a UI:** run `ui:sync`, which regenerates the machine-owned `.strutvane/ui.gen.ts` and, **for new tables only**, writes owned files `resources/ui/posts.ui.ts` with `columns: auto()` and `form: auto()`. Sidebar entries appear for every resource the user may `viewAny`.

Files you own are **never overwritten**:
- `auto()` keeps picking up new columns.
- An explicit column list is reported on, not rewritten.
- A dropped column that your code still uses becomes a TypeScript error.

## 3. Architecture: MVC, monolithic, like Laravel

### 3.1 App layout (generated by `create`)

```text
my-app/
  app/
    http/controllers/      post.controller.ts (optional; resources work without one)
    http/middleware/
    http/requests/         form requests (validation)
    models/                post.ts: class Post extends Model('posts') { author() { return this.belongsTo(User) } }
    policies/              post.policy.ts (auto-discovered by name; deny by default)
    providers/
  bootstrap/app.ts         Application.configure(...).withRouting(...).withMiddleware(...).create()
  bootstrap/providers.ts
  config/*.ts              typed config, validated .env
  database/migrations/ seeders/ factories/
  resources/ui/            owned UI customisations (posts.ui.ts, pages, components)
  routes/web.ts  routes/api.ts  routes/resources.gen.ts
  storage/  tests/
  strut.js                 node strut <command>
  .strutvane/              generated (types, resources.json, ui.gen.ts, client.gen.ts, zod schemas) — COMMITTED, so a fresh clone type-checks; CI fails when it is stale
  docker/compose.yaml      local only, git-ignored (ADR-0006)
```

### 3.2 Repository and packages (organised like Laravel's GitHub org; decided 2026-11-14)

Everything lives in the GitHub org **`vishwajit-vm`**, one repo per role, exactly like Laravel:

| Laravel | Strutvane repo | npm package |
|---|---|---|
| `laravel/framework` | `strutvane-framework` (absorbs today's core, contracts, cli and devkit, with history) | `@strutvane/framework` (bin `strutvane`) |
| `laravel/laravel` | `strutvane-skeleton` (new) | — (the app template the installer uses) |
| `laravel/installer` | `create-strutvane` | `create-strutvane` |
| `laravel/docs` | `strutvane-docs` (one branch per version) | — |
| Fortify + Sanctum | `strutvane-auth` | `@strutvane/auth` |
| Filament / Nova | `strutvane-ui` | `@strutvane/ui` (behaviour; no look of its own) |
| (starter-kit looks) | `strutvane-design-crisp` (default), `strutvane-design-vivid` | `@strutvane/design-crisp`, `@strutvane/design-vivid` (§5.1) |
| Horizon, Telescope, Cashier, Scout, Socialite… | `strutvane-log-viewer` (from today's logs), `strutvane-files`, later one repo per add-on | `@strutvane/<name>` |
| (governance) | `strutvane`: the ecosystem hub (blueprint, ADRs, RFCs, roadmap, spikes, package index) | — |

- **Add-ons depend on the published `@strutvane/framework`** from npm, never on local links in committed code. For changing several repos at once, contributors use a dev-only umbrella workspace (`scripts/setup-workspace.mjs`, npm workspaces linking sibling clones, never committed), like Laravel's composer path repositories.
- **Archived** (read-only, never deleted) once their code has moved: `strutvane-core`, `strutvane-contracts`, `strutvane-cli`, `strutvane-devkit`.

The original monorepo plan below is superseded by this table:

- ~~**One monorepo** (`vishwajit-vm/strutvane`) using **npm workspaces**, replacing the 12 repos.~~
- **`@strutvane/framework`** is the equivalent of `laravel/framework`, with bin `strutvane`. It covers:
  - the container and providers;
  - config and env;
  - routing, controllers and middleware;
  - validation;
  - the **ORM** (§4), migrations, seeders and factories;
  - the error page;
  - logging (pipeline and redaction);
  - events, cache, the queue core, the mail core, notifications, the scheduler, storage and the HTTP client;
  - i18n, encryption and hashing;
  - **authorization** (policies compiled to SQL), **tenancy** (Postgres RLS) and audit;
  - the `node strut` command registry.
- **First-party packages** depend only on the framework, as a peer, and install with `node strut install:<x>`:
  - **Phase 1:** `auth` (Fortify + Sanctum: sign-in features, tokens, 2FA, passkeys, teams, owned screens), `ui` (React kit plus the auto CRUD admin and sidebar), `create-strutvane`, `strutvane` (a small `npx` guard) and `log-viewer`.
  - **Later:** files, redis, queue-dashboard, inspector, observability, search, import-export, agent-tools, social-login, sso, oauth-server, mcp-server, feature-flags, webhooks, billing, realtime, notification-channels, dashboards, ai, workflows, browser-testing, backup. See the package catalogue.
- **All catalogue packages will be built** (project lead, 2026-11-14). No package is dropped. The master list is `docs/research/2026-11-14-package-checklist.md`: the 28 above plus the catalogue v2 additions, such as `charts` and `graphql`.
- **Merged into framework:** contracts, core, cli, devkit, and the logs pipeline (the viewer becomes `log-viewer`). Old npm names get `npm deprecate` with a pointer.
- **Retired** (marked obsolete, never deleted): the registry compiler, the CLI field-spec parser, the three-way merge engine and `upgrade`, the separate launcher and release-channel logic, polyrepo sync tooling, and Better Auth as the default engine.

### 3.3 Built for 100+ packages (decided 2026-11-15)

The project lead expects **more than 100 packages** over time. Everything that touches "the list of packages" is therefore data-driven, and nothing hard-codes a package name:

1. **One package manifest.** Every package declares a `strutvane` block in its `package.json`:
   - id, display name and one-line description;
   - category and tags;
   - the framework range it supports;
   - what it installs (config, `.env` keys, migrations, routes, screens, sidebar entries);
   - its optional **declarative** installer questions;
   - its docs URL.
   No code runs to read it.
2. **One catalogue index.** CI in the hub builds `catalogue.json` from the published manifests. The installer, `node strut install`, the docs site's package pages and the agent tools all read this one file, so a new package appears everywhere without code changes.
3. **One way in.** `node strut install:<name>`, `node strut add` (an interactive picker with search) and installer question 22 all run the same installer protocol. Install order never changes the result (ECOSYSTEM rule 3).
4. **One conformance kit per kind of package**, run in each package's CI before it can be listed:
   - every package passes the installer-protocol test, the security attack kit for its surface, and a type-check against the current framework;
   - designs also pass `designConformance()`.
5. **Versioning that scales:**
   - the **core train** moves in lockstep before 1.0: framework, auth, ui, the first-party designs, create-strutvane and skeleton;
   - **add-ons** release on their own semver with a peer range on the framework (`^0.N`), and the catalogue records which add-on versions work with which framework line.
   This refines ADR-0020's "everything in lockstep", which doesn't scale to 100 repos.
6. **Repos at scale:**
   - every repo is generated by the `new-package-repo` skill;
   - shared configs and CI stay synced from `strutvane-tooling` with a drift check;
   - a nightly hub job installs every package against the framework's `main` and reports breakage before a release.
7. **Community packages** use `strutvane-<name>`, read the same manifest, and get a "verified" badge in the catalogue once they pass the kits.

## 4. The Strutvane ORM (Eloquent for TypeScript)

*(Final details come from spike 11, in progress.)*

- **Models are classes in `app/models`.** Columns come from the generated types and are never redeclared. The whole model can be one line: `class Post extends Model('posts') {}`.
- **A fully typed fluent query builder:** `Post.query().published().with('author').withCount('tags').orderBy('created_at', 'desc').paginate(25)`. Columns keep their migration names (snake_case), as in Laravel. A wrong column, value, enum value, relation or non-fillable field is a compile error.
- **Built in-house, like Laravel's Builder → Grammar → Connection** (spike 11, 184 tests on real MySQL 8.4, PGlite and SQLite). It doesn't use Kysely or Drizzle at runtime, because the tenant check must inspect our own query tree before any SQL is produced. This supersedes ADR-0004.
- **Example model:** options that affect types go in `Model()`, behaviour goes in the class:
  ```ts
  export class Post extends Model('posts', { fillable: ['title', 'body', 'status'], casts: { meta: json<PostMeta>() } }) {
    static scopes = { published: (q) => q.where('status', 'published') } satisfies Scopes<'posts'>
    author() { return this.belongsTo(User, 'author_id') }
  }
  ```
- **Relationships:** `belongsTo`, `hasOne`, `hasMany`, `belongsToMany` (pivot), `hasManyThrough` and polymorphic, with eager loading via `with()` (no N+1 queries), `withCount` and `whereHas`.
- **Model features:**
  - casts and accessors;
  - mass-assignment protection, denying unknown fields by default;
  - timestamps and soft deletes;
  - events and observers;
  - local and global scopes;
  - slugs;
  - UUID, ULID and increment keys;
  - transactions with nested savepoints and optimistic locking;
  - chunking and cursor streaming;
  - pagination (offset with totals, and cursor);
  - serialization with hidden fields, and API resources.
- **Factories and seeders:** `Post.factory().count(10).for(user).create()`.
- **Security built in:**
  - the tenant scope is a global scope backed by Postgres RLS (ADR-0007);
  - policy row filters are composable scopes (ADR-0008/0017);
  - only bound parameters, so SQL injection is impossible by construction.
- **Engines:**
  - **MySQL 8.4+** is the default, and first-class from phase 1, tested against real MySQL in CI.
  - **PostgreSQL** supports row-level security on top of the tenant scope.
  - **SQLite** is for quick starts.
  - **PGlite and SQLite** are for fast tests.
- **Tenancy per engine:** the ORM's global tenant scope always applies. On PostgreSQL, RLS (ADR-0007) adds database-enforced isolation. On MySQL and SQLite, the scope plus attack-style isolation tests are the guarantee, and this is documented clearly.

## 5. Standards (generated API and UI)

| Topic | Standard |
|---|---|
| **REST** | `Route.resource` (7 actions) and `Route.apiResource` (5); route model binding by id or **slug** (`{post:slug}`); 404 when missing |
| **Errors** | RFC 9457 problem+json with a stable `code`; 422 carries field `issues` |
| **Pagination** | UI: numbered pages, 25 per page (10/25/50/100), total capped at 10,000. API: page-number and cursor modes; maximum 100 per page; deterministic order |
| **Search** | `?search=` across text-like fields and the title field (at most 10), case-insensitive. AND between words, OR across columns. An id or UUID also matches exactly. Numbers and dates go through filters. Only fields the viewer may see are searched. Postgres uses trigram indexes; long text is opt-in full-text |
| **Query params** | `filter[field]=v`, `filter[field][op]=v`, `sort=-createdAt,title`, `include=author`, `fields[posts]=title,slug`, `filter[trashed]=with\|only` |
| **High-level API** | `/options` (for selects), `/count`, `/aggregate` (group by), CSV export (formula-safe, 10,000 rows), bulk actions (100 ids, each checked against policy, all or nothing), batch create, nested relation lists, global `/search`, ETag/If-Match conflict protection |
| **Slugs** | `t.slug('slug').from('title')`; unique per table, or per tenant with teams (soft-deleted rows count); `-2`, `-3` suffixes; set on create and stable afterwards; reserved-word and id-like guard |
| **Sidebar** | One entry per resource, with plural label, icon, group, order and badge; hidden without `viewAny` |
| **UI conveniences** | Defined in `DESIGN.md` → "UX conveniences", with priorities P0–P2. Covers: back button with restored list state; breadcrumbs; deep links; Ctrl/Cmd+K command palette; keyboard shortcuts (`?` for help); next and previous record; sticky headers; column show/hide, resize and reorder; density toggle; filter chips; saved views; quick-view drawer; inline edit; "Save and add another"; duplicate; unsaved-changes guard; autosaved drafts; undo delete; type-to-confirm; optimistic updates; retry; offline and session-expiry notices; created/updated by; activity history; related counts; contextual docs links; first-run tour |
| **Security** | Deny by default: generated policies allow only the admin role until you edit them; registration is off and new users get no roles. Unknown input fields are rejected, and writes accept only fillable columns. Columns marked `.secret()`/`.hidden()`, plus names caught by the shared redaction matcher, are never serialised, searched, sorted or shown. **Internal tables never get an auto API or UI:** sessions, jobs, cache, password reset and access tokens, roles and memberships, audit, migrations and seeders. Export and bulk endpoints are opt-in per resource. CSRF uses a token or same-origin check on every cookie-authenticated write. MySQL uses binary collations for security-relevant comparisons and strict `sql_mode`. Migration replay runs sandboxed. See `docs/research/2026-11-14-v2-security-design-review.md` §4 (25 release-blocking items). |
| **Dev** | `npm run dev` runs API + UI + extra processes registered by packages (like `php artisan dev`); a friendly error page with "Copy as Markdown for AI" |
| **Typed end to end** | Migrations produce a Zod schema per table, used for server validation and live form validation; a typed route registry produces `.strutvane/client.gen.ts` (used by the generated UI) and OpenAPI |
| **Errors catalogue** | Every problem `code` has a fix line and a docs page (`/docs/errors/<code>`). CLI errors follow "what happened / why / fix / docs". In development, a 403 explains which policy rule denied the request |
| **Testing kit** | A transaction per test; a test database per worker on the app's own engine; `actingAs`, `asTenant`, HTTP assertions, `Mail.fake`; generated feature tests and cross-tenant attack tests for every resource; CI on real MySQL and PostgreSQL |
| **Production** | `build/server.js`, a `/up` health route, graceful shutdown, `migrate --isolated`, JSON logs, one deploy recipe |
| **Runtime** | Node `>=24.3` (earlier 24.x releases break arguments in PowerShell) |

### 5.1 UI designs: pick a look now, swap it later (decided 2026-11-15)

The admin UI is split into **what it does** and **what it looks like**:

- **`@strutvane/ui`** holds the behaviour: the auto CRUD screens, tables, forms, filters, the sidebar registry, the command palette, shortcuts, every UX convenience, and accessibility. Charts are the separate `@strutvane/charts` package. It has no colours or layout chrome of its own.
- **A design package** holds the look:
  - tokens for light and dark (colour, type, spacing, radius, shadow, density);
  - fonts;
  - the shell (sidebar, top bar, auth layout);
  - component skins and the chart palette;
  - empty-state illustrations;
  - its own `DESIGN.md`.

Two first-party designs at launch. Each is named with one short word describing its feel, so people choose by look:

| Design | Package | Feel | Good for | Mockup |
|---|---|---|---|---|
| **Crisp** (default) | `@strutvane/design-crisp` | clean, minimal, quiet colours, dense readable tables, business-first | back office, ERP, finance, B2B SaaS admin | spike 19 |
| **Vivid** | `@strutvane/design-vivid` | colourful, soft-shadow cards, gradient charts, roomier spacing | analytics, customer-facing dashboards, product consoles | spike 17 |

**Installer** (full stack only; flag `--design crisp|vivid`; `--yes` picks Crisp):

```text
? Which design should your app use?
❯ Crisp   Clean, minimal and business-first (recommended)
  Vivid   Colourful, modern dashboards
```

**How it works:**
1. The installer adds the chosen package to `dependencies` and writes `config/ui.ts` (`design: 'crisp'`).
2. It also writes an owned `resources/ui/theme.css` for your own overrides: brand colour, font and radius.
3. To switch later, run `node strut design:use vivid`. It installs the package and updates the config. Screens don't change, because they only use `@strutvane/ui` components.
4. To take full control, run `node strut design:eject`. It copies the design's source into `resources/ui/design/` (level L3).

**Contract.** `@strutvane/ui` exports `defineDesign()` and a conformance test kit, `designConformance()`. Every design, first-party or community, must pass it:
- every slot is provided;
- every token pair meets WCAG AA in both themes;
- there are no hard-coded colours;
- axe finds 0 violations on the reference screens;
- there is no horizontal scroll at 375 px.

**More designs later.** First-party designs are named `@strutvane/design-<name>`, and community designs `strutvane-design-<name>`. They appear in the installer once they pass conformance. The shelved Glass direction (spike 18) is the first candidate.

This replaces the earlier "theme styles (Classic, Glass, Soft)" idea. Each design has light and dark modes and an accent colour of its own.

### 5.2 Security features (framework, on by default; decided 2026-11-15)

**Principle:** safe without doing anything, and easy to adjust in whichever style you like. Every protection is on by default, can be applied or skipped per route, group or controller, and can be called as a plain function. Opting out is always explicit and visible in `route:list --security`.

**CSRF, as an example of the "many ways" rule.** Every unsafe request (POST, PUT, PATCH, DELETE) that rides on a session cookie must prove it came from your own pages: same-origin `Sec-Fetch-Site`, an exact `Origin`, or a session-bound token. Otherwise it gets a 419 "Page expired". Bearer-token API calls skip the check, because browsers never attach those by themselves. Ways to use it:

| Style | Code |
|---|---|
| Default (nothing to write) | on for the `web` and `api` groups; a plain form post without a token is rejected |
| App-wide exceptions (Laravel 11 style) | `.withMiddleware(m => m.validateCsrfTokens({ except: ['webhooks/*'] }))` in `bootstrap/app.ts` |
| One route | `Route.post('/import', ImportController).middleware('csrf')` / `.withoutMiddleware('csrf')` |
| A group | `Route.middleware('csrf').group(() => { … })` (an array of route definitions is also accepted) |
| A controller | `static middleware = [csrf()]` or `static middleware = [csrf({ except: ['callback'] })]` |
| A plain handler function | `export default withCsrf(async (ctx) => { … })` |
| Imperative call | `await csrf.verify(ctx)` and `csrf.token(ctx)` |
| Front end | `@strutvane/ui` forms and the generated API client send `X-XSRF-TOKEN` automatically; plain HTML forms use `<CsrfField />` or `csrf_field()`; server pages get a `<meta name="csrf-token">` |
| Tests | `actingAs(user).withoutCsrf()` is allowed only in tests; there is also an assertion that a route rejects requests without a token |

The same pattern of default, `bootstrap/app.ts`, route, group, controller, wrapper function and imperative call applies to `auth`, `can`, `throttle`, `signed`, `verified`, `password.confirm` and `idempotent`.

**Decorators** (`@csrf()` on a controller method) aren't offered for now. The engineering standard bans decorators. Node's built-in TypeScript type-stripping can't run them, so they would need a build step in development. They also hide behaviour from `route:list`. Allowing them as optional sugar needs an ADR from the project lead.

**The full list, all built into the framework:**

| Area | Protection (default) |
|---|---|
| Requests | CSRF (above); trusted hosts (Host header allowlist); trusted proxies (`X-Forwarded-*` only from configured proxies); body size, JSON depth and field count limits; prototype-pollution-safe JSON parsing; request timeouts |
| Responses | security headers on every response: CSP with per-request nonces (`script-src 'nonce-…'`), HSTS (production), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`, COOP/CORP, `frame-ancestors 'none'` (clickjacking); CSP violation reports to the log |
| CORS | off by default; an allowlist per origin; never `*` with credentials (refused at boot) |
| Sessions and cookies | `HttpOnly`, `Secure` (production), `SameSite=Lax`, `__Host-` prefix; encrypted cookies; id rotation on login and privilege change; idle and absolute timeouts; "sign out other sessions" |
| Rate limiting | `throttle` middleware with named limiters (`api`, `login`, `password-reset`, `aggregate`); per-IP and per-user keys; `Retry-After` headers; lockout events |
| Validation | Zod schemas from migrations; unknown fields rejected; mass assignment only through `fillable`; ReDoS-safe built-in rules; `Password.min(12).mixedCase().uncompromised()` rules |
| Authorization | deny by default; policies compiled to SQL; `can` middleware and `authorize()` in controllers; a dev-only "why was this denied" explanation |
| Tenancy | the ORM tenant scope everywhere, plus PostgreSQL RLS (ADR-0007); cross-tenant attack tests generated per resource |
| Data | parameterised SQL only (the ORM has no string-concatenated raw SQL without `sql\`…\`` tagged templates); `encrypt()`/`decrypt()` (AES-256-GCM) with key rotation; `.secret()` and `.hidden()` columns never serialised; encrypted casts |
| Output | React escaping; a `sanitizeHtml()` helper and a rich-text cast that sanitises on write; CSV formula-injection guard on exports; safe `Content-Disposition` for downloads |
| URLs and redirects | signed and temporary signed URLs (`signed` middleware); open-redirect guard (`redirect().intended()` only to same-origin paths) |
| Outgoing HTTP | the HTTP client blocks private, loopback and metadata IP ranges by default (SSRF guard), with timeouts and a response size cap; webhook signatures (HMAC) for sending and verifying |
| Files | uploads checked by magic bytes, not the extension; size and type limits; random stored names; path traversal and zip-slip guards; an optional virus scan hook |
| Secrets and logs | secrets only in `.env` (never in `.env.example`); `env:encrypt`; log redaction of tokens, passwords, keys and cookies; log-injection-safe formatting; debug page impossible in production (boot refuses `APP_DEBUG=true` with `APP_ENV=production` unless forced) |
| Abuse | honeypot and a CAPTCHA hook for public forms; idempotency keys (`idempotent` middleware) for payments and imports; account lockout with backoff |
| Auth (package) | 2FA, passkeys, email-link sign-in, password confirmation, token abilities and expiry, impersonation audit (§6) |
| Supply chain | `ignore-scripts` with an allowlist; lockfile shipped; `npm audit` in `doctor` and CI; provenance on publish |
| Operations | `security:check`; `session:flush`; `key:rotate`; maintenance-mode secret bypass; audit log of security events (sign-ins, role changes, token creation, policy bypasses) |

Every protection ships with attack-style tests in the framework. The generated app gets a security test suite per resource (CSRF, tenancy, mass assignment, enumeration).

### 5.3 Logging (in the framework, like Laravel; ADR-0022, 2026-11-15)

Logging is part of `@strutvane/framework`. The separate `@strutvane/log-viewer` package only adds the screen.

```dotenv
LOG_CHANNEL=stack        # single | daily | stack | stderr | stdout | slack | null | any channel you define
LOG_STACK=daily          # channels the stack writes to, comma-separated (e.g. daily,slack)
LOG_LEVEL=debug          # emergency alert critical error warning notice info debug
LOG_DAILY_DAYS=14        # how many days of daily files to keep
LOG_FORMAT=line          # line (readable, like Laravel) | json (one JSON object per line)
LOG_MAX_FILE_SIZE=100mb  # a new part file starts after this size
LOG_PATH=storage/logs    # where log files go
LOG_SLACK_WEBHOOK_URL=   # for the slack channel (critical and above)
LOG_DEPRECATIONS_CHANNEL=null  # where deprecation warnings go
```

- **`single`** writes `storage/logs/strutvane.log`. **`daily`** writes `storage/logs/strutvane-2026-11-15.log` and deletes files older than `LOG_DAILY_DAYS`.
- Extra processes (queue worker, scheduler) write their own file next to it (`…worker-2.log`), so files never corrupt. The viewer and `log:tail` merge them.
- `config/logging.ts` defines channels. You can add your own, such as a `payments` channel with its own file.
- In code you can use `Log.info()`, `Log.channel('payments').warning()`, `Log.stack(['daily', 'slack']).critical()` and `Log.withContext({ orderId })`. Request id, user and tenant are attached automatically. Secrets are always redacted.
- Commands: `log:tail`, `log:list`, `log:clear`.
- The production Dockerfile sets `LOG_CHANNEL=stderr` and `LOG_FORMAT=json`.

## 6. Auth (Laravel's Fortify + Sanctum, built in)

- **Features list:** `config/auth.ts` has a `features` list, written by the installer, with these exact names used everywhere: `registration`, `emailVerification`, `passwordReset` (always on), `passwordConfirmation`, `twoFactor`, `passkeys`, `emailLink`, `apiTokens`, `teams`, `impersonation`. Feature switches live in config, not in `.env`; `APP_KEY` is the only root secret.
- **Routes:** standard `/login`, `/register`, `/forgot-password` and so on, accepting JSON and form posts with CSRF. The screens are owned by your app.
- **Sessions and tokens:** cookie session for the first-party UI. Personal access tokens with abilities for APIs, stored hashed with SHA-256.
- **Tables are ordinary migrations in the app,** applied by `migrate`. There's no separate auth migration step, and a real `users` model is generated.
- **Policies:** one class per model in `app/policies`, auto-discovered. Methods return a boolean or a row predicate, so one rule checks a single record and also filters lists in SQL.
- **Kept from v1:** the rate limiter (per IP and per account), origin and CSRF checks, the role map, RLS teams, audit, and the identity contract tests.
- **Add-ons:** `social-login` (Socialite), `oauth-server` (Passport) and `sso`.

## 7. Tooling

- **npm only:** for generated apps, docs and the framework's own repo. npm workspaces replace pnpm. Dependency install scripts run through an explicit allowlist: `ignore-scripts` plus a rebuild list, replacing pnpm's `allowBuilds`.
- **TypeScript strict, ESM, Node 24+.** Biome, Vitest, tsdown.
- **Code standard:**
  - every export has a friendly TSDoc block (what, why, an example);
  - comments explain the *why*;
  - small functions;
  - friendly error messages that say how to fix the problem;
  - tests for every behaviour, including type-level tests and attack-style security tests.

## 8. Releases and versioning (proposed ADR-0020, like Laravel)

- **Version numbers:**
  - before 1.0, a new `0.N.0` line may break things and `0.N.z` never does;
  - from 1.0, plain semver with one major release a year.
- **Support table** (`versions.json` on `main` is the single source of truth):
  - before 1.0, the newest line gets bug and security fixes, and the previous line gets security fixes for 6 months;
  - from 1.0, each major gets bug fixes for 18 months and security fixes for 24 months, Laravel's exact policy.
- **Branches:**
  - `main` is the next line;
  - every released line gets a permanent `0.N.x` / `N.x` branch;
  - fixes land on the oldest affected line and are merged up;
  - end-of-life branches are locked, never deleted.
- **Tags and dist-tags:**
  - one train tag `vX.Y.Z`; before 1.0 every package releases together;
  - npm dist-tag `latest` is the current line, `latest-0.2` and so on mark older maintained lines, and `next` carries previews.
- **Docs:** each branch is built at `/docs/<branch>/` (e.g. `/docs/0.2.x/installation`, later `/docs/1.x/…`), and `/docs/` points to the current line. Old versions stay online with a banner.
- **Deprecations:** a warning in one line, removal no earlier than the next breaking line. Every release gets an upgrade guide with impact ratings, like Laravel's.
- **Starter version:** `npm create strutvane@0.2` creates a 0.2 app.
- **Before 1.0,** all packages move in lockstep as **plain `0.x` versions on `latest`**, so `npm create strutvane@latest` just works. This amends ADR-0016.
- **Publishing stays staged with 2FA approval** (ADR-0018). Trusted publishers are re-pointed to the monorepo. The release script treats "already staged / previously published" (npm 409) as a skip.

## 9. What we keep from v1 (moved, with their tests)

HTTP hardening; RLS tenancy and `tenancyAudit`; the policy→SQL compiler and NULL-safe semantics; the problem+json error model and message catalogues; the logging pipeline and redaction; streaming uploads; the migration runner and its locks; native identity hardening and the contract test kit; the starter's prompt mechanics; spike 10's schema replay, types, SQL and CRUD; and all test suites.

## 10. Phases

| Phase | Delivers | Rough size |
|---|---|---|
| **0 Consolidate** | Fold core, contracts, cli, devkit and the logs pipeline into `strutvane-framework` (recipe: `docs/research/2026-11-14-monorepo-dryrun.md` §6); all existing tests green; no behaviour change | 1–2 weeks |
| **1 The full flow (0.2.0)** | Framework core (MVC, routing, controllers, validation, error page), ORM, migration-first schema, `migrate` → API + UI + sidebar, auth (Fortify + Sanctum: email/password, email link, verification, reset, 2FA, passkeys, tokens, teams), **a minimal mail core (SMTP plus a dev inbox at `/_strutvane/mail`), needed for password reset and email verification**, ui + **design-crisp + design-vivid**, the one-command installer with the full question list (§2.1), the catalogue manifest and index (§3.3), log-viewer, the testing kit, `doctor`, versioned docs; Northwind Ops rebuilt as the acceptance test | the main work |
| **2 Background work (0.3)** | Queue, mail drivers, notifications (+ the bell), scheduler, cache, redis, queue-dashboard, **social-login and agent-tools (moved up: the installer asks about them)** | |
| **3 Data and ops → 1.0** | Files, search, import-export, inspector, observability, health, charts, dashboards; external security audit | |
| **4–8** | As in the package catalogue v2 §5.1: back-office essentials; identity and integration; money, realtime and collaboration; content, AI and automation; demand-driven | |

**Priority rule.** Build in this order, and within a phase in this order:
1. what every app needs on day one (framework, auth, ui, installer);
2. what the installer asks about;
3. what a B2B back office asks for in its first week;
4. what the first enterprise sale asks for.

The installer only offers a package once it's published (§3.3), so the question list grows release by release without changing.

While npm is suspended (until 2026-11-17 08:35 UTC), phases 0 and 1 proceed locally. Nothing is published until phase 1 passes its acceptance test.

## 11. Decisions taken by the project lead (2026-11-14)

1. **CLI:** `node strut <command>`, with `npx strutvane` as an alias.
2. **Default database:** MySQL. The user can choose PostgreSQL or SQLite in the installer. MySQL moves into phase 1 as a first-class engine.
3. **UI stack for phase 1:** React only (React 19 + Vite + Tailwind + shadcn-style components the app owns). Other stacks can come later.
4. **Repository** (revised 2026-11-14): Laravel-style repos in the org `vishwajit-vm`, as listed in §3.2. There is no single monorepo; the hub stays the ecosystem hub.
5. **UI designs** (2026-11-15): the look ships as separate design packages, **Crisp** (default) and **Vivid**, chosen in the installer and swappable later (§5.1). Direction B (Glass) is shelved as a future design.

Still open:
6. **Auto API.** Proposed default: every table with a model gets the CRUD API automatically after `migrate`, with an opt-out per model.

## 12. Decisions to record as ADRs once approved

- **Superseded:** D2, D4, D5, D6, D7, D17, D23; ADR-0002 (polyrepo), 0003, 0009, 0010 (registry compiler), 0012 (merge engine).
- **Refined:** D1, D8, D9, D10, D12, D14, D15, D18, D21, D24; ADR-0001, 0004, 0005/0013 (Better Auth default), 0014, 0016 (`latest`, plain 0.x), 0018 (409 = skip).
- **New ADRs:**
  - migration-first schema with in-memory replay (an exception to ADR-0010's "never execute");
  - the Strutvane ORM;
  - MVC app layout and the `node strut` CLI;
  - Laravel-style repository layout (framework, skeleton, installer, docs, first-party packages);
  - UI split into behaviour (`@strutvane/ui`) and swappable design packages (Crisp default, Vivid), with the conformance kit;
  - npm-only tooling with an install-script allowlist;
  - auto API + UI on `migrate`, with ownership rules;
  - auth in the default install with tables as app migrations;
  - seeding tracked once per seeder;
  - the slug, search and pagination standards;
  - the package catalogue and phases.
- **Rewritten:** CLAUDE.md, ECOSYSTEM.md, GOVERNANCE.md, docs 00, 04–10, 14 and 17, and the docs site.
