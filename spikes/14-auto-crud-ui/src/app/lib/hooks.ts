/**
 * Small React hooks shared by several screens.
 *
 * @module
 */
import { useEffect, useState } from 'react'

/**
 * A value that only updates after it stopped changing for `delayMs`. Used for search boxes, so
 * typing "acme" sends one request instead of four.
 *
 * @example
 * const term = useDebouncedValue(text, 300)
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs)
    return () => clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}

/**
 * Is the event's target a place where the user types? Shortcuts must not steal those keys.
 *
 * @example
 * if (isTypingTarget(event.target)) return
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
}

/** Widgets that own the keyboard while focused: their keys (typeahead, arrows) are not shortcuts. */
const KEYBOARD_OWNERS = '[role="menu"],[role="menubar"],[role="listbox"],[role="combobox"],[role="dialog"],[role="alertdialog"]'

/**
 * Should a page-wide shortcut ignore this key press? Yes while typing in a field, while focus is in
 * a widget that uses keys itself (a menu, a listbox, a dialog), and while any modal is open.
 * One rule for every global listener, so no shortcut forgets one of the cases.
 *
 * @example
 * if (shortcutBlocked(event)) return
 */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (isTypingTarget(event.target)) return true
  const focused = event.target instanceof Element ? event.target : document.activeElement
  if (focused?.closest(KEYBOARD_OWNERS)) return true
  return document.querySelector('[aria-modal="true"]') !== null
}
