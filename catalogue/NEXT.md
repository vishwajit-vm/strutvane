# NEXT: hub `catalogue/` (branch `feat/catalogue`)

Updated 2026-11-18. Not pushed; not merged into the hub's `main`.

## Done

- Promoted spike 21 into `catalogue/` (own package.json, npm only, `.npmrc` guards copied from tooling): manifest rules, index schema (format 2 + optional `repo`), pure builder, verified verdict.
- `source.json`: 63 entries (49 listed packages and designs, 6 shelved or retired packages, 5 retired framework features, 3 non-package repos). Phases follow the docs site (agent-tools and social-login in phase 2).
- Builder: `buildFromSource` merges the source with the recorded npm state; `--offline` replays `snapshots/`.
- Checks: manifest conformance (runtime + catalogue keys, secret values, paths, ranges, framework compatibility), npm drift, repo drift (`gh repo list`), docs drift (`strutvane-docs` data and pages).
- `check-manifest` for package CI.
- Workflow `.github/workflows/catalogue.yml` (offline on PRs, online nightly; autocommit gated by `CATALOGUE_AUTOCOMMIT`).
- Tests: see the session report (vitest, 3 runs).

## Open (in order)

1. **Docs drift (48 errors today):** the docs site's `src/data/packages.json` has `repo: null` for 43 planned packages whose repos now exist, `strutvane-logs` for log-viewer and logs (renamed to `strutvane-log-viewer`), `npm: null` for design-glass (reserved on npm), and no repo for `strutvane` (`strutvane-npx`). Fix in `strutvane-docs`, or better, make the docs site read `catalogue.json`. Until then the offline PR job is red on the docs step.
2. **Manifest dialects:** the published `strutvane` blocks use the framework's runtime keys (`compat`, `commands`, `migrations`, `allowConsole`); design-crisp declares catalogue fields without `manifestVersion`. Decide whether packages publish `manifestVersion: 1` in the same block (what this tool expects) or a nested `strutvane.catalogue`.
3. Move the resolver (spike 21 `src/resolver/*`) into the framework or the installer, reading `catalogue.json`.
4. Turn on `CATALOGUE_AUTOCOMMIT` after the first nightly run is reviewed (and confirm `main`'s protection lets `github-actions[bot]` push, or switch to a PR-opening step).
5. Hub CI has no lint step (no Biome config in the hub); add one if the hub gets shared configs.

## How to verify

```bash
cd catalogue && npm ci && npm run ci
node src/cli/catalogue.ts build --offline --check
node src/cli/catalogue.ts check --offline --docs ../../packages/docs   # from the worktree; adjust the path
```
