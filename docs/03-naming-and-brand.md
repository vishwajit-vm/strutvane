# 03 — Naming & Brand

> **Legal disclaimer.** Everything below is **technical availability** (npm, GitHub, domain registries via RDAP) plus **informal web searches** on **2026-11-13**. It is **not** a trademark clearance opinion, and **no name here is claimed to be legally available.** Before public launch, commission a professional clearance search: USPTO, EUIPO, WIPO Global Brand Database and India IP, Nice classes 9 and 42 at minimum. Availability can change at any moment; reserve early (§6).

## 1. Recommendation

| Item | Value |
|------|-------|
| **Ecosystem brand** | **Strutvane** |
| Pronunciation | /ˈstrʌt.veɪn/ ("STRUT-vane") |
| Meaning | *Strut*: the structural member that carries load; *vane*: the blade that sets direction. "The structure that points the way." |
| npm scope | **`@strutvane`** (every package lives here; nobody else can ever publish into it) |
| CLI package | unscoped **`strutvane`** (bin `strutvane`; project script alias **`sv`** → `pnpm sv make:model`) |
| Starter | unscoped **`create-strutvane`** → `npm create strutvane@next` |
| GitHub org | **`strutvane`**: one repo per package ([10](10-repositories-publishing-versioning.md)) |
| Domains | `strutvane.com`, `.dev`, `.io`, `.org`, `.sh`: all **unregistered** at check time |
| Trademark class | Coined/fanciful word, the **strongest** trademark category (no descriptive meaning in software) |

### Package names

| Package | Purpose | Repo |
|---------|---------|------|
| **`@strutvane/framework`** | Backend & database: the core framework (models, migrations, CRUD API, OpenAPI, queue, cache, mail) | `strutvane/framework` |
| **`@strutvane/auth`** | Authentication, authorization (RBAC/ABAC), tenancy, audit, auth API + screens | `strutvane/auth` |
| **`@strutvane/ui`** | Frontend: API-driven CRUD UI, auth screens, layouts, themes, owned components | `strutvane/ui` |
| `@strutvane/core` | Kernel: app, container, providers, config, env, context, events, hooks, plugins | `strutvane/core` |
| `@strutvane/contracts` | Shared types & wire protocols (zero runtime deps) | `strutvane/contracts` |
| `@strutvane/devkit` | SDK for installers, generators, plugins | `strutvane/devkit` |
| `@strutvane/cli` + `strutvane` | CLI implementation + unscoped launcher | `strutvane/cli` |
| `create-strutvane` | Project starter (presets: full, api, ui) | `strutvane/create-strutvane` |

**Future packages follow the same pattern:** `@strutvane/notify`, `files`, `payments`, `billing`, `logs`, `reports`, `analytics`, `search`, `realtime`, `i18n`, `flags`, `webhooks`, `workflows`.

**Community convention:** `strutvane-plugin-<name>` or `@<their-scope>/strutvane-<name>`, with the npm keyword `strutvane-plugin` for discovery in the CLI and docs.

### Why descriptive package names under a coined brand (and not a coined name per package)

We tested both strategies. Coined per-package names (Laravel-style "Sanctum/Horizon") failed repeatedly in this market:

- Real-word candidates were already taken in the same niche:
  - `gatehouse` is an RBAC package for Next.js.
  - `rampart` is a Node.js authorization module.
  - `quarry` is a REST database tool.
  - `groundwork` is a scaffolding CLI.
- Coined candidates collided with companies:
  - `gardiq` with Crowcon's "Xgard IQ".
  - `sentoriq` with SENTRIQS.
  - `strutiq` with StructIQ.

Each future package would need its own clearance, and newcomers can't guess what "Sanctum" does. **A unique scope plus capability names** (as with NestJS, Angular and TanStack) gives:

1. **Guaranteed uniqueness:** npm scopes are exclusive.
2. **Instant comprehension:** `npm i @strutvane/auth` needs no explanation.
3. **Unlimited ecosystem growth** without new trademark work per package.
4. **One brand** to protect, market and search for.

Product nicknames can still be used in marketing later if desired.

## 2. Evidence for "strutvane" (checked 2026-11-13)

| Check | Endpoint | Result |
|-------|----------|--------|
| npm package `strutvane` | `registry.npmjs.org/strutvane` | **404, free** |
| npm scope `@strutvane` | `registry.npmjs.org/-/org/strutvane/package` | **404, free** |
| npm `create-strutvane`, `strutvane-cli` | registry | **404, free** |
| GitHub user/org `strutvane` | `api.github.com/users/strutvane` | **404, free** |
| GitHub repositories mentioning it | search API | **0** |
| GitHub code mentioning it | code search API | **0** |
| `strutvane.com` | Verisign RDAP | **404, unregistered** |
| `strutvane.dev` | Google Registry RDAP | **404, unregistered** |
| `strutvane.io` / `.sh` | Identity Digital RDAP | **404, unregistered** |
| `strutvane.org` | PIR RDAP | **404, unregistered** |
| Web search `"Strutvane"` | general web | **No page uses the term.** Results only covered the generic words "strut" and "strut channel". |
| Trademark | not searched in primary registers | ⚠️ Professional search required (§5) |

