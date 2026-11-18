/**
 * Validation patterns for text questions, without ReDoS.
 *
 * A package may say "the answer must look like `^[a-z][a-z0-9-]{2,30}$`". A pattern written by a
 * third party and run on every keystroke is a denial-of-service risk: `^(a+)+$` takes longer
 * than the age of the universe on 40 characters in a backtracking engine such as V8's.
 *
 * Two layers make that impossible here:
 *
 * 1. **A restricted subset** ({@link parsePattern}). A pattern is `^`, then a sequence of single
 *    character atoms (a literal, an escape such as `\d`, a class such as `[a-z0-9_]`, or `.`),
 *    each optionally repeated (`?`, `*`, `+`, `{n}`, `{n,}`, `{n,m}` with n, m ≤ 100), then `$`.
 *    There are **no groups, alternatives, back-references or look-arounds**, so no quantifier
 *    can nest inside another: the cause of every exponential blow-up.
 * 2. **A linear-time matcher** ({@link matchesPattern}). Even without nesting, a backtracking
 *    engine can be polynomially slow (`^a*a*a*a*b$`). The matcher simulates all positions at
 *    once (Thompson's construction), so it costs at most `answer length × pattern states`,
 *    whatever the pattern. Consumers (installer, `node strut add`, docs site) must use it and
 *    never `new RegExp(pattern)` on a package's pattern.
 *
 * The subset still compiles as an ordinary JavaScript `u`-mode regular expression with the same
 * meaning; the property tests check both agree on random patterns and inputs.
 *
 * @module
 */

/** Hard limits. They keep the matcher's worst case small: 200 characters × 1,000 states. */
export const PATTERN_LIMITS = {
  /** Longest pattern source. */
  maxSource: 200,
  /** Most atoms (characters, classes, escapes) in one pattern. */
  maxAtoms: 40,
  /** Largest `{n}` / `{n,m}` bound. */
  maxRepeat: 100,
  /** Most matcher states after expanding `{n,m}`. */
  maxStates: 1_000,
} as const

/** One atom of the subset with its repetition. `max` is `Infinity` for `*`, `+` and `{n,}`. */
export interface PatternAtom {
  /** The atom's source, e.g. `[a-z]`, `\d`, `.` or `x`. */
  readonly source: string
  readonly min: number
  readonly max: number
}

/** A parsed, safe pattern. Only {@link parsePattern} creates one. */
export interface SafePattern {
  readonly source: string
  readonly atoms: readonly PatternAtom[]
  /** @internal one single-character test per atom. */
  readonly tests: readonly ((char: string) => boolean)[]
}

/** The result of {@link parsePattern}: a pattern, or the friendly reason it is refused. */
export type PatternResult = { readonly ok: true; readonly pattern: SafePattern } | { readonly ok: false; readonly reason: string }

/** Characters with a meaning outside a class; written literally they must be escaped. */
const SYNTAX = '^$\\.*+?()[]{}|/'
/** Escapes allowed outside a class: the classes `\d \w \s` (and negations) plus escaped syntax. */
const CLASS_ESCAPES = 'dDwWsS'

const refuse = (reason: string): PatternResult => ({ ok: false, reason })

/**
 * Parse a pattern in the safe subset, or explain in plain words why it is refused.
 *
 * @example
 * parsePattern('^[a-z][a-z0-9-]{2,30}$').ok // true
 * parsePattern('^(a+)+$')                   // { ok: false, reason: 'uses a group "(" …' }
 */
