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
