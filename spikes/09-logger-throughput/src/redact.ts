/**
 * Sanitizer: turns ANY value into a JSON-safe, size-bounded, redacted copy. Never throws.
 *
 * Two jobs in one walk (one pass is cheaper than two):
 *   1. Safety: circular refs, BigInt, Errors (with cause chains), Maps/Sets, binary, functions,
 *      throwing getters / Proxies, huge objects/strings/arrays, very deep nesting.
 *   2. Redaction BEFORE storage (RFC-0004 §6):
 *      - by KEY: any key whose normalised name contains a sensitive word (password, token, …) at
 *        any depth → '[REDACTED]' (fail-safe: `tokenCount` is redacted too; false positives are
 *        preferred over leaks);
 *      - by PATTERN inside every string (including messages): JWTs, Bearer/Basic credentials,
 *        URL credentials (postgres://user:pass@…), PEM private keys, Luhn-valid card numbers.
 */

export interface SanitizeOptions {
  /** Redact by key and by pattern. `false` keeps only the safety transformations. */
  readonly redact: boolean
  /** Extra sensitive key fragments (normalised: lowercase, no `-`/`_`). */
  readonly extraKeys?: readonly string[]
  /** Disable individual pattern rules (used by the tripwire tests to prove each rule matters). */
  readonly disable?: ReadonlySet<PatternRule>
  readonly maxDepth: number
  readonly maxStringLength: number
  readonly maxArrayLength: number
  readonly maxObjectKeys: number
  readonly maxCauseDepth: number
}

export type PatternRule = 'jwt' | 'bearer' | 'urlCredentials' | 'privateKey' | 'pan'

export const DEFAULT_SANITIZE: SanitizeOptions = {
  redact: true,
  maxDepth: 8,
  maxStringLength: 8_192,
  maxArrayLength: 200,
  maxObjectKeys: 200,
  maxCauseDepth: 5,
}

export const REDACTED = '[REDACTED]'

/** Key fragments that mark a value as secret. Matched against the normalised key name. */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
  'privatekey',
  'credential',
  'sessionid',
]

/** Normalise a key for matching: lowercase, strip `-` and `_` (so api_key, api-key, apiKey match). */
export function normaliseKey(key: string): string {
  return key.toLowerCase().replace(/[-_]/g, '')
}

