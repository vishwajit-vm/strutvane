/**
 * KPI card: label, big tabular number, a delta pill that knows whether "up" is good, and a
 * sparkline. The number uses the mono face with tight tracking so a row of KPIs aligns digit by digit.
 *
 * @example
 * <KpiCard label="Revenue" value="€482.9K" delta={12.4} goodWhen="up" trend={[…]} hint="vs. previous 30 days" />
 */
import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { Sparkline } from '../../components/sparkline.tsx'
import { cn } from '../../lib/cn.ts'
import { formatDelta } from '../../lib/format.ts'

export interface Kpi {
  label: string
  value: string
  /** Change versus the previous period, in percent (or in `unit`). */
  delta: number
  unit?: string
  /** Whether a rising number is good news (revenue) or bad news (overdue). */
  goodWhen: 'up' | 'down'
  trend: readonly number[]
  hint: string
}

export function KpiCard({ label, value, delta, unit = '%', goodWhen, trend, hint }: Kpi) {
  const good = delta === 0 || (delta > 0) === (goodWhen === 'up')
  const Arrow = delta >= 0 ? ArrowUpRight : ArrowDownRight
  return (
    <div className="flex min-w-0 flex-col rounded-lg border border-border bg-surface p-4">
      <h2 className="text-sm font-medium text-fg-muted">{label}</h2>
      <div className="mt-2 flex items-baseline gap-2">
        <p className="figure text-2xl font-semibold text-fg">{value}</p>
        <span
          className={cn(
            'inline-flex h-5 items-center gap-0.5 rounded-sm px-1 text-xs font-medium tabular',
            good ? 'bg-success-subtle text-success-text' : 'bg-danger-subtle text-danger-text',
          )}
        >
          <Arrow aria-hidden className="size-3" />
          <span className="sr-only">{delta >= 0 ? 'Up' : 'Down'}</span>
          {formatDelta(delta, unit).replace(/^[+−]/, '')}
        </span>
      </div>
      <p className="mt-1 text-xs text-fg-subtle">{hint}</p>
      <Sparkline values={trend} tone={good ? 'accent' : 'danger'} className="mt-3" />
    </div>
  )
}
