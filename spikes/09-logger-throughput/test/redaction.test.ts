/**
 * Q8: no generated secret ever reaches the written output; log injection is impossible
 * (one call = one line); and each pattern rule matters (tripwires: disabling a rule must let the
 * property test find a leak).
 */
import fc from 'fast-check'
import { describe, expect, test } from 'vitest'
import { createLogger } from '../src/logger.ts'
import { type PatternRule, createSanitizer, DEFAULT_SANITIZE, luhnValid, redactString } from '../src/redact.ts'
import { serializeRecord } from '../src/serialize.ts'
import { memoryTransport } from './helpers.ts'

const RUNS = Number(process.env.PROPERTY_RUNS ?? 300)
const b64url = fc.stringMatching(/^[A-Za-z0-9_-]{10,40}$/)
const safe = fc.stringMatching(/^[A-Za-z0-9]{12,32}$/)

/** Luhn-valid card numbers of 13–19 digits, optionally grouped with spaces or dashes. */
const pan = fc
  .tuple(fc.integer({ min: 13, max: 19 }), fc.array(fc.integer({ min: 0, max: 9 }), { minLength: 19, maxLength: 19 }), fc.constantFrom('', ' ', '-'))
  .map(([len, digits, sep]) => {
    const body = digits.slice(0, len - 1)
    body[0] = (body[0] ?? 0) === 0 ? 4 : (body[0] ?? 4) // no leading zero
    for (let check = 0; check <= 9; check++) {
      const cand = [...body, check].join('')
      if (luhnValid(cand)) return sep ? (cand.match(/.{1,4}/g) ?? [cand]).join(sep) : cand
    }
    return body.join('')
  })

/** Secrets in the forms they appear in real logs, with the exact text that must never leak. */
const secret: fc.Arbitrary<{ text: string; mustNotContain: string; kind: PatternRule }> = fc.oneof(
  fc.tuple(b64url, b64url, b64url).map(([a, b, c]) => {
    const jwt = `eyJ${a}.eyJ${b}.${c}`
    return { text: jwt, mustNotContain: `${b}.${c}`, kind: 'jwt' as const }
  }),
  safe.map((t) => ({ text: `Bearer ${t}`, mustNotContain: t, kind: 'bearer' as const })),
  fc.tuple(fc.constantFrom('postgres', 'mysql', 'redis', 'mongodb+srv', 'amqps'), safe, safe).map(([scheme, user, pass]) => ({
    text: `${scheme}://${user}:${pass}@db.internal:5432/app`,
    mustNotContain: pass,
    kind: 'urlCredentials' as const,
  })),
  safe.map((body) => ({ text: `-----BEGIN RSA PRIVATE KEY-----\nMIIE${body}\n-----END RSA PRIVATE KEY-----`, mustNotContain: `MIIE${body}`, kind: 'privateKey' as const })),
  pan.map((p) => ({ text: p, mustNotContain: p, kind: 'pan' as const })),
)

/** Surround text with arbitrary context (never digits glued to card numbers: those aren't PANs). */
const context = fc.string({ maxLength: 20 }).map((s) => s.replace(/[0-9]/g, ''))

/** Put a value somewhere in a random nested structure. */
function nest(value: unknown, path: Array<string | number>): unknown {
  return path.reduceRight<unknown>((acc, key) => (typeof key === 'number' ? [acc] : { [key]: acc }), value)
}
const path = fc.array(fc.oneof(fc.constantFrom('meta', 'request', 'data', 'items', 'x'), fc.constant(0)), { maxLength: 6 })
const sensitiveKey = fc.constantFrom('password', 'Password', 'db_password', 'apiToken', 'x-api-key', 'Authorization', 'set-cookie', 'clientSecret', 'refresh_token', 'privateKey')

function leaks(output: string, mustNotContain: string): boolean {
  return output.includes(mustNotContain) || output.includes(JSON.stringify(mustNotContain).slice(1, -1))
}

function writeOnce(fields: Record<string, unknown>, msg: string, disable?: ReadonlySet<PatternRule>): string {
  const sanitize = createSanitizer(disable ? { ...DEFAULT_SANITIZE, disable } : DEFAULT_SANITIZE)
  return serializeRecord(sanitize({ time: 0, level: 'info', msg, ...fields }) as Record<string, unknown>, 1 << 20)
}

