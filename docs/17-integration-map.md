# 17 — Integration Map: how every package connects

> **The rule ([D23](00-executive-summary.md)):** every connection between Strutvane packages is explicit, typed and listed here. If a connection isn't on this map, it isn't allowed. When you add a package or a connection, update this file in the same PR, and its RFC must reference the section it changes.

## 1. Who may depend on whom (compile time)

```
                         @strutvane/contracts      types + wire protocols, zero deps
                                   ▲
                         @strutvane/core           kernel: container, providers, config, errors,
                                   ▲               messages, events, hooks, context
        ┌──────────────┬───────────┼────────────┬───────────────┐
  framework          auth          ui          files       (future: notify, logs, …)
        ▲                                                       
       cli ── devkit   (CLI loads package installers/commands from the user's project at runtime)
```

- Product packages (`framework`, `auth`, `ui`, `files`, future ones) **never import each other**. They connect only through the six mechanisms in §2.
- CI enforces this with a dependency check in every repo. The integration repo enforces it across repos.

## 2. The six connection mechanisms

| # | Mechanism | What it carries | Example |
|---|---|---|---|
| 1 | **Contracts (types)** | Shared shapes | `Actor`, `QueryFilter`, `Problem`, `StoredFile` |
| 2 | **Container tokens** (provided at boot by service providers) | Live services behind a contract interface | auth provides `PermissionProvider`; framework calls it |
| 3 | **Hooks** | Interception points in another package's pipeline | auth hooks `onRequest` to resolve the actor and tenant |
| 4 | **Domain events** (outbox → queue) | Facts that others react to, asynchronously | `file.uploaded` → files generates image variants |
| 5 | **Installer `enhances`** and package.json contributions | Code and config added to an app when two packages meet; commands, installers, templates and migrations a package declares in its package.json, loaded by the CLI (§6.1) | `sv add auth` with ui present → login screens are generated; `sv migrate` applies auth's identity tables |
| 6 | **HTTP + manifest** | Runtime data between server and browser | ui reads `/.well-known/strutvane.json` and calls the CRUD API |

## 3. Container tokens: who provides what, who uses it, and what happens if it's missing

| Token (contract) | Provided by | Used by | If no package provides it |
|---|---|---|---|
| `PermissionProvider` | auth | framework (every request; the optional `filterableFields` member narrows client filters, sorts and search), files (downloads), ui-server | `local` env: allow-all with a loud warning banner. Any other env: **boot refuses to start** unless `security.publicApi: true` is set explicitly |
| `TenantResolver` | auth | framework, files (key prefix), queue (job context) | Single-tenant mode. Tenant-scoped models refuse to boot |
| `IdentityEngine` | auth (Better Auth / OIDC / native adapters) | auth only | — (internal to auth) |
| `AuditSink` | auth (DB table) / logs (future) | framework, files, auth | Audit events are logged as structured log lines (nothing is silently dropped) |
| `StorageManager` (`StorageDisk`) | framework core (`local`, `memory`); files adds cloud drivers | framework uploads, files, ui-server, future reports/exports | Always present (core) |
| `FileScanner` | files (ClamAV adapter) | files | Scanning disabled. Policy decides: refuse risky types, or accept them |
| `MessageCatalog` | core (+ every package registers its messages) | framework error handler, ui | Always present (core) |
| `Logger` | core (default: structured, redacting, stdout); **logs** replaces it with the full implementation (files/DB/OTel, viewer) | every package | Always present (core default). With `@strutvane/logs` absent, logs go to stdout and there is no viewer ([RFC-0004](rfcs/0004-logs-package.md)) |
| `Queue`, `Cache`, `Mailer` | framework | auth (emails, sessions), files (variants), notify (future) | `sync` / `memory` / `log` drivers in dev |
| `Clock`, `IdGenerator` | core | everyone (testable time, UUIDv7) | Always present (core) |

