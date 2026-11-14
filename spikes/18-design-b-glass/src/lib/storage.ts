/**
 * `localStorage` that never throws.
 *
 * Why: storage throws in private windows, with blocked site data, and in some embedded previews.
 * Remembered preferences are a convenience, so a failure must silently fall back to defaults.
 *
 * @example const saved = readStored('strutvane.glass.theme')  // string | null
 */
export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

/** Save a preference; failures are ignored (see {@link readStored}). */
export function writeStored(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Storage unavailable: the preference lasts for this page view only.
  }
}
