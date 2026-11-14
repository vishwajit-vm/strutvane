# ADR-0019: The framework serves its own script-free API docs page at `/docs`

- **Status:** Accepted under standing approval (refines the docs-UI point of [ADR-0011](0011-openapi-pipeline-and-typed-client.md); supersedes the "API reference UI" row of [11](../11-technology-decisions.md))
- **Date:** 2026-11-14
- **Deciders:** project lead (standing approval), framework maintainers
- **Related:** [06 §5.5](../06-package-framework.md#55-api-documentation-openapijson-and-docs), [12 §3.2, §8](../12-security-model.md), [05 §1](../05-developer-experience.md#1-the-journey-target-timings), `@strutvane/framework` `src/http/docs-page.ts` (commit `e2e8f26`)

## Context

[05 §1](../05-developer-experience.md#1-the-journey-target-timings) promises readable API docs at `/docs`. [11](../11-technology-decisions.md) recorded **Scalar** (`@scalar/api-reference`) as the API reference UI. [ADR-0011](0011-openapi-pipeline-and-typed-client.md) found that Scalar's hosted page loads unpinned code from a CDN, and decided that the docs UI must be self-hosted and version-pinned.

`/docs` is served on the API's own origin, next to session cookies and the auth endpoints. Any client-side docs renderer brings costs there:

- a renderer loaded from a CDN needs a page CSP that allows third-party scripts on that origin;
- a self-hosted bundle is a large, fast-moving dependency of the framework that must be pinned, updated and audited;
- an inline renderer needs `'unsafe-inline'` scripts.

The OpenAPI document also contains text that comes from app code (model names, descriptions, enum values). Whatever renders it must treat that text as data.

## Decision

The framework renders the docs page itself, on the server, with **no script at all** (`src/http/docs-page.ts`). Scalar is not used.

- **Content:** `GET /docs` renders the same OpenAPI document as `GET /openapi.json` (resources and custom routes) as HTML, and links to `/openapi.json` for tools such as Postman or a generated client.
- **No third-party code:** no JavaScript, no external fonts, styles or images. The framework gains no dependency.
- **Strict CSP:** `default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`. Only inline styles are allowed.
- **Escaping:** every value taken from the document is HTML-escaped (`&`, `<`, `>`, `"`, `'`) before it is written into the page.
- **No caching:** responses carry `Cache-Control: no-store`, because the page can be restricted to identified callers.
- **Same visibility as `/openapi.json`:** one rule for both (the `openapi` option, from `config/api.ts` `docs` / `API_DOCS`): public when `APP_ENV=local`, identified callers only elsewhere (anonymous requests get 401), not served at all with `API_DOCS=false`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|--------|------|------|---------|
| Scalar from a CDN | Rich, interactive UI; no build work | Third-party scripts on the API origin; unpinned code ([ADR-0011](0011-openapi-pipeline-and-typed-client.md)) | Breaks the strict CSP and the pinning rule |
| Scalar or Swagger UI self-hosted and pinned | Interactive "try it" console | Large, fast-moving dependency in the framework; the page needs script in its CSP | Cost and attack surface out of proportion to a reference page |
| Redoc (static bundle) | Good reading experience | Still a client-side script bundle to pin and audit | Same trade-off as above |
| No `/docs` page, only `/openapi.json` | Nothing to maintain | Breaks the [05 §1](../05-developer-experience.md#1-the-journey-target-timings) promise; developers need a tool to read the API | The journey needs a page out of the box |

## Consequences

- **Positive:**
  - `/docs` works with no network access and adds no dependency.
  - The page can run no script, so text from the document cannot execute in the API's origin, and it is covered by the same visibility rule as the document it shows.
- **Negative / costs we accept:**
  - No interactive "try it" console and no client-side search. Developers who want them load `/openapi.json` into a tool of their choice.
  - The framework owns the page's HTML and its tests.
- **Follow-ups:**
  - An opt-in interactive viewer can be added later as a separate, self-hosted and pinned page, without loosening the CSP of `/docs`. That would need its own decision.
  - [11](../11-technology-decisions.md) points its "API reference UI" row to this ADR.
