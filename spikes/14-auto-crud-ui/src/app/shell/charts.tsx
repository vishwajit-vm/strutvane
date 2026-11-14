/**
 * Small chart components on Recharts (MIT), styled only with theme tokens (`fill-chart-1`...), so
 * they follow the accent hue and both themes. Every chart is a `<figure>` whose data is also a
 * visually hidden table: a screen reader gets the numbers, not "image".
 *
 * These are the seed of `@strutvane/charts` (DESIGN.md §4 "Charts").
 *
 * @module
 */
import type { ReactElement } from 'react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

/**
 * One value in a chart.
 *
 * @example
 * const datum: ChartDatum = { label: 'Posts', value: 35 }
 */
export interface ChartDatum {
  readonly label: string
  readonly value: number
}

/** Series colours, in order (tokens; DESIGN.md §4 "Charts"). */
export const SERIES_CLASSES = ['fill-chart-1', 'fill-chart-2', 'fill-chart-3', 'fill-chart-4'] as const

/** Tooltip styling from tokens (Recharts takes inline styles here). */
const TOOLTIP_STYLE = { background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--foreground)', boxShadow: 'var(--shadow-popover)' } as const
const AXIS_TICK = { fill: 'var(--muted-foreground)', fontSize: 12 } as const

/**
 * A vertical bar chart of labelled values.
 *
 * @example
 * <CategoryBarChart title="Rows per table" data={[{ label: 'Posts', value: 35 }]} />
 */
export function CategoryBarChart({ title, data }: { readonly title: string; readonly data: readonly ChartDatum[] }): ReactElement {
  return (
    <figure aria-label={title}>
      <div aria-hidden="true" className="h-56">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 480, height: 224 }}>
          <BarChart data={[...data]} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <CartesianGrid vertical={false} strokeDasharray="4 4" className="stroke-border" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <Tooltip cursor={{ className: 'fill-accent' }} contentStyle={TOOLTIP_STYLE} />
            <Bar dataKey="value" name="Rows" radius={[6, 6, 0, 0]} maxBarSize={42}>
              {data.map((datum) => (
                <Cell key={datum.label} className="fill-chart-1" />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <DataTable title={title} data={data} />
    </figure>
  )
}

/**
 * A donut chart with a legend.
 *
 * @example
 * <DonutChart title="Posts by status" data={[{ label: 'draft', value: 12 }, { label: 'published', value: 23 }]} />
 */
export function DonutChart({ title, data }: { readonly title: string; readonly data: readonly ChartDatum[] }): ReactElement {
  const total = data.reduce((sum, datum) => sum + datum.value, 0)
  return (
    <figure aria-label={title}>
      <div aria-hidden="true" className="h-44">
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 176 }}>
          <PieChart>
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Pie data={[...data]} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="90%" paddingAngle={3} stroke="none">
              {data.map((datum, index) => (
                <Cell key={datum.label} className={SERIES_CLASSES[index % SERIES_CLASSES.length]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul aria-hidden="true" className="mt-4 space-y-2 text-sm">
        {data.map((datum, index) => (
          <li key={datum.label} className="flex items-center gap-2">
            <svg viewBox="0 0 10 10" className="size-2.5">
              <circle cx="5" cy="5" r="5" className={SERIES_CLASSES[index % SERIES_CLASSES.length]} />
            </svg>
            <span className="flex-1 capitalize">{datum.label}</span>
            <span className="font-medium">{total === 0 ? '0%' : `${Math.round((datum.value / total) * 100)}%`}</span>
          </li>
        ))}
      </ul>
      <DataTable title={title} data={data} />
    </figure>
  )
}

/** The chart's numbers for screen readers. */
function DataTable({ title, data }: { readonly title: string; readonly data: readonly ChartDatum[] }): ReactElement {
  return (
    <table className="sr-only">
      <caption>{title}</caption>
      <thead>
        <tr>
          <th scope="col">Label</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {data.map((datum) => (
          <tr key={datum.label}>
            <th scope="row">{datum.label}</th>
            <td>{datum.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
