/**
 * Safe `localStorage` access. Storage throws in private windows, sandboxed iframes and when site
 * data is blocked; a remembered preference is a convenience, so failures fall back quietly.
 */

/** Read a saved string, or `null` when nothing is saved or storage is unavailable. */
export function readPreference(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Save a string; returns `false` when storage is unavailable (the caller keeps working). */
export function writePreference(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}
