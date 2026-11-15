/**
 * What may be offered, and how it is grouped. Shared by installer question 22, `node strut add`
 * and the docs site, so they can never disagree about which packages exist.
 *
 * @module
 */
import type { PackageKind } from '../manifest/schema.ts'
import { satisfiesRange } from '../manifest/semver-range.ts'
import { fold } from '../manifest/text.ts'
import { byCodeUnit } from '../graph.ts'
import type { CatalogueCategory, CatalogueEntry, CatalogueIndex } from '../catalogue/index-schema.ts'

/** Which entries to offer. */
export interface OfferOptions {
  /** The exact framework version of the app (or the one being installed). */
  readonly frameworkVersion: string
  /** Also offer packages that are not released yet (docs "coming soon" pages). Default false. */
  readonly includeUnpublished?: boolean
  /** Also offer packages released only as a preview (the `next` dist-tag). Default false. */
  readonly includePreview?: boolean
  /** Also offer deprecated packages. Default false: deprecated packages are only installed when asked for by id. */
  readonly includeDeprecated?: boolean
  /** Which kinds. Default `['package']`: designs have their own question (§5.1). */
  readonly kinds?: readonly PackageKind[]
  /** Only categories marked `pickable` (default true). The docs site turns this off to list everything. */
  readonly pickableOnly?: boolean
}

/**
 * The newest version of `entry` that works with `frameworkVersion`, or `undefined`.
 *
 * Why not just the latest version's range: an add-on may have dropped an old framework line in
 * its newest release, and an app on that line should still get the newest version that fits.
 *
 * @example
 * compatibleVersion(charts, '0.2.4') // '0.2.1'
 */
export function compatibleVersion(entry: CatalogueEntry, frameworkVersion: string): string | undefined {
  return entry.versions.find((candidate) => satisfiesRange(frameworkVersion, candidate.framework))?.version
}

/**
 * Why `entry` cannot be offered or installed right now, in plain words, or `undefined` if it can.
 */
export function unavailableReason(entry: CatalogueEntry, options: OfferOptions): string | undefined {
  if (entry.status === 'shelved') return `${entry.name} (${entry.id}) is shelved`
  if (!entry.published && options.includeUnpublished !== true) return `${entry.name} (${entry.id}) is not released yet`
  if (entry.status === 'preview' && options.includePreview !== true) return `${entry.name} (${entry.id}) is only a preview so far (install it with --preview)`
  if (compatibleVersion(entry, options.frameworkVersion) === undefined) {
    const lines = Object.keys(entry.compatibility)
    return `${entry.name} (${entry.id}) does not support framework ${options.frameworkVersion} yet` +
      (lines.length > 0 ? ` (it works with ${lines.join(', ')})` : '')
  }
  return undefined
}

/**
 * The entries a picker may show: published, compatible with the framework, not deprecated, of
 * the requested kinds, in pickable categories. Order is the index's (sorted by id).
 *
 * @example
 * offered(index, { frameworkVersion: '0.2.0' }).every((e) => e.published) // true
 */
export function offered(index: CatalogueIndex, options: OfferOptions): CatalogueEntry[] {
  const kinds = options.kinds ?? ['package']
  const pickable = new Set(index.categories.filter((category) => category.pickable || options.pickableOnly === false).map((category) => category.id))
  return index.entries.filter(
    (entry) =>
      kinds.includes(entry.kind) &&
      pickable.has(entry.category) &&
      (entry.deprecated === undefined || options.includeDeprecated === true) &&
      unavailableReason(entry, options) === undefined,
  )
}

/** One group of a picker. */
export interface CategoryGroup {
  readonly category: CatalogueCategory
  readonly entries: readonly CatalogueEntry[]
}

/**
 * Comparison used everywhere a list is shown: popular first, then by name (folded, so "Éclair"
 * sorts with "eclair"), then by id as the final tie-break.
 */
export function compareForDisplay(a: CatalogueEntry, b: CatalogueEntry): number {
  if (a.popular !== b.popular) return a.popular ? -1 : 1
  return byCodeUnit(fold(a.name), fold(b.name)) || byCodeUnit(a.id, b.id)
}

/**
 * Group entries by category in the hub's category order; popular entries first inside each
 * group. Empty groups are left out.
 *
 * @param options.popularOnly - only the short popular list (question 22's first screen)
 * @example
 * groupByCategory(index, offered(index, { frameworkVersion }), { popularOnly: true })
 */
export function groupByCategory(
  index: CatalogueIndex,
  entries: readonly CatalogueEntry[],
  options: { readonly popularOnly?: boolean } = {},
): CategoryGroup[] {
  return index.categories
    .map((category) => ({
      category,
      entries: entries.filter((entry) => entry.category === category.id && (options.popularOnly !== true || entry.popular)).sort(compareForDisplay),
    }))
    .filter((group) => group.entries.length > 0)
}
