/**
 * The chart components of `@strutvane/charts`, on Recharts 3 (MIT). They draw a {@link ChartData}
 * and nothing else: fetching, states and the data table live in `ChartCard`.
 *
 * Shared rules (DESIGN.md §4 "Charts"):
 * - **Tokens only:** series `var(--chart-n)`, gridlines `--border`, axes `--muted-foreground`
 *   12 px, tooltip = `--card` + `--shadow-popover`. Light and dark come free with the tokens.
 * - **Accessible:** the `<svg>` is `role="img"` with a `<title>` (the chart title) and a `<desc>`
 *   (the summary sentence), and it is keyboard-focusable: Recharts' accessibility layer moves the
 *   tooltip with the arrow keys. The numbers are also in a data table (`ChartCard`).
 * - **Responsive:** `ResponsiveContainer` fills the card; `initialDimension` gives a sensible
 *   first paint (and makes jsdom render without a layout engine).
 * - **Motion:** animations are off under `prefers-reduced-motion`.
 *
 * @module
 */
import type { ReactElement, ReactNode } from 'react'
import { Area, AreaChart as RechartsAreaChart, Bar, BarChart as RechartsBarChart, CartesianGrid, Cell, Line, LineChart as RechartsLineChart, Pie, PieChart as RechartsPieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import type { ValueFormat } from '../../shared/widgets.ts'
import { formatCompact, formatValue } from '../format.ts'
import { rowColor, type ChartData, type ChartRow } from '../series.ts'

/**
 * Props every chart takes.
 *
 * @example
 * const props: ChartProps = { data, title: 'Invoices per month', summary: '…', format: 'integer' }
 */
export interface ChartProps {
  readonly data: ChartData
  /** The accessible name (`<title>`). */
  readonly title: string
  /** One sentence (`<desc>`), from `summarize()`. */
  readonly summary: string
  readonly format: ValueFormat
  /** Plot height in pixels (the width always follows the card). Default 256. */
  readonly height?: number
  readonly locale?: string
}

const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const
const TOOLTIP_STYLE = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--card-foreground)', boxShadow: 'var(--shadow-popover)', fontSize: 13 } as const
const FOCUS_RING = 'outline-none [&_.recharts-surface:focus-visible]:rounded-md [&_.recharts-surface:focus-visible]:outline-2 [&_.recharts-surface:focus-visible]:outline-offset-2 [&_.recharts-surface:focus-visible]:outline-ring'

/**
 * Values over time as lines (one per series). Gaps stay gaps: a suppressed or empty average is
 * not drawn as zero.
 *
 * @example
 * <LineChart data={data} title="Average total" summary={summary} format="decimal" />
 */
export function LineChart(props: ChartProps): ReactElement {
  return withLegend(
    <Frame height={props.height}>
      <RechartsLineChart data={flatten(props.data.rows)} {...surface(props)}>
        {cartesianParts(props)}
        {props.data.series.map((series) => (
          <Line key={series.dataKey} type="monotone" dataKey={series.dataKey} name={series.label} stroke={series.color} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={animate()} />
        ))}
      </RechartsLineChart>
    </Frame>,
    props.data,
  )
}

/**
 * Values over time as filled areas; several series stack (they are parts of one total).
 *
 * @example
 * <AreaChart data={data} title="Invoices per month" summary={summary} format="integer" />
 */
export function AreaChart(props: ChartProps): ReactElement {
  const stacked = props.data.series.length > 1
  return withLegend(
    <Frame height={props.height}>
      <RechartsAreaChart data={flatten(props.data.rows)} {...surface(props)}>
        {cartesianParts(props)}
        {props.data.series.map((series) => (
          <Area
            key={series.dataKey}
            type="monotone"
            dataKey={series.dataKey}
            name={series.label}
            stroke={series.color}
            fill={series.color}
            fillOpacity={0.18}
            strokeWidth={2}
            {...(stacked ? { stackId: 'total' } : {})}
            isAnimationActive={animate()}
          />
        ))}
      </RechartsAreaChart>
    </Frame>,
    props.data,
  )
}

/**
 * Props of {@link BarChart}.
 *
 * @example
 * const props: BarChartProps = { ...chartProps, stacked: true }
 */
