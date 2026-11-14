# Versioning, branches and support policy: Laravel's model for the Strutvane monorepo (research + design, 2026-11-14)

> **Status:** research and a design proposal for the project lead. Nothing here is decided until the draft [ADR-0020](../adr/0020-versioning-branches-and-support-policy.md) is accepted.
>
> **Inputs:** `docs/18-v2-blueprint.md` (one npm-workspaces monorepo, plain `0.x` on `latest`), `spikes/SHARED-DESIGN.md` ("everything is versioned, code and docs together"), [ADR-0016](../adr/0016-release-flow-version-on-main.md) (version in a commit, CI publishes what's new), [ADR-0018](../adr/0018-staged-npm-publishing.md) (CI stages, a maintainer approves with 2FA), and `docs/10-repositories-publishing-versioning.md` §6 and §11 (the polyrepo-era policy this replaces).
>
> **Companion drafts** (for the docs agent): [Release notes and support policy page](2026-11-14-release-notes-and-support-policy-page.md) and the [upgrade guide template](2026-11-14-upgrade-guide-template.md).
>
> **Evidence rule:** every third-party fact carries a source and the date it was checked (all 2026-11-14 unless stated). Anything not checked is marked *(unverified)*.

## 0. Summary

Strutvane copies Laravel's model end to end and adapts only what npm and Changesets force:

1. **One release train.** All published packages share one version number before 1.0. After 1.0, `framework`, `auth`, `ui`, `create-strutvane` and `strutvane` stay on the train. Add-on packages (log-viewer, queue-dashboard, files, …) then version on their own, as Laravel's Horizon or Cashier do.
2. **Version numbers.** Before 1.0 the *minor* is the "major": `0.2 → 0.3` may break, `0.2.x` patches never do (patches may add compatible features, the way Laravel's weekly `13.x` minors do). From 1.0 on it is plain semver, with one major a year (~Q1, like Laravel) and minors and patches as often as weekly.
3. **Support windows.** From 1.0 they are exactly Laravel's: **bug fixes for 18 months, security fixes for 2 years** from each major's release. Before 1.0: the newest `0.N` line gets everything, and the previous line gets security fixes for 6 months after its successor ships.
4. **Branches** mirror `laravel/framework`:
   - `main` is the next line (Laravel's `master`);
   - one branch per released line (`0.2.x`, `0.3.x`, then `1.x`, `2.x`);
   - fixes land on the **oldest supported line that has the bug** and are **merged up** tag by tag, as Laravel does with "Merge tag 'v12.72.0' into 13.x".
5. **Tags and dist-tags.**
   - One git tag per train release (`v0.2.3`, Laravel style). Add-on packages after 1.0 use Changesets tags (`@strutvane/log-viewer@1.4.0`).
   - On npm, `latest` is the newest stable line; `latest-<line>` (`latest-0.2`, later `latest-1`) marks older maintained lines, the convention the npm CLI itself uses; `next` carries previews from `main`.
6. **Starter.** `create-strutvane` is on the train, so `npm create strutvane@0.2 my-app` builds a 0.2 app pinned to `^0.2.<patch>`.
7. **Docs.** Docs live next to the code in every branch. The site builds every maintained branch at `/docs/<branch>/` (`/docs/0.2.x/…`, `/docs/main/…`), like `laravel.com/docs/12.x/…`. End-of-life lines stay online as frozen snapshots with a banner.
8. **One machine-readable support table.** `versions.json` on `main` drives:
   - the support table on every docs version;
   - the docs build matrix;
   - the npm dist-tag a release gets;
   - `node strut about` / `doctor` warnings;
   - CI's branch guards.
9. **CI enforces it:**
   - a changeset for every package change;
   - bump-level guards per branch;
   - an API-report diff that requires docs and, for breaks, an upgrade-guide entry;
   - deprecation bookkeeping;
   - merge-up PRs after every release.

## 1. How Laravel does it (studied 2026-11-14)

### 1.1 Versioning scheme and support policy

From the 13.x release notes ([laravel.com/docs/13.x/releases](https://laravel.com/docs/13.x/releases), checked 2026-11-14):
- **Semantic versioning for the framework and first-party packages.** Majors come **every year (~Q1)**. Minors and patches can ship **as often as every week**, and they never contain breaking changes.
- **Constraints.** Apps should require `^13.0`. Laravel aims for a major upgrade to take a day or less.
- **Named arguments** are explicitly outside the backwards-compatibility promise. The equivalent for us is a carve-out list of what is *not* public API (§5.1).
- **Support:** "bug fixes are provided for 18 months and security fixes are provided for 2 years". Only the latest major of each additional library gets bug fixes.

The support table, as published on 2026-11-14:

| Version | PHP | Release | Bug fixes until | Security fixes until |
|---|---|---|---|---|
| 10 | 8.1–8.3 | 2023-02-14 | 2024-08-06 | 2025-02-04 |
| 11 | 8.2–8.4 | 2024-03-12 | 2025-09-03 | 2026-03-12 |
| 12 | 8.2–8.5 | 2025-02-24 | 2026-08-13 | 2027-02-24 |
| 13 | 8.3–8.5 | 2026-03-17 | Q3 2027 | 2028-03-17 |

What to copy:
- the table shape: version, runtime range, release, bug-fix end, security end;
- a colour legend (end of life / security only);
- the runtime column, which for us is Node.

The table sits on the "Release Notes" page of **every** docs version, so readers of old docs see the policy.

**Lesson.** The `master` branch of `laravel/docs` still carried the Laravel 12 support text on 2026-11-14 (`gh api repos/laravel/docs/contents/releases.md?ref=master`). A support table copied into each branch goes stale. Strutvane renders it from one file (§7.3).

### 1.2 Branch model

Checked with `gh api repos/laravel/framework/branches` and `repos/laravel/docs/branches` on 2026-11-14.

- **`laravel/framework` branches:**
  - one branch per released line: `4.0` … `5.8`, then `6.x` … `13.x`;
  - `master`;
  - short-lived topic branches.
- **The default branch is `13.x`, the current stable line, not `master`.** `master` holds the next major: its recent PR titles are prefixed `[14.x]`.
- **`laravel/docs` has the same branch set**, with the same default (`13.x`).
- **Docs URLs.** They are `/docs/<branch>/<page>`. Since 2026, `laravel.com/docs/12.x/releases` 301-redirects to `laravel.com/framework/docs/12.x/releases`; `master` and the next major (`14.x`) also resolve.
- **Version placeholders.** Docs pages link with a `{{version}}` placeholder (`/docs/{{version}}/database`), so moving a page between versions never breaks its links.

Where changes go (["Which Branch?"](https://laravel.com/docs/13.x/contributions#which-branch), 2026-11-14):
- **all bug fixes** go to the latest version that supports bug fixes (`13.x`), never to `master` unless the feature exists only there;
- **backward-compatible minor features** also go to the stable branch;
- **breaking changes** go to `master`.

**Forward-porting is a merge of the release tag upward.**
- On 2026-11-12, `13.x` has the commit "Merge tag 'v12.72.0' into 13.x".
- Security fixes for 12.x and 13.x were released the same day: v12.72.0 and v13.42.0 on 2026-11-10, then advisories GHSA-6rv8-qj5v-p8ch and GHSA-v5ch-g375-82r6 published 2026-11-11, patched in `12.72.0` and `13.41.0`.

### 1.3 Tagging and release mechanics

- **`bin/release.sh` on `13.x`** (read 2026-11-14) guards the release:
  - it refuses to run unless the current branch is the line's branch (`RELEASE_BRANCH="13.x"`);
  - the tree must be clean and in sync with origin.
  It then creates **one tag `vX.Y.Z`** and pushes the same tag to every split component repo (`illuminate/auth`, `illuminate/cache`, …). That is **one train tag for many packages**.
- **`.github/workflows/releases.yml`** is a manual `workflow_dispatch` with a `version` input. It aborts when the version's major differs from the branch's major.
- **`tests.yml`** runs on pushes to `master` and `'*.x'`.
- **Changelog.** `CHANGELOG.md` on each line's branch is titled "Release Notes for 13.x" and lists PR titles with authors and links, generated from merged PRs.
- **The version constant** `Application::VERSION = '13.42.0'` is bumped in the release commit.

### 1.4 Upgrade guides and deprecations

The [13.x upgrade guide](https://laravel.com/docs/13.x/upgrade) (2026-11-14) has these parts:
- an **"Estimated Upgrade Time"** (10 minutes for 12 → 13);
- an index of **High / Medium / Low impact changes**;
- one entry per change: a heading, **"Likelihood Of Impact: High | Medium | Low | Very Low"**, what changed and why, a before/after code block, and how to keep the old behaviour;
- an **"Upgrading Using AI"** section (a Boost slash command);
- a pointer to Shift (a community automation service);
- a final **"Miscellaneous"** section that links the skeleton diff (`github.com/laravel/laravel/compare/12.x...13.x`).

Laravel deprecates with aliases first and removes them later. For example, `VerifyCsrfToken` remains as a "deprecated alias" of the renamed `PreventRequestForgery` in 13.x (same guide). There is no published removal timetable beyond "majors may break" *(unverified: no written deprecation policy found)*.

### 1.5 Security

- Reports go privately to `security@laravel.com` ([laravel/.github SECURITY.md](https://github.com/laravel/.github/blob/main/SECURITY.md), 2026-11-14).
- Fixes are released on every line still in its security window, the same day.
- Each is published as a GitHub Security Advisory listing the patched version per line.

## 2. Comparison set (2026-11-14)

| Project | Majors | Support | Branches / tags | Old docs | Source |
|---|---|---|---|---|---|
| **Laravel** | yearly ~Q1 | 18 mo bugs, 24 mo security | `N.x` + `master`; one train tag `vX.Y.Z` | `/docs/N.x/` | §1 |
| **Node.js** | yearly from v27 (new schedule) | 6 mo Current; then LTS; ~30 mo of critical fixes overall | release lines `vN.x` | per-version API docs | [previous-releases](https://nodejs.org/en/about/previous-releases) |
| **Angular** | yearly (changed after v22; 6-monthly before) | 12 mo active + 12 mo LTS = 24 mo | patch branches; npm tags `v21-lts`, `v20-lts` … | `v20.angular.dev`-style per-major sites *(unverified)* | [angular.dev/reference/releases](https://angular.dev/reference/releases) |
| **Next.js** | ~yearly (Oct) | Active LTS until next major; Maintenance LTS 2 years from release (15.x extended to 2027-01-31) | `canary` daily; npm tags `backport`, `next-15-3`, `next-14` | per-major docs archive *(unverified)* | [nextjs.org/support-policy](https://nextjs.org/support-policy) |
| **AdonisJS** | irregular (v6 → v7 on 2026-02-25) | no written window found *(unverified)* | npm `latest`, `next` | separate sites `v5-docs.adonisjs.com`, `v6-docs.adonisjs.com` | [adonisjs.com/blog/v7](https://adonisjs.com/blog/v7), search 2026-11-14 |

Notes from the table:
- **Node's 2026 change.** From Node 27, every major becomes LTS and there is one major a year. A Strutvane major can therefore always require "the two newest LTS lines" without odd/even exceptions.
- **Angular** also moved to one major a year with 24 months of total support, the same total as Laravel. It keeps deprecated APIs for at least one major (about a year) and removes them only in a major.
- **Next.js** shows the cost of an unclear policy: one Maintenance LTS window was extended after the fact.

### 2.1 npm dist-tags in the wild

Read from `registry.npmjs.org/-/package/<name>/dist-tags` on 2026-11-14:

| Package | Old-line tags | Notes |
|---|---|---|
| `npm` | `latest-10`, `next-11`, `latest-6` … | One tag per old major. **We copy this convention.** |
| `@angular/core` | `v21-lts`, `v20-lts`, … | Starts with `v`, which npm's docs advise against |
| `next` | `backport` (15.5.29), `next-15-3`, `next-14` | A mix |
| `vite` | `previous` (6.4.6) | Only one old line addressable |
| `@changesets/cli` | `maintenance-v2` | |
| `@strutvane/framework` (today) | `latest` = `0.0.0-reserved.0`, `next` = `0.1.0-next.0` | v1 pre-releases only |

npm rules ([npm-dist-tag](https://docs.npmjs.com/cli/v11/commands/npm-dist-tag), 2026-11-14):
- `latest` is what a bare `npm install` resolves;
- no other tag is special;
- tags share a namespace with versions, so a tag that parses as a semver range is rejected;
- npm advises tags that start with neither a digit nor `v`.

Checked with npm 11.19.0's bundled `semver`: `validRange('latest-0.2')` and `validRange('latest-1')` are both `null`, so both are legal tags.

### 2.2 Changesets in a monorepo

`@changesets/cli` 3.0.3, published 2026-09-14. Docs read from `changesets/changesets` `docs/guide/*` on 2026-11-14:
- **`fixed` groups** version and publish every member together, even unchanged ones, so they always share a version. This is the train.
- **`linked` groups** share the version number, but only members with changesets are released. That doesn't suit us: users would see `framework@0.2.3` next to `ui@0.2.1` with no meaning.
- **Pre mode** (`changeset pre enter next`):
  - writes `.changeset/pre.json`;
  - versions as `x.y.z-next.N` and publishes to the `next` dist-tag;
  - "you cannot enter prerelease mode for only a subset of packages";
  - the guide calls pre mode "very complicated" and suggests keeping the stable line on its own branch (`v1`) while pre mode runs on the default branch.
- **Backporting.** The guide says to create a branch per old line, set `baseBranch` to it in `.changeset/config.json`, and **always publish backports with a non-`latest` `--tag`**.
- **A trap for 0.x.** Changesets bumps with `semver.inc`, and `semver.inc('0.2.3', 'major')` is `1.0.0` (checked with npm 11.19.0's `semver`). A contributor who marks a 0.x breaking change as `major` would publish 1.0.0 by accident. CI must reject `major` changesets before 1.0 (§9).
- **Caret ranges on 0.x already lock the minor:** `^0.2.3` is `>=0.2.3 <0.3.0-0` (same check). Generated apps can use plain carets before and after 1.0.

### 2.3 npm trusted publishing and staged publishing

From [docs.npmjs.com/trusted-publishers](https://docs.npmjs.com/trusted-publishers), last edited 2026-10-06, checked 2026-11-14:
- **What a trusted publisher is bound to.** A GitHub Actions trusted publisher names an org/user, a repository and a **workflow filename**, plus an optional **environment**. Nothing in it names a branch.
- **Several configurations.** A package can hold up to 10 configurations. They can't be edited, only deleted and recreated.
- **Versions and provenance.** It needs npm CLI ≥ 11.5.1 and Node ≥ 22.14.0. Dist-tag management needs npm ≥ 11.21.0 or ≥ 12.2.0. Provenance is automatic for public repos.
- **Permissions.** Since 2026-09-03 new configurations always allow `npm stage publish`. Direct publish and "Allow npm dist-tag" are separate opt-ins. ADR-0018 leaves both off.

Consequences for version branches:
- One `release.yml` on every branch works with **one** trusted publisher per package, because the binding is the file, not the branch.
- The binding gives no protection against a workflow run from an unexpected branch. ADR-0018's human 2FA approval is the main control. An **environment with a deployment-branch policy** (`main`, `*.x`) would add a second one (§10.3).
- **Extra tags need a human.** Staging sets one dist-tag per version. Any extra tag (for example `latest-0.2`) means running `npm dist-tag add` outside CI with 2FA, because CI has no dist-tag permission. The design keeps this to **one manual command per line, once**: when the line stops being current (§6).

## 3. Version numbering

### 3.1 Before 1.0

| Bump | Meaning | Changeset type | Allowed on |
|---|---|---|---|
| `0.N.0` | The line's "major": may break public API (§5.1) | `minor` | `main` only |
| `0.N.z` | Bug fixes **and** backward-compatible features (Laravel's weekly-minor role) | `patch` | `main` and `0.N.x` (security-only lines: fixes only) |
| `1.0.0` | Deliberate graduation (Phase 3) | none: a maintainer runs `changeset version` with an explicit `1.0.0` *(mechanism to be confirmed in a spike)* | `main` |

**Why the minor is the breaking slot:**
- semver says anything may change in 0.x, and npm's caret already treats `0.N` as the compatibility boundary;
- the blueprint wants plain `0.x` on `latest` so `npm create strutvane@latest` just works;
- Laravel's lesson is that users want a predictable "this line is safe to update" promise, so `0.N.z` is that promise.

**Why compatible features may ship in a patch.** It is the only slot left before 1.0, and Laravel ships compatible features weekly. The changelog shows them under "Added".

`major` changesets are rejected by CI while the train is below 1.0 (§2.2 trap).

### 3.2 From 1.0

Plain semver, as in Laravel:
- **`N.0.0`:** a yearly major (~Q1), the only place breaking changes land;
- **`N.M.0`:** compatible features, as often as weekly;
- **`N.M.z`:** fixes.

**Why ~Q1.** Node's October LTS promotion comes before it, so each major can move its Node floor to "the two newest LTS lines". The same reasoning puts Laravel's majors after PHP's November releases.

### 3.3 What "public API" means (and what it doesn't)

**Public API, where a break needs the breaking slot:**
- everything reachable from a package's `exports`;
- `node strut` commands and flags;
- `create-strutvane` prompts and flags;
- config file schemas and `.env` keys;
- the migration Schema builder;
- the shapes of generated files (`.strutvane/*` types, `resources.json`, `ui.gen.ts`);
- the HTTP API conventions (§5 of the blueprint: query params, problem `code`s, pagination envelope);
- database tables the framework owns (`migrations`, `seeders`, auth tables).

**Generated code counts too.** A change that makes a previously generated app stop compiling or behave differently is breaking. This keeps the rule from `docs/10` §6.1.

**Not public API** (our version of Laravel's "named arguments" note; these may change in any release):
- anything under `internal` subpaths or marked `@internal`;
- the text of log lines and error `detail` strings (the `code` is stable, the wording is not);
- CLI output formatting (machine output is only promised with `--json`);
- the exact SQL the ORM generates;
- the order of keys in generated JSON;
- dev-only pages (`/_strutvane/*` HTML).

## 4. Release cadence

| Kind | Cadence | From |
|---|---|---|
| Patch / compatible-feature release of the current line | When changesets are pending, at most weekly (Laravel ships Tuesdays) | `0.N.x` (later `N.x`) |
| Patch of an older maintained line | As needed; security fixes the same day as the current line | that line's branch |
| New 0.x line (`0.3.0`, `0.4.0` …) | Per roadmap phase, **at most one every 3 months**, so the 6-month security tail never covers more than two lines | `main` |
| Major after 1.0 | Yearly, ~Q1 | `main` |
| Preview (`next`) | On demand, while `main` is ahead of the current line | `main` in Changesets pre mode |

## 5. Support windows

### 5.1 The policy

| Line | Bug fixes | Security fixes |
|---|---|---|
| **Newest 0.x line** | until the next 0.x line (or 1.0) ships | until the next line ships + **6 months** |
| **Previous 0.x lines** | none | until **6 months** after their successor's release |
| **Each major from 1.0** | **18 months** from its release | **24 months** from its release |
| **Add-on packages after 1.0** (log-viewer, files, …) | latest major only (Laravel's rule for "additional libraries") | latest major only, plus any major whose framework major is still in its security window |

What this means:
- **After 1.0** this is Laravel's exact policy: with yearly majors, two lines get fixes at most, plus `main`.
- **Before 1.0** at most two lines are maintained at once, a burden a small team can carry.
- **"Security fix"** means a fix for a vulnerability with a GitHub Security Advisory (§11). **"Bug fix"** means anything else that is wrong in the line's documented behaviour. Critical non-security bugs in a security-only line (data loss, a broken upgrade path) are fixed at the maintainers' discretion. They are announced, never promised.

### 5.2 The table users see (initial, projected)

Dates are filled in by `versions.json` (§7.3) when a line ships.

| Version | Node | Release | Bug fixes until | Security fixes until | Status |
|---|---|---|---|---|---|
| 0.1 (v1 architecture) | 24, 26 | pre-releases only (`0.1.0-next.N`) | — | — | Unsupported (never stable) |
| 0.2 | 24, 26 | on Phase 1 acceptance (TBD) | release of 0.3 | release of 0.3 + 6 months | — |
| 0.3 | 24, 26 | Phase 2 (TBD) | release of 0.4 / 1.0 | that release + 6 months | — |
| 1 | the two newest LTS lines at release | Phase 3 (TBD) | release + 18 months | release + 24 months | — |
| 2 | ditto | ~Q1, a year after 1 | release + 18 months | release + 24 months | — |

## 6. Branch model in the monorepo

```text
main ──●──●──●──●──●──●──●──●──●──●──►   next line (0.3 dev; later 2.0 dev); previews on `next`
        \            ↑ merge tag v0.2.4
0.2.x    ●──●──●──●──●──●──►              current line: patches → npm `latest`
         v0.2.0  v0.2.4
```

| Branch | Holds | Publishes | GitHub default? | Protection |
|---|---|---|---|---|
| `main` | The next line (Laravel's `master`) | `0.(N+1).0-next.K` / `(N+1).0.0-next.K` → `next` (optional) | **Before 1.0: yes** | ruleset: PR + required checks, linear history, no force-push or delete |
| `0.N.x` / `N.x`, current line | Fixes and compatible features for the newest released line | stable → `latest` | **From 1.0: yes**, as `laravel/framework` defaults to `13.x` | same ruleset (pattern `*.x`) |
| older maintained `0.N.x` / `N.x` | Fixes inside the support window | stable → `latest-<line>` | no | same ruleset; bump guard allows `patch` only |
| EOL `0.N.x` / `N.x` | Frozen | nothing | no | archived: ruleset blocks all pushes (kept forever, like Laravel's `4.0`) |
| `feat/*`, `fix/*`, `docs/*` | Short-lived work | nothing | no | merged into their target, then deleted (CLAUDE.md's "never leave work on side branches" still holds) |

### 6.1 Rules

1. **Creating a line branch.** When `0.N.0` (later `N.0.0`) is released from `main`, a maintainer creates `0.N.x` from the tag `v0.N.0` and sets `baseBranch` in `.changeset/config.json` on that branch to `0.N.x`. `main` then starts `0.(N+1)` work. The branch is created at release time, every time, so docs and fixes always have a home.
2. **Where a change goes** (Laravel's "Which branch?", adapted):
   - a **bug fix** goes to the *oldest* line whose bug-fix window is open and which has the bug;
   - a **security fix** goes to the oldest line in its security window (privately, §11);
   - a **compatible feature** goes to the current line;
   - a **breaking change** goes to `main`;
   - **docs fixes** go to the oldest line they apply to.
3. **Forward-porting is a merge-up of the release tag.**
   - After each release on line L, CI opens a PR that merges tag `vL.z` into the next newer line, then into `main` ("Merge tag 'v0.2.4' into main").
   - Merging *tags*, not branch tips, means the merged tree has no pending changesets. That avoids double-counting.
   - A small `scripts/merge-up.mjs` resolves the files every merge-up predictably conflicts on, always in favour of the *target* branch:
     - `"version"` fields in `package.json`;
     - `CHANGELOG.md` files;
     - `.changeset/config.json` (`baseBranch`);
     - `.changeset/pre.json`.
   - **Why merge-up and not cherry-pick-down:** a merge can't forget a newer line, the git graph shows it was done, and it is Laravel's practice.
4. **The exception: backport by cherry-pick.** A fix first written on a newer line, which an older line also needs, is cherry-picked down with the `backport <branch>` label. A bot opens the PR (an action such as `korthout/backport-action`; *version and choice unverified*). Its changeset travels with it.
5. **Pre mode lives only on `main`,** and only while a preview channel is wanted. Line branches never enter pre mode. This follows the Changesets guide's advice (§2.2).
6. **Strutvane's own repo tooling** (scripts, CI, configs) is maintained on each live branch. A CI fix is merged up like any other fix.

### 6.2 Tags

- **Train releases get one annotated tag `vX.Y.Z`** (Laravel style), created by the release script after the staged versions are approved. The tag message lists every package version in the train.
- **A GitHub Release is created from the tag.** Releases from non-current lines are created with `--latest=false`, so the repo's "Latest release" badge never points at a backport.
- **Add-on packages after 1.0** get Changesets-style tags `<name>@<version>` (`@strutvane/log-viewer@1.4.0`), with no `v` tag.
- **The release script checks the tag against the branch:** the version's line must match the branch line (Laravel's `releases.yml` guard). A `0.3.0` tag on `0.2.x` aborts.

## 7. Packages, train and npm

### 7.1 Train membership

| Period | On the train (Changesets `fixed` group) | Independent |
|---|---|---|
| Before 1.0 | **every published package**: `@strutvane/framework`, `@strutvane/auth`, `@strutvane/ui`, `create-strutvane`, `strutvane`, `@strutvane/log-viewer` and every add-on released before 1.0 | none (blueprint §8: lockstep `0.x`) |
| From 1.0 | `@strutvane/framework`, `@strutvane/auth`, `@strutvane/ui`, `create-strutvane`, `strutvane` (the default install; they reach into framework internals and must move together) | add-ons (`log-viewer`, `queue-dashboard`, `files`, `billing`, …): own semver from `1.0.0`; `peerDependencies: { "@strutvane/framework": "^1.0.0 \|\| ^2.0.0" }` where both are tested (Horizon-style multi-major support) |

**Why `fixed` and not `linked`.** Users see one number for "Strutvane 0.2.3", exactly as every `illuminate/*` component carries Laravel's tag. The cost is publishing unchanged packages, which is cheap.

**After 1.0, add-ons release from the current line's branch** (the GitHub default). When a new major ships they move to the new line. A fix for an add-on's previous major happens only while its framework major is in the security window (§5.1).

### 7.2 npm dist-tags

| Tag | Points at | Set by |
|---|---|---|
| `latest` | newest stable release of the current line | CI stages with `--tag latest`; a maintainer approves (ADR-0018) |
| `latest-<line>` (`latest-0.2`, `latest-1`) | newest release of an older maintained line | **once**, by hand with 2FA, when the line stops being current (`npm dist-tag add pkg@0.2.9 latest-0.2` for each train package); after that CI stages that line's patches with `--tag latest-0.2` |
| `next` | newest preview from `main` | CI (pre mode) |
| `canary` | not used until someone needs it (it was in ADR-0016; nothing has published to it) | — |
| `reserved` | existing `0.0.0-reserved.0` placeholders | leave; `latest` moves off it with 0.2.0 |

**How the release script picks the tag** (it reads `versions.json` from `origin/main`, never from the branch it runs on):

```text
branch == main and pre.json exists        → next
branch line == versions.json.current      → latest
branch line in maintained (not current)   → latest-<line>
otherwise (EOL or unknown)                → abort
```

ADR-0016's "never move `latest` to a lower version" check stays as a second guard.

### 7.3 `versions.json` (one source of truth, on `main`)

```json
{
  "$schema": "./schemas/versions.schema.json",
  "current": "0.2",
  "lines": [
    {
      "line": "0.2", "branch": "0.2.x", "distTag": "latest", "node": ">=24.3",
      "released": "2027-01-12", "bugFixesUntil": null, "securityUntil": null,
      "docs": "/docs/0.2.x/", "status": "active"
    },
    {
      "line": "0.1", "branch": null, "distTag": "next", "node": ">=24",
      "released": null, "bugFixesUntil": null, "securityUntil": null,
      "docs": "/docs/0.1/", "status": "eol"
    }
  ]
}
```

*(The 0.2 date is a placeholder for illustration.)*

**Who reads it:**
- the docs build, for the version switcher, the support table on *every* version's release-notes page, the "unsupported version" banners and the build matrix;
- the release script, for the dist-tag;
- CI's branch guards;
- `create-strutvane` and `node strut about` / `doctor`, through a copy published at `strutvane.dev/versions.json`. It is fetched with a short timeout and never blocks offline use. They warn when the app's line is security-only or EOL.

**`null` dates** mean "until the next line ships". The maintainer fills the dates in the PR that releases that next line.

### 7.4 How `create-strutvane` matches the framework

- **Same version as the framework.** `create-strutvane` is on the train, so its version equals the framework's. Its build injects `const FRAMEWORK_RANGE = '^<own version>'` into the templates, so generated apps get `"@strutvane/framework": "^0.2.4"` (which `^` limits to 0.2.x) and the same range for `auth` and `ui`.
- **Picking a line:**
  - `npm create strutvane@latest my-app` gives the current line;
  - `npm create strutvane@0.2 my-app` gives the newest 0.2 starter. npm maps `npm init foo@1.2.3` to `npm exec create-foo@1.2.3` ([npm-init](https://docs.npmjs.com/cli/v11/commands/npm-init), 2026-11-14). A range or tag spec like `@0.2` or `@latest-0.2` should resolve the same way *(range form unverified; test in the installer spike)*;
  - `npm create strutvane@next my-app` gives a preview of `main`.
- **Warnings.** The starter prints the line's support status from `versions.json`, for example "0.2 receives security fixes until 2027-09-30". It refuses an EOL line unless `--allow-eol` is passed.
- **The skeleton diff.** `create-strutvane`'s templates live on each line's branch. The upgrade guide links the diff `compare/v0.2.9...v0.3.0` filtered to `packages/create-strutvane/templates/`, the equivalent of Laravel's `laravel/laravel` compare link.

## 8. Deprecation policy

1. **Deprecate in one line, remove in a later breaking line.**
   - From 1.0: deprecated in `N.x`, removed no earlier than `(N+1).0`.
   - Before 1.0: deprecated in `0.N.z`, removed no earlier than `0.(N+1).0`.
   - A release may remove only what a released line had already marked as deprecated. **Exception:** a security fix may remove or change behaviour immediately. It gets an advisory and a High-impact upgrade-guide entry.
2. **Every deprecation has four parts:**
   - a TSDoc `@deprecated` with the replacement and the removal line ("Use `PreventRequestForgery`. Removed in 0.4."), which editors show as strikethrough;
   - a **runtime warning once per process**, through the framework logger at `warn`, with a stable code (`STRUT_DEPRECATED_<NAME>`) and the fix. It is silenced by `STRUTVANE_DEPRECATIONS=off` and turned into an error by `=throw`, which tests and CI can use;
   - an entry in the framework's deprecation registry (`packages/framework/src/support/deprecations.ts`: code, since, removeIn, replacement, docs link). The registry generates the "Deprecations" page of each docs version;
   - a line in the release notes and in the next line's upgrade guide.
3. **CLI flags, config keys, `.env` keys and generated-file shapes** are deprecated the same way. The old key keeps working, `node strut doctor` reports it with a fix, and the generator stops writing it.
4. **Renames keep an alias** for a full line (Laravel's `VerifyCsrfToken` alias), never a silent break.

## 9. Changelogs, release notes and upgrade guides

### 9.1 Changelogs

- **Per package.** Each package has a `CHANGELOG.md`, generated by `changeset version` with `@changesets/changelog-github` (1.0.1 on npm, 2026-11-14), which adds PR links and authors.
- **Per train release.** The release script builds GitHub Release notes from the same changesets, grouped as **Breaking / Added / Fixed / Security / Deprecated**. Packages without changes are listed as "version bump only".
- **Changeset format.** Each changeset starts with one of those group words (`Fixed: …`). CI checks this, so grouping needs no AI or guesswork.

### 9.2 Release notes page

A **"Release Notes" page per line**, as in Laravel. It has:
- the versioning scheme;
- the support policy;
- the support table, rendered from `versions.json`, so even the 0.2 docs show the current table;
- "what's new in 0.N", written by hand when the line ships.

Draft: [2026-11-14-release-notes-and-support-policy-page.md](2026-11-14-release-notes-and-support-policy-page.md).

### 9.3 Upgrade guide

One **upgrade guide per breaking line** (`upgrade.md` in that line's docs: "Upgrading to 0.3 from 0.2"). It has:
- an estimated time;
- High / Medium / Low / Very Low impact indexes;
- one entry per breaking change, with before/after code and how to keep the old behaviour;
- an "Upgrading with an AI agent" section (once `@strutvane/agent-tools` exists);
- the skeleton diff link.

**Writing it is part of the change.** A breaking PR on `main` must add its entry (§10). The guide is never written at the end.

Template: [2026-11-14-upgrade-guide-template.md](2026-11-14-upgrade-guide-template.md).

## 10. Docs versions

### 10.1 Docs next to the code

The docs site's sources live in the monorepo, so **every line branch carries its own docs**. A fix to `0.2.x` behaviour is documented in the same PR, on the same branch. The site's directory and tooling are the docs agent's choice (see SHARED-DESIGN "Docs site and versioning").

### 10.2 Build and URLs (Laravel's `/docs/<branch>/`)

- **One build per branch.** The site workflow reads `versions.json` and builds every `status: active | security` branch, plus `main`. Each build is a separate static build of that branch's checkout, deployed under `/docs/<branch>/`:
  - `/docs/0.2.x/…`;
  - `/docs/main/…` (Laravel's `/docs/master/`);
  - later `/docs/1.x/…`.
  The URL segment is the branch name, as at Laravel.
- **Why separate builds** rather than a multi-version plugin in one build (for example `starlight-versions` 0.10.2 on npm, 2026-11-14): each version is built by its own branch's toolchain, so an old line never has to build with new site code. It is also Laravel's model.
- **Redirects.**
  - `/docs/` and `/docs/<page>` redirect to the current line (Laravel: `/docs/releases` → current).
  - A version switcher on every page keeps the page path when it exists in the target version, and falls back to that version's index.
- **Links between pages** are relative, or use a `{{version}}`-style placeholder resolved at build time (Laravel's practice), never hard-coded versions.
- **EOL lines** are built **once, at EOL**, and the static output is kept forever (for example in a `docs-archive` storage bucket or branch). The banner reads "You are reading docs for Strutvane 0.2, which no longer receives security fixes. Read the current docs." Old docs never disappear.
- **Search and SEO.** Each page's `<link rel="canonical">` points at the current line's copy when one exists, so search engines prefer current docs *(best practice, unverified for our host)*. Search is scoped to the version being read.
- **`main` docs** carry a "this is unreleased" banner.

### 10.3 Publishing safety for branches (refines ADR-0018)

- **One trusted publisher per package** (`release.yml`) covers every branch (§2.3).
- **Defence in depth (proposed):** add a GitHub **environment `release`** whose deployment branches are limited to `main` and `*.x`, and bind each trusted publisher to it.
  - Only protected branches can then even stage a version.
  - Re-creating the trusted publishers is a one-time cost. They can't be edited (§2.3).
- **Nothing else in ADR-0018 changes:** CI stages, and a maintainer approves each version with 2FA.

## 11. Security advisories and backports

1. **Reporting.** `SECURITY.md` points to GitHub **private vulnerability reporting** on `vishwajit-vm/strutvane` (plus an email fallback). It states the supported versions by linking the support table, not by copying it.
2. **Triage** within 3 working days. A draft GitHub Security Advisory is created, with **affected ranges per line**, for example `>=0.2.0 <0.2.7` and `>=0.3.0 <0.3.2`.
3. **The fix is developed in the advisory's private fork.** It targets the oldest line in its security window, then merges up privately. A regression test for the whole class ships with it (ECOSYSTEM §5).
4. **Releases for every affected maintained line go out the same day.** They are staged and then approved per ADR-0018. Then the advisory is published and a CVE requested through GitHub's CNA. `npm audit` picks the advisory up from GHSA. Laravel did exactly this on 2026-11-10/11 (§1.2).
5. **EOL lines get no fix.**
   - The advisory lists them as affected with "no fix: upgrade".
   - For a critical issue we may also run `npm deprecate "<pkg>@<range>" "Security: GHSA-…, upgrade to …"` (a human step, with 2FA).
6. **Release notes and the "Security" group** in changelogs reference the GHSA id.

## 12. How CI enforces the policy

| Check | Runs on | Fails when |
|---|---|---|
| **changeset-required** | every PR | A file under `packages/*/src/**` (or `templates/**`) changed and no `.changeset/*.md` was added, unless the PR has the label `no-changeset` (tests, internal refactors) |
| **bump-guard** | every PR | <ul><li>a `major` changeset while the train is `<1.0.0`;</li><li>a breaking bump (`minor` before 1.0, `major` after) on any `*.x` branch;</li><li>anything other than `patch` on a security-only line</li></ul> |
| **changeset-format** | every PR | The summary doesn't start with `Breaking:`, `Added:`, `Fixed:`, `Security:` or `Deprecated:` |
| **api-report** | every PR | The public `.d.ts` surface changed (API Extractor `*.api.md` reports, `@microsoft/api-extractor` 7.60.1 on npm, 2026-11-14) and either: <ul><li>no changeset covers that package;</li><li>an export was removed or changed incompatibly without a breaking bump **and** an `upgrade.md` entry;</li><li>a new export has no TSDoc;</li><li>the PR touches no docs file and lacks the `docs-not-needed` label</li></ul> |
| **deprecations** | every PR; release readiness | <ul><li>a `@deprecated` tag without a registry entry (or the reverse);</li><li>`removeIn` is not a future breaking line;</li><li>when cutting a breaking release, any entry whose `removeIn` equals the new line still exists</li></ul> |
| **branch-version** | every PR and push | <ul><li>package versions on `0.N.x` don't match `0.N.*`;</li><li>`main`'s version isn't above every line's;</li><li>a train member's version differs from the others</li></ul> |
| **versions-json** | PRs to `main` | Fails schema validation, or a maintained line has no branch |
| **release guard** | release workflow | <ul><li>the tag's line doesn't match the branch;</li><li>the dist-tag decision (§7.2) aborts;</li><li>the publish target would move `latest` down</li></ul> |
| **merge-up** | after each release tag | Opens the merge-up PR (§6.1); fails if it can't be resolved automatically, which notifies the maintainers |
| **docs-matrix** | site workflow, nightly | A maintained branch's docs fail to build, or a page links across versions with a hard-coded version |
| **rulesets** | GitHub | Protect `main` and `*.x` (PR, checks, no force-push or delete). EOL branches are locked. |

All of these are small Node scripts under `scripts/release/`, with tests, following the blueprint's code standard.

## 13. What this changes elsewhere (follow-ups, not done here)

**Amends earlier decisions:**
- ADR-0016: "version on `main`" becomes "version on the line's branch"; the `next`-only pre-1.0 rule goes (already proposed in blueprint §8).
- ADR-0018: one trusted publisher covers all branches; environment `release` proposed.

**Supersedes in `docs/10`:**
- §6.3 (shared-major polyrepo train) becomes §7.1;
- §6.6 (channels, `lts` tag) becomes §7.2;
- §6.8 (the 12/18/36-month LTS table) becomes §5;
- §11 (`next` and `release/<major>.x` branches) becomes §6.

**Refines:**
- CLAUDE.md / ECOSYSTEM "every repo works on `main`": version branches `*.x` are permanent and allowed; feature branches are still short-lived.
- Executive summary D18 (publishing/channels) and D20 (versioned docs).

**Docs agent:**
- implement the per-branch build, the `/docs/<branch>/` URLs, the banner, the switcher and the `versions.json`-driven table;
- use the two companion drafts.

**Installer agent:**
- inject `FRAMEWORK_RANGE`;
- add the `--allow-eol` check;
- test `npm create strutvane@0.2` (range spec).

**MVC agent:**
- `node strut about` shows the version and support status;
- `doctor` reports deprecated config keys and EOL lines;
- add the deprecation registry and the warning helper.

## 14. Sources (all checked 2026-11-14)

- Laravel release notes and support policy: https://laravel.com/docs/13.x/releases (now served at `laravel.com/framework/docs/…`)
- Laravel 13 upgrade guide: https://laravel.com/docs/13.x/upgrade
- Laravel contribution guide ("Which Branch?"): https://laravel.com/docs/13.x/contributions
- `laravel/framework` branches, default branch, tags, `bin/release.sh`, `.github/workflows/releases.yml`, `tests.yml`, `CHANGELOG.md` on `13.x`, merge commits on `13.x`, security advisories: GitHub API via `gh` (`repos/laravel/framework/...`)
- `laravel/docs` branches and `releases.md` on `master`: GitHub API via `gh`
- Laravel security policy: https://github.com/laravel/.github/blob/main/SECURITY.md
- Node.js releases: https://nodejs.org/en/about/previous-releases
- Angular releases: https://angular.dev/reference/releases
- Next.js support policy: https://nextjs.org/support-policy
- AdonisJS v7: https://adonisjs.com/blog/v7; v6 docs: https://v6-docs.adonisjs.com/
- Changesets guides (prereleases, backporting, fixed, linked, config): https://github.com/changesets/changesets/tree/main/docs/guide; `@changesets/cli` 3.0.3 releases list
- npm dist-tag: https://docs.npmjs.com/cli/v11/commands/npm-dist-tag
- npm init: https://docs.npmjs.com/cli/v11/commands/npm-init
- npm trusted publishers: https://docs.npmjs.com/trusted-publishers (page edited 2026-10-06)
- npm registry dist-tags of `npm`, `next`, `@angular/core`, `@adonisjs/core`, `vite`, `@changesets/cli`, `@strutvane/*`: `https://registry.npmjs.org/-/package/<name>/dist-tags`
- semver behaviour: npm 11.19.0's bundled `semver` (`inc('0.2.3','major')`, `validRange(...)`)
