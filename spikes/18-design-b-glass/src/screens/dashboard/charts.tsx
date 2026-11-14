/**
 * Dashboard charts (Recharts): the revenue area chart and the invoices-by-status donut.
 *
 * Styling rules (DESIGN-B.md §6.6): gradient area fills that fade to transparent, hairline grid in
 * `--chart-grid`, no axis lines, rounded donut segments with a gap, and a glass tooltip. Every
 * chart also has a screen-reader table with the same numbers, because an SVG chart is not
 * accessible on its own.
 */
import { useId, useState } from 'react'
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, type TooltipContentProps } from 'recharts'
import { Card, CardBody, CardHeader } from '../../components/ui/card.tsx'
import { REVENUE_SERIES, STATUS_BREAKDOWN } from '../../data/dashboard.ts'
import type { InvoiceStatus } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { formatMoney, formatNumber } from '../../lib/format.ts'
import { useReducedMotion } from '../../lib/use-reduced-motion.ts'

// ── Glass tooltip ─────────────────────────────────────────────────────────

interface TooltipRow {
  readonly name: string
  readonly value: number
  readonly color: string
}

/** Pull plain rows out of Recharts' loosely typed payload. */
function rowsOf(props: TooltipContentProps): TooltipRow[] {
  return props.payload.flatMap((entry): TooltipRow[] => {
    const value: unknown = entry.value
    if (typeof value !== 'number') return []
    return [{ name: String(entry.name ?? ''), value, color: typeof entry.color === 'string' ? entry.color : 'currentColor' }]
  })
}

function GlassTooltip({ props, format }: { props: TooltipContentProps; format: (value: number) => string }) {
  if (!props.active) return null
  const rows = rowsOf(props)
  if (rows.length === 0) return null
  return (
    <div className="glass-overlay min-w-40 rounded-md px-3 py-2.5 text-sm">
      {props.label !== undefined && <p className="mb-1.5 text-xs font-semibold text-fg-muted">{props.label}</p>}
      {rows.map((row) => (
        <p key={row.name} className="flex items-center gap-2 text-fg">
          <span className="size-2 rounded-full" style={{ background: row.color }} aria-hidden />
          <span className="flex-1">{row.name}</span>
          <span className="font-semibold tabular">{format(row.value)}</span>
        </p>
      ))}
    </div>
  )
}

// ── Revenue area chart ───────────────────────────────────────────────────

const RANGES = [
  { id: '12m', label: '12M', months: 12 },
  { id: '6m', label: '6M', months: 6 },
  { id: '3m', label: '3M', months: 3 },
] as const