export interface BarChartProps extends ChartProps {
  /** Stack series on top of each other (parts of a whole) instead of side by side (grouped). */
  readonly stacked?: boolean
  /** `horizontal`: bars grow to the right, category names on the left (good for top N). */
  readonly layout?: 'vertical' | 'horizontal'
}

/**
 * Bars: one colour per series, stacked or grouped; single-series bars colour "Other" neutrally.
 *
 * @example
 * <BarChart data={data} title="Top customers" summary={summary} format="integer" layout="horizontal" />
 */
export function BarChart(props: BarChartProps): ReactElement {
  const horizontal = props.layout === 'horizontal'
  const single = props.data.series.length === 1
  return withLegend(
    <Frame height={props.height ?? (horizontal ? Math.max(160, props.data.rows.length * 32 + 24) : undefined)}>
      <RechartsBarChart data={flatten(props.data.rows)} layout={horizontal ? 'vertical' : 'horizontal'} {...surface(props)} barCategoryGap="20%">
        <CartesianGrid vertical={horizontal} horizontal={!horizontal} strokeDasharray="4 4" stroke="var(--border)" />
        {horizontal ? (
          <>
            <XAxis type="number" tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(value: number) => formatCompact(value, props.locale)} allowDecimals={props.format === 'decimal'} />
            <YAxis type="category" dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} width={112} />
          </>
        ) : (
          axes(props)
        )}
        <Tooltip cursor={{ fill: 'var(--accent)', fillOpacity: 0.5 }} contentStyle={TOOLTIP_STYLE} formatter={tooltipValue(props)} />
        {props.data.series.map((series, index) => (
          <Bar
            key={series.dataKey}
            dataKey={series.dataKey}
            name={series.label}
            fill={series.color}
            maxBarSize={horizontal ? 22 : 40}
            radius={barRadius(horizontal, props.stacked === true, index === props.data.series.length - 1)}
            {...(props.stacked === true ? { stackId: 'total' } : {})}
            isAnimationActive={animate()}
          >
            {single ? props.data.rows.map((row, rowIndex) => <Cell key={row.key} fill={row.key.startsWith('__') ? rowColor(row, rowIndex) : series.color} />) : null}
          </Bar>
        ))}
      </RechartsBarChart>
    </Frame>,
    props.data,
  )
}

/**
 * Props of {@link PieChart}.
 *
 * @example
 * const props: PieChartProps = { ...chartProps, donut: true }
 */
export interface PieChartProps extends ChartProps {
  /** A ring with the total in the middle (easier to compare than a full pie). */
  readonly donut?: boolean
}

/**
 * Shares of a whole: one slice per group, with a legend that carries labels and percentages, so
 * colour is never the only way to tell slices apart.
 *
 * @example
 * <PieChart data={data} title="Invoices by status" summary={summary} format="integer" donut />
 */
export function PieChart(props: PieChartProps): ReactElement {
  const slices = props.data.rows.map((row, index) => ({ key: row.key, label: row.label, value: row.values['s0'] ?? 0, color: rowColor(row, index) }))
  const total = slices.reduce((sum, slice) => sum + slice.value, 0)
  return (
    <div className="grid items-center gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="relative">
        <Frame height={props.height ?? 208}>
          <RechartsPieChart {...surface(props)}>
            <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipValue(props)} />
            <Pie data={slices} dataKey="value" nameKey="label" innerRadius={props.donut === true ? '62%' : 0} outerRadius="90%" paddingAngle={slices.length > 1 ? 2 : 0} stroke="var(--card)" isAnimationActive={animate()}>
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
          </RechartsPieChart>
        </Frame>
        {props.donut === true ? (
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-semibold tabular-nums">{formatValue(total, props.format, props.locale)}</span>
            <span className="text-xs text-muted-foreground">Total</span>
          </div>
        ) : null}
      </div>
      {/* The legend repeats what the table says, so it is hidden from screen readers. */}
      <ul aria-hidden="true" className="space-y-2 text-sm">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2">
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: slice.color }} />
            <span className="flex-1 truncate">{slice.label}</span>
            <span className="tabular-nums text-muted-foreground">{formatValue(slice.value, props.format, props.locale)}</span>
            <span className="w-10 text-right font-medium tabular-nums">{total === 0 ? '0%' : `${Math.round((slice.value / total) * 100)}%`}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Props of {@link Sparkline}.
 *
 * @example
 * const props: SparklineProps = { values: [1, 4, 2], color: 'var(--chart-1)' }
 */
