# CLAUDE.md: Strutvane (ecosystem hub & blueprint)

Project memory for Claude Code. Read this first in every session. Keep it short and current.

## What this is

**Strutvane** is a TypeScript framework and package ecosystem for enterprise B2B apps, playing the role Laravel plays for PHP but built natively for TypeScript.

The promise: declare models as fields and types → get migrations, a secured CRUD API, auth/RBAC/tenancy and a full UI, all as owned code.

This folder is the **umbrella workspace and the hub repo** (`github.com/vishwajit-vm/strutvane`, the target `strutvane/blueprint`).

## Status

- **Phase: design / pre-implementation (as of 2026-11-13).** The blueprint is complete; Phase 0 (foundations) is next.
- **Do not write implementation code unless the user explicitly asks.** Planning, docs, ADRs and spikes come first.

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

- `docs/`: blueprint (00–16), `adr/`, `research/` (dated evidence)
- `packages/<name>/`: each package repo, with its own `CLAUDE.md` and `.claude/`
- `.claude/skills/`: `adr`, `blueprint-sync`, `research-refresh`, `new-package-repo`
- `.claude/agents/`: `architecture-reviewer`, `security-reviewer`, `docs-editor`
- `.claude/commands/`: `/status`, `/decide`
