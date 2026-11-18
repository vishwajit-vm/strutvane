# STATE.md: the single source of truth for "where are we right now"

> **Rules for this file** (project lead, 2026-11-16):
> - Read it first at the start of every session and after any context summary. Trust it over memory.
> - Every number here was **verified by the coordinator** (re-run, not taken from an agent's report). An unverified claim is marked *(agent-reported)*.
> - Update it in the same commit as every verification, merge, decision or plan change. Add the date.
> - **Run `node scripts/state-check.mjs` at the start of every session and before reporting status.** It fails if any repo has uncommitted or unpushed work, or if this file names a commit that doesn't exist.
> - Details live elsewhere and are linked, not copied: decisions in `spikes/CONSISTENCY-2026-11-15.md`, the plan in `docs/21-delivery-plan.md`, rules in `docs/19-production-readiness.md`, each branch's `NEXT.md`.

_Last updated: 2026-11-18 ~14:10 UTC (19:40 IST). Agents are stopped for the usage limit (5-hour window at 71%); every branch is committed and pushed. The coordinator is verifying framework `fix/release-0.2` (run 1: 3,121 passed). Auto-resume at 21:07 IST._

## 1. Release status
| Item | State |
|---|---|
| npm account | unlocked since **2026-11-17 08:35 UTC**; publishing and approving still need the project lead present for 2FA |
| Next release | core train **0.2.0-next.0** (CONSISTENCY #128): framework, auth, ui, design-crisp, design-vivid, create-strutvane, skeleton |
| Release order | framework → auth → ui → designs → create-strutvane (see `release/0.2/patches/README.md`) |
| `RELEASE_ENABLED` | true on framework, auth, ui, logs and create-strutvane; any push to `main` runs the release workflow, which only stages and needs 2FA approval |

## 2. Repos and branches (`vishwajit-vm/*`)
| Repo | `main` | Work branch | Branch state | Verified by coordinator |
|---|---|---|---|---|
| strutvane (hub) | blueprint, docs 18–21, ADRs to 0023, spikes, decisions 1–129 | — | — | pushed |
| strutvane-framework | **0.2.0-next.1** (d7efea4, 2026-11-18): all 5 release blockers fixed (compat, database connection, resources.json internals, `ConfigOf`/`RoutesOf`, replay timeout) + Windows/macOS CI fixes | `v2/logging` f3e28b8 (logging, not merged) | ✅ merged and pushed; **release workflow running** → stages 0.2.0-next.1 for the lead's approval | **3,121 passed, 17 skipped, 3×** (coordinator, 2026-11-18); publint OK; audit (prod) OK |
| strutvane-auth | v1 + 6 audit fixes | `v2/native-engine` 9e4bf38: lowercase codes + `field` (2d3a47a, 247e02f) + WIP | 🔄 pushed; its gate timed out under machine load | not verified |
| strutvane-ui | v1 + 17 audit fixes | `v2/behaviour` c375f7b: lowercase codes + `field` + deterministic debounce tests | ✅ verified; waits for the framework on npm (then lockfile refresh, `changeset version`, merge) | **499 passed, 3×**, against a framework 0.2.0-next.0 tarball (coordinator, 2026-11-18) |
| create-strutvane | v1 | `v2/installer` at **0.2.0-next.0** | ✅ done and **pushed** (52cebb1, 2026-11-16, lead approved) | 473 tests, 3× green *(agent-reported; the coordinator's re-run is pending)* |
| strutvane-log-viewer (renamed from strutvane-logs 2026-11-17; old URL redirects) | v1 | `v2/channels` (ADR-0022) | ✅ audited and pushed; logging folds into the framework next | 573 tests |
| strutvane-tooling | **d91e087** (2026-11-18): `app-template` profile; npx (library) and skeleton targets | — | ✅ merged | **144/144, 3×** (coordinator, 2026-11-18) |
| strutvane-docs | v2 site, live at https://vishwajit-vm.github.io/strutvane-docs/ | `docs/framework-0.2` 2c9b4a1 (framework 0.2 pages, WIP, not build-checked) | 🔄 pushed WIP | — |
| strutvane-files | v1, first pushed 2026-11-16 | — | — | — |
| strutvane-design-crisp | **0.2.0-next.0** (5d5fcd6), repo created 2026-11-16 | — | ✅ done; conformance passes | **105 tests**, coverage 100% (2026-11-16) |
| strutvane-design-vivid | **0.2.0-next.0** (5956bfe), repo created 2026-11-16 | — | ✅ done; conformance 15/15 | **233 tests**, coverage 100% (2026-11-16) |
| strutvane-npx (`strutvane`, npx guard) | **0.2.0-next.0** (10aa9b1, tooling sync merged 2026-11-18) | — | ✅ done; CI/release workflows synced; `RELEASE_ENABLED` not set yet | **107 passed, 3 skipped, 3×** (coordinator, before and after the sync) |
| strutvane-skeleton (app template) | placeholder README | `v2/skeleton` 7a8be7e (template/, skeleton.json, renderer, INSTALLER.md) | 🔄 pushed | 62 tests, 3× *(agent-reported)* |
| 43 planned repos (README + LICENSE only) | created 2026-11-17: strutvane-skeleton, strutvane-npx, strutvane-design-glass and 40 add-ons (`strutvane-<id>` for every planned catalogue id) | — | planned | — |
| core, contracts, cli, devkit | archived (moved into the framework) | — | — | — |

## 2a. Work in flight (updated 2026-11-18 ~14:10 UTC; agents stopped, all pushed)
| Package | Branch | Head | State |
|---|---|---|---|
| `@strutvane/framework` | `main` | d7efea4 | ✅ verified 3× (3,121 passed), versioned **0.2.0-next.1**, merged and pushed; release workflow running |
| `create-strutvane` | `v2/installer` | 0dc67c0 | skeleton switch done; tests for the 7 bugs + 3 apps + tarball integration (focused runs green); full gate not run. Skeleton `user.policy.ts` is rejected by `registry:build` (follow-up) |
| `@strutvane/social-login` | `v2/social-login` | 299a67a | code + 246 tests (agent-reported, older framework build); gate, publint and attw left |
| `@strutvane/search` | `v2/search` | e94a5fc | 4 engines, sync, commands; 93 tests (agent-reported); more tests, README, changeset, gate left |
| `@strutvane/import-export` | `v2/import-export` | 5e7b3a7 | own XLSX/CSV (no SheetJS/ExcelJS), import engine, export, service; CLI, installer, gate left |
| `@strutvane/redis` | `v2/redis` | 6357d64 | all code written; 2 integration files fail to load; Biome errors; gate left |
| `@strutvane/files` | `v2/files` | 1ca9aff | WIP: resumable uploads (agent stalled) |
| `@strutvane/charts` | `v2/charts` | 9ea007f | WIP: server/provider/installer (agent stalled) |
| `@strutvane/health` | `v2/health` | 5663cc7 | WIP: end-to-end tests (agent stalled) |

**Repeated finding from the package agents (framework gaps):** no model events or after-commit hook; `RateLimitStoreToken`, `UsedSignatureStoreToken`, policy registry and `allows()` not exported; providers can't read env; no package message-catalog registration; no shared helper to edit `bootstrap/providers.ts` (each package duplicates one); no `install:<name>` built-in. These belong in the framework's next work item (installers + extension points).

**Housekeeping for the project lead:** a stray `C:\personal_projects\package.json.redis.bak` (left by an agent outside the project; its delete was blocked) can be removed by hand.

## 3. Open decisions (waiting on the project lead)
| # | Question | Coordinator's recommendation |
|---|---|---|
| 1 | Framework and the npx guard both ship a `strutvane` bin; inside an installed app `npx strutvane` runs the framework's, not the guard | drop the framework's `strutvane` bin, keep `strutvane-cli` |
| 2 | Who owns the `users` table: the skeleton's migration or auth's SQL (`CREATE TABLE IF NOT EXISTS users/sessions`)? | the skeleton owns `users`; auth ships its own tables as normal migrations (ADR-0023) |
| 3 | How the installer gets the skeleton | copy it into create-strutvane at build time from a pinned skeleton tag |
| 4 | Skeleton layout: the app lives under `template/`, with lowercase folders (`app/http/controllers`) | accept |
| 5 | Request logging (node/hono/express adapters): a framework hook, or stays in log-viewer? | framework hook; log-viewer only reads |
| 6 | `log:clear` in production | refuse without `--force` in production |
| 7 | Apps log to `storage/logs` by default instead of stdout (ADR-0022) | accept; the production Dockerfile sets `LOG_CHANNEL=stderr` |
| 8 | Catalogue manifest: one `strutvane` block with both dialects (runtime keys + `manifestVersion: 1`), or a nested `strutvane.catalogue` | nested `strutvane.catalogue` (keeps runtime keys clean) |
| 9 | Docs site: hand-fix `src/data/packages.json` drift (48 errors), or have the site read the hub's `catalogue.json` | read `catalogue.json` (one source of truth) |
| 10 | Catalogue nightly autocommit to the hub's `main` by `github-actions[bot]` (new way of pushing to main) | open a PR instead of pushing; review the first nightly run |
| 12 | `users` and `teams` are in the framework's `INTERNAL_TABLES` (security finding F-01), so they're hidden from `resources.json` and the sidebar; the skeleton expects `users` in the sidebar | keep them hidden from the generic CRUD API (F-01); auth provides its own users screen |
| 13 | The installer's first-admin seeder calls `firstAdmin` from `@strutvane/auth`, which auth v2 doesn't have (`openIdentityAdmin` in `/admin` only supports PostgreSQL + database sessions) | auth adds a driver-neutral `createFirstAdmin()` for all engines |
| 11 | `node strut upgrade` and `registry:build/watch` still ship in 0.2.0-next.0 but the docs catalogue lists them as retired | keep them in 0.2.x, mark deprecated, remove in 0.3 |

## 4. Next steps (in order)
1. **Framework release blockers** (found by the skeleton's integration test):
   - `package.json` `strutvane.compat` is `^0.1.0-next.0`, so the 0.2 CLI refuses `migrate`, `db:seed`, `sync`, `start` and `dev`. Set it to `^0.2.0-next.0`, with a test.
   - The v2 `Application` opens no database connection, so models can't query from handlers.
   - `resources.json` exposes internal tables (sessions, cache) and takes `fillable` from the migration.
   - `ConfigOf`/`RoutesOf` are not exported.
   - The replay sandbox's 10 s timeout can't be configured.
   Then merge `fix/ci-cross-platform` (run its gate 3× on a quiet machine), push `main`, CI stages 0.2.0-next.0, and the project lead approves it on npmjs.com.
2. `v2/logging`: gate 3× on a quiet machine plus `test:perf`, pack, publint, attw, audit; then merge.
3. auth `v2/native-engine` and ui `v2/behaviour`: gate 3× (at most 2 heavy gates at once); after the framework is on npm, refresh lockfiles, `changeset version`, merge, and release in train order.
4. Docs `docs/framework-0.2`: finish, build and link-check, then merge (the site deploys from `main`).
5. npx guard: add to `packages/tooling/manifest.json` as a library, sync, set `RELEASE_ENABLED`, release with the train.
6. Skeleton: decisions 2–4, a tooling `app-template` profile, merge; then switch create-strutvane to the skeleton (INSTALLER.md lists 7 template bugs to fix).
7. log-viewer (UI only) → installers (`node strut install:x`) → catalogue CI → R3/R4 → demo app → **0.2.0**.
8. ✅ All 55 npm names exist (reserved, `0.0.0-reserved.0`), confirmed 2026-11-18 by the catalogue check. The project lead: still deprecate the retired `core`, `contracts`, `cli`, `devkit` and `logs` names after the framework release; reject the stale staged `create-strutvane@0.1.0-next.0`.

## 5. Open security items
Tracked privately in `docs/research/2026-11-15-audit-findings.md` (git-excluded), never in this public file.

## 6. Verification log (newest first)
| Date | What | Result |
|---|---|---|
| 2026-11-18 | framework `fix/release-0.2` f658430, full gate 3× + publint + prod audit; versioned 0.2.0-next.1; merged to `main` (d7efea4) and pushed | 3,121 passed, 17 skipped, 0 failed each run |
| 2026-11-18 | log-viewer `v2/log-viewer` 8d85229 | 163 tests 3× *(agent-reported)*; pushed |
| 2026-11-18 | tooling `feat/npx-and-app-template` d91e087 3×; merged to `main` | 144/144 each run |
| 2026-11-18 | npx `chore/tooling-sync` 10aa9b1 3×; merged to `main` | 107 passed, 3 skipped each run |
| 2026-11-18 | ui `v2/behaviour` c375f7b, full gate 3× against a framework 0.2.0-next.0 tarball (`npm install --no-save`) | 499 passed, 0 failed each run |
| 2026-11-18 | npx guard `strutvane` 1e58faf, full gate re-run by the coordinator 3×; merged to `main` | 107 passed, 3 skipped, 0 failed each run |
| 2026-11-18 | ui a9e8751, coordinator gate run 1 | 1 failed (timing-flaky debounce test under load), 495 passed; fixed in c375f7b, re-run pending |
| 2026-11-17 | framework `v2/merge-0.2` b9a23ab (both v2 branches merged, 0.2.0-next.0), full gate re-run by the coordinator 3× in a row; then fast-forwarded to `main` and pushed | 2,981 passed, 16 skipped, 0 failed each run |
| 2026-11-17 | framework release re-run (run 43790797498, `main` 1fd4885) | CI security job failed (TruffleHog flags fake test DSNs); release skipped; npm account shows no lock |
| 2026-11-17 | framework `v2/data-layer` at d8d373a (4 critical/high fixed + 5 review mediums/lows), full gate re-run by the coordinator 3× in a row with real MySQL/MariaDB/Postgres | 2,458 passed, 16 skipped, 0 failed each run; coverage 96.1/90.0/97.4/97.1 |
| 2026-11-17 | framework `v2/app-core` at 23c496e (all NEXT.md items done), full gate re-run by the coordinator 3× in a row | 1,987 passed, 14 skipped, 0 failed each run; coverage 97.0/91.8/97.0/97.9; build OK |
| 2026-11-17 | hub `main` rewritten to remove commits made with the work identity (HANDOFF §5); force-push protection restored | contributors API lists only `vishwajitvm`; state-check and identity-check OK |
| 2026-11-17 | paused for the weekly usage limit (85%) | framework `v2/data-layer` f9e505a and `v2/app-core` ef3ab03 unchanged; nothing uncommitted |
| 2026-11-16 (pause) | framework `v2/app-core` ef3ab03 and the hub pushed | pushed |
| 2026-11-16 (pause) | `scripts/state-check.mjs` before stopping | every repo committed; see the hub commit for the pause |
| 2026-11-16 | framework `v2/data-layer` pushed (f9e505a); notes scrubbed of unfixed security details before the first push | pushed |
| 2026-11-16 | ui `v2/behaviour` at 3ca9c57, full gate | 488 passed, 0 failed |
| 2026-11-16 | framework `main` 1fd4885 (fix pass), full gate with strict unhandled rejections | 1,466 passed, code rules 0 |
| 2026-11-16 | spike 20 (auth prototype) | 279 passed |
| 2026-11-15 | docs site (deployed) | 522 pages, 0 broken links, 173 tests |
