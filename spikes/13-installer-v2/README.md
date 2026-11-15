# Spike 13: installer v2 (`npm create strutvane@latest my-app`)

**Question:** can the installer follow Laravel's flow on **npm only** (questions → review →
files → secrets → ports → database → install → migrate + seed → git → `npm run dev`), stay safe
on Windows, resume with `npm run setup`, and offer a Sail-like "everything in Docker" mode?

**Answer: yes.** One command ends with a migrated, seeded app in both modes, every failure the
design names has a recovery and an exit code, and `npm run setup` continues from the first
unfinished step. Verified on Windows 11 / PowerShell 5.1 / Node 24.21.0 / npm 11.19.0 /
Docker 29.8.2 on 2026-11-14.

**Evidence:** 308 tests (+1 placeholder skipped when Docker is missing), `npm test` green:
- question flows with a scripted prompter, flags/CI mode, npm's swallowed flags;
- the step runner with a fake spawner: success, every failure, recovery choices, resume;
- Windows argument safety with a real child process;
- a **real** end-to-end run (real npm, git, SQLite, `node strut dev`) including a real failure
  and a real `npm run setup` resume;
- **real Docker** runs for SQLite, MySQL 8.4 and PostgreSQL 18 in Docker mode (unique
  `-p s13-<kind>-<random>` names, removed afterwards; skipped when Docker is not available).

Run it: `npm install`, then `npm test`, or try it: `node src/cli.ts my-app` (Node 24 runs the
TypeScript directly).

## First run (PowerShell, `--yes`, Docker running)

```text
PS C:\Users\me\AppData\Local\Temp\s13-transcript-0087d3> node C:\personal_projects\strutvane\spikes\13-installer-v2\src\cli.ts acme-portal --yes

Strutvane 0.0.0-spike.13: new project

✔ Files written (33 files in C:\Users\me\AppData\Local\Temp\s13-transcript-0087d3\acme-portal)  41ms
✔ Secrets generated in .env (APP_KEY, DB_PASSWORD, DB_ROOT_PASSWORD, AUTH_SECRET)  1ms
✔ Ports checked (3000 free; 3306 free; 8025 free)  15ms
✔ Containers running and healthy (app, db, mailpit)  15.3s
✔ Dependencies installed with npm (added 13 packages)  4.8s
✔ Migrations run (3 new, 3 total); Admin created: admin@acme-portal.test; Database seeded  850ms
✔ Git repository created (main, 1 commit)  1.9s

── Ready ───────────────────────────────────────────────────────
   App          http://localhost:3000
   Database     MySQL in Docker, 127.0.0.1:3306/acme_portal
   Mail inbox   http://localhost:8025
   Admin        admin@acme-portal.test
   Password     not shown here. Set one with: node strut user:password admin@acme-portal.test
   Every day:   cd acme-portal; npm run dev
   Commands:    node strut help
   Teammates:   npm run setup   (after git clone)
   The same project without questions:
   npm create strutvane@latest acme-portal -- --stack full --ui admin --auth email --features none --no-teams --db mysql --docker --testing vitest --git --yes
────────────────────────────────────────────────────────────────
Done. Next: cd acme-portal; npm run dev
exit code: 0
```

