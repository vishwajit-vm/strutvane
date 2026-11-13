# Spike 05: one model → validation + OpenAPI 3.1 + typed client

**Date:** 2026-11-13 · **Stack:** Node 24, TypeScript 6.0.3, Zod 4.6.7, Hono 4.13.18, @hono/zod-openapi 1.6.3, openapi-typescript 7.13.0, openapi-fetch 0.17.0, Vitest 5.1.0

## Question

Can one model definition, validated by Zod 4, produce all of the following?

- **(a)** Runtime request validation in a Hono app.
- **(b)** A correct OpenAPI 3.1 document. It must include Strutvane's extensions (`x-strutvane-resource`, and `x-strutvane-field` with label, filter operators and widget). Error responses must be RFC 9457 problem+json with RFC-0003 structured `issues`. The document must be served at `/openapi.json`, with Scalar docs at `/docs`.
- **(c)** A fully typed client SDK whose types match the server exactly, so that changing a server field breaks client compilation. List endpoints must support the ListQuery protocol (`filter[field][op]`, `sort`, `page[size]` / `page[cursor]`) with typed parameters.

## Answer

**Yes**, with three deliberate design choices:

1. **List queries need a custom serializer.** `filter[field][op]` can't be expressed by any OpenAPI parameter style: `deepObject` is defined for one nesting level only. The list protocol is therefore *documented* in client terms, which gives typed params, and *serialized and parsed* by one shared Strutvane module, so the two sides can't drift.
2. **Client = generated types + small runtime package.** The client is openapi-typescript (types only) plus openapi-fetch (a 4.3 kB runtime dependency). hey-api's generated runtime doesn't compile under Strutvane's strict tsconfig, and Hono RPC can't see generically registered routes.
3. **Models use Zod's native `.meta()`.** Extensions and component names come from Zod itself, so models don't depend on any OpenAPI library.

## Evidence

```
 Test Files  5 passed (5)
      Tests  51 passed (51)
Type Errors  no errors
```

The suite ran 3 times in a row: 3/3 green. `node scripts/generate-client.ts --check` reports "up to date".

| Proven | Test |
|---|---|
| The spec is **valid OpenAPI 3.1** against the official schema (`@readme/openapi-parser`: `valid: true`, 0 warnings) | `spec.test.ts` |
| Every model is a named component, with `x-strutvane-resource` and `x-strutvane-field` (label, operators, sortable, widget) on read *and* write schemas | `spec.test.ts` |
| Validation rules survive in the spec: enums, ranges, formats, `["string","null"]`, required fields, `additionalProperties: false` on inputs | `spec.test.ts` |
| **Every one of 20+ error responses** is `application/problem+json` → `#/components/schemas/Problem` | `spec.test.ts` |
| List params are documented and typed per field and operator: `filter.status.in: ('draft'\|'sent'\|'paid'\|'void')[]`, `between: [number, number]`, `sort` limited to sortable fields | `spec.test.ts`, `client.test-d.ts` |
| `/docs` serves Scalar, pointing at `/openapi.json` | `spec.test.ts` |
| **Determinism:** two renders are byte-identical, and the committed spec and types match the current models (drift detection) | `spec.test.ts` |
| A full CRUD round trip through the **generated typed client** against the in-process app | `api.test.ts` |
| A 422 lists **every** issue at once, each with `path`, a stable `code`, `params` and a message rendered from the field label (e.g. `{ path: ['amount'], code: 'too_small', params: { min: 0 }, message: 'Amount must be at least 0.' }`). `fieldErrors` is derived from them. | `api.test.ts` |
| Malformed JSON gives a 400 problem. An unknown route gives a 404 problem. A crash gives a 500 with only a `traceId`: the secret in the error never reaches the client, and the injected logger receives the details. | `api.test.ts` |
| List filtering (`in`, ranges, `between`, two-valued `ne`, `startsWith`, `isNull`), sorting, and cursor paging that visits every row exactly once | `api.test.ts` |
| Every invalid list parameter is reported at once (7 codes): unknown field, operator not allowed, bad value, bad sort, page size out of range, bad cursor, unknown parameter. Nothing is silently ignored. | `api.test.ts`, `list-query.test.ts` |
| Serialize → parse round trips. Values containing `, & % " Ünïcødé 東京` survive intact. Order is deterministic. Cursors fed garbage never throw. | `list-query.test.ts` |
| **Client type = server type.** The generated `Invoice` and `z.output<Invoice>` describe the same wire shape, with the same required keys | `client.test-d.ts` |
| Misuse fails to compile: non-filterable field, wrong operator, wrong enum value, wrong tuple length, non-sortable field, string page size, unknown path, wrong body type | `client.test-d.ts` |
| **Renaming `Invoice.amount` to `total` on the server breaks a consumer at compile time**, checked with the real `tsc` (and the baseline compiles cleanly) | `drift.test.ts` |

