# Spike 07 — Better Auth behind a Strutvane `IdentityEngine`

> **Phase 0 spike, 2026-11-13.** Throwaway code with a permanent result. Never imported by real packages ([spikes/README.md](../README.md)).

## 1. Question

Can **Better Auth** sit behind a Strutvane `IdentityEngine` adapter interface such that:

1. **No Better Auth type leaks** into the interface: it uses only Strutvane types (`Actor`, `TenantContext`).
2. **These all work end-to-end in a Hono app:**
   - email+password sign-up, sign-in and sign-out
   - session → `Actor` resolution
   - the password-reset flow
   - the organization plugin, with orgs as tenants, membership roles as `Actor.roles`, and the active org as `Actor.tenantId`
3. **Better Auth's schema can flow into Strutvane's own migration stream.**
4. **Session security defaults hold:** HttpOnly, Secure in production, SameSite, rotation, sign-out invalidation, sign-in rate limiting.
5. **A second, different adapter can implement the same interface,** proving the seam is real.

## 2. Answer

**Yes**, with seven configuration requirements and three gaps that `@strutvane/auth` must own (§5).

- **The seam is real:** a completely different native engine (in-memory, `node:crypto` scrypt) passes the **same 16-test contract suite** as the Better Auth adapter.
- **No Better Auth import exists above the adapter,** and a test enforces this.
- **Better Auth's out-of-the-box defaults are *not* safe enough for Strutvane.** Six settings had to be changed explicitly (§5.1). Its per-IP rate limiting can be bypassed or turned into a lockout unless the proxy setup is right (§5.2).

## 3. Evidence

| Check | Result |
|---|---|
| Typecheck (`tsc --noEmit`, strict + `exactOptionalPropertyTypes`) | ✅ clean |
| Full suite against **real PostgreSQL 18** (`postgres:18.7-alpine`, throwaway container) | ✅ **49/49** in 3 consecutive runs of the final code (~19 s / 14.6 s / 8.8 s). Earlier iterations also passed 48/48 three times in a row. |
| Contract suite (16 tests) × 2 engines | ✅ Better Auth 32/32 · native stub 32/32 *(counts include the production-URL test)* |
| End to end through a Hono app (both engines) | ✅ 4/4 |
| Interface purity (no `better-auth` import above the adapter) | ✅ 4/4 |
| Better Auth specifics: schema, cookies, UUIDs, timing, tripwires, outage | ✅ 9/9 |
| **Mutation checks** (break a behaviour, confirm a test fails) | ✅ 3/3 caught: `revokeSessionsOnPasswordReset: false` → the reset test fails · trusting a stale `activeOrganizationId` → the membership-removal test fails · rate limiting off → the rate-limit test fails |
| Leftover containers after runs | ✅ none (`docker ps -a --filter name=sv-spike07` is empty) |
| Docker files written | ✅ none (ADR-0006) |

Pinned versions:
- better-auth 1.7.23
- hono 4.13.18
- pg 8.23.1
- typescript 6.0.3
- vitest 5.1.0
- @types/node 24.19.2
- Node 24.21.0

## 4. Design

```
Hono app (src/app.ts) ── knows ONLY ──► IdentityEngine (src/identity-engine.ts)
                                           │ signUp · signIn · signOut · getActor
                                           │ startPasswordReset · completePasswordReset
                                           │ createTenant · listTenants · switchTenant
                                           │ addMemberAsSystem · removeMemberAsSystem
                     ┌─────────────────────┴──────────────────────┐
     BetterAuth adapter (src/better-auth-adapter.ts)   native stub (src/stub-adapter.ts)
       └─ every call goes through auth.handler()         └─ in memory, scrypt, same rules
          (real cookies, CSRF/origin checks, rate limit)
```

