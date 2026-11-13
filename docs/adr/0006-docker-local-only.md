# ADR-0006: Docker is local-development only and never committed

- **Status:** Accepted
- **Date:** 2026-11-13
- **Related:** [00 D16](../00-executive-summary.md), [10 §9](../10-repositories-publishing-versioning.md)

## Context

The project owner uses Docker only for local services and does not want Docker files in Git.

## Decision

- **Strutvane repos:** every repo git-ignores Docker files.
- **Generated apps:** `docker/compose.yaml` is created for local services and run with `sv up` / `sv down`. It is git-ignored by default; `--docker=commit` opts in to committing it.
- **Production containers:** files are generated only on demand (`sv docker:prod`) and documented in the deployment guides.

## Consequences

- Repos stay clean.
- Teams that want shared container configs opt in explicitly.
- CI uses Testcontainers instead of committed compose files.
