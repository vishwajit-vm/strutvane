# Architecture Decision Records

| ADR | Title | Status |
|-----|-------|--------|
| [0001](0001-brand-strutvane-and-scoped-package-names.md) | Brand "Strutvane" with descriptive package names under `@strutvane` | Accepted (pending trademark clearance) |
| [0002](0002-one-repository-per-package.md) | One Git repository per package | Accepted |
| [0003](0003-model-first-thin-metadata-driven-generation.md) | Model-first, thin metadata-driven generation, L0–L3 control | Accepted |
| [0004](0004-drizzle-behind-internal-data-adapter.md) | Drizzle behind an internal data adapter | Accepted |
| [0005](0005-identity-adapter-better-auth-default.md) | Identity via adapter (Better Auth default) | Accepted |
| [0006](0006-docker-local-only.md) | Docker local-only, never committed | Accepted |
| [0007](0007-tenancy-rls-enforcement-rules.md) | Tenancy isolation via Postgres RLS under five mandatory rules | Accepted |
| [0008](0008-policy-predicates-two-valued-semantics.md) | Policy predicates: one AST, two-valued NULL-safe semantics | Accepted |
| [0009](0009-migration-engine-owns-rename-resolution.md) | Migration engine owns rename resolution and destructive-change gating | Accepted |
| [0010](0010-registry-static-analysis-oxc.md) | Typed registry via static analysis (oxc), storm-safe watching | Accepted |
| [0011](0011-openapi-pipeline-and-typed-client.md) | OpenAPI via @hono/zod-openapi; typed client via openapi-typescript + openapi-fetch; own list-query serializer | Accepted |
| [0012](0012-normalising-three-way-merge.md) | Normalising three-way merge for ejected files, fail-closed fallbacks | Accepted |
| [0013](0013-better-auth-hardened-adapter.md) | Better Auth behind a contract-tested IdentityEngine with mandatory hardening | Accepted (refines 0005) |
| [0014](0014-ui-from-manifest-with-registries.md) | UI rendered from the manifest through typed widget and cell registries | Accepted |
| [0015](0015-logs-own-pipeline-per-process-files.md) | `@strutvane/logs`: own non-blocking pipeline and writer, per-process files, bounded fail-safe delivery | Accepted |

## Adding an ADR

1. Copy [0000-template.md](0000-template.md).
2. Give it the next number.
3. Open a PR.

Accepted ADRs are never edited. To change a decision, write a new ADR that supersedes the old one.
