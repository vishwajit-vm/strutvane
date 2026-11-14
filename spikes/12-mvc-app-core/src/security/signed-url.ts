/**
 * Signed and temporary signed URLs, Laravel's `URL::signedRoute()` and
 * `URL::temporarySignedRoute()`, checked by the `signed` middleware.
 *
 * What is signed: the path and the query string (keys sorted, `signature` removed), with an
 * HMAC-SHA256 under the `signed-url` subkey. The host is *not* signed, so a link keeps working
 * behind a proxy or on a second domain; the trusted-host check already decides which hosts the
 * app answers for. Changing any byte of the path, any parameter or `expires` breaks the signature.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { StrutvaneError } from '../support/errors.ts'
import type { Keyring } from './keyring.ts'

/** A signature is exactly a base64url SHA-256 HMAC: 43 characters. */
const SIGNATURE = /^[A-Za-z0-9_-]{43}$/
/** Unix seconds; 12 digits reach the year 33658, so anything longer is junk. */
const EXPIRES = /^\d{1,12}$/

/**
 * The verdict on a signed URL.
 *
 * @example
 * const verdict: SignatureVerdict = 'expired'
 */
export type SignatureVerdict = 'valid' | 'invalid' | 'expired'

/**
 * Sign a URL (a path with an optional query, or an absolute URL). Pass `expiresAt` for a
 * temporary link. Refuses URLs that already carry `signature` or `expires`.
 *
 * @example
 * signUrl('/downloads/7?format=pdf', keyring, new Date(Date.now() + 60_000))
 * // '/downloads/7?format=pdf&expires=1763200000&signature=…'
 */
export function signUrl(target: string, keyring: Keyring, expiresAt?: Date): string {
  const absolute = /^[a-z][a-z0-9+.-]*:/i.test(target)
  const url = parseTarget(target)
  if (url === undefined) throw new StrutvaneError('INVALID_URL', `"${target}" is not a path or an absolute URL.`, 'Pass a path such as /downloads/7 or a full URL.')
  if (url.searchParams.has('signature') || url.searchParams.has('expires')) {
    throw new StrutvaneError('ALREADY_SIGNED', `${target} already has a "signature" or "expires" parameter.`, 'Sign the plain URL; signUrl adds both.')
  }
  if (expiresAt !== undefined) url.searchParams.set('expires', String(Math.floor(expiresAt.getTime() / 1000)))
  url.searchParams.set('signature', mac(canonical(url), keyring.subkey('signed-url')))
  return absolute ? url.href : `${url.pathname}${url.search}`
}

/**
 * Check a signed URL against the current and previous keys, then its expiry.
 *
 * @example
 * verifySignedUrl(ctx.url, keyring, new Date()) // 'valid'
 */
export function verifySignedUrl(target: string | URL, keyring: Keyring, now: Date): SignatureVerdict {
  const url = parseTarget(typeof target === 'string' ? target : target.href)
  if (url === undefined) return 'invalid'
  const signatures = url.searchParams.getAll('signature')
  const expires = url.searchParams.getAll('expires')
  const [signature] = signatures
  // Exactly one well-formed signature and at most one numeric expiry: duplicates are ambiguous.
  if (signatures.length !== 1 || signature === undefined || !SIGNATURE.test(signature) || expires.length > 1) return 'invalid'
  const [expiry] = expires
  if (expiry !== undefined && !EXPIRES.test(expiry)) return 'invalid'
  const message = canonical(url)
  const given = Buffer.from(signature)
  const matches = keyring.all.some((key) => timingSafeEqual(Buffer.from(mac(message, keyring.subkey('signed-url', key))), given))
  if (!matches) return 'invalid'
  if (expiry !== undefined && Number(expiry) * 1000 <= now.getTime()) return 'expired'
  return 'valid'
}

/**
 * Parse a path or an absolute URL without the relative-URL traps: a path is appended to a fixed
 * base instead of being *resolved* against it, so `//host/x` stays the path `//host/x` (found
 * by the fuzz test: resolving it read "host" as a host name and lost it from the signed path).
 */
function parseTarget(target: string): URL | undefined {
  const text = target.startsWith('/') ? `http://signing.invalid${target}` : target
  return URL.canParse(text) ? new URL(text) : undefined
}

/** The signed message: the path, then the query without `signature`, keys sorted (stable). */
function canonical(url: URL): string {
  const query = new URLSearchParams(url.search)
  query.delete('signature')
  query.sort()
  return `${url.pathname}?${query.toString()}`
}

function mac(message: string, key: Buffer): string {
  return createHmac('sha256', key).update(message).digest('base64url')
}