const PATTERNS: ReadonlyArray<{ rule: PatternRule; re: RegExp; replace: string | ((m: string) => string) }> = [
  // PEM private keys, complete or truncated at the end of the string.
  {
    rule: 'privateKey',
    re: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g,
    replace: '[REDACTED:private-key]',
  },
  // JSON Web Tokens: three base64url segments starting with the encoded '{"' header.
  {
    rule: 'jwt',
    re: /eyJ[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]{2,}\.[A-Za-z0-9_-]*/g,
    replace: '[REDACTED:jwt]',
  },
  // HTTP credentials in free text: "Bearer abc…", "Basic dXNlcjpwYXNz".
  {
    rule: 'bearer',
    re: /\b(Bearer|Basic|Token)\s+[A-Za-z0-9._~+/=-]{8,}/gi,
    replace: (m) => `${m.split(/\s+/)[0]} [REDACTED]`,
  },
  // Credentials inside URLs: scheme://user:password@host → scheme://user:[REDACTED]@host
  {
    rule: 'urlCredentials',
    re: /([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi,
    replace: (m) => m.replace(/:([^:@]+)@$/, `:${REDACTED}@`),
  },
  // Card numbers: 13–19 digits (optional single spaces/dashes), not glued to other digits, Luhn-valid.
  {
    rule: 'pan',
    re: /(?<!\d)\d(?:[ -]?\d){12,18}(?!\d)/g,
    replace: (m) => (luhnValid(m.replace(/[ -]/g, '')) ? '[REDACTED:pan]' : m),
  },
]

/** Luhn checksum (card numbers). */
export function luhnValid(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

/** Cheap pre-check: strings that cannot contain any pattern skip the regexes entirely. */
function mightContainSecret(s: string): boolean {
  if (s.length < 13) return s.includes('eyJ') || s.includes('://')
  return true
}

/** Redact secret patterns inside a string. */
export function redactString(s: string, disable?: ReadonlySet<PatternRule>): string {
  if (!mightContainSecret(s)) return s
  let out = s
  for (const p of PATTERNS) {
    if (disable?.has(p.rule)) continue
    p.re.lastIndex = 0
    if (!p.re.test(out)) continue
    p.re.lastIndex = 0
    out = typeof p.replace === 'string' ? out.replace(p.re, p.replace) : out.replace(p.re, p.replace)
  }
  return out
}

/** Create a sanitizer function bound to `options`. */
export function createSanitizer(options: SanitizeOptions = DEFAULT_SANITIZE): (value: unknown) => unknown {
  const fragments = [...SENSITIVE_KEY_FRAGMENTS, ...(options.extraKeys ?? [])]
  const keyCache = new Map<string, boolean>()
  const isSensitiveKey = (key: string): boolean => {
    let hit = keyCache.get(key)
    if (hit === undefined) {
      const n = normaliseKey(key)
      hit = fragments.some((f) => n.includes(f))
      if (keyCache.size < 10_000) keyCache.set(key, hit)
    }
    return hit
  }

  const str = (s: string): string => {
    const cut =
      s.length > options.maxStringLength
        ? `${s.slice(0, options.maxStringLength)}…[truncated ${s.length - options.maxStringLength} chars]`
        : s
    return options.redact ? redactString(cut, options.disable) : cut
  }

  const walk = (value: unknown, depth: number, seen: WeakSet<object>): unknown => {
    switch (typeof value) {
      case 'string':
        return str(value)
      case 'number':
        return Number.isFinite(value) ? value : String(value)
      case 'boolean':
        return value
      case 'bigint':
        return value.toString()
      case 'undefined':
        return undefined
      case 'symbol':
        return value.toString()
      case 'function':
        return `[Function ${value.name || 'anonymous'}]`
      default:
        break
    }
    if (value === null) return null
    const obj = value as object
    if (seen.has(obj)) return '[Circular]'
    if (depth >= options.maxDepth) return '[MaxDepth]'
    seen.add(obj)
    try {
      if (obj instanceof Error) return serialiseError(obj, depth, seen, 0)
      if (obj instanceof Date) return Number.isNaN(obj.getTime()) ? 'Invalid Date' : obj.toISOString()
      if (ArrayBuffer.isView(obj) || obj instanceof ArrayBuffer) return `[Binary ${(obj as ArrayBuffer).byteLength} bytes]`
      if (obj instanceof Map) return walk(Object.fromEntries([...obj.entries()].slice(0, options.maxObjectKeys).map(([k, v]) => [String(k), v])), depth, seen)
      if (obj instanceof Set) return walk([...obj].slice(0, options.maxArrayLength), depth, seen)
      if (Array.isArray(obj)) {
        const len = Math.min(obj.length, options.maxArrayLength)
        const out: unknown[] = new Array(len)
        for (let i = 0; i < len; i++) {
          let item: unknown
          try {
            item = obj[i]
          } catch {
            item = '[Unreadable]'
          }
          const v = walk(item, depth + 1, seen)
          out[i] = v === undefined ? null : v
        }
        if (obj.length > len) out.push(`[…${obj.length - len} more items]`)
        return out
      }
      const toJSON = (obj as { toJSON?: unknown }).toJSON
      if (typeof toJSON === 'function') {
        try {
          return walk(toJSON.call(obj), depth + 1, seen)
        } catch {
          return '[toJSON threw]'
        }
      }
      let keys: string[]
      try {
        keys = Object.keys(obj)
      } catch {
        return '[Unreadable object]'
      }
      const out: Record<string, unknown> = {}
      const limit = Math.min(keys.length, options.maxObjectKeys)
      for (let i = 0; i < limit; i++) {
        const key = keys[i] as string
        if (options.redact && isSensitiveKey(key)) {
          out[key] = REDACTED
          continue
        }
        let v: unknown
        try {
          v = (obj as Record<string, unknown>)[key]
        } catch {
          v = '[Unreadable]'
        }
        const w = walk(v, depth + 1, seen)
        if (w !== undefined) out[key] = w
      }
      if (keys.length > limit) out._truncatedKeys = keys.length - limit
      return out
    } catch {
      return '[Unserialisable]'
    } finally {
      seen.delete(obj)
    }
  }

  const serialiseError = (err: Error, depth: number, seen: WeakSet<object>, causeDepth: number): unknown => {
    const out: Record<string, unknown> = {}
    try {
      out.type = err.name
      out.message = str(String(err.message))
      if (typeof err.stack === 'string') out.stack = str(err.stack)
      const code = (err as { code?: unknown }).code
      if (code !== undefined) out.code = walk(code, depth + 1, seen)
      const cause = (err as { cause?: unknown }).cause
      if (cause !== undefined) {
        if (causeDepth >= options.maxCauseDepth) out.cause = '[MaxCauseDepth]'
        else if (cause instanceof Error) {
          if (seen.has(cause)) out.cause = '[Circular]'
          else {
            seen.add(cause)
            try {
              out.cause = serialiseError(cause, depth + 1, seen, causeDepth + 1)
            } finally {
              seen.delete(cause)
            }
          }
        } else out.cause = walk(cause, depth + 1, seen)
      }
      if (err instanceof AggregateError) out.errors = walk(err.errors, depth + 1, seen)
      for (const key of Object.keys(err)) {
        if (key in out || key === 'cause') continue
        let v: unknown
        try {
          v = (err as unknown as Record<string, unknown>)[key]
        } catch {
          v = '[Unreadable]'
        }
        out[key] = options.redact && isSensitiveKey(key) ? REDACTED : walk(v, depth + 1, seen)
      }
    } catch {
      out.type = out.type ?? 'Error'
      out.message = out.message ?? '[unreadable error]'
    }
    return out
  }

  return (value: unknown) => {
    try {
      return walk(value, 0, new WeakSet())
    } catch {
      return '[Unserialisable]'
    }
  }
}