**Interface rules:**
- **Web-standard `Request` in, `IdentityResult<T>` out.** A result is `{ ok, value | error, headers }`.
- **Errors are values with stable codes:** `VALIDATION_FAILED`, `INVALID_CREDENTIALS`, `EMAIL_UNAVAILABLE`, `RATE_LIMITED`, `INVALID_TOKEN`, `UNAUTHENTICATED`, `FORBIDDEN` and `INTERNAL_ERROR`, each with a fixed HTTP status. No engine message ever crosses the seam, and a test checks that Better Auth's wording never reaches the HTTP body.
- **Cookies travel as `Set-Cookie` headers** on the result. The host copies them onto its response, and the engine owns cookie names and attributes.
- **Fail closed everywhere:**
  - `getActor` returns `null` on any failure.
  - Unknown, malformed and non-member tenants all return the same `FORBIDDEN`.
  - A membership removed after selection immediately drops `tenantId` and roles.

**Actor mapping (Better Auth → Strutvane):**

| Actor field | Comes from |
|---|---|
| `Actor.id` | `user.id` |
| `type` | `'user'` |
| `tenantId` | `session.activeOrganizationId`, only while the membership still exists. It is re-checked on every request. |
| `roles` | `member.role` (comma-separated in Better Auth) |
| `attrs` | `{ emailVerified }` only, so no personal data reaches policies by default |

## 5. Findings

### 5.1 Settings Strutvane must set explicitly (Better Auth defaults are not enough)

| # | Setting | Better Auth default | Why it must change | Evidence |
|---|---|---|---|---|
| 1 | `rateLimit.enabled: true` | Enabled **only in production** | Dev and test can never verify limits otherwise. Strutvane enables limits everywhere. | contract test + mutation check |
| 2 | `rateLimit.storage` | `"memory"` (per process) | With more than one instance, every instance has its own counter. Use `"database"` or `"secondary-storage"` (Valkey) in production. | documented by Better Auth; not load-tested here |
| 3 | `emailAndPassword.revokeSessionsOnPasswordReset: true` | **false** | Without it, an attacker's existing session survives the victim's password reset. | mutation check: the test fails without it |
| 4 | `emailAndPassword.minPasswordLength: 12` | 8 | Matches Strutvane's security model | contract test |
| 5 | `advanced.backgroundTasks.handler` | none, so work runs inline | **Timing enumeration.** With a 300–400 ms mailer, password reset answered in **419 ms for a known email vs 12 ms for an unknown one**. With the handler: **10 vs 8 ms**. | `better-auth.specifics` timing test |
| 6 | `onAPIError: { throw: true }` | Errors printed by the router | On an unexpected error (DB down), Better Auth's HTTP router (`better-call`) runs `console.error("# SERVER_ERROR", err)` with a **full stack trace**, even with `logger.disabled`. That bypasses Strutvane's logger and redaction (RFC-0004). Rethrowing lets the adapter report it once and return `INTERNAL_ERROR`. | outage test (`console.error` never called) |
| 7 | `advanced.database.generateId: 'uuid'` | random string ids | Tenant ids flow into RLS as `current_setting('app.tenant_id')::uuid` (ADR-0007). Non-UUID ids break the cast. With `'uuid'`, every table gets `uuid` PKs (`gen_random_uuid()`, i.e. **v4**; Strutvane prefers v7, which needs a custom `generateId` function). | UUID test runs the exact RLS cast |

**A bug this exposed (fixed):** with UUID columns, a malformed tenant id (`"does-not-exist-123"`) reached Postgres, failed the uuid cast and surfaced as **500 INTERNAL_ERROR** instead of `FORBIDDEN`. That was both a wrong answer and a probe, since malformed and unknown ids answered differently. The adapter now validates id format before any database call. **Rule for `@strutvane/auth`:** validate every id at the boundary.

### 5.2 Rate limiting depends on correct proxy configuration (tripwire tests)

- **A rotating, spoofed `X-Forwarded-For` bypasses the per-IP sign-in limit completely.** With a limit of 2, 5 attempts from 5 fake IPs were all evaluated as `INVALID_CREDENTIALS`. Any client can set that header unless the proxy overwrites it.
- **Requests with no usable IP share one bucket.** That covers a missing header, and a multi-hop header when `trustedProxies` is unset. One attacker can therefore exhaust the bucket and lock out every other client that lands in it (`RATE_LIMITED` for a different client). That's a denial-of-service lever.
- **Required for `@strutvane/auth`:**
  1. Set `ipAddress.ipAddressHeaders` only to a header *your* proxy sets and overwrites (e.g. `cf-connecting-ip`), plus `trustedProxies`. `sv doctor` should warn when this is unset in production.
  2. Add a **per-account limit** (keyed by normalised email) on top of the per-IP limit, inside Strutvane, to stop credential stuffing that rotates IPs.
  3. Use shared storage (Valkey or DB) for counters.

