# TEMPLATE: Upgrade Guide (one per breaking line)

> **For the docs agent and for contributors.** Copy this into the docs of the *new* line as `upgrade` ("Upgrading to 0.3 from 0.2"). It follows the format of Laravel's upgrade guide ([laravel.com/docs/13.x/upgrade](https://laravel.com/docs/13.x/upgrade), studied 2026-11-14) and the draft [ADR-0020](../adr/0020-versioning-branches-and-support-policy.md).
>
> **Rules:**
> - **Every breaking PR adds its own entry in the same PR.** CI's `api-report` check fails a breaking change without one. Never write the guide at release time.
> - **Pick the likelihood honestly** (what share of apps hit this):
>   - **High:** most apps; it's in the default install, generated code or common config.
>   - **Medium:** apps that use a common optional feature.
>   - **Low:** a specific, less-used API or behaviour.
>   - **Very Low:** custom driver or contract implementers, edge cases.
> - **Every entry has five parts:**
>   - what changed;
>   - *why*;
>   - who is affected;
>   - before/after code;
>   - how to keep the old behaviour, when that's possible.
>   Write in the second person and in plain words.
> - Group entries by area, in this order: Dependencies, Installer, Configuration, Database & migrations, ORM, Routing & controllers, Validation, Auth, Authorization & tenancy, UI, CLI, Logging, Queue/Mail/Cache (later lines), Testing, Miscellaneous. Within an area, order entries by likelihood, highest first.
> - Keep the three index lists at the top in sync with the entries (a docs lint can check the anchors).
> - Delete these instructions and every `> Note:` when publishing.

---

# Upgrade Guide

- [Upgrading to {{NEW}} from {{OLD}}](#upgrading)
  - [Upgrading with an AI agent](#upgrading-with-an-ai-agent)

## High impact changes

- [Updating dependencies](#updating-dependencies)
- [Example: renamed `xyz` config key](#renamed-xyz-config-key)

## Medium impact changes

- [Example: pagination `meta` field renamed](#pagination-meta-field-renamed)

## Low impact changes

- [Example: `Model.factory().make()` no longer saves relations](#factory-make-relations)

## Upgrading to {{NEW}} from {{OLD}} {#upgrading}

#### Estimated upgrade time: {{N}} minutes

> Note: measure this by upgrading the acceptance app (Northwind Ops) and one generated app with every package installed. Round up.

We try to document every breaking change. Many are in parts of the framework your app may not use, so only some of them may affect you. Work from the top: high impact first.

**Before you start:**
1. Update to the newest {{OLD}} release (`npm update`) and fix every deprecation warning. Run your tests with `STRUTVANE_DEPRECATIONS=throw` to find them.
2. Commit your work, so `git diff` shows exactly what the upgrade changed.
3. Read [Strutvane {{NEW}}'s Node requirement](/docs/{{version}}/releases#support-policy). {{NEW}} needs Node {{NODE_RANGE}}.

### Upgrading with an AI agent

> Note: include this section once `@strutvane/agent-tools` ships version-matched docs and an upgrade skill (Laravel's equivalent is a Boost slash command). Until then, link the "Copy as Markdown" version of this page and say: "Paste this guide into your coding agent together with `node strut about --json`."

### Updating dependencies

**Likelihood of impact: High**

Update these entries in your `package.json`:

- `@strutvane/framework` to `^{{NEW}}.0`
- `@strutvane/auth` to `^{{NEW}}.0`
- `@strutvane/ui` to `^{{NEW}}.0`
- `{{ADD_ON}}` to `^{{ADD_ON_VERSION}}` *(list each add-on whose supported framework range changed)*

Then run:

```bash
npm install
node strut migrate        # applies any new framework tables and regenerates types, API and UI
node strut doctor         # reports anything still on the old line's conventions
```

### Configuration

#### Renamed `xyz` config key {#renamed-xyz-config-key}

**Likelihood of impact: High**

> Note: example entry showing the expected shape. Replace it.

**What changed.** The `session.xyz` option in `config/session.ts` is now `session.abc`.

**Why.** `xyz` suggested it controlled cookies, but it controls the store. The new name matches what it does.

**Who is affected.** Every app created before {{NEW}}, because the starter wrote this key.

```ts
// {{OLD}}
export default defineConfig({ xyz: 'database' })

// {{NEW}}
export default defineConfig({ abc: 'database' })
```

**Keeping the old behaviour.** The old key still works in {{NEW}}. It logs `STRUTVANE_DEPRECATED_SESSION_XYZ` once per process and will be removed in {{NEXT}}.

### API conventions

#### Pagination `meta` field renamed {#pagination-meta-field-renamed}

**Likelihood of impact: Medium**

**What changed.** …

**Why.** …

**Who is affected.** Apps with API clients that read `meta.total` directly. The generated typed client and `@strutvane/ui` are already updated.

```jsonc
// {{OLD}}
{ "data": [], "meta": { "total": 120 } }

// {{NEW}}
{ "data": [], "meta": { "totalCount": 120 } }
```

**Keeping the old behaviour.** Set `api.pagination.legacyMeta: true` in `config/api.ts` until your clients are updated. This option is removed in {{NEXT}}.

### ORM

#### `Model.factory().make()` no longer saves relations {#factory-make-relations}

**Likelihood of impact: Low**

…

### Contracts and drivers

#### `CacheStore` contract: new `touch` method

**Likelihood of impact: Very Low**

If you wrote a custom cache store, add this method:

```ts
touch(key: string, seconds: number): Promise<boolean>
```

### Miscellaneous

We also recommend comparing the starter between the two lines. Many of the differences aren't required, but you may want to keep your app's files in line with a new app's. Some are covered above; others, such as comments or new optional config, aren't. View them with the GitHub comparison tool, limited to the starter templates:

`https://github.com/vishwajit-vm/strutvane/compare/v{{OLD_LAST}}...v{{NEW}}.0` (then open `packages/create-strutvane/templates/`)

The full list of changes in {{NEW}} is in the [release notes](/docs/{{version}}/releases) and each package's `CHANGELOG.md`.
