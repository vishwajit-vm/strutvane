# Spike 02: One policy, two execution paths (in-memory ⇄ SQL)

> **Status:** complete, 2026-11-13. **Verdict: YES, feasible**, with four semantic rules that MUST be adopted (§5).
> Throwaway spike code: it informs `@strutvane/contracts` (QueryFilter) and `@strutvane/auth` (policy engine). Do not import it from product code.

## 1. Question

Can one typed authorization rule definition such as

```ts
allow('read',    { when: ({ actor, row }) => row.ownerId.eq(actor.id) })
allow('approve', { role: 'manager', when: ({ row }) => row.amount.lte(10_000) })
deny('delete',   { when: ({ row }) => row.status.eq('paid') })
```

(plus `and/or/not`, `in/nin`, `isNull`, `contains` and to-one relation paths like `row.customer.region.eq(actor.attrs.region)`) **both**

1. evaluate in memory against a single record (`can(actor, action, record)`), **and**
2. compile to a parameterized SQL `WHERE` clause for list queries (`filterFor(actor, action)`),

with deny-overrides-allow, deny-by-default, and **identical results** on both paths?

## 2. Answer

**Yes.** A rule compiles once to a portable, JSON-serialisable `Filter` AST. That AST is

- **bound** (actor references replaced by values),
- **validated** against the model schema, and then
- either **evaluated** in JavaScript or **compiled** to Postgres SQL.

Property-based testing found **no disagreement** between the two paths across 43,930 record-level comparisons on a real Postgres engine (PGlite). The tests demonstrably catch the classic bugs: see the mutation checks in §3.

Equivalence is **not automatic**. Naive SQL disagrees with JavaScript in at least three ways, and a naive binding rule opens a privilege escalation. §5 lists the rules that make the guarantee hold.

## 3. Evidence

| Check | Result |
|-------|--------|
| `pnpm typecheck` (`tsc --noEmit`, strictest flags) | ✅ clean. Includes **7 `@ts-expect-error` compile-time guarantees** (unknown field, unknown relation field, wrong value type, ordering on text, `contains` on numbers, wrong actor attribute type, undeclared actor attribute). |
| `pnpm test` | ✅ **6 files, 70 tests passed** |
| Operator semantics (`operators.test.ts`) | 34 cases, each with an **explicit expected result**, asserted on both paths. 3 extra tests show that naive SQL (`<>`, bare `NOT`, `LIKE`) gets these cases wrong. |
| **Property: random filter ASTs** | `evaluate(filter, row)` ≡ `row ∈ SELECT … WHERE compile(filter)` |
| **Property: the real policy** | `can(actor, action, row)` ≡ `row ∈ SELECT … WHERE compile(filterFor(actor, action))` for 6 actions |
| Property scale (evidence run, `PROPERTY_RUNS=1000`) | **2 × 1,000 runs, 43,930 row-level comparisons, 0 mismatches**. The default `pnpm test` uses 300 runs per property for speed. |
| **Mutation check 1**: emit naive `col <> $1` for `ne` | ❌ property failed after **15** runs, with counterexample `not(or(ne(ownerId, null)))` on a NULL owner |
| **Mutation check 2**: drop `COALESCE` around `<`/`>` | ❌ property failed after **3** runs |
| Injection (`injection.test.ts`) | 9 payloads × 4 operators: always parameters, never SQL text, tables intact. Untrusted ASTs with unknown or injected field names, deep paths, mistyped values, ordering on text or NUL characters are all **rejected**. |
| Composability (`kysely.test.ts`) | The fragment drops into a Kysely query with the caller's own parameters. Placeholders are renumbered correctly and the query runs on Postgres. |

**Generators were biased toward edge cases:**

- NULLs in every column
- empty strings
- `%` and `_`
- `x'; DROP TABLE …`
- unicode (`ä`, `😀`)
- dangling foreign keys (customer 7/8 never exists)
- the 10,000 boundary
- int32 max

They also produce random actors (roles and null attributes) and nested `and/or/not` trees up to several levels deep.

Example output of `filterFor(dave{regional, region:'US'}, 'read')`:

```sql
((("t"."owner_id" IS NOT DISTINCT FROM $1::text)
   OR ((SELECT "__rel_customer"."region" FROM "customers" AS "__rel_customer"
        WHERE "__rel_customer"."id" = "t"."customer_id") IS NOT DISTINCT FROM $2::text))
 AND (NOT ("t"."archived" IS NOT DISTINCT FROM $3::bool)))
-- params: ["dave", "US", true]
```

