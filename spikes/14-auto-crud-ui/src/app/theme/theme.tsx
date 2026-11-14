/**
 * Light / Dark / System theme, remembered per browser.
 *
 * - Default is System (follows the OS), like the Laravel starter kits and Filament.
 * - The choice is stored in `localStorage`, inside try/catch: private windows and blocked storage
 *   throw, and the theme must still work there (it just is not remembered).
 * - `index.html` applies the stored theme before React loads, so there is no light flash.
 *
 * @module
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactElement, type ReactNode } from 'react'

/**
 * The user's theme choice.
 *
 * @example
 * const preference: ThemePreference = 'system'
 */
export type ThemePreference = 'light' | 'dark' | 'system'

/** localStorage key, shared with the inline script in index.html. */
export const THEME_STORAGE_KEY = 'strutvane.theme'

/**
 * Read the stored preference, falling back to `system` when storage is empty or unavailable.
 *
 * @example
 * readStoredTheme() // 'dark'
 */
export function readStoredTheme(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  } catch {
    return 'system'
  }
}

/**
 * Should the page be dark for this preference? `system` asks the OS (and assumes light when the
 * browser cannot tell, as in tests).
 *
 * @example
 * isDark('system') // true on a phone in dark mode
 */
export function isDark(preference: ThemePreference): boolean {
  if (preference !== 'system') return preference === 'dark'
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
}

interface ThemeState {
  readonly preference: ThemePreference
  readonly setPreference: (preference: ThemePreference) => void
}

const ThemeContext = createContext<ThemeState | null>(null)

/**
 * Provide the theme and keep `<html class="dark">` in sync with it.
 *
 * @example
 * <ThemeProvider><App /></ThemeProvider>
 */
export function ThemeProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [preference, setPreferenceState] = useState<ThemePreference>(readStoredTheme)

  useEffect(() => {
    const apply = (): void => {
      const dark = isDark(preference)
      document.documentElement.classList.toggle('dark', dark)
      document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
    }
    apply()
    // On "system", follow the OS live when it switches (for example at sunset).
    if (preference !== 'system' || typeof window.matchMedia !== 'function') return undefined
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [preference])

  const state = useMemo<ThemeState>(
    () => ({
      preference,
      setPreference: (next) => {
        setPreferenceState(next)
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, next)
        } catch {
          // Storage unavailable: the theme still applies for this visit.
        }
      },
    }),
    [preference],
  )
  return <ThemeContext.Provider value={state}>{children}</ThemeContext.Provider>
}

/**
 * Read and change the theme.
 *
 * @example
 * const { preference, setPreference } = useTheme()
 */
export function useTheme(): ThemeState {
  const state = useContext(ThemeContext)
  if (state === null) throw new Error('useTheme() needs a <ThemeProvider> above it.')
  return state
}
