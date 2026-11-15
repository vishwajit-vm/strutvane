/**
 * `#strutvane/charts`: what a developer-owned `resources/charts/<resource>.charts.ts` imports.
 * (In the product: `@strutvane/ui/charts`; the spike maps it with package.json `imports`.)
 *
 * The typing trick is spike 14's: {@link ChartsRegistry} starts empty, and the machine-owned
 * `.strutvane/charts.gen.ts` fills it by declaration merging with, per resource, the fields each
 * chart role accepts and the ids of the current suggestions. So:
 * - a migration that drops `total` turns `field: 'total'` into a compile error after `charts:sync`;
 * - a secret column (`api_key`) is never in the registry, so it can't even be typed;
 * - `metric: 'sum'` without a numeric `field`, or `interval` on an enum, does not compile.
 *
 * @example
 * // resources/charts/invoices.charts.ts
 * import { auto, defineResourceCharts } from '#strutvane/charts'
 * export default defineResourceCharts('invoices', {
 *   widgets: auto({ except: ['invoices.avg-tax'] }),
 *   dashboard: ['invoices.new', 'invoices.by-status'],
 * })
 *
 * @module
 */
import type { AggregateMetric, DateInterval } from './aggregate-contract.ts'
import type { ChartKind, RelativeRange, ValueFormat, WidgetSize } from './widgets.ts'

export type { ChartKind, RelativeRange, ValueFormat, WidgetSize, WidgetSpec } from './widgets.ts'
export type { AppMetadata, ResourceMetadata } from './metadata.ts'

/**
 * The chart roles of one resource's fields. `.strutvane/charts.gen.ts` writes one per resource.
 *
 * @example
 * const invoices: ResourceChartFields = { numeric: 'total' | 'tax', date: 'issued_on' | 'created_at', category: 'status' | 'paid', relation: 'customer_id', suggestion: 'invoices.new' }
 */
export interface ResourceChartFields {
  readonly numeric: string
  readonly date: string
  readonly category: string
  readonly relation: string
  readonly suggestion: string
}

/**
 * Resource route → its chart fields. Empty here; `.strutvane/charts.gen.ts` augments it.
 *
 * @example
 * // in .strutvane/charts.gen.ts (generated):
 * declare module '#strutvane/charts' { interface ChartsRegistry { invoices: { numeric: 'total'; … } } }
 */
// Deliberately empty: it is filled by declaration merging from charts.gen.ts.
export interface ChartsRegistry {}

/**
 * Every chartable resource the generated registry knows.
 *
 * @example
 * const name: ChartResource = 'invoices'
 */
export type ChartResource = keyof ChartsRegistry & string

type Role<R extends ChartResource, K extends keyof ResourceChartFields> = ChartsRegistry[R] extends ResourceChartFields ? ChartsRegistry[R][K] : never

/** Fields that can be summed or averaged. */
export type NumericField<R extends ChartResource> = Role<R, 'numeric'>
/** Fields that can be bucketed by day, week or month. */
export type DateField<R extends ChartResource> = Role<R, 'date'>
/** Enum and boolean fields. */
export type CategoryField<R extends ChartResource> = Role<R, 'category'>
/** belongsTo foreign keys. */
export type RelationField<R extends ChartResource> = Role<R, 'relation'>
/** Ids of the current suggestions (`invoices.by-status`). */
export type SuggestionId<R extends ChartResource> = Role<R, 'suggestion'>

/**
 * The `auto()` marker: "use the suggestions, and keep picking up new ones after each migrate".
 *
 * @example
 * const widgets: AutoSelection<'invoices.new'> = auto()
 */
export interface AutoSelection<T extends string> {
  readonly kind: 'auto'
  /** Suggestion ids to leave out. */
  readonly except: readonly T[]
  /** Ids to put first, in this order; the rest follow in suggestion order. */
  readonly order: readonly T[]
}

/**
 * Options for {@link auto}.
 *
 * @example
 * const options: AutoOptions<'invoices.new'> = { order: ['invoices.new'] }
 */
export interface AutoOptions<T extends string> {
  readonly except?: readonly T[]
  readonly order?: readonly T[]
}

