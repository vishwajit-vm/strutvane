/**
 * Mock dashboard numbers: KPIs with sparklines, a 12-month revenue series, the status breakdown
 * (derived from the real mock invoices, so the donut and the list agree), top items and activity.
 */
import { CATALOGUE, INVOICES, INVOICE_STATUSES, STATUS_LABEL, type InvoiceStatus } from './invoices.ts'
import { TEAM } from './people.ts'

export interface Kpi {
  readonly id: string
  readonly label: string
  readonly value: number
  readonly format: 'money' | 'number' | 'days'
  /** Change versus the previous period, as a ratio (0.12 = +12%). */
  readonly delta: number
  /** True when a rising number is good (revenue) and false when it is bad (overdue). */
  readonly upIsGood: boolean
  readonly series: readonly number[]
  readonly hint: string
}

export const KPIS: readonly Kpi[] = [
  { id: 'revenue', label: 'Revenue (MTD)', value: 184_250, format: 'money', delta: 0.124, upIsGood: true, series: [42, 48, 45, 53, 51, 60, 58, 66, 71, 69, 78, 84], hint: 'vs. October' },
  { id: 'outstanding', label: 'Outstanding', value: 62_480, format: 'money', delta: -0.068, upIsGood: false, series: [70, 72, 69, 74, 71, 68, 66, 67, 64, 65, 63, 62], hint: '23 open invoices' },
  { id: 'new-customers', label: 'New customers', value: 37, format: 'number', delta: 0.21, upIsGood: true, series: [18, 22, 19, 25, 24, 27, 26, 29, 31, 30, 34, 37], hint: 'this month' },
  { id: 'dso', label: 'Avg. days to pay', value: 18.4, format: 'days', delta: 0.035, upIsGood: false, series: [16, 17, 16.5, 17.2, 17, 17.8, 17.5, 18.1, 17.9, 18.3, 18.2, 18.4], hint: 'goal: under 21 days' },
]

export interface RevenuePoint {
  readonly month: string
  readonly revenue: number
  readonly collected: number
}

export const REVENUE_SERIES: readonly RevenuePoint[] = [
  { month: 'Dec', revenue: 118_000, collected: 104_000 },
  { month: 'Jan', revenue: 109_500, collected: 98_200 },
  { month: 'Feb', revenue: 126_300, collected: 111_900 },
  { month: 'Mar', revenue: 141_800, collected: 127_400 },
  { month: 'Apr', revenue: 133_200, collected: 125_100 },
  { month: 'May', revenue: 152_700, collected: 139_800 },
  { month: 'Jun', revenue: 149_100, collected: 141_300 },
  { month: 'Jul', revenue: 161_900, collected: 147_600 },
  { month: 'Aug', revenue: 158_400, collected: 150_200 },
  { month: 'Sep', revenue: 172_600, collected: 158_900 },
  { month: 'Oct', revenue: 163_900, collected: 155_700 },
  { month: 'Nov', revenue: 184_250, collected: 161_800 },
]

export interface StatusSlice {
  readonly status: InvoiceStatus
  readonly label: string
  readonly count: number
}

/** Invoices per status, counted from the mock list (void is folded out of the donut). */
export const STATUS_BREAKDOWN: readonly StatusSlice[] = INVOICE_STATUSES.filter((status) => status !== 'void').map((status) => ({
  status,
  label: STATUS_LABEL[status],
  count: INVOICES.filter((invoice) => invoice.status === status).length,
}))

export interface TopItem {
  readonly name: string
  readonly revenue: number
  readonly units: number
}

/** Revenue per catalogue item across all invoices, highest first. */
export const TOP_ITEMS: readonly TopItem[] = CATALOGUE.map((product) => {
  let revenue = 0
  let units = 0
  for (const invoice of INVOICES) {
    for (const item of invoice.items) {
      if (item.description !== product.name) continue
      revenue += item.quantity * item.unitPrice
      units += product.price < 1 ? 1 : item.quantity
    }
  }
  return { name: product.name, revenue: Math.round(revenue), units }
})
  .sort((a, b) => b.revenue - a.revenue)
  .slice(0, 5)

export type ActivityKind = 'payment' | 'invoice' | 'comment' | 'member' | 'reminder'

export interface Activity {
  readonly id: string
  readonly kind: ActivityKind
  readonly actor: string
  readonly text: string
  readonly target: string
  readonly minutesAgo: number
}

export const ACTIVITY: readonly Activity[] = [
  { id: 'a1', kind: 'payment', actor: 'Larkspur Analytics', text: 'paid', target: 'INV-2026-1127 · $18,420.00', minutesAgo: 6 },
  { id: 'a2', kind: 'invoice', actor: TEAM[2]?.name ?? 'Priya', text: 'sent', target: 'INV-2026-1126 to Meridian Health Labs', minutesAgo: 42 },
  { id: 'a3', kind: 'comment', actor: TEAM[1]?.name ?? 'Daniel', text: 'commented on', target: 'INV-2026-1119: “PO number confirmed by Tom.”', minutesAgo: 95 },
  { id: 'a4', kind: 'reminder', actor: 'Automation', text: 'sent a 7-day reminder for', target: 'INV-2026-1088 (Kestrel Aviation)', minutesAgo: 180 },
  { id: 'a5', kind: 'member', actor: TEAM[0]?.name ?? 'Maya', text: 'invited', target: 'Sofia Marino as Viewer', minutesAgo: 60 * 26 },
  { id: 'a6', kind: 'payment', actor: 'Copperleaf Studio', text: 'paid', target: 'INV-2026-1101 · $4,812.60', minutesAgo: 60 * 30 },
]
