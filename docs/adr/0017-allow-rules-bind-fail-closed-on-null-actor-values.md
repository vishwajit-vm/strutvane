# ADR-0017: Allow rules bind fail-closed when a referenced actor value is null

- **Status:** Accepted under standing approval (refines [ADR-0008](0008-policy-predicates-two-valued-semantics.md))
- **Date:** 2026-11-14
- **Deciders:** project lead (standing approval, GOVERNANCE.md)
- **Related:** [ADR-0008](0008-policy-predicates-two-valued-semantics.md), [RFC-0001](../rfcs/0001-contracts-v0.md), [07 Auth §4.2](../07-package-auth.md#42-policies-generated-per-model-owned-by-you), [12 Security](../12-security-model.md)

## Context

[ADR-0008](0008-policy-predicates-two-valued-semantics.md) makes the bind step replace every actor reference (`{ $actor: … }`) with the actor's value before either execution path runs. For a null actor value it gives one rule: **a null actor value never matches**. `eq(field, <null>)` binds to `false`, and `ne(field, <null>)` binds to `true`, so that `ne` stays the exact negation of `eq`. Null values are dropped from `in`/`nin` lists, and ordering, `between` and text operators with a null operand bind to `false`.

That rule keeps the two-valued algebra consistent, and it is the right reading for deny rules: a deny whose condition cannot be evaluated simply does not apply, and the deny-wins model is unchanged.

For allow rules the same rule can widen access. An allow condition that uses `ne`, `nin`, or a positive operator under `not` turns into `true` when the actor value is null. For example, "allow when `region` is not the actor's excluded region" would then admit every row for an actor whose excluded region is unset. Policy authors reasonably expect "unknown actor value" to grant less, not more.

## Decision

Bind **allow rules fail-closed** and keep ADR-0008's rule for deny rules.

- **Allow rules.** A condition part (filter leaf) that depends on a null actor value binds to the constant that makes the enclosing allow rule match **fewer** rows, given the leaf's polarity:
  - `false` where the leaf counts positively;
  - `true` under an odd number of enclosing `not`s.

  This applies to every operator that takes an actor operand: `eq`, `ne`, ordering, `between`, `in`, `nin`. For `in` (positive) and `nin` (under an odd number of `not`s), dropping the null values already only narrows the result, so they are dropped as before. In every other polarity the leaf binds to the narrowing constant.
- **Deny rules** keep ADR-0008 unchanged: a null actor value never matches (`eq` → `false`, `ne` → `true`, nulls dropped from `in`/`nin`, ordering → `false`).
- **Unchanged from ADR-0008:** a missing actor attribute still throws; anonymous actors resolve every reference to null; binding happens once, before both the in-memory and the SQL path, so the two paths still see the same literal tree and stay equivalent.
- `definePolicy` selects the mode per rule (allow → fail-closed, deny → plain). The bind function exposes it as an option (`failClosed`) for other callers.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Keep ADR-0008's single rule for all rules | One rule, simplest to explain | An allow rule using `ne`/`nin`/`not` grants more when an actor value is null | Fails open for allow rules |
| Throw when any referenced actor value is null | Very explicit | Null is a legitimate, declared value (ADR-0008 allows `null` attributes); many valid policies would error at request time | Turns ordinary data into 500s |
| Forbid `ne`/`nin`/`not` over actor references in allow rules | Removes the case entirely | Rejects useful, correct policies; still needs a rule for `not(eq(…))` combinations | Too restrictive, and incomplete |
| **Polarity-aware fail-closed binding for allow rules only** (chosen) | Allow rules never widen on unknown values; deny semantics and SQL/in-memory equivalence untouched | Binding depends on rule effect and polarity, so the bind step is slightly more complex | Accepted |

## Consequences

- **Positive:** an allow rule can never grant more because an actor value is unknown, whatever operators it uses. Deny rules, deny-wins and the property-tested equivalence between in-memory evaluation and SQL are unaffected, because binding still happens once before both paths.
- **Negative / costs we accept:**
  - For allow rules, `ne(field, <null actor value>)` is no longer the exact negation of `eq(field, <null actor value>)`: both match nothing. The docs must say so with an example.
  - The bind step tracks polarity (count of enclosing `not`s).
- **Follow-ups:**
  - Keep regression tests for every operator × polarity × effect combination in `@strutvane/auth`.
  - RFC-0001's `ActorRef` row points here for allow rules.
