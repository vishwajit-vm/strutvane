/**
 * Global keyboard shortcuts (keyboard-first is part of Direction C's promise).
 *
 * - `Ctrl/⌘ K` opens the command palette from anywhere, even inside an input.
 * - `G` then a letter jumps to a section (`G D` dashboard, `G I` invoices, …), Linear-style
 *   two-key sequences that never clash with typing because they are ignored inside fields.
 * - `C` creates an invoice, `?` lists every shortcut.
 *
 * The table below is the single source: the shortcuts dialog and the palette hints render it.
 */
import { useEffect } from 'react'

export interface Shortcut {
  keys: readonly string[]
  label: string
  /** Where it navigates, for `G` sequences and `C`. */
  to?: string
}

export const GO_TO: readonly (Shortcut & { letter: string; to: string })[] = [
  { letter: 'd', keys: ['G', 'D'], label: 'Go to dashboard', to: '/' },
  { letter: 'i', keys: ['G', 'I'], label: 'Go to invoices', to: '/invoices' },
  { letter: 'b', keys: ['G', 'B'], label: 'Go to board', to: '/invoices/board' },
  { letter: 'c', keys: ['G', 'C'], label: 'Go to calendar', to: '/invoices/calendar' },
  { letter: 't', keys: ['G', 'T'], label: 'Go to team', to: '/settings/team' },
  { letter: 's', keys: ['G', 'S'], label: 'Go to settings', to: '/settings/profile' },
]

export const GENERAL: readonly Shortcut[] = [
  { keys: ['Ctrl', 'K'], label: 'Open command palette' },
  { keys: ['C'], label: 'New invoice', to: '/invoices/new' },
  { keys: ['/'], label: 'Search the current list' },
  { keys: ['?'], label: 'Show keyboard shortcuts' },
]

export const LIST: readonly Shortcut[] = [
  { keys: ['J'], label: 'Next row' },
  { keys: ['K'], label: 'Previous row' },
  { keys: ['X'], label: 'Select row' },
  { keys: ['Enter'], label: 'Open row' },
  { keys: ['Space'], label: 'Peek in drawer' },
]

/** True when the key press belongs to a text field (shortcuts must not steal typing). */
export function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.getAttribute('role') === 'combobox'
}

/** Widgets that own the keyboard while open or focused (typeahead, arrows, their own Escape). */
const KEYBOARD_OWNERS = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]'

/**
 * Should a page-wide single-key shortcut ignore this key press? Yes while typing in a field, while
 * focus is inside a widget that uses keys itself, and while any such widget is open. One rule for
 * every global listener, so none forgets a case (a Select's listbox was missed: typing "c" to pick
 * CAD jumped to a new invoice and dropped the edits).
 */
export function shortcutBlocked(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || isTyping(event.target)) return true
  const focused = event.target instanceof Element ? event.target : document.activeElement
  if (focused?.closest(KEYBOARD_OWNERS)) return true
  return document.querySelector(KEYBOARD_OWNERS) !== null
}

interface Handlers {
  openPalette: () => void
  openShortcuts: () => void
  navigate: (to: string) => void
}

/** Install the global shortcuts while the app shell is mounted. */
export function useGlobalShortcuts({ openPalette, openShortcuts, navigate }: Handlers): void {
  useEffect(() => {
    let awaitingGo: number | null = null
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        // Not over another dialog (a confirm, the drawer): stacking the palette on top of it
        // leaves two modals fighting for focus. The open dialog's own keys win.
        if (document.querySelector('[role="dialog"], [role="alertdialog"]') !== null) return
        event.preventDefault()
        openPalette()
        return
      }
      // Typing, or a dialog, menu or listbox is open or focused: its own keys win.
      if (event.metaKey || event.ctrlKey || event.altKey || shortcutBlocked(event)) return
      const key = event.key.toLowerCase()
      if (awaitingGo !== null) {
        window.clearTimeout(awaitingGo)
        awaitingGo = null
        const target = GO_TO.find((item) => item.letter === key)
        if (target !== undefined) {
          event.preventDefault()
          navigate(target.to)
        }
        return
      }
      if (key === 'g') {
        // The second key must follow within a second, like a chord.
        awaitingGo = window.setTimeout(() => {
          awaitingGo = null
        }, 1000)
      } else if (key === 'c') {
        event.preventDefault()
        navigate('/invoices/new')
      } else if (event.key === '?') {
        event.preventDefault()
        openShortcuts()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      if (awaitingGo !== null) window.clearTimeout(awaitingGo)
    }
  }, [openPalette, openShortcuts, navigate])
}
