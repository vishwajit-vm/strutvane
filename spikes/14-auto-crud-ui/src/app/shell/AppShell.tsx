/**
 * `<AppShell>`: the signed-in layout (DESIGN.md §3). Skip link, the vertical menu, the sticky
 * navbar, the page content (max width, responsive padding), the search palette and the global
 * Ctrl/Cmd+K shortcut. Signed-out visitors are sent to the sign-in screen.
 *
 * @module
 */
import { Navigate, Outlet } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useSession } from '../auth/session.tsx'
import { cn } from '../lib/cn.ts'
import { CommandPalette } from './CommandPalette.tsx'
import { ShortcutsDialog, useShortcuts } from './shortcuts.tsx'
import { Sidebar } from './Sidebar.tsx'
import { TopBar } from './TopBar.tsx'

/** localStorage key for the collapsed menu (a per-browser convenience). */
const COLLAPSED_KEY = 'strutvane.sidebar-collapsed'

/**
 * The layout around every signed-in screen.
 *
 * @example
 * createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell })
 */
export function AppShell(): ReactElement {
  const { user } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  // Stable callback, so the keyboard listener is registered once, not on every render.
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), [])
  useGlobalSearchShortcut(toggleSearch)
  const [helpOpen, setHelpOpen] = useState(false)
  const openSearch = useCallback(() => setSearchOpen(true), [])
  const openHelp = useCallback(() => setHelpOpen(true), [])
  useShortcuts({ openSearch, openHelp })

  const toggleCollapsed = (): void => {
    setCollapsed((current) => {
      writeCollapsed(!current)
      return !current
    })
  }

  if (user === null) return <Navigate to="/sign-in" replace />

  return (
    <div className="min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only rounded-md bg-card p-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-(--z-toast)">
        Skip to content
      </a>
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      <div className={cn('flex min-h-screen min-w-0 flex-col transition-[padding] duration-(--duration-base) ease-(--ease-standard)', collapsed ? 'md:pl-(--sidebar-width-collapsed)' : 'md:pl-(--sidebar-width)')}>
        <TopBar onOpenMenu={() => setMenuOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-(--content-max-width) flex-1 px-4 py-6 outline-none md:px-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} onShowShortcuts={openHelp} />
      <ShortcutsDialog open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )
}

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

function writeCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_KEY, String(collapsed))
  } catch {
    // Storage blocked: the menu still collapses for this visit.
  }
}

/**
 * Ctrl+K (Windows/Linux) or Cmd+K (Mac) toggles global search from anywhere. A modifier
 * combination never collides with typing, so it also works while focus is in an input.
 */
function useGlobalSearchShortcut(toggle: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() === 'k' && (event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])
}
