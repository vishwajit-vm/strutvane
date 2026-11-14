# Installer and local environment: research and design (2026-11-14)

> **Status:** research + proposal. Nothing here is decided until an ADR accepts it (see §9).
> **Scope:** the one-command project creation (`npm create strutvane@latest my-app`) and the local
> development environment (database, Docker, the project CLI, npm scripts), rebuilt to follow
> Laravel's flow on **npm only**.
> **Method:** official docs and source read on 2026-11-14, plus argument-passing experiments run on
> this machine (Windows 11 Pro 10.0.26200, Windows PowerShell 5.1.26100, Node 24.21.0, npm 11.19.0).
> Anything not confirmed by a source or an experiment is marked *(unverified)*.

---

## 0. Summary (the decisions this document proposes)

1. **One command does everything:** `npm create strutvane@latest my-app` asks every question, then
   writes the project, runs `npm install`, generates secrets, prepares the database (SQLite file, or
   Docker services with health checks), runs migrations and seeders, makes the first git commit, and
   offers to start `npm run dev`. If a step fails, the project stays and `npm run setup` resumes it.
2. **Default database is SQLite (zero setup)**, as in Laravel. PostgreSQL is offered first when
   multi-tenancy is chosen (RLS needs it). This needs persistent auth on SQLite first (§6.4).
3. **The project CLI is `node strut <command>`**: a `strut.js` file in the project root, like
   AdonisJS's `node ace` and Laravel's `php artisan`. It runs `node.exe` directly, so there is no
   `.ps1`/`.cmd` shim, no PowerShell execution policy, no `--` separator and no `sv` alias clash.
4. **Field syntax without parentheses**: `amount:decimal:12,2`, `customer:belongsTo:Customer`.
   Unquoted parentheses are split by PowerShell itself (verified), whatever the CLI does.
5. **npm only.** Retire pnpm/yarn/bun support, `pnpm-workspace.yaml`, the Corepack fallback and `sv`.
6. **Publish the entry points on `latest` before 1.0** (plain `0.x.y`, not `0.x.y-next.N`), so
   `npm create strutvane@latest` works. This changes ADR-0016 for these packages.
7. **Docker stays local-only (ADR-0006, D16):** a git-ignored `docker/compose.yaml` for backing
   services only (DB, Valkey, Mailpit). The Node app runs on the host. `node strut up` / `down`.

---

## 1. Prior art (what the others do, dated 2026-11-14)

### 1.1 Laravel installer (`laravel new`)

Source: `laravel/installer` `src/NewCommand.php` (master, read 2026-11-14); docs
<https://laravel.com/docs/master/installation> (Laravel 13; `laravel/laravel` 13.x requires
`laravel/framework ^13.17`, PHP `^8.3`).

**Flags:** `name` (argument), `--dev`, `--git`, `--branch`, `--github[=flags]`, `--organization`,
`--database` (mysql, mariadb, pgsql, sqlite, sqlsrv), `--react` / `--svelte` / `--vue` /
`--livewire`, `--livewire-class-components`, `--workos`, `--teams`, `--no-authentication`,
`--pest` / `--phpunit`, `--npm` / `--pnpm` / `--bun` / `--yarn`, `--no-node`, `--boost` /
`--no-boost`, `--using[=package]` (community kits), `-f/--force`.

**Defaults when no flag is given:** database `sqlite`, Pest, Boost on, npm.

**Prompts, in order** (Laravel Prompts):
1. "What is the name of your project?" (only without the argument; refuses an existing folder).
2. "Do you want to use a starter kit?" (default No).
3. Without a kit: "Which frontend stack do you want to build on?" Blade (default), React, Svelte,
   Vue, Livewire. With a kit: "Which frontend stack should your starter kit use?" React (default),
   Svelte, Vue, Livewire.
4. Kit only: "Which authentication provider do you prefer?" Laravel built-in (default) or WorkOS.
5. Livewire kit: single-file components? (default Yes). Then "Would you like to add teams support
   to your application?" (default No).
6. "Which testing framework do you prefer?" Pest (default) / PHPUnit.
7. "Do you want to install Laravel Boost to improve AI assisted coding?"
8. Later, during execution: "Which database will your application use?" (with a PDO-availability
   note), then for non-SQLite "run the default database migrations?"; and whether to run the npm
   install and build.

**What it runs afterwards, in order:**
1. `composer create-project laravel/laravel` (or a starter-kit repo) `--remove-vcs --prefer-dist
   --no-scripts`.
2. `composer run post-root-package-install` (copies `.env.example` to `.env`),
   `php artisan key:generate`, `chmod 755 artisan` (not on Windows), the project's
   `post-create-project-cmd` hooks.
3. Writes `APP_URL` (`http://localhost:8000`, or `http://<name>.test` when parked in Herd/Valet).
4. Writes `DB_CONNECTION` into `.env` **and** `.env.example`; for SQLite it comments out
   `DB_HOST`…`DB_PASSWORD`, otherwise sets the port and `DB_DATABASE` from the name.
5. SQLite: creates `database/database.sqlite`, then `php artisan migrate`.
6. `--git`: `git init`, `git add .`, commit "Set up a fresh Laravel app", `git branch -M main`.
7. Pest swap (removes PHPUnit, `pest --init`, separate commit). `--github`: `gh repo create
   --private --source=. --push`.
8. Node: picks the package manager (flag, lockfile, npm), rewrites the Composer scripts to use it,
   runs install + build ("Packages installed", "Assets built").
9. Boost install (each step committed when git is on).
10. Final callout "Application ready": `cd <name>`, the install/build commands if skipped, then
    `composer run dev` (or "Open: http://name.test" with Herd).

**`composer run dev`** now runs `php artisan dev` (Laravel 13 `composer.json`), which starts the
PHP server, queue listener, log tailing and Vite together. There is also a `setup` Composer script
(install, `.env`, key, migrate, `npm install`, `npm run build`) that a teammate runs after cloning.
That is exactly the "resume / onboard" command we need (§3.5).

**Lessons for Strutvane:** SQLite default with migrations already run is what makes "zero setup"
real. The installer never starts Docker. It never prompts for git (flag only). It keeps
`.env.example` in step with `.env`. It pings `laravel.com/new-install` (we should not: no
telemetry). It offers to update itself when stale.

