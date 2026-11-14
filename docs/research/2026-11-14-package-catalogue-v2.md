# First-party package catalogue v2: a complete B2B ecosystem (research + design, 2026-11-14)

- **Date:** 2026-11-14
- **Type:** research and design proposal. It changes no decision. It **extends** the v1 catalogue ([`2026-11-14-package-catalogue.md`](2026-11-14-package-catalogue.md), cited **[cat §n]**). Every place where it departs from v1, the blueprint or another document is listed in §0.3 with the reason, and needs the project lead's call (an ADR where one applies).
- **Brief:** the project lead wants a complete ecosystem of 30+ first-party packages, organised like Laravel's GitHub org, and explicitly asked for a charts package. Two packages are required (`charts`, `graphql`); the rest must earn their place, with a reason each is a separate package rather than part of the framework.
- **Decision received while writing (project lead, 2026-11-14):** **every package in the v1 catalogue will be developed; none is dropped.** v2 keeps all 28 v1 entries, adds the new ones, and records any suggested merge only as a note. The master tick-off list is [`2026-11-14-package-checklist.md`](2026-11-14-package-checklist.md).
- **Inputs (read first, all dated 2026-11-14):**
  - [`../18-v2-blueprint.md`](../18-v2-blueprint.md) (DRAFT) **[bp §n]**
  - [`2026-11-14-package-catalogue.md`](2026-11-14-package-catalogue.md) **[cat §n]**
  - [`2026-11-14-beyond-laravel.md`](2026-11-14-beyond-laravel.md) **[beyond §n]**
  - [`../../spikes/SHARED-DESIGN.md`](../../spikes/SHARED-DESIGN.md) **[board]** (spike 10–14 interfaces, the revised repo layout)
  - [`2026-11-14-auto-admin-ui-design.md`](2026-11-14-auto-admin-ui-design.md) **[admin §n]** (the `/aggregate` endpoint and widget registries)
  - [ADR-0001](../adr/0001-brand-strutvane-and-scoped-package-names.md) (descriptive names under `@strutvane`)

**Citation legend.**

- `[npm 2026-11-14]` = `npm view <pkg> version license time.modified` with npm 11.19.0 on 2026-11-14. It gives the latest version and the last registry modification, not a release date.
- `[packagist 2026-11-14]` = the first version listed in `https://repo.packagist.org/p2/<vendor>/<name>.json`, fetched 2026-11-14, with its release time.
- `[bundlephobia 2026-11-14]` = `https://bundlephobia.com/api/size?package=<pkg>@<version>`, minified + gzipped size of the package's **whole** entry point, fetched 2026-11-14. Tree-shaken real-world cost is lower and was **not measured**.
- `[gh 2026-11-14]` = `gh repo list vishwajit-vm`, run 2026-11-14.
- *(unverified)* = prior knowledge or a single secondary source.
- Sizes are the author's rough estimates for one maintainer with AI assistance (same scale as [cat §7]), not measurements.

---

## 0. Summary

### 0.1 The whole catalogue on one page

