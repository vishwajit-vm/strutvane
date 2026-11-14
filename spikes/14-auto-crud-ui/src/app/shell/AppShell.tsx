/**
 * `<AppShell>`: the signed-in layout. Skip link, sidebar, top bar, the page, and the global
 * Ctrl/Cmd+K shortcut. Signed-out visitors are sent to the sign-in screen.
 *
 * @module
 */
import { Navigate, Outlet } from '@tanstack/react-router'
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import { useSession } from '../auth/session.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { Sidebar } from './Sidebar.tsx'
import { TopBar } from './TopBar.tsx'

/**
 * The layout around every signed-in screen.
 *
 * @example
 * // used as the component of the router's layout route
 * createRoute({ getParentRoute: () => rootRoute, id: 'app', component: AppShell })
 */
export function AppShell(): ReactElement {
  const { user } = useSession()
  const [menuOpen, setMenuOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Stable callback, so the keyboard listener is registered once, not on every render.
  const toggleSearch = useCallback(() => setSearchOpen((open) => !open), [])
  useGlobalSearchShortcut(toggleSearch)

  if (user === null) return <Navigate to="/sign-in" replace />

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a href="#main" className="sr-only z-50 rounded-md bg-background p-2 focus:not-sr-only focus:fixed focus:left-2 focus:top-2">
        Skip to content
      </a>
      <Sidebar mobileOpen={menuOpen} onCloseMobile={() => setMenuOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setMenuOpen(true)} onOpenSearch={() => setSearchOpen(true)} />
        <main id="main" tabIndex={-1} className="flex-1 p-4 outline-none md:p-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  )
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
