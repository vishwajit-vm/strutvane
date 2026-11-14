/**
 * Sparkline: a 1.5 px trend line with a soft area fill, drawn as plain SVG (no chart library),
 * because KPI cards render several at once and need nothing but a shape.
 *
 * It is decorative (`aria-hidden`): the KPI card states the number and the delta in text.
 *
 * @example <Sparkline values={[3, 5, 4, 8, 7, 9]} tone="accent" />
 */
import { useId } from 'react'
import { cn } from '../lib/cn.ts'

/** Map a series onto an SVG path inside `width × height`, with 2 px of padding top and bottom. */
export function sparkPath(values: readonly number[], width: number, height: number): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / (values.length - 1)
  return values.map((value, index) => `${index === 0 ? 'M' : 'L'}${(index * step).toFixed(1)} ${(height - 2 - ((value - min) / range) * (height - 4)).toFixed(1)}`).join(' ')
}

const STROKE = { accent: 'var(--chart-1)', success: 'var(--success)', danger: 'var(--danger)', neutral: 'var(--chart-3)' } as const

export function Sparkline({ values, tone = 'accent', className }: { values: readonly number[]; tone?: keyof typeof STROKE; className?: string }) {
  const gradient = useId()
  const width = 120
  const height = 32
  const line = sparkPath(values, width, height)
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden className={cn('h-8 w-full overflow-visible', className)}>
      <defs>
        <linearGradient id={gradient} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" style={{ stopColor: STROKE[tone], stopOpacity: 0.16 }} />
          <stop offset="100%" style={{ stopColor: STROKE[tone], stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradient})`} />
      <path d={line} fill="none" style={{ stroke: STROKE[tone] }} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
