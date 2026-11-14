/**
 * Mock data for the smaller screens: notifications, the deals board, calendar events, and the
 * account settings (sessions, API tokens, notification preferences).
 */
import { TODAY } from '../lib/format.ts'

// ── Notifications ──────────────────────────────────────────────────────────

export interface AppNotification {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly minutesAgo: number
  readonly unread: boolean
  readonly tone: 'success' | 'warning' | 'info' | 'danger'
}

export const NOTIFICATIONS: readonly AppNotification[] = [
  { id: 'n1', title: 'Payment received', body: 'Larkspur Analytics paid INV-2026-1127 ($18,420.00).', minutesAgo: 6, unread: true, tone: 'success' },
  { id: 'n2', title: '3 invoices are overdue', body: 'Kestrel Aviation, Atlas Kitchens and Juniper Legal LLP.', minutesAgo: 75, unread: true, tone: 'danger' },
  { id: 'n3', title: 'Daniel mentioned you', body: '“@Maya can you approve the Q4 credit note?”', minutesAgo: 140, unread: true, tone: 'info' },
  { id: 'n4', title: 'Export ready', body: 'Your October revenue report (CSV, 2.1 MB) is ready.', minutesAgo: 60 * 20, unread: false, tone: 'info' },
  { id: 'n5', title: 'Card expires soon', body: 'The workspace card ending 4242 expires in 30 days.', minutesAgo: 60 * 48, unread: false, tone: 'warning' },
]

// ── Deals board (kanban) ───────────────────────────────────────────────────

export type DealStage = 'lead' | 'qualified' | 'proposal' | 'negotiation' | 'won'

export interface Deal {
  readonly id: string
  readonly title: string
  readonly company: string
  readonly value: number
  readonly owner: string
  readonly stage: DealStage
  readonly dueInDays: number
  readonly priority: 'high' | 'medium' | 'low'
  readonly comments: number
  readonly attachments: number
}

export const STAGES: readonly { readonly id: DealStage; readonly label: string }[] = [
  { id: 'lead', label: 'Lead' },
  { id: 'qualified', label: 'Qualified' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'negotiation', label: 'Negotiation' },
  { id: 'won', label: 'Won' },
]

export const DEALS: readonly Deal[] = [
  { id: 'd1', title: 'Fleet tracking rollout', company: 'Northgate Freight', value: 48_000, owner: 'Lukas Becker', stage: 'lead', dueInDays: 21, priority: 'medium', comments: 2, attachments: 0 },
  { id: 'd2', title: 'Clinic scheduling suite', company: 'Fernwood Dental Group', value: 16_500, owner: 'Amara Nwosu', stage: 'lead', dueInDays: 30, priority: 'low', comments: 0, attachments: 1 },
  { id: 'd3', title: 'POS integration', company: 'Quarry & Pine', value: 9_800, owner: 'Lukas Becker', stage: 'lead', dueInDays: 12, priority: 'medium', comments: 1, attachments: 0 },
  { id: 'd4', title: 'Multi-site licence', company: 'Brightwell Schools', value: 32_400, owner: 'Amara Nwosu', stage: 'qualified', dueInDays: 9, priority: 'high', comments: 5, attachments: 2 },
  { id: 'd5', title: 'Data warehouse sync', company: 'Larkspur Analytics', value: 21_000, owner: 'Daniel Reyes', stage: 'qualified', dueInDays: 14, priority: 'medium', comments: 3, attachments: 1 },
  { id: 'd6', title: 'Maintenance contract', company: 'Solace Robotics', value: 27_750, owner: 'Lukas Becker', stage: 'proposal', dueInDays: 5, priority: 'high', comments: 7, attachments: 3 },
  { id: 'd7', title: 'Brand portal', company: 'Copperleaf Studio', value: 6_200, owner: 'Amara Nwosu', stage: 'proposal', dueInDays: 18, priority: 'low', comments: 1, attachments: 4 },
  { id: 'd8', title: 'Energy reporting add-on', company: 'Tidewater Energy', value: 54_900, owner: 'Daniel Reyes', stage: 'negotiation', dueInDays: 3, priority: 'high', comments: 11, attachments: 2 },
  { id: 'd9', title: 'Booking engine renewal', company: 'Saffron Hospitality', value: 18_300, owner: 'Lukas Becker', stage: 'negotiation', dueInDays: 7, priority: 'medium', comments: 4, attachments: 1 },
  { id: 'd10', title: 'Hangar inventory', company: 'Kestrel Aviation', value: 41_200, owner: 'Amara Nwosu', stage: 'won', dueInDays: 0, priority: 'medium', comments: 6, attachments: 5 },
  { id: 'd11', title: 'Case management', company: 'Juniper Legal LLP', value: 23_600, owner: 'Daniel Reyes', stage: 'won', dueInDays: 0, priority: 'low', comments: 2, attachments: 1 },
]

// ── Calendar ───────────────────────────────────────────────────────────────

