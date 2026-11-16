# 21. Delivery plan: what gets built, in what order, and when

- **As of:** 2026-11-16 (the live status dashboard in §0 is updated at every milestone)
- **Owner:** project lead (decisions) · coordinator (planning, verification, merges)
- **How to read this:**
  - §1 is the one-page overview.
  - §2 explains how the work is planned and checked.
  - §3 gives the release roadmap.
  - §4 goes package by package, with hours.
  - §5 is the exact order of the next steps.
  - §6 has the timeline in hours, days, weeks and months.
  - §7 covers risks.
  - §8 lists open decisions.
- **Estimates:**
  - Hours are **agent-hours**: the time AI agents spend building, testing, auditing, documenting and having the coordinator verify a package. They are honest estimates with about **±30% uncertainty**.
  - Calendar dates depend mainly on usage limits (§6), not on how fast the work itself goes.

---

## 0. Live status dashboard (updated 2026-11-16, evening — work paused)

This section is updated at every milestone and before every stop, together with the PDF copy. Every number comes from `STATE.md` and was checked by the coordinator.

> **⏸ Paused on 2026-11-16 (evening)** at the project lead's request. Everything is committed. Pushed to GitHub except framework `v2/app-core` and the hub's pause commit, which wait for the personal GitHub account (see `STATE.md`). **Resume: ~21–22 Nov 2026.** At resume: read `STATE.md`, run `node scripts/state-check.mjs`, then continue with §0.3 (each framework branch has a `NEXT.md` saying exactly where it stopped).

**Definitions:**
- **Built:** the code is written.
- **Tested:** the full gate passes 3× in a row, re-run by the coordinator.
- **Pushed:** the work is on GitHub.
- **Merged:** it's on `main`.
- **Released:** it's on npm.
- **Docs:** the docs site describes it.
- **100% done** means all six are ✅.

### 0.1 Overall progress
| Measure | Value |
|---|---|
| Release 0.2 (full flow) | **~45% done**: ~38 of ~84 planned agent-hours completed; ~46 hours left |
| Whole ecosystem (47 packages + 2 designs) | **~7% done** of ~546 agent-hours |
| Released on npm so far | **0%**: npm unlocks 2026-11-17 08:35 UTC, and the framework 0.1.0-next.1 release is staged first |
| Time spent so far | **~4 days** (13–16 Nov 2026), about 100–130 agent-hours *(estimate)* |
| Time left to 0.2 | **~9 working days** after the resume (~5 agent-hours/day); **~12** with buffer |
| Test cases passing in finished packages | ~3,600 (framework 1,466 · auth 819 + 63 integration · ui 488 · installer 473 · logs 573 · Crisp 105 · Vivid 233 · tooling 129); plus 2,205 on the framework data-layer branch *(agent-reported, WIP)* |