### 1.2 Laravel Sail and Herd

Docs: <https://laravel.com/docs/master/sail>, read 2026-11-14.

- Sail is "the `compose.yaml` file and the `sail` script". Installed with every new app;
  `php artisan sail:install [--with=mysql,redis,…] [--devcontainer]` publishes `compose.yaml` to the
  project root and edits `.env`. The service picker is interactive unless `--with` is given or
  `--no-interaction` (then defaults). Success message: "Sail scaffolding installed successfully…",
  hint `./vendor/bin/sail up`, plus "A database service was installed. Run artisan migrate…".
- `sail up` / `sail up -d` / `sail stop`; `sail artisan …`, `sail composer …`, `sail npm …`,
  `sail test`, `sail shell`, `sail tinker`, `sail share`, `php artisan sail:add`.
- **The app runs in a container too** (`laravel.test`), and the app reaches services by service
  name (`DB_HOST=mysql`, `REDIS_HOST=redis`, `MAIL_HOST=mailpit`). The host reaches them on
  `localhost:<port>`. MySQL creates a second `testing` database for the test suite.
- Mailpit UI on <http://localhost:8025>. A shell alias (`alias sail=…`) is needed for the short
  form. Windows is supported **only via WSL2**.
- **Herd** (macOS, Windows) is a native PHP + nginx environment: apps in `~/Herd` are served at
  `http://<name>.test`; Herd Pro adds local MySQL/Postgres/Redis, mail and log viewing. The
  installer only sets `APP_URL`; it does not call Herd.

**Lesson:** Strutvane does not need the app container. Node must already be on the host to run
`npm create`, and file watching / HMR through bind mounts from a Windows file system into a
WSL2/Linux VM is slow and often misses events *(unverified for current Docker Desktop; widely
reported)*. Docker is for **backing services only**, connected over `127.0.0.1:<port>`.

### 1.3 Laravel Prompts

Docs: <https://laravel.com/docs/master/prompts>. Types: text, textarea, number, password, confirm,
select, multiselect, suggest, search, multisearch, pause, plus `form()` (grouped prompts where
**Ctrl+U goes back** to the previous answer), notes (info/warning/error/alert), table, spin,
progress, clear. Labels are truncated to the terminal width; 74 characters is the safe maximum
for 80-column terminals. **It does not run on native Windows PHP**: outside WSL it falls back to
Symfony's question helper (`Prompt::fallbackWhen(! interactive || windows_os() || tests)`).

**Lesson:** our prompt library (`@clack/prompts`, already used) runs natively in Windows Terminal.
Keep labels ≤ 74 characters. Offer a final "review and change" step in place of Ctrl+U.

### 1.4 JavaScript starters

| Starter (read 2026-11-14) | Prompts | Installs deps | Secrets / DB | Git | Next step printed |
|---|---|---|---|---|---|
| **create-adonisjs** (AdonisJS v7; Node ≥ 24, npm ≥ 11) | kit (hypermedia, react, vue, api, api-monorepo), auth guard, DB dialect | yes | creates `.env`, generates `APP_KEY`, **runs migrations**, SQLite default (Lucid) | only with `--git-init` | `node ace serve --hmr` |
| **create-next-app** (docs updated 2026-09-29) | "Use the recommended Next.js defaults?" (defaults / reuse previous / customize), then TS, linter, React Compiler, Tailwind, `src/`, App Router, Cache Components, alias, AGENTS.md | yes (`--skip-install`) | none | yes (`--disable-git`) | `npm run dev` |
| **create-t3-app** | language, Tailwind, tRPC, auth, ORM, App Router, DB provider, git, install | yes (`--noInstall`) | generates a **`start-database.sh`** that runs a Docker DB with a random password | yes (`--noGit`) | db push, dev |
| **create-nuxt** (Nuxt 4) | template, modules, package manager, git | yes (`--no-install`) | none | `--gitInit` | prints commands; `--shell` opens a shell in the project |
| **create-redwood-app** (v8 docs) | TS/JS, git (default yes), install (default yes); `--yes` | yes | none | yes | `yarn rw dev` (Yarn required) |

Notable details:
- **AdonisJS is the closest analog** to what we want: one command ends with dependencies, `.env`,
  `APP_KEY` and migrations done, and the project CLI is `node ace` (a file in the project root).
- **Nuxt documents the npm `--` rule** explicitly: "With npm, add `--` before flags, or npm treats
  them as its own config." Non-interactive runs with missing answers exit with code `2`.