## 4. Design

```
definePolicy(rules)            typed builder (src/builder.ts) records AST once per rule
      │
filterFor(actor, action)       select rules by action+role → OR(allows) AND NOT OR(denies); none → FALSE
      │
bindActor(ast, actor)          actor refs → literals; null-actor rule (§5.3); missing attr → throw
      │
validate(ast, schema)          fields exist, value types fit, op/type compatibility, no U+0000  ← SHARED GATE
      ├──────────────► evaluate(ast, record)      in-memory, two-valued   (src/evaluate.ts)
      └──────────────► compile(ast) → tokens      parameterized SQL        (src/sql.ts)
                             ├─► renderPostgres → { sql: "$1::text …", params }
                             └─► policyWhere   → Kysely RawBuilder<SqlBool>
```

- **AST** (`src/ast.ts`): `true/false/and/or/not`, `eq/ne/gt/gte/lt/lte`, `in/nin`, `isNull`, `contains`. Field paths are `[field]` or `[relation, field]`, and operands are a literal or an actor reference. It is plain data, ready to move into `@strutvane/contracts`.
- **Builder** (`src/builder.ts`): mapped types derive the allowed fields and operators from the model's TypeScript shape. At runtime it records paths only, and `validate` re-checks everything. That way untyped callers, such as JavaScript or a UI sending JSON filters, cannot bypass the rules.
- **Shared gate**: both paths call the same `bindActor` + `validate`. An input is therefore either accepted by both paths (with identical results) or rejected by both (fail closed, same error).
- **Own SQL emitter vs Kysely:** the fragment compiler is ~150 lines and emits tokens. Kysely is the *consumer* (via `policyWhere`), not the emitter. Kysely's builder would not remove the need to hand-pick the NULL-safe operator per leaf. Owning the emitter keeps the semantics explicit and auditable, and makes MySQL/SQLite renderers straightforward later. The token form adapts to any query builder.

## 5. Rules that MUST be adopted (the real findings)

1. **Two-valued logic everywhere.** Every leaf compiles to an expression that is never NULL, so `NOT` behaves like JavaScript's `!`:
   - `eq`: `IS NOT DISTINCT FROM`
   - `ne`: `IS DISTINCT FROM`. Naive `col <> $1` returns NULL for a NULL column and **silently drops rows** that JS calls "not equal".
   - `gt/gte/lt/lte`: `COALESCE(col > $1, FALSE)`. A bare `NOT (amount < $1)` drops NULL rows.
   - `in/nin`: an OR of NULL-safe equalities. `= ANY($1)` is NULL for a NULL column and can't match a NULL element.
2. **`contains` uses `strpos`, never `LIKE`.** A user value of `_` or `%` is a wildcard under `LIKE`: searching for `_` matched 3 rows instead of 1.
3. **SECURITY: a null actor value never matches.** Under rule 1, `row.region.eq(actor.attrs.region)` for an actor whose region is NULL would become `region IS NOT DISTINCT FROM NULL`, **granting every record whose region is NULL**. The spike's own policy test exposed this. The fix lives in `bindActor`, before either path:
   - `eq(field, nullActorValue)` → `FALSE`
   - `ne(...)` → `TRUE`
   - null actor values are dropped from `in`/`nin`
   - a **missing** (`undefined`) actor attribute **throws**: identity must set every referenced attribute explicitly (null is allowed)

   Literal nulls written by developers (`row.status.eq(null)`) keep their IS NULL meaning.
