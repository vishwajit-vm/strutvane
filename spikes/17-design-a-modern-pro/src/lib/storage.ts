/**
 * Safe `localStorage` access. Storage throws in private windows, sandboxed iframes and when the
 * quota is full; a preference that cannot be saved must never break the page, so every call is
 * guarded and falls back to "nothing stored".
 *
 * @example
 * const saved = readPreference('strutvane.design-a.sidebar') // string | null
 * writePreference('strutvane.design-a.sidebar', 'collapsed')
 */

/** Read a stored string, or `null` when absent or when storage is unavailable. */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Store a string; silently does nothing when storage is unavailable. */
export function writePreference(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Not saved: the preference simply resets on the next visit.
  }
}
