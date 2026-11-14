/**
 * UTC calendar math for date buckets, done in JavaScript so it is identical on every engine.
 *
 * The database decides which bucket a row falls in (`date_trunc`, `strftime`, `DATE_FORMAT`); this
 * module decides which buckets *exist* in a range, so empty days still show as 0 instead of
 * vanishing from the line. Both sides use the same key: the bucket's first day, `YYYY-MM-DD`.
 * Weeks start on Monday (ISO 8601).
 *
 * @module
 */
import type { DateInterval } from './aggregate-contract.ts'

const DAY_MS = 86_400_000
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d{1,3})?Z$/

/** Supported years. Outside them `Date.UTC` maps 0001 to 1901, and 10000+ prints as `+010000-…`. */
const YEARS = { min: 1900, max: 9998 } as const

/**
 * Parse a `from`/`to` parameter: `YYYY-MM-DD` (UTC midnight) or a full UTC timestamp ending in
 * `Z`, in the years 1900–9998. Anything else (offsets, `2026-02-30`, `1e9`, `0001-01-01`) is
 * `undefined`.
 *
 * Why so strict: `new Date('2026-02-30')` silently rolls over to March, and `new Date('1')` is
 * the year 2001. A range parameter that means something else than it says is worse than a 422.
 * The year cap keeps every aligned boundary a plain 4-digit ISO string that all engines parse
 * (the fuzz test found `9999-12-31` + one month becoming `+010000-01-01`).
 *
 * @example
 * parseUtcDate('2026-11-14') // Date for 2026-11-14T00:00:00.000Z
 * parseUtcDate('2026-02-30') // undefined
 */
export function parseUtcDate(value: string): Date | undefined {
  const match = DATE_ONLY.exec(value) ?? DATE_TIME.exec(value)
  const year = Number(match?.[1])
  if (match === null || year < YEARS.min || year > YEARS.max) return undefined
  const date = new Date(value.length === 10 ? `${value}T00:00:00.000Z` : value)
  if (Number.isNaN(date.getTime())) return undefined
  // Round-trip the calendar part: rejects 2026-02-30 and 2026-13-01, which Date would "fix".
  return date.toISOString().slice(0, 10) === value.slice(0, 10) ? date : undefined
}

/**
 * The start of the bucket a moment falls in (UTC).
 *
 * @example
 * startOfBucket(new Date('2026-11-14T15:00:00Z'), 'week') // 2026-11-09 (a Monday)
 */
export function startOfBucket(date: Date, interval: DateInterval): Date {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  if (interval === 'day') return day
  if (interval === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
  // getUTCDay: Sunday = 0. Days since Monday: Monday 0 … Sunday 6.
  const sinceMonday = (day.getUTCDay() + 6) % 7
  return new Date(day.getTime() - sinceMonday * DAY_MS)
}

/**
 * Move by whole buckets (negative moves back). Months use calendar months, not 30 days.
 *
 * @example
 * addBuckets(new Date('2026-01-01T00:00:00Z'), 'month', 2) // 2026-03-01
 */
export function addBuckets(date: Date, interval: DateInterval, count: number): Date {
  if (interval === 'month') return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + count, date.getUTCDate()))
  return new Date(date.getTime() + count * (interval === 'week' ? 7 : 1) * DAY_MS)
}

/**
 * The first bucket boundary at or after a moment (so a range always covers whole buckets).
 *
 * @example
 * ceilToBucket(new Date('2026-11-14T10:00:00Z'), 'day') // 2026-11-15
 * ceilToBucket(new Date('2026-11-14T00:00:00Z'), 'day') // 2026-11-14 (already a boundary)
 */
export function ceilToBucket(date: Date, interval: DateInterval): Date {
  const start = startOfBucket(date, interval)
  return start.getTime() === date.getTime() ? start : addBuckets(start, interval, 1)
}

/**
 * How many buckets fit in `[from, to)`, both already aligned. Counting stops at `limit + 1`, so
 * a hostile range of 10,000 years costs nothing to refuse.
 *
 * @example
 * countBuckets(new Date('2026-01-01Z'), new Date('2027-01-01Z'), 'month', 400) // 12
 */
export function countBuckets(from: Date, to: Date, interval: DateInterval, limit: number): number {
  let count = 0
  for (let cursor = from; cursor < to && count <= limit; cursor = addBuckets(cursor, interval, 1)) count += 1
  return count
}

/**
 * Every bucket key in `[from, to)`: the keys the database produces for those buckets.
 *
 * @example
 * bucketKeys(new Date('2026-11-01Z'), new Date('2026-11-04Z'), 'day') // ['2026-11-01', '2026-11-02', '2026-11-03']
 */
export function bucketKeys(from: Date, to: Date, interval: DateInterval): string[] {
  const keys: string[] = []
  for (let cursor = from; cursor < to; cursor = addBuckets(cursor, interval, 1)) keys.push(dateKey(cursor))
  return keys
}

/**
 * The `YYYY-MM-DD` key of a UTC date.
 *
 * @example
 * dateKey(new Date('2026-11-14T23:59:59Z')) // '2026-11-14'
 */
export function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}
