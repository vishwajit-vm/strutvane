# 12 — Security Model

> **Goal:** a generated Strutvane app meets **OWASP ASVS 5.0 Level 2** controls out of the box. The ecosystem itself meets OpenSSF best practices.
> Related: auth design in [07](07-package-auth.md), CI in [10](10-repositories-publishing-versioning.md), testing in [13](13-testing-strategy.md).

## 1. Security principles

1. **Secure by default, unsafe by explicit opt-in.** Dangerous switches carry an `unsafe_` prefix (`unsafe_disableRls`, `unsafe_allowAllInProduction`) so they are greppable and flagged by `sv doctor` and CI.
2. **Deny by default.** No permission provider means `denyAll` in production. No `filterable` flag means a field is not filterable. No `fillable` means not writable.
3. **Defence in depth for tenancy.** Application filters **and** Postgres RLS **and** generated cross-tenant tests.
4. **Server is the authority.** UI permission hiding is a UX feature only. Every API call is re-authorized.
5. **Don't roll our own crypto or identity.** Use audited primitives (jose, @oslojs, argon2id, WebAuthn) and the adapter-based identity engine (D12).
6. **Least privilege everywhere:**
   - The DB app role is not owner and has no `BYPASSRLS`.
   - CI tokens are OIDC-scoped.
   - Plugins declare their capabilities.
7. **Auditable.** Security-relevant events always reach the audit log. Decisions are explainable (`Decision.reason`).
8. **Supply chain is part of the product.** Provenance, SBOMs, pinned toolchains and minimum release age.

## 2. Assets and trust boundaries

| Asset | Where | Sensitivity |
|-------|-------|-------------|
| User credentials, MFA secrets, passkeys | `@strutvane/auth` tables | Critical |
| Session tokens, refresh tokens, API keys | Cookies, DB/Valkey | Critical |
| `APP_KEY`, JWT signing keys (JWKS), OAuth client secrets, DB credentials | `.env` / secret manager | Critical |
| Tenant business data | App DB | High (per-tenant confidentiality) |
| Audit log | `audit_events` | High (integrity) |
| Generated source code | Developer repo | Integrity (codegen must not inject vulnerabilities) |
| Published npm packages | npmjs.com | Critical (ecosystem-wide blast radius) |

**Trust boundaries:**

- browser ↔ API
- API ↔ DB / cache / queue
- API ↔ external IdP / mail / webhooks
- developer machine ↔ npm registry (CLI downloads)
- core ↔ third-party plugins
- CI ↔ npm (publishing)

## 3. STRIDE threat model per component

### 3.1 CLI & generators (`strutvane`, `@strutvane/cli`, `devkit`, `create-strutvane`)

| Threat | Example | Controls |
|--------|---------|----------|
| **S**poofing | Typo-squat package (`strutvain`) or a malicious template URL | Reserved names ([10](10-repositories-publishing-versioning.md) §8.2). Templates bundled in `create-strutvane`, not fetched. Remote templates require `--template <url> --trust` and show the source. |
| **T**ampering | Codegen writes files outside the project; a template injects a backdoor | Path sandbox: writes are confined to the project root, `..` and symlinks are refused. Generated output is golden-tested. Diff preview (`--dry-run`) for every generator. |
| **R**epudiation | Unclear what a generator changed | `.strutvane/lock.json` records generator versions and file hashes. Summary printed after every run. |
| **I**nformation disclosure | CLI telemetry leaks paths/secrets; `.env` committed | **No telemetry by default** (opt-in, anonymous, documented schema). `.env` git-ignored on generation, with a pre-commit hint. `sv doctor` warns if `.env` is tracked. |
| **D**enial of service | — | n/a (local tool) |
| **E**levation | Postinstall scripts run arbitrary code | **No `postinstall` scripts** in any Strutvane package. Installers run only via explicit `sv add` / `sv new`. |

### 3.2 Framework HTTP layer (`@strutvane/framework`)

