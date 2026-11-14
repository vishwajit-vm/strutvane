/**
 * The signed-in layout: mesh backdrop, floating sidebar, floating top bar, and the page.
 *
 * Spacing: the sidebar and top bar are inset by `--chrome-gap` (12 px), and the page content
 * aligns with the top bar's inner edge, so every left edge on screen lines up.
 */
import { Outlet } from 'react-router'
import { CommandPalette } from './CommandPalette.tsx'
import { MobileNav, Sidebar } from './Sidebar.tsx'
import { useShell } from './shell-state.tsx'
import { TopBar } from './TopBar.tsx'
import { cn } from '../lib/cn.ts'

/** The fixed mesh gradient behind everything (see `.app-backdrop` in app.css). */
export function Backdrop() {
  return <div className="app-backdrop" aria-hidden />
}

export function AppShell() {
  const { collapsed } = useShell()
  return (
    <>
      <a
        href="#main"
        className="glass-overlay fixed top-3 left-3 z-(--z-toast) -translate-y-20 rounded-md px-4 py-2 text-base font-semibold text-fg focus-visible:translate-y-0"
      >
        Skip to content
      </a>
      <Backdrop />
      <Sidebar />
      <MobileNav />
      <div
        className={cn(
          'min-h-dvh px-(--chrome-gap) pt-(--chrome-gap) transition-base',
          collapsed ? 'lg:pl-[calc(var(--sidebar-width-collapsed)+var(--chrome-gap)*2)]' : 'lg:pl-[calc(var(--sidebar-width)+var(--chrome-gap)*2)]',
        )}
      >
        <div className="mx-auto max-w-(--content-max)">
          <TopBar />
          <main id="main" tabIndex={-1} className="px-1 pt-7 pb-16 outline-none sm:px-3 lg:pt-8">
            <Outlet />
          </main>
        </div>
      </div>
      <CommandPalette />
    </>
  )
}
