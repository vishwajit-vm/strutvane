/**
 * Mock numbers for the dashboard: KPI cards with 12-point sparklines, a 12-month revenue series
 * against last year, best-selling plans and a recent-activity feed.
 *
 * @module
 */
import type { Tone } from './people.ts'

/** One KPI card. `good` says whether the change is good news (a fall in overdue is good). */
export interface Kpi {
  readonly id: string
  readonly label: string
  readonly value: string
  readonly change: number
  readonly good: boolean
  readonly caption: string
  readonly tone: Tone
  readonly icon: 'revenue' | 'invoices' | 'customers' | 'overdue'
  readonly series: readonly number[]
}

export const kpis: readonly Kpi[] = [
  { id: 'revenue', label: 'Revenue', value: '$248,640', change: 12.4, good: true, caption: 'vs. last month', tone: 'primary', icon: 'revenue', series: [18, 22, 19, 26, 24, 29, 27, 33, 31, 36, 34, 41] },
  { id: 'invoices', label: 'Invoices sent', value: '1,284', change: 8.1, good: true, caption: 'vs. last month', tone: 'info', icon: 'invoices', series: [40, 38, 45, 42, 47, 51, 49, 55, 53, 58, 60, 62] },
  { id: 'customers', label: 'Active customers', value: '3,942', change: 3.6, good: true, caption: '146 new this month', tone: 'success', icon: 'customers', series: [30, 31, 31, 33, 34, 34, 36, 37, 37, 38, 39, 40] },
  { id: 'overdue', label: 'Overdue balance', value: '$18,215', change: -4.3, good: true, caption: '23 invoices past due', tone: 'warning', icon: 'overdue', series: [26, 28, 25, 27, 24, 25, 22, 23, 21, 22, 20, 19] },
]

/** Monthly revenue in USD, this year vs last year (Dec 2025 → Nov 2026). */
export interface RevenuePoint {
  readonly month: string
  readonly thisYear: number
  readonly lastYear: number
}

export const revenue: readonly RevenuePoint[] = [
  { month: 'Dec', thisYear: 152_400, lastYear: 131_200 },
  { month: 'Jan', thisYear: 148_900, lastYear: 126_800 },
  { month: 'Feb', thisYear: 161_300, lastYear: 134_500 },
  { month: 'Mar', thisYear: 174_800, lastYear: 141_900 },
  { month: 'Apr', thisYear: 169_200, lastYear: 145_300 },
  { month: 'May', thisYear: 186_500, lastYear: 152_100 },
  { month: 'Jun', thisYear: 192_700, lastYear: 149_800 },
  { month: 'Jul', thisYear: 188_100, lastYear: 158_400 },
  { month: 'Aug', thisYear: 205_600, lastYear: 163_900 },
  { month: 'Sep', thisYear: 219_300, lastYear: 171_200 },
  { month: 'Oct', thisYear: 221_200, lastYear: 176_500 },
  { month: 'Nov', thisYear: 248_640, lastYear: 184_300 },
]

/** Best-selling plans and services this month. */
export interface TopItem {
  readonly name: string
  readonly category: string
  readonly revenue: number
  readonly units: number
  /** Share of this month's revenue, 0–100. */
  readonly share: number
  readonly tone: Tone
}

export const topItems: readonly TopItem[] = [
  { name: 'Enterprise plan', category: 'Subscription', revenue: 96_000, units: 20, share: 39, tone: 'primary' },
  { name: 'Growth plan', category: 'Subscription', revenue: 64_500, units: 50, share: 26, tone: 'info' },
  { name: 'Onboarding workshop', category: 'Services', revenue: 38_400, units: 16, share: 15, tone: 'success' },
  { name: 'Data migration', category: 'Services', revenue: 25_600, units: 8, share: 10, tone: 'warning' },
  { name: 'Priority support', category: 'Add-on', revenue: 16_100, units: 14, share: 7, tone: 'danger' },
]

/** A timeline entry (dashboard feed, invoice activity, profile). */
export interface ActivityItem {
  readonly id: string
  readonly actor: string
  readonly action: string
  readonly target: string
  readonly minutesAgo: number
  readonly tone: Tone
  readonly detail?: string
}

export const recentActivity: readonly ActivityItem[] = [
  { id: 'a1', actor: 'Diego Ramírez', action: 'recorded a payment on', target: 'INV-1058', minutesAgo: 8, tone: 'success', detail: '$4,250.00 by bank transfer from Lumen Freight' },
  { id: 'a2', actor: 'Stripe webhook', action: 'marked as failed', target: 'INV-1049', minutesAgo: 42, tone: 'danger', detail: 'Card declined: insufficient funds. Automatic retry scheduled in 3 days.' },
  { id: 'a3', actor: 'Priya Natarajan', action: 'invited', target: 'Liam O’Connell', minutesAgo: 95, tone: 'info' },
  { id: 'a4', actor: 'Amara Lindqvist', action: 'sent 12 reminders for', target: 'overdue invoices', minutesAgo: 230, tone: 'warning' },
  { id: 'a5', actor: 'Tomasz Wiśniewski', action: 'created', target: 'INV-1064', minutesAgo: 1_380, tone: 'primary', detail: 'Enterprise plan renewal for Tidewater Energy' },
]
