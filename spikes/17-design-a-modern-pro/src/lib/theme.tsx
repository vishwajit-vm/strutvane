/**
 * Light / dark theme with a remembered choice.
 *
 * The choice is `light`, `dark` or `system`; `system` follows the OS and updates live. The `.dark`
 * class on `<html>` drives every token in `styles.css`. `index.html` applies the saved choice
 * before React loads (same storage key), so a dark-mode user never sees a white flash.
 *
 * @module
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'
import { readPreference, writePreference } from './storage.ts'

/** The storage key shared with the pre-paint script in `index.html`. */
export const THEME_STORAGE_KEY = 'strutvane.design-a.theme'

/** What the user picked. */
export type ThemeChoice = 'light' | 'dark' | 'system'

/** What is actually shown. */
export type ResolvedTheme = 'light' | 'dark'

interface ThemeContextValue {
  readonly choice: ThemeChoice
  readonly resolved: ResolvedTheme
  readonly setChoice: (choice: ThemeChoice) => void
  /** Flip between light and dark (leaves `system`). */
  readonly toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function parseChoice(value: string | null): ThemeChoice {
  return value === 'light' || value === 'dark' ? value : 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

/**
 * Provides the theme to the app. `initial` overrides the stored choice (tests render each screen
 * in both themes this way).
 *
 * @example
 * <ThemeProvider><App /></ThemeProvider>
 */
export function ThemeProvider({ children, initial }: { readonly children: ReactNode; readonly initial?: ThemeChoice }): ReactElement {
  const [choice, setChoiceState] = useState<ThemeChoice>(() => initial ?? parseChoice(readPreference(THEME_STORAGE_KEY)))
  const [systemDark, setSystemDark] = useState(systemPrefersDark)

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (): void => setSystemDark(query.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolved: ResolvedTheme = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark')
  }, [resolved])

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next)
    writePreference(THEME_STORAGE_KEY, next)
  }, [])

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, setChoice, toggle: () => setChoice(resolved === 'dark' ? 'light' : 'dark') }),
    [choice, resolved, setChoice],
  )
  return <ThemeContext value={value}>{children}</ThemeContext>
}

/**
 * Read and change the theme.
 *
 * @example
 * const { resolved, toggle } = useTheme()
 */
export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext)
  if (value === null) throw new Error('useTheme() must be used inside <ThemeProvider>. Wrap the app root with it.')
  return value
}
