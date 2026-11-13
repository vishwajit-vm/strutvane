# ADR-0009: The migration engine owns rename resolution and destructive-change gating

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 01 report](../../spikes/01-model-to-migration/README.md), [ADR-0003](0003-model-first-thin-metadata-driven-generation.md), [ADR-0004](0004-drizzle-behind-internal-data-adapter.md), [06 Framework §3](../06-package-framework.md)

## Context

`sv migrate` must turn model changes into SQL migrations automatically. It must never silently guess a rename, never drop data without confirmation, and never hang waiting for input in CI.

Spike 01 compiled one model DSL to Drizzle tables for PostgreSQL (tested on PGlite) and SQLite (tested on libSQL), then applied the generated migrations to both engines. All 23 tests pass.

It found one blocker: drizzle-kit 0.31.11 opens an interactive prompt whenever a diff *could* be a rename, i.e. a table or column is removed and another added in the same diff. Without a terminal it throws; with one it waits for input.

drizzle-kit 1.0.0-rc.5 adds a non-interactive `hints` API. It is not stable yet, and the spike only read its types without running it.

## Decision

- **Strutvane owns migration planning.** The planner interface uses only Strutvane types, never Drizzle types. Drizzle is an internal detail, per ADR-0004.
- **Renames are always resolved explicitly.**
  - In the CLI, `sv migrate` asks the user.
  - In code or CI, the caller supplies a `resolveRename` callback or recorded answers.
  - If no answer is available, planning fails with `RenameResolutionRequiredError`. It never prompts and never guesses.
  - Answers are recorded in the migration file header.
- **Planning steps:**
  1. Emit our own `RENAME` SQL for resolved renames.
  2. Run two prompt-free Drizzle diffs: removals first, then additions.
  3. Run `assertPromptFree` around every Drizzle call.
  4. Check that re-planning right after applying a migration yields zero statements.
- **Destructive changes are classified and blocked by default.** These need interactive confirmation, or `--allow-destructive` in CI:
  - dropping a table or column
  - narrowing a column
  - changing a column's type
  - removing an enum value
  - making a column NOT NULL without a default
- **Proven schema conventions:**
  - Enums are `TEXT` plus a named `CHECK` constraint. Native Postgres enums trigger extra rename prompts and are hard to change.
  - Decimals are `numeric(p,s)` on Postgres and `TEXT` on SQLite, to keep exact values.
  - Primary keys are application-generated UUIDv7.
  - `unique()` on a tenant-scoped model means unique per tenant: a composite unique index with `tenant_id`.
- **Upgrade path:** when drizzle-kit 1.0 is stable, swap the planner internals to its `hints` API behind the same interface, and keep the spike's tests as the acceptance suite.

## Consequences

- **Positive:**
  - Migrations are deterministic, CI-safe and reviewable.
  - Renames are never guessed.
  - Data loss always requires a human decision.
- **Costs:** we maintain rename and destructive-change logic until drizzle-kit 1.0 is stable.
- **Follow-ups (Phase 1):**
  - Apply-level tests for type changes, narrowing, enum value removal and NOT NULL tightening, including SQLite's table-rebuild path.
  - Dropping a table that other tables reference.
  - A MySQL renderer.