47 npm packages: the framework, 5 entry/default packages and 41 optional add-ons. **All 28 v1 catalogue entries are kept** (project lead's decision, 2026-11-14), and 19 are added. Where this document thinks two packages could merge, it says so in a note (§0.3) but keeps both in the list. Laravel equivalents marked *(c)* are community packages; *(paid)* are commercial.

| # | Package | One line | Laravel / ecosystem equivalent | Phase |
|---|---|---|---|---|
| 1 | `@strutvane/framework` (bin `strutvane`) | Kernel, HTTP, ORM, migrations, auth primitives, tenancy, background work, console, testing | `laravel/framework` | 1 |
| 2 | `@strutvane/auth` | Login, registration, reset, verification, 2FA, passkeys, tokens, teams, impersonation, owned screens | Fortify + Sanctum + starter-kit auth | 1 |
| 3 | `@strutvane/ui` | React kit + auto CRUD admin + sidebar + app shell (incl. the notification bell) | Starter-kit layouts + Filament / Nova *(paid)* | 1 |
| 4 | `create-strutvane` | `npm create strutvane@latest`: asks, installs, migrates, seeds, runs | `laravel/installer` | 1 |
| 5 | `strutvane` (unscoped) | Safe `npx strutvane` outside a project (see C3) | `laravel/installer` (partly) | 1 |
| 6 | `@strutvane/log-viewer` | Live tail, search and download of logs in the operator panel | Pail + opcodesio/log-viewer *(c)* | 1 |
| 7 | `@strutvane/redis` | Redis/Valkey drivers for cache, queue, locks, sessions, rate limits, broadcasting | Redis drivers in `illuminate/*` | 2 |
| 8 | `@strutvane/queue-dashboard` | Jobs, failures, throughput, retries and the scheduled-tasks view | Horizon (+ spatie/laravel-schedule-monitor *(c)*) | 2 |
| 9 | `@strutvane/files` | Cloud disks (S3, Azure), presigned/resumable uploads, virus scan, quotas | Flysystem adapters | 3 |
| 10 | `@strutvane/search` | Meilisearch/Typesense engines, queued indexing, hybrid vector search | Scout (engines) | 3 |
| 11 | `@strutvane/import-export` | CSV/XLSX import with mapping and dry run; policy-aware exports | maatwebsite/excel *(c)* | 3 |
| 12 | `@strutvane/inspector` | Dev recorder: requests, queries, jobs, mail, policy decisions | Telescope | 3 |
| 13 | `@strutvane/observability` | OpenTelemetry export + self-hosted metrics dashboard | Pulse (+ Nightwatch *(paid)*) | 3 |
| 14 | **`@strutvane/health`** | Scheduled health checks, history, alerts, uptime JSON endpoint | spatie/laravel-health *(c)* | 3 |
| 15 | `@strutvane/agent-tools` | AGENTS.md/skills, local MCP dev server, offline docs search | Boost | 3 |
| 16 | **`@strutvane/charts`** | Chart and KPI widgets (line, bar, area, pie, donut, sparkline, time series), auto-suggested from the schema, with policy- and tenant-safe aggregates | Filament chart widgets / consoletvs/charts *(c)* | 3 |
| 17 | `@strutvane/dashboards` | Dashboard pages built from any package's widgets: home page, per-user layouts, filters, scheduled digests | Nova dashboards *(paid)* / Filament dashboard pages | 3 (was 5) |
| 18 | **`@strutvane/activity-log`** | Per-record change history, activity feed and audit explorer | spatie/laravel-activitylog *(c)*, owen-it/laravel-auditing *(c)* | 4 |
| 19 | **`@strutvane/settings`** | Typed, DB-backed app/tenant/user settings with generated settings pages | spatie/laravel-settings *(c)* | 4 |
| 20 | **`@strutvane/media-library`** | Attach files to records: collections, conversions, responsive images, media manager | spatie/laravel-medialibrary *(c)* | 4 |
| 21 | **`@strutvane/tags`** | Tenant-scoped, typed tags on any model, with tag input and filter | spatie/laravel-tags *(c)* | 4 |
| 22 | **`@strutvane/comments`** | Threaded comments, mentions and reactions on any record | spatie/laravel-comments *(paid, unverified)* | 4 |
| 23 | **`@strutvane/pdf`** | Generate PDFs (invoices, reports) from React templates | spatie/laravel-pdf *(c)*, barryvdh/laravel-dompdf *(c)* | 4 |
| 24 | **`@strutvane/privacy`** | GDPR tools: data export, erasure/anonymisation, consent, retention | spatie/laravel-personal-data-export + -cookie-consent *(c)* | 4 |
| 25 | `@strutvane/backup` | Encrypted DB + storage backups, retention, restore drills | spatie/laravel-backup *(c)* | 4 (was 6) |
| 26 | **`@strutvane/api-explorer`** | Interactive OpenAPI explorer with try-it-out and code samples | dedoc/scramble *(c)*, knuckleswtf/scribe *(c)* | 4 |
| 27 | `@strutvane/social-login` | Sign in with Google, Microsoft, GitHub, Apple… | Socialite | 5 |
| 28 | `@strutvane/sso` | Per-tenant OIDC/SAML SSO, SCIM, domain verification | WorkOS starter-kit variant | 5 |
| 29 | `@strutvane/oauth-server` | Be an OAuth 2.1 provider | Passport | 5 |
| 30 | `@strutvane/mcp-server` | Expose the app to AI agents under its policies | `laravel/mcp` | 5 |
| 31 | `@strutvane/feature-flags` | Typed flags per user, tenant or plan, with an operator UI | Pennant | 5 |
| 32 | `@strutvane/webhooks` | Signed outgoing webhooks with retries; incoming verification | spatie/laravel-webhook-server/-client *(c)* | 5 |
| 33 | **`@strutvane/graphql`** | GraphQL API generated from models + policies + tenancy | nuwave/lighthouse *(c)* | 5 |
| 34 | `@strutvane/billing` | SaaS subscriptions, seats and entitlements per tenant (Stripe, Paddle) | Cashier | 6 |
| 35 | **`@strutvane/invoicing`** | Issue invoices: numbering, tax, line items, credit notes, PDFs | elegantly/laravel-invoices *(c)* | 6 |
| 36 | `@strutvane/realtime` | WebSocket server, private/presence channels, live tables | Reverb + Echo | 6 |
| 37 | `@strutvane/notification-channels` | SMS, Slack, Teams, web push, WhatsApp + preference centre | laravel-notification-channels *(c)*, Vonage/Slack channels | 6 |
| 38 | **`@strutvane/resource-views`** | Kanban board and calendar views over any resource | relaticle/flowforge, saade/filament-fullcalendar *(c)* | 6 |
| 39 | **`@strutvane/mail-templates`** | Editable, per-tenant transactional mail templates with preview | spatie/laravel-database-mail-templates *(c)* | 6 |
| 40 | `@strutvane/ai` | LLM calls, structured output, embeddings, policy-bound agent tools | Laravel AI SDK | 7 |
| 41 | `@strutvane/workflows` | Durable workflows, approvals, timers, model state machines | none first-party (spatie/laravel-model-states *(c)*) | 7 |
| 42 | **`@strutvane/translations`** | DB-backed UI strings with an editor + translatable model content | spatie/laravel-translatable + -translation-loader *(c)* | 7 |
| 43 | **`@strutvane/form-builder`** | Admin-designed forms and tenant custom fields | relaticle/custom-fields *(c, AGPL)* | 7 |
| 44 | **`@strutvane/cms`** | Pages, blocks, menus, redirects, SEO meta and sitemap | Statamic *(proprietary)*, spatie/laravel-sitemap *(c)* | 7 |
| 45 | `@strutvane/browser-testing` | Playwright fixtures for the real UI | Dusk / Pest browser testing | 7 |
| 46 | **`@strutvane/payments`** | Collect one-off payments for the app's own customers: hosted checkout, links, refunds | Cashier single charges / league/omnipay *(c)* | 8 |
| 47 | **`@strutvane/geo`** | Spatial columns, distance queries, geocoding, map field and map view | clickbar/laravel-magellan *(c)*, matanyadaev/laravel-eloquent-spatial *(c)* | 8 |

**Bold** = new in v2 (19). No v1 package is retired. The master tick-off list is [`2026-11-14-package-checklist.md`](2026-11-14-package-checklist.md). Repos without an npm package: `strutvane` (hub), `strutvane-skeleton` (app template, like `laravel/laravel`), `strutvane-docs`, `strutvane-tooling` (C4).

### 0.2 The verdict in eight lines

1. **Charts** is a phase-3 (→1.0) package built on **Recharts 3 (MIT)**, the library shadcn/ui's chart component uses, so the owned-component model (D14) fits. ECharts is excluded because it is Apache-2.0, not MIT, and the largest (§3.1).
2. **Charts are suggested from the migration replay:** enum → donut, `created_at` → trend, money → sum per month, foreign key → top 10. Every number comes from one aggregate path that applies the `viewAny` row filter and the tenant scope **in SQL before grouping** (§3.2).
3. **GraphQL** is generated like the REST API: Yoga (MIT) as the server, Pothos (ISC) as the builder, graphql-js 17 (MIT) as the engine. Production defaults are **persisted operations only**, depth 8, cost 5,000 and no introspection (§3.3).
4. **19 new packages** pass a stricter test than v1 (§1): ship UI, a heavy or vendor dependency, or something a minority needs, *and* not be something security code must call directly.
5. **15 requested ideas are folded in, not packaged**: notification centre → `ui`; impersonation → `auth`; SMS → `notification-channels`; scheduler UI → `queue-dashboard`; rate-limit dashboard → `observability`; audit UI → `activity-log`; file manager → `media-library`; sitemap/SEO → `cms`; multi-language content → `translations`; data-grid exports → `import-export`; i18n, money and rich-text columns → `framework`; subscriptions → `billing`; reports → `dashboards` digests (§1.3). No v1 package is dropped: where two could merge (`charts`/`dashboards`), that is a note, and both stay on the list.
6. **The framework must expose 21 new extension points** (F1–F21) and `ui` 9 registries (U1–U9) (§2). The most important is **F1 `ResourceService`**: one transport-agnostic pipeline (policy, validation, mass assignment, tenant scope, audit) that REST, GraphQL, MCP, imports and charts all call, so no package re-implements security.
7. **Phases:** v1's six phases become eight. A new phase 4, "back-office essentials" (activity log, settings, media, tags, comments, PDF, privacy, backup, API explorer), comes before identity add-ons, because a B2B back office needs them first and each is small (§5).
8. **Repos are created only when their phase starts.** `strutvane-skeleton` is first, and the npm name is reserved before each repo (§5.3).

### 0.3 Conflicts and departures (reported, not resolved)

| # | Where | Issue | Proposal (lead's call) |
|---|---|---|---|
| C1 | [cat §0.7, §6.1] monorepo vs [bp §3.2] + [board] "Repository (REVISED)" | v1 designed one npm-workspaces monorepo. The blueprint and the board now say one repo per package in the `vishwajit-vm` org, like Laravel's. | v2 follows the board. **v1 §6.1 is superseded**, and so is v1's per-workspace publishing. Versioning (lockstep before 1.0) is unchanged. |
| C2 | [cat §1.4] `npx strutvane install:<x>` vs [bp §2.2, §11.1] | The CLI decision is `node strut <command>`. | v2 writes `node strut install:<name>` everywhere. `npx strutvane` stays an alias. |
| C3 | [bp §3.2 phase 1] keeps the `strutvane` npx guard vs [board, dry run] "the `strutvane` launcher package is retired" | The two documents disagree on whether the unscoped package ships. | Keep the guard (v1 §4.5's `npx` safety argument still holds: without a local framework, `npx strutvane` downloads the unscoped name). If kept, decide its repo: re-purpose `strutvane-cli` instead of archiving it, or put it in `create-strutvane`. |
| C4 | [cat §4.29] retires `strutvane-tooling` (monorepo root `tooling/` replaces it) | With polyrepo restored (C1), 40+ repos need one source for tsconfig, Biome, Vitest, CI and `.npmrc` (the board's npm settings list). | **Keep** `strutvane-tooling` and its sync/drift check. |
| C5 | [cat §1.3] "no other `@strutvane/*` dependency" | The brief allows packages to use `ui` for their UI parts through documented hooks. | Each package may ship a `/ui` subpath with `@strutvane/ui` as an **optional peer** (`peerDependenciesMeta.optional`), using only the U1–U9 registries. The server entry still imports only the framework, and add-ons still never import each other. Operator-panel pages keep shipping prebuilt, CSP-hashed assets, so they need no `ui`. Record this in the "package catalogue and phases" ADR [bp §12]. |
| C6 | [cat #24] `@strutvane/dashboards` vs the requested `charts` | Their scopes overlap (metric cards, trends). Add-ons can't import each other. | **Both are kept** (the lead's decision), split cleanly. `charts` = the visuals and the data: chart and KPI widget types registered in `ui`'s widget registry (U1), the aggregate/metric endpoints and schema suggestions. `dashboards` = the pages: `app/dashboards/*.ts` definitions, the home dashboard, per-user layouts, global filters and scheduled digests. Dashboards composes **any** package's U1 widgets (charts, health, billing…). With charts absent, it still shows its built-in value and table cards. The two meet only in the U1 registry and the framework's F1/F7 data path. *Note:* if the split proves thin in practice, merging is an option, but both stay on the list. `dashboards` moves from phase 5 to 3 so the 1.0 home page has it. |
| C7 | [cat §4.7] `files` = disks + attachments + image variants + `media` table | Laravel splits these too: Flysystem adapters vs spatie/laravel-medialibrary. API-only apps want S3 without `sharp` and a media UI. | `files` = disk drivers + upload pipeline + scan + quotas. `media-library` = model attachments, conversions (sharp) and the media manager. They cooperate through the framework's disk registry. |
| C8 | [cat §4.11] observability includes "a health-check registry … behind `/ready` and the panel" | The check *registry* and `/ready` belong in the framework (security and deploys depend on them). A checks dashboard with history and alerts is wanted by nearly every production app; OpenTelemetry is not. | Registry in the framework (F13). UI, schedule, history and alerts in `health`. `observability` keeps OTel and metrics. |
| C9 | [cat §2] "Audit (Spatie Activitylog) → `framework/audit`"; [beyond §4.6] P1 record history in framework + ui | Per-row diffs cost storage and need UI. Not every app wants them. | Framework keeps the append-only audit table, the writer (same transaction) and security events (auth, roles, tokens, bypasses). `activity-log` adds per-model change history, the History tab, a feed and the explorer. |
| C10 | [bp §10] "4–6: social login … backup" and [cat §7] phases | v2 inserts phase 4 (back-office essentials) and moves `backup` from 6 to 4. ("Self-hosted B2B apps need it on day one of production" is v1's own reason [cat §4.28].) | Renumber: identity 4→5, money/realtime 5→6, AI 6→7, plus a demand-driven phase 8. |
| C11 | Brief: "built on an MIT chart library" | ECharts 6.1.0 is **Apache-2.0** [npm 2026-11-14]. That is permissive, but it isn't MIT and carries NOTICE obligations. | Excluded as the default. Apps may still bring it in through the renderer seam (§3.1). |
| C12 | [cat §3, §4.21] "`payments` and `billing` merge into one package" | They serve different payers. In billing, the **tenant pays the app vendor** (subscriptions). In payments, **the tenant's customers pay the tenant** (invoices, orders). Invoicing is a third concern that works without any gateway. | Split into `billing` (kept), `invoicing` (new) and `payments` (new, phase 8, demand-driven). |
| C13 | [cat §2] notifications: the framework's `database` channel is the "in-app inbox", but nobody owns the inbox **UI** | — | The bell, dropdown and inbox page go into `ui` in 0.3, with the framework's notifications. No separate package. |
| C14 | [bp §11.2] MySQL default | Time buckets, JSON paths and spatial types differ per engine. SQLite has no spatial types without SpatiaLite *(unverified for the bundled driver)*. | F7 (aggregate grammar) is specified for MySQL, PostgreSQL and SQLite from day one. `geo` supports PostGIS and MySQL spatial, and on SQLite it falls back to a bounding box with a documented caveat. |
| C15 | `strutvane-logs` repo exists [gh 2026-11-14]; [bp §3.2] names `strutvane-log-viewer` | Rename vs new repo. | Rename on GitHub (redirects are kept *(GitHub behaviour, unverified for orgs with Pages)*). This is the owner's action. |

---

## 1. How the line is drawn (v1 rules, tightened)

### 1.1 Stays in the framework (v1 §1.1, unchanged)

A capability belongs in the framework when **any** of these holds: the phase-1 flow needs it; security code calls it directly; it has a useful default with no heavy dependency; or Laravel ships it in `illuminate/*`.

### 1.2 Becomes a package (v1 §1.2 plus one test)

A capability becomes a package when it ships a UI, pulls a heavy or native dependency, wraps a vendor, serves a minority of apps, or is dev-only. v2 adds a fifth test, **"the 30 % test"**: if fewer than about a third of B2B apps would use it, it's a package even when it's small (tags, comments, geo). *(The threshold is judgement, not data.)*

### 1.3 Requested ideas folded into an existing home (not packaged)

| Idea from the brief | Home | Why not a package |
|---|---|---|
| Notification centre (in-app inbox UI) | `ui` (shell) + framework `database` channel | Every app with notifications wants the bell. It is a shell component, and the data already lives in the framework (C13). |
| Impersonation | `auth` | Already designed there [cat §5 auth]. It touches sessions and audit directly, and splitting it would recreate the auth↔framework seam the audit blamed for 6 of 28 issues [cat §1.1]. |
| SMS | `notification-channels` | SMS is a channel. OTP over SMS for 2FA uses the same channel through the notification driver registry. |
| Scheduler UI | `queue-dashboard` (scheduled-tasks tab) + `health` (missed-run alert) | Already in v1 [cat §4.9]. |
| Rate-limit dashboard | `observability` (limiter hits as metrics) | A single chart, not a product. The limiter emits metrics through OTel. |
| Audit UI | `activity-log` | One explorer over the framework's audit table and the record history (C9). |
| File-manager UI | `media-library` | The browser for attached media *is* the media manager. A general-purpose disk browser is a security liability (path traversal, cross-tenant listings) with little B2B value. |
| Sitemap / SEO | `cms` | B2B apps are mostly behind sign-in. Public pages are what the CMS renders, and the sitemap is built from its pages plus routes marked public (F17). |
| Multi-language content | `translations` | Same users, same locale switcher, same editor as DB-backed UI strings. |
| i18n | framework | It is in `illuminate/*`, and validation messages need it in phase 1 [cat §2]. |
| Data-grid exports | `import-export` (+ framework CSV export, 10,000 rows [bp §5]) | Already designed there. |
| Subscriptions | `billing` | That is what billing is (Cashier). |
| Reports (scheduled / saved) | `dashboards` (digests) + `import-export` (exports) + `ui` (saved views) | An end-user ad-hoc report builder is out of scope until demand appears. |
| Money columns, rich-text columns, sanitising | framework (F20, F21) | `billing`, `invoicing`, `payments`, `comments`, `cms` and `mail-templates` all need them. Packages can't import each other, so the shared part must sit below them. |
| Kanban *and* calendar as two packages | one `resource-views` | Same seam (a view-mode registry over the list query), same permission rules. |
| Roles/permissions management UI | `auth` (team members and roles screens) | RBAC vocabulary is security-critical. Laravel's community splits it (spatie/laravel-permission, Filament Shield); Strutvane needn't. |

### 1.4 Considered and not added (for now)

Event sourcing (spatie/laravel-event-sourcing; niche), newsletter/marketing mail (not B2B core), tenant custom domains (an open question, §6), captcha/human verification (an F9 token is reserved; drivers come with `form-builder` or `auth` when needed; an agent must never solve CAPTCHAs, but a server verifying a token is fine), cloud queue drivers such as SQS (a later driver package if asked), and a Vue renderer (later [cat §7]).

---

## 2. Extension points

### 2.1 Existing (v1 §1.3 plus spike 12), referred to as X1–X11

X1 service providers + typed container tokens · X2 driver registries · X3 events (after commit) · X4 navigation registry (`app.navigation.add`) · X5 operator panel registry (`/_strutvane/*`) · X6 dev process registry · X7 installer steps · X8 agent resources (`ai/` in each tarball) · X9 HTTP + OpenAPI · X10 command registry (`app.addCommand`, `defineCommand`) · X11 route registration (`app.addRoutes`, before boot).

### 2.2 New framework extension points (F1–F21)

| # | Extension point | Shape (proposal) | Used by |
|---|---|---|---|
| F1 | **`ResourceService`**: transport-agnostic resource operations | `resources.for(Post).list(listRequest, actor) / show / create / update / delete / restore / aggregate / options`. Each call runs the policy (incl. row predicate), form-request validation, the fillable guard, the tenant scope, ETag checks and the audit write. `ResourceController` becomes a thin HTTP adapter over it. | graphql, mcp-server, import-export, charts, resource-views, form-builder, ai, workflows |
| F2 | **Public `ResourceMetadata` API** | Typed read access (via `MetadataToken`) to `resources.json` + `schema.json`: column kind, enum values, relations, title field, and flags `internal`, `secret`, `hidden`, `personal`, `aggregatable`, `searchable`, `translatable`. Versioned, documented, stable from 1.0. | charts, graphql, privacy, translations, form-builder, resource-views, api-explorer, search |
| F3 | **Schema lifecycle hooks** | `schema.migrating` (packages add pre-flight lint rules) and `schema.migrated` (payload: tables/columns added, changed, dropped). `ui:sync` already wants the latter [board, spike 14]. | ui, charts, graphql, translations, privacy, search |
| F4 | **Column-type registry** for the Schema builder | `defineColumnType({ name, sql: { mysql, pgsql, sqlite }, cast, zod, uiHint, flags })`, giving `t.point()`, `t.translatable()` and so on. Types must replay in memory (spike 10). | geo, translations, form-builder (`custom_fields`) |
| F5 | **Model behaviours** (no decorators) | `Model('posts', { behaviours: [hasTags(), logsActivity(), hasMedia(), hasComments()] })`. A behaviour adds typed relations, scopes, observers and serialization hooks. | tags, activity-log, media-library, comments, translations, geo, search, privacy |
| F6 | **Polymorphic relations with a morph map** | `morphTo / morphMany / morphToMany` keyed by stable aliases (`'post'`), never class names. Composite tenant keys, verified attach inside a transaction [board, spike 11]. | tags, comments, activity-log, media-library |
| F7 | **Aggregate + time-bucket grammar** | `Post.query().aggregate({ groupBy: { column: 'created_at', bucket: 'month', tz }, metrics: { count: '*', sum: 'amount' } })` on MySQL, PostgreSQL and SQLite; optional gap filling; ≤ 100 groups. It backs the designed `GET /:res/aggregate` [admin §5]. | charts, graphql, observability |
| F8 | **`model.changed` event with a redacted diff** | `{ table, key, tenant, actor, before, after, changed[] }`, with secret/hidden columns replaced by `[redacted]`, dispatched after commit. | activity-log, webhooks, search, realtime, charts (cache invalidation) |
| F9 | **Capability tokens** (interfaces only) | `PdfRenderer`, `SettingsStore`, `TranslationLoader`, `MailTemplateResolver`, `MediaUrlGenerator`, `PaymentLinkProvider`, `HumanVerification`, `Broadcaster`, plus the existing `FeatureFlags`. Packages bind them; others check `container.has()` [cat §1.3]. | pdf, settings, translations, mail-templates, media-library, payments, invoicing, charts, realtime |
| F10 | **Personal-data registry** | Migration marker `.personal()` → metadata flag. `app.personalData.register(table, { export, erase: 'delete' | 'anonymise' | fn })`, so each package declares its own user-linked tables. | privacy, plus every package with user data |
| F11 | **New driver registries** | `pdf`, `geocoder`, `payment gateway`, `sms` (inside notification channels), `virus scanner`. | pdf, geo, payments, files, notification-channels |
| F12 | **Widget-data and settings HTTP namespaces** | Packages mount under reserved prefixes (`/api/_charts`, `/api/_settings`) that are guaranteed not to collide with resource routes (the slug reserved-word list [admin §4.7] gains `_*`). | charts, settings, comments, tags |
| F13 | **Health-check registry** | `app.health.register({ name, run, critical, timeoutMs })`. `/up` stays liveness-only; `/ready` runs the critical checks. | health, observability, backup, redis, files, search |
| F14 | **Public `toProblem(err)` mapping** | One function from any framework error (ORM codes, validation, policy) to RFC 9457 `Problem` + `code` + `issues`. | graphql, mcp-server, import-export |
| F15 | **Weighted rate-limit budget** | `limiter.consume(key, cost)`, so expensive operations (GraphQL cost, chart queries, exports) spend from the same per-user/tenant budget. | graphql, charts, import-export, ai |
| F16 | **Tagged, tenant-prefixed cache** | `cache.tags(['charts', 'posts']).remember(key, ttl, fn)`. The tenant prefix is automatic and impossible to omit. | charts, settings, translations, feature-flags |
| F17 | **Route meta for public pages** | `Route.get(…).public().meta({ sitemap: { priority }, seo: { title } })`. | cms, api-explorer |
| F18 | **Signed URLs for any route** | `url.signed('privacy.export.download', params, { ttl, oneTime })`. Today these exist only for storage. | privacy, media-library, form-builder, invoicing, payments |
| F19 | **Prune/retention registry** | `prunable()` on models plus `model:prune` on the scheduler [beyond §1 #8]. Packages register retention defaults. | activity-log, health, privacy, inspector, webhooks, comments |
| F20 | **`t.richText()` + one hardened sanitiser** | Server-side sanitisation on write with one allowlist policy (candidate `sanitize-html` 2.18.2, MIT [npm 2026-11-14]), plus a `RichText` cast. | comments, cms, mail-templates, form-builder |
| F21 | **`t.money()` + `Money` cast** | `decimal(19,4)` + `char(3)` currency; decimal-string JSON; Intl formatting. | billing, invoicing, payments, charts |

### 2.3 New `ui` registries (U1–U9) that packages' `/ui` subpaths use

| # | Registry | Used by |
|---|---|---|
| U1 | Dashboard widget registry + dashboard page slots (`registerWidget(type, Component)`) | charts, dashboards, health, billing, workflows |
| U2 | Record detail-tab registry (`registerDetailTab({ id, label, when(meta), Component })`) | activity-log, comments, media-library, workflows, invoicing |
| U3 | Record, bulk and list-toolbar action registry | import-export, pdf, invoicing, privacy, auth (impersonate) |
| U4 | Field widget / table cell / filter registries, made public and versioned (they exist in v1 [admin §6]) | tags, media-library, geo, translations, form-builder, settings |
| U5 | List view-mode registry (`table` / `board` / `calendar` / `map`) | resource-views, geo |
| U6 | Shell slots: header items, global banners, user-menu entries, settings-section registry | notification bell (ui), translations (locale switcher), auth (impersonation banner), settings, privacy |
| U7 | Package pages through file routes + `app.navigation` (exists) | every package with pages |
| U8 | Theme tokens: `--chart-1…--chart-8`, semantic status colours, light and dark sets | charts, resource-views, geo |
| U9 | Lazy-chunk loading for package UI (`lazyWidget(() => import(...))`) | charts, cms, mail-templates, geo, form-builder |

---

## 3. The two required packages in depth

### 3.1 `@strutvane/charts`: library comparison

All rows: [npm 2026-11-14] for version, licence and last modification; [bundlephobia 2026-11-14] for size (whole entry point, min + gzip, **not** tree-shaken).

| Library | Version | Licence | Size (min+gz) | Rendering | React 19 peer | Last registry change | Notes |
|---|---|---|---|---|---|---|---|
| **Recharts** | 3.10.1 | **MIT** | 149.9 kB (11 deps) | SVG, React components | yes (`^19.0.0`) | 2026-11-03 | Used by the **shadcn/ui Chart component, now on Recharts v3** (ui.shadcn.com/docs/components/chart, read 2026-11-14). Theming through CSS variables. Deps include Redux Toolkit and immer. |
| Chart.js (+ react-chartjs-2 5.3.1, MIT) | 4.6.1 | **MIT** | 69.6 kB (1 dep) | Canvas | yes (via wrapper) | 2026-10-22 | Used by **Filament's chart widgets** (filamentphp.com/docs/5.x/widgets/charts, read 2026-11-14). Canvas: a theme change needs a JS re-render; screen readers need a table fallback. |
| ECharts (+ echarts-for-react 3.0.6, MIT) | 6.1.0 | **Apache-2.0** | 368.0 kB (2 deps) | Canvas/SVG | yes (wrapper) | 2026-05-19 | The richest feature set (maps, large data), but not MIT (C11) and the heaviest. Modular imports cut the size *(not measured)*. |
| visx (`@visx/xychart`) | 4.0.0 | **MIT** | 50.3 kB (16 deps) | SVG primitives | yes (`^19.0.0`) | 2026-06-11 | Low level (d3 + React). We would own a chart kit: more code, more tests. |
| Nivo (`@nivo/line`) | 0.99.0 | **MIT** | 96.0 kB for line alone (12 deps) | SVG/Canvas | yes | **2025-05-23** | No registry change in ~18 months: maintenance risk. Each chart type is a separate package. |
| uPlot (reference) | 1.6.32 | MIT | 21.9 kB (0 deps) | Canvas | no React binding | 2025-03-14 | Fastest for dense time series. A candidate for an opt-in "high-density" renderer later. |

**Recommendation: Recharts 3.** This matches the in-progress `spikes/16-charts/`, whose `package.json` pins `recharts` 3.10.1 (seen 2026-11-14; its findings weren't read for this document).
- It matches D14 directly: the installer copies a shadcn-style `resources/ui/components/ui/chart.tsx` (an owned file) that wraps Recharts and reads `--chart-n` tokens (U8). Light and dark then work through CSS alone.
- SVG output is inspectable, printable and testable with DOM queries.
- **Keep it off the critical path:**
  - the charts chunk is lazy-loaded (U9), so the admin's first paint never pays the ~150 kB;
  - table-cell sparklines use a ~40-line zero-dependency SVG component, so a 25-row list never loads Recharts;
  - the server caps points (≤ 1,000 per series; LTTB downsampling for longer ranges) so SVG never renders tens of thousands of nodes.
- **Renderer seam:** widgets receive `{ series, buckets, format }`, never library props. An app can swap one widget type for Chart.js, ECharts or uPlot by registering its own component under U1, at its own licence choice.

### 3.2 `@strutvane/charts`: design

**Chart and widget types:** line, area (stacked), bar (grouped, stacked, horizontal), pie, donut, sparkline, **KPI card** (value, delta against the previous period, inline sparkline), time series with a range picker and bucket switch (day, week, month, quarter, year), top-N table, and progress against a target.

**Auto-suggestion from the migration schema** (runs on `schema.migrated`, F3; reads F2 metadata only; no database access):

| Schema signal | Suggested widget | Example title |
|---|---|---|
| Any resource with `created_at` | KPI (count + Δ vs previous 30 days) and a line of new rows per bucket (bucket picked from the data span) | "Posts", "New posts per week" |
| `enum` column | Donut for ≤ 8 values, bar otherwise (extra values roll into "Other") | "Posts by status" |
| `boolean` | KPI as a percentage | "Published: 64 %" |
| `t.money()` / decimal named `amount`, `total`, `price`, `revenue`, `cost`, `value`, `balance` (name list shared with the admin's widget heuristics [admin §4.1]) | KPI sum + bar of the sum per month | "Invoice total per month" |
| `foreignId` to a resource with a title field | Horizontal bar, top 10 parents by count | "Top 10 customers by orders" |
| Non-timestamp `date` (e.g. `due_date`) | Bar of the upcoming 8 weeks | "Invoices due per week" |
| `deleted_at` | KPI of rows deleted in the last 30 days (only for users with `restore`) | "Deleted posts (30 d)" |
| **Never suggested** | `internal` tables; `secret`, `hidden` or `personal` columns; non-`aggregatable` columns; free text; ids | — |

- **Ownership** follows `ui:sync` [board, spike 14]. Suggestions go to the machine-owned `.strutvane/charts.suggestions.json`. Charts itself owns no page: it registers its widget types (`kpi`, `trend`, `donut`, `bar`, `sparkline`, `metric`, …) in U1, and exposes suggestions through the U1 "Add widget" picker and the post-migrate report. Each list page also gets an optional "Insights" tab built from that resource's suggestions.
- **Where the widgets go:** in `dashboards` pages (§3.2a), in an owned page, or in a detail tab. A widget spec is typed and data-only, so field names are checked against the registry and a dropped column is a `tsc` error, as with `*.ui.ts`:
  ```ts
  trend(Post, { metric: count(), bucket: 'week', range: '90d' })
  donut(Post, { groupBy: 'status' })
  metric('mrr')                        // custom metric from app/metrics/mrr.ts
  ```

**Server-side aggregation (the security core):**

1. **Auto widgets** call the framework's designed `GET /api/:res/aggregate` [admin §5], extended through F7 with `bucket`, `tz`, `from`/`to` and `compare`.
2. **Custom metrics** live in `app/metrics/*.ts`:
   ```ts
   export default defineMetric('mrr', {
     resource: Subscription, ability: 'viewAny',
     query: (q) => q.where('status', 'active').aggregate({ metrics: { sum: 'amount' } }),
     cache: '5m', format: 'money',
   })
   ```
   They are served at `GET /api/_charts/metrics/:name` (F12).
3. **Both paths go through `ResourceService.aggregate` (F1):**
   - the request is already inside `runWithTenant`;
   - the `viewAny` **row predicate is applied in SQL before `GROUP BY`**, so a manager's "Revenue by month" counts only rows they could list;
   - group-by and metric columns must be `aggregatable` and visible to the actor;
   - filters accept only filterable, visible fields (no inference through hidden columns);
   - relation labels (top 10 customers) resolve only for parents the actor may `view`; the rest roll into "Other".
4. **Limits:**
   - ≤ 100 groups;
   - ≤ 1,000 points per series;
   - range caps per bucket (e.g. `day` ≤ 2 years);
   - a statement timeout;
   - the cost is spent from the weighted limiter (F15).
5. **Caching** uses the tagged, tenant-prefixed cache (F16). The key includes a **policy fingerprint** (a hash of the compiled row predicate and its bound actor values), so two users with different row filters never share a cached number. Entries are invalidated by `model.changed` (F8) per table tag.
6. **Engines:** bucket expressions per grammar (MySQL `DATE_FORMAT`/`CONVERT_TZ`, PostgreSQL `date_trunc … AT TIME ZONE`, SQLite `strftime`) are specified in F7 *(exact functions to verify in the spike)*. Decimals travel as strings [admin §5].

**Refresh:** live through the `Broadcaster` token if `realtime` is installed (F9); otherwise widgets poll with ETags on window focus.

**Accessibility and theme:**
- each chart is a `<figure>` with a generated text summary and a "View as table" toggle;
- colour is never the only encoding (direct labels on pie and donut);
- `prefers-reduced-motion` turns animation off;
- the palette is validated for contrast in both themes (U8);
- axe runs on every widget type in both themes (the [beyond §3.11] release blocker).

### 3.2a `@strutvane/dashboards`: how it pairs with charts (C6)

- **Dashboard definitions** are typed, data-only files in `app/dashboards/*.ts`. They list widget specs from any package's U1 registrations; a widget whose package isn't installed is a `tsc` error, not a runtime blank:
  ```ts
  export default defineDashboard('main', {
    widgets: [kpi('posts.count', { compare: 'previous_period' }), trend(Post, { bucket: 'week' }), widget('health.status')],
  })
  ```
- **Built-in cards (no charts needed):** value, value with delta, table (top N) and text. Each calls `GET /api/:res/aggregate` / F1, under the same rules as §3.2 steps 3–5.
- **When charts is installed and the app is fresh,** dashboards writes the owned `resources/ui/dashboards/main.dashboard.ts` (create-once) from the top `charts.suggestions.json` entries. It reads that file (data); it never imports charts.
- **UI:**
  - the home page (`/`) is a responsive 12-column grid;
  - a global date-range filter and global filters on shared dimensions;
  - per-user layouts in `dashboard_layouts`;
  - role-specific dashboards (`ability` per dashboard).
- **Digests ("email me this dashboard weekly"):** queued through the framework's scheduler and mail. They contain KPI values and a formula-safe CSV. A PDF is attached only if `PdfRenderer` is bound (F9); otherwise the email links to the dashboard. Server-side chart images are deferred *(design open)*. Each digest re-runs the queries **as its recipient** (policy and tenant applied at send time), never from a cached admin view.

### 3.3 `@strutvane/graphql`: design

**Library comparison** [npm 2026-11-14]:

| Library | Version | Licence | Role | Notes |
|---|---|---|---|---|
| graphql-js (`graphql`) | 17.1.0 | MIT | Reference parser, validator and executor | Required under any choice. Yoga and Pothos accept `^16 \|\| ^17`. |
| **GraphQL Yoga** (`graphql-yoga`) | 6.1.0 | MIT | Server | Fetch-API based, so it mounts as a handler inside the Hono app. Envelop plugin system (`@envelop/core` 6.0.1). SSE subscriptions *(feature from docs, unverified for 6.x)*. Official persisted-operations plugin (`@graphql-yoga/plugin-persisted-operations` 4.1.0): non-persisted queries are rejected with `PersistedQueryOnly` unless `allowArbitraryOperations` returns true (the-guild.dev docs, read 2026-11-14). |
| **Pothos** (`@pothos/core`) | 4.17.0 | **ISC** (permissive, MIT-equivalent) | Code-first, type-inferred schema builder | Plugins: `scope-auth` 4.3.0, `dataloader` 4.5.0, `relay` 4.8.2, `complexity` 4.2.3, `validation` 4.3.5, `zod` 4.3.2 (all ISC). |
| GraphQL Armor (`@escape.tech/graphql-armor`) | 3.2.0 | MIT | Envelop plugins: max depth (2.4.2), cost limit (2.4.3), max aliases/tokens/directives, blocked field suggestions | Last registry change 2025-12-29. |
| graphql-query-complexity | 2.0.0 | MIT | Cost estimation | An alternative to Armor or Pothos complexity. |
| graphiql | 6.0.1 | MIT | In-browser IDE | Local only. |
| Lighthouse (reference) | v6.74.0 | MIT | Laravel: schema-first SDL with directives (`@paginate`, `@can`, …) [packagist 2026-11-14] | Security limits live in `config/lighthouse.php`, based on webonyx/graphql-php's options (lighthouse-php.com, read 2026-11-14; defaults *unverified*). |

**Recommendation: Yoga (server) + Pothos (builder) + graphql-js 17 (engine) + Armor (limits).** Why code-first rather than Lighthouse's SDL-first: columns live only in migrations [bp §2.3]. An owned `schema.graphql` with directives would be the eighth copy of the schema, the "seven files" pain [beyond §2.14]. We still **emit SDL** for review and for clients.

**Generation (on `schema.migrated`, F3):**
- `.strutvane/graphql.gen.ts` (machine-owned, committed like the rest of `.strutvane/` [bp §3.1]) calls the Pothos builder once per resource that has an API resource and isn't `internal`:
  - object types from `Json` (secret/hidden columns never appear);
  - relation fields from `resources.json` relations;
  - `PostFilter` inputs from filterable fields, with the REST operators `eq ne gt gte lt lte in contains startsWith null`;
  - `PostOrder` from sortable fields;
  - `CreatePostInput` / `UpdatePostInput` from the per-table Zod schema narrowed by `fillable`.
- `.strutvane/schema.graphql` is the SDL snapshot. CI fails when it is stale, and a breaking-change diff is printed on `migrate`.
- **Queries:** `posts(first, after, page, search, where, orderBy): PostConnection` (Relay cursor plus offset pagination; `first` ≤ 100), `post(id | slug)` and `postsAggregate(groupBy, bucket)` (F7). **Mutations:** `createPost`, `updatePost` (patch semantics), `deletePost`, `restorePost`.
- **Every resolver calls F1 `ResourceService`.** Policies, row predicates, tenancy, validation, the fillable guard, the audit write and ETags are therefore identical to REST.
- **Errors** map through F14 to `extensions: { code, issues }`, with the same codes as the REST problem+json.
- **Relations** are batched by request-scoped DataLoaders (Pothos `dataloader`), so there is no N+1. Related lists are `viewAny`-filtered in SQL. A `belongsTo` the actor may not `view` resolves to `null`, never an error, so existence doesn't leak. Loaders are created per request and never shared, so there is no cross-tenant cache.
- **App-owned extensions:** `app/graphql/*.ts` use the same builder. `make:graphql-type` and `make:graphql-mutation` generate them. A custom resolver must declare `authScopes` (Pothos `scope-auth` mapped onto policies). A resolver without one fails at boot (deny by default, like routes [board, spike 12]).

**Security defaults:**

| Control | Default | Notes |
|---|---|---|
| Mode | `first-party`: **persisted operations only** in production | The generated UI's operations are hashed at build into `.strutvane/graphql.operations.json`. `public` mode allows arbitrary operations for third-party API clients, with every limit below and a per-token cost budget. |
| Depth | 8 | Armor `maxDepth` |
| Cost | 5,000 per operation; lists multiply by `first` | Cost is spent from F15 per user/tenant/minute |
| Aliases / tokens / directives | 15 / 2,000 / 20 | Against alias-amplification and parser DoS |
| Introspection and field suggestions | Off in production | On in local/testing. GraphiQL is served only when `APP_ENV=local` |
| Batching (array bodies) | Off | |
| CSRF | Cookie-authenticated `POST` follows the framework's CSRF rules [board, spike 12]; `GET` only for persisted **queries**, never mutations | |
| Pagination | `first` ≤ 100, total capped as in REST | |
| Internal tables, secret columns | Never in the schema; the generator refuses them, and a boot check fails if a custom type exposes them | Same list as F-01 [board] |
| Audit | Operation name + hash + actor on mutations; never variables (they may hold PII) | |

Subscriptions come later, through the `Broadcaster` capability (F9) when `realtime` is installed, with channels tenant-scoped by construction.

---

## 4. Package cards (every package)

**Card legend.**
- **EP** = extension points used: X = existing, F/U = new (§2).
- **Deps** never list another add-on. "ui (opt.)" means an optional peer used by the package's `/ui` subpath through U-registries (C5).
- Every add-on installs with `node strut install:<name> [--dry-run]`. The installer is idempotent, appends one provider line to `bootstrap/providers.ts`, publishes migrations into `database/migrations/` (app-owned, applied by `node strut migrate`), writes `config/<name>.ts` and env keys (empty in `.env.example`), and registers an `ai/` guideline (X7, X8) [cat §1.4]. Cards list only what is specific.
- **Size:** S ≈ ≤ 1k new LOC / ≤ 1 week; M ≈ 1–2.5k / 1–2 weeks; L ≈ 2.5–5k / 3–4 weeks; XL ≈ 5k+ / 5+ weeks *(estimates)*.
- Facts for v1 packages are carried over from [cat §4], which cites [npm 2026-11-14].

### Phase 1: the full flow (0.2)

#### 1. `@strutvane/framework` (bin `strutvane`): phase 1 core, phase 2 background · XL
- **Purpose:** the framework [bp §3.2, cat §2]. **Why:** one package, one version, a working secured app from `npm create`.
- **Laravel:** `laravel/framework`. **Install:** pulled in by `create-strutvane` (`npm i @strutvane/framework` by hand).
- **Adds:** the skeleton layout [bp §3.1]; `/up`, `/ready`, `/openapi.json`, `/docs`; the operator panel shell `/_strutvane`; `node strut` with make/db/inspect/packages/services commands.
- **EP:** *provides* X1–X11 and F1–F21. **Deps:** Hono, Zod, its own ORM [bp §4]; optional peers `pg`, `mysql2`, the SQLite driver, `nodemailer`.
- **Security:** deny by default, tenant scope + RLS, policy → SQL, CSRF, redaction [bp §5]. **v2 additions:** F1–F21, of which F1, F2, F3, F7, F13, F14 and F20 should be in **0.2/0.3**, because phase-3 packages build on them.

#### 2. `@strutvane/auth`: phase 1 · L
- **Purpose:** Fortify + Sanctum features, teams and **impersonation** (folded in, §1.3). **Why:** login works the moment the app runs; screens are owned.
- **Laravel:** Fortify + Sanctum + starter-kit auth; lab404/laravel-impersonate *(c)*. **Install:** chosen at create; `node strut install:auth --features=… [--teams]`.
- **Adds:** `config/auth.ts`; users/tokens/passkeys/teams migrations; `/login` etc.; `resources/ui/pages/auth/*` and `settings/*`; team-member and role screens; the impersonation banner (U6) and "Impersonate" action (U3); commands `user:create`, `team:create`, `tokens:prune`.
- **EP:** X1, X3, X4, X10, X11, U3, U6. **Deps:** framework; ui (opt.); `@simplewebauthn/server` 14.1.0, `otpauth` 9.6.0.
- **Security:** hashed tokens; session revocation on password change. **Impersonation:** only with the `impersonate` ability, never of a higher role, audited start and stop, a visible banner, no password or 2FA changes while impersonating, auto-expiry.

#### 3. `@strutvane/ui`: phase 1 · XL
- **Purpose:** the React kit, app shell and auto CRUD admin [board, spike 14]. **v2 adds:** the notification bell and inbox page (0.3), and registries U1–U9.
- **Laravel:** starter kits + Filament / Nova. **Install:** at create; `node strut install:ui`.
- **Adds:** `resources/ui/*`, the Vite dev process, `ui:sync`, `ui:add`, `make:page`; the notification bell (header slot) + `/notifications` page once framework notifications land.
- **EP:** X4, X6, X9, F2, F3; *provides* U1–U9. **Deps:** framework; React 19, Vite, TanStack, Tailwind 4.
- **Security:** sidebar hidden by `viewAny`; secret columns never rendered; export/bulk opt-in.

#### 4. `create-strutvane`: phase 1 · L
- **Purpose:** the installer [bp §2.1]. **Laravel:** `laravel/installer`. **Install:** `npm create strutvane@latest my-app`.
- **Adds:** the whole project from `strutvane-skeleton`; the optional package picker runs `install:*` steps, **generated from published packages only** [cat §7].
- **EP:** X7 (runs them). **Deps:** none on the framework [board, dry run].
- **Security:** secrets only in `.env`; ports bound to 127.0.0.1.

#### 5. `strutvane` (unscoped): phase 1 · S
- **Purpose:** prints guidance when `npx strutvane` runs outside a project; never executes project code [cat §4.5]. **Status:** see C3.

#### 6. `@strutvane/log-viewer`: phase 1 · M
- **Purpose:** live tail, search, filters, download and correlation at `/_strutvane/logs`. **Laravel:** Pail + opcodesio/log-viewer *(c)*.
- **Install:** default in new apps; `node strut install:log-viewer`. **Adds:** config, the panel entry, the `viewLogs` gate (loopback-only in local).
- **EP:** X5. **Deps:** framework; prebuilt CSP-hashed assets. **Security:** redaction before storage; deny by default. **Repo:** rename `strutvane-logs` (C15).

### Phase 2: background work (0.3)

#### 7. `@strutvane/redis`: phase 2 · M
- **Purpose:** Redis/Valkey drivers for cache, locks, sessions, rate limits, broadcasting and a BullMQ queue. **Laravel:** Redis drivers in `illuminate/*`.
- **Install:** `node strut install:redis` (sets `CACHE_STORE`, `QUEUE_CONNECTION`, `REDIS_URL`; adds Valkey to the local compose file). **Adds:** `config/redis.ts`; no migrations.
- **EP:** X2, X6, F13 (a ping check). **Deps:** framework; `iovalkey` 0.4.0 or `ioredis` 6.0.0, `bullmq` 6.7.6.
- **Security:** TLS and auth from env; cache keys tenant-prefixed (F16).

#### 8. `@strutvane/queue-dashboard`: phase 2 · M
- **Purpose:** queue throughput, failures and retries, plus a **scheduled-tasks tab** (absorbs the requested scheduler UI). **Laravel:** Horizon; spatie/laravel-schedule-monitor 4.3.3 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:queue-dashboard`. **Adds:** `queue_metrics` migration, the `viewQueues` gate, panel pages Jobs / Failed / Schedules.
- **EP:** X3, X5, F13 (queue lag, missed schedule). **Deps:** framework.
- **Security:** payloads redacted; retry/purge audited.

### Phase 3: data and operations → 1.0

#### 9. `@strutvane/files`: phase 3 · M (narrowed, C7)
- **Purpose:** S3 and Azure disks, presigned and resumable uploads, ClamAV scan, MIME sniffing, quotas. **Why:** cloud storage without image processing; API-only apps need it too.
- **Laravel:** Flysystem S3/Azure adapters. **Install:** `node strut install:files --disk=s3|azure`.
- **Adds:** disks in `config/storage.ts`; env `AWS_*`/`AZURE_STORAGE_*`; an `uploads` table for resumable sessions; a quota section in settings (U6).
- **EP:** X2 (disk and scanner drivers, F11), F13 (bucket reachable), F18. **Deps:** framework; optional peers `@aws-sdk/client-s3` 3.1169.0 (Apache-2.0), `@azure/storage-blob` 12.34.0; `file-type` 22.3.0 (MIT) for sniffing.
- **Security:** tenant-prefixed keys; presigned URLs short-lived and content-type pinned; scan before the file becomes visible; never trust the client's MIME type. **Repo:** exists (`strutvane-files`, created 2026-11-14 [gh]).

#### 10. `@strutvane/search`: phase 3 · M
- **Purpose:** external engines (Meilisearch 0.63.0, Typesense 3.2.0) with queued indexing and hybrid vector search; the database engine stays in the framework. **Laravel:** Scout engines.
- **Install:** `node strut install:search --engine=meilisearch`. **Adds:** `config/search.ts`, `search:import`/`search:flush`, the engine in local compose.
- **EP:** X2, F3 (index settings from metadata), F5 (`searchable()`), F8, F13. **Deps:** framework; engine SDKs (optional peers).
- **Security:** a mandatory tenant filter that fails closed; secret and personal columns are never indexed.

#### 11. `@strutvane/import-export`: phase 3 · L
- **Purpose:** CSV/XLSX import with mapping, dry run and row-level errors; exports that apply read rules and current filters (absorbs data-grid exports). **Laravel:** maatwebsite/excel 4.0.6 *(c)*.
- **Install:** `node strut install:import-export`. **Adds:** `imports`/`exports` tables, Import/Export actions on every list (U3), a download centre page, a sidebar entry.
- **EP:** **F1** (each imported row goes through `ResourceService.create`, so validation, policy and tenancy are identical), F14, F15, F18, U3. **Deps:** framework; ui (opt.); CSV via `csv-parse` 7.0.3 (MIT); XLSX engine to be decided (`exceljs` 4.4.0 last changed 2024-12-20; `read-excel-file` 9.3.17 / `write-excel-file` 4.1.1, MIT; SheetJS `xlsx` on npm is 0.18.5 Apache-2.0) [npm 2026-11-14].
- **Security:** formula-safe output; zip-bomb and row caps; uploads scanned when `files` is installed.

#### 12. `@strutvane/inspector`: phase 3 · L
- **Purpose:** dev recorder for requests, queries (N+1), jobs, mail, cache, events and **policy decisions with the matched rule**. **Laravel:** Telescope.
- **Install:** `node strut install:inspector` (dev dependency; local only unless `--production`). **Adds:** storage (table or SQLite side file, open in [cat §9]), a panel entry.
- **EP:** X3, X5, F19. **Deps:** framework. **Security:** redaction before storage; never on by default in production.

#### 13. `@strutvane/observability`: phase 3 · L (health UI moved out, C8)
- **Purpose:** OTLP export plus a self-hosted metrics dashboard (slow requests, queries, jobs, error rates, per-tenant usage, **rate-limiter hits**). **Laravel:** Pulse (+ Nightwatch *(paid)*).
- **Install:** `node strut install:observability [--exporter=otlp]`. **Adds:** `metrics_aggregates`, `OTEL_*` env, panel pages.
- **EP:** X3, X5, F7, F13 (consumes checks for the SLO cards). **Deps:** framework; `@opentelemetry/sdk-node` 0.301.2 (Apache-2.0).
- **Security:** no request bodies; per-tenant numbers only to operators.

#### 14. `@strutvane/health`: phase 3 · S **(new)**
- **Purpose:** runs the framework's health checks on a schedule, keeps history, alerts on state changes, and exposes a token-protected JSON endpoint for uptime monitors.
- **Why:** "is production OK?" on day one, without OpenTelemetry. **Laravel:** spatie/laravel-health 1.41.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:health`. **Adds:** `config/health.ts` (checks, thresholds: disk space, DB, queue lag, cache, mail, certificate expiry, backup age, pending migrations); a `health_check_results` migration; panel page `/_strutvane/health`; a dashboard widget (U1); `health:check`, `health:list`; a schedule entry.
- **EP:** F13 (registry), X5, X3 (state-change events → framework notifications), F19 (retention), U1. **Deps:** framework; ui (opt.).
- **Security:** the JSON endpoint needs a secret token or loopback and returns only up/degraded/down plus check names, never connection strings.
- **Why a package:** it ships UI, a schedule and history. The registry and `/ready` stay in the framework.

#### 15. `@strutvane/agent-tools`: phase 3 · M
- **Purpose:** managed `AGENTS.md`/`CLAUDE.md` blocks, skills from every installed package, a local MCP dev server, offline docs search. **Laravel:** Boost.
- **Install:** offered at create; `node strut install:agent-tools` (dev). **Adds:** `.mcp.json` (git-ignored), `.ai/rules/`.
- **EP:** X8, X10, F2. **Deps:** framework; `@modelcontextprotocol/sdk` 1.32.2.
- **Security:** DB tool read-only, in a rolled-back transaction under the tenant session, redacted.

#### 16. `@strutvane/charts`: phase 3 · L **(new; pairs with `dashboards`, C6)**
- **Purpose:** chart and KPI widget types (line, bar, area, pie, donut, sparkline, KPI, time series) with light/dark theming, schema-driven suggestions and policy- and tenant-safe aggregate/metric endpoints (§3.1–3.2).
- **Why:** numbers on every admin screen, suggested from the schema with no hand-written queries. **Laravel:** filament/widgets v5.11.3 (Chart.js) *(c)*, consoletvs/charts 6.9.0 *(c)*, flowframe/laravel-trend v0.5.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:charts`.
- **Adds:**
  - `config/charts.ts` (cache TTL, point caps, palette);
  - owned `resources/ui/components/ui/chart.tsx` (a shadcn-style wrapper) and `app/metrics/` (custom metrics);
  - the route `/api/_charts/metrics/:name`;
  - `.strutvane/charts.suggestions.json`;
  - an optional "Insights" tab per list page;
  - widget types in U1;
  - commands `make:metric`, `charts:suggest`, `charts:cache:clear`.
  - No migrations.
- **EP:** F1, F2, F3, F7, F8, F9 (`Broadcaster`), F12, F15, F16, U1, U8, U9. **Deps:** framework; ui (opt.); `recharts` 3.10.1 (MIT) in the app (imported by the copied component).
- **Security:** the row predicate and tenant scope are applied before `GROUP BY`; only aggregatable, visible fields; relation labels need `view`; the cache key includes a policy fingerprint; group and point caps; cost-limited.

#### 17. `@strutvane/dashboards`: phase 3 (was 5) · M (v1 #24, kept)
- **Purpose:** dashboard pages: the home dashboard, role-specific dashboards, per-user layouts, global filters, and scheduled digest emails. It composes widgets from any package through U1, with built-in value, delta, table and text cards (§3.2a).
- **Why:** every admin home page needs a curated overview, and managers want it weekly in their inbox. **Laravel:** Nova dashboards *(paid)*, Filament dashboard pages (filament/filament v5.11.3) [packagist 2026-11-14].
- **Install:** `node strut install:dashboards`.
- **Adds:**
  - `config/dashboards.ts`;
  - migrations `dashboard_layouts`, `dashboard_digests`;
  - `app/dashboards/main.ts` (owned; seeded once from charts' suggestions when present);
  - routes `/api/_dashboards/:name`, with the page at `/`;
  - a "Dashboard" sidebar entry (first);
  - a "Digests" settings section (U6);
  - commands `make:dashboard`, `dashboards:send-digests` (scheduled).
- **EP:** F1, F7, F9 (`PdfRenderer` for PDF digests, `SettingsStore`), F12, F16, X3, X4, U1, U6, U9. **Deps:** framework; ui (opt.). It never imports `charts`; they meet in U1 (C6).
- **Security:** each dashboard has an ability; built-in cards follow the charts aggregation rules; digests re-run as the recipient at send time; unsubscribe links are signed (F18).
- **Merge note:** it could merge into `charts` if the split proves thin. Kept separate per the lead's decision.

### Phase 4: back-office essentials (1.x)

#### 18. `@strutvane/activity-log`: phase 4 · M **(new; C9)**
- **Purpose:** per-model change history (who changed what, before → after), a cross-resource activity feed, and an audit explorer over the framework's audit table.
- **Why:** "who changed this invoice?" is the first question in every B2B dispute. **Laravel:** spatie/laravel-activitylog 5.1.5, owen-it/laravel-auditing v14.0.7 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:activity-log [--models=all|Post,Invoice]`.
- **Adds:**
  - an `activity_log` migration (append-only; on PostgreSQL enforced by grants);
  - `logsActivity()` added to chosen models;
  - a **History** tab on detail pages (U2);
  - an "Activity" sidebar page (filters: actor, resource, event, date) and an operator-panel audit explorer;
  - `activity:prune`.
- **EP:** F5, F6, F8 (redacted diffs), F10, F19, X4, X5, U2. **Deps:** framework; ui (opt.).
- **Security:**
  - written in the same transaction as the change;
  - secret/hidden columns stored as `[redacted]`;
  - entries readable only if the actor may `view` the subject record (or holds the `viewAudit` ability);
  - tenant-scoped;
  - erasure pseudonymises the actor through the privacy hook (F10), and per-subject encryption keys are a candidate for crypto-shredding *(design open)*.
- **Why a package:** UI plus storage cost; opt-in per model.

#### 19. `@strutvane/settings`: phase 4 · M **(new)**
- **Purpose:** typed settings at three scopes (app, tenant, user) stored in the DB, with defaults from `config/`, encrypted fields and generated settings pages.
- **Why:** "let the tenant admin change the invoice prefix" without a deploy. **Laravel:** spatie/laravel-settings 3.10.2 *(c)*.
- **Install:** `node strut install:settings`.
- **Adds:**
  - a `settings` migration (`scope`, `scope_id`, `group`, `key`, JSON value, `encrypted`);
  - `app/settings/*.ts` (`defineSettings('billing', { scope: 'tenant', schema: z.object(…), defaults })`);
  - `/settings/*` sections generated from the schema (U6, U4);
  - `make:settings`, `settings:list`.
- **EP:** **binds F9 `SettingsStore`**; F16 (cached per tenant), F12, U4, U6, X4. **Deps:** framework; ui (opt.).
- **Security:** every group has an ability (`manageSettings:billing`); tenant scope stamped from context; encrypted values with `APP_KEY` rotation; changes audited; secrets never sent to the browser (write-only fields).
- **Why a package:** the framework's `config()` covers deploy-time values. Runtime-editable settings add a UI and a table. Other packages read `SettingsStore` if present and otherwise fall back to config.

#### 20. `@strutvane/media-library`: phase 4 · L **(new; split from files, C7)**
- **Purpose:** attach files to any record in named collections, with conversions (thumbnails, WebP/AVIF), responsive `srcset`, ordering, a media picker field and a media manager page (absorbs the requested file-manager UI).
- **Why:** "product images" and "contract PDFs on a customer" are in every back office. **Laravel:** spatie/laravel-medialibrary 11.23.13 *(c)* + its Filament plugin.
- **Install:** `node strut install:media-library`.
- **Adds:**
  - a `media` migration (polymorphic, tenant-scoped);
  - `hasMedia({ collections: { avatar: { single: true, accept: ['image/*'], conversions: { thumb: { w: 200 } } } } })`;
  - media/file widgets and cells (U4);
  - a "Media" detail tab (U2);
  - a Media manager sidebar page;
  - `media:regenerate`, `media:clean`.
- **EP:** F5, F6, F9 (binds `MediaUrlGenerator`), F10, F18, X2 (any disk: local, or S3/Azure if `files` is installed), X3 (queued conversions), U2, U4. **Deps:** framework; ui (opt.); `sharp` 0.35.5 (Apache-2.0, optional native peer).
- **Security:**
  - private by default (signed URLs, F18);
  - uploads validated by sniffed type and size;
  - SVG sanitised or rasterised;
  - EXIF stripped, including GPS;
  - pixel-count limits against decompression bombs;
  - conversions run in the queue with a timeout;
  - access follows the parent record's `view`.

#### 21. `@strutvane/tags`: phase 4 · S **(new)**
- **Purpose:** typed, tenant-scoped tags (with optional types such as "industry" or "priority") on any model, a tag input, a tag filter and tag cells.
- **Why:** the cheapest flexible categorisation users ask for. **Laravel:** spatie/laravel-tags 4.12.0 *(c)*.
- **Install:** `node strut install:tags`. **Adds:** `tags` + `taggables` migrations, `hasTags()`, a tag widget/filter/cell (U4), a "Tags" management page, `filter[tags][in]=` support on lists.
- **EP:** F5, F6, U4, X4. **Deps:** framework; ui (opt.).
- **Security:** tags are tenant-scoped; creating a new tag needs `createTags`; the tag list only shows tags used on rows the actor can see *(or all tenant tags; decide)*.

#### 22. `@strutvane/comments`: phase 4 · M **(new)**
- **Purpose:** threaded comments on any record, with @mentions, reactions, edit history, resolve/unresolve, and notifications to participants.
- **Why:** collaboration on records (deals, tickets, invoices) without leaving the app. **Laravel:** spatie/laravel-comments (Packagist shows only a 0.0.2 placeholder from 2021-12-20; the maintained product is sold separately *(unverified)*).
- **Install:** `node strut install:comments`. **Adds:** `comments`, `comment_reactions` migrations; `hasComments()`; a "Comments" detail tab (U2); mention notifications via framework notifications.
- **EP:** F5, F6, F10, F19, F20 (`t.richText()` sanitiser), X3, U2; uses `Broadcaster` (F9) for live threads when available. **Deps:** framework; ui (opt.).
- **Security:**
  - reading a thread needs `view` on the parent; commenting needs `comment` (default: same as `view`);
  - @mention autocomplete lists only users in the same tenant who can view the record (no directory enumeration);
  - HTML sanitised on write;
  - edits and deletes keep an audit trail.

#### 23. `@strutvane/pdf`: phase 4 · M **(new)**
- **Purpose:** render PDFs (invoices, statements, reports) from React components, through drivers.
- **Why:** every B2B app emails PDFs. **Laravel:** spatie/laravel-pdf 2.14.0, barryvdh/laravel-dompdf v3.1.2 *(c)*.
- **Install:** `node strut install:pdf [--driver=react-pdf|chromium]`.
- **Adds:** `config/pdf.ts`; `resources/pdf/*.tsx` templates; `make:pdf`; `Pdf.render(Template, data)`, `.download()`, `.store(disk)`; a "Download PDF" record action (U3) where a template is mapped.
- **EP:** **binds F9 `PdfRenderer`**, F11 (driver registry), X2, X3 (queued rendering), U3.
- **Deps:** framework; `@react-pdf/renderer` 4.9.0 (MIT, pure JS, no browser; the default); optional `playwright-core` 1.65.1 (Apache-2.0) for an HTML-fidelity Chromium driver [npm 2026-11-14].
- **Security:**
  - templates are code (no user-supplied templates; that is mail-templates' job, with a logic-less engine);
  - the Chromium driver runs with JavaScript off and network blocked except `data:` and the app's own asset origin (against SSRF through `<img src>`);
  - render timeouts and page caps.

#### 24. `@strutvane/privacy`: phase 4 · M **(new)**
- **Purpose:** GDPR/DPDP tooling:
  - a personal-data inventory generated from `.personal()` markers;
  - data-subject **export** (a zip of JSON per registered table);
  - **erasure** (delete or anonymise, with a grace period and legal-hold exceptions);
  - consent records;
  - a cookie-consent banner;
  - retention policies.
- **Why:** EU/India B2B customers ask for it in security questionnaires. **Laravel:** spatie/laravel-personal-data-export 4.3.3, spatie/laravel-cookie-consent 3.5.0 *(c)*.
- **Install:** `node strut install:privacy`.
- **Adds:**
  - `privacy_requests`, `consents` migrations;
  - "Download my data" / "Delete my account" in user settings (U6);
  - a "Privacy requests" admin page;
  - the consent banner (U6);
  - `privacy:inventory`, `privacy:export {user}`, `privacy:erase {user} --dry-run`;
  - a `schema.migrated` report of new personal columns without an eraser.
- **EP:** **F10**, F2, F3, F18 (one-time export links), F19, X3 (queued), U6. **Deps:** framework; ui (opt.).
- **Security:**
  - a request requires recent password confirmation;
  - exports are encrypted at rest, sent as one-time signed links and expire;
  - erasure runs in a transaction per table and is audited without storing the erased data;
  - `privacy:erase` refuses tables with no registered eraser (fail closed).

#### 25. `@strutvane/backup`: phase 4 (was 6, C10) · M
- **Purpose:** encrypted DB + disk backups, retention, `backup:restore --verify` drills, health check. **Laravel:** spatie/laravel-backup 10.4.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:backup`. **Adds:** config, a schedule entry, a panel page.
- **EP:** X2, X5, F13 (backup age), F19. **Deps:** framework; shells out to `pg_dump`/`mysqldump` when present.
- **Security:** encryption key separate from `APP_KEY`; restore only into a scratch DB unless `--force`.

#### 26. `@strutvane/api-explorer`: phase 4 · S **(new)**
- **Purpose:** an interactive OpenAPI explorer with try-it-out (session or token), code samples and a diff between API versions.
- **Why:** third-party integrators. The framework's `/docs` page is deliberately script-free (ADR-0019), which rules out try-it-out there. **Laravel:** dedoc/scramble v0.13.53, knuckleswtf/scribe 5.11.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:api-explorer`. **Adds:** `/docs/explorer` (or the operator panel), config for who may see it, the `api:diff v1 v2` command.
- **EP:** X9 (reads `/openapi.json`), F17, X5. **Deps:** framework; `@scalar/api-reference` 1.78.1 (MIT) or `redoc` 3.1.0 (MIT) as prebuilt, CSP-hashed assets; `swagger-ui-dist` 5.35.0 is Apache-2.0 [npm 2026-11-14].
- **Security:** off in production unless enabled; try-it-out uses the viewer's own credentials, same-origin only; no server-side proxy (SSRF).

### Phase 5: identity and integration

#### 27. `@strutvane/social-login`: phase 5 · M
- **Purpose:** OAuth/OIDC sign-in with major providers and safe account linking. **Laravel:** Socialite. **Install:** `node strut install:social-login --providers=google,github`.
- **Adds:** a `social_accounts` migration, `/auth/:provider/{redirect,callback}`, buttons on the auth pages, a "connected accounts" page.
- **EP:** X1, X11, U6. **Deps:** framework; engine spike (`arctic` 3.7.0 vs alternatives) [cat §4.15].
- **Security:** state + PKCE + nonce; link only on a verified email from a trusted provider; tokens encrypted.

#### 28. `@strutvane/sso`: phase 5 · XL
- **Purpose:** per-tenant OIDC/SAML, SCIM 2.0, JIT provisioning, verified domains, "enforce SSO". **Laravel:** WorkOS starter-kit variant. **Install:** `node strut install:sso`.
- **Adds:** `sso_connections`, `sso_domains`, `scim_tokens`; `/sso/:tenant/*`, `/scim/v2/*`; settings pages. **EP:** X11, U6, F18. **Deps:** framework; SAML library spike *(candidates unverified)*.
- **Security:** signed assertions only, replay cache, strict audience/recipient, SCIM tokens hashed.

#### 29. `@strutvane/oauth-server`: phase 5 · L
- **Purpose:** OAuth 2.1 provider (auth code + PKCE, client credentials, device, refresh). **Laravel:** Passport. **Install:** `node strut install:oauth-server`.
- **Adds:** `oauth_*` migrations, a consent page, a client-management page. **EP:** X1, X11, U6. **Deps:** framework; `oidc-provider` 9.15.0 or `@jmondi/oauth2-server` 5.0.0 (spike).
- **Security:** no password or implicit grants; scopes map to abilities.

#### 30. `@strutvane/mcp-server`: phase 5 · M
- **Purpose:** expose the app to AI agents as MCP tools, resources and prompts, optionally auto-exposing resources. **Laravel:** `laravel/mcp`. **Install:** `node strut install:mcp-server`.
- **Adds:** `routes/ai.ts`, `app/mcp/`, the audit category `agent`.
- **EP:** **F1** (auto tools call `ResourceService`, so policies and tenancy apply identically), F14, F15. **Deps:** framework; `@modelcontextprotocol/sdk` 1.32.2.
- **Security:** OAuth through the oauth-server capability or personal access tokens; every agent action audited with its client id.

#### 31. `@strutvane/feature-flags`: phase 5 · M
- **Purpose:** typed flags per user, tenant or plan; percentage rollouts; an operator UI; an OpenFeature bridge. **Laravel:** Pennant v1.27.0 [packagist 2026-11-14].
- **Install:** `node strut install:feature-flags`. **Adds:** a `features` migration, `make:feature`, a panel page.
- **EP:** binds `FeatureFlags` (F9), F16, X5. **Deps:** framework; optional `@openfeature/server-sdk` 1.23.0. **Security:** toggles audited.

#### 32. `@strutvane/webhooks`: phase 5 · M
- **Purpose:** Standard Webhooks-signed outgoing deliveries with retries, replay and a delivery log; incoming signature checks. **Laravel:** spatie/laravel-webhook-server 4.0.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:webhooks`. **Adds:** `webhook_endpoints`, `webhook_deliveries`, `webhook_receipts`; a tenant settings page; a panel page.
- **EP:** F8 (subscribe to model changes), X3, F19, U6. **Deps:** framework; optional `svix` 2.10.0.
- **Security:** SSRF guard on endpoint URLs (resolved IP checked on every delivery); payloads redacted by read rules; secret rotation.

#### 33. `@strutvane/graphql`: phase 5 · L **(new)**
- **Purpose:** a GraphQL API generated from models, policies and tenancy (§3.3).
- **Why:** frontend teams and integrators who prefer GraphQL get it without hand-writing a schema, under exactly the REST security. **Laravel:** nuwave/lighthouse v6.74.0 *(c)*, rebing/graphql-laravel 10.2.0 *(c)*, mll-lab/laravel-graphiql v4.1.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:graphql [--mode=first-party|public]`.
- **Adds:**
  - `config/graphql.ts` (mode, limits, introspection);
  - `.strutvane/graphql.gen.ts`, `.strutvane/schema.graphql`, `.strutvane/graphql.operations.json` (machine-owned, committed);
  - `app/graphql/` for owned extensions;
  - route `/graphql` (+ GraphiQL locally);
  - commands `make:graphql-type`, `make:graphql-mutation`, `graphql:schema`, `graphql:operations` (hashes the UI's operations), `graphql:diff`.
- **EP:** **F1**, F2, F3, F7, F14, F15, X11, X9 (a link from OpenAPI docs); `Broadcaster` (F9) for later subscriptions. **Deps:** framework; `graphql` 17.1.0, `graphql-yoga` 6.1.0, `@graphql-yoga/plugin-persisted-operations` 4.1.0 (MIT); `@pothos/core` 4.17.0 + plugins (ISC); `@escape.tech/graphql-armor` 3.2.0 (MIT) [npm 2026-11-14].
- **Security:** the §3.3 table (persisted-only, depth 8, cost 5,000, alias/token caps, no introspection in production, per-request loaders, deny-by-default custom resolvers).

### Phase 6: money, realtime and collaboration

#### 34. `@strutvane/billing`: phase 6 · XL
- **Purpose:** SaaS subscriptions where **the tenant is the billable**: trials, swaps, seats synced from team membership, entitlements, provider invoices and receipts, a portal. **Laravel:** Cashier v16.10.0 [packagist 2026-11-14].
- **Install:** `node strut install:billing --provider=stripe|paddle`. **Adds:** `subscriptions`, `subscription_items`, `billing_customers`; `/webhooks/billing/:provider`; a billing settings page; a "Billing" sidebar entry; an MRR metric for charts through U1.
- **EP:** F21, F9 (`FeatureFlags` for entitlements), X3, U1, U6. **Deps:** framework; `stripe` 23.1.0 (MIT) or `@paddle/paddle-node-sdk` 3.12.0 (Apache-2.0); Razorpay later.
- **Security:** hosted checkout only (never card data); idempotent webhook handling with signature checks.

#### 35. `@strutvane/invoicing`: phase 6 · L **(new; C12)**
- **Purpose:** issue invoices from the app to its own customers:
  - gap-free numbering per tenant and series (`INV-2026-0001`);
  - line items, tax rates, discounts, multi-currency (F21);
  - drafts → issued (immutable) → paid/void;
  - credit notes;
  - PDF through `PdfRenderer`;
  - email with the invoice attached.
- **Why:** ERPs, agencies and ops tools bill *their* customers. That has nothing to do with the app vendor's SaaS subscription. **Laravel:** elegantly/laravel-invoices v6.2.0 *(c)* [packagist 2026-11-14]; Cashier's invoices are provider-generated and cover only subscriptions.
- **Install:** `node strut install:invoicing`.
- **Adds:**
  - `invoices`, `invoice_lines`, `invoice_series`, `tax_rates`, `credit_notes` migrations;
  - owned `resources/pdf/invoice.tsx` (when pdf is installed);
  - Invoices/Credit notes pages and a sidebar entry;
  - Issue / Void / Send record actions (U3);
  - charts metrics (revenue, outstanding);
  - `invoicing:remind-overdue`.
- **EP:** F1, F9 (`PdfRenderer`, `PaymentLinkProvider` when payments is installed, `SettingsStore` for the seller profile), F18 (a public view link), F21, X3 (`invoice.issued`, `invoice.paid` events), U2, U3. **Deps:** framework; ui (opt.).
- **Security:**
  - numbers are allocated in a locked transaction (no gaps, no duplicates);
  - issued invoices are immutable, and corrections are credit notes;
  - public links are signed and read-only;
  - totals are recomputed server-side;
  - tax rules are configuration, never client input.
- **E-invoicing formats** (Peppol, GST e-invoice) are later drivers *(scope unverified)*.

#### 36. `@strutvane/realtime`: phase 6 · L
- **Purpose:** WebSocket server, private/presence channels authorised by policies, model broadcasting, a client subpath. **Laravel:** Reverb + Echo. **Install:** `node strut install:realtime`.
- **Adds:** `config/broadcasting.ts`, `routes/channels.ts`, a dev process. **EP:** binds `Broadcaster` (F9), X6, F8, U9. **Deps:** framework; `ws` 8.23.0.
- **Security:** tenant-scoped channel names by construction; payloads through the `Json` serializer with read rules.

#### 37. `@strutvane/notification-channels`: phase 6 · L
- **Purpose:** **SMS** (Twilio, Vonage, MSG91; absorbs the requested SMS package), Slack, Teams, web push, WhatsApp, plus a preference centre, quiet hours and digests. **Laravel:** laravel-notification-channels *(c)*; laravel/vonage-notification-channel v3.4.0 and laravel/slack-notification-channel v3.11.0 (first-party) [packagist 2026-11-14].
- **Install:** `node strut install:notification-channels --channels=sms,slack`. **Adds:** `notification_preferences`, `notification_deliveries`; a preferences page (U6).
- **EP:** X2, F10, F19, U6. **Deps:** framework; fetch-based drivers; `libphonenumber-js` 1.13.16 (MIT); web push needs VAPID (`web-push` 4.0.0 is **MPL-2.0** [npm 2026-11-14], so prefer a small in-house implementation or accept MPL for that optional driver).
- **Security:** phone numbers personal (F10); per-recipient rate limits against SMS pumping; verified numbers only.

#### 38. `@strutvane/resource-views`: phase 6 · M **(new)**
- **Purpose:**
  - a **Kanban board** for any resource with an enum column (columns = enum values; drag = `update` of that column, ordered by an optional `position` column);
  - a **calendar** (month, week, agenda) for any resource with date/datetime columns (drag = reschedule).
  Both are generated from metadata like the table view.
- **Why:** pipelines (deals, tickets, tasks) and schedules are the two most-requested non-table views in back offices. **Laravel:** relaticle/flowforge v4.3.5, saade/filament-fullcalendar v5.0.0, guava/calendar 3.2.2 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:resource-views`. **Adds:** `views: ['table', 'board', 'calendar']` in owned `*.ui.ts` files; a view switcher on lists (U5); suggestions on `schema.migrated` (enum → board; date → calendar).
- **EP:** F1 (moves are `ResourceService.update` with ETag), F2, F3, U5, U8, U9. **Deps:** framework; ui (opt.); `@dnd-kit/core` 6.3.1 (MIT; last change 2024-12-05, with `@dnd-kit/react` 0.5.3 the newer line); calendar: an in-house month/week grid or `@schedule-x/react` 4.1.0 (MIT). `@fullcalendar/*` 7.1.5 core is MIT, but its resource/timeline plugins are commercial *(unverified)* [npm 2026-11-14].
- **Security:** a drag that the policy denies snaps back with the problem message; columns or dates the user can't update aren't draggable; workflow state machines (#40), when present, restrict allowed moves.

#### 39. `@strutvane/mail-templates`: phase 6 · M **(new)**
- **Purpose:** DB-stored, per-tenant overridable versions of the app's transactional mails, edited in a block editor with live preview, versioning and test-send.
- **Why:** B2B customers want their own wording and branding on invitations and invoices, without a deploy. **Laravel:** spatie/laravel-database-mail-templates 3.7.2, spatie/laravel-mail-preview 6.2.3 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:mail-templates`. **Adds:** `mail_templates`, `mail_template_versions` migrations; a "Mail templates" settings page; `make:mail-template`, `mail-templates:sync`.
- **EP:** **binds F9 `MailTemplateResolver`** (the framework's mail core asks it first and falls back to the code template), F20, F16, U6, U9. **Deps:** framework; ui (opt.); `@tiptap/react` 3.34.0 (MIT) for the editor; renders through `@react-email/render` 2.3.1 (MIT) [npm 2026-11-14].
- **Security:**
  - **logic-less** placeholders only (`{{ invoice.number }}`) from a per-mailable allowlist; no expressions, no code (prevents template injection);
  - HTML sanitised (F20);
  - links limited to http(s);
  - test-send only to the editor's own verified address.

### Phase 7: content, AI and automation

#### 40. `@strutvane/ai`: phase 7 · L
- **Purpose:** provider-agnostic LLM calls, Zod-typed output, embeddings, agents whose tools are app actions checked by policies. **Laravel:** Laravel AI SDK. **Install:** `node strut install:ai --provider=…`.
- **Adds:** `config/ai.ts`, `make:agent`, `make:tool`. **EP:** F1 (tools call `ResourceService`), F15, X3. **Deps:** framework; `ai` 7.0.173 (Apache-2.0) or thin SDKs (spike).
- **Security:** PII redacted before prompts (F10 flags); tool calls audited.

#### 41. `@strutvane/workflows`: phase 7 · XL
- **Purpose:** durable workflows with approvals, timers and SLA alerts, **plus typed state machines on enum columns** (allowed transitions, guards, side effects). **Laravel:** none first-party; spatie/laravel-model-states 2.14.3 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:workflows`. **Adds:** `workflow_runs`, `workflow_steps`, `workflow_approvals`; an approvals inbox; `make:workflow`, `make:state-machine`; a "Workflow" detail tab (U2).
- **EP:** F1, F5, X3, U2. **Deps:** framework.
- **Security:** transitions are policy-checked; approvals audited; the illegal-transition list is enforced server-side and mirrored in boards.

#### 42. `@strutvane/translations`: phase 7 · L **(new; absorbs multi-language content)**
- **Purpose:**
  - (a) **DB-backed UI strings:** override and add translations at runtime, with an editor UI, missing-key capture in development, and XLIFF/JSON import/export;
  - (b) **translatable model content:** `t.translatable('title')` (a JSON column per locale), locale tabs on forms, locale fallback in queries and API output (`?locale=`).
- **Why:** global B2B tenants need both, and file catalogues need a deploy for every wording change. **Laravel:** spatie/laravel-translatable 6.15.0, spatie/laravel-translation-loader 2.8.3 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:translations --locales=en,de,hi`. **Adds:** a `translations` migration (`locale`, `group`, `key`, `value`, tenant override optional); a "Translations" page; a locale switcher in the header (U6); `translations:import`, `translations:export`, `translations:missing`.
- **EP:** **binds F9 `TranslationLoader`** (the framework's i18n asks the DB loader, then files), F4 (`translatable` column type), F2, F3 (lint when a translatable column is dropped), F16, U4, U6. **Deps:** framework; ui (opt.); ICU formatting stays the framework's.
- **Security:**
  - translation values are **text, never HTML** (rendered escaped; ICU arguments are typed);
  - editing needs `manageTranslations`;
  - tenant overrides are scoped;
  - search over translatable columns respects the locale and stays parameterised.

#### 43. `@strutvane/form-builder`: phase 7 · XL **(new)**
- **Purpose:**
  - (a) **Forms:** admins design forms (field types from the U4 registry, conditional logic, validation) and publish them internally or via public signed links, with submissions stored, exported and optionally turned into records;
  - (b) **Custom fields:** tenant admins add fields to generated resources, stored in a `custom_fields` JSON column validated against a stored schema, shown in forms, tables, filters and the API.
- **Why:** "every customer wants one more field" is the defining B2B request. Migrations are developer-owned, so tenant-defined fields need a runtime layer. **Laravel:** relaticle/custom-fields v4.0.0-beta.5 (**AGPL-3.0**) [packagist 2026-11-14]; no dominant MIT option *(unverified)*.
- **Install:** `node strut install:form-builder`. **Adds:**
  - `forms`, `form_versions`, `form_submissions`, `custom_field_definitions` migrations;
  - the `t.customFields()` column type (F4);
  - Forms/Submissions pages;
  - a "Custom fields" section in resource settings;
  - a public route `/f/:token`.
- **EP:** F1 (submissions → records via `ResourceService.create`), F2, F4, F18, F20, F9 (`HumanVerification` for public forms), U4. **Deps:** framework; ui (opt.).
- **Security:**
  - stored schemas compile to Zod on the server; client logic is never trusted;
  - custom field keys are a closed, validated set (no SQL identifiers from users: values live in JSON and are filtered through parameterised JSON-path functions per engine);
  - public forms are rate-limited, size-capped and bot-checked;
  - uploads go through media/files scanning;
  - personal fields can be marked for privacy (F10).

#### 44. `@strutvane/cms`: phase 7 · XL **(new; absorbs sitemap/SEO)**
- **Purpose:** public content for the app's marketing or help pages:
  - pages built from blocks (rich text, image, CTA, FAQ…), with drafts, scheduled publishing, revisions and preview links;
  - menus and redirects;
  - SEO meta, Open Graph and canonical URLs;
  - `sitemap.xml` (CMS pages + routes marked `public` with sitemap meta, F17) and `robots.txt`.
  Rendered server-side as HTML (no SPA), so crawlers and no-JS readers work.
- **Why:** many B2B apps need a help centre or landing pages next to the app. **Laravel:** Statamic v6.42.0 (**proprietary** licence on Packagist), z3d0x/filament-fabricator v4.1.0 *(c)*, spatie/laravel-sitemap 8.2.0 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:cms`. **Adds:** `pages`, `page_revisions`, `menus`, `redirects` migrations; Pages/Menus/Redirects admin pages; owned `resources/cms/blocks/*.tsx` and a layout; the routes `/{slug*}` (lowest priority), `/sitemap.xml`, `/robots.txt`; `cms:sitemap`.
- **EP:** F17, F20, F18 (preview links), F9 (`MediaUrlGenerator`, `TranslationLoader` for multilingual pages), U4, U9. **Deps:** framework; ui (opt.); `@tiptap/react` 3.34.0 (MIT) editor; `sitemap` 10.0.0 (MIT) [npm 2026-11-14].
- **Security:**
  - block content sanitised (F20);
  - a strict CSP on public pages (no inline scripts);
  - the catch-all never shadows app or API routes (registered last, reserved prefixes refused as slugs);
  - redirects only to relative paths or an allowlist (no open redirect);
  - drafts visible only with signed preview links.

#### 45. `@strutvane/browser-testing`: phase 7 · M
- **Purpose:** Playwright fixtures: a fresh DB per worker, `actingAs`, `inTenant`, page objects for generated screens, axe. **Laravel:** Dusk / Pest browser testing.
- **Install:** `node strut install:browser-testing` (dev). **Adds:** `tests/browser/`, `npm run test:browser`. **EP:** X6, F2 (page objects from metadata). **Deps:** framework; `@playwright/test` 1.65.1.
- **Security:** test-only credentials from seeders; never runs against non-local hosts by default.

### Phase 8: demand-driven

#### 46. `@strutvane/payments`: phase 8 · L **(new; C12)**
- **Purpose:** let the app's tenants collect one-off payments from **their** customers:
  - hosted checkout sessions;
  - payment links (for invoices or orders);
  - refunds;
  - payment status webhooks;
  - a payments ledger;
  - gateways Stripe, Razorpay (India) and PayPal *(SDK unverified)*.
- **Why:** distinct from billing (the payer is not the tenant) and from invoicing (no gateway needed). **Laravel:** Cashier single charges; league/omnipay v3.2.1 *(c; last release 2021-06-05)* [packagist 2026-11-14].
- **Install:** `node strut install:payments --gateway=stripe|razorpay`. **Adds:** `payments`, `refunds`, `payment_events` migrations; `/webhooks/payments/:gateway`; a Payments page; "Pay" links on invoices via `PaymentLinkProvider`.
- **EP:** binds `PaymentLinkProvider` (F9), F11 (gateway registry), F18, F21, X3. **Deps:** framework; `stripe` 23.1.0 (MIT), `razorpay` 2.9.8 (MIT) [npm 2026-11-14].
- **Security:**
  - **hosted checkout only**, so the app never sees card data (keeps PCI scope minimal);
  - amounts computed server-side;
  - webhook signatures verified and processed idempotently;
  - refunds need `refund` ability + re-confirmation and are audited;
  - per-tenant gateway credentials encrypted (via `SettingsStore` when present).
- **Note:** Strutvane code handles payments; agents operating apps must still never move money without the user's confirmation. That is a product-docs note, not package behaviour.

#### 47. `@strutvane/geo`: phase 8 · M **(new)**
- **Purpose:**
  - spatial columns `t.point()`/`t.geometry()` (PostGIS, MySQL spatial; SQLite bounding-box fallback, C14);
  - `whereWithinRadius`, `orderByDistance`;
  - geocoding drivers (Nominatim, Google, Mapbox via fetch);
  - a map-picker field and a **map view** for resources with a point column.
- **Why:** field service, logistics and real estate back offices. **Laravel:** clickbar/laravel-magellan 2.3.0, matanyadaev/laravel-eloquent-spatial 4.8.0, dotswan/filament-map-picker v2.3.3 *(c)* [packagist 2026-11-14].
- **Install:** `node strut install:geo [--geocoder=nominatim]`. **Adds:** column types, a map widget/cell (U4), a map view mode (U5), `geo:geocode {resource}`.
- **EP:** F4, F5, F11 (geocoder), U4, U5, U9. **Deps:** framework; ui (opt.); `maplibre-gl` 6.18.0 (BSD-3-Clause) or `leaflet` 1.9.4 (BSD-2-Clause) [npm 2026-11-14]. **Avoid `react-leaflet` 5.0.0: its licence is Hippocratic-2.1, which isn't OSI-approved** [npm 2026-11-14]; write a thin wrapper instead.
- **Security:** locations are often personal data (F10); geocoder calls are server-side only, with the key never sent to the browser; tile provider terms vary *(unverified)*.

---

## 5. Build plan

### 5.1 Phases

| Phase | Packages | New/changed size *(estimate)* | Unlocks |
|---|---|---|---|
| **0 Consolidate** | none (framework absorbs core, contracts, cli, devkit, logs pipeline) | ~2k glue; 2–3 weeks [cat §7] | One framework, all tests green |
| **1 The full flow → 0.2** | framework, auth, ui, create-strutvane, strutvane, log-viewer (+ skeleton, docs) | ~15–20k on ~45k moved; 12–16 weeks [cat §7] | The blueprint's flow. **Ship F1, F2, F3 here**, since phase 3 depends on them |
| **2 Background → 0.3** | framework (queue, mail, notifications, scheduler, cache, events, HTTP client; F7, F8, F13, F14, F16, F19), ui (notification bell), redis, queue-dashboard | ~10k + ~2k for the F-points; 7–9 weeks | Real mail, jobs, the inbox, ops visibility |
| **3 Data and ops → 1.0** | files, search, import-export, inspector, observability, **health**, agent-tools, **charts**, dashboards | ~18k + hardening; 16–20 weeks | Production-ready: uploads, search, spreadsheets, metrics, health, **dashboards on the home page**. **1.0** |
| **4 Back-office essentials (1.x)** | **activity-log, settings, media-library, tags, comments, pdf, privacy**, backup, **api-explorer** (+ framework F5, F6, F9, F10, F18, F20) | ~15k; 12–14 weeks | The "Spatie layer": history, settings, attachments, PDFs, GDPR, backups |
| **5 Identity and integration** | social-login, sso, oauth-server, mcp-server, feature-flags, webhooks, **graphql** (+ F15) | ~15k; 10–13 weeks | Enterprise SSO/SCIM, agents, flags, webhooks, GraphQL |
| **6 Money, realtime, collaboration** | billing, **invoicing**, realtime, notification-channels, **resource-views**, **mail-templates** (+ F11, F21) | ~16k; 12–14 weeks | SaaS revenue, issuing invoices, live UIs, multi-channel notifications, boards and calendars |
| **7 Content, AI, automation** | ai, workflows, **translations**, **form-builder**, **cms**, browser-testing (+ F4, F17) | ~22k; 16–20 weeks | AI under policies, approvals and state machines, multilingual content, custom fields, public pages |
| **8 Demand-driven** | **payments**, **geo** | ~6k; 5–6 weeks | Collecting payments, maps |

**Order notes:**
- **Charts and dashboards are in phase 3** (dashboards was phase 5 in v1). The brief asked for charts; both depend only on F1/F2/F3/F7 (all in by phase 2); and the dashboard is the first screen a 1.0 user sees. Build charts first, then dashboards, which seeds its home page from the charts suggestions.
- **GraphQL is in phase 5:** it needs F1 frozen at 1.0, F14 and F15, and its demand is lower than REST's. Promote it if a design partner asks.
- **Phase 4 before identity** (C10): activity log, settings and attachments are asked for in the first week of a real back office. SSO is asked for at the first enterprise sale.
- Within a phase, packages are independent (they only touch the framework), so they can run in parallel. The constraint is the **framework F-points**, which must land a release earlier (listed in the table).
- Never offer a package in the installer before it is published [cat §7].

### 5.2 Sizes per package *(estimates; S/M/L/XL as in §4)*

| Size | Packages |
|---|---|
| S | strutvane (guard), health, tags, api-explorer |
| M | log-viewer, redis, queue-dashboard, files, search, agent-tools, dashboards, activity-log, settings, comments, pdf, privacy, backup, social-login, mcp-server, feature-flags, webhooks, resource-views, mail-templates, browser-testing, geo |
| L | auth, create-strutvane, import-export, inspector, observability, charts, media-library, oauth-server, graphql, invoicing, realtime, notification-channels, ai, translations, payments |
| XL | framework, ui, sso, billing, workflows, form-builder, cms |

### 5.3 Order of repo creation in `vishwajit-vm`

**Rules:**
- Create a repo only when its phase starts.
- Reserve the npm name first (an owner action, as with today's names).
- Repo name = `strutvane-<package-name>`, except `create-strutvane`.
- Scaffold with the hub's `new-package-repo` skill and the synced tooling (C4).
- Per CLAUDE.md, the owner approves every repo creation, rename and archive.

| Step | When | Repos |
|---|---|---|
| Exists today [gh 2026-11-14] | — | `strutvane` (hub), `strutvane-framework`, `strutvane-auth`, `strutvane-ui`, `create-strutvane`, `strutvane-docs`, `strutvane-files`, `strutvane-logs`, `strutvane-tooling`, `strutvane-core`, `strutvane-contracts`, `strutvane-cli`, `strutvane-devkit`, `.github` |
| 1 | Phase 0 | **create `strutvane-skeleton`**; rename `strutvane-logs` → `strutvane-log-viewer` (C15); decide the `strutvane` guard's home (C3) |
| 2 | End of phase 0 (after code moves) | archive (read-only) `strutvane-core`, `strutvane-contracts`, `strutvane-devkit`, and `strutvane-cli` unless re-purposed for the guard |
| 3 | Phase 2 | `strutvane-redis`, `strutvane-queue-dashboard` |
| 4 | Phase 3 | `strutvane-charts` (first, since the brief asked for it and it exercises F1/F2/F7 earliest), `strutvane-dashboards`, `strutvane-health`, `strutvane-search`, `strutvane-import-export`, `strutvane-inspector`, `strutvane-observability`, `strutvane-agent-tools` (`strutvane-files` already exists) |
| 5 | Phase 4 | `strutvane-activity-log`, `strutvane-settings`, `strutvane-media-library`, `strutvane-pdf`, `strutvane-privacy`, `strutvane-backup`, `strutvane-tags`, `strutvane-comments`, `strutvane-api-explorer` |
| 6 | Phase 5 | `strutvane-feature-flags`, `strutvane-webhooks`, `strutvane-social-login`, `strutvane-oauth-server`, `strutvane-mcp-server`, `strutvane-graphql`, `strutvane-sso` |
| 7 | Phase 6 | `strutvane-billing`, `strutvane-invoicing`, `strutvane-notification-channels`, `strutvane-realtime`, `strutvane-resource-views`, `strutvane-mail-templates` |
| 8 | Phase 7 | `strutvane-workflows`, `strutvane-translations`, `strutvane-ai`, `strutvane-form-builder`, `strutvane-cms`, `strutvane-browser-testing` |
| 9 | Phase 8 | `strutvane-payments`, `strutvane-geo` |

Every proposed `@strutvane/<name>` in this document returned 404 on npm on 2026-11-14. The scope belongs to the project, so only an org member can publish; reserve each name when its repo is created.

---

## 6. Open questions for the project lead

1. **C3:** ship the unscoped `strutvane` guard or not, and in which repo?
2. **C5:** allow add-ons an optional peer on `@strutvane/ui` for their `/ui` subpath (proposed), or keep v1's "framework only" with installer-copied UI files?
3. **Charts in phase 3 (→1.0)** and **graphql in phase 5**: agree, or should GraphQL be earlier?
4. **GraphQL default mode:** `first-party` (persisted operations only) as proposed, or `public`?
5. **Payments split** (C12): keep `payments` as a separate, demand-driven package, or fold "payment links for invoices" into `invoicing`?
6. **Tenant custom domains / subdomains** (B2B SaaS white-labelling): a later package, part of `sso` (domain verification), or framework tenancy?
7. **Tag visibility:** may a user see every tenant tag, or only tags on rows they can see?
8. **Activity-log erasure:** crypto-shredding (per-subject keys) or actor pseudonymisation only?

---

## Sources

**npm registry** (`npm view <pkg> version license time.modified`, npm 11.19.0, 2026-11-14):
- Charts: recharts 3.10.1 (MIT, mod. 2026-11-03); chart.js 4.6.1 (MIT, 2026-10-22); react-chartjs-2 5.3.1 (MIT); echarts 6.1.0 (Apache-2.0, 2026-05-19); echarts-for-react 3.0.6 (MIT); @visx/xychart 4.0.0 (MIT, 2026-06-11); @nivo/core and @nivo/line 0.99.0 (MIT, 2025-05-23); uplot 1.6.32 (MIT, 2025-03-14). Peer ranges from `npm view <pkg> peerDependencies`.
- GraphQL: graphql 17.1.0 (MIT); graphql-yoga 6.1.0 (MIT); @envelop/core 6.0.1; @graphql-yoga/plugin-persisted-operations 4.1.0 (MIT); @graphql-yoga/plugin-response-cache 4.1.0; @pothos/core 4.17.0 (ISC) and plugin-scope-auth 4.3.0, plugin-dataloader 4.5.0, plugin-relay 4.8.2, plugin-complexity 4.2.3, plugin-validation 4.3.5, plugin-zod 4.3.2 (ISC); @escape.tech/graphql-armor 3.2.0 (MIT), -max-depth 2.4.2, -cost-limit 2.4.3; graphql-query-complexity 2.0.0 (MIT); graphql-depth-limit 1.1.0 (MIT, 2022); graphiql 6.0.1 (MIT); graphql-ws 6.4.2; dataloader 2.2.3; @graphql-codegen/cli 8.0.0.
- Other: @react-pdf/renderer 4.9.0 (MIT); pdfkit 0.20.2 (MIT); pdf-lib 1.17.1 (MIT, 2022); puppeteer 25.17.0 and playwright-core 1.65.1 (Apache-2.0); @react-email/components 1.0.12, @react-email/render 2.3.1 (MIT); mjml 5.4.1 (MIT); grapesjs 0.23.9 (BSD-3-Clause); @tiptap/core and @tiptap/react 3.34.0 (MIT); lexical 0.53.0 (MIT); leaflet 1.9.4 (BSD-2-Clause); react-leaflet 5.0.0 (Hippocratic-2.1); maplibre-gl 6.18.0 (BSD-3-Clause); @turf/turf 7.4.0 (MIT); h3-js 4.5.0 (Apache-2.0); @fullcalendar/core and /react 7.1.5 (MIT); @schedule-x/react 4.1.0 (MIT); react-big-calendar 1.20.0 (MIT); @dnd-kit/core 6.3.1 (MIT, 2024-12-05); @dnd-kit/react 0.5.3 (MIT); @hello-pangea/dnd 18.0.1 (Apache-2.0); twilio 6.3.0 (MIT); libphonenumber-js 1.13.16 (MIT); web-push 4.0.0 (MPL-2.0); sanitize-html 2.18.2 (MIT); isomorphic-dompurify 4.7.0 (MIT); dompurify 3.4.18 (MPL-2.0 OR Apache-2.0); @rjsf/core 6.11.1 (Apache-2.0); i18next 27.1.1 (MIT); @formatjs/intl 6.1.5 (MIT); sitemap 10.0.0 (MIT); file-type 22.3.0 (MIT); @scalar/api-reference 1.78.1 (MIT); redoc 3.1.0 (MIT); swagger-ui-dist 5.35.0 (Apache-2.0); @stoplight/elements 9.0.29 (Apache-2.0); croner 11.0.0 (MIT); csv-parse 7.0.3 (MIT); papaparse 5.7.1 (MIT); exceljs 4.4.0 (MIT, 2024-12-20); xlsx 0.18.5 (Apache-2.0); read-excel-file 9.3.17, write-excel-file 4.1.1 (MIT); sharp 0.35.5 (Apache-2.0); @aws-sdk/client-s3 3.1169.0 (Apache-2.0); stripe 23.1.0 (MIT); razorpay 2.9.8 (MIT); @paddle/paddle-node-sdk 3.12.0 (Apache-2.0); jose 6.2.17 (MIT).
- `@strutvane/{charts, graphql, activity-log, media-library, settings, translations, pdf, mail-templates, comments, tags, health, api-explorer, resource-views, form-builder, geo, payments, invoicing, cms, privacy, dashboards, files, log-viewer}`: all 404 (unpublished).

**Bundle sizes:** bundlephobia.com `/api/size`, fetched 2026-11-14 (min+gzip, whole entry point): recharts@3.10.1 149,877 B; chart.js@4.6.1 69,624 B; echarts@6.1.0 367,958 B; @visx/xychart@4.0.0 50,282 B; @nivo/line@0.99.0 95,956 B; uplot@1.6.32 21,856 B.

**Packagist** (`repo.packagist.org/p2/<pkg>.json`, 2026-11-14; first listed version and its time):
- nuwave/lighthouse v6.74.0; rebing/graphql-laravel 10.2.0; mll-lab/laravel-graphiql v4.1.0
- spatie/laravel-activitylog 5.1.5; owen-it/laravel-auditing v14.0.7; spatie/laravel-medialibrary 11.23.13; spatie/laravel-settings 3.10.2; spatie/laravel-translatable 6.15.0; spatie/laravel-translation-loader 2.8.3; spatie/laravel-tags 4.12.0; spatie/laravel-health 1.41.0; spatie/laravel-schedule-monitor 4.3.3; spatie/laravel-sitemap 8.2.0; spatie/laravel-pdf 2.14.0; barryvdh/laravel-dompdf v3.1.2; spatie/laravel-comments 0.0.2 (2021-12-20); spatie/laravel-personal-data-export 4.3.3; spatie/laravel-cookie-consent 3.5.0; spatie/laravel-database-mail-templates 3.7.2; spatie/laravel-mail-preview 6.2.3; spatie/laravel-backup 10.4.0; spatie/laravel-webhook-server 4.0.0; spatie/laravel-model-states 2.14.3; lab404/laravel-impersonate 1.7.8
- consoletvs/charts 6.9.0; filament/widgets v5.11.3; filament/filament v5.11.3; flowframe/laravel-trend v0.5.0; laravel/cashier v16.10.0; laravel/pennant v1.27.0; laravel/vonage-notification-channel v3.4.0; laravel/slack-notification-channel v3.11.0; maatwebsite/excel 4.0.6
- dedoc/scramble v0.13.53; knuckleswtf/scribe 5.11.0; statamic/cms v6.42.0 (proprietary); z3d0x/filament-fabricator v4.1.0; league/omnipay v3.2.1 (2021-06-05); elegantly/laravel-invoices v6.2.0; relaticle/custom-fields v4.0.0-beta.5 (AGPL-3.0)
- relaticle/flowforge v4.3.5; saade/filament-fullcalendar v5.0.0; guava/calendar 3.2.2; clickbar/laravel-magellan 2.3.0; matanyadaev/laravel-eloquent-spatial 4.8.0; dotswan/filament-map-picker v2.3.3
- `laravel/nova` and `spatie/laravel-tenancy`: not on public Packagist.

**Web pages** (read 2026-11-14):
- [shadcn/ui Chart](https://ui.shadcn.com/docs/components/chart): "We use Recharts under the hood", now on Recharts v3.
- [Filament 5.x chart widgets](https://filamentphp.com/docs/5.x/widgets/charts.md): Filament renders charts with Chart.js.
- [GraphQL Yoga: persisted operations](https://the-guild.dev/graphql/yoga-server/docs/features/persisted-operations): `PersistedQueryOnly` error and the `allowArbitraryOperations` option.
- [Lighthouse: resource exhaustion](https://lighthouse-php.com/master/security/resource-exhaustion.html): limits live in `config/lighthouse.php` and defer to webonyx/graphql-php; the defaults were not shown.

**GitHub:** `gh repo list vishwajit-vm`, 2026-11-14 (14 Strutvane repos plus `.github`; `strutvane-skeleton` doesn't exist yet).

**Strutvane internal:** the input documents listed at the top.
