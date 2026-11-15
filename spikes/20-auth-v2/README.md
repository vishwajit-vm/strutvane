# Spike 20: auth v2 (the engine-agnostic core of `@strutvane/auth`)

**Question:** can one small, dependency-light TypeScript core cover every sign-in option the v2 installer offers (blueprint §2.1, questions 5–12; §6), with secure defaults, behind a storage interface the framework can implement on its ORM?

**Answer: yes.** `src/` is pure services over seven small ports. The same code runs on an in-memory store and on a real SQLite store (`node:sqlite`), and an example Fetch/`node:http` adapter shows the routes. **264 tests pass** (the behaviour suites run once per store; 215 at first commit, 49 added by the adversarial audit of 2026-11-15 and the decisions that followed it, CONSISTENCY #114–117), plus type-level tests checked by `tsc`.

```bash
npm install          # .npmrc sets ignore-scripts=true; nothing here needs an install script
npm test             # tsc --noEmit (incl. type-level tests) + vitest
npm run serve:example   # http://127.0.0.1:3000, in-memory SQLite, every feature on
```

Status: spike (2026-11-15). Standalone: imports nothing from other spikes or `packages/*`. Ideas and code copied from v1 `packages/auth`: the per-IP + per-account limiter idea, IPv6 /64 subjects, trusted-proxy client IP, the scrypt + dummy-hash timing pattern, "new session on every sign-in", and the shape of the identity contract tests.

## Contents

- [What is covered](#what-is-covered)
- [Decisions](#decisions)
- [Dependencies](#dependencies)
- [Interfaces the framework must provide](#interfaces-the-framework-must-provide)
- [Findings](#findings)
- [Tests, including the attack-style ones](#tests)
- [Ready to port / not ready](#ready-to-port)
- [Conflicts to resolve (reported, not resolved)](#conflicts)
- [Open questions](#open-questions)

## What is covered

| # | Item | Where | Notes |
|---|---|---|---|
| 1 | Email + password | `services/passwords.ts`, `password/*` | scrypt (`$scrypt$ln=17,r=8,p=1$…`), rehash-on-login, legacy verifier plug-in (bcrypt import), optional breached/common check hook (`commonPasswordCheck`, k-anonymity `rangeBreachCheck`), timing-safe sign-in (dummy hash), one `INVALID_CREDENTIALS` for every failure, sliding-window limits per IP (/64) and per account, lockout with exponential backoff |
| 2 | Password reset | `services/password-reset.ts` | 256-bit token, keyed digest only, 60 min, single-use (atomic consume), dies on any password change; a reset revokes every session, PAT, remembered device and email link, and lifts the lockout |
| 3 | Email verification | `services/verification.ts` | Laravel's `/email/verify/{id}/{hash}?expires&signature`, HMAC-signed, bound to the current address; resend: 60 s cooldown + 6/hour; **password sign-in waits for it**, and the first mailbox proof wipes what was set before it (#114) |
| 4 | Email link (passwordless) | `services/email-link.ts` | 15 min, single-use, **bound to the requesting browser by a `__Host-` nonce cookie** (HTTPS required outside local, #117); same answer for unknown accounts; consumed by POST (mail scanners prefetch GETs); still goes through 2FA |
| 5 | Two-factor | `services/two-factor.ts`, `totp/totp.ts` | RFC 6238 on `node:crypto` (RFC vectors pass); secret AES-256-GCM-sealed and bound to the user id; confirm-before-enable; 10 recovery codes (8–10 configurable), keyed digests, single-use, regenerate; replay protection via atomic `advanceTotpStep`; "remember this device" (30 days, per user) |
| 6 | Passkeys | `services/passkeys.ts` | `@simplewebauthn/server` 14.1.0; registration, passwordless sign-in (discoverable, UV required), second factor (own passkey only), password confirmation for passwordless accounts, several per user, rename/remove |
| 7 | Sessions | `core/sessions.ts`, `services/sessions.ts` | raw id in the cookie, keyed digest in the store; new id on every sign-in and privilege change; idle (2 h) + absolute (12 h; "remember me" 30 days); list by handle, revoke one, sign out others; "confirm password" 3 h window |
| 8 | Personal access tokens | `services/tokens.ts`, `tokens/formats.ts` | `svp_<40 base62><6 base62 CRC-32>`, shown once, keyed digest only, abilities within the app's allowed patterns, 1-year default expiry, last-used at most once a minute, revoke |
| 9 | Teams | `services/teams.ts` | invitations (keyed digest, 7 days, email-bound, single-use), presets `admin-member` / `admin-manager-member-viewer`, last-admin guard, switching (rotates the session), `current()` for the framework's tenant |
| 10 | Impersonation | `services/impersonation.ts` | global `admin` only, after password confirmation, never another admin, audited start/stop, `AuthState.impersonator` banner flag, 1 h, one-click leave, credentials/factors/tokens/sessions and team grants locked while impersonating, re-checked on every request, every event names the actor and the subject (#115), labelled in the user's sessions list without the admin's IP (#116) |
| 11 | Feature switches | `config.ts`, `http/routes.ts`, every service | `registration` off by default; a disabled feature has no routes AND its services throw `NOT_FOUND`; the HTTP 404 is byte-identical to an unknown path |
| 12 | Events | `ports/events.ts` | closed event union (ids, enums, counts only); a full-run test proves no secret reaches events or logs |

## Decisions

1. **scrypt, not argon2id.** `@node-rs/argon2` 2.2.2 (MIT; npm, 2026-11-15) has no install scripts, but it ships a prebuilt native `.node` binary per platform through optional dependencies: an unreviewable artefact and a supply-chain path for a security-critical primitive. scrypt is memory-hard, is OWASP's listed alternative, and is built into Node. The format names its algorithm, so an argon2id hasher can be added later and old hashes upgrade on the next sign-in. Measured on this machine (Node 24.21, Windows 11, median of 5): `ln=14` 45 ms, `15` 82 ms, `16` 163 ms, **`17` (the default, 128 MiB) 351 ms**. Tests use `ln=14`.
2. **Keyed digests (HMAC-SHA-256 with an HKDF subkey of `APP_KEY`) for every stored secret**, PATs included. 256-bit tokens would be safe with plain SHA-256, but recovery codes (~50 bits) and email digests are not, and one rule is easier to audit. Cost: rotating `APP_KEY` signs everyone out and invalidates tokens and recovery codes (see open questions).
3. **One single-use table** (`auth_one_time_tokens`, keyed by `(purpose, digest)`) serves reset tokens, email links, WebAuthn challenges and remembered devices. The framework may split it into Laravel-named tables; the store contract does not care.
4. **A pending two-factor session is a guest everywhere**; the 2FA limiter and lockout key on the account, so restarting the sign-in does not reset them.
5. **"Remember me" is a long-lived server session** (30 days idle and absolute), not a separate `remember_token` cookie. One credential, revocable from the sessions list.
6. **Passwordless passkey sign-in counts as two factors** (device + user verification), so a 2FA user signing in with a passkey skips TOTP; the event records `secondFactor: 'passkey'`.
7. **Registration never reveals a taken email when verification is on**: both cases answer `verification-sent` and create no session; the owner of a taken address gets a "someone tried to register" mail. Without verification, a taken email has to be reported (`EMAIL_TAKEN`); this is rate-limited and documented.
8. **Mail is sent in the background** (`setImmediate` + tracked promise), so no response time depends on whether an account exists. `auth.idle()` awaits it (tests, graceful shutdown).

## Dependencies

npm only, exact versions, `ignore-scripts=true` in `.npmrc`. Checked on npm on **2026-11-15**.

| Package | Version | Licence | Kind | Why |
|---|---|---|---|---|
| `@simplewebauthn/server` | 14.1.0 (published 2026-11-06) | MIT | runtime | WebAuthn attestation/assertion verification (CBOR, COSE, signature counters, origin/RP checks) is too easy to get subtly wrong to hand-roll. The only runtime dependency. |
| `typescript` | 6.0.3 | Apache-2.0 | dev | typecheck and type-level tests (same pin as spikes 12 and 16) |
| `vitest` | 5.1.0 | MIT | dev | tests |
| `fast-check` | 4.10.2 | MIT | dev | property-based fuzzing of every parser |
| `@types/node` | 24.10.1 | MIT | dev | Node types |

Transitive runtime licences (from `package-lock.json`): MIT (`@peculiar/*`, `@hexagon/base64`, `@levischuck/tiny-cbor`, `pvtsutils`, `pvutils`, `tsyringe`), BSD-3-Clause (`asn1js`), Apache-2.0 (`reflect-metadata`), 0BSD (`tslib`). No package in the runtime tree has an install script; the only one in the whole tree is `fsevents` (macOS-only, dev, via vitest), which `ignore-scripts` skips. Everything else (TOTP, scrypt, AES-GCM, HKDF, SQLite, base32, CRC-32) is `node:crypto`, `node:sqlite` and `node:zlib`.

Note: `@peculiar/x509` (pulled in by simplewebauthn) touches experimental WebCrypto features on Node 24, which prints `ExperimentalWarning` lines during the tests. Harmless; worth a look before the product pins Node 26.

## Interfaces the framework must provide

All ports are in `src/ports/`. `createAuth({ config, store, counters, mailer, events, appKey, clock?, logger?, hasher?, passwordCheck? })` wires them.

| Port | File | What the framework implements | Spike implementation |
|---|---|---|---|
| **Storage** `AuthStore` | `ports/store.ts` | 44 small methods over the app's own migrations (`users`, `user_roles`, `sessions`, `auth_one_time_tokens`, `two_factor_recovery_codes`, `passkeys`, `personal_access_tokens`, `teams`, `team_members`, `team_invitations`), all marked `internal`. **Must be atomic** for `consumeOneTime`, `consumeRecoveryCode`, `consumeInvitation`, `advanceTotpStep`, `advancePasskeyCounter` and the last-admin guard `changeMemberRole` (`DELETE … RETURNING`, conditional `UPDATE`); unknown enum values in a row fail closed; emails compared byte for byte (MySQL: binary collation) | `store/memory.ts`, `store/sqlite.ts` (+ `sqlite-schema.ts`) |
| **Counters** `CounterStore` | `ports/counter-store.ts` | `increment(key, ttl)`, `get`, `set`, `delete` on the SHARED cache (`cache` table or Redis). A per-process store multiplies every limit by the instance count | memory; SQLite (`INSERT … ON CONFLICT … RETURNING`), tested across two instances |
| **Mailer** `AuthMailer` | `ports/mailer.ts` | `send(mail)` for a closed union of six mails; queue them (Laravel's queued notifications). Each mail carries one secret URL; never log it | test recorder |
| **Clock** `Clock` | `ports/clock.ts` | `now()` (spike 12's `ClockToken`) | `systemClock`, `manualClock` |
| **Events** `AuthEventSink` + **logger** `AuthLogger` | `ports/events.ts` | `emit(event)` into the audit log / event bus; `warn(message, ids)` | test recorders |
| **Cookies + request** `CookieJar`, `AuthRequest` | `ports/cookies.ts` | `get/set/clear` (HttpOnly, SameSite=Lax, Path=/, Secure on https; the core asks for `__Host-` names on https) and the client IP **already resolved** from the socket peer through trusted proxies | `http/cookies.ts`, `http/node.ts` |
| **Secrets** | `crypto/keys.ts` | `APP_KEY` (`base64:` + 32 bytes); boot fails if it is shorter | — |

What the framework still owns around this core: the router and Fortify-style route names, **CSRF** (spike 12's middleware: the example adapter only does the same-origin half), validation messages from catalogs (RFC-0003), problem+json rendering, the `auth` / `guest` / `verified` / `password.confirm` / `abilities` middleware (thin wrappers over `auth.state()`, `verification.assertVerified()`, `tokens.authenticate()`), the tenant scope fed by `teams.current()`, and the screens.

## Findings

1. **The core is ~5,500 lines (about a quarter of it TSDoc and comments) with one runtime dependency.** TOTP, scrypt, AES-GCM, HKDF and the token formats need nothing beyond `node:crypto`; passkeys are the only place a library earns its keep.
2. **A small store interface is enough, if it promises atomicity.** Every single-use rule (reset, email link, recovery code, invitation, WebAuthn challenge, TOTP step) reduces to "of two concurrent callers exactly one wins". The race tests run two concurrent submissions and two SQLite connections to one file; both stores pass the same contract.
3. **Sliding windows and lockouts interact.** With the 2FA limiter at 5/5 min and the lockout at 5 failures, the limiter fired first and the lockout never engaged (found by the "6 wrong codes across 3 fresh sign-ins" test). The rate limit is now looser (10) than the lockout, so the lockout is the bound and the limiter only caps the rate. Same lesson for resend throttling: a cooldown must be a separate "until" value, not a 1-per-minute sliding window, or refused attempts keep extending it.
4. **Node accepts truncated AES-GCM tags by default** (DEP0182 surfaced in the test run). `open()` now insists on 16-byte tags, with a regression test. Any framework code using GCM must do the same.
5. **Browser binding makes email links safe to forward, at a UX cost:** a link requested on a laptop does not work on a phone. The mismatch does not burn the link, so the right browser can still use it.
6. **Feature switches need both layers.** Unregistered routes give a byte-identical 404 (tested for all 35 feature routes); services throw `NOT_FOUND` too, so an app calling a service from its own controller cannot resurrect a disabled feature.
7. **Timing equality holds structurally, not just statistically:** every sign-in failure path runs exactly one full-cost hash verification (counted with a spy hasher), and a loose median test (known vs unknown email, real scrypt) stays within 0.6–1.6×. Remaining timing gap: a reset request for an existing account does one extra DB write.
8. **WebAuthn can be tested without a browser.** `test/helpers/authenticator.ts` is a ~150-line software authenticator (ES256, attestation `none`, CBOR) driving the real `@simplewebauthn/server` verification, including clone detection (counter), wrong origin, missing user verification, and challenge replay.

### Adversarial audit (2026-11-15)

An attack-first pass, which did not trust the spike's own tests, found 18 bugs. Each is fixed with a failing test first and a regression test for its class. The lessons for the port:

9. **Re-check every precondition while a privilege lasts, not only when it starts.** Impersonation was checked at start only, so a demoted admin kept acting for an hour. It is now re-checked on every request. Grants that outlive an impersonation (team invites, role changes, accepting) are refused, like tokens.
10. **Every place that checks a password needs the same budget and the same length measure.** "Change password" verified the current one with no rate limit. Setting and checking measured length differently (NFKC code points vs UTF-16 units).
11. **Without transactions, order writes so a failure fails closed:** revoke first, grant last. Reset and change used to write the new hash before revoking sessions; 2FA confirm switched 2FA on before storing recovery codes. `test/storage-failures.test.ts` breaks each step in turn.
12. **Check-then-act is a race.** The last-admin guard and the passkey counter are now single conditional writes (#117), raced across two SQLite connections.
13. **Bound the product of cost parameters, not each one.** scrypt's ln=16, r=32, p=16 passed every per-field range and cost 27 s per verification.
14. **Normalise every spelling of an identifier you rate-limit on.** The hex and expanded IPv4-mapped IPv6 forms put all IPv4 clients behind such a proxy into one /64 bucket. Invisible Unicode characters allowed look-alike email accounts.
15. **Account pre-hijacking needs a rule, not a patch (#114).** With verification on, password sign-in waits for the mailbox proof. That first proof wipes the pre-verification password, sessions and tokens, and the owner sets a new password.
16. **Audit "who" and "whose" separately (#115).** While impersonating, an event that names only the user blames the user.
17. **Smaller items, all fixed:**
    - a malformed `%` in a route param answered 500;
    - single-use expiry was judged before the slow step, not at the consume;
    - narrowing token abilities did not narrow old tokens;
    - invitations had no rate limit (a mail cannon);
    - the verification-link hash equalled the limiter key;
    - passkey origins, the lockout threshold and appUrl were not validated at boot.

## Tests

`npm test` runs `tsc --noEmit` (sources, tests, and `test/types.test-d.ts`) then vitest. Behaviour suites run against **both** stores (`describe.each(STORES)`); SQLite is real (`node:sqlite`, in-memory and file-backed).

| File | Covers |
|---|---|
| `primitives.test.ts` | key ring, AES-GCM (tamper, context, truncated tag), base32, scrypt (format, NFKC, rehash, legacy, absurd params), password rules and breach checks, TOTP RFC 4226/6238 vectors, limiter (no 2× boundary burst), lockout backoff, config validation |
| `passwords.test.ts` | registration (off by default, no enumeration with verification), sign-in, **enumeration by message, work and timing**, rehash-on-login, hostile input types, **rate-limit bypass attempts** (IPv6 /64 rotation, missing IP, distributed per-account, email case variants), lockout incl. unknown emails, **session fixation**, raw id never stored, logout, idle/absolute/remember timeouts, sessions list and revoke, confirm-password window, password change |
| `links.test.ts` | reset (same answer, stored address, single use, expiry, **token reuse race**, other links die, limits, lockout lift), verification (signed, idempotent, edited/expired/other-user links, resend throttle), email link (**forwarded link**, no enumeration, expiry, multi-request, limits) |
| `two-factor.test.ts` | confirm-before-enable, encrypted secret, pending = guest, new id after 2FA, **TOTP replay** (sequential and concurrent), **recovery code reuse**, regenerate, **brute force across fresh sign-ins**, pending expiry, email link through 2FA, remembered device (per user, revoked on disable), malformed codes |
| `passkeys.test.ts` | several per user, rename/remove (owner only), passwordless sign-in, **assertion replay**, cloned authenticator, wrong origin, no UV, bad registrations, second factor with own passkey only, passkey confirmation |
| `tokens.test.ts` | format, digest-only storage, abilities within allowed patterns, expiry, last-used throttle, revoke, **forged/mutated tokens**, disabled feature authenticates nothing |
| `teams.test.ts` | personal team, **forwarded invitation**, single use, expiry, unverified invitee, admin-only management, NOT_FOUND for outsiders, last admin, removal drops the team at once, switching rotates, revoke invitation |
| `impersonation.test.ts` | admin-only + confirmation, banner flag, audited, leave, **impersonating an admin**, self, nesting, non-admins, locked actions while impersonating, 1 h expiry, feature off |
| `http.test.ts` | **disabled features byte-identical to unknown paths**, service-level refusal, cookies (`__Host-`, HttpOnly, SameSite, Secure), problem+json + Retry-After, cross-site / same-site / `Origin: null` refused, JSON only, body cap, bearer never falls back to the cookie, real `node:http` server with **forged `X-Forwarded-For`** |
| `redaction.test.ts` | a full run through every feature: **no password, token, code, cookie, link or TOTP secret in events or logs**; failing mailer/sink logged by kind only; errors never echo credentials |
| `pre-hijacking.test.ts` | #114: password sign-in refused until verified (no oracle without the password); the verification link and an email-link sign-in wipe the pre-verification password, sessions and tokens and hand the owner a set-password token; verified accounts untouched |
| `parsers.fuzz.test.ts` | fast-check: every parser on arbitrary input never throws; any one-character change to a valid PAT, secret, recovery code or **signed link** is refused (the link at service level) |
| `store-contract.test.ts` | the atomic store rules on both stores, two SQLite connections to one file, **two app instances sharing limits**, counter expiry, unknown session state or method fails closed |
| `storage-failures.test.ts` | each store step of reset, password change and 2FA confirm made to throw in turn: **never a new password with a thief's session alive, never 2FA on without recovery codes** |
| `types.test-d.ts` | misuse that must not compile: unknown feature keys, role presets, secret-bearing event fields, mails without links, store patches that change ids/emails/session owners, readonly state |

## Ready to port

**Ready** (move into `strutvane-auth` with tests): the ports, `crypto/*`, `password/*`, `totp/*`, `tokens/formats.ts`, `limits/*`, `core/*`, every service, the store contract tests, the software authenticator, the redaction test.

**Not ready / the framework's job:**
- an ORM-backed `AuthStore` (spike 11) and the app migrations (spike 10 format, `internal: true`);
- a cache-backed `CounterStore` (`cache` table / Redis);
- CSRF token fallback, form posts, Fortify-style redirect-or-JSON responses, message catalogs;
- the middleware aliases and the `actingAs` testing helper;
- screens (login, 2FA challenge, settings: profile, security, sessions, API tokens, passkeys, teams, the impersonation banner);
- commands: `user:create --password-env`, `tokens:prune`, `auth:clear-resets` (prune expired `auth_one_time_tokens` / invitations);
- email change (a verified flow: confirm the new address, notify the old one);
- policies, the role map and `Policy` classes stay in their own work (v1's policy → SQL compiler).

## Conflicts

Reported for the owner; nothing here was silently decided against an accepted ADR.

1. **Default engine.** ADR-0005 / ADR-0013 make Better Auth the default identity engine; this spike (and the auth research §9 C3) is a native engine on app tables. Needs a superseding ADR before porting.
2. **"Stored hashed with SHA-256"** (blueprint §6) vs this spike's keyed HMAC-SHA-256 (decision 2). It is still SHA-256, but keyed; the blueprint wording should say so.
3. **Remember-me** as a hashed `selector:validator` cookie (auth research §5.3) vs a long-lived server session here (decision 5).
4. **Session table shape.** Laravel's `sessions.id` is the raw id; here it is a keyed digest and the table carries `state`, `method`, `expires_at`, `idle_ms`, `password_confirmed_at` and `impersonator_id`. The framework's session (flash, CSRF token, intended URL) and this auth session must be ONE concept (research §4 principle 3): decide whether the framework session store adopts these columns.
5. **Package manager.** ECOSYSTEM.md still says pnpm via corepack; the v2 decisions say npm only. This spike uses npm, as instructed.

## Open questions

1. `APP_KEY` rotation: support a previous-key list (verify with old, re-digest on use) or accept a global sign-out on rotation?
2. Email link UX: offer a 6-digit code alternative (WorkOS "Magic Auth" style) for the "requested on laptop, opened on phone" case?
3. Should an email link create an account when `registration` is on (today it only signs in existing accounts)?
4. Should passkey-only users be allowed to have no recovery path except email reset, or must enabling passkeys-as-sole-factor require recovery codes?
5. Lockout DoS: the password lockout can be triggered by anyone for a victim's email (by design, capped at 1 h, and reset/links/passkeys still work). Is 5 failures / 60 s base / 1 h cap the right default for B2B?
6. Should token creation require a recent password confirmation (Jetstream does not; GitHub does for some scopes)?
7. Team roles beyond `admin` (manager, viewer) have no meaning inside this core; confirm they stay pure policy input.
8. Global roles (`user_roles`) vs team roles: impersonation keys on the global `admin` role only. Confirm a team admin must never impersonate.
