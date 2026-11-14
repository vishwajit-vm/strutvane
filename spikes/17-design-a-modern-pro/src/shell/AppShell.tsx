/**
 * `<AppShell>`: the frame around every inner page.
 *
 * - Desktop (≥1024px): a docked sidebar (260px, or a 76px icon rail; the choice is remembered)
 *   and a content column with the sticky top bar.
 * - Below 1024px: the sidebar becomes a left drawer opened from the top bar's menu button.
 * - Content is capped at 1440px and centred, with 16/24/32px side gutters by breakpoint, and
 *   `min-w-0` everywhere so wide tables scroll inside their card, never the page.
 *
 * @example
 * <AppShell><DashboardPage /></AppShell>
 */
import { useState, type ReactElement, type ReactNode } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../components/ui/dialog.tsx'
import { cn } from '../lib/cn.ts'
import { readPreference, writePreference } from '../lib/storage.ts'
import { DESKTOP_QUERY, useMediaQuery } from '../lib/use-media-query.ts'
import { Sidebar } from './Sidebar.tsx'
import { Topbar } from './Topbar.tsx'

const SIDEBAR_KEY = 'strutvane.design-a.sidebar'

export function AppShell({ children }: { readonly children: ReactNode }): ReactElement {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [collapsed, setCollapsed] = useState(() => readPreference(SIDEBAR_KEY) === 'collapsed')
  const [drawerOpen, setDrawerOpen] = useState(false)

  const toggleCollapsed = (): void => {
    setCollapsed((value) => {
      writePreference(SIDEBAR_KEY, value ? 'expanded' : 'collapsed')
      return !value
    })
  }

  return (
    <div className="min-h-dvh bg-background">
      <a href="#main" className="sr-only z-50 rounded-md bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        Skip to content
      </a>
      <aside
        aria-label="Sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-40 hidden border-r border-border/70 shadow-sm transition-[width] duration-200 lg:block dark:border-border',
          collapsed ? 'w-19' : 'w-65',
        )}
      >
        {isDesktop ? <Sidebar collapsed={collapsed} onToggleCollapsed={toggleCollapsed} /> : null}
      </aside>
      <Sheet open={drawerOpen && !isDesktop} onOpenChange={setDrawerOpen}>
        <SheetContent side="left" showClose={false} className="p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">Main menu</SheetDescription>
          <Sidebar onNavigate={() => setDrawerOpen(false)} />
        </SheetContent>
      </Sheet>
      <div className={cn('flex min-h-dvh min-w-0 flex-col transition-[padding] duration-200', collapsed ? 'lg:pl-19' : 'lg:pl-65')}>
        <Topbar onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main" tabIndex={-1} className="mx-auto w-full min-w-0 max-w-[90rem] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8 lg:py-8">
          {children}
        </main>
        <footer className="mx-auto flex w-full max-w-[90rem] flex-col gap-1 px-4 pb-6 text-xs text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <span>© 2026 Halyard Systems · Powered by Strutvane</span>
          <span>Design direction A · Modern Pro (mockup)</span>
        </footer>
      </div>
    </div>
  )
}
