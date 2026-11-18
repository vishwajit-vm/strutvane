/**
 * Pre-release versions (`0.2.0-next.0`) for the conformance checks.
 *
 * The catalogue itself lists full releases only (`semver-range.ts` refuses pre-releases on
 * purpose: the installer never offers a release candidate). But the packages that exist today are
 * all pre-releases on the `next` dist-tag, and their `strutvane.compat` ranges are written with
 * pre-release tags (`^0.1.0-next.0`). The checks still need to answer "does this package accept
 * the framework line being released?", so this module compares at the level of the **release
 * line**: pre-release tags are dropped from both the version and the range before the ordinary
 * range check runs. That is deliberately coarse; it is exactly the question the release train
 * asks ("is framework 0.2 inside this package's compat range?"), and nothing here decides what the
 * installer offers.
 *
 * @module
 */
import { compareVersions, isSupportedRange, satisfiesRange } from '../manifest/semver-range.ts'

/** `major.minor.patch`, optionally `-pre.release` and `+build`. */
const ANY_VERSION = /^(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})\.(0|[1-9]\d{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z.-]+)?$/

/** A version as written on npm, or `undefined` when it is not semver. */
export function parseAnyVersion(text: string): { readonly base: string; readonly prerelease: string | undefined } | undefined {
  const match = ANY_VERSION.exec(text)
  if (match === null) return undefined
  return { base: `${match[1]}.${match[2]}.${match[3]}`, prerelease: match[4] }
}

/** True for `0.2.0-next.0`, false for `0.2.0` and for non-versions. */
export const isPrerelease = (version: string): boolean => parseAnyVersion(version)?.prerelease !== undefined

/**
 * A placeholder published only to hold the name on npm (`0.0.0-reserved.0`, `0.0.0-stage`). They
 * carry no code and must never count as a release.
 */
export const isPlaceholder = (version: string): boolean => parseAnyVersion(version)?.base === '0.0.0'

/**
 * Order any two semver versions, pre-releases included (a pre-release sorts before its release;
 * pre-release identifiers compare numerically when both are numbers, as in semver §11). Malformed
 * versions sort first.
 */
export function compareAnyVersions(a: string, b: string): number {
  const left = parseAnyVersion(a)
  const right = parseAnyVersion(b)
  if (left === undefined || right === undefined) return (left === undefined ? 0 : 1) - (right === undefined ? 0 : 1)
  const base = compareVersions(left.base, right.base)
  if (base !== 0) return base
  if (left.prerelease === undefined || right.prerelease === undefined) {
    return (left.prerelease === undefined ? 1 : 0) - (right.prerelease === undefined ? 1 : 0)
  }
  const l = left.prerelease.split('.')
  const r = right.prerelease.split('.')
  for (let i = 0; i < Math.max(l.length, r.length); i += 1) {
    const x = l[i]
    const y = r[i]
    if (x === undefined || y === undefined) return (x === undefined ? -1 : 0) + (y === undefined ? 1 : 0)
    const xn = /^\d+$/.test(x) ? Number(x) : undefined
    const yn = /^\d+$/.test(y) ? Number(y) : undefined
    if (xn !== undefined && yn !== undefined) {
      if (xn !== yn) return xn - yn
    } else if (xn !== undefined || yn !== undefined) {
      return xn !== undefined ? -1 : 1
    } else if (x !== y) {
      return x < y ? -1 : 1
    }
  }
  return 0
}

/** Drop pre-release and build tags from every version inside a range: `^0.1.0-next.0` → `^0.1.0`. */
export const lineRange = (range: string): string => range.replace(/(\d)-[0-9A-Za-z.-]+/g, '$1').replace(/\+[0-9A-Za-z.-]+/g, '')

/** Is the range understood once pre-release tags are dropped? */
export const isSupportedLineRange = (range: string): boolean => isSupportedRange(lineRange(range))

/**
 * Does the range accept this framework version's release line? Both sides lose their pre-release
 * tags first, so `0.2.0-next.0` against `^0.1.0-next.0` asks "0.2.0 in ^0.1.0?" (no).
 *
 * @example
 * acceptsFramework('^0.2.0-next.0', '0.2.0-next.3') // true
 * acceptsFramework('^0.1.0-next.0', '0.2.0-next.0') // false
 */
export function acceptsFramework(range: string, frameworkVersion: string): boolean {
  const version = parseAnyVersion(frameworkVersion)
  return version !== undefined && satisfiesRange(version.base, lineRange(range))
}
