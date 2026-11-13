# 14 — Roadmap

**Approach:** each phase ends with a **gate**. The next phase starts only when the exit criteria are met.

**Assumed team:**
- 2–3 core engineers.
- Timings scale roughly linearly with team size.
- Community contributions are a bonus, not a plan input.

## Phase 0 — Foundations (weeks 0–4)

| Track | Deliverables |
|-------|--------------|
| Brand & legal | npm org + placeholder packages, GitHub org + repos, domains, trademark clearance started ([03 §6](03-naming-and-brand.md#6-reservation-checklist-do-immediately-names-can-be-taken-at-any-time)) |
| Governance | LICENSE (MIT), CODE_OF_CONDUCT, CONTRIBUTING, SECURITY.md, GOVERNANCE.md, RFC process (`strutvane/rfcs` or Discussions) |
| Repos & tooling | `tooling` repo (tsconfig, Biome, Vitest presets), `.github` reusable workflows (CI, release with trusted publishing, CodeQL, Scorecard), local umbrella workspace script |
| Spikes (time-boxed, 2–4 days each) | (1) Model DSL → Drizzle schema + migration diff on PG/MySQL/SQLite. (2) Registry compiler with watch mode. (3) Zod → OpenAPI 3.1 → typed client. (4) Policy predicate → SQL filter. (5) Postgres RLS with `SET LOCAL` under PgBouncer. (6) Three-way merge of templates. (7) Better Auth behind the identity adapter. (8) UI renderer from manifest with TanStack Table/Form. |
| Contracts v0 | RFCs for Actor, TenantContext, PermissionProvider, QueryFilter, ListQuery, ResourceManifest, Problem, AuditEvent, DomainEvent, Installer, FieldType |

**Gate 0:**
- All spikes answer their question (or produce an ADR changing the plan).
- Contracts RFCs accepted.
- Names reserved.

## Phase 1 — Core, CLI, Framework → `0.1.0-alpha` (months 1–3)

- **`core`:** app lifecycle, container, providers, config, env validation, context, hooks, events, logger, errors, plugin host, registry runtime.
- **`cli` / `strutvane` / `create-strutvane`:**
  - local-version delegation
  - `new` (presets `api`, `full` placeholder)
  - `make:model`, `make:resource`, `make:policy`, `make:migration`, `make:seeder`, `make:factory`, `make:test`
  - `migrate*`, `db:seed`, `routes`, `doctor`, `env:check`, `key:generate`, `up/down` (local Docker)
- **`devkit`:** installer and generator SDK, staged writes, `--dry-run --diff`, magicast-based config edits.
- **`framework`:**
  - model DSL (core field types), migrations (auto-diff + manual) for **Postgres + SQLite**
  - resource engine (full CRUD, list query protocol, hooks, actions)
  - validation, OpenAPI + `/docs`
  - Hono host
  - `/testing` helpers
- Generated `api` project complete: configs, `.env` / `.env.example`, Docker (local, git-ignored), tests, README, CI.
- Docs site skeleton + "Build your first API in 15 minutes" tutorial.

**Gate 1:**
- An external developer builds a 5-model API from the tutorial in under 30 minutes, unaided.
- The generated project passes typecheck, lint and test on Windows, macOS and Linux.

## Phase 2 — Auth → `0.2.0-alpha` (months 3–5)

- Identity adapter + Better Auth default:
  - email/password, magic link, Google, Microsoft, GitHub
  - sessions (DB/Valkey), JWT + refresh rotation, API keys
- Native authorization:
  - roles, permissions, policies
  - predicate → SQL compilation, field rules
  - permission auto-sync from models
  - `auth:matrix`, `auth:explain`
- Tenancy: shared strategy + Postgres RLS, resolver chain, tenant CLI, generated cross-tenant tests.
- Audit log v1 (outbox, redaction).
- `sv add auth` installer: config, migrations, routes, env, admin seed. Express/Fastify/Nest adapters for standalone use.

**Gate 2:**
- Cross-tenant and permission test suites pass on PG.
- Threat model for auth reviewed.
- No high-severity findings in the internal security review.

## Phase 3 — UI → `0.3.0-alpha` (months 5–7)

- `ui/core`: manifest/OpenAPI client, resource registry, query state, permission helpers.
- `ui/react` renderer:
  - list/table (filter, sort, search, paginate, bulk, export)
  - form (widgets per field type, relation pickers)
  - detail + relation tabs + activity tab
  - layouts, theme tokens, dark mode
- Auth screens: login, register, forgot/reset, verify, profile, MFA, users/roles admin, tenant switcher.
- shadcn-compatible registry, copy-into-project components, L1–L3 overrides, `sv eject ui`.
- `full` preset end-to-end, with one `pnpm dev` for API + UI.
- UI-only preset against arbitrary OpenAPI.

**Gate 3:**
- "Build a B2B app (10 models, auth, RBAC, UI) in 2 hours" tutorial validated with 5 external developers. Median ≤ 2 h.
- WCAG 2.2 AA audit of generated UI passes.

## Phase 4 — Enterprise layer → `0.9.0-beta` (months 7–9)

| Area | Deliverables |
|------|--------------|
| Databases | MySQL 8.4 tier 2, Azure PostgreSQL / Azure MySQL with Entra passwordless, provider presets, `db:pull` introspection |
| Auth | MFA (TOTP, passkeys), SSO (OIDC + SAML) per tenant, SCIM 2.0, impersonation, schema- and database-per-tenant strategies, audit hash chain |
| Platform | Queue (BullMQ on Valkey/Postgres), schedules, cache, mail, outbox relay, OpenTelemetry, API versioning, rate limiting per tenant/key, revision history |
| Ops | `/health` + `/ready`, production deployment guides (Azure Container Apps, AWS ECS, Fly, Kubernetes), `sv docker:prod` (on-demand, never auto-committed) |
| Upgrades | `sv upgrade` with codemods + three-way merge for ejected files |

**Gate 4:**
- Performance budgets met.
- DB matrix green.
- Beta users (≥ 3 teams) running real apps.

## Phase 5 — Hardening → `1.0.0` (months 9–12)

- **External security audit** of auth, tenancy and generators. All highs and mediums fixed.
- API freeze for contracts, core, framework, auth and ui. Deprecations cleaned up.
- Docs complete: tutorials, how-to guides, reference, explanation. Versioned docs. Migration guides. Example apps (CRM, helpdesk, inventory, HR portal).
- LTS policy published: 1.x security fixes for 18 months after 2.0.
- Launch: website, blog post, conference talk, video course.

**Gate 5 (1.0):**
- Audit closed.
- Zero known high CVEs.
- Upgrade path from 0.9 tested.
- Docs coverage 100% of public API.

## Phase 6 — Ecosystem (year 2)

**Priority order, driven by user demand:**

1. **`@strutvane/notify`:** email/SMS/push/in-app/Slack/Teams notifications, templates, preferences, digests.
2. **`@strutvane/files`:** uploads, S3/Azure Blob/GCS/local, image transforms, virus-scan hook, signed URLs, `file`/`image` field types.
3. **`@strutvane/logs`:** log/audit shipping, retention, SIEM export, log explorer UI.
4. **`@strutvane/reports`:** saved queries, scheduled reports, PDF/XLSX export, report builder UI.
5. **`@strutvane/payments` + `billing`:** Stripe/Razorpay/Adyen adapters, subscriptions, invoices, tenant plans and limits.
6. **`@strutvane/analytics`:** product analytics events, dashboards, metric definitions.
7. **`search`, `realtime`, `i18n`, `flags`, `webhooks`, `workflows`**, and a Vue renderer for `ui`.
8. **Visual Studio (optional):** a local web UI that edits model files (it reads and writes the same TS files, never a separate DB).
9. **Marketplace:** a curated community plugin directory on the docs site.

## Milestone summary

| Version | Target | Headline |
|---------|--------|----------|
| 0.1 alpha | M3 | Declare models → API with migrations + OpenAPI |
| 0.2 alpha | M5 | + Auth, RBAC, tenancy, audit |
| 0.3 alpha | M7 | + Generated UI, full-stack in one command |
| 0.9 beta | M9 | Enterprise layer, MySQL/Azure, queues, SSO |
| 1.0 | M12 | Audited, stable, documented |
| 1.x | Y2 | notify, files, logs, reports, payments, analytics |
