# 10 — Repositories, Publishing & Versioning

> Canonical decisions D1, D2, D16, D17, D18, D19 are in [00](00-executive-summary.md). **D17: one GitHub repository per package (polyrepo)**, like Laravel's first-party packages (`laravel/framework`, `laravel/sanctum`, `laravel/horizon`…).
> Versions are a snapshot from [research/stack-snapshot-2026-11.md](research/stack-snapshot-2026-11.md). Re-verify them before Phase 1.

## 1. Repository map (GitHub org `strutvane`)

> **Current home (from 2026-11-13).** Repos live in the GitHub org [`vishwajit-vm`](https://github.com/vishwajit-vm) with a `strutvane-` prefix. A dedicated `strutvane` org remains an option later:
>
> | Current repo | Possible future repo |
> |--------------|-------------|
> | [`vishwajit-vm/strutvane`](https://github.com/vishwajit-vm/strutvane) | `strutvane/blueprint` (hub) |
> | [`vishwajit-vm/strutvane-framework`](https://github.com/vishwajit-vm/strutvane-framework) | `strutvane/framework` |
> | [`vishwajit-vm/strutvane-auth`](https://github.com/vishwajit-vm/strutvane-auth) | `strutvane/auth` |
> | [`vishwajit-vm/strutvane-ui`](https://github.com/vishwajit-vm/strutvane-ui) | `strutvane/ui` |
> | [`vishwajit-vm/strutvane-core`](https://github.com/vishwajit-vm/strutvane-core) | `strutvane/core` |
> | [`vishwajit-vm/strutvane-contracts`](https://github.com/vishwajit-vm/strutvane-contracts) | `strutvane/contracts` |
> | [`vishwajit-vm/strutvane-cli`](https://github.com/vishwajit-vm/strutvane-cli) | `strutvane/cli` |
> | [`vishwajit-vm/strutvane-devkit`](https://github.com/vishwajit-vm/strutvane-devkit) | `strutvane/devkit` |
> | [`vishwajit-vm/create-strutvane`](https://github.com/vishwajit-vm/create-strutvane) | `strutvane/create-strutvane` |
> | [`vishwajit-vm/strutvane-tooling`](https://github.com/vishwajit-vm/strutvane-tooling) | `strutvane/tooling` |
> | [`vishwajit-vm/strutvane-docs`](https://github.com/vishwajit-vm/strutvane-docs) | `strutvane/docs` |
>
> `examples` and `integration` are created when Phase 1 needs them. A repository transfer keeps stars, issues and redirects. Update `repository` fields in each `package.json` and the npm trusted-publisher configuration after the transfer.

| Repo | Publishes to npm | Contents |
|------|------------------|----------|
| `strutvane/contracts` | `@strutvane/contracts` | Types + wire protocols, **zero runtime deps** |
| `strutvane/core` | `@strutvane/core` | Kernel: container, providers, config, env, context, hooks, events, logger, errors, plugin host |
| `strutvane/framework` | `@strutvane/framework` | Backend + database: model DSL, migrations, query/CRUD, HTTP, validation, OpenAPI, queue, cache, mail, `/testing` |
| `strutvane/auth` | `@strutvane/auth` | Identity adapters, RBAC/ABAC, tenancy, audit, auth API, installer |
| `strutvane/ui` | `@strutvane/ui` | React resource renderer, auth screens, registry components, themes, shadcn-compatible registry JSON |
| `strutvane/cli` | `@strutvane/cli` **and** `strutvane` (unscoped launcher, bin `strutvane`) | Command implementations, installer runner, generator host; plus the thin launcher in `launcher/` |
| `strutvane/devkit` | `@strutvane/devkit` | SDK for installers, generators, plugins and codemods (`AstEditor`, file sandbox, env-file writer, config patcher) |
| `strutvane/create-strutvane` | `create-strutvane` | `npm create strutvane@next`, **including the starter templates** (`templates/full`, `templates/api`, `templates/ui`) |
| `strutvane/tooling` | `@strutvane/tsconfig`, `@strutvane/biome-config`, `@strutvane/vitest-config`, `@strutvane/test-utils` | Shared configs and test helpers (Testcontainers presets, golden-file utils, fake IdP) consumed by every repo |
| `strutvane/.github` | — | Org-wide **reusable workflows** (`workflow_call`), issue/PR templates, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CONTRIBUTING.md`, `FUNDING.yml` |
| `strutvane/docs` | — (deploys strutvane.dev) | Versioned documentation site (Diátaxis) |
| `strutvane/blueprint` | — | **This planning repo**: the umbrella folder's `docs/` + root `CLAUDE.md` + `.claude/`. It git-ignores `packages/`. RFCs and ADRs live here. |
| `strutvane/examples` | — | Runnable reference apps (crm, helpdesk, multi-tenant-saas, api-only, ui-only-on-external-api) **plus `playground/`** for manual cross-package testing |
| `strutvane/integration` | — | **Nightly cross-package e2e**: installs `latest` and `next` of every package, generates apps for every preset × DB, runs the generated apps' tests and Playwright suites, and runs upgrade tests |

### 1.1 Two judgement calls

**The launcher lives inside `strutvane/cli`, not in its own repo.**

- The launcher (~100 LOC) exists only to find and delegate to the project-local `@strutvane/cli`, and its version-negotiation logic must change in lock-step with the CLI.
- A separate repo would add a release, a CI pipeline and a Renovate config for almost no code.
- The `cli` repo is therefore a tiny two-package pnpm workspace (`packages/cli`, `packages/launcher`), released together by Changesets. This is the only repo with more than one published package besides `tooling`.

**Templates stay inside `create-strutvane`, with no separate `templates` repo.**

- Templates and the starter that renders them must be tested and released together. A template change without a matching starter change is a broken `npm create`.
- `strutvane new` in the CLI **delegates to `create-strutvane`** (same code path, pinned version), so there is a single owner of template logic.
- Package-specific scaffolding (what `sv add auth` writes) is **not** a template: it lives in each package's own installer (`@strutvane/auth/installer`), versioned with that package.

## 2. Polyrepo vs monorepo: trade-offs and mitigations

| Concern | Monorepo would give | Polyrepo cost | Mitigation |
|---------|---------------------|---------------|------------|
| Atomic contract changes | One PR changes `contracts` and all consumers | Changes span several repos and releases | **Contract-change process** (§6.4): RFC → `contracts@next` → dependents adopt on `next` → coordinated stable release, gated by the integration repo |
| Shared CI and config | One pipeline | Duplication across ~10 repos | **Reusable workflows** in `strutvane/.github` (each repo's CI is ~10 lines of `uses:`), plus the **tooling repo** for shared configs |
| Cross-package testing | Every PR tests the whole graph | Breakage found late | **Integration repo** (nightly + on demand + required before a train release). Each repo's CI also runs the e2e against `next` of its siblings. |
| Dependency drift | One lockfile | `@strutvane/*` versions drift between repos | **Renovate** org preset groups `@strutvane/*` bumps and auto-merges patch/minor after green CI |
| Release coordination | One version PR | Several repos to release | **Cross-repo release checklist** (§6.5) and a **GitHub Projects board** spanning all repos with a "Release train" view |
| Local development across packages | `workspace:` links | Separate clones | **Local-only umbrella workspace** (§3) links all clones |
| **Benefits of polyrepo** | — | — | Clear ownership and CODEOWNERS per package; focused issues, stars and discussions per package (better npm/GitHub discoverability); independent release cadence; smaller clone/CI per contributor; mirrors Laravel's model that the brief asked for; easy to transfer or archive a package |

## 3. Local development: the umbrella folder

```
C:\personal_projects\strutvane\          ← umbrella (itself the `blueprint` repo; packages/ is git-ignored)
├─ docs/  CLAUDE.md  .claude/           ← tracked by strutvane/blueprint
├─ pnpm-workspace.yaml                  ← LOCAL ONLY (git-ignored by blueprint; not part of any repo)
├─ package.json                         ← LOCAL ONLY convenience scripts (git-ignored)
├─ docker/                              ← LOCAL ONLY dev services (git-ignored everywhere)
└─ packages/                            ← git-ignored by blueprint; each folder is its OWN clone
   ├─ contracts/          (git clone strutvane/contracts)
   ├─ core/               (git clone strutvane/core)
   ├─ framework/  auth/  ui/  cli/  devkit/  create-strutvane/
   ├─ tooling/  examples/  integration/  docs/
```

The local-only umbrella workspace links the clones without changing any published `package.json`:

```yaml
# pnpm-workspace.yaml  (umbrella root, git-ignored)
packages:
  - packages/*
  - packages/cli/packages/*
  - packages/tooling/packages/*
  - packages/examples/*
overrides:                       # force local clones for cross-package dev
  "@strutvane/contracts": "link:./packages/contracts"
  "@strutvane/core": "link:./packages/core"
  "@strutvane/framework": "link:./packages/framework"
  "@strutvane/auth": "link:./packages/auth"
  "@strutvane/ui": "link:./packages/ui"
  "@strutvane/devkit": "link:./packages/devkit"
  "@strutvane/cli": "link:./packages/cli/packages/cli"
```

Rules:

- **Published `package.json` files never use `workspace:`.** They declare real semver ranges, e.g. `"@strutvane/core": "^1.2.0"`. Linking happens only through the umbrella `overrides`.
- `pnpm umbrella:bootstrap` (an umbrella script, also documented in `CONTRIBUTING.md`) clones any missing repos, runs `pnpm install` at the umbrella root, and builds in dependency order.
- Contributors working on a single package just clone that repo and use published versions of its siblings. The umbrella is optional.
- Turborepo/Nx are **not** used by the org repos. A contributor may run Turborepo in the umbrella purely as a local convenience (`turbo run build` across clones). That config is also git-ignored.

### 3.1 Standard layout of a package repo

```
strutvane/auth/
├─ src/            tests/            installer/          ← installer = what `sv add auth` runs
├─ package.json    tsconfig.json (extends @strutvane/tsconfig)   biome.json (extends @strutvane/biome-config)
├─ vitest.config.ts (from @strutvane/vitest-config)   tsdown.config.ts
├─ .changeset/     CHANGELOG.md      README.md          LICENSE (MIT)
├─ CLAUDE.md       .claude/          (project memory + skills/agents for AI-assisted dev)
├─ .github/workflows/ci.yml  release.yml   (thin callers of strutvane/.github reusable workflows)
├─ renovate.json   (extends github>strutvane/.github:renovate-preset)
└─ .gitignore      (includes the Docker + env patterns in §9)
```

## 4. Dependency boundary rules (across repos)

| Package | May depend on | Must NOT depend on |
|---------|---------------|--------------------|
| `contracts` | nothing (type-only import of `@standard-schema/spec` allowed) | anything with runtime code |
| `core` | `contracts` | `framework`, `auth`, `ui`, `cli` |
| `framework` | `contracts`, `core`, third-party libs | `auth`, `ui` |
| `auth` | `contracts`, `core`, third-party libs | `framework`, `ui` (integrates through contracts + provider registry) |
| `ui` | `contracts`, third-party UI libs | `core` server code, `framework`, `auth` (talks HTTP + manifest only) |
| `devkit` | `contracts`, `core` | product packages |
| `cli` | `core`, `devkit` | product packages (their installers are loaded **dynamically** from the user's project) |
| `strutvane` launcher | `@strutvane/cli` (pinned fallback) | everything else |
| `create-strutvane` | `devkit` | product packages (templates reference them only as dependency *strings*) |

**Enforcement in a polyrepo:**

- The reusable CI workflow runs a **`dependency-allowlist` check** that fails if a repo's `package.json` lists a forbidden `@strutvane/*` package.
- `dependency-cruiser` blocks deep imports.
- **Subpath exports before new packages:** heavy integrations ship as subpaths with optional peers (`@strutvane/framework/queue` → optional peer `bullmq`). Split into a new repo/package only when deps or cadence diverge.

## 5. Build & package hygiene (same in every repo, via `tooling`)

| Concern | Decision |
|---------|----------|
| Package manager | pnpm 12 (`packageManager` field pinned). Catalogs are used **within** a repo where it has several packages (`cli`, `tooling`). |
| Bundler | **tsdown** 0.23.x. tsup's README says it is unmaintained and points to tsdown, although npm shows a tsup 9.0.0 from 2026-10 *(conflicting, unverified)*. |
| Format | **ESM only**, `"type": "module"`, `exports` map with `types` first, `engines.node: ">=24"` |
| Checks | `publint` + `attw` (are-the-types-wrong) on every PR |
| Lint/format | Biome 2.6 via `@strutvane/biome-config` |
| Tests | Vitest 5 via `@strutvane/vitest-config`. Vitest 5 no longer reads config from ancestor directories ([vitest.dev](https://vitest.dev/blog)), so each repo has its own config. |
| Supply-chain buffer | `minimumReleaseAge: 4320` (3 days) in each repo's `pnpm-workspace.yaml` / `.npmrc`. pnpm 11+ defaults to 1 day ([pnpm 12](https://pnpm.io/blog/releases/12.0)). |
| Hygiene | `exports`, `files`, `engines`, `sideEffects`, `repository`, `license`, `keywords` (incl. `strutvane`), `funding`. **No `postinstall` scripts.** |

## 6. Versioning & release trains

### 6.1 Semver policy

- **Strict semver.** Public API covers:
  - everything in `exports`
  - CLI commands and flags
  - the config schema and generated-file conventions
  - wire protocols and `contracts` types
- **Generated code counts as API.** A change that breaks a previously generated app is a **major**. The exception is a change shipped with an automatic `strutvane upgrade` codemod, which is announced as a minor *with migration*.
- **0.x period:** minors may break. Every break is listed under **Breaking** in the changelog, with a codemod where feasible.

### 6.2 Tooling per repo

Each repo uses **Changesets 3** (ESM-only, bumps peer dependents by patch, renamed commands like `tag` → `git-tag`; see [npm](https://www.npmjs.com/package/@changesets/cli)).

- Contributors add a changeset per user-facing change, enforced by a bot.
- Merging the "Version Packages" PR publishes.
- release-please was considered. Changesets wins because contributors author the changelog entry in the PR, and it supports pre-release mode and snapshots for `next`/`canary`.

### 6.3 The core release train (shared MAJOR)

| Group | Repos | Rule |
|-------|-------|------|
| **Core train** | `contracts`, `core`, `framework`, `auth`, `ui`, `cli` (+ launcher), `devkit`, `create-strutvane` | Independent minors/patches, but a **shared MAJOR**: all are 1.x together, then all 2.x together. A major lands only through a coordinated train release (§6.5). |
| **Satellite packages** | `tooling` packages, future adapters (`@strutvane/auth-saml`, `@strutvane/queue-pgboss`), future products (`notify`, `files`, `payments`…) | Fully independent semver. They declare `peerDependencies: { "@strutvane/core": "^1.0.0" }`. |
| **Community plugins** | external | Declare `"strutvane": { "compat": "^1" }`, validated by `sv doctor` |

**Compatibility is enforced by peer dependencies:**

- `@strutvane/framework@1.x` declares `peerDependencies: { "@strutvane/core": "^1.0.0", "@strutvane/contracts": "^1.0.0" }`.
- Minors must stay compatible with **any** `1.x` sibling released in the previous 6 months.
- The integration repo verifies this with a "min/max sibling" matrix:
  - each package at `latest` with siblings at their oldest supported 1.x minor
  - each package at `latest` with siblings at `latest`

### 6.4 Contract-change process

```
1. RFC in strutvane/blueprint (docs/rfcs/NNNN-*.md) → discussion → accepted
2. contracts: implement, release to `next` (e.g. 1.6.0-next.0)
3. Dependents (core/framework/auth/ui/cli) open PRs consuming contracts@next; CI + integration@next green
4. Coordinated stable: contracts 1.6.0 → dependents release minors that widen peer ranges
5. Additive changes only within a major; removals are deprecated first, removed at next major
```

### 6.5 Cross-repo release checklist (train releases and majors)

- [ ] Tracking issue opened on the org **GitHub Projects** board ("Release train vX.Y"), listing each repo's release PR
- [ ] `contracts` released first, then `core` → `devkit` → `framework` / `auth` / `ui` → `cli` (+ launcher) → `create-strutvane`
- [ ] `integration` run green on the release candidates (`next`) for every preset × DB
- [ ] Upgrade tests green (previous minor/major app → new)
- [ ] Docs site version cut (`strutvane/docs`), migration guide published
- [ ] Codemods published in `@strutvane/cli` and listed in `sv upgrade --list`
- [ ] Renovate PRs in `examples` merged; examples re-generated
- [ ] Release announcement (blog, GitHub release notes per repo linking the train)

### 6.6 Channels (npm dist-tags)

| Tag | Source | Audience |
|-----|--------|----------|
| `latest` | `main` via the Changesets PR | Everyone |
| `next` | `next` branch in Changesets pre mode (`1.6.0-next.3`) | Early adopters, cross-repo contract work |
| `canary` | Snapshot on every merge to `main` (`0.0.0-canary-<sha>-<date>`) | Plugin authors' CI, bug reporters |
| `lts` | `release/<major>.x` maintenance branch | Enterprises |

### 6.7 Compatibility matrix (published in docs, checked by `sv doctor`)

| Strutvane | Node | TypeScript (user projects) | PostgreSQL | MySQL | SQLite | React |
|-----------|------|----------------------------|------------|-------|--------|-------|
| 0.x (2027) | 24, 26 | 5.9, 6.x, 7.x | 16, 17, 18 | 8.4 LTS | 3.45+ / libSQL | 19.2+ |
| 1.x | 24, 26 (+ 28 at LTS) | 6.x, 7.x | 16–18 | 8.4 | 3.45+ | 19.x |

Node 26 has been Active LTS since 2026-10-28 (EOL 2029-04). Node 24 and 22 are maintenance, and Node 20 is EOL ([Node release schedule](https://nodejs.org/en/blog/announcements/evolving-the-nodejs-release-schedule)). We support the two newest LTS lines.

### 6.8 Support / LTS policy

| Release type | Active support | Security fixes |
|--------------|----------------|----------------|
| Minor | Until next minor | — |
| Major (non-LTS) | 12 months | 18 months |
| **LTS major** (every second major, starting 1.0) | 18 months | **36 months** |

At most one major per year.

## 7. Upgrades: `strutvane upgrade`

```
pnpm sv upgrade                 # all @strutvane/* to latest within current major + codemods
pnpm sv upgrade --to 2          # cross-major: preflight report → codemods → migration guide links
pnpm sv upgrade --dry-run       # diff of every file the codemods would touch
```

- **Upgrade flow:**
  1. Verify a clean git tree.
  2. Resolve a **compatible set** of `@strutvane/*` versions from the published compatibility metadata. Every package publishes `strutvane.train` in its `package.json`.
  3. Bump them together.
  4. Run codemods.
  5. Regenerate `.strutvane/registry.gen.ts`.
  6. Three-way merge ejected files whose templates changed.
  7. Run `sv doctor` and print a report.
- **Codemods:** written with `@strutvane/devkit` on ts-morph (TypeScript 6 pinned, see [11](11-technology-decisions.md)) plus magicast. Each codemod is versioned and idempotent. Codemods ship inside the package that introduced the change (e.g. `@strutvane/auth/codemods/2.0.0/*`), and the CLI discovers them.

## 8. Publishing to npmjs.com

### 8.1 Trusted publishing (OIDC) + provenance

npm revoked classic tokens on 2025-12-09. Granular tokens now last at most 90 days and require 2FA, and OIDC trusted publishing works from GitHub-hosted Actions ([GitHub changelog](https://github.blog/changelog/2025-09-29-strengthening-npm-security-important-changes-to-authentication-and-token-management/)). **No repo holds an npm token.**

How a release works (ADR-0016, refined by [ADR-0018](adr/0018-staged-npm-publishing.md)):

1. A maintainer runs `changeset version` and commits `chore(release): <name>@<version>` on `main`.
2. Each repo's canonical `release.yml` (synced from strutvane-tooling) runs the full quality gate, then `.github/scripts/publish-if-new.mjs`.
3. The script **stages** the version with `npm stage publish --access public --provenance --tag <tag>`, unless it is already published or already staged.
4. A maintainer **approves** the staged version on npmjs.com with 2FA. Only then is it live.

```yaml
# .github/workflows/release.yml (excerpt; the full file lives in strutvane-tooling/canonical)
jobs:
  release:
    if: github.repository_owner == 'vishwajit-vm' && vars.RELEASE_ENABLED == 'true'
    permissions: { contents: read, id-token: write }
    steps:
      # checkout, pnpm, Node 24 (all actions pinned by SHA)
      - run: npm install --global npm@11.19.0   # `npm stage` support
      - run: node .github/scripts/check-deps.mjs  # no link:/file:/workspace: deps
      - run: pnpm install --frozen-lockfile
      - run: pnpm run ci
      - run: node .github/scripts/publish-if-new.mjs
```

- **npmjs.com setup:** each package has a **trusted publisher** bound to *its own repo* and `release.yml`, with no environment and both "Allow npm publish" and "Allow npm dist-tag" unticked, so it can only stage. A compromise of one repo cannot publish another repo's package, and no CI run can make a version live without a maintainer's 2FA approval.
- **Provenance:** `"publishConfig": { "access": "public", "provenance": true }` is set explicitly, because automatic attachment under trusted publishing is *(unverified)*.
- **Org settings:**
  - 2FA required
  - publishing restricted to trusted publishers
  - two or more owners
  - `CODEOWNERS` + protected environments per repo

### 8.2 Placeholder reservation plan (Phase 0, week 1)

| Step | Action |
|------|--------|
| 1 | Create npm org **`strutvane`** (secures the `@strutvane` scope) and GitHub org **`strutvane`**, then create all repos from §1 (empty + README + LICENSE). |
| 2 | Publish `0.0.0` placeholders ("Coming soon — https://strutvane.dev") for `strutvane`, `create-strutvane`, `@strutvane/{contracts,core,framework,auth,ui,cli,devkit,tsconfig,biome-config,vitest-config,test-utils}`. |
| 3 | Optional defensive names: `strutvane-cli`, `strut-vane`. |
| 4 | Register strutvane.com/.dev/.io/.org, claim social handles, start trademark clearance ([03](03-naming-and-brand.md)). |
| 5 | Re-run the naming check on reservation day ([research/naming-checks-2026-11-13.md](research/naming-checks-2026-11-13.md)). |

After the first real release: `npm deprecate <pkg>@0.0.0 "placeholder"`.

### 8.3 How users install from npmjs.com

```bash
npm create strutvane@next acme              # or: pnpm create strutvane@next acme / bun create strutvane@next acme
#   prompts: preset (full | api | ui), database, auth?, tenancy?, package manager, local Docker?

npx strutvane add auth                      # existing project: install + run the package's installer
npx strutvane add ui

npm i -g strutvane                          # optional global launcher; always delegates to project-local CLI
npm i @strutvane/auth                       # direct library use without the CLI is supported
```

Generated projects get `"scripts": { "sv": "strutvane" }`, so `pnpm sv make:model Product` mirrors `php artisan make:model`.

**Launcher resolution order:**

1. The project-local `node_modules/@strutvane/cli`.
2. Otherwise the launcher's pinned `@strutvane/cli`, for `new` and `add` only.
3. A warning when the majors differ.

## 9. Docker policy: local only, never committed (D16)

Docker runs **local development services only** (Postgres, MySQL, Valkey, Mailpit, an OTel collector with Jaeger). **No Docker files are committed in any Strutvane repo.** Every repo's `.gitignore` (from the `tooling` template) includes:

```gitignore
# --- Docker: local development only (never committed) ---
docker/
compose.yaml
compose.yml
compose.*.yaml
compose.*.yml
docker-compose.yaml
docker-compose.yml
docker-compose.*.yaml
docker-compose.*.yml
Dockerfile
Dockerfile.*
*.dockerfile
.dockerignore

# --- Env & secrets ---
.env
.env.*
!.env.example

# --- Local umbrella workspace (blueprint repo only) ---
/packages/
/pnpm-workspace.yaml
/package.json
/pnpm-lock.yaml
/turbo.json

# --- Build & caches ---
node_modules/
dist/
.turbo/
.vitest/
coverage/
*.tsbuildinfo
.strutvane/
storage/logs/
storage/uploads/
```

The "local umbrella workspace" block appears only in the `blueprint` repo, whose root *is* the umbrella.

**How contributors get services:**

- `pnpm dev:services` (umbrella script, or per-repo script from `@strutvane/test-utils`) **writes** `docker/compose.yaml` from a template embedded in TypeScript if it is missing, then runs `docker compose up -d`.
- Contributors without Docker use SQLite/libSQL and memory drivers (`STRUTVANE_DEV_DRIVERS=memory`).
- CI never uses compose. Integration tests use **Testcontainers** ([13](13-testing-strategy.md)).

**Generated apps:**

- `strutvane new` writes `docker/compose.yaml` and git-ignores it.
- `--docker=commit` opts in to versioning it. `--docker=none` skips Docker.
- Production container guidance is a docs page.

## 10. CI workflows

All workflows are **reusable workflows in `strutvane/.github`**. Each repo calls them with a few lines and pins `@v1`.

| Reusable workflow | Used by | Jobs |
|-------------------|---------|------|
| `ci.yml` | every package repo | frozen install → Biome check → typecheck → unit tests → build → `publint` + `attw` → dependency-allowlist check |
| `integration-db.yml` | framework, auth | Testcontainers matrix: PG 16/17/18, MySQL 8.4, SQLite, Valkey, Postgres-backed queue |
| `cli-matrix.yml` | cli, create-strutvane, devkit | Ubuntu/macOS/Windows × Node 24/26 × npm/pnpm/yarn/bun smoke tests (`new`, `add`, `make:model`, `migrate`) |
| `e2e-siblings.yml` | every core-train repo | Generates apps using *this repo's PR build* + siblings at `next`, then typecheck/test |
| `release.yml` | every published repo | OIDC publish + provenance, GitHub release, CycloneDX SBOM attached |
| `security.yml` | every repo (weekly + PR) | CodeQL, dependency review, OSV-Scanner, OpenSSF Scorecard, secret scanning, license allow-list |
| `docs.yml` | docs | Build/deploy versioned site, link check |
| `nightly.yml` | integration | Full preset × DB matrix on `latest` and `next`; upgrade tests; perf (k6) budgets; Azure PG/MySQL Flexible nightly via OIDC to Azure. Opens an issue on the Projects board on failure. |

Renovate runs org-wide (`github>strutvane/.github:renovate-preset`):

- groups `@strutvane/*` updates and auto-merges patch/minor on green CI
- delays third-party updates by 3 days
- groups monthly updates for toolchain majors

## 11. Branch strategy (per repo)

| Branch | Purpose | Protection |
|--------|---------|------------|
| `main` | Always releasable; trunk-based; squash merge | Required checks (ci, security, e2e-siblings for core-train repos). 1 review; 2 for `auth`, `core`, `contracts`, `.github`. Signed commits. Linear history. |
| `next` | Pre-release line for contract changes and upcoming minor/major (Changesets pre mode) | Same checks |
| `release/<major>.x` | LTS maintenance | Backports only (`backport` label automation) |
| `feat/*`, `fix/*`, `docs/*` | Contributor branches | — |

Conventions:

- Conventional Commits in PR titles.
- A changeset is required for user-facing changes.
- CODEOWNERS per repo.
- RFCs (in `blueprint`) for contract, config-schema and generated-convention changes ([16](16-docs-and-ecosystem-strategy.md)).