/**
 * "Use the suggested default here, and include new suggestions automatically after each migrate."
 * The options form (not chaining) keeps the ids type-checked, as spike 14 found (Finding 1).
 *
 * @example
 * defineResourceCharts('invoices', { widgets: auto({ except: ['invoices.avg-tax'] }) })
 */
export function auto<T extends string = string>(options: AutoOptions<NoInfer<T>> = {}): AutoSelection<T> {
  return { kind: 'auto', except: options.except ?? [], order: options.order ?? [] }
}

/** What to measure: rows, or the sum / average of a numeric field. */
type MeasureOf<R extends ChartResource> = { readonly metric: 'count'; readonly field?: never } | { readonly metric: 'sum' | 'avg'; readonly field: NumericField<R> }

/** How to group: by a date (needs an interval), by a category or relation, or not at all. */
type GroupingOf<R extends ChartResource> =
  | { readonly groupBy: DateField<R>; readonly interval: DateInterval; readonly range?: RelativeRange; readonly limit?: never }
  | { readonly groupBy: CategoryField<R>; readonly interval?: never; readonly range?: never; readonly limit?: never }
  | { readonly groupBy: RelationField<R>; readonly interval?: never; readonly range?: never; readonly limit?: number }
  | { readonly groupBy?: never; readonly interval?: never; readonly range?: never; readonly limit?: never }

/** Everything a hand-made chart has besides its measure and grouping. */
interface CustomChartBase<R extends ChartResource> {
  /** Must start with the resource route, so ids are unique across the app. */
  readonly id: `${R}.${string}`
  readonly kind: Exclude<ChartKind, 'stat'>
  readonly title: string
  readonly description?: string
  /** A second dimension (one bar or line per option): enum and boolean fields only. */
  readonly splitBy?: CategoryField<R>
  readonly size?: WidgetSize
  readonly format?: ValueFormat
  readonly stacked?: boolean
  readonly layout?: 'vertical' | 'horizontal'
}

/**
 * A hand-made chart in an owned file. Every field name is checked against the resource's roles.
 *
 * @example
 * const chart: CustomChart<'invoices'> = {
 *   id: 'invoices.paid-total', kind: 'bar', title: 'Paid per month',
 *   metric: 'sum', field: 'total', groupBy: 'issued_on', interval: 'month', splitBy: 'paid',
 * }
 */
export type CustomChart<R extends ChartResource> = CustomChartBase<R> & MeasureOf<R> & GroupingOf<R>

/**
 * A KPI card in an owned file: count or sum over the last `days`, with a trend and a sparkline.
 *
 * @example
 * const kpi: CustomStat<'invoices'> = { id: 'invoices.revenue', kind: 'stat', title: 'Revenue', metric: 'sum', field: 'total', date: 'issued_on', days: 30 }
 */
export type CustomStat<R extends ChartResource> = {
  readonly id: `${R}.${string}`
  readonly kind: 'stat'
  readonly title: string
  readonly description?: string
  /** The date that decides which window a row falls in. */
  readonly date: DateField<R>
  /** Window length (1..180 days); the trend compares it with the window before. */
  readonly days?: number
  readonly positiveIs?: 'up' | 'down'
  readonly format?: ValueFormat
} & ({ readonly metric: 'count'; readonly field?: never } | { readonly metric: 'sum'; readonly field: NumericField<R> })

/**
 * One entry of an explicit widget list: a suggestion id, or a hand-made chart.
 *
 * @example
 * const entry: WidgetEntry<'invoices'> = 'invoices.by-status'
 */
export type WidgetEntry<R extends ChartResource> = SuggestionId<R> | CustomChart<R> | CustomStat<R>

/**
 * Which fields the aggregate endpoint accepts for this resource. `auto()` = everything the schema
 * allows (exposed, non-tenant fields; see `capabilities.ts`); a list narrows it; `false` turns the
 * endpoint off.
 *
 * @example
 * const allow: AggregateAllowListConfig<'employees'> = { numeric: [], groupBy: ['department', 'hired_on'] }
 */
export interface AggregateAllowListConfig<R extends ChartResource> {
  readonly numeric?: readonly NumericField<R>[]
  readonly groupBy?: readonly (DateField<R> | CategoryField<R> | RelationField<R>)[]
}

