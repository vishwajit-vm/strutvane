# CLAUDE.md: Strutvane (ecosystem hub & blueprint)

Project memory for Claude Code. Read this first in every session. Keep it short and current.

## Ecosystem memory (shared by every Strutvane repo)

The file below is synced from strutvane-tooling and is identical in every repo. It covers how the whole ecosystem fits together: repo map, decisions, connection rules, standards, workflow and current status. Read it before changing anything.

@.claude/ECOSYSTEM.md

## What this is

**Strutvane** is a TypeScript framework and package ecosystem for enterprise B2B apps, playing the role Laravel plays for PHP but built natively for TypeScript.

The promise: declare models as fields and types → get migrations, a secured CRUD API, auth/RBAC/tenancy and a full UI, all as owned code.

This folder is the **umbrella workspace and the hub repo** (`github.com/vishwajit-vm/strutvane`, the target `strutvane/blueprint`).

## Status

- **Phase 0 (foundations) closed 2026-11-14 (Gate 0 passed; see docs/14-roadmap.md). Phase 1 is next.** RFC-0002/0003/0004 need project-lead acceptance before Phase 1 builds on them. Governance: GOVERNANCE.md. Workspace setup: `node scripts/setup-workspace.mjs`. Phase 0 delivered:
  - `packages/tooling`: canonical configs, CI and release workflows, and `sync.mjs` with drift check
  - `packages/contracts`: v0 implemented and tested
  - `packages/docs`: friendly Starlight docs site
  - `spikes/01-09`: answered (419 tests), with ADR-0007 to ADR-0015
  - `packages/logs`: `@strutvane/logs` designed (RFC-0004), repo created, npm name reserved
  - Status and next spikes: `docs/14-roadmap.md` § "Phase 0 progress".
- The user has authorised implementation (Phase 0 onward). Quality bar: everything tested, strictly typed, documented with the *why*, reusable, and with failure scenarios handled up front.
- Branching: every repo works on `main`. Any feature branch must be merged back into `main` after its tests pass; never leave work on side branches.
- pnpm is not installed globally. Use `corepack pnpm@12.18.0 <cmd>` (and `COREPACK_ENABLE_DOWNLOAD_PROMPT=0` in scripts). Package scripts call tools directly, never `pnpm run x`.
- Shared configs come only from `packages/tooling/canonical`. Change them there, run `node packages/tooling/scripts/sync.mjs`, then run each affected repo's `ci` script.

## Source of truth

1. `docs/00-executive-summary.md`: canonical decisions **D1–D20**. If any doc conflicts with it, it wins until an ADR changes it.
2. `docs/adr/`: accepted decisions are immutable. Supersede them with a new ADR.
3. `docs/05-developer-experience.md`: the DX contract every package must satisfy.

## Key decisions (summary; details in docs/00)

| Area | Decision |
|------|----------|
| Brand | `Strutvane`, npm scope `@strutvane`, CLI `strutvane` (project alias `pnpm sv`), starter `create-strutvane` |
| Package names | Descriptive under the scope: `framework` (backend+DB), `auth`, `ui`, `core`, `contracts`, `devkit`, `cli` |
| Repositories | **One repo per package** (polyrepo) under the `vishwajit-vm` GitHub org (`vishwajit-vm/strutvane-*`). Locally they live in `packages/<name>/`, each its own git repo; this hub repo git-ignores `packages/`. |
| Source of truth in apps | `app/models/*.model.ts` (`defineModel` + `field.*`); migrations auto-diffed to SQL |
| Generation | Thin, metadata-driven files. Levels L0 declare → L1 configure → L2 override → L3 eject (three-way merge on upgrade) |
| Stack | TS strict, ESM, Node 26 LTS (min 24); Hono; Zod 4 / Standard Schema; Drizzle behind an internal adapter; Better Auth behind an identity adapter; React 19 + Vite + TanStack + Tailwind 4 + shadcn registry |
| Docker | **Local development only, never committed**, in any repo |
| License | MIT for everything, including enterprise features |

## Working rules

- Package boundaries: `contracts` ← `core` ← {`framework`, `auth`, `ui`}. Product packages never import each other.
- When a decision changes, update **all** affected docs: `00`, the relevant spec, `README.md` indexes, plus a new ADR. The `blueprint-sync` skill covers this.
- Third-party facts must be dated and sourced. Mark anything unverified as *(unverified)*.
- Never claim a name is legally available. Trademark clearance is pending (`docs/03`).
- Never commit `.env`, secrets or Docker files. Keep `.env.example` complete.
- GitHub: repos live in the org `vishwajit-vm` (the `gh` CLI account `vishwajitvm` is an org admin). Ask before creating, renaming or deleting repos, or before pushing to `main` in a new way.

## Map

- `docs/`: blueprint (00–17; `17-integration-map.md` lists every allowed connection between packages), `adr/` (0001–0017), `rfcs/` (0001 contracts v0, 0002 files, 0003 errors & messages, 0004 logs), `research/` (dated evidence)
- `spikes/`: Phase 0 experiments with reports (standalone; never imported by real packages)
- `packages/<name>/`: each package repo, with its own `CLAUDE.md` and `.claude/`
- `.claude/skills/`: `adr`, `blueprint-sync`, `research-refresh`, `new-package-repo`
- `.claude/agents/`: `architecture-reviewer`, `security-reviewer`, `docs-editor`
- `.claude/commands/`: `/status`, `/decide`
