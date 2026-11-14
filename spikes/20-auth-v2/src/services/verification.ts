/**
 * Email verification with signed links (Laravel's `/email/verify/{id}/{hash}?expires&signature`).
 *
 * The link is stateless: `signature = HMAC(subkey, "<id>.<hash>.<expires>")`, where `hash` is a keyed
 * digest of the CURRENT email. So a link expires after 60 minutes, cannot be edited (any changed
 * character breaks the signature), and stops working if the address changes. Verifying twice is
 * harmless (idempotent). Resending is throttled per account: one per minute, six per hour.
 *
 * @module
 */
import { createHmac } from 'node:crypto'
import { safeEqual } from '../crypto/constant-time.ts'
import { AuthError } from '../errors.ts'
import type { AuthRequest } from '../ports/cookies.ts'
import type { UserRecord } from '../ports/store.ts'
import { parseVerificationLink } from '../tokens/formats.ts'
import { type AuthDeps, emit, requireFeature, sendMail } from '../core/deps.ts'
import { requireActive } from '../core/sessions.ts'

function emailHash(deps: AuthDeps, email: string): string {
  return deps.keys.digest('email-digest', email).slice(0, 40)
}

function sign(deps: AuthDeps, id: string, hash: string, expires: number): string {
  return createHmac('sha256', deps.keys.subkey('email-verification')).update(`${id}.${hash}.${expires}`).digest('hex')
}

/** The signed verification URL for `user`, valid for the configured window. */
export function verificationUrl(deps: AuthDeps, user: UserRecord): string {
  const hash = emailHash(deps, user.email)
  const expires = Math.floor((deps.clock.now() + deps.config.links.verificationMs) / 1000)
  return `${deps.config.appUrl}/email/verify/${user.id}/${hash}?expires=${expires}&signature=${sign(deps, user.id, hash, expires)}`
}

/** Email verification operations (feature `emailVerification`). */
export interface VerificationService {
  /**
   * Mail a fresh link to the signed-in user (throttled).
   *
   * @example
   * ```ts
   * await auth.verification.resend(req) // POST /email/verification-notification
   * ```
   */
  resend(req: AuthRequest): Promise<{ readonly status: 'sent' | 'already-verified' }>
  /**
   * Verify from the link's parts (route params + query). No session is needed: the signature is
   * the proof, so the link works on another device.
   *
   * @example
   * ```ts
   * await auth.verification.verify(req, { id, hash, expires: query.expires, signature: query.signature })
   * ```
   */
  verify(
    req: AuthRequest,
    parts: { readonly id: unknown; readonly hash: unknown; readonly expires: unknown; readonly signature: unknown },
  ): Promise<void>
  /** Throw `EMAIL_NOT_VERIFIED` when verification is on and `user` has not verified (the `verified` guard). */
  assertVerified(user: UserRecord): void
}

/** Build the {@link VerificationService}. */
export function verificationService(deps: AuthDeps): VerificationService {
  return {
    async resend(req) {
      requireFeature(deps, 'emailVerification')
      const { user } = await requireActive(deps, req)
      if (user.emailVerifiedAt !== null) return { status: 'already-verified' }
      // A cooldown between sends (only a successful send starts it), then an hourly cap.
      const coolKey = `verify-resend:cool:${user.id}`
      const now = deps.clock.now()
      const coolUntil = await deps.counters.get(coolKey)
      if (coolUntil !== undefined && coolUntil > now)
        throw new AuthError('RATE_LIMITED', { retryAfterSeconds: Math.ceil((coolUntil - now) / 1000) })
      const retry = await deps.limiter.hit([[`verify-resend:hour:${user.id}`, deps.config.limits.verificationResendPerAccount]])
      if (retry !== undefined) throw new AuthError('RATE_LIMITED', { retryAfterSeconds: retry })
      const coolMs = deps.config.limits.verificationResendCooldown.windowSeconds * 1000
      await deps.counters.set(coolKey, now + coolMs, coolMs)
      sendMail(deps, { kind: 'verify-email', to: user.email, userId: user.id, url: verificationUrl(deps, user) })
      return { status: 'sent' }
    },

    async verify(req, parts) {
      requireFeature(deps, 'emailVerification')
      const link = parseVerificationLink(parts)
      if (!link) throw new AuthError('INVALID_TOKEN')
      if (!safeEqual(link.signature, sign(deps, link.id, link.hash, link.expires))) throw new AuthError('INVALID_TOKEN')
      if (link.expires * 1000 <= deps.clock.now()) throw new AuthError('INVALID_TOKEN')
      const user = await deps.store.findUserById(link.id)
      if (!user || !safeEqual(link.hash, emailHash(deps, user.email))) throw new AuthError('INVALID_TOKEN')
      if (user.emailVerifiedAt !== null) return
      await deps.store.updateUser(user.id, { emailVerifiedAt: deps.clock.now() })
      await emit(deps, req, { type: 'email.verified', userId: user.id })
    },

    assertVerified(user) {
      if (deps.config.features.emailVerification && user.emailVerifiedAt === null) throw new AuthError('EMAIL_NOT_VERIFIED')
    },
  }
}
