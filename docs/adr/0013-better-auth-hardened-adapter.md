# ADR-0013: Better Auth is the default identity engine, behind a contract-tested `IdentityEngine` interface with mandatory hardening

- **Status:** Superseded by ADR-0023 (2026-11-16); the IdentityEngine contract and hardening rules carry over
- **Date:** 2026-11-13
- **Related:** [Spike 07 report](../../spikes/07-better-auth-adapter/README.md), [ADR-0007](0007-tenancy-rls-enforcement-rules.md), [07 Auth](../07-package-auth.md), [12 Security](../12-security-model.md)

## Context

Spike 07 showed that Better Auth 1.7.23 can implement Strutvane's `IdentityEngine` with **no type leakage**. A test enforces that no Better Auth import exists above the adapter. A second, independent native engine passes **the same 16-test contract suite**, so the seam is real.

The spike also showed that **Better Auth's defaults are not safe enough:**
- Sessions survive a password reset.
- Password reset leaks which emails exist through timing: 419 ms for a known email vs 12 ms for an unknown one.
- Internal errors print raw stack traces to stderr.
- Ids are not UUIDs, which breaks the tenant policy's `::uuid` cast (ADR-0007). A malformed id then surfaced as a 500.
- Rate limiting is production-only, kept in memory per process, and per-IP. Rotating a spoofed `X-Forwarded-For` header bypasses it entirely.

## Decision

- **`@strutvane/auth` owns the interface.** `IdentityEngine` takes a Web `Request` and returns an `IdentityResult`, with stable error codes, cookies passed as headers, and fail-closed behaviour.
  - An `authenticate(request) → { actor, headers }` method carries refreshed rolling-session cookies.
  - Auth ships the **contract suite as a test kit** that every adapter must pass.
- **The Better Auth adapter is the default, and it always applies this hardening:**
  - explicit rate limiting with shared storage (not per-process memory)
  - trusted proxies only, with no blind trust of `X-Forwarded-For`
  - a per-account sign-in limit in addition to the per-IP limit
  - `revokeSessionsOnPasswordReset`
  - `minPasswordLength: 12`
  - a background-task handler, so password reset has constant timing and no enumeration
  - `onAPIError.throw`, with errors routed to Strutvane's error reporter and never to stderr
  - UUID ids, validated at the boundary before any database call
- **Tenant and role are re-resolved from membership on every request.** The active tenant on the session is never trusted, because it has no foreign key and switching tenant doesn't rotate the token.
- **Auth tables** migrate through Strutvane's migration planner using `getSchema()`. Better Auth's `compileMigrations()` stays as a CI cross-check.

## Consequences

- **Positive:**
  - The identity engine can be replaced.
  - Security behaviour is verified by tests, not assumed. The spike's three deliberately planted bugs were each caught.
  - The governance risk of the Vercel acquisition is contained.
- **Costs:** we maintain the adapter, the contract suite and the tripwire tests. Semi-internal Better Auth APIs (`$context.adapter`) require exact version pinning and a review on each upgrade.
