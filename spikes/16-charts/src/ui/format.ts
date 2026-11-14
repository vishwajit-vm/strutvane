/**
 * Turning aggregate keys and numbers into words people read: axis ticks, tooltips, the data
 * table, and the one-sentence summary screen readers hear.
 *
 * All formatting goes through `Intl` with an explicit locale, so tests are stable and the product
 * can pass the user's locale. Calendar buckets are formatted **in UTC**: the key `2026-11-01` is a
 * UTC day, and formatting it in a browser at UTC−5 would print "Oct 31".
 *
 * @module
 */
import { OTHER_GROUP_KEY, TOTAL_GROUP_KEY, type DateInterval, type GroupKind } from '../shared/aggregate-contract.ts'
import type { ValueFormat } from '../shared/widgets.ts'

/** Group key for NULL categories (mirrors the server's `NONE_KEY`). */
const NONE_KEY = '__none__'

/**
 * How to label group keys for one result.
 *
 * @example
 * const labeler: KeyLabeler = createKeyLabeler({ kind: 'date', interval: 'month', locale: 'en-GB' })
 * labeler('2026-11-01') // 'Nov 2026'
 */
export type KeyLabeler = (key: string) => string

/**
 * Options for {@link createKeyLabeler}.
 *
 * @example
 * const options: KeyLabelOptions = { kind: 'relation', relationLabels: { '1': 'Acme Ltd' } }
 */
export interface KeyLabelOptions {
  readonly kind: GroupKind
  readonly interval?: DateInterval | null
  readonly locale?: string
  /** Enum option → label (defaults to a humanised option: `in_review` → "In review"). */
  readonly optionLabels?: Readonly<Record<string, string>>
  /** Related id → title, resolved through the related resource's list endpoint. */
  readonly relationLabels?: Readonly<Record<string, string>>
}

/**
 * Build a key labeler for one result.
 *
 * @example
 * createKeyLabeler({ kind: 'category' })('true') // 'Yes'
 * createKeyLabeler({ kind: 'relation' })('__other__') // 'Other'
 */
export function createKeyLabeler(options: KeyLabelOptions): KeyLabeler {
  const locale = options.locale ?? 'en-GB'
  return (key) => {
    if (key === OTHER_GROUP_KEY) return 'Other'
    if (key === NONE_KEY) return 'None'
    if (key === TOTAL_GROUP_KEY) return 'Total'
    if (options.kind === 'date') return formatBucket(key, options.interval ?? 'day', locale)
    if (options.kind === 'relation') return options.relationLabels?.[key] ?? `#${key}`
    if (key === 'true') return 'Yes'
    if (key === 'false') return 'No'
    return options.optionLabels?.[key] ?? humanize(key)
  }
}

/**
 * Format a bucket key (`YYYY-MM-DD`, the bucket's first day) for its interval, in UTC.
 *
 * @example
 * formatBucket('2026-11-01', 'month', 'en-GB') // 'Nov 2026'
 * formatBucket('2026-11-09', 'week', 'en-GB') // 'w/c 9 Nov'
 */
export function formatBucket(key: string, interval: DateInterval, locale = 'en-GB'): string {
  const date = new Date(`${key}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime())) return key
  if (interval === 'month') return new Intl.DateTimeFormat(locale, { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date)
  const day = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(date)
  // "w/c" (week commencing) makes clear the label is the Monday a week starts on.
  return interval === 'week' ? `w/c ${day}` : day
}

/**
 * Format a value for tables, tooltips and KPI cards. `null` means "nothing to show" (no rows to
 * average, or a suppressed small group), shown as an en dash.
 *
 * @example
 * formatValue(1234.5, 'decimal', 'en-GB') // '1,234.50'
 * formatValue(null, 'integer') // '–'
 */
export function formatValue(value: number | null, format: ValueFormat, locale = 'en-GB'): string {
  if (value === null) return '–'
  const digits = format === 'decimal' ? 2 : 0
  return new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)
}

/**
 * Compact numbers for axis ticks (`12k`, `1.2M` in en-GB), so a narrow card never clips them.
 *
 * @example
 * formatCompact(125_000, 'en-GB') // '125k'
 */
export function formatCompact(value: number, locale = 'en-GB'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value)
}

/**
 * `in_review` → "In review"; `IN` stays "IN" (country codes, acronyms).
 *
 * @example
 * humanize('in_review') // 'In review'
 */
export function humanize(value: string): string {
  if (/^[A-Z0-9]+$/.test(value)) return value
  const words = value.replace(/[_-]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * The percentage change from `previous` to `current`, or `null` when there is no base to compare
 * (division by zero would print "Infinity%").
 *
 * @example
 * percentChange(120, 100) // 20
 * percentChange(5, 0) // null
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}
