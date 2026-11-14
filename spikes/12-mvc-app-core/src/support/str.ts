/**
 * Small, predictable string helpers shared by routing, generators and the CLI.
 *
 * The inflection here is deliberately tiny. `singular()` has a twin at the type level
 * (`Singular<…>` in `routing/types.ts`), and the two must always agree, because
 * `Route.resource('posts', …)` names its parameter `{post}` both at runtime and in the types.
 * Irregular words ("people") are handled with an explicit `parameter` option instead of a big
 * word list that the type level could never mirror.
 */

/**
 * The singular of an English plural, using three rules only: `-ies` → `-y`, `-sses` → `-ss`,
 * otherwise drop one trailing `s`.
 *
 * @example
 * singular('posts')      // 'post'
 * singular('categories') // 'category'
 * singular('addresses')  // 'address'
 */
export function singular(word: string): string {
  if (word.endsWith('ies')) return `${word.slice(0, -3)}y`
  if (word.endsWith('sses')) return word.slice(0, -2)
  if (word.endsWith('s') && !word.endsWith('ss')) return word.slice(0, -1)
  return word
}

/**
 * The plural of an English noun, the inverse of {@link singular} for regular words.
 *
 * @example
 * plural('post')     // 'posts'
 * plural('category') // 'categories'
 */
export function plural(word: string): string {
  if (/[^aeiou]y$/.test(word)) return `${word.slice(0, -1)}ies`
  if (/(s|x|z|ch|sh)$/.test(word)) return `${word}es`
  return `${word}s`
}

/**
 * `PostController` → `post_controller`; `BlogPost` → `blog_post`.
 *
 * @example
 * snakeCase('BlogPost') // 'blog_post'
 */
export function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
}

/**
 * `blog_post` → `BlogPost`.
 *
 * @example
 * pascalCase('blog_post') // 'BlogPost'
 */
export function pascalCase(snake: string): string {
  return snake
    .split(/[_\-\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')
}

/**
 * `BlogPost` → `blog-post`, the file-name style the generators use.
 *
 * @example
 * kebabCase('BlogPost') // 'blog-post'
 */
export function kebabCase(name: string): string {
  return snakeCase(name).replace(/_/g, '-')
}

/**
 * Turn any text into a URL slug: lower case ASCII letters and digits, single dashes.
 *
 * @example
 * slugify('Crème brûlée, again!') // 'creme-brulee-again'
 */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // drop the accents NFKD split off
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * How many single-character edits turn `a` into `b`. Used for "Did you mean …?" hints.
 *
 * @example
 * editDistance('rout:list', 'route:list') // 1
 */
export function editDistance(a: string, b: string): number {
  // Classic two-row dynamic programming: O(a·b) time, O(b) memory.
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const substitution = (previous[j - 1] ?? 0) + (a[i - 1] === b[j - 1] ? 0 : 1)
      const insertion = (current[j - 1] ?? 0) + 1
      const deletion = (previous[j] ?? 0) + 1
      current.push(Math.min(substitution, insertion, deletion))
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/**
 * The candidate closest to `input`, if it is close enough to be a likely typo.
 *
 * @example
 * closestMatch('rout:list', ['route:list', 'about']) // 'route:list'
 */
export function closestMatch(input: string, candidates: readonly string[]): string | undefined {
  // Allow roughly one typo per four characters, and always at least two.
  const budget = Math.max(2, Math.floor(input.length / 4))
  let best: { name: string; distance: number } | undefined
  for (const candidate of candidates) {
    const distance = editDistance(input, candidate)
    if (distance <= budget && (best === undefined || distance < best.distance)) best = { name: candidate, distance }
  }
  return best?.name
}
