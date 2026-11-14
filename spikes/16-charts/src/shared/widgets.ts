/**
 * A chart widget, fully resolved: what to draw, how big, and which aggregate request feeds it.
 *
 * Widgets are plain data. Suggested ones come from `suggest.ts`, hand-made ones from an owned
 * `charts.ts` file, and both end up in this one shape, so the dashboard, the resource "Insights"
 * tab and package dashboards render them with the same code.
 *
 * @module
 */
import type { AggregateMetric, AggregateQuery, DateInterval } from './aggregate-contract.ts'

/**
 * The kinds of chart a widget can be.
 *
 * - `stat`: a KPI card: the total of the last window, the change against the window before, and a
 *   sparkline.
 * - `line` / `area`: values over time.
 * - `bar`: categories or time; `stacked` or grouped when the query has a `splitBy`.
 * - `pie` / `donut`: shares of a whole (a handful of categories).
 *
 * @example
 * const kind: ChartKind = 'donut'
 */
export type ChartKind = 'stat' | 'line' | 'area' | 'bar' | 'pie' | 'donut'

/**
 * How many grid columns a widget spans on the dashboard (of 4 on wide screens; every widget is
 * full width on phones).
 *
 * @example
 * const size: WidgetSize = 'lg' // half the dashboard on a wide screen
 */
export type WidgetSize = 'sm' | 'md' | 'lg' | 'full'

/**
 * A time window relative to "now", resolved into `from`/`to` when the widget is fetched.
 *
 * Why relative: an owned file saying `from: '2026-01-01'` would be stale next year; "the last 12
 * months" never is.
 *
 * @example
 * const range: RelativeRange = { last: 30, unit: 'day' } // the last 30 days, today included
 */
export interface RelativeRange {
  readonly last: number
  readonly unit: DateInterval
}

/**
 * How values are formatted in axes, tooltips, tables and KPI cards.
 *
 * @example
 * const format: ValueFormat = 'decimal' // 1,234.50
 */
export type ValueFormat = 'integer' | 'decimal'

/**
 * One resolved widget.
 *
 * @example
 * const widget: WidgetSpec = {
 *   id: 'invoices.count-by-status', resource: 'invoices', kind: 'donut', size: 'md',
 *   title: 'Invoices by status', query: { metric: 'count', groupBy: 'status' }, format: 'integer',
 * }
 */
export interface WidgetSpec {
  /** Stable id, `<resource>.<name>`: owned files refer to suggestions by it. */
  readonly id: string
  /** The resource's route (`invoices`), which is also the API segment. */
  readonly resource: string
  readonly kind: ChartKind
  readonly title: string
  readonly description?: string
  readonly query: AggregateQuery
  /** Relative window for date charts; ignored when the query has explicit from/to. */
  readonly range?: RelativeRange
  readonly size: WidgetSize
  readonly format: ValueFormat
  /** Bars only: stack the series instead of placing them side by side. */
  readonly stacked?: boolean
  /** Bars only: `horizontal` suits long category names (top customers). */
  readonly layout?: 'vertical' | 'horizontal'
  /** Stat cards only: is a rise good (sales) or bad (refunds)? Colours the trend. */
  readonly positiveIs?: 'up' | 'down'
}

/**
 * Metrics a stat card can show. `avg` is left out on purpose: the average of two windows can't be
 * rebuilt from per-day averages without the counts, so a trend would be wrong.
 *
 * @example
 * const metric: StatMetric = 'sum'
 */
export type StatMetric = Exclude<AggregateMetric, 'avg'>