export function parsePattern(source: string): PatternResult {
  if (source.length > PATTERN_LIMITS.maxSource) return refuse(`is longer than ${PATTERN_LIMITS.maxSource} characters`)
  if (!source.startsWith('^') || !source.endsWith('$') || source.endsWith('\\$') || source.length < 2) {
    return refuse('must start with ^ and end with $, so it checks the whole answer')
  }
  const chars = [...source.slice(1, -1)]
  const atoms: PatternAtom[] = []
  let index = 0
  while (index < chars.length) {
    const char = chars[index] ?? ''
    let atom: string
    if (char === '(' || char === ')' || char === '|') {
      return refuse(`uses a group or alternative "${char}"; only single characters and [classes] may repeat (this is what rules out ReDoS)`)
    }
    if (char === '^' || char === '$') return refuse(`uses "${char}" in the middle; it may only start or end the pattern`)
    if ('*+?{}'.includes(char)) return refuse(`has "${char}" with nothing to repeat`)
    if (char === ']') return refuse('has a "]" without a matching "["; write \\] for a literal bracket')
    if (/\p{Cc}/u.test(char)) return refuse('contains a control character')
    if (char === '\\') {
      const next = chars[index + 1]
      if (next === undefined) return refuse('ends with a lone backslash')
      if (!CLASS_ESCAPES.includes(next) && !SYNTAX.includes(next)) {
        return refuse(`uses the escape "\\${next}"; only \\d \\w \\s (and \\D \\W \\S) or an escaped symbol such as \\. are allowed`)
      }
      atom = `\\${next}`
      index += 2
    } else if (char === '[') {
      const parsed = parseClass(chars, index)
      if (typeof parsed === 'string') return refuse(parsed)
      atom = parsed.source
      index = parsed.end
    } else {
      atom = char
      index += 1
    }
    const quantifier = parseQuantifier(chars, index)
    if (typeof quantifier === 'string') return refuse(quantifier)
    index = quantifier.end
    atoms.push({ source: atom, min: quantifier.min, max: quantifier.max })
    if (atoms.length > PATTERN_LIMITS.maxAtoms) return refuse(`has more than ${PATTERN_LIMITS.maxAtoms} parts`)
  }
  const states = atoms.reduce((sum, atom) => sum + (atom.max === Infinity ? atom.min + 1 : atom.max), 0)
  if (states > PATTERN_LIMITS.maxStates) return refuse(`repeats too much (more than ${PATTERN_LIMITS.maxStates} characters of pattern in total)`)
  try {
    // Compiled once, never run: the subset must also be a valid `u`-mode RegExp with the same
    // meaning, so tools that only read it (JSON Schema editors, docs) see a real pattern.
    new RegExp(source, 'u')
  } catch {
    return refuse('is not a valid regular expression')
  }
  const tests = atoms.map((atom) => {
    // One atom, no quantifier: matching a single character cannot backtrack.
    const single = new RegExp(`^${atom.source}$`, 'u')
    return (char: string): boolean => single.test(char)
  })
  return { ok: true, pattern: { source, atoms, tests } }
}

/** A `[...]` class starting at `start`; returns its source and the index after `]`. */
function parseClass(chars: readonly string[], start: number): { readonly source: string; readonly end: number } | string {
  let index = start + 1
  let source = '['
  if (chars[index] === '^') {
    source += '^'
    index += 1
  }
  let items = 0
  let previousLiteral: string | undefined
  while (index < chars.length && chars[index] !== ']') {
    const char = chars[index] ?? ''
    if (char === '[') return 'has "[" inside a class; write \\[ for a literal bracket'
    if (/\p{Cc}/u.test(char)) return 'contains a control character'
    if (char === '\\') {
      const next = chars[index + 1]
      if (next === undefined) return 'ends with a lone backslash'
      if (!CLASS_ESCAPES.includes(next) && !SYNTAX.includes(next) && next !== '-') {
        return `uses the escape "\\${next}" in a class; only \\d \\w \\s (and negations) or escaped symbols are allowed`
      }
      source += `\\${next}`
      previousLiteral = CLASS_ESCAPES.includes(next) ? undefined : next
      index += 2
    } else if (char === '-' && previousLiteral !== undefined && chars[index + 1] !== undefined && chars[index + 1] !== ']') {
      // A range such as a-z: both ends must be literal characters, low to high.
      let high = chars[index + 1] ?? ''
      let width = 2
      if (high === '\\') {
        const escaped = chars[index + 2]
        if (escaped === undefined || !(SYNTAX.includes(escaped) || escaped === '-')) return 'has a range ending in an unsupported escape'
        high = escaped
        width = 3
      } else if (high === '[') {
        return 'has "[" inside a class; write \\[ for a literal bracket'
      }
      if ((previousLiteral.codePointAt(0) ?? 0) > (high.codePointAt(0) ?? 0)) return `has a backwards range "${previousLiteral}-${high}"`
      source += `-${width === 3 ? '\\' : ''}${high}`
      previousLiteral = undefined
      index += width
    } else {
      // "-" first or last is a literal; escape it so the `u`-mode RegExp agrees.
      source += char === '-' ? '\\-' : char
      previousLiteral = char
      index += 1
    }
    items += 1
  }
  if (index >= chars.length) return 'has a "[" without a matching "]"'
  if (items === 0) return 'has an empty class "[]"'
  return { source: `${source}]`, end: index + 1 }
}

