/**
 * The app's navigation model, used by the sidebar, the command palette and the Screens switcher.
 *
 * Why one list: a screen added here appears in all three places, so they never disagree.
 */
import {
  IconCalendar,
  IconFileInvoice,
  IconLayoutDashboard,
  IconLayoutKanban,
  IconSettings,
  IconStack2,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import { INVOICES } from '../data/invoices.ts'

export interface NavItem {
  readonly label: string
  readonly to: string
  readonly icon: Icon
  /** A count shown as a pill (e.g. open invoices). */
  readonly badge?: number
  /** Match only the exact path (the dashboard is "/", which prefixes everything). */
  readonly end?: boolean
}

export interface NavGroup {
  readonly label: string
  readonly items: readonly NavItem[]
}

const openInvoices = INVOICES.filter((invoice) => invoice.status === 'pending' || invoice.status === 'overdue').length

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', to: '/', icon: IconLayoutDashboard, end: true }] },
  {
    label: 'Billing',
    items: [
      { label: 'Invoices', to: '/invoices', icon: IconFileInvoice, badge: openInvoices },
      { label: 'Deals board', to: '/board', icon: IconLayoutKanban },
      { label: 'Calendar', to: '/calendar', icon: IconCalendar },
    ],
  },
  {
    label: 'Workspace',
    items: [
      { label: 'Team members', to: '/team', icon: IconUsers },
      { label: 'Settings', to: '/settings/profile', icon: IconSettings },
    ],
  },
  { label: 'Design kit', items: [{ label: 'Overlays & feedback', to: '/overlays', icon: IconStack2 }] },
]

export interface ScreenLink {
  readonly label: string
  readonly to: string
  readonly group: 'Auth' | 'App' | 'Invoices' | 'Account' | 'Views' | 'Overlays'
}

/** Every screen and notable state, for the Screens switcher (the reviewer's map of the mockup). */
export const SCREENS: readonly ScreenLink[] = [
  { group: 'Auth', label: 'Sign in', to: '/sign-in' },
  { group: 'Auth', label: 'Forgot password', to: '/forgot-password' },
  { group: 'App', label: 'Dashboard', to: '/' },
  { group: 'Invoices', label: 'Invoice list', to: '/invoices' },
  { group: 'Invoices', label: 'List: empty state', to: '/invoices?state=empty' },
  { group: 'Invoices', label: 'List: loading skeleton', to: '/invoices?state=loading' },
  { group: 'Invoices', label: 'Create invoice', to: '/invoices/new' },
  { group: 'Invoices', label: 'Edit invoice', to: `/invoices/${INVOICES[2]?.id ?? '1044'}/edit` },
  { group: 'Invoices', label: 'Invoice detail', to: `/invoices/${INVOICES[2]?.id ?? '1044'}` },
  { group: 'Account', label: 'Profile', to: '/settings/profile' },
  { group: 'Account', label: 'Security & 2FA', to: '/settings/security' },
  { group: 'Account', label: 'Sessions', to: '/settings/sessions' },
  { group: 'Account', label: 'Notifications', to: '/settings/notifications' },
  { group: 'Account', label: 'API tokens', to: '/settings/api-tokens' },
  { group: 'Account', label: 'Team members', to: '/team' },
  { group: 'Views', label: 'Kanban board', to: '/board' },
  { group: 'Views', label: 'Calendar', to: '/calendar' },
  { group: 'Overlays', label: 'Palette, dialogs, toasts, drawer', to: '/overlays' },
]
