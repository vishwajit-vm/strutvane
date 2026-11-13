# ADR-0016: Releases are "version on main, CI publishes what's new"; cross-repo dependencies use published `next` pre-releases

- **Status:** Accepted
- **Date:** 2026-11-14
- **Related:** [ADR-0002](0002-one-repository-per-package.md), [10 Repositories](../10-repositories-publishing-versioning.md), [GOVERNANCE.md §5](../../GOVERNANCE.md)
- **Supersedes:** the release-PR part of the canonical `release.yml` (Changesets "version packages" PR)

## Context

In a polyrepo, `core`, `logs`, `devkit` and the other packages depend on `@strutvane/contracts`. Each repo's CI must install those dependencies on its own, so they have to be real, published npm versions; local links don't exist on a CI runner.

The first release design relied on Changesets opening a "chore: release" PR that someone then merges. That adds a manual, bot-driven step to every release of every repo. It also needs PR permissions for GitHub Actions in every repository.

## Decision

- **Versioning happens in normal commits on `main`.**
  - Contributors add changesets.
  - A maintainer runs `changeset version`, which bumps `package.json` and writes the `CHANGELOG.md`.
  - The maintainer commits the result as `chore(release): <name>@<version>`.
- **CI publishes whatever version isn't on npm yet.**
  - The canonical `release.yml` runs the full quality gate, then `.github/scripts/publish-if-new.mjs`.
  - That script skips versions already on the registry, which makes it idempotent and safe to re-run.
  - It publishes with `--provenance` through **npm trusted publishing** (OIDC). No token is stored anywhere.
  - The dist-tag is derived from the version: `x.y.z-next.N` goes to `next`, `x.y.z-canary.N` to `canary`, and a stable `x.y.z` to `latest`.
  - A stable version can never be published over a higher existing `latest`.
- **Before 1.0, packages publish `0.x.0-next.N` pre-releases** using Changesets pre mode (`changeset pre enter next`). Dependent repos pin exact versions such as `"@strutvane/contracts": "0.1.0-next.0"`, with a lockfile, and Dependabot bumps them.
- **Local cross-repo development** inside the umbrella folder may temporarily use a pnpm `overrides` link to a sibling checkout. That override must never be committed; the quality gate fails if a `link:` or `file:` dependency is present.
- **The `RELEASE_ENABLED=true` repo variable still gates publishing,** together with the per-package trusted-publisher configuration on npmjs.com.

## Consequences

- **Positive:**
  - Releases are a normal commit, with no bot PRs.
  - Publishing is idempotent.
  - Every repo builds standalone against real published versions.
  - Provenance comes on every release.
- **Costs:**
  - One-time trusted-publisher setup per package on npmjs.com.
  - Dependents must bump pinned pre-release versions (automated by Dependabot).
