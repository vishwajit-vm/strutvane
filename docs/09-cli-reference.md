# 09 — CLI Reference: `strutvane` / `pnpm sv`

The CLI is the "artisan" of Strutvane: one entry point for creating projects, adding packages, generating code, running the database and operating the app.

| Item | Value |
|------|-------|
| npm package | `strutvane` (unscoped launcher, bin `strutvane`), implemented in `@strutvane/cli` |
| Starter | `create-strutvane` → `npm create strutvane@next` |
| In projects | `package.json` script `"sv": "strutvane-cli"` (the bin of the project's own `@strutvane/cli`) → `pnpm sv <command>` (also `npm run sv --`, `yarn sv`, `bun sv`). `pnpm sv help` therefore lists the project's commands; the global `strutvane` launcher answers `help` itself (§1.1) |
| Without install | `npx strutvane <command>` / `pnpm dlx strutvane <command>` |

## 1. Core rules

### 1.1 Global launcher delegates to the local version

1. `strutvane` (global, or via npx) looks for a **project** starting at the cwd and walking up. A folder counts as a project only when:
   - its `package.json` lists `@strutvane/cli` in `dependencies` or `devDependencies`, or it contains `strutvane.config.ts`;
   - it is not a file-system or drive root, not the OS temp directory itself, and not a folder above the user's home directory;
   - on POSIX, it is owned by the current user.

   The search stops at the first folder that breaks these rules, and at the first project folder found (if that folder is owned by someone else, there is no project). A bare `package.json` never makes a folder a project. The launcher and `@strutvane/cli` apply the same rules.
2. **If the project has `node_modules/@strutvane/cli`, the launcher delegates project commands to it.** Generators and runtime always match the versions pinned in `package.json`.
3. **Never delegated:** `--version`, `help` (and a bare `strutvane` with no command), `new` and `create`. The launcher always answers these itself.
4. Without a local CLI, only project-less commands run: `new`, `create`, `doctor --global`, `--version`, `help`.
5. A version mismatch between global and local is reported once as info, never as an error.

### 1.2 Syntax

- Colon syntax is canonical, with a space alias: `sv make:model Invoice` ≡ `sv make model Invoice`.
- Positional arguments come first, then flags. Boolean flags accept `--no-<flag>`.
- **Unique prefixes are accepted** for long commands (`sv mi:st` → `migrate:status`) when unambiguous. An exact name always beats a prefix.
- **Destructive commands need their exact name** (or an exact alias). A prefix that would select one (`sv migrate:fr`) is reported as unknown, with the full name suggested.
- `sv help <command>` and `sv <command> --help` show usage, examples and a docs link.

### 1.3 Universal flags

| Flag | Meaning |
|------|---------|
| `--yes`, `-y` | Accept all defaults; never prompt (non-interactive) |
| `--no-interactive` | Fail instead of prompting when input is missing (CI) |
| `--dry-run` | Show what would happen; write nothing (**every generator and installer supports it**) |
| `--diff` | With `--dry-run`: unified diff per file; without: show diff before confirming |
| `--force` | Overwrite non-owned generated files (owned / edited files are never overwritten; use `eject`/`upgrade` merges) |
| `--json` | Machine-readable output (stable schema per command) for CI and tooling |
| `--cwd <path>` | Run as if in another directory |
| `--env <name>` | Load `.env.<name>` over `.env` (e.g. `--env test`). The name must be a plain name. Variables already set to a non-empty value in the process environment win. |
| `--verbose`, `-v` / `--quiet`, `-q` | Log level |
| `--no-color` | Plain output (auto when `NO_COLOR` or not a TTY) |

### 1.4 Exit codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | Generic failure |
| 2 | Invalid usage (unknown command/flag, bad argument) |
| 3 | Validation failed (model definition, config, env) |
| 4 | Conflict: merge conflicts written, or the target exists and is owned |
| 5 | Database error (connection, migration failure) |
| 6 | Pending action required (e.g. unapplied migrations with `--check`) |
| 7 | Incompatible versions (plugin / package compat range) |
| 130 | Interrupted (Ctrl+C) |

## 2. Project commands

| Command | Description | Key flags |
|---------|-------------|-----------|
| `strutvane new <name>` / `npm create strutvane@next <name>` | Create a project (prompts: [05 §2](05-developer-experience.md#2-npm-create-strutvanenext)) | `--preset full\|api\|ui`, `--db postgres\|mysql\|sqlite\|azure-postgres\|azure-mysql`, `--auth email,google,microsoft,github,magic,passkey`, `--tenancy none\|shared\|schema\|database`, `--extras queue,cache,mail,audit,otel,versioning`, `--docker` / `--no-docker`, `--docker=commit`, `--pm pnpm\|npm\|yarn\|bun`, `--git` / `--no-git`, `--template <git-url\|preset-pkg>` |
| `sv add <package>` | Install and run a package's installer (deps, config, env, provider, migrations, routes, pages, tests) | `--dry-run --diff`, package-specific flags (e.g. `sv add auth --methods email`) |
| `sv remove <package>` | Reverse an installer. Keeps edited files and lists them. | `--keep-data`, `--dry-run` |
| `sv dev` (`pnpm dev`) | API + UI + watchers (registry, types, migration drift warning) on one port | `--port`, `--api-only`, `--ui-only`, `--open`, `--inspect` |
| `sv build` (`pnpm build`) | Compile registry, typecheck, build server bundle + static UI | `--analyze`, `--sourcemap` |
| `sv start` (`pnpm start`) | Run the production build | `--role api\|worker\|scheduler\|all` |
| `sv up` / `sv down` | Start/stop **local** Docker services from `docker/compose.yaml` (git-ignored); waits for health, then migrates + seeds on first run | `--fresh`, `--no-seed`, `sv down --volumes` |
| `sv doctor` | Diagnose Node/pm versions, env completeness, DB connectivity, pending migrations, plugin compatibility, RLS status, unsafe flags, permission orphans | `--fix`, `--global`, `--json` |
| `sv about` | Versions of every Strutvane package, drivers, config summary | `--json` |
| `sv upgrade` | Bump Strutvane packages; run codemods; three-way merge ejected files | `--to <version>`, `--channel next\|canary`, `--dry-run` |
| `sv key:generate` | Generate `APP_KEY` into `.env`. Replacing a non-empty key needs `--force` and is guarded like a destructive command (§4); every `APP_KEY` line is replaced. | `--show`, `--force` |
| `sv env:check` | Compare `.env` with `.env.example`: missing, unknown, invalid keys. Malformed lines are reported by `file:line` only; values are never printed. | `--env`, `--strict` |
| `sv env:sync` | Add missing keys from `.env.example` to `.env` with defaults | `--dry-run` |
| `sv env:encrypt` / `sv env:decrypt` | Encrypt/decrypt an env file for team sharing (key from `STRUTVANE_ENV_KEY`) | `--env production` |
| `sv config:show [key]` | Print the resolved config (secrets masked) | `--json` |

## 3. Generators: `make:*`

All generators:

- support `--dry-run --diff --force --json`
- register output automatically in `.strutvane/registry.gen.ts` (no manual wiring)
- print the files created and the follow-up command

| Command | Creates | Key flags |
|---------|---------|-----------|
| `make:model <Name> [fields…]` | `app/models/<name>.model.ts` (+ policy, factory, seeder, test, permissions; API + UI auto-registered) | Field syntax `name:type[:modifier…]`; `--all` (resource + policy + factory + seeder + test), `--no-api`, `--no-ui`, `--tenant`, `--no-tenant`, `--audit`, `--soft-deletes`, `--timestamps`, `--seed <n>`, `--from-table <table>` |
| `make:resource <Model>` | `app/resources/<name>.resource.ts` (L1/L2 API + UI behaviour) | `--actions approve,send`, `--hooks beforeCreate,afterUpdate` |
| `make:policy <Model>` | `app/policies/<name>.policy.ts` (deny-by-default; role names from `config/auth.ts`, see below) | `--template default\|owner\|tenant-admin\|readonly` |
| `make:action <Model> <action>` | Adds an action to the resource (route + permission + UI button) | `--input`, `--bulk`, `--confirm` |
| `make:migration <name>` | Hand-written migration with schema builder (data migrations, special DDL) | `--sql` (raw SQL file), `--table <t>` |
| `make:seeder <Name>` | `database/seeders/<name>.seeder.ts` | `--model <Model>`, `--count` |
| `make:factory <Model>` | `database/factories/<name>.factory.ts` (field-type-aware fake data) | — |
| `make:service <Name>` | `app/services/<name>.service.ts` (+ unit test) | `--model` |
| `make:controller <Name>` | Custom controller + routes entry | `--resource`, `--api-version v2` |
| `make:route <METHOD> <path>` | Route in `app/http/routes/api.ts` | `--controller`, `--permission` |
| `make:middleware <Name>` | `app/http/middleware/<name>.ts` | `--global` |
| `make:job <Name>` | `app/jobs/<name>.job.ts` (typed payload, retries, backoff) | `--queue <name>`, `--unique`, `--schedule "<cron>"` |
| `make:event <Name>` / `make:listener <Name>` | Domain event (typed) / listener (sync or queued) | `--event <Name>`, `--queued` |
| `make:mail <Name>` | Mail class + React Email / MJML template | `--markdown` |
| `make:command <name>` | Custom CLI command in `app/commands/` (available as `sv <name>`) | — |
| `make:provider <Name>` | Service provider in `app/providers/` | — |
| `make:field <name>` | Custom field type (DB column + validation + OpenAPI + UI widget + filter ops) | — |
| `make:test <name>` | Feature/unit/e2e test | `--unit`, `--e2e`, `--model` |
| `make:page <path>` | Custom UI page in `web/pages/` (auto-routed) | `--resource`, `--layout` |
| `make:widget <Name>` | Dashboard widget | `--type stat\|chart\|table` |
| `make:plugin <name>` | Plugin package skeleton (see §11) | `--with-installer`, `--with-generator` |

**`make:policy` templates.** Policies use the role vocabulary of the generated `config/auth.ts` ([07 §2.7](07-package-auth.md#27-seed-data)): `admin`, `member`, `viewer` and `owner` (a tenant's creator, held only inside that tenant). The role map grants on top of these rules, and a policy `deny` still wins ([07 §4.4](07-package-auth.md#44-permission-auto-sync-from-models)).

| Template | Rules |
|----------|-------|
| `default` | `viewer`, `member`, `admin` read (`viewAny`, `view`); `admin` writes (`create`, `update`, `delete`, `export`, plus `restore`/`forceDelete` with soft deletes) |
| `owner` | `member` and `admin` list and create; `member` views, updates and deletes only records whose `ownerId` is the actor (needs an `ownerId` field); `admin` views and writes everything |
| `tenant-admin` | Tenant administrators manage: `admin` or `owner` with `scope: 'tenant'` write; all four roles read, also with `scope: 'tenant'` |
| `readonly` | `viewer`, `member`, `admin` read; nothing else is allowed |

### 3.1 Field syntax (CLI)

```
name:type[(args)][:modifier[(args)]]…

title:string(200):required:searchable
amount:decimal(12,2):min(0):sortable
"status:enum(draft,sent,paid):default(draft):filterable"     # quote when using parentheses in shells
customer:belongsTo(Customer)
tags:manyToMany(Tag)
meta:json:optional
```

Types and modifiers mirror the `field.*` builder catalogue in [05 §4.3](05-developer-experience.md#43-field-type-catalogue-v1-target). Running without fields opens an interactive field builder with autocomplete.

## 4. Database

| Command | Description | Key flags |
|---------|-------------|-----------|
| `sv migrate` | Diff models ↔ DB → write a timestamped SQL migration → apply → sync permissions | `--dry-run` (print SQL), `--name <name>`, `--generate-only`, `--no-sync`, `--tenants` (all tenant DBs/schemas), `--connection`, `--check` (exit 6 if drift/pending; CI) |
| `sv migrate:status` | Applied / pending / drift report | `--json` |
| `sv migrate:rollback` | Roll back the last batch (or `--step n`) | `--step`, `--to <migration>` |
| `sv migrate:reset` | Roll back everything | `--force --i-understand` outside local/test/development (production guard below) |
| `sv migrate:fresh` | Drop all tables, migrate from scratch | `--seed`; production guard below |
| `sv migrate:squash` | Squash applied migrations into a baseline | `--before <date>` |
| `sv db:seed` | Run `database.seeder.ts` or a named seeder | `--class <Seeder>`, `--count` |
| `sv db:pull` | **Introspect an existing DB** into `app/models/*.model.ts` (brownfield) | `--tables`, `--schema`, `--overwrite` |
| `sv db:wipe` | Drop all tables, views and types | production guard below |
| `sv db:shell` | Open `psql` / `mysql` / `sqlite3` with current credentials | — |
| `sv db:studio` | Local browser DB explorer (read-mostly, local env only) | `--port` |
| `sv db:backup` / `sv db:restore` | Local dumps for dev data (not a production backup tool) | `--file` |

**Production guard:** destructive commands (`migrate:fresh`, `migrate:reset`, `migrate:rollback`, `db:wipe`, `db:restore`, and a contributed command that replaces one of them) run without confirmation **only** when `APP_ENV` is `local`, `test`, `testing` or `development`. In every other case, including an unset `APP_ENV` (the runtime then defaults to production), they need both `--force` and `--i-understand`. Even then they are audited.

`APP_ENV` is resolved the way the runtime resolves it, and the resolved value is handed to the command, so the guard and the command always agree:

1. the process environment (set but empty, `APP_ENV=`, counts as unset);
2. `.env.<name>` when `--env <name>` is given;
3. `.env`.

The first non-empty value wins. Values are trimmed and compared case-insensitively. `sv key:generate --force` replacing a non-empty `APP_KEY` is guarded the same way, because a new key makes existing sessions and encrypted data unreadable.

## 5. API

| Command | Description | Key flags |
|---------|-------------|-----------|
| `sv routes` | All registered routes: method, path, name, permission, source (auto/model/resource/custom) | `--method`, `--path`, `--model`, `--json` |
| `sv models` | Registered models with fields, relations, options | `--model`, `--json` |
| `sv api:docs` | Export OpenAPI 3.1 (`openapi.json`/`yaml`) | `--out`, `--version v1` |
| `sv api:client` | Generate a typed TS client SDK for other apps | `--out`, `--format fetch\|tanstack-query` |
| `sv api:version <v2>` | Create a new API version (copies route set, marks v1 deprecated with Sunset date) | `--sunset <date>` |
| `sv api:manifest` | Print `/.well-known/strutvane.json` for an actor | `--as <userId>` |

## 6. Auth, tenancy and audit (from `@strutvane/auth`)

| Command | Description |
|---------|-------------|
| `sv auth:user:create` | Create a user (`--email --role --tenant --password-prompt`) |
| `sv auth:role:create <name>` | Create a role (`--inherits`, `--tenant`) |
| `sv auth:permissions` | List the permission catalogue (`--orphans`) |
| `sv auth:permissions:sync` | Reconcile code ↔ DB (`--dry-run`, `--prune`) |
| `sv auth:matrix` | Role × permission matrix (`--format md\|csv\|json`) |
| `sv auth:explain` | Explain a decision (`--actor --action --resource`) |
| `sv auth:keys:rotate` / `sv auth:secret:rotate` | Rotate JWKS signing keys / auth secret |
| `sv auth:token:create` / `auth:token:revoke` | Service and personal API tokens |
| `sv auth:sso:add` | Add a SAML/OIDC connection for a tenant |
| `sv tenant:create` / `tenant:list` / `tenant:suspend` / `tenant:export` / `tenant:delete` / `tenant:migrate` | Tenant lifecycle |
| `sv audit:verify` / `audit:prune` / `audit:export` | Verify hash chain, apply retention, export |

## 7. UI (from `@strutvane/ui`)

| Command | Description | Key flags |
|---------|-------------|-----------|
| `sv ui:add <item>` | Copy a registry component/layout/theme into `web/` (wraps `shadcn add @strutvane/<item>`) | `--registry @acme`, `--overwrite` |
| `sv ui:diff <item>` / `sv ui:update <item>` | Show / three-way-merge upstream component changes | `--all` |
| `sv ui:theme create <name>` / `ui:theme apply <name>` | Theme token files | `--from <preset>` |
| `sv ui:pages` | List auto-generated pages and which are overridden | `--from-openapi <url>` (UI-only: re-infer and diff mapping) |
| `sv ui:locale add <code>` | Scaffold a translation file with all keys | — |

## 8. Eject

| Command | Effect |
|---------|--------|
| `sv eject api <Model>` | Write full CRUD controller/handlers source into `app/http/controllers/` |
| `sv eject api <Model> --action create` | Eject a single handler |
| `sv eject ui <Model> [--page list\|form\|show]` | Write full page source into `web/pages/<resource>/` |
| `sv eject ui --components` | Copy all renderer components into `web/components/strutvane/` |
| `sv eject config <package>` | Publish a package's full default config (like Laravel's `vendor:publish`) |
| `sv eject templates <generator>` | Copy generator templates into `.strutvane/templates/` to customise future generated files |

Ejections are recorded in `.strutvane/lock.json` and are merged on `sv upgrade` (three-way, with conflict markers and exit code 4).

## 9. Queue, schedule, cache and runtime

| Command | Description |
|---------|-------------|
| `sv queue:work` | Run workers (`--queue default,mail`, `--concurrency`, `--max-jobs`, `--once`) |
| `sv queue:failed` / `queue:retry <id\|all>` / `queue:flush` | Failed-job management |
| `sv queue:monitor` | Live queue stats in the terminal |
| `sv schedule:list` / `schedule:run` / `schedule:work` | Scheduled tasks (cron in code) |
| `sv cache:clear` / `cache:forget <key>` | Cache management |
| `sv tinker` | Typed REPL with the app booted: models, services, `as(user)` helper |
| `sv health` | Run health checks (DB, cache, queue, mail) like `/health` |

## 10. Testing helpers

| Command | Description |
|---------|-------------|
| `pnpm test` / `sv test` | Vitest with a test DB (auto-created; SQLite or Testcontainers per config) |
| `sv test --e2e` | Playwright against a built app |
| `sv test:db` | Prepare/refresh the test database |
| `sv test --changed` | Only tests affected by changed files |

## 11. Extensibility: commands from packages and plugins

- **Contribution:** packages and plugins contribute commands through their **service provider** (`provider.commands([...])`) or installer manifest. Contributed commands appear in `sv help` under the package's group (e.g. `auth:*`, `notify:*`).
- **Plugin scaffolding:**
  - `sv make:plugin <name>` (alias `plugin:create`) scaffolds a plugin package with a provider, installer, generator and tests.
  - `sv generator:create <name>` adds a custom generator (`sv make:<name>`) using `@strutvane/devkit`.
  - `sv preset:create <name>` packages config + plugins + template overrides as an organisation preset (`npm create strutvane -- --template @acme/strutvane-preset`).
- **Compatibility:** each plugin declares `strutvane.compat` (semver range). Incompatible plugins are refused with exit code 7 and a clear message (`sv doctor` lists them). A third-party plugin (any package outside `@strutvane/`) that declares no `strutvane.compat` is refused the same way and its code is never loaded. First-party `@strutvane/*` packages ship with the CLI and may omit the range.
- **Command API (devkit):**

```ts
import { defineCommand } from '@strutvane/cli'   // may move to @strutvane/devkit later (same shape)
export default defineCommand({
  name: 'reports:send', description: 'Send monthly reports',
  args: { month: { type: 'string', required: false } },
  flags: { dryRun: { type: 'boolean' } },
  async run({ args, flags, app, log }) { /* app = booted container */ },
})
```

## 12. Shell completion, platforms and telemetry

- **Shell completion:** `sv completion bash|zsh|fish|powershell` prints a script. Completions include commands, flags, model names and registry items.
- **Windows** is first-class:
  - PowerShell and cmd supported.
  - Paths normalised.
  - No bash-only scripts in generated projects.
  - The CI matrix covers Windows, macOS and Linux.
  - Long-path-safe file writes.
  - Child processes never resolve executables from the current directory: programs come from `PATH` only (`NoDefaultCurrentDirectoryInExePath=1`), and `npx` is started as `node npx-cli.js` without a shell where available. The fallback through the `npx.cmd` shim accepts only plain names and flags.
- **Secrets on screen:** `sv env:check` and `sv doctor` report malformed `.env` lines by `file:line` only, never by their text. Dry-run previews and diffs of `.env`/`.env.*` files redact values by default (devkit).
- **Telemetry is off by default.** `sv telemetry enable` opts in to anonymous usage counts (command name, duration, versions, OS). It never collects code, paths, env values or identifiers. `STRUTVANE_TELEMETRY=0` always disables it. The policy is documented publicly.
- **Updates:** a non-blocking "new version available" notice at most once a day. Disable with `STRUTVANE_NO_UPDATE_NOTIFIER=1`.
