/**
 * Routes and app-wide providers.
 *
 * `Providers` is separate from the router so tests can mount any screen with a MemoryRouter:
 *
 * @example
 *   render(<Providers><MemoryRouter initialEntries={['/invoices']}><AppRoutes /></MemoryRouter></Providers>)
 */
import type { ReactNode } from 'react'
import { Route, Routes } from 'react-router'
import { ConfirmProvider } from './components/ui/confirm.tsx'
import { TooltipProvider } from './components/ui/misc.tsx'
import { Toaster } from './components/ui/toast.tsx'
import { ThemeProvider, type ThemeChoice } from './lib/theme.tsx'
import { ForgotPasswordPage } from './screens/auth/ForgotPasswordPage.tsx'
import { SignInPage } from './screens/auth/SignInPage.tsx'
import { BoardPage } from './screens/board/BoardPage.tsx'
import { CalendarPage } from './screens/calendar/CalendarPage.tsx'
import { DashboardPage } from './screens/dashboard/DashboardPage.tsx'
import { InvoiceDetailPage } from './screens/invoices/detail/InvoiceDetailPage.tsx'
import { InvoiceFormPage } from './screens/invoices/form/InvoiceFormPage.tsx'
import { InvoiceListPage } from './screens/invoices/list/InvoiceListPage.tsx'
import { NotFoundPage } from './screens/NotFoundPage.tsx'
import { OverlaysPage } from './screens/overlays/OverlaysPage.tsx'
import { SettingsPage } from './screens/settings/SettingsPage.tsx'
import { TeamPage } from './screens/team/TeamPage.tsx'
import { AppShell } from './shell/AppShell.tsx'
import { ShellProvider } from './shell/shell-state.tsx'

export function Providers({ children, theme }: { children: ReactNode; theme?: ThemeChoice }) {
  return (
    <ThemeProvider {...(theme !== undefined ? { initial: theme } : {})}>
      <TooltipProvider>
        <Toaster>
          <ConfirmProvider>
            <ShellProvider>{children}</ShellProvider>
          </ConfirmProvider>
        </Toaster>
      </TooltipProvider>
    </ThemeProvider>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="invoices" element={<InvoiceListPage />} />
        <Route path="invoices/new" element={<InvoiceFormPage />} />
        <Route path="invoices/:id" element={<InvoiceDetailPage />} />
        <Route path="invoices/:id/edit" element={<InvoiceFormPage />} />
        <Route path="settings/:section" element={<SettingsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="board" element={<BoardPage />} />
        <Route path="calendar" element={<CalendarPage />} />
        <Route path="overlays" element={<OverlaysPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  )
}
