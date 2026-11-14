# RFC-0001: Contracts v0

- **Status:** Accepted, with a draft implementation in [strutvane-contracts](https://github.com/vishwajit-vm/strutvane-contracts)
- **Created:** 2026-11-13
- **Affects:** `@strutvane/contracts`, and through it `core`, `framework`, `auth`, `ui` and `devkit`

## Summary

Define the first version of the shared contracts that let Strutvane packages cooperate without importing each other. The contracts are types plus a few frozen constants (operator lists, limits, hook names), with zero runtime dependencies.

## Motivation

[ADR-0002](../adr/0002-one-repository-per-package.md) and [04 §1](../04-architecture.md#1-layers) require that product packages never import each other. They still need to agree on:
- who the actor is
- which tenant applies
- whether an action is allowed
- which rows a query may see
- how errors and resource metadata look

A single small, stable, dependency-free package is the cheapest way to get that agreement.

## Design

| Contract | Decision | Why |
|---|---|---|
| `Actor` | `id`, `type` (`user` / `service` / `system`), optional `tenantId`, readonly `roles`, optional pre-resolved `permissions`, `attrs` | Enough for RBAC and ABAC. Collections are readonly so no package can mutate the current actor. |
| `Permission` | Template literal `` `${string}.${string}` `` or `'*'` | Catches typos such as `'approve'` at compile time |
| `QueryFilter` | Discriminated union on `op`: `and`/`or`/`not`, comparisons, `in`/`nin`, `isNull`/`isNotNull`, text operators, `between`, and constants `true`/`false` | Exhaustive `switch` on `op` in every evaluator. `{ op: 'false' }` expresses deny-by-default. |
| Semantics | **Two-valued, NULL-safe** (revised 2026-11-13 after spike 02). Every operator yields true or false, and `not` is plain negation. `ne`/`nin` are exact negations of `eq`/`in`, so they match null fields. Ordering operators are false on null and numeric-only. Text operators match literally. `null` is forbidden as a comparison value (use `isNull`). | The in-memory `can()` check and the SQL list filter must return identical results. Spike 02 proved this design with 43,930 property-based comparisons and 0 mismatches. The first draft (SQL three-valued logic) let deny rules silently skip rows with null fields. |
| `ActorRef` | `{ $actor: 'id' \| 'tenantId' \| 'attrs.*' }`. **Security rule:** a null actor value never matches (`eq` → false, `ne` → true, dropped from `in`/`nin`). A missing (`undefined`) actor attribute throws. **Allow rules** bind fail-closed instead: a condition part that depends on a null actor value never widens the rule, whatever its polarity (`ne`, `nin`, `not`) ([ADR-0017](../adr/0017-allow-rules-bind-fail-closed-on-null-actor-values.md)). | One policy works for every user. The rule prevents "same region as me" from granting every row without a region to an actor without a region, and an unknown actor value can never make an allow rule grant more. |
| `ListQuery` | filter, search, sort, `page` (cursor \| offset), include, fields. `LIST_QUERY_LIMITS` is frozen (25 / 100). | Cursor pagination by default for stability and performance |
| `PermissionProvider` | `can()` → `Decision { allowed, reason }`; `filterFor()` → `QueryFilter` | Deny-by-default and deny-wins are documented requirements. `reason` feeds the audit log. |
| `Problem` | RFC 9457 + `code`, `traceId`, `fieldErrors` + extension members | One error shape for every client |
| `ResourceManifest` | `manifestVersion: 1`, resources with fields, actions and per-actor `capabilities`, served at `/.well-known/strutvane.json` | The UI builds screens from it. Per-actor capabilities hide what the API would refuse. |
| `AuditEvent` / `DomainEvent` | Minimal `ActorStamp`, redacted `FieldChange`s, `idempotencyKey` | Audit is written in the same transaction as the change. Events are delivered at-least-once. |
| HTTP hook protocol | **Draft (v0).** `HTTP_HOOKS` names the hooks the HTTP layer runs for every request: `http.onRequest` and `http.onResponse`. `HttpRequestHookPayload`: `request`, `actor`, `tenant`, optional `clientAddress`, `headers` and `response`. `HttpResponseHookPayload`: `request`, `status`, `requestId`, optional `route`. **`clientAddress`** is the directly connected peer (socket remote address) when the server knows it, never a request header; controls keyed by client address (per-IP rate limits, IP allow-lists) use it and fail closed when it is unknown. **`route`** is the matched route template (`/api/v1/invoices/:id`) when the router knows it; request loggers prefer it to the raw path. A handler that answers by setting `response` skips routing and the framework body limit, so it caps request bodies itself. `http.onResponse` is observe-only. | The framework and the packages that hook it (auth, logs) compile against one definition, so a field added on one side cannot silently go missing on the other ([integration map §4](../17-integration-map.md#4-hooks-where-packages-plug-into-each-others-pipelines)). |
| `FieldType`, `Installer` | **Draft** | Will be refined after spike 01 (migration engine) and the first real installer |
| `StandardSchemaV1` | Copied (flattened) from the spec | Any validator works without a dependency. A test proves Zod 4 satisfies it. |

### Example

```ts
const mine: QueryFilter = {
  op: 'and',
  filters: [
    { op: 'eq', field: 'ownerId', value: { $actor: 'id' } },
    { op: 'not', filter: { op: 'in', field: 'status', values: ['void'] } },
  ],
}
```

## Quality bar (met by the draft implementation)

- **Strict typing:** strictest TypeScript, including `exactOptionalPropertyTypes` and `isolatedDeclarations`.
- **Type-level tests** prove that misuse fails to compile, e.g. `null` comparison values, unknown operators, and permissions without a dot.
- **Exhaustiveness tests** keep runtime constant lists in sync with their union types.
- **Packaging:** publint clean, consumer import smoke test passes, 100% coverage of runtime code.

## Compatibility & migration

- `0.x`: breaking changes are allowed, but each needs a changeset and an RFC update.
- From `1.0`: strict semver, at most one major per year. The previous major gets 12 months of support.

## Alternatives considered

- **Key-discriminated filters** (`{ eq: [field, value] }`): rejected. They are harder to narrow and validate, and harder to extend with options such as `caseSensitive`.
- **Depending on `@standard-schema/spec`:** rejected. Copying the interface is what the spec recommends, and it keeps zero dependencies.
- **Putting the predicate builder in contracts:** rejected for v0. The builder is runtime code and belongs in `auth`. Contracts only define the AST.

## Open questions

1. Should `QueryFilter` support `exists` over to-many relations (e.g. "invoices with any overdue line")? Revisit with spike 02's results.
2. Should the `ResourceManifest` carry a content hash, so the UI can cache it?
3. Does `FieldType.column` describe enough for MySQL check constraints and Postgres native enums? Revisit with spike 01.
