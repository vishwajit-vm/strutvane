# Spike 21: the package catalogue (built for 100+ packages)

**Question:** how does Strutvane list 100+ packages in the installer (question 22), `node strut add`, the docs site and the agent tools, without hard-coding a single package name anywhere, and without ever running a package's code before it is installed? (Blueprint `docs/18-v2-blueprint.md` §3.3, §2.1 question 22, §5.1.)

**Answer:** three pieces, all data-driven:

1. **One manifest per package:** a versioned `strutvane` block in its `package.json`, validated by a strict Zod schema (with a generated JSON Schema for editors).
2. **One index:** `catalogue.json`, built by hub CI from every published manifest. It is deterministic, fails closed, and carries a compatibility table, the "verified" badge and lifecycle data.
3. **One resolver library:** shared by every reader. It filters, groups, searches, resolves requirements and conflicts, and produces an install plan that does not depend on the order the developer picked things in.

```bash
npm install
npm test                          # tsc (incl. type-level tests) + 239 vitest tests
npm run build-catalogue           # seed/manifests → seed/catalogue.json
npm run build-catalogue -- --check   # CI: fail if the committed index is stale (exit 2)
npm run generate-schema           # Zod → schema/*.json
```

Node ≥ 24.3, TypeScript strict, ESM, `.ts` files run directly by Node (type stripping). One runtime dependency: `zod` 4.6.7 (MIT).

## Layout

