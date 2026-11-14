# ADR-0018: CI stages npm releases; a maintainer approves each version with 2FA before it goes live

- **Status:** Accepted (refines [ADR-0016](0016-release-flow-version-on-main.md))
- **Date:** 2026-11-14
- **Related:** [10 Repositories §8.1](../10-repositories-publishing-versioning.md#81-trusted-publishing-oidc--provenance), [12 Security model](../12-security-model.md), [GOVERNANCE.md §5](../../GOVERNANCE.md)

## Context

ADR-0016 has CI publish any version that isn't on npm yet, through npm trusted publishing (OIDC) with provenance. No token exists, but a single CI run could still make a version live. If a workflow, a dependency used during the build, or a maintainer's GitHub account were compromised, a malicious version would reach users with no human in the loop.

npm now offers **staged publishing**: `npm stage publish` uploads a version that stays invisible to installs until a maintainer approves it on npmjs.com with 2FA. A trusted-publisher connection can be limited to staging only, by leaving "Allow npm publish" and "Allow npm dist-tag" unticked. npm recommends this setting. Checked 2026-11-14 on npmjs.com and with npm 11.19.0 (`npm stage --help`).

## Decision

- **CI stages, it never publishes.**
  - The canonical `.github/scripts/publish-if-new.mjs` runs `npm stage publish --access public --provenance --tag <tag>`.
  - It skips a version that is already published or already staged, so re-runs stay idempotent.
  - The dist-tag rules and the "never publish below `latest`" check from ADR-0016 are unchanged.
- **The release workflow pins npm 11.19.0**, so staging never depends on the npm bundled with the runner.
- **Every package's trusted publisher is staging-only.** It is bound to its own repo and `release.yml`, with no environment, and both "Allow npm publish" and "Allow npm dist-tag" left unticked.
- **A maintainer approves each staged version on npmjs.com with 2FA.** That approval is the release. A version is never live because of a CI run alone.
- Everything else in ADR-0016 still holds: version on `main`, the `RELEASE_ENABLED` gate, `next` pre-releases before 1.0.

## Consequences

- **Positive:**
  - A compromised workflow, build dependency or GitHub account cannot ship a version to users by itself.
  - Provenance still links every version to its commit and workflow run.
- **Costs:**
  - One approval click (with 2FA) per package per release. A release that touches several packages needs them approved in dependency order, `contracts` first.
  - Dependent repos see a new version only after approval. Their CI may need a re-run once the dependency is live.
- **Unverified:** the JSON shape of `npm stage list --json` is not documented yet. The script reads it defensively, and if listing fails it falls back to staging, which can never make anything live.