export interface CalendarEvent {
  readonly id: string
  readonly title: string
  readonly date: Date
  /** "09:30" or null for all-day. */
  readonly time: string | null
  readonly kind: 'due' | 'meeting' | 'reminder' | 'payroll'
}

function onDay(day: number): Date {
  return new Date(TODAY.getFullYear(), TODAY.getMonth(), day)
}

export const EVENTS: readonly CalendarEvent[] = [
  { id: 'e1', title: 'Month-end close', date: onDay(3), time: null, kind: 'payroll' },
  { id: 'e2', title: 'Larkspur QBR', date: onDay(4), time: '10:00', kind: 'meeting' },
  { id: 'e3', title: 'INV-1088 due', date: onDay(6), time: null, kind: 'due' },
  { id: 'e4', title: 'Tax filing prep', date: onDay(10), time: '14:00', kind: 'reminder' },
  { id: 'e5', title: 'Pipeline review', date: onDay(11), time: '09:30', kind: 'meeting' },
  { id: 'e6', title: 'INV-1119 due', date: onDay(13), time: null, kind: 'due' },
  { id: 'e7', title: 'Payroll run', date: onDay(14), time: null, kind: 'payroll' },
  { id: 'e8', title: 'Audit walkthrough', date: onDay(14), time: '15:00', kind: 'meeting' },
  { id: 'e9', title: 'INV-1126 due', date: onDay(17), time: null, kind: 'due' },
  { id: 'e10', title: 'Send reminders', date: onDay(18), time: '08:00', kind: 'reminder' },
  { id: 'e11', title: 'Tidewater negotiation', date: onDay(19), time: '11:00', kind: 'meeting' },
  { id: 'e12', title: 'Budget planning 2027', date: onDay(21), time: '13:00', kind: 'meeting' },
  { id: 'e13', title: 'INV-1131 due', date: onDay(24), time: null, kind: 'due' },
  { id: 'e14', title: 'Board pack due', date: onDay(26), time: null, kind: 'reminder' },
  { id: 'e15', title: 'Payroll run', date: onDay(28), time: null, kind: 'payroll' },
  { id: 'e16', title: 'INV-1134 due', date: onDay(28), time: null, kind: 'due' },
]

// ── Account settings ───────────────────────────────────────────────────────

export interface Session {
  readonly id: string
  readonly device: string
  readonly browser: string
  readonly location: string
  readonly lastActive: string
  readonly current: boolean
  readonly kind: 'laptop' | 'mobile' | 'desktop'
}

export const SESSIONS: readonly Session[] = [
  { id: 's1', device: 'MacBook Pro', browser: 'Chrome 142', location: 'Lisbon, Portugal', lastActive: 'Active now', current: true, kind: 'laptop' },
  { id: 's2', device: 'iPhone 17', browser: 'Safari', location: 'Lisbon, Portugal', lastActive: '2 hours ago', current: false, kind: 'mobile' },
  { id: 's3', device: 'Windows workstation', browser: 'Edge 142', location: 'Porto, Portugal', lastActive: '3 days ago', current: false, kind: 'desktop' },
  { id: 's4', device: 'Pixel 10', browser: 'Chrome', location: 'Madrid, Spain', lastActive: '12 days ago', current: false, kind: 'mobile' },
]

export interface ApiToken {
  readonly id: string
  readonly name: string
  /** Only the last characters are ever shown after creation. */
  readonly suffix: string
  readonly scopes: readonly string[]
  readonly lastUsed: string
  readonly expires: string
}

export const API_TOKENS: readonly ApiToken[] = [
  { id: 't1', name: 'Accounting sync', suffix: 'a91f', scopes: ['invoices:read', 'customers:read'], lastUsed: '4 minutes ago', expires: 'Feb 1, 2027' },
  { id: 't2', name: 'Zapier automation', suffix: '07cd', scopes: ['invoices:write'], lastUsed: 'yesterday', expires: 'Never' },
  { id: 't3', name: 'BI dashboard (read-only)', suffix: '5be2', scopes: ['reports:read'], lastUsed: '18 days ago', expires: 'Dec 31, 2026' },
]

export interface NotificationPreference {
  readonly id: string
  readonly label: string
  readonly description: string
  readonly email: boolean
  readonly inApp: boolean
}

export const NOTIFICATION_PREFERENCES: readonly NotificationPreference[] = [
  { id: 'payments', label: 'Payments', description: 'A customer pays or a payment fails.', email: true, inApp: true },
  { id: 'overdue', label: 'Overdue invoices', description: 'Daily digest of invoices past their due date.', email: true, inApp: true },
  { id: 'mentions', label: 'Mentions and comments', description: 'Someone mentions you or replies to your comment.', email: false, inApp: true },
  { id: 'team', label: 'Team changes', description: 'Members join, leave or change role.', email: false, inApp: true },
  { id: 'security', label: 'Security alerts', description: 'New sign-ins and changes to 2FA. Always on.', email: true, inApp: true },
]
