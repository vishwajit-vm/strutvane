/**
 * Bind a global keyboard shortcut, optionally with the platform modifier (Ctrl, or ⌘ on Mac).
 *
 * Why: the command palette (Ctrl/⌘+K) must open from anywhere, but plain-letter shortcuts must not
 * fire while the user is typing in a field.
 *
 * @example useHotkey('k', () => setOpen(true), { mod: true })
 */
import { useEffect, useRef } from 'react'

export interface HotkeyOptions {
  /** Require Ctrl (or ⌘ on Mac). */
  readonly mod?: boolean
}

export function useHotkey(key: string, handler: (event: KeyboardEvent) => void, options: HotkeyOptions = {}): void {
  const handlerRef = useRef(handler)
  useEffect(() => {
    handlerRef.current = handler
  })
  const mod = options.mod ?? false
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== key.toLowerCase()) return
      const hasMod = event.ctrlKey || event.metaKey
      if (mod !== hasMod) return
      if (!mod && isTyping(event.target)) return
      event.preventDefault()
      handlerRef.current(event)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [key, mod])
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/** "Ctrl" or "⌘", for shortcut hints. */
export function modKeyLabel(): string {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'
}
