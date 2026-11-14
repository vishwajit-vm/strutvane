/**
 * Copy text to the clipboard, for "Copy link" and "Copy ID".
 *
 * @module
 */

/**
 * Copy text. Uses the async Clipboard API, which needs a secure context and permission. When it is
 * missing or refused (plain http on a LAN IP, an older browser, tests), it falls back to a hidden
 * textarea and `execCommand('copy')`. Resolves `false` when neither works, so the caller can say so
 * instead of claiming success.
 *
 * @example
 * if (await copyText(location.href)) toast('Link copied.')
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard !== undefined) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Refused or unavailable: try the fallback below.
  }
  return copyWithTextarea(text)
}

function copyWithTextarea(text: string): boolean {
  if (typeof document === 'undefined' || typeof document.execCommand !== 'function') return false
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.append(area)
  area.select()
  try {
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    area.remove()
  }
}
