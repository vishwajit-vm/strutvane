/**
 * Revenue chart: this year as an accent area, last year as a dashed neutral line, on a quiet
 * dashed grid with no axis lines. The tooltip compares both years and the difference.
 *
 * Accessibility: the SVG is hidden from screen readers and the same numbers are offered as a
 * visually hidden table, which is both more accurate and easier to navigate than a chart.
 */
import { useId, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, type TooltipContentProps, type TooltipValueType, XAxis, YAxis } from 'recharts'
import { Card, CardHeader } from '../../components/ui/card.tsx'
import { Segmented } from '../../components/ui/controls.tsx'
import { revenueByMonth } from '../../data/activity.ts'
import { formatDelta, formatMoney } from '../../lib/format.ts'

type Range = '12m' | '6m' | '3m'

const euros = (value: number, compact = true) => formatMoney(value * 100, 'EUR', compact)

/** The tooltip: month, both years with their swatches, and the year-over-year change. */
function ChartTooltip({ active, payload, label }: TooltipContentProps<TooltipValueType, string | number>) {
  if (active !== true || payload.length === 0) return null
  const current = Number(payload.find((entry) => entry.dataKey === 'current')?.value ?? 0)
  const previous = Number(payload.find((entry) => entry.dataKey === 'previous')?.value ?? 0)
  const change = previous === 0 ? 0 : ((current - previous) / previous) * 100
  return (
    <div className="min-w-44 rounded-lg border border-border bg-surface p-2.5 text-xs shadow-pop">
      <p className="mb-1.5 font-medium text-fg">{label} 2026</p>
      <p className="flex items-center gap-2 text-fg-muted">
        <span className="h-0.5 w-3 rounded-full bg-chart-1" /> This year <span className="num ml-auto text-fg">{euros(current, false)}</span>
      </p>
      <p className="mt-1 flex items-center gap-2 text-fg-muted">
        <span className="h-0 w-3 border-t border-dashed border-chart-3" /> Last year <span className="num ml-auto text-fg">{euros(previous, false)}</span>
      </p>
      <p className="mt-2 border-t border-border pt-1.5 text-success-text">{formatDelta(change)} year over year</p>
    </div>
  )
}

export function RevenueChart() {
  const [range, setRange] = useState<Range>('12m')
  const gradient = useId()
  const months = range === '12m' ? 12 : range === '6m' ? 6 : 3
  const data = revenueByMonth.slice(-months)
  const total = data.reduce((sum, row) => sum + row.current, 0)
  const previousTotal = data.reduce((sum, row) => sum + row.previous, 0)
  const change = ((total - previousTotal) / previousTotal) * 100

  return (
    <Card aria-labelledby="revenue-title">
      <CardHeader
        id="revenue-title"
        title="Revenue"
        description="Collected payments, all currencies converted to EUR"
        actions={
          <Segmented
            aria-label="Revenue range"
            value={range}
            onValueChange={setRange}
            items={[
              { value: '3m', label: '3M' },
              { value: '6m', label: '6M' },
              { value: '12m', label: '12M' },
            ]}
          />
        }
      />
      <div className="flex flex-wrap items-end gap-x-6 gap-y-2 px-4">
        <div>
          <p className="figure text-3xl font-semibold text-fg">{euros(total, false).replace(/\.00$/, '')}</p>
          <p className="mt-1 text-xs text-fg-subtle">
            <span className="font-medium text-success-text">{formatDelta(change)}</span> vs. same period last year
          </p>
        </div>
        <div className="ml-auto flex items-center gap-4 pb-1 text-xs text-fg-muted" aria-hidden>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full bg-chart-1" /> This year
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0 w-3 border-t border-dashed border-chart-3" /> Last year
          </span>
        </div>
      </div>
      <div className="h-64 px-2 pb-3 pt-4" aria-hidden>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 640, height: 240 }}>
          <AreaChart data={data} margin={{ top: 4, right: 12, bottom: 0, left: 4 }}>
            <defs>
              <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0.18 }} />
                <stop offset="100%" style={{ stopColor: 'var(--chart-1)', stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" strokeDasharray="3 4" />
            <XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={10} tick={{ fill: 'var(--fg-subtle)', fontSize: 'var(--size-2xs)' }} interval="preserveStartEnd" />
            <YAxis
              axisLine={false}
              tickLine={false}
              width={52}
              tickMargin={6}
              tickCount={5}
              tick={{ fill: 'var(--fg-subtle)', fontSize: 'var(--size-2xs)', fontFamily: 'var(--font-numeric)' }}
              tickFormatter={(value: number) => euros(value)}
            />
            <Tooltip content={ChartTooltip} cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }} />
            <Line type="monotone" dataKey="previous" stroke="var(--chart-3)" strokeWidth={1.5} strokeDasharray="4 4" dot={false} activeDot={false} isAnimationActive={false} />
            <Area
              type="monotone"
              dataKey="current"
              stroke="var(--chart-1)"
              strokeWidth={2}
              fill={`url(#${gradient})`}
              activeDot={{ r: 4, fill: 'var(--surface)', stroke: 'var(--chart-1)', strokeWidth: 2 }}
              animationDuration={500}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Revenue by month, this year and last year, in euros</caption>
        <thead>
          <tr>
            <th scope="col">Month</th>
            <th scope="col">This year</th>
            <th scope="col">Last year</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={row.month}>
              <th scope="row">{row.month}</th>
              <td>{euros(row.current, false)}</td>
              <td>{euros(row.previous, false)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