| Threat | Example | Controls |
|--------|---------|----------|
| S | Forged requests from other origins | Cookie sessions use `SameSite=Lax` + CSRF tokens (double-submit, signed with `APP_KEY`) for unsafe methods. Bearer-token APIs are CSRF-exempt. Strict CORS allow-list (`CORS_ORIGINS`). |
| T | Mass assignment (`role=admin` in body) | Writes accept **only fields declared writable** in the model (`fillable` derived from field options; `readOnly`, `guarded`). Unknown keys rejected (`strict` schemas). |
| T | SQL injection | All queries are parameterised via Drizzle/Kysely. Filter/sort/include fields come from an explicit allow-list. The raw SQL escape hatch is lint-flagged. |
| R | Disputed actions | Audit events in the same transaction as the change (outbox) |
| I | Excessive data exposure (OWASP API3) | Field-level read rules in serializers. `hidden` fields (password hashes, secrets) never serialised. Responses built from schema, not raw rows. |
| I | Verbose errors / stack traces | RFC 9457 problem+json. Stack traces only when `APP_ENV=local` and `APP_DEBUG=true`. `traceId` for correlation. |
| D | Unbounded queries, large payloads, slowloris | Max page size (default 100). Body size limit (1 MB default). Query timeouts (`statement_timeout`). Rate limiting (§7). Request timeouts. Max filter-AST depth/complexity. |
| E | BOLA/IDOR (OWASP API1) | Every generated route calls `authorize(action, record)`. List endpoints apply the policy-compiled SQL filter. Cross-tenant test suite (§5). |
| E | BFLA (OWASP API5) | Permissions generated per action (`viewAny`, `view`, `create`, `update`, `delete`, `restore`, `forceDelete`, `export`). Admin routes guarded by role. |

### 3.3 Auth (`@strutvane/auth`)

| Threat | Controls |
|--------|----------|
| Credential stuffing / brute force | Rate limits per IP + account (sliding window). Progressive delays and lockout. Optional HIBP k-anonymity breached-password check. Bot-signal hooks. |
| Weak password storage | argon2id (`@node-rs/argon2`) with OWASP parameters (m=19 MiB, t=2, p=1 minimum; tunable). Automatic rehash on login when params change. |
| Session hijacking / fixation | httpOnly + Secure + SameSite cookies. Session ID rotation on login/privilege change. Idle + absolute timeouts. Device list + revoke. |
| Token theft (SPA/mobile) | Short-lived access JWT (≤15 min). **Rotating refresh tokens with reuse detection** (reuse revokes the family). JWKS key rotation (`sv auth:keys:rotate`). `aud`/`iss`/`exp`/`nbf` validated. `alg` allow-list (EdDSA/ES256). `none` rejected. |
| MFA bypass | MFA enforced server-side per tenant/role. Recovery codes hashed. WebAuthn with user verification for admins. |
| OAuth/OIDC attacks | PKCE always. `state` + `nonce`. Exact redirect-URI match. ID-token validation via jose. Account linking requires verified email. |
| SAML attacks | Delegated to a maintained library behind the adapter (XML signature wrapping is a known hazard). Signed assertions required. Audience/recipient checks. |
| Impersonation abuse | Permission-gated, time-boxed, audited, banner metadata. Cannot impersonate higher-privileged roles. |
| API key leaks | Keys shown once. Stored as SHA-256 + pepper. Prefix `sv_live_` / `sv_test_` for secret-scanning partner patterns. Scoped, expiring, per tenant. |
| Identity engine vulnerability (Better Auth) | Version pinning + Renovate security PRs. Advisory watch (e.g. the SCIM ownership advisory not patched on 1.6.x). The adapter boundary allows switching to the native engine or an external IdP. |

### 3.4 Tenancy

