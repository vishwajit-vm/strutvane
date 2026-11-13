# Strutvane — Technical Blueprint

> **Status:** Planning and research phase. No implementation code yet.
> **Last updated:** 2026-11-13.
> **Brand:** **Strutvane** (`@strutvane` on npm). Pending legal clearance; see [03](03-naming-and-brand.md).

This folder is the blueprint for **Strutvane**, a TypeScript framework and package ecosystem for enterprise B2B applications.

**The promise:** declare models as field names and types, run one command, and get migrations, a secured and documented CRUD API, auth/RBAC/tenancy, and a complete UI. All of it stays owned, overridable TypeScript.

## Start here

1. [00 — Executive summary & canonical decisions](00-executive-summary.md). **The source of truth.**
2. [05 — Developer experience](05-developer-experience.md): the 1–2 hour journey, the model DSL, the generated project, `.env.example`.
3. [04 — Architecture](04-architecture.md): kernel, registry, levels of control, installer protocol.

## All documents

| # | Document | Answers |
|---|----------|---------|
| 00 | [Executive summary & decisions](00-executive-summary.md) | What, why, and decisions D1–D20 |
| 01 | [Vision, principles & challenged assumptions](01-vision-principles-assumptions.md) | Who it's for, principles, where we pushed back on the brief |
| 02 | [Competitive analysis](02-competitive-analysis.md) | Laravel, NestJS, AdonisJS, Payload, Amplication, Prisma, Refine, React Admin, Directus, Strapi, Redwood + 8 more |
| 03 | [Naming & brand](03-naming-and-brand.md) | Why "Strutvane", with npm/GitHub/domain evidence and legal next steps |
| 04 | [Architecture](04-architecture.md) | Layers, kernel, typed registry, L0–L3 control, request lifecycle, contracts, installers |
| 05 | [Developer experience](05-developer-experience.md) | `npm create strutvane`, models, auto CRUD/UI, customisation, daily commands |
| 06 | [Package: `@strutvane/framework`](06-package-framework.md) | Backend & database: models, migrations, resource engine, providers |
| 07 | [Package: `@strutvane/auth`](07-package-auth.md) | Identity adapters, RBAC/ABAC, tenancy, audit, `sv add auth` |
| 08 | [Package: `@strutvane/ui`](08-package-ui.md) | Metadata-driven UI, widgets, theming, overrides, UI-only mode |
| 09 | [CLI reference](09-cli-reference.md) | Every `strutvane` / `pnpm sv` command |
| 10 | [Repositories, publishing & versioning](10-repositories-publishing-versioning.md) | One repo per package, local umbrella workspace, npm trusted publishing, release trains |
| 11 | [Technology decisions](11-technology-decisions.md) | Chosen libraries, alternatives, risks, exit strategies |
| 12 | [Security model](12-security-model.md) | Threat model, ASVS/API Top 10 mapping, supply chain |
| 13 | [Testing strategy](13-testing-strategy.md) | DB matrix, generator e2e, tenancy/permission suites, performance |
| 14 | [Roadmap](14-roadmap.md) | Phases 0–6 with exit gates |
| 15 | [Risks & trade-offs](15-risks-and-tradeoffs.md) | Risk register, decided trade-offs, open questions |
| 16 | [Docs & ecosystem strategy](16-docs-and-ecosystem-strategy.md) | Public docs structure, governance, sustainability, future packages |

**Supporting material:**

- [`adr/`](adr/): Architecture Decision Records. One decision per file; immutable once accepted.
- [`research/`](research/): dated raw evidence ([naming checks](research/naming-checks-2026-11-13.md), [stack snapshot](research/stack-snapshot-2026-11.md)).

## Conventions

- **MUST / SHOULD / MAY** follow RFC 2119.
- Third-party facts are dated **2026-11-13**. *(unverified)* marks claims without a primary source.
- Re-verify library versions before Phase 1 starts.