(Plain output because there is no terminal: the "… step" start lines are omitted here. In a real
terminal the same steps show clack spinners, and the admin's one-time password is shown once.)

**Since 2026-11-15** (design prompt, the full blueprint §2.1 question list, ADR-0021, Docker
pass-throughs) the same `--yes` run asks nothing more, but writes more files (the packages the
default answers bring as stubs, `strutvane.json`, `config/*` per answer, the CI workflow, editor
settings) and the Ready box gains a Design and a Restyle line, and a longer "same project" command
(one flag per question, built from the registry). Not re-recorded with Docker; see the tests.

Try it: `node src/cli.ts my-app --db sqlite --yes`, or answer everything:
`node src/cli.ts my-app --mode custom`. A full non-interactive example:

```text
npm create strutvane@latest acme -- --stack full --design vivid --auth magic-link --security passkeys \
  --teams --tenant subdomain --db postgres --docker --features billing,search \
  --feature-option billing.provider=paddle --ai --ai-provider anthropic --deploy docker \
  --dev-container --yes
```

## What it does

**Questions: one data-driven registry** (`src/question-registry.ts`). One array holds every
question of blueprint §2.1 (rows 1–36; row 37 "start the dev server?" is asked after setup):
id, group, title, choices (with the packages each choice brings), default, flag, `when` rule and
★ (Recommended). The engine, flags, `--help`, review, "Change an answer", the "same project
without questions" command, `setup.json` resume, swallowed-flag detection and the package list
all loop over that array; there is no per-question switch.

- **Opener:** "How do you want to set up acme?" Recommended (the 7 ★ questions: stack, design,
  sign-in, teams, database, Docker, AI assistants) or Custom (about 35, grouped). `--mode`.
- **Every question has a flag**; `--yes`, `CI` or no TTY take the defaults. Secrets are never
  flags: `STRUT_DB_PASSWORD`, `STRUT_ADMIN_PASSWORD`.
- **Asked whenever they apply, in both modes:** your own server's connection details, a typed
  admin password, and the follow-up questions of picked packages (they follow from a choice and
  have no safe default).
- A later answer can switch on an earlier question (teams, row 11, enables SSO, row 8): the
  engine asks newly applying questions in another pass.

| Group | Flags (default) |
|---|---|
| App | `--stack full\|api` (full) · `--design crisp\|vivid` (crisp) · `--ui admin\|blank` (admin) |
| Sign-in | `--auth email\|magic-link\|none` (email) · `--security 2fa,verification,passkeys,registration` (2fa,verification; registration OFF, F-02) · `--social google,...` (none) · `--sso` (no; needs teams) · `--api tokens\|oauth\|none` (tokens; forced to tokens without sign-in) · `--roles basic\|extended` |
| Teams | `--teams` (no) · `--tenant switcher\|subdomain` |
| Data | `--db mysql\|postgres\|sqlite` (mysql; postgres with teams) · `--docker` (yes for server DBs **only when Docker is running**) · `--db-host/--db-port/--db-name/--db-user` (127.0.0.1, 3306/5432, root/postgres) · `--db-socket`, `--db-sslmode` (prefer), `--db-ssl-ca` · `STRUT_DB_URL` · `--admin-email` (admin@&lt;name&gt;.test) · `--admin-password generate\|type` · `--sample-data` (yes for the admin starter) |
| Infra | `--cache-store database\|redis` · `--storage local\|s3` · `--mailer later\|smtp\|resend\|postmark\|ses` · `--locale en` · `--timezone` (this computer) · `--currency USD` |
| Features | `--features <catalogue ids>\|none` (log-viewer) · `--feature-option <id>.<question>=<value>` |
| Quality / Workflow | `--testing vitest\|vitest-playwright\|none` · `--agents` (yes) · `--git` · `--ci` · `--editor` (yes) · `--dev-container` (no) |
| Security / AI / UI / Ops | `--security-profile standard\|strict` · `--activity-log` (yes with teams) · `--ai` · `--ai-provider anthropic\|openai\|google\|ollama` · `--mcp-server` · `--ui-languages en,...` · `--appearance system\|light\|dark` · `--pwa` · `--live-updates` · `--monitoring none\|otel` · `--deploy later\|node\|docker` |

**Question 22 (extra features)** reads a catalogue index (`src/data/catalogue.json`, a 33-entry
fixture of what hub CI would publish): only **published** entries whose `frameworkRange`
includes the framework being installed (0.1.0) are offered; the popular ones grouped by
category first, then type-to-search over the rest; picked packages' **declarative** follow-up
questions (billing: Stripe or Paddle?) come after. The index is untrusted: bad entries are
skipped (strict package-name pattern, so no path tricks; follow-ups that mention a key, secret,
token or password are refused).

**Generated from the answers:** `package.json` dependencies (every package as a `file:` stub
plus its lockfile link), `strutvane.json` (every answer incl. defaults, the packages, versions;
never a secret), `config/{app,api,auth,cache,filesystems,mail,security,monitoring,permissions,
tenancy,ai,ui}.ts`, `.env` keys (AI provider key written **empty**; the installer never asks for
it), `.github/workflows/ci.yml`, `.vscode/`, `AGENTS.md` (only with AI assistants), the sample-data
seeder, `deploy/README.md` + the public `/up` route for a deploy target.

**Containers (ADR-0021):** `--deploy docker` writes a committed multi-stage `Dockerfile`
(pinned `node:24-bookworm-slim`, `npm ci`, only `build/` + production deps, `USER node`,
`HEALTHCHECK` on `/up`, nothing secret copied) and a `.dockerignore` (`.env*`, `.git`,
`node_modules`, `storage/`, tests); `node strut docker:prod` is the documented later path.
`--dev-container` writes a committed `.devcontainer/` (app container only; `../.env` read at
runtime, optional). The local Sail-style `docker/compose.yaml` stays git-ignored (ADR-0006).

**Security rules:** no sign-in makes `config/api.ts` require API tokens (deny by default);
public registration is off; the first admin's password is generated with `crypto` and shown once
(interactive only), or typed masked (≥ 12 characters, `STRUT_ADMIN_PASSWORD` in CI) and then
passed to the seeder through the environment only: never in `.env`, `.env.example`,
`strutvane.json` or `setup.json` (tested by scanning every written file).

**Your own database server, without Docker** (consistency rows 40-44): MySQL (default), MariaDB
and PostgreSQL work against XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install or a remote
server, exactly like Laravel. Docker is never required: question 14 pre-selects Docker only when
it is installed and running. Without Docker npm installs first, then `node strut db:prepare` (the
app's own driver) logs in, tells MySQL from MariaDB (`DB_CONNECTION=mariadb`; the values are
mysql | mariadb | pgsql | sqlite, postgres accepted as pgsql), creates the database and
`<db>_test` when allowed or prints the exact one-line SQL and stops with exit 2, and on
PostgreSQL creates `<app>_owner` / `<app>_app` (NOSUPERUSER, NOBYPASSRLS, generated passwords in
`.env`; the administrator login is not kept) when the login may CREATEROLE, else prints the SQL
and warns loudly that a superuser login disables RLS. An empty password is allowed for
localhost/127.0.0.1/::1 with a warning and refused for remote hosts. A connection URL (type `url`
as the host, masked; `STRUT_DB_URL` in CI) is parsed and checked, written to `.env` only, and
never echoed. Errors are plain words mapped from driver codes (refused: "start MySQL in your
XAMPP/WAMP/MAMP/Laragon control panel", MAMP's 8889 on a Mac; unknown host; wrong password
ER_ACCESS_DENIED/28P01; missing database; timeout; TLS), and "Change the connection details"
lets you fix them and retry. Verified for real against MySQL 8.4, MariaDB 11 and PostgreSQL 18
throw-away servers (`test/own-server.e2e.test.ts`).

**Docker mode runs everything in the app container:** `npm run dev` (= `node strut dev`),
migrate and every `node strut` command, plus Sail-style pass-throughs `node strut shell` (bash,
or sh), `node strut npm|npx|node <args>`. Forwarded in Docker mode, run locally in host mode or
inside the container; arguments verbatim (no shell; tested with `a&b`, `$(...)`, `%PATH%`), exit
codes passed through.

**Steps** (state in `.strutvane/setup.json`, saved after every step): files (all-or-nothing) →
secrets → ports → database (Docker: `compose up -d --wait`) → install → migrate + seed → git.
Exit codes: 0 ready, 1 nothing created, 2 created but setup unfinished, 130 cancelled.

| Failure | What happens |
|---|---|
| Docker not installed / engine stopped | Use my own database server (asks the details) / Start or install Docker (shows how, waits) / Use SQLite / Retry / Skip / Stop; CI: exit 2 |
| Port busy before start / taken at `up` | next free port written to `.env`; at `up` (another program or a second installer won the race): only the port Docker names moves, 1–12 up at random, and `up` is retried, up to 5 tries, each named in a warning (verified: 4 installers at once all finish) |
| `npm ci` network error / Windows lock | one automatic retry (lock: after 2 s) |
| `npm ci` other / registry 401/403 | last 20 lines + log path + hint; Retry / Skip / Stop |
| Own DB server unreachable / login refused | plain-language cause (control panel, MAMP port, host name, password, TLS); Change the connection details / Retry / Skip (migrate waits) |
| Own DB server: no right to create the database | the exact one-line SQL for an administrator; exit 2; `npm run setup` continues |
| `node strut migrate` exit 3 | "database unreachable" with the fix; Retry / Skip |
| No git identity / git missing | the two `git config` commands / install hint; exit 2 |
| Secret path not ignored / staged | **no commit**, everything unstaged |
| Unexpected exception in a step | readable failure with the log path, never a crash |

## Findings

1. **npm swallows flags before `--`** (re-verified 2026-11-15 for every flag with real npm 11.19.0,
   `npm create` against a local package): `--db sqlite` leaves `npm_config_db=true` and `sqlite`
   as a stray positional (`--db=sqlite` keeps the value); `--teams` → `true`, `--no-teams` →
   `""`; npm's own settings differ: `--git` / `--editor` → `""`, `--no-git` → `false`.
   `--pwa` is split into `-p -w -a` (parseable, workspace) and the installer ran **inside a new
   folder named `--all`**. The installer now reads all of these correctly and prints the right
   `npm create … -- …` / `npx …` command for 57 of 60 flag forms. **Undetectable** (no trace at
   all): `--auth X` (expanded to npm's `--auth-type`, dropped as invalid, so the project silently
   gets the default sign-in) and `--ci` / `--no-ci` (expanded to `--cidr`). Renaming those two
   flags (`--sign-in`, `--ci-workflow`) is the only real fix; the message now warns about them.
   `--dev` turns into `--include=dev` without leaving a variable.
2. **`node <npm-cli.js>` without a shell is enough everywhere**: `npm_execpath` points at
   `npm-cli.js` under `npm create`; next to `node.exe` otherwise. Real-process test: `a&b`,
   `100%PATH%`, `^`, quotes and `title:string(120)` arrive intact.
3. **Bare `git`/`docker` are resolved through absolute PATH entries only** (F-25): `.`, relative
   entries and `.cmd/.bat` are never used.
4. **A shipped lockfile works with `file:` links and registry packages together.** The template
   ships `package-lock.json` (drivers pinned exactly, `sha512` integrity, versions ≥ 3 days old);
   the install is `npm ci --ignore-scripts`; `.npmrc` has `ignore-scripts=true`; only
   `package.json` → `strutvane.rebuild` names may run scripts (`npm rebuild <names>
   --ignore-scripts=false`). The e2e test proves a canary `postinstall` does not run on
   `npm install`, and does run when explicitly rebuilt (so the check is meaningful).
5. **`npm ci` into a Docker named volume works** (npm 11 in `node:24`): it empties the mount point
   instead of deleting it. A fresh named volume is **root-owned**, so the installer runs
   `chown <uid>:<gid> /app/node_modules` as root once; the host keeps only the empty mount point.
6. **Inside the container the dev server must listen on 0.0.0.0**, published as
   `127.0.0.1:APP_PORT` on the host; `APP_HOST` in compose does that, and the Host-header
   allowlist (403 for `evil.example`) still blocks DNS rebinding. Verified with a real request.
7. **`node:util.parseEnv` is the right reader**: unquoted `a#b` reads as `a`, so the writer quotes
   anything outside `[A-Za-z0-9_./:@,+-]` (single quotes, else double, else backticks for a value
   with both `'` and `"`), refuses CR/LF/NUL and the one value it cannot quote (all three quote
   kinds) before anything is written, never echoing the value, and round-trips 500 random values.
8. **The MySQL image has no "app owner vs app user" split by default; PostgreSQL's makes the app a
   superuser.** The PostgreSQL init script creates `<id>_owner` (migrations) and `<id>_app`
   (NOSUPERUSER, NOBYPASSRLS); the real test asserts `rolsuper|rolbypassrls = f|f` and that the
   owner owns `users`. Health checks use TCP on 127.0.0.1, so "healthy" includes init scripts.
9. **git's `user.useConfigOnly=true` gives a deterministic "no identity" failure**, which made a
   real resume test possible (`GIT_CONFIG_GLOBAL` + `GIT_CONFIG_NOSYSTEM`).
10. **Windows paths:** `os.tmpdir()` is an 8.3 short path (`VISHWA~1`) while git prints long
    paths; comparing folders needs `realpathSync.native`.
11. **`docker compose ... exec` with a bind mount + named volume** creates the empty
    `node_modules` mount point on the host; it is git-ignored and harmless.

## Security review findings folded in

F-02 registration off by default · F-12 shipped lockfile + `npm ci --ignore-scripts` +
`.npmrc` + rebuild allowlist · F-17 escaped `.env` writer, `.env` 0600 on POSIX, secrets 32
random bytes, resume re-checks secrets (placeholders such as `APP_KEY=changeme` are replaced),
`setup.json` holds no secret, the setup log redacts passwords handed to programs, `.gitignore`
covers `.env*`, `*.sqlite*`, `storage/`, `.strutvane/`, `docker/`, and the first commit is
guarded by `git check-ignore` plus a staged-file check · F-18 the admin password is never in
`.env`: generated per run, passed to the seeder via `STRUT_SEED_ADMIN_PASSWORD` only, shown once
interactively, `must_change_password` set, seeding refused for `APP_ENV=production|staging`,
`node strut user:password <email>` to set a new one · F-19 dev server on loopback (0.0.0.0 only
inside the container), Host allowlist · F-20 owner/app PostgreSQL roles, every published port on
127.0.0.1, no password on a command line · F-25 PATH resolution.

## Not verified / not done (honest list)

- **The interactive clack UI was not driven in a real terminal** (the tool has no TTY); the
  flows are proven with the scripted prompter only.
- **HMR and Vite** are not in the spike (the stub has no Vite); polling is set
  (`CHOKIDAR_USEPOLLING`, `STRUT_WATCH_POLLING`) but its effect is unverified. WSL2 is
  recommended in the generated README for fast watching on Windows *(unverified here)*.
- **Linux UID mapping** is written (`STRUT_UID/GID` from `process.getuid()`) and unit-tested, but
  was only run on Windows (Docker Desktop maps ownership there).
- **macOS and Linux runs, and CI on all three OSes** (requested on the design board): not done.
- `services:down --volumes` deletes data without asking (the design wants a confirmation).
- Fresh-clone onboarding: `node strut setup` needs `.strutvane/setup.json`; in the product it
  would run `npx create-strutvane@<version> --resume .`. Docker files are git-ignored (ADR-0006),
  so a teammate's Docker mode is recreated by setup.
- The installer depends on `@clack/prompts`; F-12 wants create-strutvane bundled with zero
  runtime dependencies.
- Redis/Valkey service: not added (the brief says "later").
- **Every package is a local `file:` stub** (design, ui, auth, logs, agent-tools, ...): the
  answers drive package.json, the lockfile and the config files only; the packages themselves are
  not built. Commands the generated files mention but the stub CLI lacks: `design:use`,
  `token:create`, `docker:prod`, `install:<name>`, `add`.
- **The production Dockerfile is built and run for real** (`docker.e2e.test.ts`, 2026-11-15):
  uid 1000, no `.env` in any layer or file, no secret value in `/app`, code not writable by the
  app user, HEALTHCHECK healthy on `/up`, runs with `--read-only`, `docker stop` exits 0 in
  about a second (SIGTERM handled). The first real build found it crashed at start (sources
  missing from `build/`), listened on 127.0.0.1 inside the container and ignored SIGTERM; fixed.
  The stages still reference `stubs/`, which a release drops. **The dev container was not built
  or run**; it has no database service (SQLite works; server databases need your own DB_*).
- **The clack `groupMultiselect` / `autocompleteMultiselect` pickers** (question 22) were not
  driven in a real terminal; the flows are proven with the scripted prompter only.
- **`--auth` and `--ci` before `--`** are swallowed by npm without a trace (finding 1); not fixable
  in the installer. `--cache` was avoided on purpose: npm owns `npm_config_cache`.
- A typed admin password is memory-only, so a **resumed** setup (`npm run setup`) generates one
  instead and shows it once.
- CI action versions (`actions/checkout@v4`, `setup-node@v4`) are *(unverified)* for 2026.
- The stub framework (`stubs/strutvane-framework`) stands in for spike 12's `node strut`
  registry and spike 10's schema builder; only what the installer calls is implemented.

## Decisions this suggests

1. ADR: generated apps use `node strut`, npm only, and **two setup modes** (no Docker / everything
   in Docker, Sail-style) with the Docker-mode contract on `spikes/SHARED-DESIGN.md`.
2. ADR: the installer ships a tested lockfile per preset and installs with `npm ci
   --ignore-scripts` (+ allowlist), amending the release process (lockfile built from versions at
   least 3 days old).
3. Rename Docker commands to `services:up` / `services:down` / `services:status` (Laravel uses
   `up`/`down` for maintenance mode).
4. Generated `.env` keys follow Sail: `DB_HOST=db`, `FORWARD_DB_PORT`, `FORWARD_MAILPIT_PORT`.
