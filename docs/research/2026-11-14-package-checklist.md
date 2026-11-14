# Strutvane first-party package checklist (master list)

- **Date:** 2026-11-14
- **Source:** [`2026-11-14-package-catalogue-v2.md`](2026-11-14-package-catalogue-v2.md). That document holds each package's design card, the phase plan and the order repos are created in.
- **Decision (project lead, 2026-11-14):** every package below will be developed. None is dropped.
- **How to use:** tick a box when the package ships its first release (`0.x` on npm, docs page live). Change the status as the work moves: `planned` → `in progress` → `released`.
- **Repo:** `vishwajit-vm/strutvane-<name>`, except `create-strutvane` and the unscoped `strutvane`, whose repo is still to be decided (catalogue v2, C3).

## Repositories without an npm package

- [ ] `strutvane-skeleton`: the app template the installer copies (like `laravel/laravel`), phase 0, status: planned
- [ ] `strutvane-docs`: versioned docs site (exists), phase 1, status: planned
- [ ] `strutvane-tooling`: shared configs and CI sync (exists), phase 0, status: planned
- [ ] `strutvane` (hub): blueprint, ADRs, RFCs, spikes (exists), ongoing, status: planned

## Packages (47)

### Phase 1: the full flow (0.2)
- [ ] 1. `@strutvane/framework`: kernel, HTTP, ORM, migrations, auth primitives, tenancy, background work, console, testing, phase 1, status: planned
- [ ] 2. `@strutvane/auth`: login, registration, reset, verification, 2FA, passkeys, tokens, teams, impersonation, phase 1, status: planned
- [ ] 3. `@strutvane/ui`: React kit, auto CRUD admin, sidebar, app shell and notification bell, phase 1, status: planned
- [ ] 4. `create-strutvane`: `npm create strutvane@latest` installer, phase 1, status: planned
- [ ] 5. `strutvane` (unscoped): safe `npx strutvane` guard outside a project, phase 1, status: planned
- [ ] 6. `@strutvane/log-viewer`: live tail, search and download of logs, phase 1, status: planned

### Phase 2: background work (0.3)
- [ ] 7. `@strutvane/redis`: Redis/Valkey drivers for cache, queue, locks, sessions, rate limits, broadcasting, phase 2, status: planned
- [ ] 8. `@strutvane/queue-dashboard`: jobs, failures, retries and scheduled tasks, phase 2, status: planned

### Phase 3: data and operations → 1.0
- [ ] 9. `@strutvane/files`: S3/Azure disks, presigned and resumable uploads, virus scan, quotas, phase 3, status: planned
- [ ] 10. `@strutvane/search`: Meilisearch/Typesense engines and hybrid vector search, phase 3, status: planned
- [ ] 11. `@strutvane/import-export`: CSV/XLSX import with mapping and dry run; policy-aware exports, phase 3, status: planned
- [ ] 12. `@strutvane/inspector`: dev recorder for requests, queries, jobs, mail and policy decisions, phase 3, status: planned
- [ ] 13. `@strutvane/observability`: OpenTelemetry export and a self-hosted metrics dashboard, phase 3, status: planned
- [ ] 14. `@strutvane/health`: scheduled health checks, history, alerts and an uptime endpoint, phase 3, status: planned
- [ ] 15. `@strutvane/agent-tools`: AGENTS.md, skills, local MCP dev server, offline docs search, phase 3, status: planned
- [ ] 16. `@strutvane/charts`: chart and KPI widgets suggested from the schema, with policy- and tenant-safe aggregates, phase 3, status: planned
- [ ] 17. `@strutvane/dashboards`: dashboard pages, per-user layouts, filters and scheduled digests, phase 3, status: planned

### Phase 4: back-office essentials (1.x)
- [ ] 18. `@strutvane/activity-log`: per-record change history, activity feed, audit explorer, phase 4, status: planned
- [ ] 19. `@strutvane/settings`: typed, DB-backed app/tenant/user settings with generated pages, phase 4, status: planned
- [ ] 20. `@strutvane/media-library`: attachments, conversions, responsive images, media manager, phase 4, status: planned
- [ ] 21. `@strutvane/tags`: tenant-scoped typed tags on any model, phase 4, status: planned
- [ ] 22. `@strutvane/comments`: threaded comments, mentions and reactions on any record, phase 4, status: planned
- [ ] 23. `@strutvane/pdf`: PDFs (invoices, reports) from React templates, phase 4, status: planned
- [ ] 24. `@strutvane/privacy`: GDPR data export, erasure, consent and retention, phase 4, status: planned
- [ ] 25. `@strutvane/backup`: encrypted DB and storage backups with restore drills, phase 4, status: planned
- [ ] 26. `@strutvane/api-explorer`: interactive OpenAPI explorer with try-it-out, phase 4, status: planned

### Phase 5: identity and integration
- [ ] 27. `@strutvane/social-login`: sign in with Google, Microsoft, GitHub, Apple, phase 5, status: planned
- [ ] 28. `@strutvane/sso`: per-tenant OIDC/SAML SSO, SCIM, domain verification, phase 5, status: planned
- [ ] 29. `@strutvane/oauth-server`: OAuth 2.1 provider, phase 5, status: planned
- [ ] 30. `@strutvane/mcp-server`: expose the app to AI agents under its policies, phase 5, status: planned
- [ ] 31. `@strutvane/feature-flags`: typed flags per user, tenant or plan, phase 5, status: planned
- [ ] 32. `@strutvane/webhooks`: signed outgoing webhooks with retries; incoming verification, phase 5, status: planned
- [ ] 33. `@strutvane/graphql`: GraphQL API generated from models, policies and tenancy, phase 5, status: planned

### Phase 6: money, realtime and collaboration
- [ ] 34. `@strutvane/billing`: SaaS subscriptions, seats and entitlements per tenant, phase 6, status: planned
- [ ] 35. `@strutvane/invoicing`: issue invoices with numbering, tax, credit notes and PDFs, phase 6, status: planned
- [ ] 36. `@strutvane/realtime`: WebSocket server, channels and live tables, phase 6, status: planned
- [ ] 37. `@strutvane/notification-channels`: SMS, Slack, Teams, web push, WhatsApp and a preference centre, phase 6, status: planned
- [ ] 38. `@strutvane/resource-views`: Kanban board and calendar views over any resource, phase 6, status: planned
- [ ] 39. `@strutvane/mail-templates`: editable, per-tenant transactional mail templates, phase 6, status: planned

### Phase 7: content, AI and automation
- [ ] 40. `@strutvane/ai`: LLM calls, structured output, embeddings, policy-bound agent tools, phase 7, status: planned
- [ ] 41. `@strutvane/workflows`: durable workflows, approvals, timers and state machines, phase 7, status: planned
- [ ] 42. `@strutvane/translations`: DB-backed UI strings and translatable model content, phase 7, status: planned
- [ ] 43. `@strutvane/form-builder`: admin-designed forms and tenant custom fields, phase 7, status: planned
- [ ] 44. `@strutvane/cms`: pages, blocks, menus, redirects, SEO and sitemap, phase 7, status: planned
- [ ] 45. `@strutvane/browser-testing`: Playwright fixtures for the real UI, phase 7, status: planned

### Phase 8: demand-driven
- [ ] 46. `@strutvane/payments`: collect one-off payments for the app's own customers through hosted checkout, phase 8, status: planned
- [ ] 47. `@strutvane/geo`: spatial columns, distance queries, geocoding and map views, phase 8, status: planned
