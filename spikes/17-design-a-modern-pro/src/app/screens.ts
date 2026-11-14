/**
 * The list of mockup screens: what the "Screens" switcher and the command palette offer, and what
 * the smoke tests render. One list, so a new screen cannot be reachable from one place but not
 * from another (and cannot escape the tests).
 *
 * @module
 */
import { featuredInvoice } from '../data/invoices.ts'

export interface ScreenEntry {
  readonly id: string
  readonly label: string
  readonly group: 'Auth' | 'Overview' | 'Invoices' | 'Account' | 'Views' | 'Components'
  readonly path: string
  /** Rendered without the app shell (sign-in, forgot password). */
  readonly bare?: boolean
}

export const SCREENS: readonly ScreenEntry[] = [
  { id: 'sign-in', label: 'Sign in', group: 'Auth', path: '/sign-in', bare: true },
  { id: 'forgot-password', label: 'Forgot password', group: 'Auth', path: '/forgot-password', bare: true },
  { id: 'dashboard', label: 'Dashboard', group: 'Overview', path: '/dashboard' },
  { id: 'invoices', label: 'Invoice list', group: 'Invoices', path: '/invoices' },
  { id: 'invoices-empty', label: 'Invoice list · empty', group: 'Invoices', path: '/invoices?state=empty' },
  { id: 'invoices-loading', label: 'Invoice list · loading', group: 'Invoices', path: '/invoices?state=loading' },
  { id: 'invoice-new', label: 'Create invoice', group: 'Invoices', path: '/invoices/new' },
  { id: 'invoice-edit', label: 'Edit invoice', group: 'Invoices', path: `/invoices/${featuredInvoice.id}/edit` },
  { id: 'invoice-detail', label: 'Invoice detail', group: 'Invoices', path: `/invoices/${featuredInvoice.id}` },
  { id: 'board', label: 'Kanban board', group: 'Views', path: '/invoices/board' },
  { id: 'calendar', label: 'Calendar', group: 'Views', path: '/invoices/calendar' },
  { id: 'profile', label: 'User profile', group: 'Account', path: '/profile' },
  { id: 'settings', label: 'Account settings', group: 'Account', path: '/settings/profile' },
  { id: 'security', label: 'Security & 2FA', group: 'Account', path: '/settings/security' },
  { id: 'sessions', label: 'Sessions', group: 'Account', path: '/settings/sessions' },
  { id: 'notification-settings', label: 'Notification settings', group: 'Account', path: '/settings/notifications' },
  { id: 'api-tokens', label: 'API tokens', group: 'Account', path: '/settings/api-tokens' },
  { id: 'team', label: 'Team members', group: 'Account', path: '/team' },
  { id: 'kit', label: 'Overlays & feedback', group: 'Components', path: '/kit' },
]

/** Screens grouped in display order. */
export function screensByGroup(): readonly (readonly [ScreenEntry['group'], readonly ScreenEntry[]])[] {
  const order: readonly ScreenEntry['group'][] = ['Auth', 'Overview', 'Invoices', 'Views', 'Account', 'Components']
  return order.map((group) => [group, SCREENS.filter((screen) => screen.group === group)] as const)
}
