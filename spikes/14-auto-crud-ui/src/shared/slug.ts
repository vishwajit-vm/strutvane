/**
 * The slug rule, identical to spike 10's `slugify` (its `src/naming.ts`), so the slug preview in
 * the form shows exactly what the server will store.
 *
 * @module
 */

/** Combining accents that NFKD splits off (`é` becomes `e` + U+0301). */
const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * Turn a title into a URL slug: accents dropped, lower case, runs of anything else become one
 * dash, no dashes at the ends.
 *
 * @example
 * slugify('Héllo, World!') // 'hello-world'
 * slugify('日本') // '' (the server then asks for a slug explicitly)
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