### 5.3 Session behaviour

| Behaviour | Result |
|---|---|
| Cookie attributes in dev | `better-auth.session_token`; `HttpOnly; SameSite=Lax; Path=/`; no `Secure` |
| Cookie attributes on https | `__Secure-better-auth.session_token`, with `Secure` |
| New session on every sign-in (no fixation) | ✅ |
| Sign-out revokes server-side (a copied cookie stops working) | ✅ |
| Forged cookie → `null` actor | ✅ |
| **Token rotated on tenant switch or role change** | ❌ **No.** Pinned by a tripwire test. |

**Why no rotation is acceptable for now:** tenant and roles are resolved server-side on every request (not stored in the cookie), and the adapter re-checks membership each time. No stale privilege is cached in the token.

**Recommendation for later:** for genuine privilege *elevation* (e.g. "become platform admin", sensitive settings), require re-authentication (Better Auth `freshAge` / "sudo mode") rather than relying on rotation.

### 5.4 Schema and Strutvane's migration stream

**Two programmatic APIs exist:**
- **`getSchema(options)`** (`better-auth/db`) returns the logical schema **without a database**: 7 tables (`user`, `session`, `account`, `verification`, `organization`, `member`, `invitation`) with typed fields and indexes.
- **`getMigrations(options)`** (`better-auth/db/migration`):
  - introspects a **live** database
  - returns `toBeCreated`, `toBeAdded`, `toBeAddedIndexes`, `unsafeChanges`, `compileMigrations()` (SQL text) and `runMigrations()`
  - on an empty DB, emits 7 `CREATE TABLE` statements and 7 indexes
  - once migrated, it is idempotent (nothing to create or add)
  - it refuses unsafe changes: required columns without defaults on populated tables raise `UnsafeMigrationError`

**Recommendation:** treat Better Auth's tables like any other models. Feed `getSchema()` into Strutvane's planner (ADR-0009), so auth tables get the same asked-not-guessed renames, destructive-change gating and committed SQL files. Keep `compileMigrations()` as a cross-check in CI: after Strutvane's migrations run, Better Auth must report nothing to create or add.

**Shape notes:**
- Column names are camelCase and quoted (`"emailVerified"`, `"userId"`). Better Auth supports per-model `modelName` and `fields` renames if Strutvane wants snake_case. *(Not exercised here.)*
- `session.activeOrganizationId` is `text` with **no foreign key**, so deleting a tenant leaves dangling values on sessions. The adapter's per-request membership re-check makes that harmless, and a mutation check proves the check is tested.
- Auth tables are global (users span tenants). They are **not** tenant-scoped and get no RLS, which is correct.

### 5.5 Other rough edges

- **Membership lookups use `auth.$context.adapter`,** a semi-internal API meant for plugin authors. Pin the Better Auth version, and keep these tests as a tripwire on every upgrade.
- **There is no session-less "remove member" endpoint,** so `removeMemberAsSystem` uses the adapter layer directly.
- **`addMember`'s `role` is typed to configured role names,** so the adapter casts it, and runtime validation is Better Auth's.
- **"Not a member" (403) and "organization not found" (400) differ in Better Auth.** The adapter normalises both, plus malformed ids, to `FORBIDDEN`.
- **`getActor` costs 2 queries per request** (session + membership). Options are Better Auth's `cookieCache`, which makes sign-out on other devices non-immediate within its TTL, or the `customSession` plugin. Benchmark in Phase 2.
- **`getActor` can't return refreshed cookies.** Better Auth's rolling session refresh (`updateAge`) sets a new cookie that `getActor(request) → Actor | null` has nowhere to put. **The interface should evolve to `authenticate(request) → { actor, headers }`.**
- **Duplicate sign-up reveals that an account exists** (`EMAIL_UNAVAILABLE`). This is the industry-common trade-off. Production default should be `requireEmailVerification: true` + `onExistingUserSignUp` (notify the real owner), which makes sign-up responses identical.
- **The default password hash is scrypt** (memory-hard). The blueprint mentions argon2id; Better Auth accepts a custom `password.hash`/`verify` (e.g. `@node-rs/argon2`). This is a decision for `@strutvane/auth` (ADR). Scrypt is acceptable.

