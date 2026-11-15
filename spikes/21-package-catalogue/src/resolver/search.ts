/**
 * Type-to-search over the catalogue (question 22's second step, `node strut add`, the docs site).
 *
 * Case- and diacritic-insensitive: "MEDIA", "média" and "media" find the same packages, and the
 * folding (`fold` in `text.ts`) is locale-free, so results are identical on every machine.
 * Every word of the query must match somewhere (AND), as in the generated API's `?search=`.
 *
 * @module
 */
import { fold } from '../manifest/text.ts'
import type { CatalogueEntry } from '../catalogue/index-schema.ts'
import { compareForDisplay } from './offer.ts'

/** How well one query word matches one entry: higher is better, 0 is no match. */
function wordScore(entry: CatalogueEntry, word: string): number {
  const id = entry.id
  const name = fold(entry.name)
  if (id === word) return 100
  if (id.startsWith(word) || name.startsWith(word)) return 60
  if (name.split(/\s+/).some((part) => part.startsWith(word))) return 50
  if (entry.tags.some((tag) => tag === word)) return 40
  if (entry.tags.some((tag) => tag.startsWith(word))) return 30
  if (id.includes(word) || name.includes(word)) return 20
  if (fold(entry.description).includes(word)) return 10
  if (fold(entry.package).includes(word)) return 5
  return 0
}

/**
 * Entries matching every word of `query`, best match first (ties: popular first, then name).
 * A blank query returns nothing; show the grouped list instead.
 *
 * @example
 * search(offered(index, { frameworkVersion }), 'PDF factures')
 */
export function search(entries: readonly CatalogueEntry[], query: string, options: { readonly limit?: number } = {}): CatalogueEntry[] {
  // Long queries are cut: nobody types 100 characters into a picker, and it bounds the work.
  const queryWords = fold(query.slice(0, 100))
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
  if (queryWords.length === 0) return []
  const scored: { readonly entry: CatalogueEntry; readonly score: number }[] = []
  for (const entry of entries) {
    let total = 0
    for (const word of queryWords) {
      const score = wordScore(entry, word)
      if (score === 0) {
        total = 0
        break
      }
      total += score
    }
    if (total > 0) scored.push({ entry, score: total })
  }
  return scored
    .sort((a, b) => b.score - a.score || compareForDisplay(a.entry, b.entry))
    .slice(0, options.limit ?? 20)
    .map((item) => item.entry)
}
