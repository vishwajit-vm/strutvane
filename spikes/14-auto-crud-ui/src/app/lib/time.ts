/**
 * Human time: "3 hours ago", "in 2 days", with the exact time kept for tooltips.
 *
 * @module
 */

const UNITS: readonly (readonly [unit: Intl.RelativeTimeFormatUnit, seconds: number])[] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/**
 * Format an instant relative to now, in the user's language ("3 hours ago", "yesterday").
 * Under a minute it says "just now" (Intl's "now").
 *
 * @example
 * formatRelative('2026-11-14T06:00:00Z', new Date('2026-11-14T09:00:00Z')) // '3 hours ago'
 */
export function formatRelative(iso: string, now: Date = new Date(), locale?: string): string {
  const time = Date.parse(iso)
  if (Number.isNaN(time)) return iso
  const seconds = Math.round((time - now.getTime()) / 1000)
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit)
  }
  return format.format(0, 'second')
}
