/**
 * Text rules shared by the manifest validator and the resolver.
 *
 * Every human-readable string in a manifest ends up in a terminal (the installer), a web page
 * (the docs site) or an AI agent's context (agent tools). So display text is held to one strict
 * rule set, {@link displayTextProblem}, and search uses one folding function, {@link fold}, so
 * "Łódź", "LODZ" and "lodz" are the same word everywhere.
 *
 * @module
 */

/**
 * Letters that Unicode decomposition does not turn into ASCII, mapped by hand. Without this,
 * "Straße" would never match "strasse" and "Łódź" never "lodz".
 */
const EXTRA_FOLDS: Readonly<Record<string, string>> = {
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  ø: 'o',
  ł: 'l',
  đ: 'd',
  ð: 'd',
  þ: 'th',
  ı: 'i',
}

/**
 * Fold text for comparison: compatibility decomposition (full-width `ｐａｓｓ` → `pass`), accents
 * removed, lower case without a locale (so Turkish `İ` folds the same on every machine), and the
 * few letters decomposition leaves alone.
 *
 * Why no locale: the result must be identical on a developer's laptop, in CI and in a browser,
 * otherwise search results and secret-word checks would differ between machines.
 *
 * @example
 * fold('Łódź Café') // 'lodz cafe'
 */
export function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[ßæœøłđðþı]/g, (letter) => EXTRA_FOLDS[letter] ?? letter)
}

/**
 * Split an identifier or sentence into folded words: `apiKey`, `api_key`, `API-KEY` and "API key"
 * all give `['api', 'key']`.
 *
 * @example
 * words('stripeSecretKey') // ['stripe', 'secret', 'key']
 */
export function words(text: string): string[] {
  const spaced = text
    .normalize('NFKC')
    // camelCase and PascalCase boundaries: "secretKey" → "secret Key", "APIKey" → "API Key".
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, '$1 $2')
  return fold(spaced)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 0)
}

/** Scripts that contain letters which look exactly like Latin ones (а/a, е/e, о/o, р/p, ѕ/s…). */
const LOOKALIKE_SCRIPTS = /[\p{Script=Cyrillic}\p{Script=Greek}\p{Script=Armenian}\p{Script=Cherokee}]/u
const LATIN = /\p{Script=Latin}/u

/**
 * Why a piece of display text is unacceptable, or `undefined` when it is fine.
 *
 * The rules, and why each exists:
 * - **not empty, no leading or trailing spaces:** blank labels make an unusable picker;
 * - **one line, no control characters:** a newline or escape sequence can redraw the terminal
 *   and fake another question ("terminal injection");
 * - **no invisible format characters** (zero-width spaces, bidi overrides, soft hyphens): they
 *   hide words from reviewers and from the secret-word check ("Trojan Source", CVE-2021-42574);
 * - **no word mixing Latin with look-alike letters** (Cyrillic `а` in "pаssword"): the classic
 *   way to slip a forbidden word past a filter;
 * - **NFC form:** the same text always has the same bytes, so the index is deterministic.
 *
 * @example
 * displayTextProblem('Billing', 30)        // undefined
 * displayTextProblem('Bill‮ing', 30)  // 'contains invisible formatting characters …'
 */
export function displayTextProblem(text: string, max: number): string | undefined {
  if (text.trim().length === 0) return 'is empty'
  if (text !== text.trim()) return 'starts or ends with a space'
  if ([...text].length > max) return `is too long (at most ${max} characters)`
  if (/\p{Cc}/u.test(text)) return 'contains a line break or control character (it must be one plain line)'
  if (/[\p{Cf}\p{Zl}\p{Zp}]/u.test(text)) {
    return 'contains invisible formatting characters (zero-width or right-to-left marks), which can hide words'
  }
  if (text !== text.normalize('NFC')) return 'is not in Unicode NFC form (re-save the file as normal UTF-8 text)'
  for (const word of text.split(/[^\p{L}\p{M}]+/u)) {
    if (LATIN.test(word) && LOOKALIKE_SCRIPTS.test(word)) {
      return `mixes Latin letters with look-alike letters from another alphabet in "${word}"`
    }
  }
  return undefined
}
