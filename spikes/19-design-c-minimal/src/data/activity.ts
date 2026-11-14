/**
 * Activity, notifications, revenue history, sessions and API tokens: the smaller mock datasets.
 * Timestamps are fixed relative to `NOW` (14 Nov 2026, 09:30 UTC).
 */
import { type Member, members } from './people.ts'

const [maya, daniel, priya, tomas, aiko, jonas] = members

export type ActivityKind = 'paid' | 'sent' | 'created' | 'commented' | 'reminder' | 'overdue' | 'member' | 'edited'

export interface ActivityItem {
  id: string
  kind: ActivityKind
  /** The person who did it; `null` for system events (e.g. a payment arriving). */
  actor: Member | null
  /** Plain sentence with the subject wrapped in `**…**` for emphasis. */
  text: string
  at: string
  /** Optional link target for the subject. */
  href?: string
}

export const workspaceActivity: readonly ActivityItem[] = [
  { id: 'a1', kind: 'paid', actor: null, text: 'Payment of €9,870.00 received for **INV-2261**', at: '2026-11-14T09:12:00Z', href: '/invoices/inv-2261' },
  { id: 'a2', kind: 'sent', actor: daniel ?? maya, text: 'sent **INV-2277** to Kestrel Analytics', at: '2026-11-14T08:47:00Z', href: '/invoices/inv-2277' },
  { id: 'a3', kind: 'commented', actor: priya ?? maya, text: 'commented on **INV-2259**: “PO number confirmed, OK to send.”', at: '2026-11-14T07:30:00Z', href: '/invoices/inv-2259' },
  { id: 'a4', kind: 'overdue', actor: null, text: '**INV-2231** is now 3 days overdue', at: '2026-11-14T06:00:00Z', href: '/invoices/inv-2231' },
  { id: 'a5', kind: 'created', actor: tomas ?? maya, text: 'created draft **INV-2278** for Lumen Robotics', at: '2026-11-13T17:05:00Z', href: '/invoices/inv-2278' },
  { id: 'a6', kind: 'member', actor: maya, text: 'invited **Lucas Moreau** as Member', at: '2026-11-13T15:20:00Z', href: '/settings/team' },
  { id: 'a7', kind: 'reminder', actor: aiko ?? maya, text: 'sent a payment reminder for **INV-2219**', at: '2026-11-13T10:41:00Z', href: '/invoices/inv-2219' },
  { id: 'a8', kind: 'edited', actor: jonas ?? maya, text: 'changed terms on **INV-2270** to Net 60', at: '2026-11-12T13:15:00Z', href: '/invoices/inv-2270' },
]

/** The featured invoice's own history, oldest last (newest first on screen). */
export const invoiceActivity: readonly ActivityItem[] = [
  { id: 'i1', kind: 'commented', actor: priya ?? maya, text: 'commented: “Halcyon confirmed the PO, payment run is on the 18th.”', at: '2026-11-13T16:02:00Z' },
  { id: 'i2', kind: 'reminder', actor: null, text: 'Automatic reminder sent to **ap@halcyonfreight.example**', at: '2026-11-10T08:00:00Z' },
  { id: 'i3', kind: 'edited', actor: daniel ?? maya, text: 'added line item **Premium support**', at: '2026-10-22T09:14:00Z' },
  { id: 'i4', kind: 'sent', actor: daniel ?? maya, text: 'sent the invoice to **Ines Marquez**', at: '2026-10-21T10:06:00Z' },
  { id: 'i5', kind: 'created', actor: daniel ?? maya, text: 'created the invoice from **Q4 renewal** template', at: '2026-10-21T09:58:00Z' },
]

export interface Notification {
  id: string
  actor: Member | null
  title: string
  body: string
  at: string
  unread: boolean
  href: string
}

export const notifications: readonly Notification[] = [
  { id: 'n1', actor: null, title: 'Payment received', body: 'INV-2261 was paid in full (€9,870.00).', at: '2026-11-14T09:12:00Z', unread: true, href: '/invoices/inv-2261' },
  { id: 'n2', actor: priya ?? maya, title: 'Priya mentioned you', body: '“@Maya can you approve the credit note on INV-2259?”', at: '2026-11-14T07:31:00Z', unread: true, href: '/invoices/inv-2259' },
  { id: 'n3', actor: null, title: '3 invoices became overdue', body: 'Total outstanding €14,930.00 across 3 customers.', at: '2026-11-14T06:00:00Z', unread: true, href: '/invoices?status=overdue' },
  { id: 'n4', actor: tomas ?? maya, title: 'Month-end close checklist', body: 'Tomás assigned you “Reconcile October payouts”.', at: '2026-11-13T15:48:00Z', unread: false, href: '/invoices/board' },
  { id: 'n5', actor: null, title: 'New sign-in', body: 'Firefox on macOS, Lisbon, Portugal.', at: '2026-11-12T19:22:00Z', unread: false, href: '/settings/sessions' },
]

