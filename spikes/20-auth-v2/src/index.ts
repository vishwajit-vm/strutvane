/**
 * Spike 20: the engine-agnostic core of `@strutvane/auth` v2.
 *
 * Start with {@link createAuth} and {@link defineAuthConfig}; implement the ports in `ports/` (the
 * spike ships memory and SQLite stores). See the README for the design and the findings.
 *
 * @module
 */
export { type Auth, type AuthPorts, type AuthState, createAuth, type SystemService } from './auth.ts'
export { COOKIE_NAMES, type CookieKind } from './core/deps.ts'
export {
  type AuthConfig,
  type AuthConfigInput,
  type AuthFeatures,
  DEFAULT_FEATURES,
  DEFAULT_LIMITS,
  defineAuthConfig,
  type PasskeyConfig,
  type RateLimits,
  type RateRule,
  ROLE_PRESETS,
  type RolePreset,
} from './config.ts'
export { AUTH_ERROR_STATUS, AUTH_MESSAGES, AuthError, type AuthErrorCode, type AuthIssue } from './errors.ts'
export { type Clock, type ManualClock, manualClock, systemClock } from './ports/clock.ts'
export type { AuthRequest, CookieJar, CookieOptions } from './ports/cookies.ts'
export type { CounterStore } from './ports/counter-store.ts'
export type { AuthEvent, AuthEventSink, AuthEventType, AuthLogger, LoginMethod, SecondFactor } from './ports/events.ts'
export type { AuthMail, AuthMailer } from './ports/mailer.ts'
export type * from './ports/store.ts'
export { createScryptHasher, DEFAULT_SCRYPT, type LegacyVerifier, type PasswordHasher, type ScryptParams } from './password/hasher.ts'
export { commonPasswordCheck, type PasswordCheck, type PasswordVerdict, rangeBreachCheck } from './password/rules.ts'
export { normalizeEmail } from './password/email.ts'
export type { ChallengeMethod, SignInResult } from './core/sign-in.ts'
export { abilityGranted, type TokenAuthentication, type TokenView } from './services/tokens.ts'
export type { CurrentTeam } from './services/teams.ts'
export type { PasskeyMode, PasskeyView } from './services/passkeys.ts'
export type { SessionView } from './services/sessions.ts'
export { memoryAuthStore, memoryCounterStore } from './store/memory.ts'
export { sqliteAuthStore, sqliteCounterStore } from './store/sqlite.ts'
export { createAuthHandler } from './http/routes.ts'
export { createAuthServer } from './http/node.ts'
