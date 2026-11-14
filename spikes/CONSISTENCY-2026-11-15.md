# Consistency decisions (coordinator, 2026-11-15)

The docs pass found places where the blueprint and the spikes disagree. When a mismatch like this ships, packages don't connect. This file **decides each one**.
- **Owner** is where the fix goes.
- Fixes are dispatched once the audit agents release those folders.
- Rows marked **(lead)** need the project lead's confirmation. Everything else is a coordinator decision under "whatever is best, you decide" (2026-11-14).

## Installer and Docker

| # | Topic | Decision | Owner |
|---|---|---|---|
| 1 | Setup step order | Follow spike 13: files → secrets → ports → database → install → migrate/seed → git. Update blueprint §2.1 to match. | blueprint |
| 2 | Exit code 1 | "Nothing was created" (spike 13). | blueprint |
| 3 | Unpublished packages in the installer | **A question that brings a package is shown only when that package is published and compatible** (from the catalogue). In 0.2 that hides agent-tools, redis, files, observability, health, sso, oauth-server, ai, mcp-server, realtime, activity-log and charts. Spike 13 keeps the full list behind a `--preview-catalogue` dev flag for testing. | spike 13 |
| 4 | Package phases | Blueprint §10 is the single source. The checklist, catalogue seed and docs data follow it. | checklist, spike 21, docs |
| 5 | Log viewer and backup names | `@strutvane/log-viewer` (ADR-0022) and `backup` (singular). | spike 13 fixture, spike 21 |
| 6 | Docker service commands | Keep all of them: `services:up`, `services:down`, `services:status`, `services:logs`, `db:shell`. `services:down --volumes` deletes data, so it asks for confirmation (and needs `--force` with no terminal). | spike 13 |
| 7 | Production Dockerfile logging | It sets `LOG_CHANNEL=stderr` and `LOG_FORMAT=json` (ADR-0022). | spike 13 |
| 8 | Node on the host in Docker mode | Correct the wording: the `strut.js` forwarder needs Node on the host, but nothing else does. | blueprint, docs |
| 9 | Fresh clone | `npm run setup` works from the **committed** `strutvane.json`. The local progress file is optional. | spike 13 |
| 10 | Is `.strutvane/` committed? | Yes, for generated types, resources and the client. Local state goes in `.strutvane/local/`, which is git-ignored. | spike 13, blueprint §3.1 |
| 11 | Strict profile label | It names HSTS preload. | spike 13 |
| 12 | Question 35 help text | "Docker image (Kubernetes, Fly, Cloud Run, ECS)" maps to the value `docker`. | spike 13 |
| 13 | `help` vs `list` | `node strut list` is the command; `help` is an alias. | spike 13 |
| 14 | `DB_CONNECTION` value | `pgsql`, as in Laravel, with `postgres` accepted as an alias. The values are `mysql`, `pgsql` and `sqlite`. | spikes 12 and 13 |
| 15 | Commands printed before they exist | The installer prints only commands that exist. Unbuilt ones are stubs that exit non-zero with a clear "coming in the framework" message. | spike 13 (audit in progress) |

## Security and CSRF

| # | Topic | Decision | Owner |
|---|---|---|---|
| 16 | Middleware syntax | `static readonly middleware = [...]` on controllers. Groups use the Laravel callback form, `Route.middleware('csrf').group(() => { … })`, and the array form stays as an overload. Helpers are `csrf_field(ctx)` and `csrf_meta(ctx)`. `<CsrfField />` is built in `@strutvane/ui`. | blueprint §5.2, spike 12, ui |
| 17 | Front-end token | The framework sets an `XSRF-TOKEN` cookie (readable by JS, `SameSite=Lax`). The generated client and ui forms send `X-XSRF-TOKEN`. | framework, ui |
| 18 | Exception patterns | Patterns match the full path (`api/webhooks/*`). The docs explain this, and a boot warning fires when a pattern can never match a registered route. | spike 12, docs |
| 19 | `APP_DEBUG=true` in production | The app **refuses to boot** unless `--force-debug` is given (fail closed, §5.2). | spike 12 |
| 20 | Untrusted Host status | 400 (Laravel/Symfony behaviour). | spike 13 README, docs |
| 21 | Named rate limiters | `api`, `login`, `password-reset` and `aggregate`. The store is the cache (the database by default, Redis optionally), not in-memory, so limits hold across processes. | framework |