/**
 * The owned chart settings of one resource.
 *
 * @example
 * const config: ResourceChartsConfig<'employees'> = { privacy: { minGroupSize: 5 } }
 */
export interface ResourceChartsConfig<R extends ChartResource> {
  /** The resource's charts (its "Insights" tab). Default `auto()`. */
  readonly widgets?: AutoSelection<SuggestionId<R>> | readonly WidgetEntry<R>[]
  /** Which of them the home dashboard shows. Default: the KPI card and the first category chart. `false` = none. */
  readonly dashboard?: AutoSelection<SuggestionId<R>> | readonly (SuggestionId<R> | `${R}.${string}`)[] | false
  /** The server allow-list (see {@link AggregateAllowListConfig}). Default `auto()`. */
  readonly aggregates?: AutoSelection<never> | AggregateAllowListConfig<R> | false
  /**
   * Sensitive data: never reveal a group of fewer than `minGroupSize` rows (2..100). Also turns
   * filters off and widens date windows to whole days, so no subtraction of two totals can single
   * one person out.
   */
  readonly privacy?: { readonly minGroupSize?: number }
  /** Sort position of this resource's widgets on the home dashboard (lower first). */
  readonly sort?: number
}

/**
 * A hand-made widget as plain data, after the type checks have done their job. This is what
 * `resolve.ts` reads at runtime (and re-validates, because a JS file or a stale registry could
 * still hand it anything).
 *
 * @example
 * const raw: RawCustomWidget = { id: 'invoices.x', kind: 'bar', title: 'X', metric: 'count', groupBy: 'status' }
 */
export interface RawCustomWidget {
  readonly id: string
  readonly kind: ChartKind
  readonly title: string
  readonly description?: string
  readonly metric: AggregateMetric
  readonly field?: string
  readonly groupBy?: string
  readonly interval?: DateInterval
  readonly splitBy?: string
  readonly range?: RelativeRange
  readonly limit?: number
  readonly size?: WidgetSize
  readonly format?: ValueFormat
  readonly stacked?: boolean
  readonly layout?: 'vertical' | 'horizontal'
  readonly date?: string
  readonly days?: number
  readonly positiveIs?: 'up' | 'down'
}

/**
 * The owned settings as plain data (field names are just strings here).
 *
 * @example
 * const raw: RawChartsConfig = { widgets: ['invoices.new'], privacy: { minGroupSize: 5 } }
 */
export interface RawChartsConfig {
  readonly widgets?: AutoSelection<string> | readonly (string | RawCustomWidget)[]
  readonly dashboard?: AutoSelection<string> | readonly string[] | false
  readonly aggregates?: AutoSelection<string> | { readonly numeric?: readonly string[]; readonly groupBy?: readonly string[] } | false
  readonly privacy?: { readonly minGroupSize?: number }
  readonly sort?: number
}

/**
 * What an owned file exports: plain data, readable by the server (allow-list, privacy) and the
 * browser (widgets) alike.
 *
 * @example
 * const charts: ResourceCharts = defineResourceCharts('invoices', {})
 * charts.resource // 'invoices'
 */
export interface ResourceCharts {
  readonly resource: string
  readonly config: RawChartsConfig
}

/**
 * Declare the chart settings of one resource. The first argument picks the resource; from then on
 * every field name and suggestion id is checked against it.
 *
 * @example
 * export default defineResourceCharts('employees', {
 *   widgets: auto({ except: ['employees.avg-salary'] }),
 *   privacy: { minGroupSize: 5 },
 * })
 */
export function defineResourceCharts<R extends ChartResource>(resource: R, config: ResourceChartsConfig<R>): ResourceCharts {
  // Widening to plain strings is safe: `resolve.ts` re-checks every name against the metadata.
  return { resource, config }
}

/**
 * Is this the `auto()` marker (as opposed to an explicit list or object)?
 *
 * @example
 * isAuto(auto()) // true
 * isAuto(['invoices.new']) // false
 */
export function isAuto(value: unknown): value is AutoSelection<string> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && (value as { kind?: unknown }).kind === 'auto'
}