- **Next.js remembers preferences** ("reuse previous settings", `--reset-preferences`).
- **t3's Docker script** shows the failure modes to avoid: it broke on a `.` project name
  (issue #1834) and on auth after generating a random password (issue #1853). Compose with
  `${VAR:?}` interpolation from `.env` (what our template already does) avoids both.

### 1.5 `npm create` / `npm init` mechanics (npm 11)

Docs: <https://docs.npmjs.com/cli/v11/commands/npm-init>.

- `npm create x` = `npm init x` → `npm exec create-x`. `@scope` → `@scope/create`,
  `@scope/x` → `@scope/create-x`, `x@1.2.3` → `create-x@1.2.3`, `x@latest` → `create-x@latest`.
- A globally installed `create-x` is used if present; **`@latest` forces the registry's latest**.
  On first use npm asks *"Need to install the following packages: create-x@… Ok to proceed? (y)"*.
- **Options before `--` go to npm; options after `--` go to the initializer.**

Verified on this machine (npm 11.19.0, `npm exec` with a local fake CLI that prints its argv):

| Typed (PowerShell) | What the program received |
|---|---|
| `npm exec fakecli my-app --db sqlite --yes` | `["my-app","sqlite"]` + warnings *Unknown cli config "--db". This will stop working in the next major version* and *"sqlite" is being parsed as a normal command line argument*; `--yes` silently consumed by npm |
| `npm exec -- fakecli my-app --db sqlite --yes` | `["my-app","--db","sqlite","--yes"]` |
| `npx fakecli my-app --db sqlite --yes --preset=api` | all forwarded (npx treats everything after the package as the command's arguments) |
| `npm run sv make:model Post --force` | `["make:model","Post"]` (**`--force` silently dropped**) |
| `npm run sv -- make:model Post --force` | intact |
| `node --run strut make:model Post --force` | `[]` (**everything dropped** without `--`) |
| `node --run strut -- make:model Post --force` | intact |
| `npm exec --db=sqlite -- node pr.js` | the child sees `npm_config_db=sqlite`, `npm_config_yes=true`, `npm_config_user_agent=npm/11.19.0 node/v24.21.0 win32 x64 workspaces/false` |

Consequences: documentation must show `npm create strutvane@latest my-app -- --db postgres` for
flags (or `npx create-strutvane@latest my-app --db postgres`). The starter can **detect swallowed
flags** (an `npm_config_<ourflag>` variable is set, or extra positionals appear) and print the
corrected command instead of silently ignoring them.

### 1.6 Windows quirks (verified where stated)

1. **PowerShell execution policy blocks `npm.ps1` / `npx.ps1`.** Node for Windows installs `.ps1`
   shims next to `npm.cmd`/`npx.cmd` (`Get-Command npm` → `C:\Program Files\nodejs\npm.ps1`). With
   no policy set in any scope, the effective policy on Windows **clients is `Restricted`**
   (Microsoft Learn, about_Execution_Policies, updated 2026-08-31), which refuses every `.ps1`,
   so the very first `npm create …` fails with "running scripts is disabled on this system".
   Workarounds: `npm.cmd create strutvane@latest my-app`, or once
   `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`. We cannot fix this from inside the
   starter; the install docs must say it. *(Whether the Node MSI or Windows "For developers"
   settings change the policy: unverified.)*
2. **`npm.ps1` used to mangle arguments after `--`** (npm/cli#7375: leading-dash flags lost in
   PowerShell; fixed by PR #8278 "use Invoke-Expression to pass args", merged 2025-05-12, shipped
   in Node 24.3.0 and back-ported to npm 10 / Node 22.18). The old workaround `-- --` now passes a
   literal `--` (verified: `npm run sv -- -- --flag` → `["--","--flag"]`). **Require Node ≥ 24.3**
   (or npm ≥ 11.4 *(release mapping unverified)*), check it in the starter, and never document
   `-- --`.
3. **Unquoted parentheses are split by PowerShell, not by npm.** Verified:
   `node strut.js make:model Post title:string(120)` → `["make:model","Post","title:string","120"]`.
   Quoted `'title:string(120)'` arrives intact through `node`, `npm run … --`, `npx` and `.cmd`
   shims. From `cmd.exe`, unquoted `title:string(120)` arrives intact. So the pain point "cmd shims
   breaking `string(120)`" is really the PowerShell tokenizer; no CLI design can fix it except a
   syntax without parentheses. Verified to pass intact unquoted in PowerShell **and** cmd:
   `a:string:120`, `b:decimal:10,2`, `d:enum:draft,published`, `e:string=120`, `g:ref:users`.
   Avoid `?` and `[ ]` (glob characters: zsh aborts with "no matches found") and `!` (bash history).
4. **`sv` is a built-in PowerShell alias for `Set-Variable`** (verified: `Get-Alias sv`). Typing
   `sv make:model Post` creates a variable named `make:model` and prints nothing: a silent no-op.
5. **`.cmd` shims and cmd metacharacters:** calling a `.cmd` shim with `a&b` ran `b` as a command
   (verified). Node ≥ 18.20.2 / 20.12.2 refuses to spawn `.cmd`/`.bat` without a shell
   (CVE-2024-27980), and passing `args` with `shell: true` is deprecated (DEP0190, Node 22.15 /
   23.11). The starter must therefore **never spawn `npm.cmd`**: run
   `process.execPath <npm-cli.js> install` without a shell, where `npm-cli.js` comes from
   `process.env.npm_execpath` (set by npm when it runs `npm create`) or from
   `<dirname(execPath)>/node_modules/npm/bin/npm-cli.js`. The launcher already does the equivalent
   for npx.
6. **npm 12 blocks dependency install scripts by default** (npm/cli PR #9424, merged 2026-06-03;
   policy in `allowScripts`, approvals via the approve-scripts command; secondary sources say it
   warns rather than fails unless `--strict-allow-scripts`). pnpm 10+ and Bun already block them.
   Generated projects must install cleanly with **no** install scripts: pick dependencies with
   prebuilt platform packages (esbuild's binary comes from an optional platform package; its
   postinstall is only a check *(unverified for the pinned version)*) and avoid `better-sqlite3`
   (native build). Add an `allowScripts` entry only if an e2e run on npm 12 proves one is needed.

---

## 2. User pain points (from the Phase 1 trial) and their fixes

| Pain point | Root cause | Fix in this design |
|---|---|---|
| Needed `@next`, `@latest` failed | ADR-0016 publishes pre-1.0 as `0.x-next.N` on `next`; `latest` holds a binary-less placeholder | Publish `create-strutvane` (and the `strutvane` launcher) as plain `0.x.y` on `latest`; keep `next`/`canary` for previews (§9, ADR) |
| pnpm 12 blocked esbuild builds | `ERR_PNPM_IGNORED_BUILDS` | npm only; no dependency needs an install script (§1.6.6) |
| Five commands after create | install, services:up, auth:migration, migrate, db:seed, dev were left to the user | The starter runs all of them (§3.4); one `npm run dev` after |
| UI not served by `dev` | the dev path did not go through the framework's Vite middleware *(cause as reported)* | `npm run dev` → `node strut dev`, which mounts the project's Vite (framework `runtime/dev-ui.ts` already does this); e2e test asserts `GET /` returns the Vite page and `GET /api/v1/...` the API on the same port |
| PowerShell `sv` alias collision | `sv` = `Set-Variable` | `node strut` (§4) |
| `string(120)` broken | PowerShell splits unquoted parentheses | colon syntax `title:string:120`; interactive field prompts when no fields are given (§4.3) |

---

## 3. The Strutvane flow

### 3.1 Entry points

```text
npm create strutvane@latest my-app                     # the documented way (interactive)
npm create strutvane@latest my-app -- --yes            # all defaults, no questions
npx create-strutvane@latest my-app --db postgres --yes # flags without the `--` rule
npm.cmd create strutvane@latest my-app                 # Windows when .ps1 scripts are blocked
```

Before the first question, the starter runs **preflight checks** (fast, offline):

| Check | On failure |
|---|---|
| Node ≥ 24.3 (checked by a tiny `bin.js` before any ESM import that needs newer Node) | error with the install link; exit 1 |
| Running under npm (user agent) | other managers: warning "Strutvane projects use npm; continuing with npm" |
| Target folder missing or empty; name valid on Windows (`con`, `nul` …) | error before any question (existing behaviour) |
| Flags swallowed by npm (`npm_config_db`, `npm_config_preset` … set, or stray positionals) | error showing the corrected command with `--` |
| Newer `create-strutvane` on the registry (1.5 s timeout, skipped offline or with `--offline`) | note: "0.4.0 is available: npm create strutvane@latest" (no telemetry, unlike Laravel's ping) |
| git present | git step becomes "skipped (git not found)" |

Docker is checked **only after** the user chooses Docker (§3.3, step 7), so SQLite users never wait
for it.

### 3.2 Questions (order, defaults, flags)

Labels stay ≤ 74 characters. Every question has a flag; anything not given is asked, or defaulted
with `--yes` / when stdin is not a TTY / when `CI` is set.

| # | Question (asked when…) | Choices (default first or marked) | Flag |
|---|---|---|---|
| 1 | "Project name" (no folder argument) | text, placeholder `my-app` | `[folder]`, `--name` |
| 2 | "What are you building?" | **Full-stack app (API + UI)** · API only · UI only (for an existing Strutvane API) | `--stack full\|api\|ui` (alias `--preset`) |
| 3 | "Which UI starter?" (full, ui) | **Admin app (generated screens from your models)** · Blank React + Vite | `--ui admin\|blank` |
| 4 | "How should people sign in?" (full, api) | **Email + password** · Email + password and social logins · Magic link · No sign-in | `--auth email,magic-link,google,microsoft,github\|none` |
| 4a | "Which social logins?" (social chosen) | multiselect Google, Microsoft (Entra ID), GitHub | (same) |
| 5 | "Teams? (each customer company sees only its own data)" (sign-in on) | **No** · Yes | `--tenancy` / `--no-tenancy` |
| 6 | "Which database?" (full, api) | **SQLite (zero setup)** · PostgreSQL · MySQL · Azure PostgreSQL (passwordless) · Azure MySQL (passwordless). With teams: **PostgreSQL** first and the others disabled with the hint "teams need PostgreSQL row-level security" | `--db sqlite\|postgres\|mysql\|azure-postgres\|azure-mysql` |
| 7 | "How will you run PostgreSQL locally?" (postgres/mysql) | **Docker: start it for me now** (default when the `docker` CLI exists) · I already run one (asks host/port/user, password masked) · Later: just write .env | `--services docker\|existing\|later` |
| 8 | "Extras" (full, api) multiselect | **Logs + log viewer** (pre-selected) · Background jobs · Cache · Email (Mailpit in Docker) · Audit log (sign-in on) · OpenTelemetry | `--extras …\|none` |
| 9 | "Tests" | **Vitest (unit + feature)** · Vitest + Playwright browser tests (browsers downloaded on first `npm run test:e2e`) | `--e2e` / `--no-e2e` |
| 10 | "Create a git repository with a first commit?" | **Yes** · No | `--git` / `--no-git` |
| 11 | Review: a summary box of every answer, then "Create the project?" | **Create it** · Change an answer (jumps back to a chosen question) · Cancel | (skipped with `--yes`) |

After creation (interactive only): "Start the development server now?" **Yes** / No (`--dev` /
`--no-dev`; always No under `CI`).

Other flags: `--no-install` (write files only; nothing else runs), `--no-setup` (install, but no
database/migrations/seed), `--commit-docker` (opt-in from ADR-0006), `--dry-run` (existing),
`--offline`, `-y/--yes`, `-h/--help`, `-v/--version`. Removed: `--pm`, `--install` (now default),
`--docker=local|commit|off` (replaced by `--services` and `--commit-docker`).

Exit codes: `0` created and set up; `1` invalid input or nothing written; `2` project created but
setup incomplete (CI can detect it; the message says `npm run setup`); `130` cancelled before
anything was written.

### 3.3 What runs after the questions (steps, output, failure handling)

Each step prints one line with a spinner, then a check mark and its duration. Full output of
external commands goes to `.strutvane/logs/setup-<timestamp>.log`; on failure the last 20 lines
are shown with the log path. Progress is recorded in `.strutvane/setup.json`
(`{ step: "pending"|"done"|"failed"|"skipped" }`) so every step can be resumed.

| Step | What | Failure scenarios and handling |
|---|---|---|
| 1. Write files | transactional write via devkit staged FS (existing) | any error → full rollback, folder removed; exit 1 |
| 2. Secrets | `APP_KEY`, `AUTH_SECRET`, `DB_PASSWORD`, `SEED_ADMIN_PASSWORD` into `.env` (existing); `.env.example` gets keys only | — |
| 3. Free ports | probe `127.0.0.1` for `APP_PORT` (3000), `DB_PORT` (5432/3306), 6379, 1025/8025; if taken, pick the next free one and write it to `.env` (and `APP_URL`, auth trusted origins) | reported as "port 5432 is in use; using 5433" |
| 4. Install | `node <npm-cli.js> install --no-audit --no-fund` (no shell) | network errors (`ETIMEDOUT`, `ECONNRESET`, `EAI_AGAIN`): one automatic retry. `EPERM`/`EBUSY` on Windows (antivirus or editor locks): one retry after 2 s. Registry/proxy (`E401/E403`, `SELF_SIGNED_CERT_IN_CHAIN`): show `npm config get registry` hint. Then: project kept, steps 5–8 marked pending, exit 2 with "fix the cause, then run: cd my-app; npm run setup" |
| 5. Database | **SQLite:** create `database/database.sqlite`. **Docker:** `docker compose -p <name> --env-file .env -f docker/compose.yaml up -d --wait --wait-timeout 120`. **Existing:** connect test with the given settings. **Later:** skipped | see §3.4 |
| 6. Migrate | `node strut migrate` (app + package migrations such as auth tables) | connection refused → offer Retry / Skip (pending). A migration error is a bug: show it, keep the project, exit 2 |
| 7. Seed | `node strut db:seed` (roles, first admin; idempotent upserts) | same as migrate |
| 8. Git | `git init -b main`, `git add -A`, commit "chore: initial commit from create-strutvane" (after install, so the lockfile is in the first commit) | no git identity → repo kept, uncommitted, with the `git config` hint (existing behaviour) |
| 9. Done | summary box: URL, admin email, admin password **once** (interactive, non-CI only; existing rule), the three commands to know | — |

### 3.4 Database / Docker failures during creation (interactive)

```text
Docker CLI not found
  → "Docker is not installed. How do you want to continue?"
     ● Use SQLite instead (rewrites DB_* in .env, keeps everything else)
     ○ Skip: I will install Docker and run `node strut up` later
     ○ Cancel setup (the project files stay)

Docker installed, engine not running (`docker info` fails: Windows named pipe / macOS socket / Linux docker.sock)
  → "Docker is installed but not running."
     ● Start Docker Desktop and wait (Windows/macOS: `docker desktop start` *(unverified: Docker Desktop ≥ 4.37)*,
       fallback: launch the app; poll `docker info` every 2 s for up to 90 s)
     ○ Retry (I started it myself)
     ○ Use SQLite instead
     ○ Skip for now

Linux: "permission denied … docker.sock"
  → explain the docker group (`sudo usermod -aG docker $USER`, log out/in) or rootless Docker; offer SQLite / Skip

Image pull fails (offline, proxy, rate limit) → Retry / Use SQLite / Skip
Health check timeout (120 s) → show `docker compose logs --tail 30 <service>`; Retry / Skip
Port conflict at `up` time (another app grabbed it) → choose a new port, rewrite .env, retry once automatically
```

Non-interactive (`--yes`, CI): no questions; Docker failures mark steps 5–7 pending and exit 2 with
the exact command to run. `--db sqlite` is the CI-safe default.

### 3.5 Resume and onboarding: `npm run setup`

The generated `package.json` has `"setup": "npm install && node strut setup"`. `node strut setup`
reads `.strutvane/setup.json` (or, on a fresh clone without it, runs every step):
copy `.env.example` to `.env` when missing and generate empty secrets, choose free ports, start
services (Docker if `docker/compose.yaml` exists, else ask/skip), migrate, seed. Every step is
idempotent: install is idempotent, `up --wait` is idempotent, migrations track what ran, seeders
upsert. This is Laravel's `composer run setup` and Sail's `sail up` rolled into one, and it is how a
teammate starts after `git clone` (the compose file is git-ignored, so `setup` regenerates it from
`strutvane.config.ts` when the project uses Docker services).

### 3.6 Generated npm scripts

```jsonc
{
  "scripts": {
    "dev": "node strut dev",          // API + UI on one port (Vite middleware, HMR), restarts on app/, config/, .env changes;
                                      // auto-runs `node strut up` when docker/compose.yaml exists and the DB port is closed (--no-up to disable)
    "build": "node strut build",      // server bundle to build/server.js + `vite build` to build/public
    "start": "node build/server.js",  // production: no CLI or devDependencies needed at runtime
    "test": "vitest run",
    "test:e2e": "playwright test",    // only with --e2e
    "lint": "biome check .",
    "typecheck": "tsc --noEmit",
    "check": "biome check . && tsc --noEmit && vitest run",
    "setup": "npm install && node strut setup",
    "strut": "node strut"             // convenience only; flags then need `--` (§1.5)
  }
}
```

Production `start` must not depend on `@strutvane/cli` (a devDependency); the built server reads
the environment itself (`node --env-file-if-exists=.env` is an option on Node ≥ 22.9 when a `.env`
is used in production at all).

---

## 4. The project CLI: `node strut`

### 4.1 Options evaluated (Windows-safety and memorability)

| Option | PowerShell | cmd | bash/zsh | Needs `--` for flags | Hit by execution policy | Extra install | Notes |
|---|---|---|---|---|---|---|---|
| **`node strut make:model Post`** | yes (node.exe) | yes | yes | **no** | **no** | no | verified on this machine; `node strut` resolves `strut.js` |
| `npx strutvane make:model Post` | `.ps1` shim | `.cmd` shim | yes | no | **yes** | no | ~0.3–0.5 s npm start-up *(unverified timing)*; when not installed locally, npx downloads a package from the registry |
| `npm run strut -- make:model Post` | `.ps1` | `.cmd` | yes | **yes; flags silently dropped without it** | yes | no | verified drop of `--force` |
| `pnpm sv …` / `sv …` | **`sv` = Set-Variable** | yes | yes | no | yes | pnpm | not npm; verified silent no-op |
| global `strutvane …` | `.ps1` | `.cmd` | yes | no | yes | `npm i -g` | version skew handled by the launcher, but one more thing to install |
| `node --run strut -- …` | yes | yes | yes | **yes; everything dropped without it** | no | no | verified |

**Pick: `node strut`.** It is the AdonisJS model (`node ace`), as short as `php artisan`, and the
only option that works the same in PowerShell (any execution policy), cmd, bash and zsh, with
flags passed as typed. `strut` is short, unique and on brand.

### 4.2 The generated `strut.js`

```js
#!/usr/bin/env node
// The Strutvane command line for this project. Run: node strut <command>   (node strut help)
// A plain file run by node.exe: no npm shim, no PowerShell execution policy, no `--` needed.
import { existsSync } from 'node:fs'

if (!existsSync(new URL('./node_modules/@strutvane/cli/package.json', import.meta.url))) {
  process.stderr.write('Dependencies are not installed yet. Run: npm install\n')
  process.exit(1)
}
const { run } = await import('@strutvane/cli')
process.exitCode = await run(process.argv.slice(2), { root: import.meta.dirname })
```

No project search is needed (the file sits in the project), so the launcher's boundary logic is
not involved. Commands keep their names: `node strut dev`, `migrate`, `db:seed`, `make:model`,
`routes`, `up`, `down`, `key:generate`, `doctor`.

### 4.3 Field syntax that survives every shell

`name:type[:args][:modifier…]`, where args are comma-separated and modifiers are keywords:

```text
node strut make:model Invoice number:string:40:unique amount:decimal:12,2 customer:belongsTo:Customer status:enum:draft,sent,paid notes:text:nullable
```

- Verified intact unquoted in PowerShell and cmd (§1.6.3). No `( ) ? [ ] ! { } @ & | ; < >`.
- The parenthesized form (`'amount:decimal(12,2)'`) stays accepted when quoted. When the CLI sees
  a split it can recognise (`title:string` followed by a bare number), it errors with
  "PowerShell split `title:string(120)`; write `title:string:120`".
- `node strut make:model Invoice` with no fields asks for them interactively (name, type picker,
  options), the Laravel way. This avoids shell syntax entirely.
- docs/05 §4.1 examples (`belongsTo(Customer)`, `decimal(12,2)`) must be updated.

---

## 5. Docker (Sail-like, for npm)

### 5.1 Shape

- `docker/compose.yaml`, **git-ignored by default** (ADR-0006, D16), `--commit-docker` opt-in.
  Keep the current template: one major image line each (`postgres:18-alpine`, `mysql:8.4`,
  `valkey/valkey:9-alpine`, `axllent/mailpit:v1.33`), credentials only from `.env` via
  `${VAR:?set VAR in .env}`, every port bound to `127.0.0.1`, a health check per service, named
  volumes (not bind mounts: no Windows permission or speed issues).
- Add for PostgreSQL/MySQL an init script that also creates `<db>_test` for the test suite (Sail's
  `testing` database idea), and set `DB_DATABASE_TEST` in `.env`.
- The app runs on the host and connects to `127.0.0.1:${DB_PORT}`; Valkey `127.0.0.1:6379`;
  SMTP `127.0.0.1:1025`; Mailpit inbox <http://localhost:8025>. No service-name hosts, so the same
  `.env` works with or without Docker.
- Compose project name = package name (`-p`), so two apps on one machine never share volumes.

### 5.2 Commands

| Command | Runs | Notes |
|---|---|---|
| `node strut up` | `docker compose -p <name> --env-file .env -f docker/compose.yaml up -d --wait --wait-timeout 120` | `--wait` implies detached and waits for "running/healthy" (Docker docs) |
| `node strut down` | `… down` | keeps data |
| `node strut down --volumes` | `… down -v` | deletes local data; asks for confirmation (default No) |
| `node strut ps` / `logs [service]` | `… ps` / `… logs -f --tail 100` | |
| `node strut db:shell` | `docker compose exec postgres psql -U … -d …` (or `mysql`) | |
| `node strut docker:add mail` | adds a service block and `.env` keys | like `sail:add` |

The CLI runs `docker` as an executable without a shell (`docker.exe` is a real binary). It detects
the engine with `docker info --format "{{.ServerVersion}}"` and Compose v2 with
`docker compose version`. Podman: `STRUT_CONTAINER_CLI=podman` may work through `podman compose`
*(unverified, especially `--wait`)*; not a supported path in 1.0.

### 5.3 Per OS

- **Windows:** Docker Desktop with the WSL2 backend. Common state after a reboot: CLI present,
  engine not running → §3.4 offers to start it. Projects live on the Windows file system; only
  services run in containers, so no cross-file-system watching.
- **macOS:** Docker Desktop, OrbStack or Colima all provide the `docker` CLI and Compose v2 *(per
  their docs; not re-verified today)*. All four images publish arm64 builds *(unverified for the
  pinned Mailpit tag)*.
- **Linux:** Docker Engine plus the Compose plugin. The usual failure is `docker.sock` permission
  (§3.4). Rootless Docker works because ports are bound to 127.0.0.1 above 1024.

---

## 6. Reuse analysis of the existing code

### 6.1 `packages/create-strutvane` (0.1.0-next.0)

| File | Verdict | Why / what changes |
|---|---|---|
| `src/options.ts` | **Keep, adapt** | the "collect every problem" validation and `ProjectOptions` model are right. Change defaults (`database: 'sqlite'`, install on, git on), add `stack/ui/services/e2e/dev`, drop `packageManager`, map teams → PostgreSQL-only |
| `src/validate-name.ts` | **Keep** | Windows reserved names, npm name rules |
| `src/generate.ts` | **Keep** | transactional write + rollback is exactly the "all or nothing" guarantee |
| `src/env-spec.ts`, `src/render.ts` | **Keep, adapt** | env sections and safe `.env.example` values; add test DB keys and port rewrites |
| `src/prompts.ts` | **Keep the `Prompter` interface and clack adapter; rewrite the question list** | new order (§3.2), review step, social-login follow-up, labels ≤ 74 chars |
| `src/args.ts` | **Adapt** | new flags; swallowed-flag detection via `npm_config_*`; help text shows `-- ` rule and the `npx create-strutvane` form |
| `src/post.ts` | **Adapt heavily** | becomes a step runner with state in `.strutvane/setup.json`; spawn npm as `node <npm_execpath>` (no shell, no `.cmd`); add DB, migrate, seed, port and Docker steps; same "never destroy the project" rule |
| `src/next-steps.ts` | **Shrink** | prints only `cd my-app` + `npm run dev` (or what is still pending + `npm run setup`) |
| `src/release-channel.ts` | **Keep the function, change the policy** | with plain `0.x` on `latest`, it prints `@latest`; still correct for `next` previews |
| `src/package-manager.ts` | **Retire** | npm only; `corepackRunner`, yarn/bun/pnpm variants go |
| `src/main.ts` | **Keep structure** | injectable UI/prompter/runner made every path testable; add exit code 2 and the "start dev now?" step |
| `src/auth-roles.ts`, `templates/config.ts`, `templates/app.ts`, `templates/web.ts`, `templates/tests.ts`, `templates/ci.ts` | **Keep** | CI switches to `npm ci` only and drops `setupPnpm`/`setupBun` actions |
| `templates/root.ts` | **Adapt** | scripts per §3.6; `strut.js`; remove `pnpm-workspace.yaml`, `packageManager` pin, `sv` script, `services:up/down` |
| `templates/docker.ts` | **Keep, extend** | add test databases, project name `-p`, comment lines pointing to `node strut up` |
| `templates/docs.ts` | **Rewrite command lines** | README and CLAUDE.md show `npm run dev`, `node strut …`, `npm run setup` |
| `src/versions.ts` | **Keep** | drop `pnpm`; re-verify pins before release |
| tests (golden files, real `tsc`/Biome/Vitest e2e) | **Keep** | add: npm 12 install with zero blocked-script warnings; Windows PowerShell job that runs `npm create` → `npm run dev` → HTTP checks on `/` and `/api/v1`; SQLite path end to end; Docker path where Docker exists |

### 6.2 `packages/cli/packages/launcher` (`strutvane` global)

**Keep, demote.** Its security work (project boundary rules, no-shell npx, loop guard, control
characters stripped) is good and stays for people who install `strutvane` globally
(`strutvane new my-app`). It is no longer the documented path and generated scripts no longer call
it (`"dev": "strutvane dev"` → `"dev": "node strut dev"`, which removes one indirection and the
`.ps1` shim from `npm run dev`). Its channel logic follows the `latest` change. The `sv` bin name
and the "`pnpm exec strutvane-cli help`" advice go.

### 6.3 Framework pieces already in place

`@strutvane/framework` `runtime/dev-ui.ts` mounts the project's own Vite in middleware mode on the
app server (one port, HMR, no CORS), and the `dev` command reports a taken port before starting.
The design only needs `node strut dev` to reach it and an e2e test to keep it working.

### 6.4 Gaps to close before SQLite can be the default

- **Persistent sign-in on SQLite.** Today persistent identity (Better Auth tables as a package
  migration) exists only on PostgreSQL; other databases fall back to in-memory sessions with a
  warning. A default that loses every session on restart contradicts "ends with a running app".
  Implement the SQLite (and MySQL) identity path first, or keep PostgreSQL as the default until it
  exists.
- **SQLite driver without install scripts.** The templates pin `@libsql/client` (prebuilt optional
  platform packages *(verify on npm 12)*). `node:sqlite` is built in (no `--experimental-sqlite`
  since Node 22.13 / 23.4; "1.2 Release candidate" in the Node 26.13 docs) and would remove the
  dependency altogether; whether Drizzle's adapter supports it is *(unverified)*; ADR-0004's
  internal adapter makes either choice local to the framework.

---

## 7. Conflicts with current decisions (report, do not silently pick)

| Where | Says | This proposal |
|---|---|---|
| docs/00 **D15** | "One `pnpm dev` runs API + UI" | `npm run dev` |
| docs/00 **D10** | SQLite/libSQL is Tier 2 | SQLite as the *default for new apps* (still Tier 2 for production support) |
| **ADR-0016** / **ADR-0018** | before 1.0, publish `0.x-next.N` on `next` | entry points (`create-strutvane`, `strutvane`) publish plain `0.x.y` on `latest`; libraries may keep `next` (generated apps pin exact versions either way) |
| **ADR-0006** | `sv up` / `sv down`; `--docker=commit` | `node strut up/down`; `--commit-docker` |
| docs/05 §1, §2, §4 | `npm create strutvane@next`, `pnpm sv …`, `decimal(12,2)`, `belongsTo(Customer)` | `@latest`, `node strut …`, colon syntax |
| create-strutvane README | multi-PM, `--install` off by default | npm only, setup on by default |

---

## 8. Open questions

1. Should `--yes` start Docker when Docker is available, or always use SQLite for predictability?
   (Proposal: `--yes` = SQLite; Docker only when `--db postgres|mysql` is given.)
2. Seed demo data by default (a few sample records so the admin UI is not empty)? Proposal: ask in
   the review step only for the Admin UI starter; default Yes; `--demo/--no-demo`.
3. Remember preferences like create-next-app ("reuse previous settings")? Useful for teams;
   stored in the user's config directory, never in the project. Proposal: later.
4. Open the browser when `dev` starts? Proposal: no (prints the URL; `--open` flag).

## 9. ADRs to write if accepted

1. Generated apps use **npm only** and the **`node strut`** project CLI (supersedes the `sv` alias
   and the multi-PM support; updates D15, docs/05).
2. **Entry-point packages publish on `latest` before 1.0** (amends ADR-0016 / ADR-0018).
3. **Create runs setup**: install, database, migrations, seed, git; `npm run setup` resumes;
   default database SQLite once persistent identity works there (amends D10 wording, docs/05 §2).
4. **Shell-safe field syntax** (docs/05 §4).

---

## 10. Proposed transcript: a user's first 5 minutes (Windows 11, Windows Terminal, PowerShell)

Assumes Node 24.3+ (npm 11), git and Docker Desktop installed but not running, and the execution
policy allowing npm's `.ps1` (otherwise the user types `npm.cmd create …`, or runs
`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once, as the install page explains).
Times are targets *(unverified until built)*.

```text
PS C:\Users\asha\code> npm create strutvane@latest acme-portal
Need to install the following packages:
create-strutvane@0.3.0
Ok to proceed? (y) y

┌  Strutvane 0.3.0: new project
│
◇  What are you building?
│  Full-stack app (API + UI)
│
◇  Which UI starter?
│  Admin app (generated screens from your models)
│
◇  How should people sign in?
│  Email + password
│
◇  Teams? (each customer company sees only its own data)
│  No
│
◇  Which database?
│  PostgreSQL
│
◇  How will you run PostgreSQL locally?
│  Docker: start it for me now
│
◇  Extras
│  Logs + log viewer, Email (Mailpit in Docker)
│
◇  Tests
│  Vitest (unit + feature)
│
◇  Create a git repository with a first commit?
│  Yes
│
◇  Review ─────────────────────────────────────────────────╮
│                                                           │
│  Folder     C:\Users\asha\code\acme-portal                │
│  Stack      Full-stack, Admin UI (React)                  │
│  Sign-in    Email + password                              │
│  Database   PostgreSQL 18 in Docker (port 5432)           │
│  Services   Mailpit (SMTP 1025, inbox 8025)               │
│  Extras     Logs + log viewer                             │
│  Tests      Vitest     Git  yes                           │
│                                                           │
├───────────────────────────────────────────────────────────╯
│
◇  Create the project?
│  Create it
│
◇  Files written (64 files)                                  0.2s
◇  Secrets generated in .env (APP_KEY, AUTH_SECRET, DB_PASSWORD, SEED_ADMIN_PASSWORD)
◇  Ports checked (3000, 5432, 1025, 8025 free)
◇  Dependencies installed with npm (212 packages)           41s
│
▲  Docker is installed but not running.
│
◇  How do you want to continue?
│  Start Docker Desktop and wait
│
◇  Docker is running (Docker Desktop 4.5x, Compose v2)      23s
◇  Services healthy: postgres, mailpit                     11s
◇  Migrations run (7, including sign-in tables)            1.4s
◇  Database seeded (roles; first admin)                    0.6s
◇  Git repository created (main, 1 commit)                 0.3s
│
◇  Ready ──────────────────────────────────────────────────╮
│                                                           │
│  App          http://localhost:3000                        │
│  API docs     http://localhost:3000/docs                   │
│  Mail inbox   http://localhost:8025                        │
│                                                           │
│  Admin        admin@acme-portal.test                       │
│  Password     q7Vd-3kPz-Xm2c-8RtL   (shown once; also     │
│               SEED_ADMIN_PASSWORD in .env)                 │
│                                                           │
│  Every day:   cd acme-portal; npm run dev                  │
│  Commands:    node strut help                              │
│  Teammates:   npm run setup   (after git clone)            │
│                                                           │
├───────────────────────────────────────────────────────────╯
│
◇  Start the development server now?
│  Yes
│
└  Starting acme-portal (Ctrl+C to stop)

> acme-portal@0.1.0 dev
> node strut dev

  Strutvane 0.3.0  development
  ➜  App + API   http://localhost:3000      (UI: Vite 8, HMR on)
  ➜  Database    postgres 127.0.0.1:5432/acme_portal   ok
  ➜  Logs        http://localhost:3000/_strutvane/logs
  Watching app/, config/, database/, .env for changes
```

The browser shows the sign-in page; Asha signs in with the admin password. In a second
PowerShell tab:

```text
PS C:\Users\asha\code> cd acme-portal
PS C:\Users\asha\code\acme-portal> node strut make:model Customer name:string:120 email:string:unique
  created  app/models/customer.model.ts
  created  database/migrations/2026_11_14_101502_create_customers.ts
  created  database/factories/customer.factory.ts
  created  database/seeders/customer.seeder.ts
  created  app/policies/customer.policy.ts
  API      GET/POST /api/v1/customers, GET/PATCH/DELETE /api/v1/customers/:id
  UI       Customers (list, create, detail, edit), added to the menu
  Next     node strut migrate

PS C:\Users\asha\code\acme-portal> node strut make:model Invoice number:string:40:unique amount:decimal:12,2 customer:belongsTo:Customer status:enum:draft,sent,paid
  created  app/models/invoice.model.ts
  created  database/migrations/2026_11_14_101544_create_invoices.ts
  ... (same as above)
  Next     node strut migrate

PS C:\Users\asha\code\acme-portal> node strut migrate
  ✔ 2026_11_14_101502_create_customers   12ms
  ✔ 2026_11_14_101544_create_invoices    15ms
```

The first tab logs `app/models changed, restarting API (0.8s)`; the browser menu now shows
**Customers** and **Invoices** without a reload of the dev server. Later that day:

```text
PS C:\Users\asha\code\acme-portal> npm test
 ✓ tests/unit/env.test.ts (3)
 ✓ tests/feature/health.test.ts (2)
 Test Files  2 passed (2)

PS C:\Users\asha\code\acme-portal> node strut down
  ✔ Stopped postgres, mailpit (data kept; `node strut down --volumes` deletes it)
```

Next morning, after a reboot: `npm run dev` notices the database port is closed, runs
`node strut up` itself (offering to start Docker Desktop if needed), then serves the app.

---

## Sources (read 2026-11-14)

- Laravel installer source: <https://github.com/laravel/installer/blob/master/src/NewCommand.php>
- Laravel installation (Laravel 13 / master): <https://laravel.com/docs/master/installation>
- `laravel/laravel` 13.x `composer.json` scripts: <https://github.com/laravel/laravel/blob/13.x/composer.json>
- Laravel Sail: <https://laravel.com/docs/master/sail>; `sail:install` source: <https://github.com/laravel/sail/blob/1.x/src/Console/InstallCommand.php>
- Laravel Prompts: <https://laravel.com/docs/master/prompts>
- npm init / create (v11): <https://docs.npmjs.com/cli/v11/commands/npm-init>
- create-next-app (updated 2026-09-29): <https://nextjs.org/docs/app/api-reference/cli/create-next-app>
- AdonisJS installation (v7): <https://docs.adonisjs.com/guides/getting-started/installation>; create-adonisjs README: <https://github.com/adonisjs/create-adonisjs>
- create-t3-app: <https://create.t3.gg/en/installation>; start-database.sh issues: <https://github.com/t3-oss/create-t3-app/issues/1834>, <https://github.com/t3-oss/create-t3-app/issues/1853>
- create-nuxt (Nuxt 4): <https://nuxt.com/docs/4.x/api/commands/init>
- create-redwood-app: <https://docs.redwoodjs.com/docs/create-redwood-app>
- npm.ps1 argument bug and fix: <https://github.com/npm/cli/issues/7375>, <https://github.com/npm/cli/pull/8278>
- npm 12 install scripts off by default: <https://github.com/npm/cli/pull/9424>; coverage: <https://thehackernews.com/2026/07/npm-12-disables-install-scripts-by.html>
- PowerShell execution policies: <https://learn.microsoft.com/powershell/module/microsoft.powershell.core/about/about_execution_policies>
- Node.js child_process (.cmd/.bat, DEP0190): <https://nodejs.org/api/child_process.html>; node:sqlite: <https://nodejs.org/api/sqlite.html>
- Docker Compose `up` (`--wait`, `--wait-timeout`): <https://docs.docker.com/reference/cli/docker/compose/up/>
- Local experiments: argument passing through `node`, `npm run`, `npm exec`, `npx`, `node --run` and `.cmd` shims in Windows PowerShell 5.1 and cmd.exe (Node 24.21.0, npm 11.19.0), 2026-11-14; `Get-Alias sv`; `Get-Command npm`.
