# ADR-0023: Strutvane's own (native) identity engine is the default; Better Auth is retired as the default

- **Status:** Accepted
- **Date:** 2026-11-16
- **Deciders:** project lead
- **Related:** supersedes the "Better Auth default" part of [ADR-0005](0005-identity-adapter-better-auth-default.md) and [ADR-0013](0013-better-auth-hardened-adapter.md); [18 §6](../18-v2-blueprint.md); spike 20 (`spikes/20-auth-v2`); `spikes/CONSISTENCY-2026-11-15.md` #22–30, #61–70, #105–122

## Context

ADR-0005 and ADR-0013 made Better Auth the default identity engine, behind a contract-tested `IdentityEngine`. Two things have changed since then.

**v1's own audit (2026-11-15) found Better Auth-specific problems** that can't be fixed from our side without new upstream options:
- session and reset tokens stored raw;
- the cookie is `__Secure-` rather than `__Host-`;
- no session rotation on tenant switch;
- `trustedOrigins` not passed through;
- `idleMinutes` ignored;
- the origin check switched off whenever `NODE_ENV=test` (now pinned on).

**The v2 auth prototype (spike 20) delivers every sign-in option the installer offers:**
- email + password;
- email link;
- verification and reset;
- TOTP with recovery codes;
- passkeys;
- sessions;
- API tokens;
- teams;
- impersonation;
- feature switches.

Spike 20 was attacked in two audit rounds, fixing 31+ bugs and the pre-hijacking class, and has 279 tests. Its only runtime dependency is `@simplewebauthn/server` (MIT); everything else uses Node's own crypto.

## Decision

1. **The native engine from spike 20 becomes the default and only engine for 0.2:**
   - it ships in `@strutvane/auth`;
   - it keeps the `IdentityEngine` contract and its contract test kit, so a different engine stays possible;
   - storage goes through the framework ORM;
   - hashing comes from the framework's `Hash` (#63);
   - signing and keys come from the framework keyring (#64–66);
   - cookie names come from one source (#105).
2. **Better Auth is marked obsolete, not deleted:**
   - The v1 adapter moves to the deprecated subpath `@strutvane/auth/better-auth`. It logs a one-line deprecation warning, is documented with a migration guide, and is removed no earlier than 0.3 (blueprint §8 deprecation rule).
   - New apps never get it.
3. **The audit's open Better Auth findings** (raw token storage, cookie prefix, session rotation, origin pass-through, idle timeout) are **resolved by this decision for 0.2.** They stay open only for apps that keep the deprecated adapter, and the deprecation notice names them.

## Alternatives considered

| Option | Pros | Cons | Why not |
|---|---|---|---|
| Keep Better Auth as the default | Maintained upstream; fewer lines of our own | Raw token storage, cookie prefix and origin issues need upstream changes; ownership changed (now owned by Vercel); our 0.2 features (email link, impersonation rules, pre-hijacking fix) would need workarounds | The audit showed the gaps can't be closed from our side |
| Ship both as equal choices in the installer | Choice for users | Twice the security surface to audit and test; confusing | Not worth it before 1.0 |

## Consequences

- **Positive:**
  - one engine that we have audited, with keyed digests and `__Host-` cookies throughout;
  - every installer sign-in option supported;
  - fewer dependencies.
- **Costs we accept:**
  - We own security-critical code: every change needs attack tests, and the external security audit before 1.0 covers it (phase 3).
  - Apps on v1 (`next` tag only, so few or none) need the migration guide.
- **Follow-ups:**
  - Port spike 20 into `@strutvane/auth` v2.
  - Update D12 in `00-executive-summary.md`, blueprint §6 and the docs auth pages.
  - Run `npm deprecate` on the old behaviour where relevant, after 0.2 ships.
