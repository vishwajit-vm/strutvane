import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { matchesPattern, parsePattern, PATTERN_LIMITS, type SafePattern } from '../src/manifest/safe-pattern.ts'

const safe = (source: string): SafePattern => {
  const parsed = parsePattern(source)
  if (!parsed.ok) throw new Error(`refused ${source}: ${parsed.reason}`)
  return parsed.pattern
}

describe('parsePattern: the safe subset', () => {
  it.each([
    '^[a-z][a-z0-9-]{2,30}$',
    '^\\d{3}-\\d{4}$',
    '^[A-Z][A-Z0-9-]{0,11}$',
    '^[^,]+$',
    '^\\w+@\\w+\\.\\w{2,}$',
    '^.?$',
    '^[a-z-]$',
    '^\\$\\d+$',
  ])('accepts %s', (source) => {
    expect(parsePattern(source).ok).toBe(true)
  })

  it.each([
    ['^(a+)+$', 'group'],
    ['^(a|aa)*$', 'group'],
    ['^(.*a){12}$', 'group'],
    ['^a|b$', 'alternative'],
    ['^(?=a)a$', 'group'],
    ['^(a)\\1$', 'group'],
    ['^a\\1$', 'escape'],
    ['^\\bword$', 'escape'],
    ['^\\p{L}+$', 'escape'],
    ['^\\u0041$', 'escape'],
    ['abc', 'must start with ^'],
    ['^abc', 'must start with ^'],
    ['abc$', 'must start with ^'],
    ['^a^b$', 'middle'],
    ['^a*?$', 'repeats a repetition'],
    ['^a++$', 'repeats a repetition'],
    ['^a{2}{3}$', 'repeats a repetition'],
    ['^a{1000}$', 'more than 100'],
    ['^a{5,2}$', 'backwards'],
    ['^a{,5}$', 'not {n}'],
    ['^*a$', 'nothing to repeat'],
    ['^[]$', 'empty class'],
    ['^[z-a]$', 'backwards range'],
    ['^[a-z$', 'without a matching'],
    ['^a]$', 'without a matching'],
    ['^a{2$', 'without a matching'],
    ['^a\\$', 'must start with ^'],
    [`^${'a{100}'.repeat(11)}$`, 'repeats too much'],
    [`^${'a'.repeat(41)}$`, 'more than 40'],
    [`^${'a'.repeat(PATTERN_LIMITS.maxSource)}$`, 'longer than'],
  ])('refuses %s (%s)', (source, reason) => {
    const parsed = parsePattern(source)
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.reason).toContain(reason)
  })
})

describe('matchesPattern', () => {
  it('matches like a JavaScript RegExp on examples', () => {
    const pattern = safe('^[a-z][a-z0-9-]{2,30}$')
    expect(matchesPattern(pattern, 'abc')).toBe(true)
    expect(matchesPattern(pattern, 'a-b')).toBe(true)
    expect(matchesPattern(pattern, 'ab')).toBe(false)
    expect(matchesPattern(pattern, '9ab')).toBe(false)
    expect(matchesPattern(safe('^.?$'), '')).toBe(true)
    expect(matchesPattern(safe('^.$'), '😀')).toBe(true)
  })

  it('stays fast on input that makes a backtracking engine polynomially slow', () => {
    // V8 needs O(n^8) steps here for a failing 200-character answer; the matcher is linear.
    const pattern = safe('^a*a*a*a*a*a*a*a*b$')
    const started = performance.now()
    for (let i = 0; i < 20; i += 1) expect(matchesPattern(pattern, 'a'.repeat(200))).toBe(false)
    expect(performance.now() - started).toBeLessThan(1_000)
  })

  it('agrees with a u-mode RegExp on random safe patterns and inputs (property)', () => {
    const atom = fc.constantFrom('a', 'b', '.', '\\d', '\\w', '[ab]', '[^a]', '[a-c]', '-', '\\.')
    const quantifier = fc.constantFrom('', '?', '*', '+', '{2}', '{0,2}', '{1,}')
    const patternSource = fc.array(fc.tuple(atom, quantifier), { minLength: 0, maxLength: 6 }).map((parts) => `^${parts.map(([a, q]) => a + q).join('')}$`)
    const input = fc.string({ unit: fc.constantFrom('a', 'b', 'c', '1', '.', '-', ' ', 'é'), maxLength: 12 })
    fc.assert(
      fc.property(patternSource, input, (source, text) => {
        const parsed = parsePattern(source)
        expect(parsed.ok).toBe(true)
        if (parsed.ok) expect(matchesPattern(parsed.pattern, text)).toBe(new RegExp(source, 'u').test(text))
      }),
      { numRuns: 2_000 },
    )
  })

  it('never throws and never hangs on arbitrary pattern text (fuzz)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.string({ maxLength: 50 }), (body, text) => {
        const parsed = parsePattern(`^${body}$`)
        if (parsed.ok) matchesPattern(parsed.pattern, text)
      }),
      { numRuns: 3_000 },
    )
  })
})
