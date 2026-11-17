# STATE.md: the single source of truth for "where are we right now"

> **Rules for this file** (project lead, 2026-11-16):
> - Read it first at the start of every session and after any context summary. Trust it over memory.
> - Every number here was **verified by the coordinator** (re-run, not taken from an agent's report). An unverified claim is marked *(agent-reported)*.
> - Update it in the same commit as every verification, merge, decision or plan change. Add the date.
> - **Run `node scripts/state-check.mjs` at the start of every session and before reporting status.** It fails if any repo has uncommitted or unpushed work, or if this file names a commit that doesn't exist.
> - Details live elsewhere and are linked, not copied: decisions in `spikes/CONSISTENCY-2026-11-15.md`, the plan in `docs/21-delivery-plan.md`, rules in `docs/19-production-readiness.md`, each branch's `NEXT.md`.

_Last updated: 2026-11-17. **Work is PAUSED** until the weekly usage limit resets (2026-11-18 00:00 UTC; it reached 85% on 2026-11-17). Everything is committed and pushed to GitHub with the personal account (never the office account). Run `node scripts/state-check.mjs` and `node scripts/identity-check.mjs` at resume._

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
| strutvane-framework | **0.2.0-next.0** (b9a23ab, 2026-11-17): v2 app core + data layer merged | `v2/data-layer`, `v2/app-core`, `v2/merge-0.2` (all merged into main) | ✅ merged and pushed. **Release blocked:** CI's TruffleHog step fails on fake test DSNs already in history (see §4 step 1) | `main`: 2,981 passed, 16 skipped, 0 failed, 3× in a row (coordinator, 2026-11-17); coverage 96.4/90.9/97.2/97.4 |
| strutvane-auth | v1 + 6 audit fixes | `v2/native-engine` (ADR-0023) at **0.2.0-next.0** | ✅ done and **pushed** (39bba2f, 2026-11-16, lead approved) | v2: 819 tests + 63 Postgres integration, 3× green *(agent-reported; the coordinator's re-run is pending)* |
| strutvane-ui | v1 + 17 audit fixes | `v2/behaviour` at **0.2.0-next.0** | ✅ done and **pushed** (3ca9c57, 2026-11-16, lead approved) | v2: **488 tests**, coverage 97.1/92.9/96.4/98.4 (2026-11-16) |
| create-strutvane | v1 | `v2/installer` at **0.2.0-next.0** | ✅ done and **pushed** (52cebb1, 2026-11-16, lead approved) | 473 tests, 3× green *(agent-reported; the coordinator's re-run is pending)* |
| strutvane-log-viewer (renamed from strutvane-logs 2026-11-17; old URL redirects) | v1 | `v2/channels` (ADR-0022) | ✅ audited and pushed; logging folds into the framework next | 573 tests |
| strutvane-tooling | npm + R1–R9 CI | — | — | 129 tests |
| strutvane-docs | v2 site, live at https://vishwajit-vm.github.io/strutvane-docs/ (flat Packages menu) | `0.1.x` = old v1 site | — | 522 pages, 0 broken links |
| strutvane-files | v1, first pushed 2026-11-16 | — | — | — |
| strutvane-design-crisp | **0.2.0-next.0** (5d5fcd6), repo created 2026-11-16 | — | ✅ done; conformance passes | **105 tests**, coverage 100% (2026-11-16) |
| strutvane-design-vivid | **0.2.0-next.0** (5956bfe), repo created 2026-11-16 | — | ✅ done; conformance 15/15 | **233 tests**, coverage 100% (2026-11-16) |
| 43 planned repos (README + LICENSE only) | created 2026-11-17: strutvane-skeleton, strutvane-npx, strutvane-design-glass and 40 add-ons (`strutvane-<id>` for every planned catalogue id) | — | planned | — |
| core, contracts, cli, devkit | archived (moved into the framework) | — | — | — |

## 2a. Agents running right now (updated 2026-11-17)
None.

## 3. Open decisions (waiting on the project lead)
| # | Question | Coordinator's recommendation |
|---|---|---|
| 1 | Generated apps must not set `isolatedDeclarations` (typed `route()`/`config()` need it off) | accept |
| 2 | `route:list` is the app command; `routes` stays for `strutvane.config.ts` projects | accept |
| 3 | HSTS only in production | accept |
| 4 | Unsafe request with a session cookie to an unknown path answers 419 (CSRF runs before routing) | accept; matches Laravel |
| 5 | Runtime and migrations share one `DB_*` role, so on PostgreSQL the runtime role owns the tables (conflicts with ADR-0007 rule 4) | add `DB_MIGRATE_*` credentials for migrations; runtime role without ownership |
| 6 | `DB_SSLMODE=prefer` connects without TLS (Node drivers can't fall back) | document it; default generated apps to `require` in production |

## 4. Next steps (in order)
1. **Unblock framework CI's secrets scan.** TruffleHog (`--results=verified,unknown`) fails on fake Postgres URLs in tests and doc comments (`u:p@h`, `app:hunter2@db`, test canaries). These are already in history, so inline `trufflehog:ignore` alone won't pass a range scan. Fix in strutvane-tooling, the synced CI (for example a per-repo exclude-paths file for `test/` and fixtures, or build the fixture URLs at runtime), verify locally with the TruffleHog container, sync, then re-run the release on framework `main` (0.2.0-next.0).
2. **npm names:** the project lead runs `npm login`, then `node scripts/reserve-npm-names.mjs` (45 placeholders, `0.0.0-reserved.0` on dist-tag `reserved`), then sets up a trusted publisher (GitHub Actions) per package on npmjs.com.
3. Release framework 0.2.0-next.0: the project lead approves it under npmjs.com → Staged Packages. An old staged `create-strutvane@0.1.0-next.0` (2026-11-14) is still waiting there: reject it, because v2 replaces it.
4. auth and ui v2 branches: switch to lowercase error codes and the issue `field` member (#123, #69); update hub RFC-0003; refresh lockfiles against the published framework; apply `release/0.2/patches`; release the core train at 0.2.0-next.0.
5. Logging fold-in → log-viewer → installers (`node strut install:x`) → skeleton → catalogue CI → npx guard.
6. Security reviews (R3) and soak tests (R4) for auth, ui and the installer; demo app acceptance; **0.2.0**.

## 5. Open security items
Tracked privately in `docs/research/2026-11-15-audit-findings.md` (git-excluded), never in this public file.

## 6. Verification log (newest first)
| Date | What | Result |
|---|---|---|
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
