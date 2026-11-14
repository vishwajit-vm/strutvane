/**
 * Formatting helpers shared by every screen, so money, dates and counts look identical everywhere.
 * The mockup's "today" is fixed ({@link TODAY}) so relative dates and the calendar are stable.
 *
 * @module
 */

/** The mockup's fixed "now": 14 Nov 2026, 10:30 local time. */
export const TODAY = new Date(2026, 10, 14, 10, 30)

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
const compactMoney = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 })
const integer = new Intl.NumberFormat('en-US')
const shortDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const dayMonth = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' })

/** `$12,480.00` */
export const formatMoney = (amount: number): string => money.format(amount)

/** `$12.5K` (KPI cards and chart axes) */
export const formatCompactMoney = (amount: number): string => compactMoney.format(amount)

/** `1,284` */
export const formatInteger = (value: number): string => integer.format(value)

/** `Nov 14, 2026` */
export const formatDate = (date: Date): string => shortDate.format(date)

/** `Nov 14` */
export const formatDayMonth = (date: Date): string => dayMonth.format(date)

/** `+12.4%` / `−3.1%` with a real minus sign. */
export function formatPercentChange(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}%`
}

/**
 * "5 min ago", "3 h ago", "2 d ago", or a date for anything older than a week.
 *
 * @example
 * formatRelative(new Date(TODAY.getTime() - 3_600_000)) // '1 h ago'
 */
export function formatRelative(date: Date, now: Date = TODAY): string {
  const minutes = Math.round((now.getTime() - date.getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} d ago`
  return formatDate(date)
}

/** Whole days from `now` to `date` (negative when in the past). */
export function daysUntil(date: Date, now: Date = TODAY): number {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const end = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  return Math.round((end - start) / 86_400_000)
}

/** `YYYY-MM-DD` for `<input type="date">`, in local time. */
export function toDateInput(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Initials for avatars: "Maya Okafor" → "MO", "Northwind" → "NO". */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/)
  const first = words[0] ?? ''
  const last = words.length > 1 ? (words.at(-1) ?? '') : first.slice(1)
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

/** "1 invoice" / "3 invoices" */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${formatInteger(count)} ${count === 1 ? noun : pluralNoun}`
}
