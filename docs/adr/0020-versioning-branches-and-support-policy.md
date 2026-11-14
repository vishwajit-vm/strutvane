# ADR-0020: Laravel-style versioning: one release train, version branches per line, 18/24-month support, docs built per branch

- **Status:** Proposed (awaiting project-lead approval)
- **Date:** 2026-11-14
- **Deciders:** project lead (approval pending); drafted by the versioning agent
- **Related:**
  - [Versioning and support design (research)](../research/2026-11-14-versioning-and-support-design.md)
  - [18 v2 blueprint §8](../18-v2-blueprint.md#8-releases)
  - [ADR-0016](0016-release-flow-version-on-main.md), [ADR-0018](0018-staged-npm-publishing.md)
  - [10 Repositories §6 and §11](../10-repositories-publishing-versioning.md)
  - `spikes/SHARED-DESIGN.md` ("Everything is versioned, code and docs together")
- **Amends:** ADR-0016 ("version on `main`" becomes "version on the line's branch"; `next`-only pre-releases before 1.0 are dropped, as blueprint §8 already proposes) and ADR-0018 (one trusted publisher covers every branch; adds a `release` environment).
- **Supersedes:** `docs/10` §6.3 (polyrepo shared-major train), §6.6 (channels and the `lts` tag), §6.8 (the 12/18/36-month LTS table) and §11 (the `next` and `release/<major>.x` branches).

## Context

v2 moves Strutvane into one npm-workspaces monorepo and promises "Laravel's flow, in TypeScript" (blueprint). The project lead requires versioning that works exactly like Laravel's, for code and docs together:
- users can install an older line;
- they can read that line's docs (as at `laravel.com/docs/12.x/…`);
- they know how long each line is supported.

Today's rules were written for 12 polyrepos and `@next`-only pre-releases (ADR-0016, `docs/10` §6). They have no version branches, no per-version docs and no support table a user can rely on.

Laravel's model, studied on 2026-11-14 (research doc §1):
- semver, with a yearly major (~Q1) and weekly minors and patches that never break;
- bug fixes for 18 months and security fixes for 2 years;
- one branch per line (`12.x`, `13.x`) plus `master` for the next major, in both the framework and the docs repos;
- fixes sent to the oldest supported line, then forward-ported by merging the release tag upward;
- one `vX.Y.Z` tag for the whole framework;
- an upgrade guide per major, with a "Likelihood Of Impact" on every change.

Three constraints shape the adaptation:
- **Changesets** turns `major` on 0.x into `1.0.0` and can't run pre mode for a subset of packages.
- **npm.** A bare install takes `latest`, and only one dist-tag can be set per staged version.
- **npm trusted publishing** binds to a workflow file, not a branch.

## Decision

Strutvane adopts Laravel's versioning model as described in the research doc. The rules:

1. **Numbering.**
   - Before 1.0, `0.N.0` is the breaking slot (changeset type `minor`). `0.N.z` carries fixes and backward-compatible features (`patch`). `major` changesets are rejected until a deliberate 1.0.
   - From 1.0 it is plain semver, with **one major a year (~Q1)**. Minors and patches can ship as often as weekly and never break.
   - Public API includes exports, CLI commands and flags, config and `.env` keys, the Schema builder, generated-file shapes, HTTP conventions and framework-owned tables. The not-API list (internal subpaths, log and `detail` wording, the exact generated SQL, human CLI output) is published.
2. **Support windows.**
   - From 1.0: **bug fixes for 18 months and security fixes for 24 months** from each major's release.
   - Before 1.0: the newest `0.N` line gets bug and security fixes; each older line gets **security fixes for 6 months after its successor ships**. A new 0.x line ships at most every 3 months.
   - Add-on packages after 1.0: only their latest major gets fixes (Laravel's "additional libraries" rule).
3. **One release train.**
   - Before 1.0, every published package is in one Changesets `fixed` group and shares the version.
   - From 1.0 the train is `@strutvane/framework`, `@strutvane/auth`, `@strutvane/ui`, `create-strutvane` and `strutvane`. Add-ons version on their own, with peer ranges on the framework major(s) they support.
4. **Branches** (in `vishwajit-vm/strutvane`):
   - `main` holds the next line (Laravel's `master`).
   - Each released line has a permanent branch, `0.N.x` and later `N.x`, created from its `.0` tag at release time.
   - **Bug fixes** go to the oldest line in its bug-fix window that has the bug. **Security fixes** go to the oldest line in its security window. **Compatible features** go to the current line. **Breaking changes** go to `main`.
   - After each release, CI opens a PR that **merges the release tag up** into each newer line and `main`. A script resolves the version fields, changelogs and Changesets config in favour of the target branch.
   - A cherry-pick backport (`backport <branch>` label) is the exception.
   - The GitHub default branch is `main` before 1.0 and the current `N.x` from 1.0, as at Laravel.
   - EOL branches are locked, never deleted.
   - Feature branches stay short-lived and are merged back (the CLAUDE.md rule still holds for them).
5. **Tags and dist-tags.**
   - Train releases get **one annotated git tag `vX.Y.Z`**, plus a GitHub Release. Releases from non-current lines use `--latest=false`. Add-ons after 1.0 are tagged `<name>@<version>`.
   - **npm dist-tags:**
     - `latest` is the current line;
     - `latest-<line>` (`latest-0.2`, `latest-1`) marks each older maintained line. A maintainer sets it once, with 2FA, when the line stops being current; after that CI stages that line's releases with that tag;
     - `next` carries previews from `main` (Changesets pre mode, `main` only, optional).
   - The release script decides the tag from `versions.json` on `origin/main` and aborts for an EOL or unknown line. ADR-0016's "never move `latest` down" stays.
6. **`versions.json` on `main` is the single support table.** It drives:
   - the docs (switcher, banners, and the support table on every version's Release Notes page);
   - the release script's dist-tag;
   - CI branch guards;
   - `create-strutvane` and `node strut about` / `doctor` warnings, through a copy at `strutvane.dev/versions.json` that never blocks offline use.
7. **Starter.** `create-strutvane` is on the train and writes `^<its own version>` for the framework packages:
   - `npm create strutvane@latest` builds the current line;
   - `npm create strutvane@0.2` builds a 0.2 app;
   - an EOL line needs `--allow-eol`.
8. **Deprecations.**
   - Deprecate in one line and remove no earlier than the next breaking line. Only security fixes may break immediately.
   - Every deprecation has a TSDoc `@deprecated` naming the replacement and removal line, a once-per-process runtime warning with a stable code (`STRUTVANE_DEPRECATIONS=off|throw`), a registry entry and an upgrade-guide line.
   - Renames keep an alias for a full line.
9. **Changelogs and guides.**
   - Changesets per-package `CHANGELOG.md` (with `@changesets/changelog-github`). Each changeset starts with `Breaking:`, `Added:`, `Fixed:`, `Security:` or `Deprecated:`. Train GitHub Release notes are grouped by those words.
   - One **Release Notes** page per line (scheme, policy, table, what's new).
   - One **Upgrade Guide** per breaking line, using Laravel's format: estimated time; High/Medium/Low/Very Low indexes; per change a "Likelihood of impact", before/after code and how to keep the old behaviour; the skeleton diff link. A breaking PR adds its own entry.
10. **Docs per branch.**
    - Docs sources live next to the code in every branch.
    - The site builds each maintained branch, plus `main`, separately at `/docs/<branch>/` (`/docs/0.2.x/`, `/docs/main/`, later `/docs/1.x/`). `/docs/` redirects to the current line.
    - EOL versions are built once at EOL and kept forever with an "unsupported" banner.
11. **Security.**
    - Reports come through GitHub private vulnerability reporting.
    - Each advisory lists affected ranges per line. The fix is made in the advisory's private fork on the oldest line in its security window and merged up.
    - All affected maintained lines are released the same day (staged, then approved under ADR-0018), then the advisory and a CVE are published.
    - EOL lines get no fix. For critical issues they may get `npm deprecate`.
12. **Publishing safety (amends ADR-0018).**
    - One trusted publisher per package (`release.yml`) serves every branch.
    - It is re-created bound to a GitHub environment `release`, whose deployment branches are `main` and `*.x`.
    - Staging-only, with 2FA approval, as before.
13. **CI enforces all of this:**
    - changeset required for package changes;
    - bump guard per branch and per pre-1.0 rule;
    - changeset format;
    - API Extractor report diff, requiring a changeset, a docs change and (for breaks) an upgrade-guide entry;
    - deprecation-registry consistency, including "nothing due for removal survives a breaking release";
    - branch/version consistency;
    - `versions.json` schema;
    - release tag/branch guard;
    - automatic merge-up PRs;
    - a nightly docs build matrix;
    - rulesets on `main` and `*.x`.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| **Trunk only** (`main` publishes everything; no version branches) | Simplest; ADR-0016 as is | No way to fix an older line once `main` has breaking changes; old docs can't be rebuilt | Fails the "install and read old versions" requirement |
| **Cherry-pick backports from `main` down** (Node, Angular, Next.js) | Fits Changesets' backport guide; `main` always has the fix first | A newer line can be forgotten when a fix lands on an older one; post-1.0, most work happens on `N.x`, not `main` | Kept only as the exception (`backport` label). Merge-up is Laravel's practice and can't forget a line. |
| **Changesets `linked` group** or **fully independent versions** | Unchanged packages aren't republished | Users see unrelated numbers (`framework@0.2.3`, `ui@0.2.1`); "Strutvane 0.2.3" means nothing | Laravel tags every component with the framework version; one number is the user-facing promise |
| **`next`-only pre-releases until 1.0** (ADR-0016 as written) | Signals instability | `npm create strutvane@latest` breaks; there are no stable lines to document | Already rejected by blueprint §8 |
| **LTS every second major with 36 months** (`docs/10` §6.8) | Attractive to enterprises | More lines than a small team can maintain; not Laravel | Can be added after 1.0 by a new ADR once there are maintainers to carry it |
| **Per-line tags named `v0.2-lts` / `previous` / `backport`** | Seen at Angular, Vite, Next.js | `v`-prefixed tags are discouraged by npm; `previous` and `backport` address only one line | `latest-<line>` is what the npm CLI itself uses and scales to many lines |
| **One multi-version docs build** (a versions plugin in one site build) | One deploy | Old versions must build with today's site code; the plugin becomes a dependency | Per-branch builds match Laravel and keep every version self-contained |

## Consequences

- **Positive:**
  - Users get Laravel's guarantees: a published support table, installable and documented old lines, safe in-line updates, and upgrade guides with impact ratings.
  - Contributors get one rule for where a change goes.
  - CI makes the policy mechanical: changesets, API reports, deprecations, branch guards.
  - Security fixes reach every supported line on the same day, with an advisory.
- **Negative / costs we accept:**
  - At most two maintained lines plus `main` to build, test and merge up.
  - A small merge-up script and its tests.
  - One manual, 2FA-protected `npm dist-tag add` per package each time a line stops being current.
  - Unchanged train packages are republished with every release.
  - The trusted publishers must be re-created once for the `release` environment.
- **Follow-ups (once accepted):**
  - Mark ADR-0016 and ADR-0018 as amended.
  - Update `docs/00` D18 and D20, `docs/10` §6 and §11, CLAUDE.md and ECOSYSTEM.md (the branch rule), `GOVERNANCE.md` §5 and `SECURITY.md` (run `blueprint-sync`).
  - Write `versions.json`, its schema and the `scripts/release/*` checks, with tests.
  - Docs agent: per-branch build, switcher, banners, and the Release Notes and Upgrade Guide pages from the two research drafts.
  - Installer agent: `FRAMEWORK_RANGE` injection, `--allow-eol`, and a test of `npm create strutvane@0.2`.
  - MVC agent: version and support status in `about`, EOL and deprecation reports in `doctor`, and the deprecation registry and warning helper.
- **Unverified (check before relying on them):**
  - that `npm create strutvane@0.2` resolves a range;
  - whether staged approval applies the staged dist-tag exactly as given;
  - the choice of backport action.
