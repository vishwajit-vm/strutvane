/**
 * The app: providers plus a flat route table. Auth screens render on their own; everything else
 * renders inside the AppShell.
 *
 * @example <App initialTheme="dark" /> // tests force a theme; the real app reads the saved one
 */
import { lazy, type ReactNode, Suspense, useEffect } from 'react'
import { TooltipProvider } from './components/ui/menu.tsx'
import { ToastProvider } from './components/ui/toast.tsx'
import { matchPath, RouterProvider, useRouter } from './lib/router.tsx'
import { type ThemeMode, ThemeProvider } from './lib/theme.tsx'
import { ForgotPassword } from './screens/auth/ForgotPassword.tsx'
import { SignIn } from './screens/auth/SignIn.tsx'
import { NotFound } from './screens/NotFound.tsx'
import { ScreenErrorBoundary } from './screens/ScreenError.tsx'
import { AppShell } from './shell/AppShell.tsx'
import { OverlayProvider } from './shell/overlays.tsx'

// Screens load on demand, so signing in never downloads the chart library and each screen's code
// arrives only when it is opened. Auth screens stay eager: they are the first paint.
const loadDashboard = () => import('./screens/dashboard/Dashboard.tsx').then((module) => ({ default: module.Dashboard }))
const loadInvoiceList = () => import('./screens/invoices/InvoiceList.tsx').then((module) => ({ default: module.InvoiceList }))
const loadInvoiceForm = () => import('./screens/invoices/InvoiceForm.tsx').then((module) => ({ default: module.InvoiceForm }))
const loadInvoiceDetail = () => import('./screens/invoices/InvoiceDetail.tsx').then((module) => ({ default: module.InvoiceDetail }))
const loadBoardView = () => import('./screens/board/BoardView.tsx').then((module) => ({ default: module.BoardView }))
const loadCalendarView = () => import('./screens/calendar/CalendarView.tsx').then((module) => ({ default: module.CalendarView }))
const loadSettingsPage = () => import('./screens/settings/SettingsPage.tsx').then((module) => ({ default: module.SettingsPage }))
const Dashboard = lazy(loadDashboard)
const InvoiceList = lazy(loadInvoiceList)
const InvoiceForm = lazy(loadInvoiceForm)
const InvoiceDetail = lazy(loadInvoiceDetail)
const BoardView = lazy(loadBoardView)
const CalendarView = lazy(loadCalendarView)
const SettingsPage = lazy(loadSettingsPage)

/**
 * Load every lazy screen now. Tests call it once before rendering: the FIRST import of a screen
 * (the dashboard pulls in Recharts) is compiled on demand by Vite, and on a busy machine that took
 * longer than a `findBy…` wait, so a test failed for reasons that had nothing to do with the UI.
 * An app could also call it on idle, to make the first click on each screen instant.
 */
export function preloadScreens(): Promise<unknown> {
  return Promise.all([loadDashboard(), loadInvoiceList(), loadInvoiceForm(), loadInvoiceDetail(), loadBoardView(), loadCalendarView(), loadSettingsPage()])
}

/** Shown for the few milliseconds a screen's code is loading: a quiet bar, not a spinner. */
function ScreenFallback() {
  return (
    <div className="px-8 py-6" aria-busy="true" aria-label="Loading">
      <span className="block h-3 w-32 animate-shimmer rounded-sm bg-muted" />
      <span className="mt-4 block h-6 w-56 animate-shimmer rounded-sm bg-muted" />
    </div>
  )
}

interface Route {
  pattern: string
  title: string
  render: (params: Record<string, string>) => ReactNode
}

/** Order matters: fixed paths (`/invoices/new`, `/invoices/board`) come before `/invoices/:id`. */
const ROUTES: readonly Route[] = [
  { pattern: '/', title: 'Dashboard', render: () => <Dashboard /> },
  { pattern: '/invoices', title: 'Invoices', render: () => <InvoiceList /> },
  { pattern: '/invoices/new', title: 'New invoice', render: () => <InvoiceForm /> },
  { pattern: '/invoices/board', title: 'Board', render: () => <BoardView /> },
  { pattern: '/invoices/calendar', title: 'Calendar', render: () => <CalendarView /> },
  { pattern: '/invoices/:id/edit', title: 'Edit invoice', render: (params) => <InvoiceForm id={params['id'] ?? ''} /> },
  { pattern: '/invoices/:id', title: 'Invoice', render: (params) => <InvoiceDetail id={params['id'] ?? ''} /> },
  { pattern: '/settings/:section', title: 'Settings', render: (params) => <SettingsPage section={params['section'] ?? 'profile'} /> },
]

function Screen() {
  const { pathname } = useRouter()
  const auth = pathname === '/sign-in' ? <SignIn /> : pathname === '/forgot-password' ? <ForgotPassword /> : null
  const match = ROUTES.map((route) => ({ route, params: matchPath(route.pattern, pathname) })).find((candidate) => candidate.params !== null)

  useEffect(() => {
    const title = auth !== null ? (pathname === '/sign-in' ? 'Sign in' : 'Reset password') : (match?.route.title ?? 'Not found')
    document.title = `${title} · Strutvane`
  }, [auth, match, pathname])

  if (auth !== null) return auth
  return (
    <AppShell>
      <ScreenErrorBoundary key={pathname}>
        <Suspense fallback={<ScreenFallback />}>{match === undefined ? <NotFound /> : match.route.render(match.params ?? {})}</Suspense>
      </ScreenErrorBoundary>
    </AppShell>
  )
}

export function App({ initialTheme }: { initialTheme?: ThemeMode }) {
  return (
    <ThemeProvider {...(initialTheme !== undefined ? { initialMode: initialTheme } : {})}>
      <RouterProvider>
        <TooltipProvider delayDuration={400} skipDelayDuration={200}>
          <ToastProvider>
            <OverlayProvider>
              <Screen />
            </OverlayProvider>
          </ToastProvider>
        </TooltipProvider>
      </RouterProvider>
    </ThemeProvider>
  )
}
