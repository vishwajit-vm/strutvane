/**
 * Mock data for the top-bar notifications and the account settings tabs (sessions, API tokens,
 * notification preferences).
 *
 * @module
 */
import type { Tone } from './people.ts'

export interface Notification {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly minutesAgo: number
  readonly tone: Tone
  readonly kind: 'payment' | 'failed' | 'member' | 'report' | 'security'
  readonly unread: boolean
}

export const notifications: readonly Notification[] = [
  { id: 'n1', title: 'Payment received', body: 'Lumen Freight paid $4,250.00 on INV-1058.', minutesAgo: 8, tone: 'success', kind: 'payment', unread: true },
  { id: 'n2', title: 'Card payment failed', body: 'INV-1049 for Marlow Foods was declined.', minutesAgo: 42, tone: 'danger', kind: 'failed', unread: true },
  { id: 'n3', title: 'New team member', body: 'Priya invited Liam O’Connell as Editor.', minutesAgo: 95, tone: 'info', kind: 'member', unread: true },
  { id: 'n4', title: 'Monthly report is ready', body: 'October revenue report: $221.2K, up 9%.', minutesAgo: 1_500, tone: 'primary', kind: 'report', unread: false },
  { id: 'n5', title: 'New sign-in', body: 'Chrome on Windows · Copenhagen, DK.', minutesAgo: 2_900, tone: 'warning', kind: 'security', unread: false },
]

export interface Session {
  readonly id: string
  readonly device: 'desktop' | 'phone' | 'tablet'
  readonly browser: string
  readonly os: string
  readonly location: string
  /** Shown partly masked: a full IP is personal data and not needed to recognise a session. */
  readonly ip: string
  readonly lastActive: string
  readonly current: boolean
}

export const sessions: readonly Session[] = [
  { id: 's1', device: 'desktop', browser: 'Chrome 142', os: 'Windows 11', location: 'Copenhagen, Denmark', ip: '85.191.xxx.xxx', lastActive: 'Active now', current: true },
  { id: 's2', device: 'phone', browser: 'Safari', os: 'iOS 26', location: 'Copenhagen, Denmark', ip: '85.191.xxx.xxx', lastActive: '2 hours ago', current: false },
  { id: 's3', device: 'tablet', browser: 'Safari', os: 'iPadOS 26', location: 'Malmö, Sweden', ip: '213.89.xxx.xxx', lastActive: '3 days ago', current: false },
  { id: 's4', device: 'desktop', browser: 'Firefox 145', os: 'macOS 26', location: 'Berlin, Germany', ip: '91.64.xxx.xxx', lastActive: '12 days ago', current: false },
]

export interface ApiToken {
  readonly id: string
  readonly name: string
  /** Only the non-secret prefix is ever shown after creation. */
  readonly prefix: string
  readonly scopes: readonly string[]
  readonly created: string
  readonly lastUsed: string
  readonly expires: string
}

export const apiTokens: readonly ApiToken[] = [
  { id: 't1', name: 'Accounting sync (Xero)', prefix: 'sv_test_4f1c', scopes: ['invoices:read', 'payments:read'], created: 'Sep 2, 2026', lastUsed: '5 min ago', expires: 'Mar 2, 2027' },
  { id: 't2', name: 'Data warehouse export', prefix: 'sv_test_9a07', scopes: ['invoices:read', 'customers:read', 'reports:read'], created: 'Jul 18, 2026', lastUsed: '1 day ago', expires: 'Never' },
  { id: 't3', name: 'CI smoke tests', prefix: 'sv_test_c3d2', scopes: ['invoices:write'], created: 'Oct 30, 2026', lastUsed: 'Never', expires: 'Nov 30, 2026' },
]

/** One row of the notification preference matrix. */
export interface NotificationPreference {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly email: boolean
  readonly browser: boolean
  readonly app: boolean
}

export const notificationPreferences: readonly NotificationPreference[] = [
  { id: 'payments', label: 'Payments received', description: 'When a customer pays an invoice in full or in part.', email: true, browser: true, app: true },
  { id: 'failures', label: 'Failed payments', description: 'Card declines, bounced debits and disputes.', email: true, browser: true, app: true },
  { id: 'overdue', label: 'Overdue invoices', description: 'A daily digest of invoices that passed their due date.', email: true, browser: false, app: true },
  { id: 'team', label: 'Team changes', description: 'Invites accepted, roles changed, members removed.', email: false, browser: true, app: false },
  { id: 'security', label: 'Security alerts', description: 'New sign-ins and changes to 2FA. Always on by email.', email: true, browser: true, app: true },
  { id: 'product', label: 'Product updates', description: 'New features and changelog highlights, monthly.', email: false, browser: false, app: false },
]
