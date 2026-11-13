# 15 — Risks & Trade-offs

## 1. Risk register

Likelihood (L) and impact (I) are rated High / Medium / Low.

| # | Risk | L | I | Mitigation | Owner |
|---|------|---|---|------------|-------|
| R1 | **Scope explosion.** Three products plus a framework plus enterprise features is enormous. | H | H | Phase gates. Tier 2/3 databases and enterprise features deferred to Phase 4. A "not now" list in every RFC. | Lead |
| R2 | **Auth security failure** (account takeover, cross-tenant leak) | M | H | Adopt Better Auth for identity. Native code limited to authorization/tenancy/audit. RLS defence in depth. Generated cross-tenant tests. Mutation testing. External audit before 1.0. | Auth lead |
| R3 | **Magic vs. control backlash.** Too magic for seniors, too complex for juniors. | M | H | Levels of control (L0–L3). Every magic behaviour is visible in `sv routes`, `sv models` and `sv permissions`, and the registry is a readable generated file. | DX lead |
| R4 | **Upstream churn:** Drizzle v1 still RC; Prisma 8 rewrite; TypeScript 7 (Go) has no compiler API; many 2026 majors (pnpm 12, Vitest 5, React Router 8, TanStack Table 9) | H | M | Internal adapters around Drizzle. Pin `@typescript/typescript6` for ts-morph/codegen. Version catalogs in `tooling`. Renovate. Upgrade codemods. | Platform |
| R5 | **Better Auth governance change** (acquired by Vercel, July 2026) | M | M | Identity adapter interface. OIDC adapter. Optional native engine on primitives. Contracts don't leak Better Auth types. | Auth lead |
| R6 | **Maintainer bandwidth / bus factor** | H | H | ≥ 2 maintainers per repo. Docs-as-code. Automation (release, triage bots). Sponsorship plan ([16](16-docs-and-ecosystem-strategy.md)). | Lead |
| R7 | **Polyrepo coordination cost.** A contracts change touches framework, auth and ui. | M | M | Contracts change rarely (RFC + `next` channel). Nightly `integration` repo. Cross-repo release checklist. Local umbrella workspace. | Platform |
| R8 | **Generic CRUD performance** at scale | M | M | Keyset pagination, no default counts, allow-listed filters/includes, generated indexes, k6 budgets in CI, read replicas. | Framework |
| R9 | **RLS + connection pooling pitfalls** (session-scoped settings leaking between tenants) | M | H | `SET LOCAL` only (transaction-scoped). The app role has no `BYPASSRLS`. Pooler-mode tests. A lint forbids `SET` without `LOCAL`. | Framework |
| R10 | **Lowest-common-denominator multi-DB** | M | M | Explicit tiers. Features declare support. `doctor` warnings. Postgres-first. | Framework |
| R11 | **Trademark conflict** discovered late | L | H | Professional clearance in Phase 0. Backup brands listed. Reserve early. | Lead |
| R12 | **Supply-chain attack** on our packages or dependencies | M | H | Trusted publishing + provenance. 2FA. Minimal deps. pnpm `minimumReleaseAge`. Lockfile review. SBOM. Scorecard. | Security |
| R13 | **Windows-specific CLI bugs** (paths, line endings, shells) | M | M | CI matrix on Windows. No shell scripts in generated projects. Node-only tooling. | CLI |
| R14 | **Generated-code quality drift** (lint errors, outdated idioms) | M | M | Golden tests + "generate → typecheck → lint → test" e2e on every PR to generator templates | DX lead |
| R15 | **Competitor catches up** (e.g. AdonisJS adds UI generation; Payload 4 owns full stack) | M | M | Differentiate on owned code + MIT enterprise features + B2B focus. Ship the 2-hour tutorial early. | Lead |

## 2. Key architectural trade-offs (decided)

| Trade-off | Options | Decision | Cost we accept |
|-----------|---------|----------|----------------|
| Source of truth | DB-first (introspect) vs. code-first (models) | **Code-first models**, plus `db:pull` for brownfield | DB-first teams run one extra command |
| Generation style | Heavy codegen vs. runtime engine vs. thin metadata-driven files | **Thin + metadata-driven, with eject** | We maintain a runtime engine *and* eject templates |
| ORM | Build our own vs. Prisma vs. Drizzle vs. Kysely | **Own DSL on top of Drizzle** (internal adapter) | Adapter maintenance. Drizzle v1 RC risk. |
| HTTP | Express vs. Fastify vs. Hono vs. Nest | **Hono default** + adapters | Some Express middleware needs wrapping |
| DI | Decorators/reflection vs. typed tokens | **Typed tokens, no reflection** | Slightly more verbose than Nest decorators |
| Identity | Build vs. adopt | **Adopt (Better Auth) behind adapter** | Dependency on a newly acquired project |
| Authorization | CASL / OpenFGA / own | **Own engine** (SQL-compilable predicates), with OpenFGA/Cerbos adapters | We own a security-critical engine; we invest in testing |
| Tenancy enforcement | App-only vs. DB RLS | **Both** on Postgres | Postgres-specific code paths, RLS learning curve |
| UI distribution | npm component library vs. copy-into-project registry | **Registry copy** for components, npm for the engine | Component updates are opt-in diffs |
| Repos | Monorepo vs. polyrepo | **Polyrepo** (user decision; Laravel-aligned) | Cross-repo coordination ([10](10-repositories-publishing-versioning.md)) |
| Docker | Committed vs. local-only | **Local-only, git-ignored** | Prod container setup is a separate, explicit step |
| License | MIT vs. open-core vs. BSL | **MIT for everything** | Monetisation must come from services, not licences |
| Package naming | Coined product names vs. descriptive under scope | **Descriptive under a coined scope** | Less "cute" marketing per package |

## 3. Open questions to settle in Phase 0 RFCs

1. **ID strategy:** UUIDv7 default (lean yes) vs. bigint + public id.
2. **Registry build trigger:** dev watcher only, or also a Vite/TS plugin so editors see generated types instantly?
3. **Single port in dev** (API + UI through one Vite server) vs. two ports. Lean: single port with a proxy fallback.
4. **Tenant-editable roles** on by default? Lean: off, behind a flag.
5. **GraphQL projection:** a plugin post-1.0?
6. **Where the predicate builder lives:** contracts (types) + auth (runtime)?
7. **Next.js / TanStack Start targets for UI:** which comes first after 1.0? Lean: TanStack Start, since it is the same router.
8. **Telemetry for the CLI:** off by default with explicit opt-in? Lean: yes, anonymous, documented.