| Path | What |
|---|---|
| `src/manifest/schema.ts` | The manifest schema (Zod): fields, field rules, cross-field rules |
| `src/manifest/validate.ts` | `validatePackageJson()`: name, version and peer checks, plus friendly messages |
| `src/manifest/rules.ts` | Named rules: ids, package names, URLs, paths, sizes |
| `src/manifest/secret-words.ts` | "Does this question ask for a credential?" |
| `src/manifest/executable-keys.ts` | "Does this field look like code to run?" |
| `src/manifest/safe-pattern.ts` | The ReDoS-free pattern subset and its linear-time matcher |
| `src/manifest/text.ts` | Display-text rules and locale-free folding (search, secret words) |
| `src/manifest/define.ts` | Typed authoring helpers (`selectQuestion`, `defineManifest`, …) |
| `src/catalogue/index-schema.ts` | `catalogue.json` format 2, and `parseCatalogueIndex()` for readers |
| `src/catalogue/build.ts` | `buildCatalogue()`: pure, deterministic, fails closed |
| `src/catalogue/sources.ts` | Readers: local folders (tests, seed) and the npm registry (hub CI); the hub config |
| `src/catalogue/conformance.ts` | The "verified" verdict |
| `src/catalogue/v1-compat.ts` | Bridge to spike 13's format 1 (`toV1`, `compareWithV1`) |
| `src/resolver/*` | `offered`, `groupByCategory`, `search`, `planInstall`, `resolveAnswers` |
| `src/cli/*` | `build-catalogue`, `generate-schema` |
| `schema/` | Generated JSON Schemas (drift-checked by a test) |
| `seed/` | `hub.json` (categories, framework lines, lifecycle, history), `registry.json` (what is released), `manifests/*/package.json` (49 manifests; not `packages/`, which the hub's root `.gitignore` ignores), `catalogue.json` (built) |

## 1. The manifest

Every package, first-party or community, declares this block. No code runs to read it.

```json
{
  "name": "@strutvane/billing",
  "version": "0.1.0",
  "peerDependencies": { "@strutvane/framework": "^1.0" },
  "strutvane": {
    "manifestVersion": 1,
    "id": "billing",
    "displayName": "Billing",
    "description": "Subscriptions, seats and a customer portal",
    "category": "money",
    "tags": ["subscriptions", "stripe", "paddle"],
    "kind": "package",
    "popular": true,
    "docs": "https://github.com/vishwajit-vm/strutvane-billing#readme",
    "framework": "^1.0",
    "installs": {
      "config": ["config/billing.ts"],
      "env": [
        { "key": "STRIPE_SECRET", "description": "Stripe secret API key", "secret": true },
        { "key": "PADDLE_API_KEY", "description": "Paddle API key", "secret": true }
      ],
      "migrations": ["create_subscriptions_table"],
      "routes": [{ "method": "POST", "path": "/webhooks/billing/:provider" }],
      "screens": [{ "path": "/billing", "title": "Billing" }],
      "sidebar": [{ "label": "Billing", "path": "/billing", "icon": "credit-card" }],
      "commands": []
    },
    "questions": [
      { "id": "provider", "type": "select", "label": "Billing: which payment provider?",
        "choices": [{ "value": "stripe", "label": "Stripe" }, { "value": "paddle", "label": "Paddle (merchant of record)" }],
        "default": "stripe" },
      { "id": "stripe-tax", "type": "confirm", "label": "Billing: let Stripe calculate sales tax?",
        "default": false, "when": { "question": "provider", "equals": "stripe" } }
    ],
    "requires": [],
    "conflicts": []
  }
}
```

| Field | Notes |
|---|---|
| `manifestVersion` | Literal `1`. A newer format is refused with "upgrade the builder", never half-read. |
| `id` | What people type: `node strut install:<id>`, `--features <id>`. Unique in the catalogue and permanent across releases. |
| `displayName`, `description` | ≤ 30 and ≤ 60 characters, so a picker line fits in 74 columns (spike 13's limits). |
| `category`, `tags` | The category must exist in the hub's `hub.json`. Up to 8 tags. |
| `kind` | `package` or `design` (blueprint §5.1). |
| `popular` | Shown in question 22's short list. First-party only. |
| `docs` | https, public host, canonical form. |
| `framework` | The supported `@strutvane/framework` range. It must equal `peerDependencies["@strutvane/framework"]` when that is present. |
| `installs` | What `install:<id>` adds: config files, env keys (with `secret`), migrations, routes, screens, sidebar entries and commands. Used by the review screen, the docs and collision checks. |
| `questions` | Up to 6 declarative follow-ups: `select`, `multiselect` (with `min`/`max`), `confirm`, `text` (with a required safe `pattern` and `maxLength`). The optional `when` asks a question only if an earlier answer `equals` a value or `includes` a choice. |
| `requires`, `conflicts` | Other catalogue ids. A conflict declared by either side counts. |
| `deprecated` | `{ message, replacedBy?, since? }`. Deprecated packages are hidden from pickers. |

### Every rule, and why it exists

| Rule | Why |
|---|---|
| **No question asks for a key, secret, token or password** (id, label, help or placeholder; any spelling: `apiKey`, `API_KEY`, "API key", full-width letters, accents, `pass word`, common words in German, French, Spanish, Portuguese and Italian). There is no `password` question type and no "masked" option. | An answer typed into the installer ends up in shell history (`--feature-option`), CI logs, `strutvane.json` (committed) or a screen recording. Credentials go in `installs.env` with `secret: true`, and the developer types them into `.env` later. The check is deliberately blunt: a harmless "Primary key column?" must be reworded. That is the price of failing closed. |
| **Secret-looking env keys must be `secret: true`** (`*_KEY`, `*_SECRET`, `*_TOKEN`, `*_PASSWORD`, `*_DSN`, …), and **secrets may not have an `example`**. | `.env.example` is committed, so a secret must never get a value there. |
| **No executable fields** (`postinstall`, `scripts`, `run`, `exec`, `hook(s)`, `handler`, `eval`, `require`, `on*`, … at any depth). These get their own message, not just "unknown field". | Blueprint §3.3: "No code runs to read it." Picking a package must never run its code before install. Install logic belongs in the package's installer steps. |
| **Unknown fields are refused** at every level (strict objects). | Typos (`popluar`), fields from a newer format, and smuggled behaviour are all caught instead of silently ignored. |
| **Size limits:** 16 KiB block, nesting depth 6, a 512 KiB `package.json`, and per-field and per-list limits. | Every `npm create strutvane` downloads the index. One huge manifest must not slow every install or break the terminal layout. Size and depth are checked before anything walks the data. |
| **Names only `@strutvane/<name>` (first-party) or `strutvane-<name>` (community)**, plus the two reserved unscoped names `strutvane` and `create-strutvane`. No look-alike scopes, trailing or double dashes, or capitals. | The name becomes an `npm install` argument, a folder and a JSON key. Other scopes are not ours to list. |
| **Community ids equal their name** (`strutvane-kanban` → `kanban`), and **community packages cannot set `popular`**. | A community package cannot take a first-party-looking id, and the popular list is curated by the hub. |
| **Designs:** named `…design-<x>`, id `<x>`, category `design`, and they install only config files. | §5.1: designs change how the app looks, never its data or routes. Only one design is installed at a time. |
| **URLs:** https only. No user name or password, no IP addresses, no localhost, canonical form. | `javascript:`, `data:` and `file:` links run or read things when clicked. Credentials in URLs leak. `user@host` disguises the real host. A canonical form means reviewers read what browsers open. |
| **ReDoS-proof text patterns** (see below). | A third party's regex runs on every keystroke. `^(a+)+$` freezes V8 on 40 characters. |
| **Display text:** one line, no control characters, no invisible format characters (zero-width, bidi overrides), no word mixing Latin with look-alike letters (`pаssword` with a Cyrillic `а`), NFC. | Terminal injection (escape sequences can redraw the screen and fake a question), Trojan Source (CVE-2021-42574), and filter evasion. NFC keeps the index byte-deterministic. |
| **Paths are relative and stay inside the project** (no `..`, no absolute paths, no backslashes; dot-files allowed). | The installer writes these files. |
| **Versions are full releases. Ranges must be in the subset the installer understands.** | An unparseable range would silently hide the package everywhere. It is refused at build time instead (fail closed). |
| **Cross-field consistency:** defaults are real choices; ids, choices, env keys and installs are unique; `when` points to an *earlier* question with a possible value; `requires` and `conflicts` are disjoint and never self-referencing. | These mistakes would otherwise surface as broken prompts on someone else's machine. |

### Safe text patterns (no ReDoS)

`src/manifest/safe-pattern.ts` uses two layers:

1. **A restricted subset:** `^`, then single-character atoms (a literal, `\d \w \s` and their negations, an escaped symbol, a `[class]`, or `.`), each optionally repeated (`? * + {n} {n,} {n,m}`, n and m ≤ 100), then `$`. **No groups, alternatives, back-references or look-arounds**, so no quantifier can nest inside another. Nesting is the cause of exponential blow-up. The subset is also a valid `u`-mode RegExp with the same meaning: a property test checks 2,000 random patterns × inputs against V8.
2. **A linear-time matcher:** even without nesting, `^a*a*a*a*a*a*a*a*b$` is polynomial in a backtracking engine (O(n⁸)). `matchesPattern()` simulates every state at once (Thompson's construction), at a cost of ≤ answer length × 1,000 states. **Readers must use it and never `new RegExp(pattern)` on a package's pattern.** `resolveAnswers()` already does.

## 2. The catalogue index (`catalogue.json`, format 2)

Built by `buildCatalogue()` (pure) and written by `npm run build-catalogue`.

- **A superset of spike 13's format:** every field the installer reads today keeps its name and meaning: `id`, `name`, `description`, `category`, `popular`, `published`, `frameworkRange`, `package` and `followUps`, plus categories' `id` and `name`. Nothing is renamed. `version: 2` is the only change an old reader notices, and it tells that reader to switch. A test projects the seed index to format 1 (`toV1`) and feeds it to **spike 13's own `parseCatalogue`**: nothing is skipped, and every v1 field is copied unchanged.
- **Added per entry:**
  - `kind`, `origin` (first-party/community), `tags`, `docs`;
  - `version` and `versions[]` (newest first, each with its own framework range);
  - `compatibility` (framework line → newest compatible package version);
  - `verified`, `requires`, `conflicts`, `installs`, `deprecated`;
  - lifecycle fields: `status`, `phase`, `since`.
- **Added per file:** `generator`, `manifestVersion`, `frameworkLines`, categories' `pickable`, and `history` (retired and shelved packages).
- **Deterministic:**
  - entries are sorted by id;
  - tags and relations are sorted;
  - keys are written in a fixed order;
  - there are no timestamps (a test builds under two fake clocks);
  - input order never matters (a property test shuffles the input);
  - the committed seed index is rebuilt byte for byte in a test and by `--check`.
- **Compatibility table:**
  - `versions[]` keeps every listed version with its own range, so an app on an older framework line still gets the newest version that fits that line, not just the latest release;
  - `compatibility` summarises this per line for the docs site;
  - published packages list only published, non-npm-deprecated versions;
  - an unpublished package lists its one working copy.
- **Fails closed:** any invalid manifest stops the build and nothing is written. Every problem of every package is listed in friendly words:

  ```text
  The catalogue was not built: 1 package has problems. Nothing was written.

    @strutvane/billing (seed/manifests/billing/package.json)
      - strutvane.questions[0] ("api-key").id: asks for a secret ("apikey"). The installer never asks for keys, secrets, tokens or passwords; list the value under installs.env with "secret": true so the developer types it into .env later
  ```

  The build is also refused for:
  - duplicate ids;
  - an unknown category, requirement, conflict or replacement;
  - `requires` cycles (named in full: `a → b → c → a`);
  - an id or kind that changed between releases;
  - two packages that can be installed together but claim the same config file, route, command, migration or screen (packages that declare a conflict, and designs, are exempt);
  - lifecycle data that contradicts the release state.

  It warns, without failing, about:
  - published versions without a manifest (pre-catalogue releases);
  - npm-deprecated versions;
  - packages with no compatible framework line;
  - requirements with no version for a line the package supports.
- **Verified:** set only from a conformance results file for *that exact version*:
  - it must name the right package, version and framework, the framework must be inside the package's range, and every required kit must have `passed` (`installer-protocol`, `security`, `typecheck`, plus `design` for designs);
  - anything missing, malformed or mismatched means "not verified", never a build error;
  - the hub's nightly job (§3.3 item 6) runs the kits and writes these files, so a package cannot simply self-certify. Signed results from package CI (npm provenance or GitHub attestations) are future work.
- **Readers** (`parseCatalogueIndex`) treat the downloaded file as untrusted:
  - the file must be at most 16 MiB with the right version and shape;
  - **every entry is re-checked with every manifest rule**;
  - a bad entry is skipped and reported, never offered; one broken package must not take the picker down.

### Lifecycle (for the docs site's packages page)

Status changes without a package release ("planned" → "in development"), so it is **hub-curated** in `seed/hub.json`, not in manifests:

- **`lifecycle[id]`:** `{ status, phase?, since? }`.
  - `status` is one of `available`, `preview` (the `next` dist-tag), `in-development`, `planned` or `shelved`.
  - Without a record, a package is `available` if released and `planned` if not.
  - The status must agree with the release state: `available` without a release, or `planned` with one, is a build error.
  - The resolver never offers shelved packages, and offers previews only with `includePreview`.
- **`history[]`:** packages that are no longer listed:
  - each has `status` (`retired` or `shelved`), `since`, `date`, `note` and a `replacement` of `{ packages[], import?, note }`;
  - a retired package must have a replacement, which must be listed in the catalogue;
  - a history item must not still be listed.

Seed state (2026-11-15):
- **In development, since 0.2:** framework, auth, ui, create-strutvane, strutvane, log-viewer, crisp, vivid.
- **Planned:** the other 41, each with its phase 2–8.
- **Retired:**
  - `@strutvane/core`, `contracts`, `cli` and `devkit` were merged into `@strutvane/framework`. Import from `@strutvane/framework/<name>`. The repos were archived on 2026-11-15; npm deprecation waits for framework v2.
  - `@strutvane/logs` splits in two: logging moves into the framework (ADR-0022), and the viewer becomes `@strutvane/log-viewer`.
- **Shelved:** `@strutvane/design-glass` (spike 18).

## 3. The resolver (shared by installer, `node strut add`, docs site)

```ts
import { parseCatalogueIndex, offered, groupByCategory, search, planInstall, resolveAnswers } from './src/index.ts'

const { index } = parseCatalogueIndex(downloadedText)
const options = { frameworkVersion: '0.2.0' }
const available = offered(index, options)            // published, compatible, not deprecated/shelved, pickable
groupByCategory(index, available, { popularOnly: true }) // question 22's first screen
search(available, 'MÉDIA')                           // case- and diacritic-insensitive, AND across words
const plan = planInstall(index, picks, options)      // throws ResolveError with every problem
resolveAnswers(plan, { 'billing.provider': 'paddle' }) // defaults, `when`, CLI strings, safe patterns
```

- **Filter:**
  - only published packages (`includeUnpublished` is for docs "coming soon" pages);
  - the **newest version whose range fits the exact framework version** (`compatibleVersion`);
  - not deprecated, not shelved, not preview unless asked;
  - `package` kind in pickable categories (designs have their own question; core packages are never "added").
- **Group:** by the hub's category order, popular first, then by folded name, then by id.
- **Search:**
  - folding is locale-free (NFKD, marks removed, lower case, ß/æ/ł/… mapped), so results are identical on every machine;
  - every query word must match somewhere;
  - ranking: exact id > prefix > word prefix > tag > substring > description > npm name.
- **Plan:**
  - picks are de-duplicated and sorted first;
  - requirements are added by a sorted walk;
  - steps are a topological order with ties broken by id, so the plan is a function of the *set* of picks (property-tested, including over random subsets of the 49 seed packages);
  - refusals are collected, each with a stable code: `unknown-package` (with "Did you mean …?"), `not-available` (and who needed it), `not-installable`, `conflict` (both sides, and "needed by …"), `requires-cycle` (the full cycle) and `two-designs`;
  - the plan lists steps (`picked`/`required`, `requiredBy`), questions keyed `<id>.<question>` (the `--feature-option` key) and merged `.env` keys (secret if any package says so).

## 4. How a package gets listed

**First-party (`@strutvane/<name>`):**
1. The `new-package-repo` skill writes the `strutvane` block. Authors get completion from `schema/strutvane-manifest.v1.schema.json`: npm forbids `$schema` in `package.json`, so map it with the editor's `json.schemas` setting.
2. The package's CI runs `validatePackageJson` (or `build-catalogue --packages .`) so problems show up before publishing.
3. A hub PR adds the npm name to `hub.json` `packages` and a `lifecycle` record (status and phase).
4. Hub CI runs `build-catalogue --npm`: it reads every version from the registry, builds, commits `catalogue.json` if it changed, and publishes it. The installer, `node strut add`, the docs site and the agent tools pick it up with no code change.
5. The nightly job runs the conformance kits against the framework's lines and writes the results files. The next build turns `verified` on.

**Community (`strutvane-<name>`):** the same manifest and the same rules, plus three differences:
- the id must equal the name without the `strutvane-` prefix;
- `popular` is not allowed;
- listing is a hub PR adding the name. The hub owns the list, so a squatter or a broken package fails the hub's CI, never the installer.

They earn "verified" through the same kits.

## 5. How the installer switches (spike 13 → this library)

| Spike 13 today (`src/catalogue.ts`) | Switch to |
|---|---|
| `parseCatalogue(raw)` (format 1, select-only follow-ups) | `parseCatalogueIndex(text)` (format 2; re-checks every rule, skips bad entries) |
| `offeredEntries(catalogue, version)` (latest range only) | `offered(index, { frameworkVersion })` (newest *fitting* version; deprecated/shelved/preview handling) |
| `popularGroups(catalogue)` | `groupByCategory(index, entries, { popularOnly: true })` |
| type-to-search in the prompter | `search(entries, query)` |
| `findOffered(id)` + manual follow-up loop | `planInstall(index, picks, options)` → `plan.steps` (requirements added, conflicts refused, order fixed) and `plan.questions` |
| `--feature-option key=value` checks in `options.ts` | `resolveAnswers(plan, given)` (all four question types, `when`, CLI strings, safe patterns) |
| `INSTALLED_FRAMEWORK_VERSION` + bundled fixture | the downloaded `catalogue.json` (bundled copy as offline fallback) |

During the switch, `toV1(index)` produces a format-1 file the old code accepts. Entries with non-select questions are dropped: activity-log, billing, inspector, invoicing, notification-channels, observability, social-login and translations.

### Exact differences from spike 13's fixture (`spikes/13-installer-v2/src/data/catalogue.json`)

These are pinned by `test/installer-fixture.test.ts`. Read as format 2, the fixture is refused as a whole ("format version 1; this reader understands 2"). Spike 13's own reader likewise refuses format 2.

**Structural** (from `compareWithV1`). Every fixture entry passes all v2 entry rules once these fields are filled:
1. `version` is 1 (format 2 needs 2).
2. The file has an unknown field `note`.
3. The file is missing `generator`, `manifestVersion`, `frameworkLines` and `history`.
4. Categories are missing `pickable`.
5. Every entry is missing `kind`, `origin`, `tags`, `docs`, `version`, `verified`, `versions`, `compatibility`, `requires`, `conflicts`, `installs` and `status`.
6. Follow-up questions have no `type` (format 1 is always single choice, so `"select"`).

**Content** (fixture vs catalogue v2 seed):
- `log-viewer` points at `@strutvane/logs`. It is now `@strutvane/log-viewer`; `logs` is retired.
- `backups` → catalogue v2 has `backup` (`@strutvane/backup`).
- `ai-sdk` → catalogue v2 id is `ai` (same package `@strutvane/ai`).
- These are not catalogue v2 packages; other packages cover them: `sitemap` → `cms` (§1.3), `geocoder` → `geo` (card 47), `virus-scanner` → `files` (card 9) and `calendar` → `resource-views` (§1.3).
- These are test-only fixtures, not real packages: `legacy-exports` and `spreadsheets`.
- These catalogue v2 packages are absent from the fixture:
  - agent-tools, auth, backup, browser-testing, cms, create-strutvane, dashboards, files, form-builder, framework, geo, log-viewer, mail-templates, oauth-server, observability, payments, redis, resource-views, social-login, sso, strutvane, ui;
  - plus the designs crisp and vivid.
- Categories: the fixture has 7; the hub has 12. It adds Sign-in and identity, Developer tools, App essentials, Designs (not pickable) and Core (not pickable).
- Fixture follow-ups that changed in the seed:
  - search drops the "database" engine (it stays in the framework);
  - realtime defaults to WebSockets;
  - ai adds Google and Ollama;
  - billing adds a `when`-gated confirm.

## Findings

1. **Lifecycle belongs in the hub, not in manifests.** Status changes without a release. Putting it in `hub.json` and cross-checking it against the release state catches both "available but unreleased" and "planned but released".
2. **The seed exposes a real roadmap gap.** Planned add-ons target framework `^1.0`, but five of them require `auth` or `ui`, which only have a `0.2` version planned (browser-testing, oauth-server, resource-views, social-login, sso). The builder warns: "works with framework 1.0 but requires "ui", which has no version for 1.0 yet". The resolver refuses those plans on 1.0 with a friendly error. The core train needs a 1.0 entry before those add-ons can ship.
3. **Zod 4's `z.record(z.enum([...]), …)` is exhaustive:** every enum key is required. A conformance file without a `design` result was "malformed" until it became `z.partialRecord`. Watch for this anywhere a record is keyed by an enum.
4. **Generic `const` inference turns off TypeScript's excess-property check.** `defineManifest({ …, postinstall: 'x' })` compiled until the parameter became `M & Record<Exclude<keyof M, keyof ManifestInput>, never>`. A type-level test now proves it fails.
5. **Regex safety needs two layers.** Removing groups and alternation stops exponential blow-ups, but V8 is still polynomial on adjacent overlapping quantifiers. The linear matcher handles 20 × 200-character worst cases in well under a second, where V8 would effectively hang.
6. **Question order follows the plan's step order** (requirements first, then by id), not the order of picks. That is what keeps answers order-independent; the installer should show the plan in that order.
7. *(unverified)* npm keeps custom `package.json` fields (`strutvane`) in the packument's per-version metadata, so hub CI needs no tarball downloads. The npm reader is tested with a fake registry only.

## Open questions (for the lead)

- Category list: 12 categories in `seed/hub.json` (the blueprint's 6 for question 22, plus Content, identity, developer tools, app essentials, designs and core). Is that the right split?
- Should `preview` packages be offered by `node strut add --preview` only, or also by the installer with `--preview`?
- Signed conformance results (provenance), so community CI can produce them instead of only the hub's nightly job.
