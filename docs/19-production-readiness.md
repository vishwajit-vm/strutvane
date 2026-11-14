# 19. Production readiness protocol

- **Status:** Active (project lead, 2026-11-15: "everything must be production ready, ready to deploy on npm")
- **Applies to:**
  - every repo and npm package, both code already built and code in progress;
  - every spike's code once it is ported into a package.
- **Related:** [13 testing strategy](13-testing-strategy.md), [12 security model](12-security-model.md), [17 integration map](17-integration-map.md), [ADR-0018 staged publishing](adr/0018-staged-npm-publishing.md), [ADR-0020 versioning](adr/0020-versioning-branches-and-support-policy.md), [18 blueprint](18-v2-blueprint.md)

## The rule

A package version reaches npm `latest` only when **every gate below (R1–R9) passes and has evidence**. Gates are checked by machines wherever possible, and a failing gate blocks the release. Nothing is "done" because someone says so: it is done when the evidence exists.

- **Spikes** are never published. Their code is ported into a package and then has to pass every gate there.
- **v1 packages** that are already on npm under `next` are held to the same gates before any v2 release.

## Gates

| Gate | What must be true | How it is checked |
|---|---|---|
| **R1 Code** | Strict TypeScript, ESM. No `any`, no non-null assertions, no decorators. Lint clean. No `console.*` in package code (use the `Logger`). No TODO or FIXME without an issue link. A friendly TSDoc block on every export (what, why, example). | CI: `npm run ci` (Biome and `tsc`); a grep check for TODO and `console.` |
| **R2 Tests** | The full gate is green on Node 24 and 26, on Linux, Windows and macOS. Coverage is at least 90/90/85/90. Public types have type-level tests that prove misuse fails to compile. There is no flaky test (3 green runs in a row), no open handles, and no unhandled rejections (`--unhandled-rejections=strict`). | The CI matrix, a repeat job and the hanging-process reporter |
| **R3 Security** | A written threat model for the package's attack surface. Attack-style tests for that surface (tenancy, injection, CSRF, sessions, enumeration, uploads, rate limits, as relevant). Every parser is fuzzed. A security review with **0 open critical or high** findings. `npm audit --omit=dev` shows 0 high or critical. A secrets scan is clean. Every security fix ships with a regression test for its whole class. | The `security-reviewer` agent report; CI audit and secrets jobs |
| **R4 Resilience** | Failure scenarios are named and tested: a dependency down or slow, timeouts, partial failure, shutdown with work in flight, restart. The package fails closed with friendly errors. Retries are idempotent. Every server or long-running process passes a soak test with no growth in heap, handles or connections. | Resilience suites; `npm run test:soak` (outside the default gate, required before release) |
| **R5 Packaging** | `publint` and `@arethetypeswrong/cli` are clean. `npm pack` contents are reviewed: no tests, fixtures, secrets or local source-map paths. Every `exports` path resolves in Node ESM and in TypeScript (node16 and bundler resolution). `engines.node` is `>=24.3`. Peer ranges are correct, and an app ends up with exactly one copy of the framework. LICENSE, README and CHANGELOG are present. A changeset exists. | The CI `package-check` job |
| **R6 Integration** | The package installs alone, and together with every other published package in any order, with identical results. Re-installing changes nothing. `.env.example` lists every env var the code reads and contains no secrets. Boot fails closed on missing or bad config. Only the six allowed connections are used (doc 17). The acceptance app (Northwind Ops, built by the installer) is green with this version. | The hub's nightly ecosystem job; the installer end-to-end test |
| **R7 Docs** | Every public feature has a page on the versioned docs site, with tested examples. The upgrade guide has an entry for anything that changed. No "Coming in" marker remains on anything announced as shipped. **The same change** also updates the docs site's packages data (status: available, preview, planned, shelved or retired, with the replacement), the "What's new in 0.N" page, the versioning/support table and the deprecation list. That covers every new feature, deprecation, retirement, repo archive or version bump. | Docs site tests (writing guide, links, examples, a packages-data completeness check) |
| **R8 Release** | The version follows ADR-0020. Publishing is staged by CI through trusted publishing with provenance and approved with 2FA by a maintainer (ADR-0018). The dist-tag is correct. There are release notes and a rollback plan (`npm deprecate`, plus moving the dist-tag back). The support table (`versions.json`) is updated. | The release workflow; owner approval |
| **R9 Operations** | Logging goes only through the framework `Logger`, with redaction (ADR-0022). Health and readiness checks are registered where relevant. No debug tool is reachable in production. | Tests plus `security:check` |

## Evidence

Each repo keeps a `RELEASE-READINESS.md` with one row per gate. Each row records:
- pass or fail;
- a link to the evidence (CI run, report or test file);
- the date.

The coordinator re-runs every check before marking a gate as passed, and never accepts an agent's word alone. The project lead approves the staged npm release.

## Order of work

1. Fix every open critical or high finding first, in all repos, built or in progress.
2. Then bring each package through R1–R9, following the phase order (blueprint §10): framework, auth, ui with the designs, create-strutvane and skeleton, log-viewer.
3. A package that isn't needed any more is marked deprecated on npm, with a pointer to its replacement, and its repo is archived (read-only, never deleted). This happens only after the replacement is released, so no user is pointed at a version that doesn't have the code yet.

## Current status (2026-11-15)

| Package | Status |
|---|---|
| `@strutvane/framework` | **Not ready.** v2 consolidation is on a branch, under audit, resilience and packaging review |
| `@strutvane/auth` | **Not ready.** v1 is under audit; v2 core proven in spike 20 |
| `@strutvane/ui` and the designs | **Not ready.** v1 is under audit; the designs are mockups (spikes 17 and 19) |
| `create-strutvane` | **Not ready.** v2 is proven in spike 13 and under audit |
| `@strutvane/logs` → `log-viewer` | **Not ready.** Channels (ADR-0022) are in progress |
| `@strutvane/{core,contracts,cli,devkit}` | **Retired.** Merged into the framework. Deprecate on npm once the framework v2 release exists |
| npm account | Read-only until 2026-11-17 08:35 UTC; nothing can be published or deprecated before then |
