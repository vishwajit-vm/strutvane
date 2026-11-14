/**
 * Slugs: `t.slug('slug').from('title')` in a migration means "fill this from the title on
 * create, and keep it unique".
 *
 * Uniqueness is scoped like the column's unique index (per tenant on tenant tables). A taken slug
 * gets a short random suffix, and the unique index stays the real guarantee: if two requests race
 * for the same slug, the loser's insert fails and is retried with a fresh suffix.
 */
import { randomBytes } from 'node:crypto'

/**
 * URL-safe ASCII from any text: accents removed, lowercase, words joined by hyphens.
 *
 * @example
 * slugify('Crème Brûlée: the 10 best!', 200) // 'creme-brulee-the-10-best'
 */
export function slugify(source: string, maxLength: number): string {
  const ascii = source
    .normalize('NFKD')
    // Combining marks are what NFKD splits accents into: "é" → "e" + "´".
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  // Leave room for a "-123" suffix so a long title can still get a unique slug.
  const room = Math.max(1, maxLength - 8)
  const trimmed = ascii.slice(0, room).replace(/-+$/g, '')
  return trimmed === '' ? 'item' : trimmed
}

/**
 * The slug to use given the ones already taken that start with `base`: `base` itself when free,
 * otherwise `base` plus a short random suffix (`hello-k3f9`).
 *
 * Why random and not Laravel-style `-2`, `-3`: a counter tells the user how many rows with the
 * same title exist, including rows they are not allowed to see (security review F-14).
 *
 * @example
 * nextFreeSlug('hello', ['hello']) // 'hello-k3f9'
 */
export function nextFreeSlug(base: string, taken: readonly string[]): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (;;) {
    const candidate = `${base}-${randomSuffix()}`
    if (!used.has(candidate)) return candidate
  }
}

/** Letters and digits that can't be confused when read aloud or in a URL (no 0/o, 1/l). */
const SUFFIX_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789'

function randomSuffix(): string {
  return [...randomBytes(4)].map((byte) => SUFFIX_ALPHABET[byte % SUFFIX_ALPHABET.length] ?? 'x').join('')
}
