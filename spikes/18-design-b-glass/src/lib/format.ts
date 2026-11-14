/**
 * Formatting helpers. One `Intl` formatter per kind, created once (they are costly to build).
 *
 * The mock lives at a fixed "today" ({@link TODAY}) so relative dates read the same on every run,
 * in screenshots and in tests.
 */

/** The mock's "now": 14 Nov 2026, 10:30 local time. */
export const TODAY = new Date(2026, 10, 14, 10, 30)

const currencyFormatters = new Map<string, Intl.NumberFormat>()

/**
 * Format money with the currency's own decimals.
 * @example formatMoney(1234.5, 'USD') // "$1,234.50"
 * @example formatMoney(1234567, 'USD', true) // "$1.2M"
 */
export function formatMoney(amount: number, currency = 'USD', compact = false): string {
  const key = `${currency}:${String(compact)}`
  let formatter = currencyFormatters.get(key)
  if (formatter === undefined) {
    formatter = new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {}),
    })
    currencyFormatters.set(key, formatter)
  }
  return formatter.format(amount)
}

const numberFormat = new Intl.NumberFormat('en-US')
/** @example formatNumber(12840) // "12,840" */
export function formatNumber(value: number): string {
  return numberFormat.format(value)
}

const percentFormat = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1, signDisplay: 'exceptZero' })
/** @example formatDelta(0.124) // "+12.4%" */
export function formatDelta(ratio: number): string {
  return percentFormat.format(ratio)
}

const dateFormat = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' })
const shortDateFormat = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short' })
const timeFormat = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

/** @example formatDate(new Date(2026, 10, 2)) // "Nov 2, 2026" */
export function formatDate(date: Date): string {
  return dateFormat.format(date)
}
/** @example formatShortDate(new Date(2026, 10, 2)) // "Nov 2" */
export function formatShortDate(date: Date): string {
  return shortDateFormat.format(date)
}
/** @example formatTime(new Date(2026, 10, 2, 9, 5)) // "9:05 AM" */
export function formatTime(date: Date): string {
  return timeFormat.format(date)
}

/** "2026-11-14" for `<input type="date">` values. */
export function toDateInput(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

const relativeFormat = new Intl.RelativeTimeFormat('en-US', { numeric: 'auto' })

/**
 * "3 minutes ago", "yesterday", "in 4 days", relative to {@link TODAY}.
 * @example formatRelative(new Date(2026, 10, 13, 10, 30)) // "yesterday"
 */
export function formatRelative(date: Date, now: Date = TODAY): string {
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 60) return 'just now'
  if (abs < 3600) return relativeFormat.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relativeFormat.format(Math.round(seconds / 3600), 'hour')
  if (abs < 86_400 * 30) return relativeFormat.format(Math.round(seconds / 86_400), 'day')
  return formatDate(date)
}

/** @example formatBytes(1_536_000) // "1.5 MB" */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Two-letter initials for avatars. @example initials('Maya Okafor') // "MO" */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ''
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : ''
  return (first + last).toUpperCase()
}

/** @example plural(3, 'invoice') // "3 invoices" */
export function plural(count: number, word: string, pluralWord = `${word}s`): string {
  return `${formatNumber(count)} ${count === 1 ? word : pluralWord}`
}