4. **Fail closed on anything the paths could disagree on**, and make it identical on both paths:
   - **Ordering:** only on numeric fields. Text ordering depends on collation (JS compares UTF-16 code units; Postgres uses the database collation).
   - **Value types:** mistyped values are rejected. A number bound to a text column would cast to `'5'` in SQL but stay `5 !== '5'` in JS.
   - **NUL characters:** strings containing U+0000 are rejected (Postgres `text` can't store them).
   - **Unloaded data:** a field or relation that is `undefined` on the in-memory record throws `FieldNotLoadedError` rather than reading as NULL. A `null` relation means "no related row" and reads as NULL, the same as SQL.

**Relations:** to-one paths compile to **correlated scalar subqueries**:
- **Missing rows:** a missing or dangling related row reads as NULL, exactly like the in-memory `customer: null`.
- **Why not `EXISTS`:** it would make `customer.region IS NULL` FALSE for a missing customer.
- **Why not `JOIN`:** it would force the fragment to rewrite the caller's FROM clause.
- **Later:** EXISTS stays the right tool for future *to-many* "any related row matches" predicates.

## 6. Limits & risks (honest)

| Area | Status |
|------|--------|
| **Arbitrary-JS escape hatch** (`check: (ctx) => boolean`) | Supported for `can()`. `filterFor()` throws `NotListFilterableError` when such a rule applies, so it can never be silently ignored on list endpoints. The framework should warn at definition time when a `check` rule targets a list action. |
| **Proof scope** | The property tests prove the two paths **agree**. They do not prove a policy is *correct* (both paths would agree on a wrong rule). Semantics are pinned down by the explicit-expectation unit tests and the security tests; real policies need their own tests (the generated cross-tenant and permission suites). |
| **MySQL / SQLite / MSSQL** | **Untested.** MySQL has `<=>` for NULL-safe equality, SQLite has `IS`; `strpos` becomes `INSTR`/`LOCATE`. They need separate renderers and the same property suite per dialect. |
| **Performance** | Not measured. Correlated scalar subqueries are usually planned as joins by Postgres, but deep OR trees with many relation paths can defeat index use. Benchmark with realistic data (Phase 1, k6/EXPLAIN). Consider hoisting repeated relation subqueries into one LATERAL join in the renderer. |
| **To-many relations, nested paths >1 level, JSON paths, date/time types** | Out of scope. Date/time comparisons raise timezone-equivalence questions that need their own property tests. |
| **Decimal/float** | Only `int4` was tested. `numeric` vs JS `number` precision needs a decision (strings or a decimal type in JS). |
| **PGlite vs server Postgres** | PGlite is real Postgres compiled to WASM, but run the suite once against Postgres 16/17/18 in CI (Testcontainers) before relying on it. |

## 7. Recommendation for `@strutvane/auth` / `@strutvane/contracts`

- **Adopt the AST** (`src/ast.ts`) as the `QueryFilter` contract in `@strutvane/contracts`. Write its two-valued semantics table into the contract's TSDoc as **normative**.
- **Adopt the pipeline:** build → bind (with the null-actor rule) → validate (shared gate) → evaluate | compile. Keep `validate` the single choke point.
- **Ship the property suite as a permanent test** of the auth package, run against every supported dialect, plus the two mutation checks as regression tests.
- **Expose only the typed builder** to app developers. Accept JSON `QueryFilter`s from UIs only through `validate`.

## 8. Suggested ADR

> **ADR-00XX: Authorization predicates compile from one AST with two-valued, null-safe semantics**
>
> **Context:** Policies must check single records in memory and filter list queries in SQL with identical results. SQL's three-valued logic, `LIKE` wildcards, collation-dependent ordering and implicit casts break naive equivalence. A null-safe `eq` also creates a privilege-escalation risk when actor attributes are null.
>
> **Decision:**
> - Policies compile to a portable `QueryFilter` AST with normative two-valued, null-safe semantics.
> - Every input passes a single bind+validate gate before in-memory evaluation or SQL compilation.
> - The SQL compiler emits NULL-safe, never-NULL leaves (`IS [NOT] DISTINCT FROM`, `COALESCE(...)`, `strpos`).
> - To-one relations compile to scalar subqueries.
> - Null actor values never match. Missing actor attributes throw.
> - Ordering is restricted to numeric (later: temporal) fields.
> - Equivalence is enforced by a permanent property-based test suite per SQL dialect.
>
> **Consequences:**
> - (+) Proven-equivalent `can()` / `filterFor()`; injection-safe; composable with any query builder.
> - (−) Semantics differ from hand-written SQL (`ne` includes NULLs), so they must be documented. One renderer and one property run per dialect. The escape hatch is not list-filterable.

## 9. Run it

```bash
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 typecheck                    # includes compile-time guarantees
corepack pnpm@12.18.0 test                         # 70 tests, 300 property runs each
PROPERTY_RUNS=1000 corepack pnpm@12.18.0 test      # evidence run
```

**Layout:**

| Path | Contents |
|------|----------|
| `src/ast.ts` | AST and semantics |
| `src/builder.ts` | typed builder |
| `src/bind.ts` | binding and validation gate |
| `src/evaluate.ts` | in-memory path |
| `src/sql.ts` | SQL path |
| `src/kysely.ts` | Kysely adapter |
| `src/policy.ts` | `definePolicy` |
| `test/` | one file per concern, as listed in §3 |
