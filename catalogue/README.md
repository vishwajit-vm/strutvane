# The package catalogue

`catalogue.json` is the **one index of every Strutvane package**. The installer (`npm create strutvane`, question 22), `node strut install` / `node strut add`, the docs site's package pages and the catalogue page all read it, so a new package appears everywhere without a code change (blueprint `docs/18-v2-blueprint.md` §3.3, decision #130 in `spikes/CONSISTENCY-2026-11-15.md`).

This folder is the tool that builds and checks it. It was promoted from spike 21 (`spikes/21-package-catalogue`, which stays as the record of the experiment).

```bash
cd catalogue
npm ci
npm run ci                                          # tsc (incl. type-level tests) + vitest

node src/cli/catalogue.ts build                     # live npm → snapshots/npm.json → catalogue.json
node src/cli/catalogue.ts build --offline --check   # replay the snapshot; exit 2 if catalogue.json is stale
node src/cli/catalogue.ts check --docs ../packages/docs           # live repo list (gh) + every check
node src/cli/catalogue.ts check --offline --docs ../packages/docs # recorded repo list
node src/cli/catalogue.ts check-manifest path/to/package.json --framework 0.2.0-next.0
npm run generate-schema                             # Zod → schema/*.json (a test fails on drift)
```

Exit codes: `0` done, `1` problems (nothing is written on a failed build), `2` `--check` found `catalogue.json` stale, `3` bad arguments or unreadable input. Node ≥ 24.3 runs the `.ts` files directly; npm ≥ 11.19 (the `.npmrc` guards).

## How it fits together

```text
source.json  (hand-edited: which packages exist, where they stand)
     +                                   ──► build ──► catalogue.json  (format 2, read by everyone)
snapshots/npm.json  (recorded from npm: versions, peer ranges, the strutvane block)

snapshots/repos.json (recorded from gh repo list)  ┐
strutvane-docs checkout (src/data/packages.json)   ├─► check ──► findings (errors fail CI)
source.json + snapshots/npm.json                   ┘
```

- **The hub owns which packages exist and where they stand** (`source.json`). Status changes without a release, most packages are not published yet, and a name squatted on npm must never reach the installer.
- **Each package owns what it installs** through the `strutvane` block it publishes. A release whose block carries `manifestVersion: 1` is used as is, under every manifest rule. Otherwise the source speaks for it (no questions, nothing installed), with the framework range taken from `strutvane.compat`, then `peerDependencies["@strutvane/framework"]`, then the source.
- **Online and offline see the same thing.** The online build records exactly what it read in `snapshots/`; `--offline` replays it. Pull requests are deterministic and never hit the registry.

## `source.json`

One entry per package, feature or repository (schema: `schema/catalogue-source.v1.schema.json`, Zod: `src/source/schema.ts`).

| Field | Notes |
|---|---|
| `id` | What people type (`node strut install:<id>`). Designs use the short name (`crisp`). Permanent. |
| `name`, `description` | ≤ 30 and ≤ 60 characters (one picker line). |
| `kind` | `package`, `design`, `feature` (a retired part of the framework with no npm name) or `repo` (a repository that is not a package: docs, tooling, skeleton). |
| `npm`, `repo` | The npm name and the repository name inside `org`. |
| `status` | `planned` (needs `phase`), `in-development`, `released`, `shelved` or `retired` (needs `replacement`). Shelved and retired need a `note`. |
| `phase`, `since`, `date` | Roadmap phase; the framework line the status started with; when a retirement happened. |
| `category`, `tags`, `popular`, `docs`, `framework` | Required while listed (planned, in development, released). `framework` is the range the package targets until it publishes its own. |

`catalogue.json` gets an entry for every listed package or design (statuses map: `released` → `available`), and a `history` item for every shelved or retired one. Features and repos stay in the source (the docs check uses them). An unpublished package is listed once, as version `0.0.0`, `published: false`.

## The checks

| Check | Fails (error) on | Warns on |
|---|---|---|
| **build** (fail closed) | an invalid source; an invalid published manifest; status drift (`released` without a full release, `planned` with one); duplicate ids, unknown categories, `requires` cycles, install collisions (spike 21 rules) | packages with no compatible framework line |
| **manifest** (every published `strutvane` block, and `check-manifest` for package CI) | unknown keys; module/folder paths that leave the package; a `compat` range it cannot read; **secret values** (npm/GitHub/AWS/Stripe/Slack tokens, private keys, JWTs, URLs with passwords, a string under a credential-named key); catalogue fields without `manifestVersion`; every manifest rule (no question asks for a secret, ReDoS-safe patterns, https docs, …); id/kind/category disagreeing with the source; a dist-tagged release whose range does not accept the current framework; the framework's own `compat` not including its own version | first-party release with no framework range |
| **npm** | a released entry not on npm, or with no full release / a placeholder under `latest`; a planned or in-development entry that npm has released; a source name missing from the snapshot | a listed name nobody holds on npm; a retired package not yet deprecated; a published `repository` that is not the source's repo |
| **repos** | a `strutvane-*` (or `create-strutvane`) repo in the org with no source entry; a source repo missing from the org; an archived repo behind a live entry | a live repo used only by retired entries |
| **docs** | a docs Packages-page entry (`src/data/packages.json`) or per-package page (`versions/*/packages/*.mdx`) with no catalogue entry; npm, repo, status or phase disagreeing | a catalogue entry missing from the docs |

Pre-release versions (`0.2.0-next.0`) are compared at the release-line level for the compatibility rules (`src/checks/prerelease.ts`); the index itself lists full releases only.

## CI (`.github/workflows/catalogue.yml`)

- **Pull requests and pushes touching `catalogue/`:** `npm ci`, `npm run ci`, `build --offline --check`, `check --offline --docs` (with a `strutvane-docs` checkout).
- **Nightly (03:17 UTC) and on demand:** live `build` and `check`; commits `catalogue.json` and `snapshots/` only when they changed **and** the repo variable `CATALOGUE_AUTOCOMMIT` is `true`. Failing checks fail the job after the commit.

## Layout

| Path | What |
|---|---|
| `source.json` | The hand-edited source (63 entries on 2026-11-18). |
| `catalogue.json` | The built index (format 2; `repo` added as an optional field). Never edit by hand. |
| `snapshots/npm.json`, `snapshots/repos.json` | The recorded live state the offline mode replays. Never edit by hand. |
| `schema/` | Generated JSON Schemas: manifest v1, catalogue v2, source v1. |
| `src/manifest/` | The manifest rules (from spike 21, unchanged except for exports). |
| `src/catalogue/` | The index schema, the pure builder, the "verified" verdict, local/npm readers (spike 21). |
| `src/source/` | The source schema and the merge with npm (`buildFromSource`). |
| `src/live/` | npm and GitHub readers, and the snapshot formats. |
| `src/checks/` | Manifest conformance, npm, repos and docs drift, the report. |
| `src/cli/` | `catalogue.ts`, `generate-schema.ts`. |
| `test/` | Vitest suites; `test/fixtures/seed/` is spike 21's 49-manifest seed, kept to test the builder. |

## Adding a package

1. Add an entry to `source.json` (status `planned`, a `phase`, a `category`, a docs URL, a framework range) and its repo.
2. `node src/cli/catalogue.ts build` (online: it records the new name's npm state in `snapshots/npm.json`) and commit `catalogue.json` and the snapshot with it. The PR check fails on a stale index or an unrecorded name.
3. When it ships, publish a `strutvane` block with `manifestVersion: 1` (its questions and what it installs), then set `status` to `released`.