export function RevenueChart({ className }: { className?: string }) {
  const [range, setRange] = useState<(typeof RANGES)[number]['id']>('12m')
  const months = RANGES.find((option) => option.id === range)?.months ?? 12
  const data = REVENUE_SERIES.slice(-months)
  const ids = useId().replace(/:/g, '')
  const animate = !useReducedMotion()
  const total = data.reduce((sum, point) => sum + point.revenue, 0)
  const collected = data.reduce((sum, point) => sum + point.collected, 0)

  return (
    <Card className={className}>
      <CardHeader
        title="Revenue"
        description="Invoiced vs. collected"
        actions={
          <div role="group" aria-label="Time range" className="flex rounded-md border border-glass-border bg-glass-hover p-0.5">
            {RANGES.map((option) => (
              <button
                key={option.id}
                type="button"
                aria-pressed={range === option.id}
                onClick={() => setRange(option.id)}
                className={cn(
                  'h-7 rounded-sm px-2.5 text-xs font-semibold text-fg-muted transition-fast hover:text-fg',
                  range === option.id && 'bg-surface text-fg shadow-glass',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        }
      />
      <CardBody>
        <div className="mb-4 flex flex-wrap gap-x-8 gap-y-2">
          <Legend color="var(--chart-1)" label="Invoiced" value={formatMoney(total, 'USD', true)} />
          <Legend color="var(--chart-3)" label="Collected" value={formatMoney(collected, 'USD', true)} />
        </div>
        <div className="h-64 sm:h-72" aria-hidden>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 280 }}>
            <AreaChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
              <defs>
                <linearGradient id={`${ids}-rev`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={`${ids}-col`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: 'var(--foreground-muted)', fontSize: 12 }} dy={8} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: 'var(--foreground-muted)', fontSize: 12 }} tickFormatter={(value: number) => formatMoney(value, 'USD', true)} width={56} />
              <Tooltip cursor={{ stroke: 'var(--input-border)', strokeDasharray: '4 4' }} content={(props) => <GlassTooltip props={props} format={(value) => formatMoney(value)} />} />
              <Area isAnimationActive={animate} type="monotone" dataKey="collected" name="Collected" stroke="var(--chart-3)" strokeWidth={2} fill={`url(#${ids}-col)`} />
              <Area
                isAnimationActive={animate}
                type="monotone"
                dataKey="revenue"
                name="Invoiced"
                stroke="var(--chart-1)"
                strokeWidth={2.5}
                fill={`url(#${ids}-rev)`}
                activeDot={{ r: 5, strokeWidth: 3, stroke: 'var(--surface)', fill: 'var(--chart-1)' }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <table className="sr-only">
          <caption>Revenue by month</caption>
          <thead>
            <tr>
              <th scope="col">Month</th>
              <th scope="col">Invoiced</th>
              <th scope="col">Collected</th>
            </tr>
          </thead>
          <tbody>
            {data.map((point) => (
              <tr key={point.month}>
                <th scope="row">{point.month}</th>
                <td>{formatMoney(point.revenue)}</td>
                <td>{formatMoney(point.collected)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}

function Legend({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-xs font-medium text-fg-muted">
        <span className="h-2 w-3 rounded-full" style={{ background: color }} aria-hidden />
        {label}
      </p>
      <p className="mt-0.5 text-xl font-bold tracking-tight text-fg tabular">{value}</p>
    </div>
  )
}

// ── Status donut ─────────────────────────────────────────────────────────

/** Donut colours match the status badges' meaning. */
const STATUS_COLOR: Readonly<Record<InvoiceStatus, string>> = {
  paid: 'var(--chart-1)',
  pending: 'var(--chart-3)',
  overdue: 'var(--chart-2)',
  draft: 'var(--chart-5)',
  void: 'var(--chart-4)',
}

export function StatusDonut({ className }: { className?: string }) {
  const total = STATUS_BREAKDOWN.reduce((sum, slice) => sum + slice.count, 0)
  const animate = !useReducedMotion()
  return (
    <Card className={className}>
      <CardHeader title="Invoices by status" description="All time, excluding void" />
      <CardBody>
        <div className="relative mx-auto h-52 w-full max-w-60" aria-hidden>
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 240, height: 208 }}>
            <PieChart>
              <Pie isAnimationActive={animate} data={[...STATUS_BREAKDOWN]} dataKey="count" nameKey="label" innerRadius="70%" outerRadius="100%" paddingAngle={3} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}>
                {STATUS_BREAKDOWN.map((slice) => (
                  <Cell key={slice.status} fill={STATUS_COLOR[slice.status]} />
                ))}
              </Pie>
              <Tooltip content={(props) => <GlassTooltip props={props} format={(value) => `${formatNumber(value)} invoices`} />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-content-center text-center">
            <span className="text-3xl font-bold tracking-tight text-fg tabular">{total}</span>
            <span className="text-xs font-medium text-fg-muted">invoices</span>
          </div>
        </div>
        <ul className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3" aria-label="Invoices by status">
          {STATUS_BREAKDOWN.map((slice) => (
            <li key={slice.status} className="flex items-center gap-2.5">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: STATUS_COLOR[slice.status] }} aria-hidden />
              <span className="flex-1 text-sm text-fg-muted">{slice.label}</span>
              <span className="text-sm font-semibold text-fg tabular">
                {slice.count}
                <span className="ml-1 font-normal text-fg-muted">({Math.round((slice.count / total) * 100)}%)</span>
              </span>
            </li>
          ))}
        </ul>
      </CardBody>
    </Card>
  )
}
