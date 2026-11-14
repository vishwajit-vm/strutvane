/**
 * Chart styling shared by every Recharts chart, so axes, grids and tooltips look identical:
 * muted 12px ticks without axis lines, dashed horizontal grid only, and a card-style tooltip.
 *
 * @example
 * <XAxis dataKey="month" {...AXIS_PROPS} />
 * <Tooltip content={<ChartTooltip format={formatMoney} />} cursor={CURSOR} />
 */
import type { ReactElement } from 'react'
import { cn } from '../lib/cn.ts'

/** Axis props: no lines, small muted ticks. */
export const AXIS_PROPS = {
  axisLine: false,
  tickLine: false,
  tick: { fill: 'var(--muted-foreground)', fontSize: 12 },
  tickMargin: 10,
} as const

/** Grid props: dashed horizontal lines only. */
export const GRID_PROPS = { vertical: false, stroke: 'var(--chart-grid)', strokeDasharray: '4 4' } as const

/** The hover cursor for line/area charts: a thin dashed guide. */
export const CURSOR = { stroke: 'var(--muted-foreground)', strokeOpacity: 0.4, strokeDasharray: '4 4' } as const

interface TooltipEntry {
  readonly name?: string | number
  readonly value?: number | string | readonly (number | string)[]
  readonly color?: string
  readonly dataKey?: string | number
}

/** Props Recharts passes to a custom tooltip, plus our formatter and series labels. */
export interface ChartTooltipProps {
  readonly active?: boolean
  readonly label?: string | number
  readonly payload?: readonly TooltipEntry[]
  readonly format: (value: number) => string
  readonly labels?: Readonly<Record<string, string>>
}

/**
 * A card-like tooltip: the label on top, then one row per series with its colour dot.
 */
export function ChartTooltip({ active, label, payload, format, labels = {} }: ChartTooltipProps): ReactElement | null {
  if (active !== true || payload === undefined || payload.length === 0) return null
  return (
    <div className="min-w-40 rounded-lg border border-border bg-popover px-3 py-2.5 text-popover-foreground shadow-lg">
      {label === undefined ? null : <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{label}</p>}
      <ul className="flex flex-col gap-1">
        {payload.map((entry) => {
          const key = String(entry.dataKey ?? entry.name ?? '')
          const value = typeof entry.value === 'number' ? format(entry.value) : String(entry.value ?? '')
          return (
            <li key={key} className="flex items-center gap-2 text-label">
              <span aria-hidden className="size-2 rounded-full" style={{ background: entry.color }} />
              <span className="text-muted-foreground">{labels[key] ?? entry.name}</span>
              <span className="ml-auto pl-3 font-bold text-foreground tabular">{value}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** A legend item: coloured dot + label (+ optional value). */
export function LegendDot({ color, label, value, className }: { readonly color: string; readonly label: string; readonly value?: string; readonly className?: string }): ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2 text-label text-muted-foreground', className)}>
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
      {value === undefined ? null : <span className="font-semibold text-foreground tabular">{value}</span>}
    </span>
  )
}
