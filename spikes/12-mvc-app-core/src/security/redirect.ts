/**
 * The open-redirect guard. A redirect target that came from the request (`?intended=…`, a
 * `--redirect` option, a "return to" field) may only be a **same-origin path**.
 *
 * Browsers are lenient in ways that turn innocent-looking strings into other sites:
 * `//evil.com` and `/\evil.com` are protocol-relative, `/%2F%2Fevil.com` decodes to one,
 * `/.//evil.com` normalises to one, and tabs or newlines are silently removed. So the guard
 * refuses backslashes and control characters at every decoding layer, and checks the *normalised*
 * result again before trusting it.
 */

/** The longest target accepted; real paths are far shorter. */
const MAX_LENGTH = 2048
/** How many percent-decoding layers are inspected (double-encoding is the usual trick). */
const DECODE_LAYERS = 3

/**
 * The normalised same-origin path for `candidate`, or `undefined` when it could lead anywhere
 * else (or is malformed).
 *
 * @example
 * safeRedirectPath('/posts?page=2', 'https://blog.example.com') // '/posts?page=2'
 * safeRedirectPath('//evil.com', 'https://blog.example.com')    // undefined
 * safeRedirectPath('/%2F%2Fevil.com', 'https://blog.example.com') // undefined
 */
export function safeRedirectPath(candidate: string, appUrl: string): string | undefined {
  if (candidate.length === 0 || candidate.length > MAX_LENGTH) return undefined
  let layer = candidate
  for (let depth = 0; depth < DECODE_LAYERS; depth++) {
    if (!looksLikeLocalPath(layer)) return undefined
    const decoded = safeDecode(layer)
    if (decoded === undefined) return undefined
    if (decoded === layer) break
    layer = decoded
  }
  const base = new URL(appUrl)
  const url = new URL(candidate, base)
  if (url.origin !== base.origin) return undefined
  const path = `${url.pathname}${url.search}${url.hash}`
  // Normalisation can create a protocol-relative path ("/.//evil.com" → "//evil.com").
  return looksLikeLocalPath(path) ? path : undefined
}

/** A single leading slash, then no slash or backslash; no backslashes or control characters anywhere. */
function looksLikeLocalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\') && !/[\u0000-\u001f\u007f]/.test(value)
}

function safeDecode(value: string): string | undefined {
  try {
    return decodeURIComponent(value)
  } catch {
    return undefined
  }
}
