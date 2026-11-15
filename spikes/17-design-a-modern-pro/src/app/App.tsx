/**
 * `<App>`: providers + route table. Each route renders one screen; inner screens are wrapped in
 * the {@link AppShell}, auth screens are "bare" with the floating Screens switcher.
 *
 * @example
 * createRoot(element).render(<App />)
 */
import type { ReactElement } from 'react'
import { TooltipProvider } from '../components/ui/misc.tsx'
import { Toaster } from '../components/ui/toast.tsx'
import { matchPath, useLocation } from '../lib/router.tsx'
import { ThemeProvider, type ThemeChoice } from '../lib/theme.tsx'
import { ProfilePage } from '../screens/account/ProfilePage.tsx'
import { SettingsPage, type SettingsTab } from '../screens/account/SettingsPage.tsx'
import { TeamPage } from '../screens/account/TeamPage.tsx'
import { ForgotPasswordPage } from '../screens/auth/ForgotPasswordPage.tsx'
import { SignInPage } from '../screens/auth/SignInPage.tsx'
import { DashboardPage } from '../screens/dashboard/DashboardPage.tsx'
import { InvoiceDetailPage } from '../screens/invoices/InvoiceDetailPage.tsx'
import { InvoiceFormPage } from '../screens/invoices/InvoiceFormPage.tsx'
import { InvoiceListPage, type ListState } from '../screens/invoices/InvoiceListPage.tsx'
import { NotFoundPage } from '../screens/kit/NotFoundPage.tsx'
import { ScreenErrorBoundary } from '../screens/kit/ScreenError.tsx'
import { OverlaysPage } from '../screens/kit/OverlaysPage.tsx'
import { BoardPage } from '../screens/views/BoardPage.tsx'
import { CalendarPage } from '../screens/views/CalendarPage.tsx'
import { AppShell } from '../shell/AppShell.tsx'
import { CommandPaletteProvider } from '../shell/CommandPalette.tsx'
import { ScreenSwitcher } from '../shell/ScreenSwitcher.tsx'

interface Route {
  readonly pattern: string
  readonly bare?: boolean
  readonly render: (params: Record<string, string>, search: URLSearchParams) => ReactElement
}

const SETTINGS_TABS: readonly SettingsTab[] = ['profile', 'security', 'sessions', 'notifications', 'api-tokens']
const isSettingsTab = (value: string | undefined): value is SettingsTab => SETTINGS_TABS.some((tab) => tab === value)

const listState = (value: string | null): ListState => (value === 'empty' || value === 'loading' ? value : 'ready')

/** Order matters: static segments (`/invoices/new`) before `:id`. */
const ROUTES: readonly Route[] = [
  { pattern: '/sign-in', bare: true, render: () => <SignInPage /> },
  { pattern: '/forgot-password', bare: true, render: () => <ForgotPasswordPage /> },
  { pattern: '/', render: () => <DashboardPage /> },
  { pattern: '/dashboard', render: () => <DashboardPage /> },
  { pattern: '/invoices', render: (_params, search) => <InvoiceListPage state={listState(search.get('state'))} /> },
  { pattern: '/invoices/new', render: () => <InvoiceFormPage /> },
  { pattern: '/invoices/board', render: () => <BoardPage /> },
  { pattern: '/invoices/calendar', render: () => <CalendarPage /> },
  { pattern: '/invoices/:id/edit', render: ({ id }) => <InvoiceFormPage invoiceId={id ?? ''} /> },
  { pattern: '/invoices/:id', render: ({ id }) => <InvoiceDetailPage invoiceId={id ?? ''} /> },
  { pattern: '/profile', render: () => <ProfilePage /> },
  { pattern: '/settings/:tab', render: ({ tab }) => <SettingsPage tab={isSettingsTab(tab) ? tab : 'profile'} /> },
  { pattern: '/team', render: (_params, search) => <TeamPage inviteOpen={search.get('invite') === '1'} /> },
  { pattern: '/kit', render: () => <OverlaysPage /> },
]

function Routes(): ReactElement {
  const { pathname, search } = useLocation()
  for (const route of ROUTES) {
    const params = matchPath(route.pattern, pathname)
    if (params === null) continue
    // Keyed by PATH so each screen starts with fresh state (scroll, selection, form values). Not by
    // the query: the invoice list keeps its state in the query, and remounting on every keystroke
    // of its search box would drop focus and selection.
    const screen = (
      <div key={pathname}>
        <ScreenErrorBoundary>{route.render(params, search)}</ScreenErrorBoundary>
      </div>
    )
    return route.bare === true ? (
      <>
        {screen}
        <ScreenSwitcher floating />
      </>
    ) : (
      <AppShell>{screen}</AppShell>
    )
  }
  return (
    <AppShell>
      <NotFoundPage />
    </AppShell>
  )
}

/** Props of {@link App}; `theme` forces a theme (tests). */
export function App({ theme }: { readonly theme?: ThemeChoice }): ReactElement {
  return (
    <ThemeProvider {...(theme === undefined ? {} : { initial: theme })}>
      <TooltipProvider delayDuration={300}>
        <CommandPaletteProvider>
          <Routes />
          <Toaster />
        </CommandPaletteProvider>
      </TooltipProvider>
    </ThemeProvider>
  )
}