## Auth

| # | Topic | Decision | Owner |
|---|---|---|---|
| 22 | Default engine | **(lead)** The native engine (spike 20) replaces Better Auth as the default. Proposed ADR-0023 supersedes ADR-0005/0013. | ADR |
| 23 | Keyed token hashes vs `key:rotate` | Verification tries `APP_KEY` and then every `APP_PREVIOUS_KEYS` entry, and rehashes under the current key on success. Rotation signs nobody out. | spike 20 |
| 24 | Session cookie name | `strutvane_session`. | spike 20 |
| 25 | Feature names (one list, used everywhere) | `registration`, `emailVerification`, `passwordReset` (always on), `passwordConfirmation`, `twoFactor`, `passkeys`, `emailLink`, `apiTokens`, `teams`, `impersonation`. | spikes 20 and 13, blueprint §6 |
| 26 | Feature switches location | Features live in `config/auth.ts`, written by the installer, not in `AUTH_*` env keys. `AUTH_SECRET` is removed; `APP_KEY` is the root secret. | spike 13 |
| 27 | Role preset names | `admin-member` and `admin-manager-member-viewer`. | spike 13 |
| 28 | Defaults | The library defaults to everything optional off. The installer writes what the user chose explicitly. Both are documented. | docs |
| 29 | Generated admin password | **Must be changed at first sign-in**, enforced by auth. A typed password isn't forced. | spike 20 |
| 30 | Cross-origin refusal response | 419 with problem code `csrf_token_mismatch`, in the same RFC 9457 shape everywhere. | spike 20 |

## Designs, charts, API

| # | Topic | Decision | Owner |
|---|---|---|---|
| 31 | Theme override tokens | The design contract defines **public override tokens** `--brand-hue`, `--font-sans`, `--radius` and `--density`. Every design maps them onto its internal tokens (Crisp: `--accent*`, `--font-ui`, `--shape-*`). The conformance kit checks that an override changes the rendering. | spikes 19 and 17, ui contract |
| 32 | Where charts live | The `@strutvane/charts` package (catalogue), not `@strutvane/ui`. Blueprint §5.1 is corrected. | blueprint |
| 33 | API prefix | `/api`, as in Laravel. Versioning (`/api/v1`) is opt-in through `Route.prefix`. Spike 16 changes to `/api`. | spike 16 |

## CLI and files

| # | Topic | Decision | Owner |
|---|---|---|---|
| 34 | App file names | Models stay plain: `app/models/post.ts`. Every other kind of file takes a dot suffix: `post.policy.ts`, `post.seeder.ts`, `post.factory.ts`, `database.seeder.ts`, `post.controller.ts`. | spikes 12 and 13, blueprint §3.1 |
| 35 | `--seeder` flag | `make:migration … --seeder` creates the seeder **and** its factory, because the seeder uses it. `--factory` alone creates only the factory. | spike 12 |
| 36 | Migrations table | `migrations`, as in Laravel. | spike 13 |
| 37 | `ui:sync` | A `node strut ui:sync` command, also run by `sync` and by `migrate`. | spike 14 |
| 38 | What `sync` regenerates | Only outputs of installed packages (charts only when `@strutvane/charts` is installed). | blueprint §2.2 |
| 39 | Logging keys and flags | Add `LOG_PATH`, `LOG_SLACK_WEBHOOK_URL` and `LOG_DEPRECATIONS_CHANNEL` to blueprint §5.3. `log:tail` takes `--level=`, `--channel=`, `--grep=`, `--since=` and `--follow` (the default). A `custom` driver is `{ driver: 'custom', via: (config) => Transport }`. | blueprint, logs branch |
