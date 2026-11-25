# 07 — Package Spec: `@strutvane/auth`

> **Status:** planning.
> **Depends on:** `@strutvane/contracts`, `@strutvane/core`.
> **Optional integration:** `@strutvane/framework`, `@strutvane/ui`.
> **Canonical decisions:** D12 (auth) and D13 (tenancy) in [00](00-executive-summary.md).

## 1. Scope and boundary

`@strutvane/auth` answers four questions for any Node/TypeScript app, with or without the rest of Strutvane:

1. **Who is this?** Authentication, delegated to identity adapters.
2. **Which tenant are they acting in?** Tenancy resolution and isolation.
3. **What may they do, to which records and fields?** Authorization, which is native.
4. **Was it recorded?** Audit, which is native.

It produces the `Actor`, `TenantContext` and `PermissionCheck → Decision` contracts. The framework, UI and every future package consume those contracts; none of them import auth internals.

### 1.1 Build vs. adopt

| Capability | Decision | Reason |
|------------|----------|--------|
| Password hashing, sessions, OAuth/OIDC client flows, magic links, TOTP, passkeys, account linking | **Adopt** through the `IdentityEngine` adapter. Default: **Better Auth** (MIT, 1.7.x; acquired by Vercel 2026-07, still MIT). | Mature, widely used, plugin model, and it already maintains Auth.js. Rebuilding is high-risk with little differentiation. |
| Enterprise SSO (SAML 2.0, OIDC with Entra ID / Okta / Keycloak / Auth0 / Google Workspace) | **Adopt**: Better Auth SSO plugin, or a direct OIDC adapter (`openid-client`) / SAML adapter | Standards-based; isolated behind the adapter |
| SCIM 2.0 provisioning | **Adopt** (Better Auth SCIM) behind our own `ProvisioningProvider` interface | Better Auth's SCIM API changed in 1.7 (decoupled from organizations). Our interface absorbs that churn. |
| Machine auth: API tokens, service accounts, OAuth 2.1 client credentials, JWT for APIs | **Native thin layer** on `jose` and `@oslojs/crypto` | Must integrate tightly with tenancy, RBAC and audit |
| **Authorization** (RBAC, ABAC, field-level, row-level → SQL) | **Native, the core differentiator** | No open-source, DB-aware TypeScript equivalent exists |
| **Tenancy** (resolution, isolation, RLS integration) | **Native** | Same |
| **Audit log** | **Native** | Same; it is paywalled in Strapi, Payload and React Admin EE |
| Minimal native identity engine | **Native, optional**, built only from primitives: argon2id (`@node-rs/argon2`), `jose`, `arctic` (OAuth), `@simplewebauthn/server` | An exit if the default engine's governance or licence changes |

### 1.2 The `IdentityEngine` adapter contract (sketch)

```ts
export interface IdentityEngine {
  name: string
  schema(): SchemaContribution                      // tables the engine needs → merged into our migration stream
  handler(): (req: Request) => Promise<Response>    // mounts /api/v1/auth/* flows
  getSession(req: Request): Promise<IdentitySession | null>
  revokeSession(id: string): Promise<void>
  users: { create; findByEmail; update; delete; link; unlink }
  capabilities: Set<'password' | 'magicLink' | 'oauth' | 'passkey' | 'totp' | 'sso-oidc' | 'sso-saml' | 'scim'>
}
```

`@strutvane/auth` maps an `IdentitySession` to our `Actor` by loading memberships, roles and the active tenant. From then on only `Actor` is used.

## 2. What `sv add auth` generates

The installer follows the standard protocol: idempotent, reversible with `sv remove auth`, and it never overwrites edited files; instead it lists them.

### 2.1 Prompts (or flags)

```
◆ Sign-in methods    › ☑ Email + password ☐ Magic link ☑ Google ☐ Microsoft (Entra ID) ☐ GitHub ☐ Passkeys
◆ MFA                › Optional | Required for admins | Required for all | Off
◆ Registration       › Open | Invite-only | Disabled (SSO/SCIM only)
◆ Multi-tenant?      › No | Yes — shared DB + RLS | Yes — schema per tenant | Yes — DB per tenant
◆ Sessions           › Cookie sessions (database) | Cookie sessions (Valkey) | JWT + refresh (SPA/mobile)
◆ Audit log          › Yes (recommended) | No
```

```bash
pnpm sv add auth --methods email,google --mfa optional --registration open --tenancy shared --sessions database --audit
```

### 2.2 Files

```
config/auth.ts                         ← methods, sessions, password policy, role→permission defaults
config/tenancy.ts                      ← only when tenancy is enabled
app/policies/user.policy.ts  role.policy.ts  tenant.policy.ts
app/providers/auth.provider.ts         ← registers the identity engine, resolvers, hooks
app/mail/auth/                         ← verify-email, reset-password, magic-link, invite, new-device templates
database/migrations/<ts>_enable_rls_policies.sql           (tenancy: shared)
database/seeders/auth.seeder.ts       ← system roles, permission catalogue, admin user
tests/feature/auth/*.test.ts          ← login, MFA, lockout, reset, roles, tenant isolation
web/pages/auth/…                       ← only when @strutvane/ui is installed (§2.6)
```

No `app/models/user.model.ts` or `app/models/tenant.model.ts` is generated: accounts, tenants and memberships live in the auth identity store (§5, §6), and app data about a user or a tenant is keyed by the actor id or the tenant id. The identity tables are not written into `database/migrations/` either: they ship with the package as a package migration (§2.3).

### 2.3 Migrations (default tables; prefix configurable, e.g. `auth_`)