Raw output for all rounds is in [research/naming-checks-2026-11-13.md](research/naming-checks-2026-11-13.md).

## 3. How we got here: selection process

| Round | Strategy | Outcome |
|-------|----------|---------|
| 1 | ~40 masonry/architecture dictionary words (ashlar, quoin, plinth, corbel, joist, lintel…) | All taken on npm and/or GitHub |
| 2 | Compounds with "-kit" (mortarkit, hewnkit, ashlarkit…) | `mortarkit` was technically free, but has a "Mortar Kit" game item and **Mortar, LLC pending Class 9 applications**. `ashlarkit` hit a **live USPTO "ASHLAR" mark (Reg. 6024246, software)**. `hewnkit` overlaps the npm `hewn` project-creation CLI. |
| 3 | Themed product words per package (gatehouse, groundwork, quarry, rampart, portcullis, fresco…) | Same-niche conflicts (see §1) |
| 4 | Coined per-package "-iq" family (gardiq, strutiq, vistriq, sentoriq, facadiq) | Company/product collisions; abandoned per-package coinage |
| 5 | **Coined umbrella brands** (keldara, arkavel, brikvel, lithavel, gatrova, strutvane…) checked for npm pkg + scope, GitHub owner + repos + code, .com, .dev | **`strutvane`: zero on every check.** Runners-up: `lithavel` (6 code hits; "-avel" too close to "Laravel"), `brikvel` (14 code hits; same "-vel" concern), `gatrova` (73 code hits) |

Brand quality criteria applied:

- Pronounceable on first read.
- Spelled the way it sounds.
- 2 syllables.
- No unfortunate meanings found in major languages.
- Not derivative of "Laravel" (avoids confusion and trademark risk with Laravel LLC).
- Works as a CLI word.
- Distinct from existing developer tools.

## 4. Backup brands (if clearance fails)

| Name | npm | scope | GitHub | repos / code hits | .com | .dev | Notes |
|------|-----|-------|--------|-------------------|------|------|-------|
| `gatrova` | free | free | free | 0 / 73 | free | free | Re-check code hits before use |
| `brikvel` | free | free | free | 0 / 14 | free | free | "-vel" echoes Laravel |
| `lithavel` | free | free | free | 0 / 6 | free | free | "-avel" echoes Laravel |
| `wardqen` / `gardvane` | free | free | free | 0 / — | free | free | Less euphonic |

## 5. Trademark next steps (owner: project lead)

1. Run knock-out searches: USPTO (Trademark Search), EUIPO eSearch, WIPO Global Brand Database, IP India.
2. Have counsel run a full clearance on **STRUTVANE** in classes 9 (downloadable software) and 42 (SaaS / software development services).
3. Consider an intent-to-use filing before the public launch announcement.
4. Record the evidence (dates, screenshots, search exports) in `docs/research/`.

## 6. Reservation checklist (do immediately: names can be taken at any time)

- [x] **npm:** done on 2026-11-13.
  - [x] Org [`strutvane`](https://www.npmjs.com/org/strutvane) created (free plan). Owner: npm user `vishwajitjitvm`, who has 2FA enabled (auth-and-writes).
  - [x] Placeholder `0.0.0-reserved.0` (dist-tags `latest` and `reserved`) published for `strutvane`, `create-strutvane` and `@strutvane/{framework,auth,ui,core,contracts,devkit,cli}` (2026-11-13), plus `@strutvane/logs` (2026-11-13, RFC-0004). Each contains only a README pointing to its repo, plus LICENSE and package.json.
    - npm's staged publishing also created an automatic `0.0.0-stage` placeholder version on each package.
    - Publishing used a short-lived granular token with bypass-2FA. **Revoke it** after use.
  - [ ] Configure **trusted publishing** (GitHub Actions OIDC) per package before the first real release (`0.1.0`).
- [x] **GitHub:** repos created on 2026-11-13 in the org [`vishwajit-vm`](https://github.com/vishwajit-vm) (see [10](10-repositories-publishing-versioning.md)).
  - [ ] Optional: a dedicated `strutvane` org.
- [ ] **Domains:** register `strutvane.com`, `.dev`, `.io`, `.org`. Optionally `.sh` and `.app`.
- [ ] **Social:** claim handles on X, Bluesky, Mastodon, Discord, YouTube, LinkedIn and dev.to.
- [ ] **Re-check:** re-run the check script on the reservation day and save the output.

## 7. Brand system (draft)

- **Taglines:**
  - "Declare the model. Ship the app."
  - "The TypeScript framework for serious business apps."
  - "Structure that points the way."
- **Voice:** precise, calm, engineering-first, honest about trade-offs. No hype.
- **Visual concept:** a strut-and-vane mark, a diagonal structural line meeting a directional blade. Primary colour is deep steel blue; accent is signal amber.
- **Naming rules for future packages:** lowercase capability nouns under `@strutvane/`, never cute names. One word if possible (`notify`, `files`, `payments`).