describe('redaction property', () => {
  test('a secret embedded in any string, at any depth, never reaches the output', () => {
    fc.assert(
      fc.property(secret, context, context, path, ({ text, mustNotContain }, before, after, p) => {
        const embedded = `${before} ${text} ${after}`
        const out = writeOnce({ payload: nest(embedded, p) }, `msg ${embedded}`)
        return !leaks(out, mustNotContain)
      }),
      { numRuns: RUNS },
    )
  })

  test('any value under a sensitive key, at any depth, is redacted (whatever it looks like)', () => {
    fc.assert(
      fc.property(sensitiveKey, fc.oneof(safe, fc.integer().map(String)), path, (key, value, p) => {
        const marker = `S3CR3T_${value}`
        const out = writeOnce({ payload: nest({ [key]: marker }, p) }, 'login attempt')
        return !out.includes(marker)
      }),
      { numRuns: RUNS },
    )
  })

  test('the real logger pipeline (not just the sanitizer) never writes a secret', async () => {
    const mem = memoryTransport()
    const log = createLogger({ transport: mem })
    const samples = fc.sample(secret, 200)
    for (const s of samples) log.info(`user sent ${s.text}`, { header: s.text, nested: { deeper: [s.text] } })
    await log.flush()
    // Check each line only against ITS OWN secret: fast-check biases towards repetitive strings, so
    // one sample's password can legitimately appear inside another sample's (kept) user name.
    const lines = mem.text().trim().split('\n')
    expect(lines).toHaveLength(samples.length)
    samples.forEach((s, i) => expect(leaks(lines[i] ?? '', s.mustNotContain), `${s.kind} leaked: ${lines[i]}`).toBe(false))
  })
})

describe('tripwires: each pattern rule is necessary', () => {
  test.each(['jwt', 'bearer', 'urlCredentials', 'privateKey', 'pan'] as PatternRule[])('disabling the %s rule lets the property find a leak', (rule) => {
    const onlyThisKind = secret.filter((s) => s.kind === rule)
    const result = fc.check(
      fc.property(onlyThisKind, context, ({ text, mustNotContain }, before) => !leaks(writeOnce({ v: `${before} ${text}` }, 'm', new Set([rule])), mustNotContain)),
      { numRuns: 200 },
    )
    expect(result.failed).toBe(true) // the weakened redactor IS caught
  })
})

describe('false positives (documented trade-off)', () => {
  test('ordinary numbers and ids are left alone', () => {
    expect(redactString('order 12345 shipped, invoice INV-2026-0042, phone +44 20 7946 0958')).toBe('order 12345 shipped, invoice INV-2026-0042, phone +44 20 7946 0958')
    expect(redactString('trace 4bf92f3577b34da6a3ce929d0e0e4736')).toBe('trace 4bf92f3577b34da6a3ce929d0e0e4736')
  })
  test('a 13–19 digit Luhn-valid numeric id IS redacted (fail-safe; numbers in number fields are not scanned)', () => {
    expect(redactString('id 4111111111111111')).toBe('id [REDACTED:pan]')
    expect(writeOnce({ time2: 4111111111111111 }, 'x')).toContain('4111111111111111') // numeric fields untouched
  })
})

describe('log injection: one call = one line', () => {
  test('CR, LF, U+2028/2029, ANSI escapes and control characters cannot create or colour lines', () => {
    fc.assert(
      fc.property(fc.string({ unit: 'binary', maxLength: 200 }), (s) => {
        const msg = `a${s}\n{"level":"fatal","msg":"forged"}\r\n\u001b[31mred\u001b[0m  \u0000`
        const line = serializeRecord({ time: 0, level: 'info', msg }, 1 << 20)
        const body = line.slice(0, -1)
        return (
          line.endsWith('\n') &&
          !body.includes('\n') &&
          !body.includes('\r') &&
          !body.includes('\u001b') &&
          !body.includes(' ') &&
          !body.includes(' ') &&
          (JSON.parse(line) as { msg: string }).msg === msg // exact round trip, nothing lost
        )
      }),
      { numRuns: RUNS },
    )
  })
})

describe('redaction cost', () => {
  test('measures sanitize+serialize cost per medium record (printed, not asserted)', () => {
    const sanitize = createSanitizer(DEFAULT_SANITIZE)
    const noRedact = createSanitizer({ ...DEFAULT_SANITIZE, redact: false })
    const rec = { time: 0, level: 'info', msg: 'request handled', headers: { authorization: 'Bearer abcdefghijklmnop', ua: 'Mozilla/5.0 '.repeat(5) }, body: { password: 'x', items: Array.from({ length: 8 }, (_, i) => ({ sku: `SKU-${i}`, qty: i })) } }
    const time = (fn: () => void, n = 20_000): number => {
      const t = performance.now()
      for (let i = 0; i < n; i++) fn()
      return ((performance.now() - t) * 1000) / n
    }
    time(() => serializeRecord(sanitize(rec) as Record<string, unknown>, 1 << 20), 2_000) // warm-up
    const plain = time(() => JSON.stringify(rec))
    const safeOnly = time(() => serializeRecord(noRedact(rec) as Record<string, unknown>, 1 << 20))
    const full = time(() => serializeRecord(sanitize(rec) as Record<string, unknown>, 1 << 20))
    console.log(`[redaction-cost] per medium record: JSON.stringify ${plain.toFixed(2)} µs · safe walk ${safeOnly.toFixed(2)} µs · safe walk + redaction ${full.toFixed(2)} µs`)
    expect(full).toBeGreaterThan(0)
  })
})
