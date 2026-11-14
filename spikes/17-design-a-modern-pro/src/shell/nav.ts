/**
 * Sidebar navigation: sections with headings, icon items, nested groups and count badges.
 *
 * `match` decides when an item is active; it defaults to "the path starts with `to`" so detail
 * and edit pages keep their list item highlighted.
 *
 * @module
 */
import {
  IconCalendarMonth,
  IconComponents,
  IconFileInvoice,
  IconLayoutKanban,
  IconLock,
  IconSmartHome,
  IconUserCircle,
  IconUsersGroup,
  type Icon,
} from '@tabler/icons-react'
import { invoices } from '../data/invoices.ts'

export interface NavLeaf {
  readonly label: string
  readonly to: string
  /** Paths that also activate this item (exact match or prefix with `*`). */
  readonly match?: readonly string[]
}

export interface NavItem {
  readonly label: string
  readonly icon: Icon
  /** A leaf item navigates; a group item has `children` and expands. */
  readonly to?: string
  readonly match?: readonly string[]
  readonly children?: readonly NavLeaf[]
  readonly badge?: { readonly text: string; readonly tone: 'primary' | 'danger' | 'success' }
}

export interface NavSection {
  readonly heading?: string
  readonly items: readonly NavItem[]
}

const overdue = invoices.filter((invoice) => invoice.status === 'overdue').length

export const NAV: readonly NavSection[] = [
  {
    items: [{ label: 'Dashboard', icon: IconSmartHome, to: '/dashboard', match: ['/dashboard', '/'] }],
  },
  {
    heading: 'Billing',
    items: [
      {
        label: 'Invoices',
        icon: IconFileInvoice,
        badge: { text: String(overdue), tone: 'danger' },
        children: [
          { label: 'All invoices', to: '/invoices', match: ['/invoices', '/invoices/INV-*'] },
          { label: 'Create invoice', to: '/invoices/new' },
        ],
      },
      { label: 'Board', icon: IconLayoutKanban, to: '/invoices/board' },
      { label: 'Calendar', icon: IconCalendarMonth, to: '/invoices/calendar' },
    ],
  },
  {
    heading: 'Workspace',
    items: [
      { label: 'Team', icon: IconUsersGroup, to: '/team', badge: { text: '2 new', tone: 'success' } },
      {
        label: 'Account',
        icon: IconUserCircle,
        children: [
          { label: 'Profile', to: '/profile' },
          { label: 'Settings', to: '/settings/profile', match: ['/settings/profile', '/settings/notifications'] },
          { label: 'Security', to: '/settings/security', match: ['/settings/security', '/settings/sessions'] },
          { label: 'API tokens', to: '/settings/api-tokens' },
        ],
      },
    ],
  },
  {
    heading: 'Design system',
    items: [
      { label: 'Overlays & feedback', icon: IconComponents, to: '/kit' },
      {
        label: 'Auth pages',
        icon: IconLock,
        children: [
          { label: 'Sign in', to: '/sign-in' },
          { label: 'Forgot password', to: '/forgot-password' },
        ],
      },
    ],
  },
]

/**
 * Whether `pathname` activates a nav entry. Patterns ending in `*` match by prefix.
 *
 * @example
 * isActive('/invoices/INV-1042/edit', { to: '/invoices', match: ['/invoices', '/invoices/INV-*'] }) // true
 */
export function isActive(pathname: string, entry: { readonly to?: string; readonly match?: readonly string[] }): boolean {
  const patterns = entry.match ?? (entry.to === undefined ? [] : [entry.to])
  return patterns.some((pattern) => (pattern.endsWith('*') ? pathname.startsWith(pattern.slice(0, -1)) : pathname === pattern))
}