- **`PermissionProvider.filterableFields(actor, resourceType)`** is an optional member of the contract (contracts `c0161e8`). When a provider implements it, the framework intersects the returned set with its own client-queryable fields (which already exclude `hidden` fields) and rejects filters, sorts and search on any other field; when it is absent, the framework uses its own set. `@strutvane/auth` returns exactly the fields the actor may read ([07 §4.2](07-package-auth.md#42-policies-generated-per-model-owned-by-you)).
- **The role map adds no connection.** `config/auth.ts` roles are compiled inside auth and reach the framework only through this token (`can`, `filterFor`, `filterableFields`); the framework never reads role names.

## 4. Hooks: where packages plug into each other's pipelines

| Hook (owner) | Who uses it | For what |
|---|---|---|
| `http.onRequest` (framework) | auth | Resolve `Actor` + `TenantContext` into the request context; answer the auth endpoints (`/auth/sign-in`, …) by returning `response`, and add `headers` (refreshed session cookie) to the eventual response. Per-IP rate limits key on the payload's `clientAddress` |
| `resource.beforeQuery` (framework) | — (no package today) | Narrow the rows an action may touch. The framework gets the policy filter from `PermissionProvider.filterFor()` (§3) and ANDs a hook's filter with it, so a hook can only narrow results, never widen them |
| `resource.beforeWrite` (framework) | auth (`auth.fieldWrite`) | The last check before a create or update reaches the database. Auth refuses (403) a write that sends a field the actor may not write under the policy's field rules |
| `resource.serialize` (framework) | auth (`auth.fieldRead`) | Strip fields the actor may not read (field-level rules) from every record on its way out |
| `resource.after*` (framework) | auth (audit), files (commit or cleanup attached files) *(planned)* | Audit records, file lifecycle |
| `upload.validated` (framework) | files *(planned)* | Scan, quota check, dedupe |
| `manifest.build` (framework) | auth (`auth.fieldManifest`); files *(planned)* | Auth adapts each resource to the actor: fields the actor may not read are left out, fields they may not write are marked `readOnly`. Files will add file widgets and limits |
| `errors.register` (core) | every package | Register error codes and default messages ([RFC-0003](rfcs/0003-errors-and-messages.md)) |
| `http.onRequest` / `http.onResponse` / `errors.unhandled` (framework) | logs | Automatic request and exception logging (the `route` template from `http.onResponse` when known). The viewer at `/_strutvane/logs` answers through `http.onRequest` by returning `response`; its IP allow-list checks `clientAddress` ([RFC-0004](rfcs/0004-logs-package.md)) |
| `cli.register` (core) | every package *(planned)* | Add `sv` commands (`auth:*`, `files:*`, …). Today packages contribute commands through `strutvane.commands` in their package.json (§6.1) |

**HTTP hook protocol (contracts).** The payloads of `http.onRequest` and `http.onResponse` are defined in `@strutvane/contracts` (`HTTP_HOOKS`, `HttpRequestHookPayload`, `HttpResponseHookPayload`; [RFC-0001](rfcs/0001-contracts-v0.md)), so the framework and every hooking package compile against one definition:

- `HttpRequestHookPayload`: `request`, `actor`, `tenant`, and optionally `clientAddress`, `headers`, `response`. A handler may set `actor`/`tenant`, add response `headers`, or answer by setting `response` (it then caps request bodies itself, because routing and the framework body limit are skipped).
- `clientAddress` is the directly connected peer address. It is read from `X-Forwarded-For` only when the app sets `trustProxy` (a proxy it controls), never otherwise. Controls keyed by client address (per-IP rate limits, IP allow-lists) use it, and fail closed when it is unknown.
- `HttpResponseHookPayload`: `request`, `status`, `requestId`, and optionally `route`, the matched route template (`/api/v1/invoices/:id`). It is observe-only.

**Resource and manifest hook payloads (framework).** The framework defines these payloads; they are not part of `@strutvane/contracts` yet. `resource` is the model name, `type` its permission prefix (`InvoiceLine` → `invoiceLine`), `actor` the request's `Actor` or `null`.

| Hook | Payload | What a handler may do | When it runs |
|---|---|---|---|
| `resource.beforeQuery` | `resource`, `action`, `actor`, `filter` (the policy filter) | Return `{ filter }`; it is ANDed with the policy filter | Each time the framework computes a policy filter: lists, show, update, delete, included relations and reference checks |
| `resource.beforeWrite` | `resource`, `type`, `action` (`create` \| `update`), `actor`, `tenantId`, `input` (frozen: only the validated fields the client sent) | Refuse the write by throwing a Strutvane error (auth throws `ForbiddenError`, 403). It cannot change `input` | After the actor is allowed the action (for an update, after the row is found in scope) and before the resource's own `beforeCreate` / `beforeUpdate` hooks |
| `resource.serialize` | `resource`, `type`, `actor`, `record` (`hidden` fields already removed) | Return the payload with a changed `record` | For every record leaving the API: lists, show, create and update responses, included relations; before the resource's `transformResponse` |
| `manifest.build` | `actor`, `manifest` (`ResourceManifest`) | Return the payload with a changed `manifest` | Each time the manifest is built for an actor |

Auth registers its three handlers (`auth.fieldRead`, `auth.fieldWrite`, `auth.fieldManifest`) from the policies' field rules. They touch only fields that carry a rule, derive `type` from `resource` when it is missing, and fail closed: an error in a handler fails the request (500 or the thrown error), never returns a restricted field. Filters, sorts and search on unreadable fields are refused separately through `PermissionProvider.filterableFields` (§3).

## 5. Domain events: who emits, who reacts

| Event | Emitted by | Reacted to by |
|---|---|---|
| `<model>.created` / `.updated` / `.deleted` | framework | notify, search, webhooks *(future)* |
| `auth.user.registered`, `auth.login.failed`, `auth.role.assigned` | auth | notify (welcome email), logs/security |
| `tenant.created`, `tenant.suspended` | auth | files (provision storage prefix), billing *(future)* |
| `file.uploaded`, `file.scanned`, `file.deleted` | files | files (variants), search, audit |
| `logs.cleared`, `logs.exported` | logs | audit (who cleared or exported logs) |

Events are delivered at-least-once through the outbox. Every consumer must be idempotent, keyed by `idempotencyKey`.

## 6. Installer `enhances`: what appears when packages meet

Install order doesn't matter. Whichever package is installed second adds the connecting pieces.

| Installing… | …when this is present | Adds |
|---|---|---|
| auth | framework | auth migrations, `/api/v1/auth/*` routes, permission sync for every model, admin seed, protects all existing resources |
| auth | ui | login, register, forgot/reset, MFA, profile, users/roles admin, tenant switcher screens |
| ui | framework | `web/` shell with pages for every existing model |
| ui | auth | the same auth screens as above (so either order gives the same result) |
| files | framework | `config/filesystems.ts` cloud disks, `files` + `attachments` migrations, `file`/`image`/`files` field types, cleanup + variant jobs, `.env` + `.env.example` keys |
| files | ui | dropzone, progress, preview and gallery widgets registered for file fields |
| files | auth | file permissions (`file.download`, `file.delete`) and download policy integration |
| logs | framework | request and exception logging, viewer route `/_strutvane/logs`, `config/logs.ts`, `LOG_*`/`LOGS_*` keys in `.env` + `.env.example` |
| logs | auth | `logs.view`, `logs.export` and `logs.clear` permissions; tenant-scoped viewer |
| logs | ui | "Logs" entry in the app menu |

`sv remove <pkg>` reverses only that package's pieces and keeps every file you edited (it lists them).

### 6.1 Contributions declared in package.json (loaded by the CLI)

Besides its installer, a package can contribute to an app through the `strutvane` field of its own package.json. The CLI reads these at run time from the app's `node_modules`; there is no import between packages.

```json
{ "strutvane": { "commands": "./dist/commands.mjs", "installer": "./dist/installer.mjs",
                 "templates": "./dist/templates.mjs", "migrations": "./migrations",
                 "compat": "^0.1.0" } }
```

| Key | What it contributes | Loaded by |
|---|---|---|
| `commands` | `sv` commands (`auth:user:create`, `tenant:create`, …) | every `sv` run (`sv help` lists them) |
| `installer` | The package's installer | `sv add` |
| `templates` | Templates for owned files | `sv upgrade` |
| `migrations` | SQL migrations in `<folder>/<dialect>/*.sql` (e.g. `migrations/postgres/`) | `sv migrate`, `sv migrate:status` (framework commands) |

**Code contributions.** `commands` and `templates` are read only from dependencies listed in the app's own package.json with a contributor name (`@strutvane/*`, `strutvane-plugin-*`, `@scope/strutvane-plugin-*`); an `installer` only from the package named in `sv add`. In every case a third-party package must declare a `strutvane.compat` range the CLI satisfies (exit 7, `MISSING_COMPAT` / `INCOMPATIBLE_PACKAGE`), and the module must resolve, symlinks followed, inside the package's own folder in `node_modules` (`UNSAFE_CONTRIBUTION`) ([09 §11](09-cli-reference.md#11-extensibility-commands-from-packages-and-plugins)).

**Package migrations** run as the database owner role, so they pass a stricter gate. The CLI passes a package's folder to `sv migrate` / `migrate:status` only when **all** of these hold:

1. **Direct dependency:** the package is listed in the app's package.json. A transitive dependency never counts.
2. **Contributor name:** the same rule as code contributions.
3. **Enabled:** `strutvane.config.ts` has a value import from the package, which is what `sv add` writes when it registers the provider. Being installed is not enough, and an `import type` does not count.
4. **Compatible:** a third-party package declares a satisfied `strutvane.compat` (otherwise exit 7, `MISSING_COMPAT` / `INCOMPATIBLE_PACKAGE`).
5. **Contained:** the declared folder is a relative path and, symlinks followed, resolves inside the package's own folder in `node_modules` (otherwise `UNSAFE_CONTRIBUTION`).

A package that fails 1–3 is silently ignored by `sv migrate`, and `sv doctor` warns about it. A package that passes 1–3 but fails 4 or 5 stops the command, and `sv doctor` reports a failure.

The CLI vets the packages and hands the folders to the command (`ctx.packageMigrations()`). The framework never scans `node_modules` itself and applies no package migrations when it is not given any (an older CLI). As defence in depth it checks again, with `realpath`, that each dialect folder and each `.sql` file stays inside the package folder. `sv migrate --pretend` lists the package migrations with their package, and `sv migrate:status` names it in the `Source` column. Ordering and drift rules are in [06 §3.4](06-package-framework.md#34-package-migrations).

`@strutvane/auth` uses this to ship its identity tables (`migrations/postgres/<timestamp>_strutvane_auth_identity.sql`, idempotent), so `sv migrate` creates them ([07 §2.3](07-package-auth.md#23-migrations-default-tables-prefix-configurable-eg-auth_)).

## 7. Scenarios: every combination behaves sensibly

| Installed | Behaviour |
|---|---|
| framework only | API with validation, errors, storage (local) and OpenAPI. Permission provider required outside `local` (§3). |
| framework + auth | The above, plus identity, RBAC, tenancy (RLS), audit. Every resource is protected. |
| framework + ui | Generated UI with no login (dev only). Production boot refuses unless public access is declared. |
| framework + auth + ui | The full experience ([05](05-developer-experience.md)). |
| + files | File fields work end-to-end: upload, validation, storage, widgets, secure downloads. |
| + logs (installed by default) | Every request and error is logged with redaction. Viewer at `/_strutvane/logs`: local-only, or permission-gated with auth. Remove with `sv remove logs`. |
| ui only (external API) | The UI is built from OpenAPI inference plus `ui.resources.ts`, with OIDC or custom auth through providers. |
| auth only (in an Express/Nest app) | Identity, policies and tenancy via framework adapters ([07](07-package-auth.md)). |

## 8. Version compatibility

- Every package declares `peerDependencies` on `@strutvane/contracts` and `@strutvane/core` with the same major version, i.e. the shared release train ([10](10-repositories-publishing-versioning.md)).
- `sv doctor` checks all installed `@strutvane/*` versions against each other, and explains any mismatch along with the exact command to fix it.
- The nightly `integration` repo installs every combination from §7 and runs the generated apps' tests. This catches broken connections before users do.

## 9. Checklist for a new package or connection

- [ ] Which of the six mechanisms (§2) does it use? Never a direct import.
- [ ] New contract types? Then write an RFC and a contracts release on `next` first.
- [ ] New container token? Add a row to §3, including its behaviour when nothing provides it.
- [ ] New hooks or events? Add rows to §4/§5. Event consumers must be idempotent.
- [ ] Installer `enhances` in both directions? Add rows to §6, and confirm install order doesn't change the result.
- [ ] Contributes commands, an installer, templates or migrations through package.json? Follow the gate in §6.1.
- [ ] Scenario rows in §7 updated, and the integration repo covers them.
- [ ] Error codes and messages registered ([RFC-0003](rfcs/0003-errors-and-messages.md)).