/** Monthly revenue in whole euros, Dec 2025 → Nov 2026 (current) and the year before. */
export const revenueByMonth: readonly { month: string; current: number; previous: number }[] = [
  { month: 'Dec', current: 312_400, previous: 268_100 },
  { month: 'Jan', current: 284_900, previous: 251_300 },
  { month: 'Feb', current: 301_200, previous: 259_800 },
  { month: 'Mar', current: 338_700, previous: 284_600 },
  { month: 'Apr', current: 352_100, previous: 291_200 },
  { month: 'May', current: 347_800, previous: 305_400 },
  { month: 'Jun', current: 371_500, previous: 312_900 },
  { month: 'Jul', current: 359_200, previous: 318_700 },
  { month: 'Aug', current: 366_900, previous: 309_500 },
  { month: 'Sep', current: 402_300, previous: 331_800 },
  { month: 'Oct', current: 429_600, previous: 352_400 },
  { month: 'Nov', current: 482_900, previous: 371_100 },
]

export interface Session {
  id: string
  device: string
  browser: string
  location: string
  ip: string
  lastActiveAt: string
  current: boolean
  kind: 'laptop' | 'phone' | 'tablet'
}

export const sessions: readonly Session[] = [
  { id: 's1', device: 'MacBook Pro', browser: 'Chrome 142', location: 'Amsterdam, Netherlands', ip: '203.0.113.24', lastActiveAt: '2026-11-14T09:28:00Z', current: true, kind: 'laptop' },
  { id: 's2', device: 'iPhone 17', browser: 'Safari', location: 'Amsterdam, Netherlands', ip: '203.0.113.88', lastActiveAt: '2026-11-14T07:02:00Z', current: false, kind: 'phone' },
  { id: 's3', device: 'Windows desktop', browser: 'Edge 142', location: 'Rotterdam, Netherlands', ip: '198.51.100.7', lastActiveAt: '2026-11-11T16:45:00Z', current: false, kind: 'laptop' },
  { id: 's4', device: 'iPad Air', browser: 'Safari', location: 'Lisbon, Portugal', ip: '192.0.2.150', lastActiveAt: '2026-11-02T21:10:00Z', current: false, kind: 'tablet' },
]

export type TokenScope = 'invoices:read' | 'invoices:write' | 'customers:read' | 'webhooks'

export interface ApiToken {
  id: string
  name: string
  /** Only the non-secret prefix is ever shown after creation. */
  prefix: string
  scopes: TokenScope[]
  createdAt: string
  lastUsedAt: string | null
  expiresAt: string | null
}

export const apiTokens: readonly ApiToken[] = [
  { id: 't1', name: 'ERP sync (production)', prefix: 'sv_live_7Hq2', scopes: ['invoices:read', 'invoices:write', 'customers:read'], createdAt: '2026-03-02T10:00:00Z', lastUsedAt: '2026-11-14T09:01:00Z', expiresAt: null },
  { id: 't2', name: 'BI warehouse export', prefix: 'sv_live_c9Lm', scopes: ['invoices:read', 'customers:read'], createdAt: '2026-06-18T12:30:00Z', lastUsedAt: '2026-11-14T02:00:00Z', expiresAt: '2027-06-18T12:30:00Z' },
  { id: 't3', name: 'Zapier (Daniel)', prefix: 'sv_live_Wk04', scopes: ['webhooks'], createdAt: '2026-09-09T08:15:00Z', lastUsedAt: null, expiresAt: '2026-12-09T08:15:00Z' },
]

export interface InvoiceFile {
  id: string
  name: string
  size: number
  kind: 'pdf' | 'image' | 'sheet'
  uploadedBy: Member
  at: string
}

export const invoiceFiles: readonly InvoiceFile[] = [
  { id: 'f1', name: 'INV-2264.pdf', size: 184_320, kind: 'pdf', uploadedBy: daniel ?? maya, at: '2026-10-21T10:05:00Z' },
  { id: 'f2', name: 'Halcyon-PO-88213.pdf', size: 402_112, kind: 'pdf', uploadedBy: priya ?? maya, at: '2026-10-20T14:40:00Z' },
  { id: 'f3', name: 'Signed-SOW-2026.pdf', size: 1_288_490, kind: 'pdf', uploadedBy: maya, at: '2026-10-18T11:12:00Z' },
  { id: 'f4', name: 'Usage-report-Q3.xlsx', size: 96_870, kind: 'sheet', uploadedBy: aiko ?? maya, at: '2026-10-17T09:00:00Z' },
]
