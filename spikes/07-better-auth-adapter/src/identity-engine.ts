/**
 * The seam between Strutvane and any identity engine (Better Auth, OIDC, a native engine…).
 *
 * Design rules (the point of this spike):
 * 1. **Only Strutvane types cross this boundary.** No Better Auth (or other engine) type appears
 *    in any signature. Requests and responses are Web-standard `Request` / `Headers`, so every HTTP
 *    host (Hono, Express via adapters, Fastify, Next.js) can use it.
 * 2. **Errors are values, not exceptions.** Every method returns an {@link IdentityResult} whose
 *    error carries a stable RFC-0003-style `code`. Raw engine errors and messages never escape:
 *    they could leak internals or differ between engines.
 * 3. **Cookies travel as headers.** Methods that change the session return the `Set-Cookie`
 *    headers the host must copy onto its response. The engine owns cookie names and attributes.
 * 4. **Fail closed.** Anything unexpected becomes `INTERNAL_ERROR`, and `getActor` returns `null`.
 *
 * @module
 */
import type { Actor } from './contracts.ts'

/**
 * Stable error codes (RFC-0003). Messages are rendered from catalogs by the host, never taken from
 * the engine.
 */
export type IdentityErrorCode =
  /** Input failed validation (e.g. password too short, malformed email). */
  | 'VALIDATION_FAILED'
  /** Wrong email or password. Deliberately identical for "unknown email" (no user enumeration). */
  | 'INVALID_CREDENTIALS'
  /** Sign-up with an email that cannot be used. See README: this reveals that the account exists. */
  | 'EMAIL_UNAVAILABLE'
  /** Too many attempts; retry after `retryAfterSeconds`. */
  | 'RATE_LIMITED'
  /** A password-reset token that is invalid, expired or already used. */
  | 'INVALID_TOKEN'
  /** No valid session. */
  | 'UNAUTHENTICATED'
  /** Authenticated, but not allowed (e.g. switching to a tenant you are not a member of). */
  | 'FORBIDDEN'
  /** The engine failed unexpectedly. Details are logged, never returned. */
  | 'INTERNAL_ERROR'

/** A failed identity operation. */
export interface IdentityError {
  readonly code: IdentityErrorCode
  /** The HTTP status the host should answer with. */
  readonly status: number
  /** Present for `RATE_LIMITED`. */
  readonly retryAfterSeconds?: number
}

/**
 * The outcome of an identity operation. `headers` always exists and must be applied to the host's
 * response (it carries `Set-Cookie` on sign-in/sign-out, and may carry headers on errors too).
 */
export type IdentityResult<T> =
  | { readonly ok: true; readonly value: T; readonly headers: Headers }
  | { readonly ok: false; readonly error: IdentityError; readonly headers: Headers }

/** A tenant the current user belongs to. */
export interface TenantMembership {
  readonly tenantId: string
  readonly name: string
  readonly slug: string
  /** Roles the user holds in this tenant, e.g. `["owner"]`. */
  readonly roles: readonly string[]
}

export interface SignUpInput {
  readonly email: string
  readonly password: string
  readonly name: string
}

export interface SignInInput {
  readonly email: string
  readonly password: string
}

export interface CreateTenantInput {
  readonly name: string
  /** URL-safe unique identifier, e.g. `"acme"`. */
  readonly slug: string
}

/** Delivers a password-reset token to the user (the host wires this to its mailer). */
export type PasswordResetDelivery = (message: {
  readonly email: string
  readonly token: string
}) => Promise<void>

/**
 * An identity engine. Every method that acts "as the current user" reads the session from the
 * incoming `request` (cookies, origin, client IP for rate limiting).
 */
export interface IdentityEngine {
  /** Human-readable engine name, for diagnostics (`sv doctor`). */
  readonly name: string

  /** Create an account with email + password and sign it in. */
  signUp(input: SignUpInput, request: Request): Promise<IdentityResult<{ readonly actor: Actor }>>

  /** Sign in with email + password. Returns the new session cookie in `headers`. */
  signIn(input: SignInInput, request: Request): Promise<IdentityResult<{ readonly actor: Actor }>>

  /** End the current session (server-side revocation, not just cookie removal). */
  signOut(request: Request): Promise<IdentityResult<null>>

  /**
   * Resolve the actor for a request, or `null` when there is no valid session. Never throws: any
   * engine failure resolves to `null` (fail closed) and is reported through the logger.
   */
  getActor(request: Request): Promise<Actor | null>

  /**
   * Start a password reset. Always succeeds for well-formed input, whether or not the email
   * exists, so the response never reveals which emails have accounts.
   */
  startPasswordReset(input: { readonly email: string }, request: Request): Promise<IdentityResult<null>>

  /** Finish a password reset with the delivered token. Revokes every existing session. */
  completePasswordReset(
    input: { readonly token: string; readonly newPassword: string },
    request: Request,
  ): Promise<IdentityResult<null>>

  /** Create a tenant owned by the current user. */
  createTenant(
    input: CreateTenantInput,
    request: Request,
  ): Promise<IdentityResult<TenantMembership>>

  /** Tenants the current user belongs to. */
  listTenants(request: Request): Promise<IdentityResult<readonly TenantMembership[]>>

  /**
   * Make `tenantId` the session's active tenant. A tenant the user is not a member of, and a
   * tenant that does not exist, both return `FORBIDDEN` (indistinguishable on purpose).
   */
  switchTenant(
    input: { readonly tenantId: string },
    request: Request,
  ): Promise<IdentityResult<{ readonly actor: Actor }>>

  /**
   * SYSTEM operation (no session): add a user to a tenant with a role. Used by seeders, invitation
   * acceptance and tests. Callers must authorise it themselves; it is never exposed over HTTP as is.
   */
  addMemberAsSystem(input: {
    readonly tenantId: string
    readonly userId: string
    readonly role: string
  }): Promise<IdentityResult<null>>

  /**
   * SYSTEM operation (no session): remove a user from a tenant. Sessions whose active tenant was
   * this one must immediately stop carrying it (the actor loses `tenantId` and roles).
   */
  removeMemberAsSystem(input: {
    readonly tenantId: string
    readonly userId: string
  }): Promise<IdentityResult<null>>
}

/** Helper for adapters: a successful result. */
export function ok<T>(value: T, headers: Headers = new Headers()): IdentityResult<T> {
  return { ok: true, value, headers }
}

/** Helper for adapters: a failed result. */
export function fail<T>(
  code: IdentityErrorCode,
  status: number,
  headers: Headers = new Headers(),
  retryAfterSeconds?: number,
): IdentityResult<T> {
  const error: IdentityError =
    retryAfterSeconds === undefined ? { code, status } : { code, status, retryAfterSeconds }
  return { ok: false, error, headers }
}