## Approach comparison

### Spec generation

| Option | Verdict | Why |
|---|---|---|
| **`@hono/zod-openapi` 1.6.3** | ✅ **chosen** | Generates OpenAPI 3.1 straight from route definitions plus Zod. Validation is built into the same routes. Copies Zod `.meta()` (`id` → `$ref` component, `x-*` → extensions) verbatim (verified). Per-route validation hooks let us emit problem+json. |
| `z.toJSONSchema` + hand-built paths | Viable, more code | Correct JSON Schema 2020-12, but we would hand-write every path, parameter and response. We use it only to render the list-protocol parameter schemas. |
| `hono-openapi` 1.5.0 | Not chosen | A validator-agnostic middleware approach. It would work, but adds an abstraction layer we don't need, since the Standard Schema contract already covers validator neutrality. *(Not benchmarked; evaluated on design.)* |

### Typed client

| Option | Type fidelity | Strict tsconfig | Runtime | Determinism | Verdict |
|---|---|---|---|---|---|
| **openapi-typescript 7.13 + openapi-fetch 0.17** | ✅ exact. Filters are typed per field and operator. | ✅ **compiles clean** (types only) | npm dep, **4.3 kB gzip** | ✅ (`alphabetize`) | ✅ **chosen** |
| @hey-api/openapi-ts 0.99 | ✅ good types | ❌ **5 errors** in its generated runtime under `exactOptionalPropertyTypes` | Generated into the repo | ✅ | ❌ The generated SDK also passes its own per-operation `querySerializer`, which overrides any client-level one, and its `deepObject` serializer only handles one level (`filter[status]=[object Object]`). |
| Hono RPC (`hc`) inference | Perfect for statically chained routes… | ✅ | Tiny | n/a (no codegen) | ❌ **Sees zero routes** when routes are registered in a loop, which is exactly how Strutvane's resource engine works (verified with a type probe). It also can't serve UI-only mode against external APIs. |

## Design

```
models.ts ── defineResource(meta, { field(z…, { label, filterOperators, sortable, widget }) })
   │            derives: read / create (strict) / update (strict partial) / list schemas,
   │            filterable + sortable + searchable allow-lists, field labels
   ▼
crud.ts ──── registerCrud(app, resource, store)   ← generic: every resource gets 5 endpoints
   │            validation hook → 422 problem (issues mapped by problem.ts + messages.ts)
   │            list: parseListQuery (list-query.ts) → 422 problem or ListQuery → store
   ▼
spec.ts ──── app.getOpenAPI31Document() + per-list-operation parameters from listParamsSchema()
   ▼  GET /openapi.json   GET /docs (Scalar)
scripts/generate-client.ts ── openapi.json + src/client.gen/schema.d.ts (types only)  [--check for CI]
   ▼
client.ts ── openapi-fetch<paths> + querySerializer = serializeListParams (same module as the parser)
```

**Module responsibilities.** Each file has one job; all are reusable across resources.

| File | Job |
|---|---|
| `contracts.ts` | Mirror of `@strutvane/contracts` v0 + RFC-0003 `ValidationIssue` |
| `field.ts` | `field()` / `readFieldMeta()`: Strutvane metadata via Zod `.meta()` |
| `resource.ts` | `defineResource()`: everything derived from one model |
| `list-query.ts` | Wire protocol: `serializeListParams` (client) ⇄ `parseListQuery` (server), cursors, OpenAPI parameter docs |
| `messages.ts` | Message catalog (`{attribute}`, `{param}`) |
| `problem.ts` | Zod issues → RFC-0003 issues; problem bodies; the `Problem` and `ValidationIssue` schemas |
| `crud.ts` | Generic CRUD registration with documented error responses |
| `store.ts` | In-memory store (two-valued filter semantics, stable sort, pagination). Spike-only. |
| `app.ts` / `spec.ts` | App assembly, `/openapi.json`, `/docs`, error handlers / document builder |
| `client.ts` | The typed client |

## Findings

1. **OpenAPI can't express two-level query objects.** `deepObject` is defined for one level, so `filter[field][op]` has no standard serialization. Generic generators either mangle it (hey-api emits `[object Object]`) or can't type it.
   - **Fix:**
     - document the params in client terms (nested objects, so the client is typed)
     - mark them `x-strutvane-serialization: strutvane-list-query`
     - serialize and parse with **one shared module**
     - use repeated keys for arrays, so values containing commas are safe
   - **Corollary:** list endpoints must *not* use Hono's generic query validator. It sees the flat wire keys and fails with a bare 400 that isn't problem+json.
2. **Generated runtime code is a liability under a strict tsconfig.**
   - hey-api's runtime fails `exactOptionalPropertyTypes`, and its SDK overrides client-level serializers.
   - Generating *types only* (openapi-typescript) and taking the runtime as a normal dependency (openapi-fetch) keeps the strictest settings with no exclusions or `@ts-nocheck`.