/** The repetition after an atom (`1..1` when there is none). */
function parseQuantifier(chars: readonly string[], start: number): { readonly min: number; readonly max: number; readonly end: number } | string {
  const char = chars[start]
  let result: { min: number; max: number; end: number }
  if (char === '?') result = { min: 0, max: 1, end: start + 1 }
  else if (char === '*') result = { min: 0, max: Infinity, end: start + 1 }
  else if (char === '+') result = { min: 1, max: Infinity, end: start + 1 }
  else if (char === '{') {
    const close = chars.indexOf('}', start)
    if (close === -1) return 'has a "{" without a matching "}"; write \\{ for a literal brace'
    const body = chars.slice(start + 1, close).join('')
    const match = /^(\d{1,4})(,(\d{1,4})?)?$/.exec(body)
    if (match === null) return `has a repetition "{${body}}" that is not {n}, {n,} or {n,m}`
    const min = Number(match[1])
    const max = match[2] === undefined ? min : match[3] === undefined ? Infinity : Number(match[3])
    if (min > PATTERN_LIMITS.maxRepeat || (max !== Infinity && max > PATTERN_LIMITS.maxRepeat)) {
      return `repeats more than ${PATTERN_LIMITS.maxRepeat} times`
    }
    if (min > max) return `has a backwards repetition "{${body}}"`
    result = { min, max, end: close + 1 }
  } else return { min: 1, max: 1, end: start }
  const after = chars[result.end]
  if (after !== undefined && '?*+{'.includes(after)) {
    return 'repeats a repetition (lazy or nested quantifiers such as *? or ++ are not allowed)'
  }
  return result
}

/**
 * Does `text` match the whole pattern? Runs in `O(text length × states)`: no backtracking, no
 * catastrophic cases.
 *
 * How: atoms are expanded into a chain of states (`x{2,4}` becomes x, x, x?, x?; `x*` one looping
 * state), and the matcher tracks the set of every state reachable after each character.
 *
 * @example
 * const parsed = parsePattern('^[a-z]{2,4}$')
 * if (parsed.ok) matchesPattern(parsed.pattern, 'abc') // true
 */
export function matchesPattern(pattern: SafePattern, text: string): boolean {
  // Expanded chain: each unit is "exactly one", "optional one" or "any number" of an atom.
  const units: { readonly test: (char: string) => boolean; readonly kind: 'one' | 'optional' | 'loop' }[] = []
  pattern.atoms.forEach((atom, atomIndex) => {
    const test = pattern.tests[atomIndex] ?? (() => false)
    for (let count = 0; count < atom.min; count += 1) units.push({ test, kind: 'one' })
    if (atom.max === Infinity) units.push({ test, kind: 'loop' })
    else for (let count = atom.min; count < atom.max; count += 1) units.push({ test, kind: 'optional' })
  })
  const end = units.length
  /** Add `state` and every state reachable from it without reading a character. */
  const close = (active: boolean[], state: number): void => {
    let current = state
    while (current <= end && active[current] !== true) {
      active[current] = true
      const unit = units[current]
      if (unit === undefined || unit.kind === 'one') return
      current += 1
    }
  }
  let active: boolean[] = []
  close(active, 0)
  for (const char of text) {
    const next: boolean[] = []
    for (let state = 0; state < end; state += 1) {
      const unit = units[state]
      if (active[state] !== true || unit === undefined || !unit.test(char)) continue
      if (unit.kind === 'loop') close(next, state)
      else close(next, state + 1)
    }
    active = next
    if (!active.some(Boolean)) return false
  }
  return active[end] === true
}
