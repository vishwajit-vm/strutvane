# Spikes

A **spike** is a small, time-boxed experiment that answers one risky question *before* real code depends on the answer. Spikes are throwaway code with a permanent result: each folder has a README that states the question, the answer, the evidence and the decision it led to.

Every spike here ran against **real database engines**: PGlite, libSQL, PostgreSQL 18 and PgBouncer.

## Phase 0 results (2026-11-13): 8 spikes, 375 tests, all re-run and verified

| # | Question | Answer | Evidence | Decision |
|---|---|---|---|---|
| [01](01-model-to-migration/) | Can one model definition produce correct migrations for Postgres and SQLite, without interactive prompts, asking about renames instead of guessing, and blocking destructive changes? | **Yes**, but Strutvane must own rename resolution: drizzle-kit 0.31 prompts on every possible rename. | 23 tests on PGlite + libSQL | [ADR-0009](../docs/adr/0009-migration-engine-owns-rename-resolution.md) |
| [02](02-policy-to-sql/) | Can one authorization rule run both in memory (one record) and as SQL (lists) with identical results? | **Yes**, with two-valued, NULL-safe semantics and a shared validation gate. Also found and fixed a null-actor privilege-escalation trap. | 70 tests, including 43,930 property-based comparisons with 0 mismatches, and mutation checks | [ADR-0008](../docs/adr/0008-policy-predicates-two-valued-semantics.md), [RFC-0001](../docs/rfcs/0001-contracts-v0.md) |
| [03](03-postgres-rls-tenancy/) | Does Postgres row-level security keep tenants isolated, including through connection pooling (PgBouncer)? | **Yes**, under five mandatory rules. Session-level `SET` leaks across tenants (40/40), and an unset setting reads as `''`. | 37 tests on PostgreSQL 18 + PgBouncer; 2,400 concurrent transactions with 0 cross-tenant rows | [ADR-0007](../docs/adr/0007-tenancy-rls-enforcement-rules.md) |
| [04](04-registry-compiler/) | Can app files be discovered by convention and compiled into a typed registry: deterministic, fast enough for watch mode, and without running user code? | **Yes.** oxc parses 200 files in ~7 ms. The TypeScript compiler API takes 605 ms just to load, which rules it out. Found and fixed a Windows watch storm that silently froze the registry. | 50 tests; cold ~200 ms (budget 500), incremental ~10 ms (budget 50) | [ADR-0010](../docs/adr/0010-registry-static-analysis-oxc.md) |
| [05](05-openapi-client/) | Can one Zod model drive validation, OpenAPI 3.1 (with extensions and problem+json) and a typed client that breaks when the server changes? | **Yes, with caveats.** OpenAPI can't express `filter[field][op]`, so the serializer is ours. hey-api fails the strict tsconfig and Hono RPC misses loop-registered routes. The docs page must be self-hosted. | 51 tests; spec validated with 0 warnings; rename breaks the client | [ADR-0011](../docs/adr/0011-openapi-pipeline-and-typed-client.md) |
| [06](06-three-way-merge/) | Can `sv upgrade` merge template changes into user-edited files without ever losing edits? | **Yes.** The real hazard is line endings, not the algorithm: raw diff3 and `git merge-file` turn CRLF files into whole-file conflicts. The property test found a lost-final-newline bug. | 47 tests; 8,000 property cases; 2 planted bugs caught | [ADR-0012](../docs/adr/0012-normalising-three-way-merge.md) |
| [07](07-better-auth-adapter/) | Can Better Auth sit behind our IdentityEngine with no type leakage, and is it secure? | **Yes, with mandatory hardening.** Found: sessions survive password reset, reset timing reveals which emails exist (419 vs 12 ms), `X-Forwarded-For` spoofing bypasses rate limits, ids aren't UUIDs. A second engine passes the same contract suite. | 49 tests on PostgreSQL 18; 3 planted bugs caught | [ADR-0013](../docs/adr/0013-better-auth-hardened-adapter.md) |
| [08](08-ui-renderer/) | Can a complete, accessible, permission-aware CRUD UI be rendered purely from the manifest, with overrides that need no fork? | **Yes.** Five real UI defects were caught and fixed (e.g. decimal point swallowed, virtual table rendering zero rows). Server errors land on the exact field. | 48 tests; axe-core 0 violations; 500 rows virtualized | [ADR-0014](../docs/adr/0014-ui-from-manifest-with-registries.md) |

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
