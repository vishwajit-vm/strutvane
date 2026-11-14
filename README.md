<div align="center">

# Strutvane

**Declare the model. Ship the app.**

A TypeScript framework and package ecosystem for enterprise B2B applications.
Declare models as fields and types, run one command, and get migrations, a secured and documented CRUD API, authentication with RBAC and multi-tenancy, and a complete UI. Every line stays owned, overridable TypeScript.

[![Status: planning](https://img.shields.io/badge/status-planning-blueviolet)](docs/14-roadmap.md)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Node](https://img.shields.io/badge/node-%E2%89%A524-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

</div>

> [!NOTE]
> **Phase 0 (foundations) is complete; Phase 1 is next.** This repository holds the technical blueprint, the decision records (ADRs 0001–0019), the RFCs and the results of the nine Phase 0 [spikes](spikes/) (419 tests). Shared tooling, the [docs site](https://vishwajit-vm.github.io/strutvane-docs/) and the `@strutvane/contracts` v0 draft are built and tested. Nothing is released on npm yet: the packages there are name placeholders. How the project is run: [GOVERNANCE.md](GOVERNANCE.md).

## The idea

```bash
npm create strutvane@next acme         # Full-stack | API only | UI only
cd acme && pnpm install                # dependencies (the starter can also install them for you)
pnpm services:up                       # local PostgreSQL and services (Docker, git-ignored)
pnpm sv make:model Invoice number:string:unique customer:belongsTo(Customer) amount:decimal(12,2) "status:enum(draft,sent,paid)"
pnpm sv migrate                        # migration generated from the model and applied, plus auth's identity tables
pnpm dev                               # API /api/v1/invoices · docs /docs · UI /invoices, with login, roles and permissions
```

```ts
// app/models/invoice.model.ts: this is the whole definition
export default defineModel('Invoice', {
  number:   field.string().unique().searchable(),
  customer: field.belongsTo('Customer').filterable(),
  amount:   field.decimal(12, 2).min(0).sortable(),
  status:   field.enum(['draft', 'sent', 'paid']).default('draft').filterable(),
}, { timestamps: true, softDeletes: true, tenant: true, audit: true })
```

**Goal:** a realistic B2B app (10–20 models, auth, RBAC, UI) running in **1–2 hours**. It should work like Laravel's ecosystem, built natively for TypeScript.

## The ecosystem

| Package | Repository | Role |
|---------|------------|------|
| `@strutvane/framework` | [strutvane-framework](https://github.com/vishwajit-vm/strutvane-framework) | Backend & database core: models, migrations, CRUD API, OpenAPI, queues, cache, mail |
| `@strutvane/auth` | [strutvane-auth](https://github.com/vishwajit-vm/strutvane-auth) | Identity, RBAC/ABAC compiled to SQL, multi-tenancy with RLS, audit, SSO/SCIM |
| `@strutvane/ui` | [strutvane-ui](https://github.com/vishwajit-vm/strutvane-ui) | Metadata-driven UI: tables, forms, detail pages, auth screens, themes, owned components |
| `@strutvane/core` | [strutvane-core](https://github.com/vishwajit-vm/strutvane-core) | Kernel: app lifecycle, container, providers, config, context, events |
| `@strutvane/contracts` | [strutvane-contracts](https://github.com/vishwajit-vm/strutvane-contracts) | Shared types & wire protocols (zero dependencies) |
| `strutvane` · `@strutvane/cli` | [strutvane-cli](https://github.com/vishwajit-vm/strutvane-cli) | Unified CLI (`pnpm sv …`) |
| `@strutvane/devkit` | [strutvane-devkit](https://github.com/vishwajit-vm/strutvane-devkit) | SDK for installers, generators, plugins |
| `create-strutvane` | [create-strutvane](https://github.com/vishwajit-vm/create-strutvane) | `npm create strutvane@next` |
| *(internal)* | [strutvane-tooling](https://github.com/vishwajit-vm/strutvane-tooling) | Shared configs, CI/release workflows, config sync |
| *(docs site)* | [strutvane-docs](https://github.com/vishwajit-vm/strutvane-docs) | Friendly public documentation ([live site](https://vishwajit-vm.github.io/strutvane-docs/)) |

**Planned next:** `notify`, `files`, `payments`, `billing`, `logs`, `reports`, `analytics`, `search`, `realtime`, `i18n`.

## What makes it different

- **Owned code, not a black box.** Four levels of control: declare → configure → override → eject. Adding a field never requires regenerating code.
- **Enterprise features in the open-source core.** RBAC, audit logs, multi-tenancy and SSO hooks are MIT, forever. Competitors paywall them.
- **Independent packages that integrate seamlessly.** Each package installs itself completely: config, `.env` + `.env.example`, migrations, routes and screens. Packages cooperate only through shared contracts.
- **Database tiers that are honest.** Postgres first (incl. Azure, Neon, Supabase, RDS), then MySQL and SQLite, then MSSQL.

## The blueprint

Start with the [executive summary](docs/00-executive-summary.md), then the [developer experience](docs/05-developer-experience.md). The full index is in [docs/README.md](docs/README.md).

| | |
|---|---|
| [Vision & principles](docs/01-vision-principles-assumptions.md) | [Competitive analysis](docs/02-competitive-analysis.md) |
| [Naming & brand](docs/03-naming-and-brand.md) | [Architecture](docs/04-architecture.md) |
| [Framework spec](docs/06-package-framework.md) | [Auth spec](docs/07-package-auth.md) |
| [UI spec](docs/08-package-ui.md) | [CLI reference](docs/09-cli-reference.md) |
| [Repos, publishing, versioning](docs/10-repositories-publishing-versioning.md) | [Technology decisions](docs/11-technology-decisions.md) |
| [Security model](docs/12-security-model.md) | [Testing strategy](docs/13-testing-strategy.md) |
| [Roadmap](docs/14-roadmap.md) | [Risks & trade-offs](docs/15-risks-and-tradeoffs.md) |
| [Docs & ecosystem strategy](docs/16-docs-and-ecosystem-strategy.md) | [Decision records](docs/adr/README.md) |
| [Integration map](docs/17-integration-map.md) | [RFCs](docs/rfcs/README.md) |

## Local development layout

Each package is its own Git repository. Locally they sit side by side inside this hub folder:

```
strutvane/                 ← this repo (blueprint, docs, ADRs; ignores packages/)
└─ packages/
   ├─ framework/           ← github.com/vishwajit-vm/strutvane-framework
   ├─ auth/                ← github.com/vishwajit-vm/strutvane-auth
   ├─ ui/                  ← github.com/vishwajit-vm/strutvane-ui
   ├─ core/  contracts/  cli/  devkit/  create-strutvane/
   ├─ tooling/            ← github.com/vishwajit-vm/strutvane-tooling
   └─ docs/               ← github.com/vishwajit-vm/strutvane-docs
```

To recreate this layout from scratch (clones every missing repo, checks the existing ones, and never deletes or overwrites anything):

```bash
git clone https://github.com/vishwajit-vm/strutvane.git && cd strutvane
node scripts/setup-workspace.mjs          # add --pull to fast-forward clean repos, --dry-run to preview
```

## Contributing

Design feedback is the most valuable contribution right now. See [CONTRIBUTING.md](CONTRIBUTING.md). Report security issues privately: see [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE) © 2026 The Strutvane Authors