### 0.2 ✅ Done list
| Item | Built | Tested | Pushed | Merged | Released | Docs | Done |
|---|---|---|---|---|---|---|---|
| Tooling: npm CI and the R1–R9 production checks | ✅ | ✅ 129 | ✅ | ✅ | n/a | ✅ | **100%** |
| Docs site v2 (live, 522 pages) | ✅ | ✅ 0 broken links | ✅ | ✅ | ✅ live | ✅ | **100%** |
| Old repos archived (core, contracts, cli, devkit) | ✅ | n/a | ✅ | ✅ | npm deprecation after 0.2 | ✅ | 90% |
| Framework v2 (consolidation, 4 audits, fix pass) | ✅ | ✅ 1,466 | ✅ | ✅ | ⏳ npm unlock | ✅ | 85% |
| auth v2 (native engine) | ✅ | ⚠️ agent-reported 819 + 63 | ✅ | ⏳ after framework publish | ⏳ | ⏳ | 65% |
| ui v2 (behaviour + design contract) | ✅ | ✅ 488 | ✅ | ⏳ | ⏳ | ⏳ | 65% |
| create-strutvane v2 (installer) | ✅ | ⚠️ agent-reported 473 | ✅ | ⏳ | ⏳ | ✅ | 65% |
| design-crisp (default) | ✅ | ✅ 105 | ✅ new repo | ✅ | ⏳ | ⏳ | 70% |
| design-vivid | ✅ | ✅ 233 | ✅ new repo | ✅ | ⏳ | ⏳ | 70% |
| logging channels (`v2/channels`) | ✅ | ✅ 573 | ✅ | ⏳ fold into framework | ⏳ | ✅ | 60% |
| Prototypes 10–21 (schema, ORM, MVC, installer, UI, charts, designs, auth, catalogue) | ✅ | ✅ | ✅ | ✅ (hub) | n/a | n/a | **100%** (as prototypes) |
| Plans and decisions (docs 18–21, ADRs to 0023, decisions #1–129, STATE.md, state-check) | ✅ | ✅ | ✅ | ✅ | n/a | ✅ | **100%** |

### 0.3 🔄 Working on now (⏸ paused)
| Item | Progress | Hours left | Where it stopped |
|---|---|---|---|
| Framework database layer (ORM, migrations, sandbox) on `v2/data-layer` | ~60% | ~6 | built; one full gate green *(agent-reported)*; **2 critical + 2 high security findings to fix first**; then gate 3×, generated CRUD API |
| Framework app core (MVC, commands, security kit, facades) on `v2/app-core` | ~45% | ~7 | built; targeted tests green; command tests, lowercase codes, exports, CLI wiring and the full gate still to do |
| Merge both into framework `main` → 0.2.0-next.0 | 0% | ~1 | expect one conflict in `make:migration` |

### 0.4 ⏭ Next (after the current work)
| Order | Item | Hours |
|---|---|---|
| 1 | npm unlock: stage framework 0.1.0-next.1, refresh lockfiles, apply the release patches | 2 |
| 2 | Logging folded into the framework, then log-viewer | 8 |
| 3 | Package installers (`node strut install:<x>`) | 8 |
| 4 | strutvane-skeleton, catalogue CI, npx guard | 8 |
| 5 | Security reviews (R3) and soak tests (R4) for auth, ui and the installer | 6 |
| 6 | Demo app end to end, docs labels removed, **release 0.2.0** | 8 |

### 0.5 🗓 After that
| Release | Packages | Hours | Target |
|---|---|---|---|
| 0.3 | queues, mail, notifications, scheduler, cache, Redis, queue dashboard, social login, agent tools | ~60 | late Dec 2026 |
| 1.0 | files, search, import/export, inspector, observability, health, charts, dashboards + external audit | ~82 | Feb 2027 |
| 1.x | back-office → identity → money/realtime → content/AI → on demand | ~320 | Feb–Apr 2027 |

### 0.6 Release timeline (pace ~5 agent-hours/working day, counted from the resume on ~21 Nov 2026)
| Release | Hours left | Working days | Expected | With 30% buffer |
|---|---|---|---|---|
| 0.2 | ~46 | ~9 | **1 Dec 2026** | **3 Dec 2026** |
| 0.3 | ~106 | ~21 | 12 Dec 2026 | 18 Dec 2026 |
| 1.0 (build) | ~188 | ~38 | 28 Dec 2026 | 8 Jan 2027 (+ external audit → Feb 2027) |
| Everything | ~508 | ~102 | 2 Mar 2027 | **2 Apr 2027** |

The pause (17–20 Nov) moved every date by about 5 days. If work only happens at weekends, the calendar stretches roughly 3× (see §6.3); the hours stay the same.

---

## 1. Overview

**Strutvane** is an MIT TypeScript framework that works like Laravel: `npm create strutvane@latest my-app` asks what you need, sets everything up (database, auth, admin UI), and `node strut migrate` turns a migration file into a working, secured API and admin screens.

| Release | What users get | Agent-hours | Earliest date | Date with buffer |
|---|---|---|---|---|
| **0.2: the full flow** | installer → migrate → API + admin UI, auth with every sign-in method, Crisp and Vivid designs | ~84 | **3 Dec 2026** | **8 Dec 2026** |
| **0.3: background work** | queues, mail, notifications, scheduler, cache, Redis, social login, AI-assistant setup | ~60 | 15 Dec 2026 | 24 Dec 2026 |
| **1.0: production-ready** | files (S3), search, import/export, inspector, monitoring, health, charts, dashboards, plus an external security audit | ~82 + audit | 1 Jan 2027 (audit +2–4 weeks) | **Feb 2027** |
| 1.x: back-office | activity log, settings, media library, tags, comments, PDF, GDPR tools, backups, API explorer | ~62 | 13 Jan 2027 | Feb 2027 |
| 1.x: identity and integrations | SSO, OAuth server, MCP server, feature flags, webhooks, GraphQL | ~67 | 26 Jan 2027 | Feb–Mar 2027 |
| 1.x: money and realtime | billing, invoicing, realtime, notification channels, boards/calendar, mail templates | ~73 | 10 Feb 2027 | Mar 2027 |
| 1.x: content, AI and automation | AI, workflows, translations, form builder, CMS, browser testing | ~96 | 1 Mar 2027 | Mar–Apr 2027 |
| 1.x: on demand | payments, maps (geo) | ~22 | 6 Mar 2027 | **Apr 2027** |
| **Everything (47 packages + 2 designs)** | | **~546** | **6 Mar 2027 (110 days)** | **8 Apr 2027 (~143 days)** |

The dates assume the current plan: about **35 agent-hours a week**, using the weekly limit fully each week. See §6 for other paces.

---

## 2. How the plan works

### 2.1 Order of work: the priority rule (doc 18 §10)
1. What **every app needs on day one**: framework, auth, ui, the installer.
2. What the **installer asks about**: designs, Redis, social login, agent tools.
3. What a **B2B back office needs in its first week**: files, search, import/export, activity log, settings.
4. What the **first enterprise customer asks for**: SSO, audit, billing.

### 2.2 How each package is built
1. **Design first:**
   - the blueprint (doc 18);
   - the Laravel parity matrix (doc 20);
   - the decisions file (`spikes/CONSISTENCY-2026-11-15.md`, 129 decisions);
   - accepted ADRs.
2. **Prototype (spike)** for anything risky, then an **adversarial audit** that attacks it, fixes it and adds a regression test for each class of bug.
3. **Port into the real package** on a branch. Every package must pass the **production gates R1–R9** (doc 19):
   - strict TypeScript;
   - tests green 3 times in a row under load;
   - coverage ≥ 90/90/85/90;
   - attack tests and fuzzing;
   - no leaks;
   - package checks (publint, attw, contents);
   - docs;
   - staged npm release.
4. **The coordinator re-runs every check itself.** An agent's report is never accepted on its own.
5. **Merge into `main` in release order**, framework first. The release workflow then **stages** the version on npm. The project lead approves it with 2FA, and only then does it go live.
6. **Docs are the spec.** The live docs (https://vishwajit-vm.github.io/strutvane-docs/) describe what the code must do. Any difference is a bug, fixed either in the code or through a recorded decision.

### 2.3 How the work is run
- Several AI agents work **in parallel**, each on its own package and branch, so they never edit the same files.
- They **commit in small green steps** and **push their branch** after each one, so nothing lives only on one computer.
- **Usage limits are watched:** work runs until about 85% of the 5-hour limit, then every agent commits, every repo is pushed, and a resume point is saved.

---

## 3. Release roadmap

### 0.2: the full flow (target: December 2026)
**Goal:**
- `npm create strutvane@latest my-app`, then `cd my-app`, then `npm run dev` works;
- `node strut make:migration create_posts_table --seeder`, then `node strut migrate`, gives a working, secured CRUD API and admin screens with a sidebar entry;
- sign-in uses Strutvane's own engine.

**Exit criteria:**
- every core package passes R1–R9;
- the Northwind demo app is rebuilt with the installer as the acceptance test;
- the live docs have no "Coming in 0.2" labels left for shipped features;
- the core train is released together as `0.2.0-next.N`, then `0.2.0`.

### 0.3: background work (target: late December 2026)
Queues, mail drivers, notifications (with an in-app bell), scheduler, cache, Redis, queue dashboard, social login, agent tools.

### 1.0: production-ready (target: Q1 2027)
Files, search, import/export, inspector, observability, health, charts, dashboards. Before 1.0 there is an **external security audit by people**, which takes 2–4 weeks in parallel. 1.0 starts Laravel's support policy: 18 months of bug fixes and 24 months of security fixes.

### 1.x releases (Q1–Q2 2027)
Back-office, identity, money, content/AI and on-demand packages, each released when ready.

---

## 4. Package by package

The **Order** column is the order the coordinator takes packages in. **Depends on** shows what must be ready first.

### 4.1 Release 0.2 (~84 agent-hours)
| Order | Package | What it does | Status (16 Nov) | Hours left | Depends on |
|---|---|---|---|---|---|
| 1 | framework: core consolidation + audits | kernel, CLI, devkit, contracts in one package; 4 audits, fix pass | ✅ **done**, on `main` as 0.1.0-next.1 (1,466 tests) | 0 | — |
| 2 | auth v2 | Strutvane's own sign-in engine: password, email link, 2FA, passkeys, tokens, teams, impersonation | 🔄 finishing | 4 | framework |
| 2 | ui v2 | behaviour-only admin UI, plus the Design contract and conformance kit | 🔄 finishing | 4 | framework |
| 2 | create-strutvane v2 | the installer: questions, own DB server, Docker mode, catalogue | 🔄 finishing | 3 | — |
| 3 | framework: database layer | own ORM (MySQL default, MariaDB, PostgreSQL, SQLite), migration-first schema, `migrate`, seeding, the migration sandbox | 🔄 building | 18 | framework |
| 3 | framework: app core | `Application.configure()`, routing, controllers, the security kit, every Laravel-style command, facades | 🔄 building | 14 | framework |
| 3 | design-crisp (default) | the clean, business-first design | 🔄 building | 5 | ui v2 |
| 3 | design-vivid | the colourful dashboard design | 🔄 building | 4 | ui v2 |
| 4 | framework: logging fold-in | Laravel-style log channels (ADR-0022) moved into the framework | ⏳ ready to move (573 tests) | 4 | app core |
| 4 | log-viewer | the logs screen, split out of `@strutvane/logs` | ⏳ next | 4 | logging fold-in |
| 4 | framework: package installers | `node strut install:<x>` sets up config, `.env`, migrations, routes and screens | ⏳ next | 8 | app core + database |
| 5 | strutvane-skeleton | the app template repo (like `laravel/laravel`) | ⏳ next | 4 | app core |
| 5 | package catalogue | the format for 100+ packages, plus the index builder and CI | ✅ prototype done | 3 | — |
| 5 | `strutvane` (npx guard) | safe `npx strutvane` outside a project | ⏳ next | 1 | — |
| 6 | acceptance + release | demo app end to end, security review, docs, versions, npm staging | ⏳ last | 8 | all of the above |

### 4.2 Release 0.3 (~60 agent-hours)
| Order | Package | What it does | Hours |
|---|---|---|---|
| 1 | framework: queues | jobs, chains, batches, unique jobs, retries, outbox | 10 |
| 2 | framework: notifications | mail, database, broadcast channels, plus the ui bell | 6 |
| 2 | framework: mail drivers | SMTP, Resend, Postmark, SES, failover, preview | 5 |
| 2 | framework: scheduler | cron, no overlap, one server | 4 |
| 2 | framework: cache | stores, locks, `flexible`, `memo` | 4 |
| 3 | redis | Redis/Valkey for cache, queue, locks, sessions, limits | 6 |
| 3 | queue-dashboard | jobs, failures, throughput, schedule view | 7 |
| 3 | social-login | Google, Microsoft, GitHub, Apple | 6 |
| 3 | agent-tools | AGENTS.md, skills, local MCP docs server | 6 |
| 4 | integration + docs | | 6 |

### 4.3 Release 1.0 (~82 agent-hours + external audit)
| Order | Package | What it does | Hours |
|---|---|---|---|
| 1 | files | S3/Azure disks, resumable uploads, virus scan, quotas | 10 |
| 1 | charts | KPI and chart widgets with privacy-safe aggregates (prototype done) | 8 |
| 2 | dashboards | home page and per-user dashboards | 7 |
| 2 | search | Meilisearch/Typesense, queued indexing | 9 |
| 2 | import-export | CSV/XLSX import with mapping and dry run | 10 |
| 3 | inspector | dev recorder (requests, queries, jobs, mail) | 10 |
| 3 | observability | OpenTelemetry + metrics dashboard | 10 |
| 3 | health | scheduled checks, history, alerts | 4 |
| 4 | security audit prep | threat models, evidence pack | 6 |
| 4 | integration + docs | | 8 |

### 4.4 1.x releases (~320 agent-hours)
| Release | Package | Hours |
|---|---|---|
| **Back-office (~62)** | media-library | 10 |
| | activity-log | 7 |
| | settings | 7 |
| | pdf | 7 |
| | privacy (GDPR) | 7 |
| | backup | 7 |
| | comments | 6 |
| | tags | 3 |
| | api-explorer | 3 |
| | docs | 5 |
| **Identity and integrations (~67)** | sso (SAML/OIDC + SCIM) | 18 |
| | oauth-server | 12 |
| | graphql | 12 |
| | mcp-server | 7 |
| | feature-flags | 6 |
| | webhooks | 6 |
| | docs | 6 |
| **Money and realtime (~73)** | billing | 20 |
| | invoicing | 12 |
| | realtime | 12 |
| | notification-channels | 10 |
| | resource-views (boards/calendar) | 7 |
| | mail-templates | 6 |
| | docs | 6 |
| **Content, AI and automation (~96)** | workflows | 20 |
| | form-builder | 20 |
| | cms | 20 |
| | ai | 12 |
| | translations | 10 |
| | browser-testing | 7 |
| | docs | 7 |
| **On demand (~22)** | payments | 12 |
| | geo | 7 |
| | docs | 3 |

---

## 5. What gets taken next, in order

1. **Now:** finish auth v2, ui v2 and create-strutvane v2, then verify them and merge into `main` in this order: auth, ui, installer.
2. **Now:** framework database layer and app core (in parallel). Merge both once verified, and run a combined check.
3. **Now:** design-crisp and design-vivid. Create their GitHub repos, verify, and merge.
4. **Next:** fold logging into the framework, then split out log-viewer.
5. **Next:** package installers (`node strut install:<x>`), the skeleton repo, the catalogue index and CI, the npx guard.
6. **Then:** apply the `release/0.2/patches` (one framework copy everywhere), version everything at `0.2.0-next.0`, and stage it on npm for the project lead's approval.
7. **Then:** rebuild the demo app with the installer as the acceptance test, remove the "Coming in 0.2" labels, and release **0.2.0**.
8. **After 0.2:** 0.3 in the order of §4.2, then 1.0 in §4.3, then the 1.x releases.

---

## 6. Timeline

### 6.1 Converting hours to calendar time
| Pace | Agent-hours per week | Agent-hours per day |
|---|---|---|
| **A. Current plan, weekly limit fully used** | ~35 | ~5 |
| B. Weekends only (about 2 usage windows a week) | ~10 | ~1.4 |
| C. More capacity (higher plan or extra usage) | ~120 | ~17 |

### 6.2 Release dates at pace A (start: 16 Nov 2026)
| Milestone | Cumulative hours | Days from start | Date (no buffer) | Date (+30% buffer) |
|---|---|---|---|---|
| 0.2 | 84 | 17 | 3 Dec 2026 | 8 Dec 2026 |
| 0.3 | 144 | 29 | 15 Dec 2026 | 24 Dec 2026 |
| 1.0 build complete | 226 | 46 | 1 Jan 2027 | 15 Jan 2027 |
| 1.0 release (after the audit) | — | 60–75 | late Jan 2027 | **Feb 2027** |
| Back-office | 288 | 58 | 13 Jan 2027 | 31 Jan 2027 |
| Identity and integrations | 355 | 71 | 26 Jan 2027 | 17 Feb 2027 |
| Money and realtime | 428 | 86 | 10 Feb 2027 | 9 Mar 2027 |
| Content, AI and automation | 524 | 105 | 1 Mar 2027 | 2 Apr 2027 |
| On demand (all done) | 546 | 110 | **6 Mar 2027** | **8 Apr 2027** |

### 6.3 The same plan at the other paces
| Milestone | A (~35 h/week) | B (weekends, ~10 h/week) | C (~120 h/week) |
|---|---|---|---|
| 0.2 | ~2.5 weeks (Dec 2026) | ~8.5 weeks (mid-Jan 2027) | ~5 days (late Nov 2026) |
| 0.3 | ~4 weeks (Dec 2026) | ~14 weeks (Feb 2027) | ~9 days |
| 1.0 | ~2–2.5 months (Feb 2027) | ~6 months (May 2027) | ~3 weeks + audit (Jan 2027) |
| Everything | **~3.5–5 months (Mar–Apr 2027)** | **~13 months (Dec 2027)** | **~1.5 months (Jan 2027)** |

### 6.4 Month by month (pace A)
| Month | Focus |
|---|---|
| **Nov 2026** | framework v2 on `main` ✅; auth v2, ui v2, installer v2, designs, database layer, app core |
| **Dec 2026** | **0.2 release** (full flow); 0.3 background work; **0.3 release** |
| **Jan 2027** | 1.0 packages (files, search, import/export, inspector, observability, health, charts, dashboards); external audit starts; back-office packages |
| **Feb 2027** | **1.0 release** after the audit; identity and integrations; money and realtime |
| **Mar 2027** | content, AI and automation; on-demand packages |
| **Apr 2027** | buffer; everything released |

```mermaid
gantt
  title Strutvane delivery plan (pace A, no buffer)
  dateFormat YYYY-MM-DD
  section Core
  0.2 full flow            :a1, 2026-11-16, 17d
  0.3 background work      :a2, after a1, 12d
  1.0 build                :a3, after a2, 17d
  External security audit  :crit, a4, after a3, 21d
  section 1.x
  Back-office              :b1, after a3, 12d
  Identity & integrations  :b2, after b1, 13d
  Money & realtime         :b3, after b2, 15d
  Content, AI, automation  :b4, after b3, 19d
  On demand                :b5, after b4, 5d
```

---

## 7. Risks and what reduces them
| Risk | Effect | How we reduce it |
|---|---|---|
| Usage limits (5-hour and weekly) | they set the calendar pace | work in parallel inside each window; push at 85%; more capacity speeds things up a lot (§6.3) |
| npm account locked until 17 Nov 2026 08:35 UTC | nothing can be published before then | releases are staged and ready; publishing starts on unlock |
| Two copies of the framework in apps | packages fail to connect | fixed by the `release/0.2/patches`, applied in order (framework first) |
| Security of auth and the database layer | serious if wrong | attack tests, fuzzing, two audit rounds per package, an external audit before 1.0 |
| Flaky tests | false confidence | gate R2: green 3 times in a row under load, real root-cause fixes |
| Scope growth (100+ packages) | dates slip | phases release on their own; only 0.2 and 1.0 dates are announced publicly |

---

## 8. Decisions still open
| Decision | Recommendation |
|---|---|
| Manifest fields the UI needs (`maxPerPage`, `routeKey`, sidebar order and badge) | add them to the framework contract (RFC-0005, being drafted) |
| Crisp's input borders and accents | strengthen them to pass the conformance checks (being done in design-crisp) |
| Which dates to announce publicly | announce **0.2 in December 2026** and **1.0 in Q1 2027**; present the rest as a public roadmap without dates |

---

## 9. Where to look
- Live docs: https://vishwajit-vm.github.io/strutvane-docs/
- Blueprint: `docs/18-v2-blueprint.md`
- Production rules: `docs/19-production-readiness.md`
- Laravel parity: `docs/20-laravel-parity.md`
- Decisions: `spikes/CONSISTENCY-2026-11-15.md`
- Release patches and order: `release/0.2/patches/README.md`
