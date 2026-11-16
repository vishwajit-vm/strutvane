# STATE.md: the single source of truth for "where are we right now"

> **Rules for this file** (project lead, 2026-11-16):
> - Read it first at the start of every session and after any context summary. Trust it over memory.
> - Every number here was **verified by the coordinator** (re-run, not taken from an agent's report). An unverified claim is marked *(agent-reported)*.
> - Update it in the same commit as every verification, merge, decision or plan change. Add the date.
> - **Run `node scripts/state-check.mjs` at the start of every session and before reporting status.** It fails if any repo has uncommitted or unpushed work, or if this file names a commit that doesn't exist.
> - Details live elsewhere and are linked, not copied: decisions in `spikes/CONSISTENCY-2026-11-15.md`, the plan in `docs/21-delivery-plan.md`, rules in `docs/19-production-readiness.md`, each branch's `NEXT.md`.

_Last updated: 2026-11-16_

## 1. Release status
| Item | State |
|---|---|
| npm account | read-only until **2026-11-17 08:35 UTC** (nothing publishes before then) |
| Next release | core train **0.2.0-next.0** (CONSISTENCY #128): framework, auth, ui, design-crisp, design-vivid, create-strutvane, skeleton |
| Release order | framework → auth → ui → designs → create-strutvane (see `release/0.2/patches/README.md`) |
| `RELEASE_ENABLED` | true on framework, auth, ui, logs and create-strutvane; any push to `main` runs the release workflow, which only stages and needs 2FA approval |

## 2. Repos and branches (`vishwajit-vm/*`)
| Repo | `main` | Work branch | Branch state | Verified by coordinator |
|---|---|---|---|---|
| strutvane (hub) | blueprint, docs 18–21, ADRs to 0023, spikes, decisions 1–129 | — | — | pushed |
| strutvane-framework | **v2 at 0.1.0-next.1** (1fd4885) | `v2/data-layer` (ORM + migrations) and `v2/app-core` (MVC + commands) | 🔄 agents building | `main`: 1,466 tests pass, code rules clean (2026-11-16) |
| strutvane-auth | v1 + 6 audit fixes | `v2/native-engine` (ADR-0023) at **0.2.0-next.0** | ✅ done and **pushed** (39bba2f, 2026-11-16, lead approved) | v2: 819 tests + 63 Postgres integration, 3× green *(agent-reported; the coordinator's re-run is pending)* |
| strutvane-ui | v1 + 17 audit fixes | `v2/behaviour` at **0.2.0-next.0** | ✅ done and **pushed** (3ca9c57, 2026-11-16, lead approved) | v2: **488 tests**, coverage 97.1/92.9/96.4/98.4 (2026-11-16) |
| create-strutvane | v1 | `v2/installer` at **0.2.0-next.0** | ✅ done and **pushed** (52cebb1, 2026-11-16, lead approved) | 473 tests, 3× green *(agent-reported; the coordinator's re-run is pending)* |
| strutvane-logs | v1 | `v2/channels` (ADR-0022) | ✅ audited and pushed; folds into the framework next | 573 tests |
| strutvane-tooling | npm + R1–R9 CI | — | — | 129 tests |
| strutvane-docs | v2 site, live at https://vishwajit-vm.github.io/strutvane-docs/ (flat Packages menu) | `0.1.x` = old v1 site | — | 522 pages, 0 broken links |
| strutvane-files | v1, first pushed 2026-11-16 | — | — | — |
| strutvane-design-crisp / -vivid | **repos not created yet** (local `packages/design-*`) | `main` (local) | 🔄 agents building | — |
| core, contracts, cli, devkit | archived (moved into the framework) | — | — | — |

## 2a. Agents running right now (updated 2026-11-16)
| Work | Repo / branch | Started | Expected result |
|---|---|---|---|
| Framework database layer (ORM, migrations, migrate, seeding, sandbox F-06) | framework  | 2026-11-16 | 0.2.0-next.0, gate 3× green, then merge |
| Framework app core (Application.configure, routing, security kit, commands, facades, lowercase codes) | framework  | 2026-11-16 | same |
| design-crisp (default design package) | new local repo packages/design-crisp | 2026-11-16 | conformance passes; the coordinator creates the GitHub repo and pushes |
| design-vivid | new local repo packages/design-vivid | 2026-11-16 | same |

When an agent finishes: re-run its gate, update §2 and §6, push, and remove it from this table.

## 3. Open decisions (waiting on the project lead)
| # | Question | Coordinator's recommendation |
|---|---|---|
| — | none right now | — |

## 4. Next steps (in order)
1. Finish and verify auth v2, then push and merge it after the framework is published.
2. Framework `v2/data-layer` and `v2/app-core`: verify, merge, release as 0.2.0-next.0.
3. design-crisp and design-vivid: create the repos, verify, push.
4. Logging fold-in → log-viewer → installers (`node strut install:x`) → skeleton → catalogue CI → npx guard.
5. After npm unlocks: stage the framework, refresh the downstream lockfiles, apply the release patches, release the 0.2 core train.
6. Acceptance: the demo app with the installer, then remove the docs' "Coming in 0.2" labels, then **0.2.0**.

## 5. Open security items
Tracked privately in `docs/research/2026-11-15-audit-findings.md` (git-excluded), never in this public file.

## 6. Verification log (newest first)
| Date | What | Result |
|---|---|---|
| 2026-11-16 | ui `v2/behaviour` at 3ca9c57, full gate | 488 passed, 0 failed |
| 2026-11-16 | framework `main` 1fd4885 (fix pass), full gate with strict unhandled rejections | 1,466 passed, code rules 0 |
| 2026-11-16 | spike 20 (auth prototype) | 279 passed |
| 2026-11-15 | docs site (deployed) | 522 pages, 0 broken links, 173 tests |
