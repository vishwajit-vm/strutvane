/**
 * The screen registry: every screen and state of the mockup, with its URL.
 *
 * One list feeds the "Screens" switcher, the command palette's navigation group and the smoke
 * tests (each entry renders in both themes), so adding a screen here makes it reachable and
 * tested in one step.
 */
import { FEATURED_INVOICE_ID } from '../data/invoices.ts'

export interface ScreenEntry {
  id: string
  label: string
  path: string
  group: 'Auth' | 'Overview' | 'Invoices' | 'Settings'
  /** The page's `<h1>`; the smoke test waits for it. */
  heading: string
}

export const SCREENS: readonly ScreenEntry[] = [
  { id: 'sign-in', label: 'Sign in', path: '/sign-in', group: 'Auth', heading: 'Sign in to Strutvane' },
  { id: 'forgot', label: 'Forgot password', path: '/forgot-password', group: 'Auth', heading: 'Reset your password' },
  { id: 'dashboard', label: 'Dashboard', path: '/', group: 'Overview', heading: 'Good morning, Maya' },
  { id: 'list', label: 'Invoice list', path: '/invoices', group: 'Invoices', heading: 'Invoices' },
  { id: 'list-empty', label: 'Invoice list · empty', path: '/invoices?state=empty', group: 'Invoices', heading: 'Invoices' },
  { id: 'list-loading', label: 'Invoice list · loading', path: '/invoices?state=loading', group: 'Invoices', heading: 'Invoices' },
  { id: 'board', label: 'Board view', path: '/invoices/board', group: 'Invoices', heading: 'Invoices' },
  { id: 'calendar', label: 'Calendar view', path: '/invoices/calendar', group: 'Invoices', heading: 'Invoices' },
  { id: 'create', label: 'New invoice', path: '/invoices/new', group: 'Invoices', heading: 'New invoice' },
  { id: 'edit', label: 'Edit invoice', path: `/invoices/${FEATURED_INVOICE_ID}/edit`, group: 'Invoices', heading: 'Edit INV-2264' },
  { id: 'detail', label: 'Invoice detail', path: `/invoices/${FEATURED_INVOICE_ID}`, group: 'Invoices', heading: 'INV-2264' },
  { id: 'profile', label: 'Profile', path: '/settings/profile', group: 'Settings', heading: 'Profile' },
  { id: 'security', label: 'Security & 2FA', path: '/settings/security', group: 'Settings', heading: 'Security' },
  { id: 'sessions', label: 'Sessions', path: '/settings/sessions', group: 'Settings', heading: 'Sessions' },
  { id: 'notifications', label: 'Notifications', path: '/settings/notifications', group: 'Settings', heading: 'Notifications' },
  { id: 'tokens', label: 'API tokens', path: '/settings/tokens', group: 'Settings', heading: 'API tokens' },
  { id: 'team', label: 'Team members', path: '/settings/team', group: 'Settings', heading: 'Team members' },
]