| Group | Tables |
|-------|--------|
| Identity (owned by the identity adapter's schema, mapped into our migration stream) | `users`, `accounts`, `sessions`, `verifications`, `mfa_factors`, `passkeys` |
| Machine auth | `api_tokens`, `service_accounts`, `oauth_clients` |
| Tenancy | `tenants`, `tenant_domains`, `memberships`, `invitations`, `teams`, `team_members` |
| Authorization | `roles`, `role_permissions`, `role_inherits`, `assignments`, `permission_catalog` |
| Enterprise | `sso_connections`, `scim_tokens`, `impersonation_sessions` |
| Audit | `audit_events` (Postgres: monthly partitions) |

**Implemented today (persistent identity).** With `session.driver: 'database'` on PostgreSQL (§2.4), the identity tables are Better Auth's schema (`user`, `account`, `session`, `verification`, `organization`, `member`, `invitation`) plus `strutvane_rate_limits` for the auth rate-limit counters. The package ships them as a **package migration**, `migrations/postgres/<timestamp>_strutvane_auth_identity.sql` (declared as `"strutvane": { "migrations": "./migrations" }`, written with `IF NOT EXISTS`, so it is idempotent). `sv migrate` applies it with the app's own migrations once the app enables auth in `strutvane.config.ts` ([06 §3.4](06-package-framework.md#34-package-migrations), [17 §6.1](17-integration-map.md#61-contributions-declared-in-packagejson-loaded-by-the-cli)), so no separate auth step is needed.

`sv auth:migration` is kept as an optional tool. It compares the database with the tables persistent sign-in needs and writes only what is missing to `database/migrations/<timestamp>_auth_identity.sql`, also with `IF NOT EXISTS`, so it and the package migration can run in either order. Use it for apps without the framework's migrator, or to pick up a schema change.

### 2.4 Environment keys

Appended to `.env` (values filled in) and `.env.example` (empty, commented):

```dotenv
# ─── Auth (@strutvane/auth) ─────────────────────────────────────
AUTH_SECRET=                  # generated; rotate: pnpm sv auth:secret:rotate
AUTH_SESSION_DRIVER=database  # database | memory (see below)
AUTH_SESSION_LIFETIME=120     # idle minutes
AUTH_SESSION_ABSOLUTE=1440    # absolute minutes
AUTH_JWT_TTL=900              # access-token seconds (jwt driver / API tokens)
AUTH_REFRESH_TTL=2592000      # refresh-token seconds
AUTH_ALLOW_REGISTRATION=false # public sign-up is off by default
AUTH_MFA=optional             # off | optional | admins | required
AUTH_PASSWORD_MIN=12
AUTH_PASSWORD_BREACH_CHECK=false   # HIBP k-anonymity
AUTH_GOOGLE_CLIENT_ID=
AUTH_GOOGLE_CLIENT_SECRET=
AUTH_MICROSOFT_TENANT_ID=
AUTH_MICROSOFT_CLIENT_ID=
AUTH_MICROSOFT_CLIENT_SECRET=
SEED_ADMIN_EMAIL=admin@acme.test
SEED_ADMIN_PASSWORD=          # generated at install, printed once

# ─── Tenancy ────────────────────────────────────────────────────
TENANCY_ENABLED=true
TENANCY_STRATEGY=shared       # shared | schema | database
TENANCY_RESOLVE=subdomain,header,session
```

#### Session driver and persistent identity

`AUTH_SESSION_DRIVER` feeds `config/auth.ts` `session.driver`, which selects the identity engine together with `config/database.ts`:

| `session.driver` | Database | Identity engine |
|------------------|----------|-----------------|
| `database` (generated default) | PostgreSQL (`postgres`, `azure-postgres`) | **Better Auth** on the app's own database: accounts, sessions, tenants and memberships survive restarts and are shared by every process |
| `database` | anything else | native engine, in memory, with a boot warning (persistence needs PostgreSQL today) |
| `memory`, or unset | any | native engine, in memory: development and tests |

Cookie sessions in Valkey and JWT + refresh sessions (the other options in §2.1) are planned. Until they exist, any other value falls back to the native in-memory engine with a warning.

The persistent engine fails the boot, with the fix in the message, when `better-auth` or `pg` is not installed, when `AUTH_SECRET` is shorter than 32 characters, or when the auth tables are missing (run `sv migrate`, which applies auth's package migration; §2.3). `create-strutvane` handles this for PostgreSQL apps with auth: it adds the pinned `better-auth` dependency, and its printed next steps and project README run `sv migrate`, which creates the tables.

### 2.5 API routes (auto-registered under `API_PREFIX/API_VERSION`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/auth/register` | Create account (if registration is open) |
| POST | `/api/v1/auth/login` | Email + password (returns session cookie or tokens) |
| POST | `/api/v1/auth/logout` | End the current session |
| POST | `/api/v1/auth/refresh` | Rotate refresh token (jwt driver) |
| GET | `/api/v1/auth/me` | Current `Actor`: user, active tenant, roles, effective permissions |
| PATCH | `/api/v1/auth/me` | Update profile |
| POST | `/api/v1/auth/password/forgot` · `/password/reset` · `/password/change` | Password flows |
| POST | `/api/v1/auth/email/verify` · `/email/resend` | Email verification |
| POST | `/api/v1/auth/magic-link` · GET `/magic-link/callback` | Magic link |
| GET | `/api/v1/auth/oauth/:provider` · `/oauth/:provider/callback` | Social / OIDC |
| POST | `/api/v1/auth/mfa/totp/enroll` · `/totp/verify` · `/mfa/challenge` · `/mfa/recovery-codes` | MFA |
| POST | `/api/v1/auth/passkeys/register/*` · `/passkeys/authenticate/*` | WebAuthn |
| GET/DELETE | `/api/v1/auth/sessions` · `/sessions/:id` | Device list / revoke |
| GET/POST/DELETE | `/api/v1/auth/tokens` · `/tokens/:id` | Personal & service API tokens |
| POST | `/api/v1/auth/tenants/switch` · GET `/auth/tenants` | Tenant membership & switching |
| POST | `/api/v1/auth/invitations` · `/invitations/:token/accept` | Invites |
| POST | `/api/v1/auth/impersonate/:userId` · `/impersonate/stop` | Audited impersonation |
| CRUD | `/api/v1/users` · `/roles` · `/permissions` (read-only catalogue) · `/tenants` · `/teams` | Admin resources, auto-generated like any model |
| GET | `/api/v1/audit-events` | Audit explorer (permission `audit.viewAny`) |
| GET | `/.well-known/jwks.json` | Public keys for JWT verification |
| — | `/scim/v2/*`, `/sso/saml/:connection/*` | Enterprise (Phase 4) |

### 2.6 UI screens (when `@strutvane/ui` is present, or added later)

| Screen | Route |
|--------|-------|
| Sign in · Sign up · Forgot password · Reset password · Verify email · Magic-link sent | `/login` `/register` `/forgot-password` `/reset-password` `/verify-email` |
| MFA challenge · MFA enrolment (QR + recovery codes) · Passkey management | `/mfa` `/account/security` |
| Profile · Sessions & devices · API tokens | `/account` `/account/sessions` `/account/tokens` |
| Users (list, invite, edit roles, suspend, impersonate) | `/admin/users` |
| Roles & permissions matrix editor | `/admin/roles` |
| Tenants / organisation settings · Members · Teams · Invitations · SSO connections | `/admin/tenants` `/settings/organization` |
| Tenant switcher (topbar) · Impersonation banner | global layout slots |
| Audit explorer + per-record "Activity" tab | `/admin/audit`, resource detail pages |

### 2.7 Seed data

- **System roles** (renameable; the same names `sv make:policy` writes, [09 §3](09-cli-reference.md#3-generators-make)):
  - `admin`: `'*'`, which reaches every model except the `wildcardExclude` resources (§4.4). Its exact grants on those (user management and, with the audit extra, reading audit events) carry `scope: 'global'`, so only a platform administrator (the role held outside any tenant, like the seed admin) gets them, never a tenant's own `admin`.
  - `member`: view + create, and update/delete **own** records (`{ action, own: true }`, compiled to `ownerId = actor.id`; never matches on a model without a text/uuid `ownerId`).
  - `viewer`: view only.
  - `owner`: a tenant's creator, held only inside that tenant (`scope: 'tenant'`, `permissions: ['*']`). Generated only when tenancy is enabled. Its `'*'` reaches only tenant-scoped models (with a `tenantId` column). Tenant internals (memberships, invitations, tenant settings, billing) are `wildcardExclude` resources, so they are granted to `owner` by exact name once they are served as tenant-scoped resources.
- **Admin user:** created from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and forced to change the password on first login in non-local environments.
- **Permission catalogue:** built from all registered models and actions (§4.4).
- **Generated defaults** (`create-strutvane`, `sv add auth`): `config/auth.ts` is written with `defineAuthConfig` and gets the role map of §4.4, with `member` updates and deletes scoped to the actor's own records (`own: true`), an explicit `defaultRoles` list (empty unless configured), and a `wildcardExclude` list so identity, machine-access, authorization, tenancy and audit records are granted only by exact permission name, never by a wildcard. The list is always complete, even for features that are off, so the protection is in place when they are added later. Public sign-up is off (`AUTH_ALLOW_REGISTRATION=false`) until the app turns it on. `trustedOrigins` is `[APP_URL]` and `trustedProxies` is empty: in a Strutvane app the framework's `trustProxy` already resolves the client address ([05 §3.3](05-developer-experience.md#33-config-files-typed-documented-readable)).

## 3. Authentication features (via adapters)

- **Email + password:**
  - argon2id hashing.
  - Configurable policy: length, breached-password check via the HIBP k-anonymity API (opt-in).
  - Email verification and password reset with single-use, hashed, expiring tokens.
- **Passwordless:** magic links / OTP.
- **Social / OIDC:** OAuth 2.0 / OIDC (Google, Microsoft, GitHub, Apple, generic OIDC). Account linking with verified-email rules.
- **MFA:** TOTP, WebAuthn passkeys and recovery codes. Enforceable per tenant or per role; step-up auth for sensitive actions (`requireRecentAuth(5m)`).
- **Cookie sessions** (DB or Valkey):
  - httpOnly + Secure + SameSite=Lax cookies.
  - Rotation on login and privilege change; idle and absolute timeouts.
  - Device list with revoke.
- **Token mode** for SPAs, mobile and APIs:
  - Short-lived JWT access tokens (5–15 min) plus rotating refresh tokens with **reuse detection**, which revokes the whole family.
  - A JWKS endpoint with scheduled key rotation (`sv auth:keys:rotate`).
- **Enterprise:**
  - SSO (SAML/OIDC) with per-tenant IdP configuration and email-domain IdP discovery.
  - SCIM 2.0 user and group provisioning mapped to memberships and roles.
- **Impersonation:** permission-gated, time-boxed, fully audited, with banner metadata in `/auth/me`.
- **Abuse protection:**
  - Lockout and sliding-window rate limits (per IP and per account), shared by every identity engine (§3.2).
  - Hooks for bot/credential-stuffing signals (`onLoginAttempt`).

### 3.1 API tokens for machine clients

| Kind | Format | Scope | Use |
|------|--------|-------|-----|
| Personal access token | `sv_pat_<random>` (prefix enables secret scanning) | User's permissions ∩ selected abilities | Scripts, CLI tools |
| Service account token | `sv_svc_<random>` | Assigned roles, tenant-bound | Integrations, workers |
| OAuth 2.1 client credentials | JWT access token | Client's granted scopes | Third-party / M2M |

- Tokens are stored **hashed** (SHA-256 with a server pepper).
- They are shown once, have expiry dates (max TTL configurable) and record last-used IP and time.
- Revocable from the UI or with `sv auth:token:revoke`.
- Every use is attributable in the audit log (`actor.type = 'service'`).

### 3.2 Request rules for the auth endpoints (normative)

- **Client address.** Per-IP limits key on the socket peer address, which the HTTP host passes in `HttpRequestHookPayload.clientAddress` ([integration map §4](17-integration-map.md#4-hooks-where-packages-plug-into-each-others-pipelines)). `X-Forwarded-For` is read only when the peer is one of the configured `trustedProxies` (addresses or CIDR ranges), walking right to left past further trusted proxies.
- **Unknown peer.** When no peer address is available, the per-IP limit is not skipped: every such request counts against one shared fallback bucket per operation, and a warning is logged once. A host that knowingly has no peer address can set `allowMissingPeer` to skip the per-IP limit instead. The per-account limit applies either way.
- **IPv6** addresses are limited per `/64` prefix; IPv4 addresses individually.
- **Content type and size.** State-changing endpoints accept JSON bodies sent as `application/json` only, read as a stream with a small size limit (16 KiB in the app provider).
- **Same-site only.** State-changing endpoints refuse cross-site browser requests: `Sec-Fetch-Site: cross-site`, or an `Origin` other than the app URL, the request's own origin or one listed in `auth.trustedOrigins`. Requests without `Origin` and `Sec-Fetch-Site` (non-browser clients) carry no ambient cookies and pass.

## 4. Authorization model

### 4.1 Concepts

```
Permission  = "<resource>.<action>"            e.g. "invoice.approve", "invoice.*", "*"
Role        = named set of permissions (+ inherits other roles), global or tenant-scoped
Assignment  = (subject: user | team | service) × role × scope (global | tenant | team | record)
Policy      = code-level rules refining permissions with conditions (ABAC)
Condition   = typed predicate over actor, record, context → compiles to the QueryFilter AST → SQL
FieldRule   = read/write visibility per field per role/condition
Scope       = where a role grant counts for a rule or field rule: 'any' (default) | 'global' | 'tenant'
Decision    = { allowed: boolean, reason: string, filter?: QueryFilter, fields?: FieldMask }
```

### 4.2 Policies: generated per model, owned by you

`sv make:model` creates `app/policies/<model>.policy.ts` with sensible defaults that you edit freely:

```ts
// app/policies/invoice.policy.ts   (generated once, then owned)
import { definePolicy } from '@strutvane/auth'
import { invoiceSchema } from '../../.strutvane/registry.gen.ts'   // generated from the model

// The schema (columns + types) is required so every predicate is type-checked and can compile to
// SQL. Actor attributes used in rules must be declared (attrs), so typos fail at compile time.
// In a Strutvane app the generated registry provides the schema; standalone apps use defineSchema().
export default definePolicy('invoice', { schema: invoiceSchema }, ({ allow, deny, field }) => {
  allow(['viewAny', 'view'], { role: ['accountant', 'manager', 'admin'] })
  allow(['view', 'update'],  { when: ({ actor, row }) => row.ownerId.eq(actor.id) })   // compiles to SQL
  allow('approve', { role: 'manager', when: ({ row }) => row.amount.lte(10_000) })
  allow('approve', { role: 'director' })
  deny('delete',   { when: ({ row }) => row.status.eq('paid') })                       // deny always wins
  field('internalNotes').readable({ role: ['manager', 'director'] }).writable({ role: 'director' })
})
```

**Properties:**

- **Deny-by-default.** An explicit `deny` overrides any `allow`.
- **Role scope.** Rules and field rules take `scope: 'any' | 'global' | 'tenant'` (default `'any'`). `'global'` rules apply only to actors outside any tenant (`actor.tenantId` unset), `'tenant'` rules only inside one. Platform-administrator rules use `scope: 'global'`, so a tenant role with the same name never matches them. An explicit empty role list (`role: []`) is a definition error, never "everyone"; `anonymous: true` cannot be combined with `role` or `scope`.
- **Null actor values fail closed in allow rules** ([ADR-0017](adr/0017-allow-rules-bind-fail-closed-on-null-actor-values.md)). A condition part that depends on a null actor value never widens an allow rule, whatever its polarity (`ne`, `nin`, `not`). Deny rules keep "a null actor value never matches" ([ADR-0008](adr/0008-policy-predicates-two-valued-semantics.md)).
- **Mistyped record values fail closed.** In-memory evaluation refuses a loaded value that does not fit its column type (for example a `bigint` read as a string) instead of comparing it loosely.
- **Limits are checked at definition time.** The combined filter of each action (allows OR-ed, denies subtracted) must fit the filter limits when the policy is defined, so a policy that works for single records never fails only on lists.
- **Role map and policies combine.** The role map in `config/auth.ts` (§4.4) adds allow grants to the policies in `app/policies/`: `allowed = (policy allows OR role map grants) AND NOT policy denies`. An explicit policy `deny` always wins; the role map itself has no denies. Role grants go through the same engine as policy rules, so they compile to SQL for lists and appear in `Decision.reason` (`allow:role:<role>:<permission>`).
- **Typed predicate builder, not arbitrary JS.** The same rule:
  - evaluates in memory for one record (`can('invoice.approve', invoice)`), and
  - **compiles to SQL `WHERE` clauses** for list endpoints, so lists are never filtered after the fact and pagination counts stay correct.
- **Escape hatch.** `check: (ctx) => boolean` is allowed but marks the rule *not list-filterable*. `sv doctor` warns if it is used on `viewAny`.
- **Field-level rules** are applied in API serialisers, input validation (unwritable fields are rejected), OpenAPI output, the resource manifest and UI forms/columns.
  - Read masking is an allow-list: a record is copied with **only** the schema fields the actor may read, so relations, computed values and internal columns never pass through by accident.
  - Keys that are not schema columns are never writable.
  - `filterableFields(actor)` returns exactly the actor's readable fields. Untrusted filters and sorts are validated against it (`validateFilter(…, { allowedFields })`); any other field is rejected with `INVALID_FILTER`, exactly like an unknown field. Relation paths must be listed explicitly.
  - The permission provider exposes the same set as `filterableFields(actor, resourceType)`, the optional `PermissionProvider` member the framework uses to narrow client filters, sorts and search ([17 §3](17-integration-map.md#3-container-tokens-who-provides-what-who-uses-it-and-what-happens-if-its-missing)). A resource without a policy uses its registered schema (every column); an unknown resource gets an empty set.
  - `restrictedFields` lists the fields that have a read rule (used for audit masking, §7).
- **Explainable.** `Decision.reason` names the matched rule. It is shown by `sv auth:explain` and recorded in audit on denials of sensitive actions.
- **Compliance export.** `sv auth:matrix --format md|csv|json` prints the role × permission matrix.

### 4.3 Role management

- Roles live in code (seeded from `config/auth.ts`) **and/or** in the DB (tenant-editable custom roles, behind the `auth.customRoles` flag, off by default).
- Groups and teams within tenants; hierarchical teams are optional.
- Scoped assignments: "editor of project 42" is a record-scoped assignment, without needing ReBAC.

### 4.4 Permission auto-sync from models

1. Every model registered in `.strutvane/registry.gen.ts` contributes the standard actions: `viewAny view create update delete restore forceDelete export`.
2. Every `actions: {}` entry in a resource contributes `<model>.<action>`. Permissions that belong to no model will be declared in `config/auth.ts` once the permission catalogue exists; `defineAuthConfig` has no key for them yet.
3. `pnpm dev` and `sv build` regenerate a typed union: `type Permission = 'invoice.view' | 'invoice.approve' | …`. A typo in `can('invoce.view')` is a compile error.
4. `sv auth:permissions:sync` (run automatically by `sv migrate`) reconciles the DB catalogue:
   - It inserts new permissions and maps them to roles using the `config/auth.ts` role map (admin = `*`, member = view/create plus own update/delete, viewer = view).
   - It **never deletes** permissions that have assignments. Those are marked `orphaned` and reported, and `--prune` is required to remove them.

Until the persistent catalogue exists, the provider evaluates the role map straight from `config/auth.ts` at boot, with the rules below.

#### The role map (normative)

- **Permissions.** Each role lists `'<resource>.<action>'` patterns, where either part may be `*`; `'*'` alone (or `'*.*'`) is every action on every resource. Each entry is an allow for actors holding the role. The object form is `{ action, own?, scope? }`.
- **Combination.** `allowed = (policy allows OR role map grants) AND NOT policy denies`. An explicit policy `deny` always wins. A resource without a policy is decided by the role map alone.
- **Own records.** `{ action, own: true }` compiles to `ownerId = actor.id` through the policy-to-SQL path (the same filter as a policy's `row.ownerId.eq(actor.id)`), so lists stay filtered in SQL. It never matches when the resource's schema has no `text`/`uuid` `ownerId` column or is unknown, and a null actor id never matches ([ADR-0008](adr/0008-policy-predicates-two-valued-semantics.md)).
- **Scope.** `scope: 'any' | 'global' | 'tenant'` on a role or on one permission (which overrides the role's), with the same meaning as in policies (§4.2): `'global'` grants count only outside tenants (platform roles), `'tenant'` grants only inside the active tenant. **A role without a scope is a platform role (`'global'`)** (`@strutvane/auth` 0.2.0-next.2; earlier versions defaulted to `'any'`). Team roles must say `scope: 'tenant'`. The team creator's role is the reserved `owner` (always `'tenant'`); `admin` is platform-only. Boot fails when a role is used both as a platform and a team role without an explicit scope, and inside a tenant an `'any'` grant reaches only resources with a tenant column.
- **Bounded wildcards.** Resource wildcards (`*` and `*.<action>`):
  - never match a resource listed in `wildcardExclude` (identity, authorization, tenancy and audit records). Those get exact-name grants only (`'user.view'`), and `'<resource>.*'` on an excluded resource is a boot error;
  - held inside a tenant, reach only models whose schema has a `tenantId` column. Exact grants are not bounded this way.
- **`newModelDefaults`.**
  - `'inherit-role-patterns'` (default): resource wildcards (`'*.view'`, `'*'`) cover models the role map does not name.
  - `'admin-only'`: only a full `'*'` grant (by convention `admin`) reaches a model the role map does not name; every other role needs an exact grant (`'invoice.view'`, `'invoice.*'`) or a policy rule. Partial resource wildcards (`'*.view'`) are then a boot error, because they could never apply.
  - Until the permission catalogue exists, "new model" means "a model not named in the role map".
- **No roles configured** means no grants: the policies alone decide, deny by default.
- **Validation at boot.** The provider compiles the role map (`compileRoleMap`) before loading policies. An unknown option, a malformed pattern or role name, an invalid `scope` or `own` value, `'<resource>.*'` on an excluded resource, or a partial wildcard under `'admin-only'` throws `PolicyDefinitionError` and the app does not boot.
- **Typed config.** `defineAuthConfig` (from `@strutvane/auth`) types `config/auth.ts` against `AuthConfig`: unknown top-level keys are compile errors. It returns the same deep-frozen object as core's `defineConfig`. The boot-time validation still runs for configs written without TypeScript.
- **Schemas for resources without a policy.** `createPermissionProvider(policies, { roles, schemas })` accepts model schemas for resources that have no policy. Without one, the schema is unknown, so `own` grants and wildcards held inside a tenant never match that resource.

The generated file (`create-strutvane`; excerpt with tenancy on and the audit extra off):

```ts
// config/auth.ts (excerpt)
import { defineAuthConfig } from '@strutvane/auth'
import { env } from '../env.ts'

export default defineAuthConfig({
  registration: env.AUTH_ALLOW_REGISTRATION,
  roles: {
    admin: {
      permissions: [
        '*',
        { action: 'user.viewAny', scope: 'global' },
        { action: 'user.view', scope: 'global' },
        { action: 'user.update', scope: 'global' },
        { action: 'user.delete', scope: 'global' },
        // with the audit extra: auditEvent.viewAny and auditEvent.view, also scope 'global'
      ],
    },
    member: {
      permissions: [
        '*.viewAny',
        '*.view',
        '*.create',
        { action: '*.update', own: true },
        { action: '*.delete', own: true },
      ],
    },
    viewer: { permissions: ['*.viewAny', '*.view'] },
    owner: { scope: 'tenant', permissions: ['*'] },   // only when tenancy is on
  },
  wildcardExclude: [
    // Identity
    'user', 'account', 'session', 'verification', 'mfaFactor', 'passkey', 'impersonationSession',
    // Machine access
    'apiToken', 'serviceAccount', 'oauthClient', 'ssoConnection', 'scimToken',
    // Authorization
    'role', 'rolePermission', 'roleInherit', 'assignment', 'permission',
    // Tenancy
    'tenant', 'tenantDomain', 'membership', 'invitation', 'team', 'teamMember',
    // Audit
    'auditEvent',
  ],
  newModelDefaults: 'inherit-role-patterns' as const,   // or 'admin-only' for stricter orgs
  defaultRoles: [] as string[],
  seedAdmin: { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD, role: 'admin' },
  trustedOrigins: [env.APP_URL],
  trustedProxies: [] as string[],
})
```

### 4.5 Relationship-based access (ReBAC) at scale

For sharing graphs ("viewers of folder X can view its files"), the `AuthorizationEngine` adapter can delegate to **OpenFGA** (CNCF, Apache-2.0) or **Cerbos** (Apache-2.0). This is optional; the native engine covers RBAC + ABAC + record-scoped roles.

## 5. Multi-tenancy

| Strategy | Isolation | When | Support |
|----------|-----------|------|---------|
| **Shared schema** + `tenant_id` + **Postgres RLS** | Logical, enforced twice (app filter **and** DB policy) | Default; thousands of tenants | Postgres tier 1. MySQL/SQLite get app-level only, flagged by `sv doctor`. |
| **Schema per tenant** | Stronger logical | Hundreds of mid-size tenants, per-tenant extensions | Postgres only |
| **Database per tenant** | Physical | Regulated tenants, data residency | All DBs: connection routing + per-tenant migrations (`sv migrate --tenants`) |
| **Hybrid** | Per tenant | Most tenants shared, VIP tenants isolated | Strategy stored per tenant record |

- **Resolution chain** (configurable and ordered):
  - subdomain → custom domain → path prefix → `X-Tenant-Id` header (trusted services only) → token claim → session's active tenant.
- **Who may be scoped to a tenant** (normative):
  - **Anonymous requests get no tenant by default.** `tenancy.allowAnonymousTenant` opts in: `true` keeps only tenants resolved by the `subdomain` or `path` resolvers (for example a public sign-up page on `acme.example.com`); a list of resolver names keeps only those. A tenant that is not allowed is ignored, never an error, so anonymous probing reveals nothing. `requireAuth` is checked before tenant resolution.
  - **`X-Tenant-Id` is honoured only for tenant-less service actors** (`actor.type === 'service'` without a `tenantId`). For user and anonymous requests the header is ignored.
- **RLS integration:**
  - Each transaction sets the tenant transaction-locally with `set_config('app.tenant_id', $1, true)` ([ADR-0007](adr/0007-tenancy-rls-enforcement-rules.md) rule 3).
  - Generated migrations add `ENABLE` + `FORCE ROW LEVEL SECURITY` and policies for every `tenant: true` model.
  - The app connects as a non-owner role without `BYPASSRLS`.
  - Compatible with PgBouncer transaction pooling because the setting is transaction-scoped.
  - **Text comparisons are bytewise.** Compiled policy and filter SQL compares text columns under `COLLATE "C"`, so SQL and in-memory evaluation agree whatever the column collation (ADR-0008). Indexes used by these predicates should be built `COLLATE "C"`. `textCollation: 'database'` opts out, only for databases where every text column uses a deterministic collation.
- **Checks you can run** (`@strutvane/auth/postgres`):
  - `tenancyAudit(db)` inspects a live database as the runtime role. Finding codes: `RLS_DISABLED`, `RLS_NOT_FORCED`, `NO_RESTRICTIVE_POLICY`, `RUNTIME_ROLE_BYPASSES_RLS`, `RUNTIME_ROLE_OWNS_TABLE`, `DEFINER_VIEW`, `SECURITY_DEFINER_FUNCTION`, `TENANT_SETTING_DEFAULT` (a role- or database-level default for the tenant setting).
  - `findSessionSet(sql)` lints migrations and raw SQL for ADR-0007 rule 3. Finding codes: `SESSION_SET`, `SESSION_SET_CONFIG`, `PERSISTENT_SET` (errors), `SET_LOCAL`, `SESSION_RESET` (warnings).
  - `relationKeyAudit(db, schemas)` checks that every to-one relation in a policy schema points at a unique key.
- **Safety net:** every generated model test includes cross-tenant read, update and delete attempts that must return 404. This is the class of bug behind Payload's multi-tenant CVE fixed in 3.90.0.
- **Platform operators:** `actor.type === 'system'` access is explicit, audited and never implicit. Server-side code runs **with** access control by default; bypass needs `withSystemActor('reason', fn)`.
- **Lifecycle:** provision, suspend, export (portability), delete (GDPR erasure, with a crypto-shredding option). Each stage has hooks (`onTenantCreated`, …).
- **Where tenants live (implemented today):** tenants and memberships belong to the identity store, like accounts. Apps get no tenant model. With persistent identity they are the `organization` and `member` tables of auth's package migration (§2.3); with the in-memory engine they live in the process. They are managed through the auth endpoints (`/auth/tenants`, `/auth/switch-tenant`, `/auth/tenants/:id/members`), the `tenant:create` and `tenant:member:add` commands (§11), and `openIdentityAdmin()` from `@strutvane/auth/admin` in seeders. App data that belongs to a tenant carries its `tenantId`.

## 6. User profile data

Accounts, sessions, roles and memberships belong to `@strutvane/auth` and live in its identity store. Apps do **not** get a `User` model: a `defineModel('User')` in the app would be a second, unrelated users table (tenant-scoped when tenancy is on) that sign-up and the seed admin never write to, and `user` is an identity resource that the role map keeps out of wildcards (`wildcardExclude`, §4.4).

A request knows its user as the **actor**, and `actor.id` is the link. Profile fields go into an app model keyed by that id:

```bash
pnpm sv make:model Profile userId:string:unique jobTitle:string
```

```ts
// app/models/profile.model.ts (owned)
import { defineModel, field } from '@strutvane/framework'

export default defineModel('Profile', {
  userId:   field.string().unique(),     // the actor id from @strutvane/auth
  jobTitle: field.string().optional(),
})
```

- The profile is an ordinary model: it gets its migration, CRUD API, policy and UI pages like any other.
- Engine-owned data (email, verification state, password hash) stays in the identity store and is never copied into app tables.
- Adding columns to the identity user itself (an `extendModel(UserModel, …)` API) is not provided; see §12.

## 7. Audit logging

- **Captured:**
  - Every mutating API call, auth event (login, logout, failure, lockout, MFA, password change, impersonation), role or permission change, token issuance/revocation and data export.
  - Reads of sensitive resources, opt-in per model with `audit: { reads: true }`.
- **Record:** the `AuditEvent` contract:
  - actor, tenant, action, resource type and id
  - a `before`/`after` JSON diff with **redaction** of `sensitive()` fields (hashed or omitted). Passing the resource's policy as `maskFor` also redacts every field that has a read rule (`policy.restrictedFields`), so the audit log never shows values the policy hides from most readers.
  - request id, trace id, IP, user agent and decision reason
- **Write path:** same DB transaction as the change (outbox), so there are no lost or phantom records.
- **Tamper evidence (opt-in):** a per-tenant hash chain (`hash = H(prev ‖ event)`). `sv audit:verify` checks it; periodic external anchoring is optional.
- **Storage and retention:** the `audit_events` table (monthly partitions on Postgres) with per-tenant retention policies.
- **Sinks:** OTel logs, SIEM webhooks, object-storage export (via the future `logs` package).

## 8. Standalone usage (without `@strutvane/framework`)

`@strutvane/auth` works inside existing apps. It brings its own migrations runner (`npx strutvane auth:migrate`) and needs only a DB connection.

```ts
import { createAuth } from '@strutvane/auth'
import { betterAuth } from '@strutvane/auth/identity/better-auth'
import { postgres } from '@strutvane/auth/db'

export const auth = createAuth({
  db: postgres(process.env.DATABASE_URL!),
  identity: betterAuth({ methods: ['email', 'google'] }),
  tenancy: { strategy: 'shared', resolve: ['header', 'session'] },
  audit: true,
  policies: [invoicePolicy],
})
```

| Host | Integration |
|------|-------------|
| **Hono** | `app.route('/api/v1/auth', auth.routes()); app.use(auth.hono())` |
| **Express 5** | `app.use('/api/v1/auth', auth.express.routes()); app.use(auth.express.middleware())` · `req.actor` |
| **Fastify 5** | `await app.register(auth.fastify.plugin, { prefix: '/api/v1/auth' })` · `request.actor` |
| **NestJS** | `StrutvaneAuthModule.forRoot(auth)` · `@UseGuards(PermissionGuard)` · `@RequirePermission('invoice.approve')` · `@CurrentActor()` |
| **Next.js / TanStack Start / React Router 8** | `auth.handler` route handler + `getActor()` in server functions / loaders / middleware |

```ts
import { can, requirePermission, currentActor, currentTenant } from '@strutvane/auth'

app.get('/invoices/:id', requirePermission('invoice.view'), handler)
if (!(await can('invoice.approve', invoice))) throw forbidden()        // RFC 9457 problem
const scope = await auth.filterFor('invoice.viewAny')                   // QueryFilter AST
const rows = await db.select().from(invoices).where(toDrizzle(scope))   // adapters: Drizzle, Kysely, Prisma, raw SQL
```

## 9. Frontend auth provider contract

The UI never imports `@strutvane/auth`. It talks to these interfaces, which have default implementations for Strutvane auth, generic OIDC and custom backends:

```ts
export interface AuthProvider {
  getActor(): Promise<ActorView | null>          // from GET /auth/me
  login(input: LoginInput): Promise<LoginResult>  // may return { mfaRequired, challengeId }
  logout(): Promise<void>
  refresh?(): Promise<void>
  onUnauthorized(problem: Problem): Promise<'retry' | 'redirect'>
  switchTenant?(tenantId: string): Promise<void>
  methods(): Promise<AuthMethodsManifest>         // which buttons/screens to show
}
export interface AccessProvider {
  can(permission: Permission, record?: unknown): boolean   // evaluated from manifest + /auth/me
  fieldMask(resource: string, mode: 'read' | 'write'): FieldMask
}
```

UI hiding is **convenience, never enforcement**. The API re-checks every request.

## 10. Public API surface (summary)

| Export | Purpose |
|--------|---------|
| `createAuth(config)` | Build the auth service (standalone) |
| `@strutvane/auth/provider` | Service provider auto-registered by the installer (framework mode) |
| `definePolicy`, `can`, `cannot`, `authorize`, `filterFor`, `fieldMask` | Authorization |
| `defineAuthConfig`, `AuthConfig` | Typed `config/auth.ts` (unknown top-level keys are compile errors) |
| `compileRoleMap`, `createPermissionProvider(policies, { roles, schemas })` | Role map (§4.4) and the contracts `PermissionProvider`, including `filterableFields(actor, resourceType)` |
| `requirePermission`, `requireRole`, `requireRecentAuth` | Middleware/guards |
| `currentActor`, `currentTenant`, `withTenant`, `withSystemActor` | Context (AsyncLocalStorage) |
| `audit.record`, `audit.query` | Audit |
| `@strutvane/auth/admin` | `openIdentityAdmin()`: manage accounts, tenants and memberships from seeders and scripts (`ensureUser`, `ensureTenant`, `setMember`; idempotent). There is no `UserModel` or `TenantModel`: accounts and tenants live in the identity store, and profile data is an app model keyed by `actor.id` (§5, §6) |
| `@strutvane/auth/identity/*` | Identity adapters (better-auth, oidc, saml, native) |
| `@strutvane/auth/testing` | `actingAs(user, { tenant, roles })`, `withPermissions([...])`, cross-tenant assertion helpers |

## 11. CLI commands (contributed by this package)

```
sv add auth | sv remove auth
sv auth:user:create --email <email> --name <name> --password-env <VAR>
sv tenant:create --name <name> --slug <slug> --owner <email>
sv tenant:member:add --tenant <slug|id> --email <email> --role <role>
sv auth:migration                     # optional: writes the identity-table SQL to database/migrations (§2.3)
sv auth:role:create <name> [--inherits member] [--tenant]
sv auth:permissions:sync [--dry-run] [--prune]
sv auth:matrix [--format md|csv|json]
sv auth:explain --actor <id> --action invoice.approve --resource invoice:123
sv auth:keys:rotate · sv auth:secret:rotate
sv auth:token:create --service <name> --roles … · sv auth:token:revoke <id>
sv auth:sso:add --tenant acme --type saml|oidc --metadata-url …
sv auth:migrate                       # standalone mode only
sv tenant:list | tenant:suspend | tenant:export | tenant:delete | tenant:migrate
sv audit:verify [--tenant] · sv audit:prune --before 2025-01-01
```

**Implemented today:** `auth:user:create`, `tenant:create`, `tenant:member:add` and `auth:migration` (package.json `strutvane.commands`); the other commands are planned.

- `auth:user:create` reads the password from the environment variable named by `--password-env`, so it never appears in shell history or process listings.
- `tenant:create` needs an existing account for `--owner`, which becomes the tenant's `owner`. `tenant:member:add` accepts only a role defined in `config/auth.ts` and replaces the account's previous role in that tenant.
- The account and tenant commands need persistent identity (`session.driver: 'database'` on PostgreSQL, §2.4). With the in-memory engine they refuse, because the change would be lost when the command exits.
- Exit codes: 0 success, 2 usage, 3 validation, 4 conflict (email already taken), 5 database unreachable.

## 12. Open questions

1. Should tenant-editable custom roles be on by default? *(Lean: off, behind a flag.)*
2. Should the predicate builder live as `@strutvane/policy` so future packages can reuse it without auth? *(Lean: types in `contracts`, runtime in `auth`; split only if demanded.)*
3. Should "bring your own IdP only" (no local users, Entra ID everywhere) be a first-class preset? *(Yes: `--methods sso-only`.)*
4. Should identity tables live in a separate schema (`auth.`) on Postgres by default? *(Lean: yes on Postgres, prefix elsewhere.)*
5. Should apps be able to add columns to the identity user itself (`extendModel(UserModel, …)`), or is a profile model keyed by `actor.id` (§6) enough? *(Lean: profile model; revisit with demand.)*
