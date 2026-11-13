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
app/models/user.model.ts               ← extendable User model (§6)
app/models/tenant.model.ts             ← tenancy only (extendable)
app/policies/user.policy.ts  role.policy.ts  tenant.policy.ts
app/providers/auth.provider.ts         ← registers the identity engine, resolvers, hooks
app/mail/auth/                         ← verify-email, reset-password, magic-link, invite, new-device templates
database/migrations/<ts>_create_auth_tables.sql
database/migrations/<ts>_enable_rls_policies.sql           (tenancy: shared)
database/seeders/auth.seeder.ts       ← system roles, permission catalogue, admin user
tests/feature/auth/*.test.ts          ← login, MFA, lockout, reset, roles, tenant isolation
web/pages/auth/…                       ← only when @strutvane/ui is installed (§2.6)
```

### 2.3 Migrations (default tables; prefix configurable, e.g. `auth_`)

| Group | Tables |
|-------|--------|
| Identity (owned by the identity adapter's schema, mapped into our migration stream) | `users`, `accounts`, `sessions`, `verifications`, `mfa_factors`, `passkeys` |
| Machine auth | `api_tokens`, `service_accounts`, `oauth_clients` |
| Tenancy | `tenants`, `tenant_domains`, `memberships`, `invitations`, `teams`, `team_members` |
| Authorization | `roles`, `role_permissions`, `role_inherits`, `assignments`, `permission_catalog` |
| Enterprise | `sso_connections`, `scim_tokens`, `impersonation_sessions` |
| Audit | `audit_events` (Postgres: monthly partitions) |

### 2.4 Environment keys

Appended to `.env` (values filled in) and `.env.example` (empty, commented):

```dotenv
# ─── Auth (@strutvane/auth) ─────────────────────────────────────
AUTH_SECRET=                  # generated; rotate: pnpm sv auth:secret:rotate
AUTH_SESSION_DRIVER=database  # database | valkey | jwt
AUTH_SESSION_LIFETIME=120     # idle minutes
AUTH_SESSION_ABSOLUTE=1440    # absolute minutes
AUTH_JWT_TTL=900              # access-token seconds (jwt driver / API tokens)
AUTH_REFRESH_TTL=2592000      # refresh-token seconds
AUTH_ALLOW_REGISTRATION=true
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

- **System roles** (renameable):
  - `admin`: every permission in its scope.
  - `member`: view + create, and update/delete **own** records (row condition `ownerId = actor.id` where an owner field exists).
  - `viewer`: view only.
  - `owner`: tenant owner, including billing, tenant settings and role management. Present only when tenancy is enabled.
- **Admin user:** created from `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` and forced to change the password on first login in non-local environments.
- **Permission catalogue:** built from all registered models and actions (§4.4).

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
  - Lockout and sliding-window rate limits (per IP and per account).
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

## 4. Authorization model

### 4.1 Concepts

```
Permission  = "<resource>.<action>"            e.g. "invoice.approve", "invoice.*", "*"
Role        = named set of permissions (+ inherits other roles), global or tenant-scoped
Assignment  = (subject: user | team | service) × role × scope (global | tenant | team | record)
Policy      = code-level rules refining permissions with conditions (ABAC)
Condition   = typed predicate over actor, record, context → compiles to the QueryFilter AST → SQL
FieldRule   = read/write visibility per field per role/condition
Decision    = { allowed: boolean, reason: string, filter?: QueryFilter, fields?: FieldMask }
```

### 4.2 Policies: generated per model, owned by you

`sv make:model` creates `app/policies/<model>.policy.ts` with sensible defaults that you edit freely:

```ts
// app/policies/invoice.policy.ts   (generated once, then owned)
import { definePolicy } from '@strutvane/auth'

export default definePolicy('invoice', ({ allow, deny, field }) => {
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
- **Typed predicate builder, not arbitrary JS.** The same rule:
  - evaluates in memory for one record (`can('invoice.approve', invoice)`), and
  - **compiles to SQL `WHERE` clauses** for list endpoints, so lists are never filtered after the fact and pagination counts stay correct.
- **Escape hatch.** `check: (ctx) => boolean` is allowed but marks the rule *not list-filterable*. `sv doctor` warns if it is used on `viewAny`.
- **Field-level rules** are applied in API serialisers, input validation (unwritable fields are rejected), OpenAPI output, the resource manifest and UI forms/columns.
- **Explainable.** `Decision.reason` names the matched rule. It is shown by `sv auth:explain` and recorded in audit on denials of sensitive actions.
- **Compliance export.** `sv auth:matrix --format md|csv|json` prints the role × permission matrix.

### 4.3 Role management

- Roles live in code (seeded from `config/auth.ts`) **and/or** in the DB (tenant-editable custom roles, behind the `auth.customRoles` flag, off by default).
- Groups and teams within tenants; hierarchical teams are optional.
- Scoped assignments: "editor of project 42" is a record-scoped assignment, without needing ReBAC.

### 4.4 Permission auto-sync from models

1. Every model registered in `.strutvane/registry.gen.ts` contributes the standard actions: `viewAny view create update delete restore forceDelete export`.
2. Every `actions: {}` entry in a resource contributes `<model>.<action>`. Custom permissions can be declared in `config/auth.ts`.
3. `pnpm dev` and `sv build` regenerate a typed union: `type Permission = 'invoice.view' | 'invoice.approve' | …`. A typo in `can('invoce.view')` is a compile error.
4. `sv auth:permissions:sync` (run automatically by `sv migrate`) reconciles the DB catalogue:
   - It inserts new permissions and maps them to roles using `config/auth.ts` defaults (admin = `*`, member = view/create/own-update, viewer = view).
   - It **never deletes** permissions that have assignments. Those are marked `orphaned` and reported, and `--prune` is required to remove them.

```ts
// config/auth.ts (excerpt)
export default defineAuthConfig({
  roles: {
    admin:  { permissions: ['*'] },
    member: { permissions: ['*.viewAny', '*.view', '*.create', { action: '*.update', own: true }, { action: '*.delete', own: true }] },
    viewer: { permissions: ['*.viewAny', '*.view'] },
  },
  newModelDefaults: 'inherit-role-patterns',   // or 'admin-only' for stricter orgs
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
- **RLS integration:**
  - Each transaction runs `SET LOCAL app.tenant_id = $1` and `SET LOCAL app.actor_id = $2`.
  - Generated migrations add `ENABLE` + `FORCE ROW LEVEL SECURITY` and policies for every `tenant: true` model.
  - The app connects as a non-owner role without `BYPASSRLS`.
  - Compatible with PgBouncer transaction pooling because `SET LOCAL` is transaction-scoped.
- **Safety net:** every generated model test includes cross-tenant read, update and delete attempts that must return 404. This is the class of bug behind Payload's multi-tenant CVE fixed in 3.90.0.
- **Platform operators:** `actor.type === 'system'` access is explicit, audited and never implicit. Server-side code runs **with** access control by default; bypass needs `withSystemActor('reason', fn)`.
- **Lifecycle:** provision, suspend, export (portability), delete (GDPR erasure, with a crypto-shredding option). Each stage has hooks (`onTenantCreated`, …).

## 6. Extending the User model

```ts
// app/models/user.model.ts (generated by sv add auth — owned)
import { extendModel, field } from '@strutvane/framework'
import { UserModel } from '@strutvane/auth/models'

export default extendModel(UserModel, {
  jobTitle:   field.string().optional(),
  department: field.belongsTo('Department').optional().filterable(),
  avatar:     field.image().optional(),          // requires the future files package
}, {
  ui: { list: { columns: ['name', 'email', 'department', 'roles', 'lastLoginAt'] } },
})
```

Engine-owned columns (`email`, `emailVerified`, password hash, etc.) are protected:

- They cannot be removed.
- The password hash is `hidden` and never serialised.
- Added fields flow into migrations, the API, the profile screen and the admin Users screen like any other model.

## 7. Audit logging

- **Captured:**
  - Every mutating API call, auth event (login, logout, failure, lockout, MFA, password change, impersonation), role or permission change, token issuance/revocation and data export.
  - Reads of sensitive resources, opt-in per model with `audit: { reads: true }`.
- **Record:** the `AuditEvent` contract:
  - actor, tenant, action, resource type and id
  - a `before`/`after` JSON diff with **redaction** of `sensitive()` fields (hashed or omitted)
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
| `requirePermission`, `requireRole`, `requireRecentAuth` | Middleware/guards |
| `currentActor`, `currentTenant`, `withTenant`, `withSystemActor` | Context (AsyncLocalStorage) |
| `audit.record`, `audit.query` | Audit |
| `UserModel`, `TenantModel` | Extendable models |
| `@strutvane/auth/identity/*` | Identity adapters (better-auth, oidc, saml, native) |
| `@strutvane/auth/testing` | `actingAs(user, { tenant, roles })`, `withPermissions([...])`, cross-tenant assertion helpers |

## 11. CLI commands (contributed by this package)

```
sv add auth | sv remove auth
sv auth:user:create --email --role --tenant [--password-prompt]
sv auth:role:create <name> [--inherits member] [--tenant]
sv auth:permissions:sync [--dry-run] [--prune]
sv auth:matrix [--format md|csv|json]
sv auth:explain --actor <id> --action invoice.approve --resource invoice:123
sv auth:keys:rotate · sv auth:secret:rotate
sv auth:token:create --service <name> --roles … · sv auth:token:revoke <id>
sv auth:sso:add --tenant acme --type saml|oidc --metadata-url …
sv auth:migrate                       # standalone mode only
sv tenant:create | tenant:list | tenant:suspend | tenant:export | tenant:delete | tenant:migrate
sv audit:verify [--tenant] · sv audit:prune --before 2025-01-01
```

## 12. Open questions

1. Should tenant-editable custom roles be on by default? *(Lean: off, behind a flag.)*
2. Should the predicate builder live as `@strutvane/policy` so future packages can reuse it without auth? *(Lean: types in `contracts`, runtime in `auth`; split only if demanded.)*
3. Should "bring your own IdP only" (no local users, Entra ID everywhere) be a first-class preset? *(Yes: `--methods sso-only`.)*
4. Should identity tables live in a separate schema (`auth.`) on Postgres by default? *(Lean: yes on Postgres, prefix elsewhere.)*
