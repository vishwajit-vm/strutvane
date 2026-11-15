/**
 * AppShell: sidebar on the canvas, content in an inset surface panel with its own scroll.
 *
 * Why an inset panel: the 8 px canvas margin and the panel's hairline frame give the whole app a
 * precise, "instrument-like" outline, and keeping the scroll inside the panel means the sidebar
 * and top bar never move. Below 1024 px the panel goes full-bleed and the sidebar becomes a drawer.
 *
 * On every navigation the panel scrolls to the top and focus moves to `<main>`, so keyboard and
 * screen-reader users start reading the new page instead of staying on the old link.
 */
import { Dialog, VisuallyHidden } from 'radix-ui'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from '../lib/router.tsx'
import { CommandPalette } from './CommandPalette.tsx'
import { useOverlays } from './overlays.tsx'
import { ShortcutsDialog } from './ShortcutsDialog.tsx'
import { useGlobalShortcuts } from './shortcuts.ts'
import { Sidebar } from './Sidebar.tsx'
import { Topbar } from './Topbar.tsx'

export function AppShell({ children }: { children: ReactNode }) {
  const { pathname, navigate } = useRouter()
  const { setPaletteOpen, setShortcutsOpen } = useOverlays()
  const [navOpen, setNavOpen] = useState(false)
  const main = useRef<HTMLElement>(null)
  const firstRender = useRef(true)

  // Stable handlers: inline lambdas re-installed the global key listener on every shell render,
  // which also dropped a pending "g" of a G-sequence.
  const openPalette = useCallback(() => setPaletteOpen(true), [setPaletteOpen])
  const openShortcuts = useCallback(() => setShortcutsOpen(true), [setShortcutsOpen])
  useGlobalShortcuts({ openPalette, openShortcuts, navigate })

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    main.current?.scrollTo?.({ top: 0 })
    main.current?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <div className="flex min-h-dvh bg-bg lg:h-dvh">
      <a
        href="#main"
        className="sr-only z-[70] rounded-md bg-surface px-3 py-2 text-sm font-medium text-fg shadow-pop focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>
      <aside aria-label="Sidebar" className="hidden w-sidebar shrink-0 lg:block">
        <Sidebar />
      </aside>
      <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in lg:hidden" />
          <Dialog.Content aria-describedby={undefined} className="fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r border-border bg-bg shadow-pop animate-fade-in outline-none lg:hidden">
            <VisuallyHidden.Root>
              <Dialog.Title>Navigation</Dialog.Title>
            </VisuallyHidden.Root>
            <Sidebar onNavigate={() => setNavOpen(false)} />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex min-h-0 flex-1 flex-col bg-surface lg:overflow-hidden lg:rounded-lg lg:border lg:border-border lg:shadow-xs">
          <Topbar onOpenNav={() => setNavOpen(true)} />
          <main ref={main} id="main" tabIndex={-1} className="scroll-quiet min-h-0 flex-1 outline-none lg:overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
      <CommandPalette />
      <ShortcutsDialog />
    </div>
  )
}

/** Standard page padding and width. `wide` pages (lists, boards) use the full panel width. */
export function PageContainer({ children, width = 'default', className = '' }: { children: ReactNode; width?: 'default' | 'narrow' | 'wide'; className?: string }) {
  const max = width === 'wide' ? 'max-w-none' : width === 'narrow' ? 'max-w-[960px]' : 'max-w-[1320px]'
  return <div className={`mx-auto w-full ${max} px-4 py-5 sm:px-6 lg:px-8 lg:py-6 ${className}`}>{children}</div>
}
