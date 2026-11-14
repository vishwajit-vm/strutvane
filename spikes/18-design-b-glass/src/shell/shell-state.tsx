/**
 * Shell state shared across the app: command palette open/closed, mobile navigation drawer and
 * the collapsed sidebar (remembered).
 *
 * Why a context: the palette opens from the top bar, from Ctrl/⌘+K anywhere, and from the
 * Overlays showcase page.
 *
 * @example const { openPalette } = useShell()
 */
import { createContext, use, useMemo, useState, type ReactNode } from 'react'
import { readStored, writeStored } from '../lib/storage.ts'
import { useHotkey } from '../lib/use-hotkey.ts'

interface ShellState {
  readonly paletteOpen: boolean
  readonly setPaletteOpen: (open: boolean) => void
  readonly openPalette: () => void
  readonly mobileNavOpen: boolean
  readonly setMobileNavOpen: (open: boolean) => void
  readonly collapsed: boolean
  readonly toggleCollapsed: () => void
}

const ShellContext = createContext<ShellState | null>(null)
const COLLAPSED_KEY = 'strutvane.glass.sidebar-collapsed'

export function ShellProvider({ children }: { children: ReactNode }) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY) === '1')

  useHotkey('k', () => setPaletteOpen((open) => !open), { mod: true })

  const value = useMemo<ShellState>(
    () => ({
      paletteOpen,
      setPaletteOpen,
      openPalette: () => setPaletteOpen(true),
      mobileNavOpen,
      setMobileNavOpen,
      collapsed,
      toggleCollapsed: () =>
        setCollapsed((current) => {
          writeStored(COLLAPSED_KEY, current ? '0' : '1')
          return !current
        }),
    }),
    [paletteOpen, mobileNavOpen, collapsed],
  )
  return <ShellContext value={value}>{children}</ShellContext>
}

export function useShell(): ShellState {
  const state = use(ShellContext)
  if (state === null) throw new Error('useShell() needs <ShellProvider> above it (see src/main.tsx).')
  return state
}