### 5.6 Governance

Better Auth is MIT-licensed and actively released (1.7.23 at the time of the spike). It was **acquired by Vercel on 2026-07-07**. This spike shows the exposure is bounded: replacing the engine means writing one adapter that passes the contract suite. Nothing above the interface would change.

## 6. Limits (what this spike did not verify)

- **Not covered:** social and OAuth sign-in, OIDC/SAML enterprise SSO, MFA (TOTP, passkeys), SCIM, email verification, invitations.
- **Rate-limit storage:** only `memory` was tested. Database and Valkey storage were not, and neither was multi-instance behaviour.
- **Not covered:** `cookieCache`, rolling-refresh cookie behaviour, `freshAge` / sudo mode.
- **Not covered:** MySQL and SQLite; Azure Database for PostgreSQL with Entra ID tokens.
- **Not measured:** performance (per-request query cost is noted, not benchmarked).
- **Not exercised:** the custom `generateId` for UUIDv7, and snake_case `fields` mapping.

## 7. Recommendation for `@strutvane/auth`

1. **Adopt the interface shape:** Web `Request` in, `IdentityResult` out, stable codes, cookies as headers, fail closed. Add `authenticate()` returning `{ actor, headers }` (§5.5).
2. **Ship the contract suite** as a permanent, exported test kit (`@strutvane/auth/testing`). Every identity adapter (Better Auth, OIDC, native) must pass it in CI.
3. **Better Auth adapter defaults:**
   - all seven settings in §5.1
   - per-account rate limiting
   - proxy-aware IP configuration, checked by `sv doctor`
   - id validation at the boundary
4. **Migrations:** auth tables go through Strutvane's planner via `getSchema()`, with `compileMigrations()` as the CI cross-check.
5. **Keep the tripwire tests** (no rotation on tenant switch, the XFF bypass, the shared no-IP bucket), so Better Auth upgrades that change these behaviours are noticed immediately.

## 8. Suggested ADR

> **ADR-00XX: Better Auth is the default identity engine, behind a contract-tested `IdentityEngine` interface with mandatory hardening**
>
> **Context:** Spike 07 showed that Better Auth 1.7.23 can implement Strutvane's `IdentityEngine` with no type leakage, and that a second, independent engine passes the same contract suite. It also showed that Better Auth's defaults are insufficient. Rate limiting is production-only and kept in memory. Sessions survive password reset. Reset responses leak timing. Internal errors go to stderr. Ids are not UUIDs. Per-IP limits depend on correct proxy headers.
>
> **Decision:**
> - `@strutvane/auth` defines `IdentityEngine`: Web `Request` in, `IdentityResult` out, stable error codes, cookies as headers, fail closed. It ships the contract suite as a test kit that every adapter must pass.
> - The Better Auth adapter is the default. It always applies: explicit rate limiting with shared storage, `revokeSessionsOnPasswordReset`, `minPasswordLength: 12`, a background-task handler, `onAPIError.throw`, UUID ids, id validation at the boundary, and a per-account sign-in limit.
> - Tenant and role are re-resolved from membership on every request. Auth tables migrate through Strutvane's planner via `getSchema()`.
>
> **Consequences:**
> - (+) Engine replaceable; security behaviour verified by tests rather than assumed; governance risk of the Vercel acquisition bounded.
> - (−) We maintain the adapter, the contract suite and the tripwires. Semi-internal Better Auth APIs (`$context.adapter`) require version pinning and upgrade review.

## 9. Run it

```bash
cd spikes/07-better-auth-adapter
corepack pnpm@12.18.0 install
corepack pnpm@12.18.0 run typecheck
corepack pnpm@12.18.0 test        # needs Docker running; starts and removes its own Postgres 18
```
