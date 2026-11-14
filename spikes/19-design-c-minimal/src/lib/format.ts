/**
 * Formatting helpers shared by every screen, so numbers, money and dates look identical
 * everywhere (one locale, one rounding rule, one "today").
 */

/** Amounts are stored in minor units (cents) so arithmetic never meets floating-point drift. */
export type Currency = 'EUR' | 'USD' | 'GBP'

/**
 * The mockup's fixed "now". Every relative date ("in 3 days", "2h ago") is computed from it, so
 * screenshots and tests are stable no matter when they run.
 */
export const NOW = new Date('2026-11-14T09:30:00Z')

const moneyFormatters = new Map<string, Intl.NumberFormat>()

/**
 * Format minor units as money.
 *
 * @param compact - `€12.3K` style, for KPI cards and chart axes where space is tight.
 * @example formatMoney(1234500, 'EUR') // → '€12,345.00'
 */
export function formatMoney(minor: number, currency: Currency = 'EUR', compact = false): string {
  const key = `${currency}:${compact ? 'c' : 'f'}`
  let formatter = moneyFormatters.get(key)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency,
      // `$` rather than en-GB's `US$`: the currency code is shown wherever it is ambiguous.
      currencyDisplay: 'narrowSymbol',
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    })
    moneyFormatters.set(key, formatter)
  }
  // en-GB writes compact suffixes in lower case (`€18.5k`, `€1.8m`); finance reads `K` and `M`.
  const text = formatter.format(minor / 100)
  return compact ? text.replace(/[km]$/, (suffix) => suffix.toUpperCase()) : text
}

/** The symbol for a currency, used as the prefix of the currency input. */
export function currencySymbol(currency: Currency): string {
  return { EUR: '€', USD: '$', GBP: '£' }[currency]
}

const integer = new Intl.NumberFormat('en-GB')

/** Group thousands: `formatCount(23801)` → `23,801`. */
export function formatCount(value: number): string {
  return integer.format(value)
}

/** A signed delta with a real minus sign: `formatDelta(12.43)` → `+12.4%`. */
export function formatDelta(value: number, unit = '%'): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${sign}${Math.abs(value).toFixed(1)}${unit}`
}

const shortDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const timeOfDay = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })

/** `14 Nov 2026`: the one date format for tables and properties. */
export function formatDate(iso: string): string {
  return shortDate.format(new Date(iso))
}

/** `14 Nov`: for charts and dense lists where the year is obvious. */
export function formatDayMonth(iso: string): string {
  return dayMonth.format(new Date(iso))
}

/** `09:30`: 24-hour clock, used next to dates in activity logs. */
export function formatTime(iso: string): string {
  return timeOfDay.format(new Date(iso))
}

const DAY = 86_400_000

/** Whole calendar days from {@link NOW} to `iso` (negative means in the past). */
export function daysFromNow(iso: string): number {
  const startOfToday = Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth(), NOW.getUTCDate())
  const target = new Date(iso)
  const startOfTarget = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate())
  return Math.round((startOfTarget - startOfToday) / DAY)
}

/**
 * Short relative time for feeds: `just now`, `12m ago`, `3h ago`, `Yesterday`, `4d ago`, then
 * the plain date. Short forms keep feed rows on one line at 375 px.
 */
export function formatRelative(iso: string): string {
  const minutes = Math.round((NOW.getTime() - new Date(iso).getTime()) / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = -daysFromNow(iso)
  if (days <= 1) return 'Yesterday'
  if (days < 7) return `${days}d ago`
  return formatDayMonth(iso)
}

/** Due-date wording the way a finance team says it: `Due today`, `Due in 5 days`, `3 days overdue`. */
export function formatDue(iso: string): string {
  const days = daysFromNow(iso)
  if (days === 0) return 'Due today'
  if (days === 1) return 'Due tomorrow'
  if (days > 1) return `Due in ${days} days`
  return days === -1 ? '1 day overdue' : `${-days} days overdue`
}

/** `Maya Okafor` → `MO`; a single name gives one letter. */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : ''
  return `${first}${last}`.toUpperCase()
}

/** `1 invoice` / `3 invoices`: plural by count, never "invoice(s)". */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${formatCount(count)} ${count === 1 ? singular : pluralForm}`
}

/** File sizes the way people read them: `845 KB`, `2.4 MB`. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
