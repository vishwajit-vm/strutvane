# ADR-0008: Authorization predicates compile from one AST with two-valued, NULL-safe semantics

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 02 report](../../spikes/02-policy-to-sql/README.md), [RFC-0001](../rfcs/0001-contracts-v0.md), [07 Auth §3](../07-package-auth.md)

## Context

Policies must answer the same question in two places:
- in memory, for one record: "may I approve *this* invoice?"
- in SQL, for list queries: "show me the invoices I may approve"

The two answers must be identical. If they disagree, a user either sees records they cannot open, or, worse, can open records that lists hide from them.

Spike 02 found that several SQL features break this equivalence when used naively:
- three-valued NULL logic
- `LIKE` wildcards
- collation-dependent text ordering
- implicit casts

It also found a privilege-escalation trap: with NULL-safe equality, a null actor attribute matches every row where that field is null.

## Decision

- **One shared AST:** policies compile to the portable `QueryFilter` AST in `@strutvane/contracts`.
- **Two-valued, NULL-safe semantics** are normative ([RFC-0001](../rfcs/0001-contracts-v0.md)). `ne`/`nin` are exact negations of `eq`/`in`. Ordering is false on null and allowed on numeric fields only. Text operators match literally.
- **One shared gate.** Every input passes the same bind + validate step before either path:
  - The bind step replaces actor references with the actor's values. A null actor value never matches, and a missing actor attribute throws.
  - Validation rejects unknown fields, mistyped values, non-numeric ordering and U+0000.
- **NULL-safe SQL output.** The SQL compiler emits leaves that are never NULL:
  - `IS [NOT] DISTINCT FROM`
  - `COALESCE(<comparison>, FALSE)`
  - OR-chains of NULL-safe equalities for `in`
  - `strpos` for text matching
- **To-one relations** compile to correlated scalar subqueries, so a missing related row reads as NULL on both paths.
- **Equivalence is permanently tested.** The property-based suite moves into `@strutvane/auth` and runs on every supported SQL dialect. The spike's two mutation checks (naive `<>`, missing `COALESCE`) stay as regression tests.
- **Builder only for developers.** App developers only get the typed builder, where misspelled fields are compile errors. JSON filters from UIs are accepted only through validation.

## Consequences

- **Positive:** list filtering and single-record checks can never silently disagree, and the null-actor escalation is impossible by construction.
- **Costs:**
  - The semantics differ from hand-written SQL (`ne` includes NULLs), so the docs must explain this with examples.
  - Each SQL dialect needs its own renderer and its own property run (MySQL `<=>`, SQLite `IS`).
- **Follow-ups (Phase 2):**
  - To-many relations (`EXISTS`), date/time comparisons and `numeric` precision.
  - Performance benchmarking of relation subqueries.