3. **Hono RPC can't be the framework's client.** Type inference requires statically chained routes. A registry-driven resource engine registers routes in loops, and `hc` then sees none.
4. **Zod 4 `.meta()` is enough for everything.** `id` becomes a named component, and any `x-*` key becomes an OpenAPI extension, in both `@hono/zod-openapi` and `z.toJSONSchema`. Models stay library-agnostic.
5. **Optional keys differ under `exactOptionalPropertyTypes`.** Zod types optional keys as `k?: T | undefined`; generators emit `k?: T`. These are identical on the wire, so the fidelity test compares the *wire shape* (value types + required keys) rather than declaring them the same type outright.
6. **Zod issues carry enough detail for RFC-0003.** `minimum`, `maximum`, `values`, `format`, `keys` and `origin` map cleanly to stable codes (`required`, `too_small`/`too_short`, `invalid_value`, `invalid_format`, `unknown_field`, …) with params.
7. **The Scalar docs page loads `@scalar/api-reference` from jsDelivr, unpinned.** That means supply-chain risk, CSP breakage and no offline or air-gapped use. The framework must serve a **pinned, self-hosted** bundle, or offer the docs UI only in development, configurable per environment.
8. **Generic handlers need casts.** `@hono/zod-openapi` types each route's responses individually, so a generic handler can't name each route's union. The spike contains this with `as never` in one file (`crud.ts`). The framework should provide one typed response helper so no app code ever needs a cast.

## Limits and risks (not verified here)

- **Library maintenance:** openapi-typescript is slowing (last release 2026-06) and declares peer `typescript ^5`; it works with 6.0.3 but warns. **Mitigation:** keep it behind a `ClientGenerator` interface. hey-api's types-only output is the fallback.
- **Not implemented here:** ICU formatting, locales and message overrides; `include` / `fields` sparse fieldsets; auth; tenancy; real database; OpenAPI for 405/429/503; large-spec generation performance.
- **Dates** are compared as ISO-8601 strings (correct for `YYYY-MM-DD`). Temporal semantics need their own tests (see spike 02).
- **OpenAPI 3.1 type arrays** (`["string","null"]`) aren't understood by some older 3.0-only tools. 3.0 export is a possible option if users need it.
- **Untested:** browser bundle size beyond the raw gzip of the runtime files, and Bun/Deno.

## Recommendations

**For `@strutvane/framework/openapi`:**
- Build on `@hono/zod-openapi` 1.6.x, driven by the resource engine (`registerCrud`-style), with Zod `.meta()` as the only metadata channel.
- Own the list protocol in one module (parse, serialize, document) and never route list queries through generic validators.
- Ship `sv api:spec` / `sv api:client` with a `--check` mode for CI drift detection, and commit the generated spec.
- Self-host a pinned Scalar bundle. `/docs` is on in development and configurable in production.
- Provide a typed response helper so app code never needs casts.

**For the `@strutvane/ui` client and SDK export:**
- openapi-typescript (types) + openapi-fetch (runtime) + Strutvane's `serializeListParams` wired in as `querySerializer`.
- Run the "wire shape equals server type" and "rename breaks compile" tests permanently in the framework repo.

## Suggested ADR

> **ADR-00XX: OpenAPI from Zod via @hono/zod-openapi; typed clients via openapi-typescript + openapi-fetch; Strutvane-owned list-query serialization**
>
> **Context:**
> - One model must drive runtime validation, an OpenAPI 3.1 document with Strutvane extensions and problem+json errors, and a typed client that breaks on server changes.
> - OpenAPI can't express two-level query objects.
> - hey-api's generated runtime fails our strict tsconfig.
> - Hono RPC can't see loop-registered routes.
>
> **Decision:**
> - Models attach metadata via Zod `.meta()`.
> - Routes are generated per resource with `@hono/zod-openapi`, and validation failures become RFC-0003 problems.
> - The list protocol is documented in client terms (`x-strutvane-serialization`) and serialized and parsed by one shared module.
> - Clients are openapi-typescript types + openapi-fetch.
> - The generated spec and types are committed and drift-checked in CI.
> - The docs UI is self-hosted and pinned.
>
> **Consequences:**
> - (+) End-to-end type safety, the strict tsconfig kept, a 4.3 kB client runtime, and deterministic generation.
> - (−) A custom serializer that non-Strutvane OpenAPI clients must implement, documented via the extension.
> - (−) A dependency on openapi-typescript's maintenance, with hey-api types-only as the fallback.

## Run it

```bash
cd spikes/05-openapi-client
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 test                  # 51 tests + type-level tests
node scripts/generate-client.ts             # regenerate openapi.json + src/client.gen/schema.d.ts
node scripts/generate-client.ts --check     # CI drift check
```
