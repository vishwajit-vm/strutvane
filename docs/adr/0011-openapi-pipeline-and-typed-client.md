# ADR-0011: OpenAPI from Zod via @hono/zod-openapi; typed clients via openapi-typescript + openapi-fetch; Strutvane-owned list-query serialization

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [Spike 05 report](../../spikes/05-openapi-client/README.md), [RFC-0003](../rfcs/0003-errors-and-messages.md), [06 Framework](../06-package-framework.md)

## Context

One model must drive three things:
- runtime validation
- an OpenAPI 3.1 document with Strutvane's extensions and problem+json errors
- a typed client that fails to compile when the server changes

Spike 05 found three obstacles:
1. **OpenAPI can't express the list query format.** Its `deepObject` style is only one level deep, so `filter[field][op]` doesn't fit, and hey-api sends `filter[status]=[object Object]`.
2. **hey-api 0.99's generated runtime fails our strict tsconfig** (5 errors), and it overrides the client's query serializer.
3. **Hono RPC sees no routes registered in a loop,** which is how the resource engine registers them, and it can't serve UI-only mode against an external API.

A fourth finding: Scalar's `/docs` page loads unpinned code from a CDN.

## Decision

- **Model metadata** is attached with Zod's own `.meta()`, so models don't depend on an OpenAPI library.
- **Routes are generated per resource** with `@hono/zod-openapi`. Validation failures become RFC-0003 problems with `issues`.
- **The list protocol is ours.**
  - It is documented as nested objects marked `x-strutvane-serialization`, so clients still get typed filters.
  - One shared module both serializes it (client) and parses it (server). Arrays use repeated keys.
  - List endpoints don't use Hono's built-in query validator, which would reject valid filters with a plain 400 instead of problem+json.
- **Clients** use openapi-typescript (types only) plus openapi-fetch (a 4.3 kB runtime), behind an interface. hey-api's types-only output is the fallback.
- **Drift check.** The generated spec and client types are committed, and CI checks them for drift.
- **The docs UI is self-hosted and version-pinned,** with no CDN, and `/docs` can be configured per environment.
- **A typed response helper** keeps app code free of casts (the spike needed `as never` in one file).

## Consequences

- **Positive:**
  - end-to-end type safety under the strict tsconfig
  - a small client runtime
  - deterministic generation
  - a server field rename breaks client compilation, as intended
- **Costs:**
  - Non-Strutvane OpenAPI clients must implement the documented serializer.
  - We depend on openapi-typescript's maintenance pace (last release June 2026).
- **Follow-ups:** the self-hosted docs bundle, and the response helper.