| Threat | Controls |
|--------|----------|
| Cross-tenant read/write (the class of bug behind Payload's multi-tenant CVE) | (1) Tenant scope injected into every query by the data adapter. (2) **Postgres RLS** with `FORCE ROW LEVEL SECURITY`. (3) Tenant id on create comes from context only, never from the request body. (4) Generated isolation tests per model. |
| Tenant spoofing via header | `X-Tenant-Id` honoured only for trusted service principals. User requests resolve the tenant from session membership / domain. Membership verified on every request. |
| Connection-pool leakage of tenant context | `SET LOCAL` inside the transaction (scoped to it; safe with PgBouncer transaction mode). Requests without a transaction get one wrapped automatically when tenancy is on. |
| Platform operator abuse | `actor.type = 'system'` explicit, MFA required, all access audited, optional customer-visible access log |

**RLS implementation details (Postgres):**

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE products FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);
-- app connects as role `app_rw` (NOSUPERUSER NOBYPASSRLS, not table owner)
-- migrations run as `app_owner`; `sv migrate` uses DB_MIGRATION_URL when set
```

`current_setting(..., true)` returns NULL when unset, so a missing tenant context **matches no rows** (fail closed). On MySQL and SQLite, isolation is application-level only, and `sv doctor` reports that clearly.

### 3.5 UI (`@strutvane/ui`)

| Threat | Controls |
|--------|----------|
| XSS | React escaping by default. `dangerouslySetInnerHTML` is banned in generated code (lint rule). Rich-text fields sanitised server-side (DOMPurify on output, allow-list). Strict CSP (§8) with nonces. |
| Token theft from JS | Default session mode is **httpOnly cookies** (BFF pattern: same origin in dev and prod). The token mode for cross-origin SPAs stores the access token in memory only and the refresh token in an httpOnly cookie. |
| Clickjacking | `frame-ancestors 'none'` |
| Open redirect after login | Return-URL allow-list (same origin) |
| Leaking hidden fields | UI receives only what the manifest/actor may see, because the API already filters |

### 3.6 Plugins

| Threat | Controls |
|--------|----------|
| Malicious or compromised plugin | Plugins are **listed explicitly** in `strutvane.config.ts` (no auto-loading). `sv add` shows the publisher, provenance status, weekly downloads and requested capabilities before installing. |
| Over-privileged plugin | Plugins declare **capabilities** in `package.json` (`"strutvane": { "capabilities": ["db:migrations", "http:routes", "auth:providers"] }`). The host enforces registration APIs by capability: a plugin without `auth:providers` cannot register an identity provider. *Note: this is an integrity guard, not a sandbox. Plugins run in-process with full Node privileges, and the docs say so plainly.* |
| Hook tampering with security decisions | Security hooks (`beforeAuthorize`) can only **restrict**, never widen, a decision, unless the plugin holds the `auth:policy-override` capability, which `sv doctor` warns about |
| Ecosystem trust | "Verified" badge for plugins in the official index: provenance-attested, 2FA org, security contact, passing the compat test kit |

### 3.7 Supply chain (ecosystem)

| Threat | Controls |
|--------|----------|
| Stolen npm token / account takeover | **No long-lived tokens.** npm trusted publishing (OIDC) only, from a protected GitHub environment with required reviewers. Org-wide 2FA. Two or more owners. |
| Tampered tarball | **Provenance attestations** on every release. `npm audit signatures` documented for users. |
| Compromised dependency (incl. "fresh malicious version" attacks) | pnpm `minimumReleaseAge` (3 days). Lockfile frozen in CI. Renovate with grouped, delayed updates. OSV-Scanner. Dependency-review action. Minimal runtime dependency count (budget enforced in CI per package). |
| Malicious PR / CI poisoning | `pull_request_target` banned. Least-privilege `GITHUB_TOKEN` (`permissions:` block in every workflow). Pinned action SHAs. CODEOWNERS on `.github/**`. |
| Unknown composition | **CycloneDX SBOM** generated per release and attached to the GitHub release |
| Low project hygiene | **OpenSSF Scorecard** ≥ 8 target, CodeQL, branch protection, signed commits/tags |

## 4. Control mapping

### 4.1 OWASP API Security Top 10 (2023)

| Risk | Primary controls |
|------|------------------|
| API1 Broken Object Level Authorization | Generated `authorize(action, record)` + policy-compiled SQL filters + cross-tenant tests |
| API2 Broken Authentication | Identity adapter, MFA, refresh rotation with reuse detection, rate limits, lockout |
| API3 Broken Object Property Level Authorization | `fillable`/`readOnly` writes, field-level read rules, `hidden` fields |
| API4 Unrestricted Resource Consumption | Page-size caps, body limits, query timeouts, rate limits, filter complexity limits, queue concurrency caps |
| API5 Broken Function Level Authorization | Per-action permissions, role-guarded admin routes, `sv auth:matrix` review |
| API6 Unrestricted Access to Sensitive Business Flows | Per-route rate-limit policies, idempotency keys, hooks for bot signals |
| API7 SSRF | Outbound HTTP helper with a deny-list for private ranges (future `webhooks`/`files` packages); no URL fetches from user input in core |
| API8 Security Misconfiguration | Secure defaults (§10), `sv doctor` production checks, security headers |
| API9 Improper Inventory Management | `sv routes`, OpenAPI always generated, versioning with `Deprecation`/`Sunset` headers |
| API10 Unsafe Consumption of APIs | Validated responses for IdP/webhook integrations, timeouts, TLS verification on by default |

### 4.2 ASVS 5.0 L2 chapter coverage (summary)

> Chapter names follow ASVS 5.0 (2025). Map each requirement ID in the compliance checklist in `apps/docs` during Phase 4.

| ASVS area | Where handled | Status at 1.0 target |
|-----------|---------------|----------------------|
| Encoding & sanitization | Framework serializers, UI escaping, rich-text sanitiser | ✅ |
| Validation & business logic | Standard Schema validation on every input, idempotency, rate limits | ✅ |
| Web frontend security | CSP, headers, cookie flags | ✅ |
| API & web service | problem+json, CORS, content-type enforcement, versioning | ✅ |
| File handling | Future `files` package (upload limits, MIME sniffing, AV hook) | Phase 6 |
| Authentication | Identity adapter, argon2id, MFA, passkeys | ✅ |
| Session management | Rotation, timeouts, revoke | ✅ |
| Authorization | Policy engine, RBAC/ABAC, field-level, tenancy | ✅ |
| Self-contained tokens | jose, alg allow-list, JWKS rotation | ✅ |
| OAuth & OIDC | PKCE, state/nonce, exact redirects | ✅ |
| Cryptography | Primitives only, key management via `APP_KEY` + KMS hooks | ✅ |
| Secure communication | TLS required for DB in production (`DB_SSL=require` default for non-local hosts) | ✅ |
| Configuration | Env validation, secure defaults, no secrets in repo | ✅ |
| Data protection | Field encryption (`field.string().encrypted()`), redaction in logs/audit, crypto-shredding on tenant delete | ✅ (encryption at field level) |
| Security logging & error handling | Audit log, pino redaction, OTel | ✅ |

## 5. Secrets & `.env` handling

- **Two files, two roles:**
  - `.env` holds local secrets and is **git-ignored**. It is generated with random values by `sv new` and `sv key:generate`.
  - `.env.example` is **committed**. It holds keys with safe placeholders and a comment per key.

  Every installer (`sv add auth`) appends to both, idempotently.
- **`APP_KEY`:** 32 random bytes, base64. It feeds HKDF to derive subkeys: cookie signing, CSRF, field encryption and API-key pepper. Rotation is supported with `APP_PREVIOUS_KEYS` (comma-separated) for graceful re-encryption (`sv key:rotate`).
- **Boot-time validation:** env is parsed by a Standard Schema schema in `config/*.ts`. A missing or weak secret fails fast. Production refuses to start if:
  - `APP_KEY` is missing or equals the example value,
  - `APP_DEBUG=true`, or
  - `AUTH_SECRET` is shorter than 32 bytes.
- **Production secret sources:** env injected by the platform, plus optional `SecretsProvider` adapters (Azure Key Vault via `@azure/identity`, AWS Secrets Manager, HashiCorp Vault) resolved at boot.
- **Never logged:** pino redaction paths for `password`, `token`, `authorization`, `cookie`, `secret`, `apiKey` and any field marked `sensitive`/`hidden`.
- **Detection:** `sv doctor` warns if `.env` is tracked by git. Generated `.gitignore` covers `.env*` except `.env.example`. Docs recommend gitleaks pre-commit.

## 6. Cryptographic choices

| Purpose | Algorithm / library |
|---------|---------------------|
| Password hashing | argon2id (`@node-rs/argon2`), with WASM fallback |
| JWT signing | EdDSA (Ed25519) default, ES256 option, via `jose`. HS256 only for internal single-service mode. |
| Symmetric encryption (field encryption, cookies) | AES-256-GCM via WebCrypto/`node:crypto`; keys derived via HKDF-SHA256 from `APP_KEY` |
| Random tokens | `crypto.getRandomValues`, ≥128-bit entropy, base32/base64url |
| API key storage | SHA-256(key ‖ pepper), constant-time compare |
| TOTP | RFC 6238 via `@oslojs/otp` *(package name to verify)* |
| Passkeys | WebAuthn via `@simplewebauthn/server` |
| Audit hash chain | SHA-256 over canonical JSON (RFC 8785 JCS) |

## 7. Rate limiting

- Middleware: `rateLimit({ key, window, max })` with sliding-window counters in the `CacheDriver` (Valkey in prod, memory in dev).
- **Defaults:**
  - Auth endpoints: 10/min per IP + 5/min per account for login.
  - Global API: 600/min per actor.
  - Per-resource overrides in the model's options.
- Headers: `RateLimit-Policy` / `RateLimit` (IETF draft), and `Retry-After` on 429.
- Tenant-level quotas as a hook for SaaS plans (future `billing` package).

## 8. HTTP security headers (defaults)

| Header | Default |
|--------|---------|
| `Content-Security-Policy` | `default-src 'self'; script-src 'self' 'nonce-…'; style-src 'self' 'unsafe-inline'` (Tailwind v4 output is static CSS; tighten when possible); `frame-ancestors 'none'; base-uri 'self'; object-src 'none'` |
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` (production only) |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera/mic/geolocation disabled by default |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cache-Control` on API | `no-store` for authenticated responses |

## 9. Audit logging (security perspective)

- **Mandatory events:**
  - login success/failure, MFA changes, password reset, session revoke
  - role/permission changes, impersonation, API key create/revoke
  - tenant lifecycle, data export, config changes via the admin UI
- **Integrity:**
  - Written in the same transaction (outbox).
  - Optional per-tenant hash chain, checked with `sv audit:verify`.
  - The DB role for the app has `INSERT` but not `UPDATE`/`DELETE` on `audit_events` (Postgres).
- **Privacy:**
  - `sensitive` fields are hashed or omitted in diffs.
  - Retention per tenant, plus GDPR erasure that preserves chain integrity (tombstones).

## 10. Secure defaults checklist (shipped in generated apps)

- [ ] `APP_DEBUG=false` and `APP_ENV=production` refuse to boot with example secrets
- [ ] Cookies: `HttpOnly`, `Secure` (prod), `SameSite=Lax`, `__Host-` prefix for session cookie
- [ ] CSRF protection on cookie-authenticated unsafe methods
- [ ] CORS: no wildcard with credentials; explicit allow-list
- [ ] Deny-by-default authorization in production
- [ ] RLS enabled + forced on tenant tables (Postgres)
- [ ] DB TLS required for non-local hosts
- [ ] Max page size, body size, request timeout, statement timeout
- [ ] Rate limits on auth endpoints
- [ ] Security headers (§8)
- [ ] Log redaction of secrets
- [ ] No stack traces in responses outside local debug
- [ ] `.env` git-ignored; `.env.example` committed
- [ ] Dependency audit (`pnpm audit`) in generated CI template
- [ ] Health endpoint does not expose versions/config (`/health` → `{status}`; `/health/details` requires the `system.health` permission)

## 11. Vulnerability disclosure & response

| Item | Policy |
|------|--------|
| Channel | `SECURITY.md` → **GitHub private vulnerability reporting** (GHSA) + security@strutvane.dev (PGP key published) |
| Acknowledgement | ≤ 2 business days |
| Triage + severity (CVSS 4.0) | ≤ 5 business days |
| Fix SLA | Critical ≤ 7 days, High ≤ 14 days, Medium ≤ 30 days, Low next minor |
| Disclosure | Coordinated, GHSA + CVE via GitHub CNA, release notes, `sv doctor` advisory check against published GHSAs |
| Supported versions | Current minor of latest major + active LTS ([10](10-repositories-publishing-versioning.md) §6.8) |
| Credit | Reporters credited (opt-in). Bug bounty considered after 1.0 with sponsor funding. |

## 12. External assurance before 1.0

1. **Independent security audit** (e.g. via OSTIF or a commercial firm) of:
   - `@strutvane/auth` (identity adapter, sessions, tokens, policy engine, tenancy)
   - the framework's CRUD authorization path
   - the CLI's file-writing sandbox
2. **Threat-model review** with at least two external enterprise-security reviewers.
3. **Penetration test** of the generated `examples/multi-tenant-saas` app.
4. Findings are published (summary) and fixed before the `1.0.0` tag. The audit is repeated for every major.
