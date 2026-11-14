# Repository layout dry run: Laravel-style repos on npm (2026-11-14)

> **Status:** research, dry run on scratch copies only. Nothing under `packages/` or the hub was changed apart from this file and one appended section of `spikes/SHARED-DESIGN.md`. Nothing was committed in a real repo or pushed anywhere.
>
> **Scratch root:** `C:\Users\vishwajit\AppData\Local\Temp\claude\dd14391da8ec8b14\4d9b0ca2-ae24-4737-b056-b4252ebadcc7\scratchpad\monorepo-dryrun\` (`$S` below). The scripts listed in §6 can be replayed.
>
> **Tools:** Node 24.21.0, npm 11.19.0, git 2.56.0.windows.2, Windows 11. Baselines used corepack pnpm 12.18.0.

## 0. Summary

The brief changed partway through the run.

- **First brief:** one npm-workspaces monorepo holding everything. This was done first; §7 keeps its findings because most of them apply to any npm layout.
- **Current brief (from the user, via the coordinator):** follow Laravel's org layout inside `vishwajit-vm`:

| Laravel | Strutvane repo | npm package | Notes |
|---|---|---|---|
| laravel/framework | `strutvane-framework` | `@strutvane/framework` | **Absorbs** core, contracts, cli and devkit |
| laravel/laravel | `strutvane-skeleton` (new) | none (template repo) | App skeleton |
| laravel/installer | `create-strutvane` | `create-strutvane` | Installer |
| laravel/docs | `strutvane-docs` | none | One branch per version |
| fortify/sanctum, filament | `strutvane-auth`, `strutvane-ui` | `@strutvane/auth`, `@strutvane/ui` | Each depends on the **published** framework |
| add-ons | `strutvane-log-viewer` (today's logs), `strutvane-files`, … | `@strutvane/*` | Same rule |
| (hub) | `strutvane` | none | Blueprint, ADRs, RFCs, spikes; stays the hub |

**Results:**

1. **The framework merge works, with full history, and every test stays green under npm.** Contracts, core, devkit and cli were folded into a copy of `strutvane-framework` as one npm package.
   - **History:** 115 commits. The fold is a separate commit of pure renames, so `git log --follow` and `git blame` reach the original commits (checked on `src/core/index.ts`).
   - **Tests:** **1,286 passed, 14 skipped.** That is exactly the sum of the five old suites (framework 349+1, contracts 40, core 157, devkit 370+13, cli 370).
   - **Gate:** coverage thresholds are met (96.6 / 90.6 / 96.8 / 97.5), `tsc` is clean, Biome reports 0 errors, and the build passes.
   - **Smoke checks:** the built `strutvane` bin prints its version, and `npm pack` produces one 90-file tarball.
2. **Dependents build and test against the merged framework through npm.** auth, ui, logs, files and create-strutvane were retargeted (`@strutvane/core` → `@strutvane/framework/core`, and so on) and linked through an **uncommitted umbrella npm-workspaces folder**. `npm ls` shows every dependent resolving to the local `packages/framework`.
   - **All five gates are green with test counts identical to their pnpm baselines:** logs 282+1, auth 375, files 226, ui 269, create-strutvane 382+2 (§3).
3. **npm 11.19 restores both supply-chain guards pnpm gave us.** The `allowScripts` field with `strict-allow-scripts`, plus `min-release-age` with `min-release-age-exclude`, cover pnpm's `allowBuilds` and `minimumReleaseAge`. This corrects audit §F.2, which marked parity *(unverified)*. Source: npm 11.19.0's bundled docs, read locally on 2026-11-14.
4. **Blockers found:** none block the move. Each one has a fix in §4. The ones that matter most:
   - the hub's `.gitignore` line `logs/` silently ignores `packages/logs`;
   - npm runs workspace scripts in **listed** order, so the build order must be written out;
   - test helpers that assume pnpm's per-package `node_modules`;
   - the CLI version path after the move;
   - installer templates and project detection still name `@strutvane/core` and `@strutvane/cli`;
   - a `create-strutvane → framework` dependency makes `npm create` heavy;
   - every package's npm Trusted Publisher and `repository.url` must point at the new repo.

## 1. Baseline: each repo's own pnpm gate

Each repo was cloned read-only into `$S/baseline/<repo>`. Then `corepack pnpm@12.18.0 install --frozen-lockfile` and `pnpm run ci` were run (for docs, `pnpm run build`). Everything was green.

| Repo | Tests (pnpm gate) | Install | Gate |
|---|---|---|---|
| contracts | 40 | 3 s | 15 s |
| core | 157 | 3 s | 10 s |
| devkit | 370 + 13 skipped | 3 s | 16 s |
| logs | 282 + 1 skipped | 4 s | 30 s |
| ui | 269 | 8 s | 53 s |
| auth | 375 | 6 s | 35 s |
| framework | 349 + 1 skipped | 14 s | 152 s |
| files | 226 | 20 s | 32 s |
| cli (cli 370 + launcher 46) | 416 | 4 s | 27 s |
| create-strutvane | 382 + 2 skipped | 5 s | 83 s |
| tooling | 70 (node --test) | 0 s | 5 s |
| docs | build + 2,213 links, 31 pages | 13 s | 36 s |
| **Total** | **2,936 passed, 17 skipped** | 83 s (warm store) | 494 s serial |

## 2. Step (a): fold core, contracts, cli and devkit into `strutvane-framework`

### 2.1 One package, or internal workspaces inside the framework repo?

**Chosen: one package.** `@strutvane/framework` gets subpath exports `./contracts`, `./core`, `./devkit` and `./console`, next to the existing `.`, `./provider`, `./http`, `./database`, `./commands` and `./testing`, plus one bin, `strutvane`.

Why:
- It is what laravel/framework is: one package, many namespaces.
- It leaves no inner packages to version, stage and approve. Under ADR-0018 every published package costs a 2FA approval per release.
- Package self-reference works (`import('@strutvane/framework/core')` from inside the repo was checked).
- It removes the cross-package build-order problem inside the repo. Absorbed code imports siblings by relative `.ts` path, so tests run straight from source and no `dist` is needed first.

**Rejected: internal npm workspaces** (framework repo root → `packages/{contracts,core,devkit,cli,framework}`). It would keep five published names, each needing its own staging, approval and Trusted Publisher. The alternative, bundling private workspaces into one tarball, makes `.d.mts` bundling and source maps harder. It also brings back the "npm runs workspace scripts in listed order" problem (§7, B3).

Internal module boundaries are still worth enforcing. The proposal is a Biome or dependency-cruiser rule such as "`src/contracts` imports nothing; `src/core` imports only `contracts`; `src/console` never imports `src/http`". This replaces the boundary the separate repos used to give.

**Launcher decision.** Retire the separate `strutvane` launcher package from the CLI repo.
- Inside an app, `npx strutvane` resolves the framework's local `strutvane` bin, and `node strut` is the primary entry point anyway (fixed decision).
- Outside an app there is nothing to delegate to.
- Its history stays in the framework repo (and `docs/changelogs/launcher.md`); its 46 tests are not carried over.
- Keep the unscoped npm name reserved. A later option, if wanted, is a tiny shim published from `create-strutvane`, the way laravel/installer provides the global `laravel` command.

### 2.2 Commands used (replayable; scripts are in `$S`)

```bash
# 1. Rewrite each absorbed repo's history under packages/<name>/ on a CLONE (git filter-repo is not
#    installed here; this is the built-in equivalent of `git filter-repo --to-subdirectory-filter`).
git clone --no-local <real repo> $S/src/<name>
cd $S/src/<name>
FILTER_BRANCH_SQUELCH_WARNING=1 git filter-branch --index-filter '
  git ls-files -s | sed "s#\t\"*#&packages/<name>/#" |
    GIT_INDEX_FILE=$GIT_INDEX_FILE.new git update-index --index-info &&
    if [ -f "$GIT_INDEX_FILE.new" ]; then mv "$GIT_INDEX_FILE.new" "$GIT_INDEX_FILE"; fi' -- main
#    (import.sh: 8 min 22 s for 12 repos / 214 commits on Windows. On the real migration, use
#    `git filter-repo --to-subdirectory-filter packages/<name>`, which takes seconds.)

# 2. Merge into a framework clone (fw-merge.sh, 26 s)
git clone --no-local <real framework repo> $S/fw-merged
cd $S/fw-merged && git remote remove origin
for n in contracts core devkit cli; do
  git fetch $S/src/$n main:import/$n
  git merge --allow-unrelated-histories --no-edit import/$n
done
# One commit of PURE renames (blame and --follow keep working):
git mv packages/<n>/src src/<n>; git mv packages/<n>/test test/<n>     # contracts, core, devkit
git mv packages/cli/packages/cli/src src/console; git mv packages/cli/packages/cli/test test/console
git mv packages/<n>/CHANGELOG.md docs/changelogs/<n>.md
git mv packages/<n>/.changeset/*.md .changeset/<n>-*.md
git rm -r packages          # synced configs, pnpm files, CI and the launcher leave the tree, not the history
git commit -m "refactor: fold contracts, core, devkit and cli into the framework tree (pure renames)"

# 3. Codemod + config (fw-convert.mjs), then Biome's safe fixes (import order and line wrapping)
ORIGINALS=<packages dir> node $S/fw-convert.mjs $S/fw-merged <dir with typescript>
npx biome check --write .
git commit -am "refactor: one @strutvane/framework package (imports, exports, bin, build, tests); pnpm → npm"

# 4. Gate, npm only
npm install                        # 61 s, package-lock.json 184 KB
npx biome check . && npx tsc --noEmit && npx vitest run --coverage && npx tsdown
node dist/console/bin.mjs --version      # → strutvane 0.1.0-next.0
npm pack                                  # one tarball, 90 files
```

### 2.3 What the codemod changed (all mechanical)

- **Imports.** Only real import specifiers were rewritten, located with TypeScript's `preProcessFile`, so code inside template strings (generated-app templates and goldens) was left alone. In total: 112 package imports (`@strutvane/core` → `../core/index.ts`, and so on), 125 relative imports remapped where test and source moved apart (`test/x.test.ts` `'../src/a.ts'` → `test/core/x.test.ts` `'../../src/core/a.ts'`), and 1 `new URL('../src/bin.ts', import.meta.url)`. Two paths were deliberately left unmapped; both are covered below.
- **CLI version.** `src/console/version.ts` read `new URL('../package.json', import.meta.url)`. From `src/console/` that path no longer reaches the package root, and the CLI silently reports `0.0.0`. The fix is a walk up to the nearest `package.json` (`ownManifest()`), which works from source and from any `dist` chunk. **This is the only source change that is not a path rewrite.**
- **`package.json`:**
  - dependencies are the union of all five; no version conflicts were found;
  - `@strutvane/{contracts,core,devkit,cli}` are removed;
  - new exports and the `strutvane` bin are added;
  - `packageManager` is dropped, and `pnpm-lock.yaml` and `pnpm-workspace.yaml` are deleted.
- **Build.** `tsdown.config.ts` gains entries `contracts/index`, `core/index`, `devkit/index`, `console/index` and `console/bin`.
- **Tests.**
  - `vitest.config.ts`: timeouts are 60 s, the largest any absorbed repo used (the CLI's process and watcher tests), and `test/console/fixtures/**` is excluded;
  - `tsconfig.json` excludes `test/console/fixtures` too, because those fixtures are app data, as they were in the CLI repo.
- **Changesets.** The 22 pending absorbed changesets now target `"@strutvane/framework"`, keeping the highest bump when one file named two packages.
- **Synced files** (`tsconfig.base.json`, `biome.base.json`, `vitest.shared.ts`, workflows) stay per repo, because the org stays multi-repo. `strutvane-tooling`'s sync keeps its job, but its targets shrink to the remaining repos.

### 2.4 Result

| Suite (now under `strutvane-framework`) | Before (own repo, pnpm) | After (merged, npm) |
|---|---|---|
| framework | 349 + 1 skipped | 349 + 1 skipped |
| contracts → `test/contracts` | 40 | 40 |
| core → `test/core` | 157 | 157 |
| devkit → `test/devkit` | 370 + 13 skipped | 370 + 13 skipped |
| cli → `test/console` | 370 (416 minus 46 launcher) | 370 |
| **Total** | **1,286 + 14 skipped** | **1,286 + 14 skipped, 83 files, type tests clean** |

**Gate time:** 13 s `tsc`, 134 s tests with coverage, 9 s build. The five old gates took 220 s together.

## 3. Step (b): dependents against the merged framework, through npm

Setup: `umbrella.sh` and `dependents-codemod.mjs` in `$S`.

1. Clone auth, ui, logs, files and create-strutvane, and the merged framework, into `$S/umbrella/packages/<name>`. Short folder names keep the existing sibling-relative test paths (`../auth/dist`) working.
2. In each dependent:
   - rewrite real imports: `@strutvane/contracts|core|devkit|cli` → `@strutvane/framework/contracts|core|devkit|console`;
   - in `package.json`, replace those dependencies with `"@strutvane/framework": "0.1.0-next.0"`;
   - drop the pnpm files.
3. Apply the hoisting fix to create-strutvane's test helpers (§4, B4).
4. Add an umbrella `package.json` with an explicit, ordered `workspaces` list. Then run `npm install`, `npm run build -w @strutvane/framework`, and `npm run ci -w <each>`.

```bash
bash $S/umbrella.sh            # clones + dependents-codemod.mjs + umbrella package.json
cd $S/umbrella && npm install  # 115 s; links every sibling (checked with npm ls, output below)
npm ls @strutvane/framework
#   +-- @strutvane/auth -> .\packages\auth
#   | `-- @strutvane/framework@0.1.0-next.0 deduped -> .\packages\framework
#   ... (files, logs, ui and create-strutvane the same: all resolve to the LOCAL framework)
npm run build -w @strutvane/framework           # 3 s
for each: (cd packages/<n> && npx biome check --write .)   # re-wrap lines after the import rewrite
npm run ci -w @strutvane/logs                   # then auth, files, ui, create-strutvane
```

| Repo | Before (own repo, pnpm, published core/contracts) | After (umbrella, npm, LOCAL merged framework) | Gate time | Changes needed |
|---|---|---|---|---|
| logs (→ log-viewer) | 282 + 1 skipped | **282 + 1 skipped** ✓ | 26 s | 15 imports rewritten; Biome re-wrap |
| auth | 375 | **375** ✓ | 32 s | 53 imports; Biome re-wrap |
| files | 226 | **226** ✓ | 30 s | 29 imports; Biome re-wrap |
| ui | 269 | **269** ✓ | 56 s | 37 imports, including 2 in `test/fixtures` (the first codemod pass skipped fixtures; ui's are real test code); Biome re-wrap |
| create-strutvane | 382 + 2 skipped | **382 + 2 skipped** ✓ | 84 s | 15 imports; test helpers walk up to the hoisted `node_modules` (B3); templates generate `@strutvane/framework` + `@strutvane/framework/core` (B7), with 3 test expectations and 8 golden files updated |

**Remaining skips in create-strutvane:**
- `matches the excerpt in the hub spec`: the umbrella in `$S` is not the hub. It runs when the hub is the umbrella (§5.1).
- `sv calls the bin @strutvane/cli publishes`: this test is now obsolete. Retarget it to the framework's `strutvane` bin (B6).

The first pass, before the Biome re-wrap and template steps, failed as expected:
- logs, auth, files and ui failed on formatting only;
- create-strutvane failed 8 "type-checks with the real @strutvane/core" tests, because the retired package no longer exists anywhere (B7).

### 3.1 Timings (Windows 11, this machine)

| Step | Time |
|---|---|
| History rewrite with `git filter-branch`, 12 repos / 214 commits | 8 min 22 s (use `git filter-repo` for the real run) |
| Framework merge (4 histories, rename commit) | 26 s |
| Framework `npm install` (warm npm cache) | 61 s; `package-lock.json` 184 KB |
| Framework gate: lint, `tsc` 13 s, tests + coverage 134 s, build 9 s | about 2.7 min (the five old pnpm gates took 220 s together) |
| Umbrella `npm install` (6 repos) | 115 s |
| Dependents' gates (logs, auth, files, ui, create-strutvane) | 26 + 32 + 30 + 56 + 84 = 228 s (pnpm baseline 233 s) |
| pnpm baseline for comparison (12 repos, warm store) | installs 83 s, gates 494 s |

Process note: one `npx biome check --write .` in the scratch framework copy was interrupted by the user mid-run. After the coordinator said to resume, it was re-run on the scratch copy only, as the codemod's formatting step.

## 4. Blockers and risks, with proposed fixes

| # | Finding | Fix |
|---|---|---|
| B1 | The canonical and hub `.gitignore` contain `logs/`. In any repo that holds a `packages/logs` (or `logs/`) folder, new files there are **silently not added**. The hub also ignores `packages/` and `/package.json` (ADR-0002 era). | Anchor it as `/logs/` in `tooling/canonical/.gitignore`. Keep the hub ignores, since the umbrella relies on them (§5). |
| B2 | npm runs `--workspaces` scripts in the **listed order**, and globs expand alphabetically (`auth` before `contracts`). Builds then fail, because dependents import `dist`. | Always list workspaces explicitly in dependency order: framework → log-viewer → auth → files → ui → create-strutvane. |
| B3 | create-strutvane's test helpers use `PKG_ROOT/node_modules/{typescript,vitest,@biomejs}` and junction that folder into generated apps. Under npm hoisting it does not exist, so 35 tests fail. | Walk up to the nearest `node_modules` containing typescript (`findNodeModules`). Works per repo and in the umbrella. A 25-line test-only change. |
| B4 | create-strutvane's `release-channel` test reads `.changeset/pre.json` next to the package. | Fine per repo. It only failed in the single-monorepo variant. |
| B5 | **Silent skips.** create-strutvane's cross-repo tests use `skipIf(!existsSync('../auth/dist'))`, `../ui`, `../../docs/07-package-auth.md` and `dist`. They ran or skipped depending on whether a sibling had been built first. In per-repo CI they always skip. | In the umbrella, build the framework (and siblings) before testing. In per-repo CI, install published siblings and resolve them through `node_modules` instead of `../<name>`. Better still, have the test fail in CI when a sibling is missing (`process.env.CI`). |
| B6 | The CLI's identity is still `@strutvane/cli`: `CLI_PACKAGE`, the doctor hint, project detection in `boundary.ts` ("package.json declares @strutvane/cli") and the generated `sv` script. Tests pass (a pure move), but an app depending only on `@strutvane/framework` would not be detected as a project. | Follow-up commit (behaviour change, with tests): `CLI_PACKAGE = '@strutvane/framework'`, and detection that accepts the framework or `strut.js`. |
| B7 | Installer templates still generate apps depending on `@strutvane/core` and `@strutvane/cli` (`src/templates/root.ts`, `config.ts`, `app.ts`). These are strings, so the codemod deliberately left them alone. | Superseded by `strutvane-skeleton`. Until then, change the template strings and update the goldens (`vitest -u`). |
| B8 | `create-strutvane` now depends on `@strutvane/framework` (for devkit's env and file helpers). `npm create strutvane` would then download hono, drizzle-kit, esbuild and oxc-parser just to scaffold. | Laravel's installer does not depend on the framework. Move the few devkit helpers the installer needs into create-strutvane (or a zero-dependency module inside it), or make the installer clone `strutvane-skeleton` and run `npm install` there. |
| B9 | `@strutvane/ui` (browser code) now depends at runtime on the whole backend framework, only for contract **types**. | Declare `@strutvane/framework` as a **peerDependency** (optional for type-only use) plus a devDependency. More generally, add-ons should peer-depend on the framework so an app has exactly one copy (container tokens and `instanceof` checks rely on that). |
| B10 | **CLI package-migration gate** (`contributions.ts` / `package-migrations.ts`): a dependency's realpath must lie inside `node_modules`. npm workspace links are junctions on Windows (verified: `node_modules/@strutvane/auth` → `<JUNCTION> packages\auth`) and symlinks elsewhere, so in the umbrella, or in any app that is a workspace, `@strutvane/auth`'s migrations are refused with `UNSAFE_CONTRIBUTION`. | Allow realpaths inside the declared npm workspace root, read from the nearest ancestor `package.json` with `workspaces`. Published installs are unaffected. |
| B11 | **Install scripts.** npm runs dependency lifecycle scripts by default. This install had three: `esbuild@0.18.20`, `0.25.12` and `0.28.2` (`postinstall`); sharp 0.35 has none. npm 11.19 printed an advisory naming each one. | Commit an `.npmrc` with `strict-allow-scripts=true`, `min-release-age=1`, `min-release-age-exclude[]=@strutvane/*`, `allow-git=none` and `engine-strict=true`. Record approvals in `package.json` `allowScripts` with `npm approve-scripts esbuild` (pinned `pkg@version` entries). In CI also run `npm audit signatures`. Parity with pnpm's `allowBuilds` + `minimumReleaseAge` (source: npm 11.19.0 bundled docs, `npm-approve-scripts.md` and `config.md`, read locally 2026-11-14). |
| B12 | `npm stage publish` is "unaware of workspaces" (npm-stage.md). | Run it with the package folder as the working directory, as `publish-if-new.mjs` already does. |
| B13 | npm provenance checks `package.json` `repository.url` against the repo that runs the workflow. Every absorbed package's URL points to its old repo, and npm Trusted Publishers are configured per package per repo. | Set the framework's `repository.url` (it already points to strutvane-framework). Re-point Trusted Publishers only for packages that change repo. With absorption, only `@strutvane/framework` publishes from the framework repo. Deprecate the old names (`npm deprecate @strutvane/core "merged into @strutvane/framework/core"`). The repository-match rule is known npm behaviour *(verify on the first staged publish)*. |
| B14 | `git filter-branch` takes 8 min 22 s for 214 commits on Windows. | Use `git filter-repo` on the real migration (Python 3.14 is installed; install filter-repo with the user's approval). |
| B15 | `npm audit`: 4 moderate findings, all `esbuild ≤0.24.2` through `drizzle-kit → @esbuild-kit/*` (GHSA-67mh-4wv8-2f99, dev-server only). | Pre-existing under pnpm too. Track it with drizzle-kit, or drop drizzle-kit from runtime (audit §F.2). |
| B16 | Pending changesets: absorbed repos used a custom pre-mode layout (`.changeset/pre/*.md`, `pre.json` without `initialVersions`). | Merged into the framework's `.changeset` and retargeted. Run `npx changeset status` before the first real release. |

**Not a problem (checked):**
- **Phantom dependencies:** a TypeScript-accurate scan of every workspace (`phantom-deps.mjs`) found **none**. The only hit was a `require('Nope')` call in a test.
- **pnpm-only syntax:** there are no `workspace:`, `catalog:` or `link:` specs.
- **Duplicates:** npm hoisted everything with no nested duplicates.
- **Lockfiles:** they carry all platform binaries (Biome, rolldown, oxc-parser, sharp and esbuild for linux, darwin and win32), so a Windows-written lockfile works in Linux and macOS CI.

## 5. Step (c): local multi-repo development and CI

### 5.1 The umbrella (Laravel's composer "path" repositories, npm style)

- **The hub is the umbrella.** It already git-ignores `packages/`, `/package.json` and `/package-lock.json`. `node scripts/setup-workspace.mjs` clones every repo into `packages/<name>`, and should also write the local-only root `package.json`:

  ```json
  { "name": "strutvane-local-umbrella", "private": true,
    "workspaces": ["packages/framework", "packages/log-viewer", "packages/auth",
                   "packages/files", "packages/ui", "packages/create-strutvane"] }
  ```

- **Linking.** `npm install` at the hub root links each sibling whose version **satisfies** the dependent's declared range, with no edits to any repo's `package.json`. There is nothing to forget to revert, and `check-deps.mjs` (no `link:` or `file:`) stays valid.
- **Silent fallback.** If the range is not satisfied (for example the framework was bumped locally to `0.2.0-next.0` while auth still says `^0.1.0-next.0`), npm silently installs the **registry** copy instead. Add `npm run verify-links`: `npm ls @strutvane/framework --json` must show every dependent resolving to `packages/framework`.
- **Per-repo lockfiles** (`packages/<repo>/package-lock.json`) are ignored by a root install and stay untouched. Never run `npm install` inside a repo while in umbrella mode, or that repo's lockfile drifts.
- **Order.** Build the framework first (`npm run build -w @strutvane/framework`; dependents import `dist`). Then run `npm run ci -w <repo>` or `--workspaces` (listed order).

### 5.2 CI in each repo (published versions only)

- **Main gate.** `actions/setup-node` with `cache: npm`, `npm install -g npm@11.19.0` (needed for `allowScripts`, `min-release-age` and `npm stage`), `npm ci` (which honours `.npmrc` `strict-allow-scripts`), `npm audit signatures`, then `npm run ci`. Matrix: Linux, Windows and macOS × Node 24 and 26, as today.
  - Dependents resolve `@strutvane/framework` from the registry exactly as pinned in their lockfile. CI never sees a sibling checkout.
- **Optional, non-blocking job: `against-framework-main`.** Check out `vishwajit-vm/strutvane-framework@main`, run `npm ci && npm run build && npm pack`, then in the dependent run `npm install --no-save ../strutvane-framework-*.tgz && npm test`. This catches breakage before a framework release without making CI depend on unreleased code.
- **Release order (ADR-0016 + ADR-0018 unchanged):**
  1. The framework's release workflow stages `@strutvane/framework`.
  2. A maintainer approves it with 2FA.
  3. Dependabot (group `@strutvane/*`, with no cooldown for our own scope, matching `min-release-age-exclude`) opens bump PRs in auth, ui, log-viewer, files and create-strutvane.
  4. Each merges, then stages and is approved in turn.
- **Lockstep without a monorepo:** dependents peer-depend on `^<minor>` of the framework, and the framework's minor marks breaking changes during 0.x.
- **`workspace-packages.mjs`** (which parses `pnpm-workspace.yaml`) is no longer needed: every repo publishes one package from its root. `publish-if-new.mjs` keeps its single-package path. The CLI repo was the only multi-package publisher, and it is absorbed.
- A design sketch of a single-monorepo CI (matrix, affected-workspace detection, pack-smoke job) is kept at `$S/hub-mono/.github/workflows/{ci,release}.yml` and `.github/scripts/affected.mjs`. It is reusable if the org ever consolidates further.

## 6. Migration recipe (replay on the real repos once approved)

1. **Decide and record.**
   - Write an ADR "Laravel-style repository layout", superseding ADR-0002 (polyrepo per package), D17, D23 and the six-connection integration map as they apply to core, contracts, cli and devkit.
   - Accept the launcher retirement and the B8/B9 dependency rules.
2. **Freeze** `strutvane-{contracts,core,devkit,cli}`: no merges during the move.
3. **Rewrite histories** on fresh clones: `git filter-repo --to-subdirectory-filter packages/<name>` for contracts, core, devkit and cli.
4. **Merge** them into a `strutvane-framework` branch (`fw-merge.sh`), with one pure-rename commit (layout in §2.2).
5. **Run `fw-convert.mjs`**, then `npx biome check --write .`, then the gate (`npm install`, `npm run ci`). Expect 1,286 passed and 14 skipped. Commit, open a PR, and merge to `main` when CI (3 OS × 2 Node versions) is green.
6. **Follow-up PRs in the framework:**
   - B6: CLI identity becomes `@strutvane/framework`; detection accepts `strut.js`;
   - B10: workspace-aware migration gate;
   - module-boundary lint rule (§2.1);
   - `.npmrc` and `allowScripts` (B11).
7. **Publish** `@strutvane/framework` with the new subpaths (staged, then approved).
8. **Dependents**, one PR each:
   - run `dependents-codemod.mjs` and `npx biome check --write .`;
   - make `@strutvane/framework` a **peer + dev** dependency (B9);
   - npm conversion: delete the pnpm files, add `.npmrc`, `npm install`, commit `package-lock.json`;
   - run `npm run ci`, then stage and approve.
   - Order: log-viewer (rename from logs), auth, files, ui, create-strutvane. create-strutvane also needs B3 and B8, and later the skeleton.
9. **Tooling:**
   - switch `canonical/.github/workflows/{ci,release}.yml` to npm (§5.2);
   - fix `.gitignore` `logs/` → `/logs/` (B1);
   - drop the cli target from `manifest.json`;
   - run sync, then each repo's gate.
10. **Hub:** add the umbrella `package.json` writer and `verify-links` to `scripts/setup-workspace.mjs`; rewrite `scripts/e2e-local.mjs` for npm (`npm pack` each repo, install the tarballs into a fresh app).
11. **Archive** `strutvane-{contracts,core,devkit,cli}` on GitHub (read-only, README pointing to the framework).
   - `npm deprecate` `@strutvane/{contracts,core,devkit,cli}`, plus `strutvane` unless it is kept as a shim.
   - Re-point or remove their npm Trusted Publishers (B13).

## 7. Appendix: first brief, one monorepo for everything (superseded, findings kept)

The hub was cloned and all 12 repos imported with history:
- `packages/*` for the packages, with `tooling/` and the docs site as `site/`;
- 252 commits; repo built by `assemble-hub.sh`, then converted by `convert.mjs`.

**Results:**
- **Install and lockfile:** `npm install` took 161 s (cold npm cache) and installed 756 packages, with no nested duplicates. One `package-lock.json` (542 KB, 15.6k lines) replaced 12 pnpm lockfiles (916 KB, 28.1k lines).
- **Build, lint, typecheck:** build in listed order 50 s (site included); lint 3 s; typecheck 50 s.
- **Tests:** `npm run test:coverage` across the workspaces took 273 s. After the B3/B4 fixes, **every suite passed**: 2,938 passed, 15 skipped, against the baseline's 2,936 + 17. The two extra tests are create-strutvane's `dist` and hub-docs checks, which now actually run (B5).

Findings specific to that layout:
- **Nested workspaces:** npm accepted the CLI's nested layout (`packages/cli` plus `packages/cli/packages/{cli,launcher}`) as workspaces.
- **Biome root config:** it must exclude the hub's `spikes/`, `scripts/`, `site/` and `docs/`, which were never lint-clean (314 errors).
- **Biome include paths:** a root `files.includes` of `packages/**` silently matched nothing in nested `"extends": "//"` configs, because includes are relative to each nested config. Use exclusions instead.

Artifacts: `$S/hub-mono` (converted), `$S/mono` (new-repo variant, 227 commits), `$S/logs/*`.
