/**
 * Reshape an {@link AggregateResult} into what every chart component draws: rows with one numeric
 * column per series, plus the series' labels and colours, plus a one-sentence summary for screen
 * readers.
 *
 * Why one shape for all charts: the line, area, bar and pie components then share the data table,
 * the empty check and the summary, and a widget can switch chart kind without new data code.
 *
 * @module
 */
import { OTHER_GROUP_KEY, type AggregateResult } from '../shared/aggregate-contract.ts'
import type { ValueFormat } from '../shared/widgets.ts'
import { formatValue, type KeyLabeler } from './format.ts'

/** Series colours in order: tokens only (DESIGN.md §4 "Charts"). */
export const SERIES_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)', 'var(--chart-6)'] as const
/** The neutral colour of "Other" and "None". */
export const OTHER_COLOR = 'var(--chart-other)'

/**
 * One drawable series.
 *
 * @example
 * const series: ChartSeries = { dataKey: 's0', label: 'Paid', color: 'var(--chart-1)' }
 */
export interface ChartSeries {
  /** The row property holding this series' values (`s0`, `s1`, …): safe for any key text. */
  readonly dataKey: string
  readonly label: string
  readonly color: string
}

/**
 * One drawable row (an x position or a slice).
 *
 * @example
 * const row: ChartRow = { key: '2026-11-01', label: 'Nov 2026', values: { s0: 12 }, suppressed: [] }
 */
export interface ChartRow {
  readonly key: string
  readonly label: string
  readonly values: Readonly<Record<string, number | null>>
  /** dataKeys withheld by small-group suppression. */
  readonly suppressed: readonly string[]
}

/**
 * Everything a chart component needs.
 *
 * @example
 * const data = toChartData(result, labeler, (key) => (key === 'value' ? 'Invoices' : humanize(key)))
 */
export interface ChartData {
  readonly rows: readonly ChartRow[]
  readonly series: readonly ChartSeries[]
  /** True when no row has a non-zero value: show the empty state instead of a flat line. */
  readonly empty: boolean
  /** Number of withheld cells (small-group suppression). */
  readonly suppressedCells: number
}

/**
 * Convert an aggregate result into chart rows and series.
 *
 * @example
 * toChartData(result, (key) => key, (key) => key).series[0]?.color // 'var(--chart-1)'
 */
export function toChartData(result: AggregateResult, labelKey: KeyLabeler, labelSeries: KeyLabeler): ChartData {
  const series = result.series.map((entry, index) => ({ dataKey: `s${index}`, label: labelSeries(entry.key), color: seriesColor(entry.key, index) }))
  const rows = result.data.map((bucket) => {
    const values: Record<string, number | null> = {}
    result.series.forEach((entry, index) => {
      values[`s${index}`] = bucket.values[entry.key] ?? null
    })
    const suppressed = result.series.flatMap((entry, index) => (bucket.suppressed?.includes(entry.key) === true ? [`s${index}`] : []))
    return { key: bucket.key, label: labelKey(bucket.key), values, suppressed }
  })
  const empty = rows.every((row) => Object.values(row.values).every((value) => value === null || value === 0)) && result.meta.suppressedCells === 0
  return { rows, series, empty, suppressedCells: result.meta.suppressedCells }
}

/** "Other"/"None" are neutral; everything else cycles through the series tokens. */
function seriesColor(key: string, index: number): string {
  if (key === OTHER_GROUP_KEY || key === '__none__') return OTHER_COLOR
  return SERIES_COLORS[index % SERIES_COLORS.length] ?? 'var(--chart-1)'
}

/**
 * The colour of a slice or single-series bar, by row: pies colour by category, not by series.
 *
 * @example
 * rowColor(row, 0) // 'var(--chart-1)'
 */
export function rowColor(row: ChartRow, index: number): string {
  return seriesColor(row.key, index)
}

/**
 * A one-sentence description for screen readers and the chart's `<desc>`: what is shown, the
 * range, and the highest point. A chart is otherwise an image with no words.
 *
 * @example
 * summarize(data, 'Invoices per month', 'integer')
 * // 'Invoices per month: 12 points from Dec 2025 to Nov 2026. Highest: Jun 2026, 8.'
 */
export function summarize(data: ChartData, title: string, format: ValueFormat, locale = 'en-GB'): string {
  if (data.empty) return `${title}: no data for this period.`
  const first = data.rows[0]
  const last = data.rows.at(-1)
  let best: { label: string; value: number } | undefined
  for (const row of data.rows) {
    for (const value of Object.values(row.values)) {
      if (value !== null && (best === undefined || value > best.value)) best = { label: row.label, value }
    }
  }
  const range = data.rows.length > 1 && first !== undefined && last !== undefined ? ` from ${first.label} to ${last.label}` : ''
  const series = data.series.length > 1 ? ` in ${data.series.length} series (${data.series.map((entry) => entry.label).join(', ')})` : ''
  const highest = best === undefined ? '' : ` Highest: ${best.label}, ${formatValue(best.value, format, locale)}.`
  const hidden = data.suppressedCells > 0 ? ` ${data.suppressedCells} small ${data.suppressedCells === 1 ? 'group is' : 'groups are'} hidden for privacy.` : ''
  return `${title}: ${data.rows.length} ${data.rows.length === 1 ? 'point' : 'points'}${range}${series}.${highest}${hidden}`
}
