/**
 * Theme state: light / dark / system, plus the "solid surfaces" switch (reduced transparency).
 *
 * Why a context: the top bar, the screens menu and the settings page all change it, and the
 * choice must be applied to `<html>` (class `dark`, attribute `data-transparency`) so the token
 * blocks in tokens.css take over. The choice is remembered in localStorage; index.html applies it
 * before first paint with the same keys, so there is no flash of the wrong theme.
 *
 * @example
 *   const { theme, setTheme, resolved } = useTheme()
 *   setTheme('dark')
 */
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { readStored, writeStored } from './storage.ts'

export type ThemeChoice = 'light' | 'dark' | 'system'

/** localStorage keys, shared with the inline script in index.html. */
export const THEME_KEY = 'strutvane.glass.theme'
export const SOLID_KEY = 'strutvane.glass.solid'

interface ThemeState {
  /** What the user picked. */
  readonly theme: ThemeChoice
  /** What is actually showing ("system" resolved). */
  readonly resolved: 'light' | 'dark'
  readonly setTheme: (theme: ThemeChoice) => void
  /** True when glass is replaced by solid surfaces (the in-app reduced-transparency switch). */
  readonly solid: boolean
  readonly setSolid: (solid: boolean) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

function readChoice(): ThemeChoice {
  const saved = readStored(THEME_KEY)
  return saved === 'light' || saved === 'dark' ? saved : 'system'
}

/** Provides {@link useTheme}; mount once at the root. `initial` is for tests. */
export function ThemeProvider({ children, initial }: { children: ReactNode; initial?: ThemeChoice }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => initial ?? readChoice())
  const [solid, setSolidState] = useState(() => readStored(SOLID_KEY) === '1')
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  // Follow the OS while the choice is "system".
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  useEffect(() => {
    if (solid) document.documentElement.dataset['transparency'] = 'reduced'
    else delete document.documentElement.dataset['transparency']
  }, [solid])

  const value = useMemo<ThemeState>(
    () => ({
      theme,
      resolved,
      solid,
      setTheme: (next) => {
        setThemeState(next)
        writeStored(THEME_KEY, next)
      },
      setSolid: (next) => {
        setSolidState(next)
        writeStored(SOLID_KEY, next ? '1' : '0')
      },
    }),
    [theme, resolved, solid],
  )
  return <ThemeContext value={value}>{children}</ThemeContext>
}

/** Read and change the theme. Throws when used outside {@link ThemeProvider} (a wiring bug). */
export function useTheme(): ThemeState {
  const state = use(ThemeContext)
  if (state === null) throw new Error('useTheme() needs <ThemeProvider> above it (see src/main.tsx).')
  return state
}
