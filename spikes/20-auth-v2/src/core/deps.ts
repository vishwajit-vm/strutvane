/**
 * The dependency bundle every service receives, plus the small helpers they share (emitting
 * events, background mail delivery, feature gates).
 *
 * @module
 */
import type { AuthConfig, AuthFeatures } from '../config.ts'
import type { KeyRing } from '../crypto/keys.ts'
import { featureDisabled } from '../errors.ts'
import { normalizeIp } from '../limits/ip.ts'
import type { Limiter } from '../limits/limiter.ts'
import type { Lockout } from '../limits/lockout.ts'
import type { PasswordHasher } from '../password/hasher.ts'
import type { PasswordCheck } from '../password/rules.ts'
import type { Clock } from '../ports/clock.ts'
import type { AuthRequest } from '../ports/cookies.ts'
import type { CounterStore } from '../ports/counter-store.ts'
import type { AuthEvent, AuthEventSink, AuthLogger } from '../ports/events.ts'
import type { AuthMail, AuthMailer } from '../ports/mailer.ts'
import type { AuthStore } from '../ports/store.ts'

/** Work started after the response (mail delivery), tracked so tests and shutdown can await it. */
export interface Background {
  run(label: string, task: () => Promise<void>): void
  /** Resolves when every task started so far has settled. */
  idle(): Promise<void>
}

/** Create a {@link Background} that reports failures to the logger (ids only). */
export function createBackground(logger: AuthLogger | undefined): Background {
  const pending = new Set<Promise<void>>()
  return {
    run(label, task) {
      // Start on a later tick: the caller's response time must not include the task (enumeration).
      const p: Promise<void> = new Promise<void>((resolve) => setImmediate(resolve))
        .then(task)
        .catch(() => {
          try {
            logger?.warn('auth: background task failed', { task: label })
          } catch {
            // A broken logger must not break auth.
          }
        })
        .finally(() => pending.delete(p))
      pending.add(p)
    },
    async idle() {
      while (pending.size > 0) await Promise.allSettled([...pending])
    },
  }
}

/** Everything a service needs. Built once by `createAuth`. */
export interface AuthDeps {
  readonly config: AuthConfig
  readonly store: AuthStore
  readonly counters: CounterStore
  readonly keys: KeyRing
  readonly clock: Clock
  readonly mailer: AuthMailer
  readonly events: AuthEventSink
  readonly logger: AuthLogger | undefined
  readonly hasher: PasswordHasher
  readonly passwordCheck: PasswordCheck | undefined
  readonly passwordCheckOnUnknown: 'open' | 'closed'
  readonly limiter: Limiter
  readonly lockout: Lockout
  readonly background: Background
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/** An event without the fields {@link emit} fills in. */
export type EventInput = DistributiveOmit<AuthEvent, 'at' | 'ip'>

/** Emit an audit event, stamped with the time and client address. Never throws. */
export async function emit(deps: AuthDeps, req: AuthRequest | undefined, event: EventInput): Promise<void> {
  const full = { ...event, at: deps.clock.now(), ip: normalizeIp(req?.ip) ?? null } as AuthEvent
  try {
    await deps.events.emit(full)
  } catch {
    try {
      deps.logger?.warn('auth: the event sink failed', { event: full.type })
    } catch {
      // Nothing left to tell.
    }
  }
}

/** Send a mail in the background so the response time never depends on it. */
export function sendMail(deps: AuthDeps, mail: AuthMail): void {
  deps.background.run(`mail:${mail.kind}`, () => deps.mailer.send(mail))
}

/** Throw the disabled-feature error (a plain 404) unless `feature` is on. */
export function requireFeature(deps: AuthDeps, feature: keyof AuthFeatures): void {
  if (!deps.config.features[feature]) throw featureDisabled()
}

/** The account key for limits and lockouts: a keyed digest, so counters never hold an email. */
export function accountKey(deps: AuthDeps, normalizedEmail: string): string {
  return deps.keys.digest('email-digest', normalizedEmail).slice(0, 32)
}

/** A cookie name, `__Host-` prefixed on https so a sibling subdomain cannot set or shadow it. */
export function cookieName(deps: AuthDeps, base: string): string {
  return deps.config.secureCookies ? `__Host-${base}` : base
}
