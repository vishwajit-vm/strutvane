/**
 * Revenue over time: this year as a gradient-filled area, last year as a dashed comparison line,
 * a 12M/6M/3M range switch, headline totals and a card-style tooltip.
 */
import { ToggleGroup } from 'radix-ui'
import { useId, useState, type ReactElement } from 'react'
import { Area, AreaChart, CartesianGrid, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AXIS_PROPS, ChartTooltip, CURSOR, GRID_PROPS, LegendDot } from '../../components/chart.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { TrendChip } from '../../components/ui/misc.tsx'
import { revenue } from '../../data/dashboard.ts'
import { formatCompactMoney, formatMoney } from '../../lib/format.ts'

const RANGES = { '12M': 12, '6M': 6, '3M': 3 } as const
type Range = keyof typeof RANGES
const isRange = (value: string): value is Range => value in RANGES

export function RevenueCard(): ReactElement {
  const [range, setRange] = useState<Range>('12M')
  const gradient = useId()
  const data = revenue.slice(-RANGES[range])
  const total = data.reduce((sum, point) => sum + point.thisYear, 0)
  const previous = data.reduce((sum, point) => sum + point.lastYear, 0)
  const change = ((total - previous) / previous) * 100

  return (
    <Card className="h-full">
      <CardHeader className="flex-col sm:flex-row">
        <div>
          <CardTitle>Revenue</CardTitle>
          <CardDescription>Collected payments, compared with last year</CardDescription>
        </div>
        <ToggleGroup.Root
          type="single"
          value={range}
          onValueChange={(value) => (isRange(value) ? setRange(value) : undefined)}
          aria-label="Time range"
          className="inline-flex shrink-0 rounded-lg bg-muted p-1"
        >
          {Object.keys(RANGES).map((key) => (
            <ToggleGroup.Item
              key={key}
              value={key}
              className="h-7 cursor-pointer rounded-md px-3 text-xs font-semibold text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30 data-[state=on]:bg-card data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {key}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex items-center gap-3">
            <p className="text-[1.75rem] font-bold leading-9 tracking-tight text-foreground tabular">{formatMoney(total).replace(/\.00$/, '')}</p>
            <TrendChip value={change} good={change >= 0} />
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <LegendDot color="var(--chart-1)" label="This year" />
            <LegendDot color="var(--chart-2)" label="Last year" />
          </div>
        </div>
        <div className="h-72 min-w-0">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={[...data]} margin={{ top: 8, right: 4, left: -8, bottom: 0 }}>
              <defs>
                <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid {...GRID_PROPS} />
              <XAxis dataKey="month" {...AXIS_PROPS} />
              <YAxis {...AXIS_PROPS} width={56} tickFormatter={(value: number) => formatCompactMoney(value)} />
              <Tooltip cursor={CURSOR} content={<ChartTooltip format={formatMoney} labels={{ thisYear: 'This year', lastYear: 'Last year' }} />} />
              <Line type="monotone" dataKey="lastYear" stroke="var(--chart-2)" strokeWidth={2} strokeDasharray="5 5" dot={false} activeDot={{ r: 4, strokeWidth: 0 }} />
              <Area
                type="monotone"
                dataKey="thisYear"
                stroke="var(--chart-1)"
                strokeWidth={3}
                fill={`url(#${gradient})`}
                dot={false}
                activeDot={{ r: 6, stroke: 'var(--card)', strokeWidth: 3, fill: 'var(--chart-1)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
