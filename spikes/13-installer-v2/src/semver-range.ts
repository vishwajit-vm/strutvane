/**
 * A small, strict semver range check: "does framework 0.1.3 satisfy this package's `^0.1`?".
 *
 * Why not the `semver` package: the installer should stay free of runtime dependencies (security
 * review F-12), and the catalogue only needs the common range forms. Anything this parser does not
 * understand counts as "not compatible", so a strange range hides a package instead of offering
 * one that may not work (fail closed).
 *
 * Supported: `1.2.3` (exact), `^1.2`, `^0.1.3`, `~1.2`, `>=1.2.0`, `>1.2.0`, `<2.0.0`, `<=1.9.9`,
 * `*`, spaces for "and", `||` for "or". Missing minor/patch parts count as 0. Pre-release versions
 * are not supported (a release candidate never matches).
 *
 * @module
 */

/** A parsed `major.minor.patch`. */
type Version = readonly [number, number, number]

/** One comparison: `>=`, `>`, `<`, `<=` or `=` against a version. */
interface Comparator {
  readonly op: '>=' | '>' | '<' | '<=' | '='
  readonly version: Version
}

const FULL_VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})$/
const PARTIAL_VERSION = /^(0|[1-9]\d{0,8})(?:\.(0|[1-9]\d{0,8}))?(?:\.(0|[1-9]\d{0,8}))?$/

/**
 * Parse a full version such as `0.1.3`. Returns `undefined` for anything else.
 *
 * @example
 * parseVersion('0.1.3') // [0, 1, 3]
 */
export function parseVersion(text: string): Version | undefined {
  const match = FULL_VERSION.exec(text.trim())
  if (match === null) return undefined
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/** `1`, `1.2` or `1.2.3`, with the number of parts actually written. */
function parsePartial(text: string): { readonly version: Version; readonly parts: number } | undefined {
  const match = PARTIAL_VERSION.exec(text)
  if (match === null) return undefined
  const parts = match[3] !== undefined ? 3 : match[2] !== undefined ? 2 : 1
  return { version: [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)], parts }
}

function compare(a: Version, b: Version): number {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]
}

/**
 * `^` follows npm: the left-most non-zero part is fixed, so `^0.1` means `>=0.1.0 <0.2.0` and
 * `^1.2` means `>=1.2.0 <2.0.0`. Before 1.0 every minor version may break, which is exactly why
 * add-ons declare `^0.N` (blueprint §3.3).
 */
function caret(version: Version, parts: number): Comparator[] {
  const [major, minor, patch] = version
  let upper: Version
  if (major > 0 || parts === 1) upper = [major + 1, 0, 0]
  else if (minor > 0 || parts === 2) upper = [0, minor + 1, 0]
  else upper = [0, 0, patch + 1]
  return [{ op: '>=', version }, { op: '<', version: upper }]
}

/** `~1.2` means `>=1.2.0 <1.3.0`; `~1` means `>=1.0.0 <2.0.0`. */
function tilde(version: Version, parts: number): Comparator[] {
  const upper: Version = parts === 1 ? [version[0] + 1, 0, 0] : [version[0], version[1] + 1, 0]
  return [{ op: '>=', version }, { op: '<', version: upper }]
}

/** One space-separated term, or `undefined` when it is not understood. */
function parseTerm(term: string): Comparator[] | undefined {
  if (term === '*') return []
  const operator = /^(\^|~|>=|<=|>|<|=)?(.*)$/.exec(term)
  const op = operator?.[1] ?? '='
  const partial = parsePartial(operator?.[2] ?? '')
  if (partial === undefined) return undefined
  if (op === '^') return caret(partial.version, partial.parts)
  if (op === '~') return tilde(partial.version, partial.parts)
  // An exact version must be written in full; `1.2` alone is ambiguous, so it is refused.
  if (op === '=' && partial.parts !== 3) return undefined
  if (op === '>=' || op === '>' || op === '<' || op === '<=' || op === '=') return [{ op, version: partial.version }]
  return undefined
}

function holds(version: Version, comparator: Comparator): boolean {
  const order = compare(version, comparator.version)
  if (comparator.op === '>=') return order >= 0
  if (comparator.op === '>') return order > 0
  if (comparator.op === '<') return order < 0
  if (comparator.op === '<=') return order <= 0
  return order === 0
}

/**
 * Does `version` satisfy `range`? Anything malformed (version or range) answers `false`.
 *
 * @example
 * satisfiesRange('0.1.3', '^0.1')   // true
 * satisfiesRange('0.2.0', '^0.1')   // false
 * satisfiesRange('0.1.3', 'banana') // false (not understood = not compatible)
 */
export function satisfiesRange(version: string, range: string): boolean {
  const parsed = parseVersion(version)
  if (parsed === undefined || range.length > 200) return false
  const alternatives = range.split('||').map((part) => part.trim())
  return alternatives.some((alternative) => {
    if (alternative === '') return false
    const comparators: Comparator[] = []
    for (const term of alternative.split(/\s+/)) {
      const parsedTerm = parseTerm(term)
      if (parsedTerm === undefined) return false
      comparators.push(...parsedTerm)
    }
    return comparators.every((comparator) => holds(parsed, comparator))
  })
}
