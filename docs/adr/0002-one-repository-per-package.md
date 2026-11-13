# ADR-0002: One Git repository per package (polyrepo)

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [10 Repositories](../10-repositories-publishing-versioning.md)

## Context

The project owner wants each package in its own repository, as Laravel does for its first-party packages.

## Decision

- Each published package gets its own GitHub repo.
- A hub/blueprint repo holds the planning documents.
- Shared `tooling`, `docs`, `examples` and `integration` repos are added when needed.
- Local cross-repo development uses a git-ignored umbrella pnpm workspace.

## Alternatives considered

| Option | Why not |
|--------|---------|
| Monorepo (Turborepo/Nx) | Owner preference; per-package ownership, issues and releases are clearer in a polyrepo |
| Monorepo with read-only split mirrors | Extra machinery; split repos cannot accept PRs |

## Consequences

- Contract changes need coordinated releases. The sequence is: RFC → `next` channel → integration repo → stable.
- Reusable CI workflows and a shared tooling package prevent configuration drift.