export interface SparklineProps {
  readonly values: readonly (number | null)[]
  readonly color?: string
  readonly height?: number
}

/**
 * A tiny trend line without axes. Decorative: the KPI card around it states the numbers in text,
 * so the sparkline is hidden from screen readers and is not a keyboard stop.
 *
 * @example
 * <Sparkline values={[3, 5, 4, 8]} />
 */
export function Sparkline({ values, color = 'var(--chart-1)', height = 40 }: SparklineProps): ReactElement {
  const data = values.map((value, index) => ({ index, value }))
  return (
    <div aria-hidden="true" style={{ height }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 160, height }}>
        <RechartsAreaChart data={data} margin={{ top: 2, right: 0, bottom: 2, left: 0 }} accessibilityLayer={false}>
          <Area type="monotone" dataKey="value" stroke={color} fill={color} fillOpacity={0.15} strokeWidth={2} dot={false} isAnimationActive={animate()} />
        </RechartsAreaChart>
      </ResponsiveContainer>
    </div>
  )
}

/**
 * A chart plus, when it has several series, a legend naming each colour. Colour alone never
 * carries meaning (WCAG 1.4.1); the legend is hidden from screen readers because the data table
 * already names every series.
 */
function withLegend(chart: ReactElement, data: ChartData): ReactElement {
  if (data.series.length < 2) return chart
  return (
    <div>
      {chart}
      <ul aria-hidden="true" className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {data.series.map((series) => (
          <li key={series.dataKey} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** The sized, focus-ringed box every cartesian chart sits in. */
function Frame({ height, children }: { readonly height: number | undefined; readonly children: ReactElement }): ReactElement {
  const plotHeight = height ?? 256
  return (
    <div className={FOCUS_RING} style={{ height: plotHeight }}>
      <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 560, height: plotHeight }}>
        {children}
      </ResponsiveContainer>
    </div>
  )
}

/** Accessible-surface props shared by every chart root. */
function surface(props: ChartProps): { title: string; desc: string; role: string; accessibilityLayer: true; margin: { top: number; right: number; bottom: number; left: number } } {
  return { title: props.title, desc: props.summary, role: 'img', accessibilityLayer: true, margin: { top: 8, right: 12, bottom: 0, left: 0 } }
}

function cartesianParts(props: ChartProps): ReactNode {
  return (
    <>
      <CartesianGrid vertical={false} strokeDasharray="4 4" stroke="var(--border)" />
      {axes(props)}
      <Tooltip contentStyle={TOOLTIP_STYLE} formatter={tooltipValue(props)} cursor={{ stroke: 'var(--border)' }} />
    </>
  )
}

function axes(props: ChartProps): ReactNode {
  return (
    <>
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} minTickGap={16} />
      <YAxis tickLine={false} axisLine={false} tick={AXIS_TICK} width={48} tickFormatter={(value: number) => formatCompact(value, props.locale)} allowDecimals={props.format === 'decimal'} />
    </>
  )
}

/** Tooltip numbers in the widget's format; a suppressed or empty value reads "–". */
function tooltipValue(props: ChartProps): (value: unknown) => string {
  return (value) => formatValue(typeof value === 'number' ? value : null, props.format, props.locale)
}

/** Round the outer end of a bar only (the top of a stack). */
function barRadius(horizontal: boolean, stacked: boolean, last: boolean): [number, number, number, number] {
  if (stacked && !last) return [0, 0, 0, 0]
  return horizontal ? [0, 6, 6, 0] : [6, 6, 0, 0]
}

/** Rows as flat objects (`{ key, label, s0, s1 }`) for Recharts' `dataKey`. */
function flatten(rows: readonly ChartRow[]): Record<string, string | number | null>[] {
  return rows.map((row) => ({ key: row.key, label: row.label, ...row.values }))
}

/** Animate unless the user asked for reduced motion (or the environment can't tell, as in tests). */
function animate(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
