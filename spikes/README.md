# Spikes

A **spike** is a small, time-boxed experiment that answers one risky question *before* real code depends on the answer. Spikes are throwaway code with a permanent result: each folder has a README that states the question, the answer, the evidence and the decision it led to.

Every spike here ran against **real database engines**: PGlite, libSQL, PostgreSQL 18 and PgBouncer.

## Phase 0 results (2026-11-13)

| # | Question | Answer | Evidence | Decision |
|---|---|---|---|---|
| [01](01-model-to-migration/) | Can one model definition produce correct migrations for Postgres and SQLite, without interactive prompts, asking about renames instead of guessing, and blocking destructive changes? | **Yes**, but Strutvane must own rename resolution: drizzle-kit 0.31 prompts on every possible rename. | 23 tests on PGlite + libSQL | [ADR-0009](../docs/adr/0009-migration-engine-owns-rename-resolution.md) |
| [02](02-policy-to-sql/) | Can one authorization rule run both in memory (one record) and as SQL (lists) with identical results? | **Yes**, with two-valued, NULL-safe semantics and a shared validation gate. Also found and fixed a null-actor privilege-escalation trap. | 70 tests, including 43,930 property-based comparisons with 0 mismatches, and mutation checks | [ADR-0008](../docs/adr/0008-policy-predicates-two-valued-semantics.md), [RFC-0001](../docs/rfcs/0001-contracts-v0.md) |
| [03](03-postgres-rls-tenancy/) | Does Postgres row-level security keep tenants isolated, including through connection pooling (PgBouncer)? | **Yes**, under five mandatory rules. Session-level `SET` leaks across tenants (40/40), and an unset setting reads as `''`. | 37 tests on PostgreSQL 18 + PgBouncer; 2,400 concurrent transactions with 0 cross-tenant rows | [ADR-0007](../docs/adr/0007-tenancy-rls-enforcement-rules.md) |

## Running a spike

Each spike is standalone. Use Node 24+ and pnpm, run through corepack:

```bash
cd spikes/02-policy-to-sql
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 test
```

Spike 03 needs Docker running. It starts and removes its own throwaway containers, and no Docker files are committed ([ADR-0006](../docs/adr/0006-docker-local-only.md)).

## Rules for spikes

- **Answer one question,** and state it at the top of the README.
- **Test against real engines.** Mocks don't count as evidence.
- **Report honestly:** what was verified, what wasn't, and what failed along the way.
- **Turn each finding into a decision:** an ADR, an RFC change, or a roadmap item.
- **Spike code is never imported by real packages.** Productised code is rewritten with full tests.
