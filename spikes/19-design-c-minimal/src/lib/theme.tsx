/**
 * Light / dark / system theme, remembered per browser.
 *
 * Why a class on <html>: Tailwind's `dark:` variant and the `.dark` token block both key off it,
 * and index.html applies the same rule before React loads, so a dark user never sees a white flash.
 *
 * @example
 * const { mode, setMode, resolved } = useTheme()
 * setMode('dark')
 */
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { readPreference, writePreference } from './storage.ts'

/** What the user picked. `system` follows the OS and updates live when the OS changes. */
export type ThemeMode = 'light' | 'dark' | 'system'

/** The storage key shared with the pre-paint script in index.html. */
export const THEME_KEY = 'strutvane.design-c.theme'

interface ThemeState {
  mode: ThemeMode
  /** The theme actually shown once `system` is resolved. */
  resolved: 'light' | 'dark'
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

function isMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

/** Provide the theme to the app. `initialMode` lets tests force a theme without touching storage. */
export function ThemeProvider({ children, initialMode }: { children: ReactNode; initialMode?: ThemeMode }) {
  const [mode, setModeState] = useState<ThemeMode>(() => {
    if (initialMode !== undefined) return initialMode
    const saved = readPreference(THEME_KEY)
    return isMode(saved) ? saved : 'system'
  })
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow live OS changes while in `system` mode.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    writePreference(THEME_KEY, next)
  }, [])

  const value = useMemo(() => ({ mode, resolved, setMode }), [mode, resolved, setMode])
  return <ThemeContext value={value}>{children}</ThemeContext>
}

/** Read and change the theme. Must be used inside {@link ThemeProvider}. */
export function useTheme(): ThemeState {
  const state = useContext(ThemeContext)
  if (state === null) throw new Error('useTheme() needs <ThemeProvider> above it: wrap the app in <ThemeProvider>.')
  return state
}
