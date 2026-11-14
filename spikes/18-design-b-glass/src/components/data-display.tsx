/**
 * Small data-display pieces shared by many screens: invoice StatusBadge, TrendChip, Sparkline,
 * EmptyState and the brand mark.
 *
 * @example
 *   <StatusBadge status="overdue" />
 *   <TrendChip delta={0.124} upIsGood />
 *   <Sparkline values={[3, 5, 4, 8]} label="Revenue, last 12 months, rising" />
 */
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { useId, type ReactNode } from 'react'
import { STATUS_LABEL, type InvoiceStatus } from '../data/invoices.ts'
import { cn } from '../lib/cn.ts'
import { formatDelta } from '../lib/format.ts'
import { Badge, type BadgeTone } from './ui/badge.tsx'

const STATUS_TONE: Readonly<Record<InvoiceStatus, BadgeTone>> = {
  paid: 'success',
  pending: 'info',
  overdue: 'danger',
  draft: 'neutral',
  void: 'warning',
}

/** The invoice status, always as text + dot (never colour alone). */
export function StatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <Badge tone={STATUS_TONE[status]} dot className={className}>
      {STATUS_LABEL[status]}
    </Badge>
  )
}

/** Tone class for a status (for charts and calendar dots that must match the badges). */
export function statusTone(status: InvoiceStatus): BadgeTone {
  return STATUS_TONE[status]
}

/**
 * "+12.4%" with an arrow. Green means GOOD, not "up": a rise in overdue money is shown in red.
 */
export function TrendChip({ delta, upIsGood = true, className }: { delta: number; upIsGood?: boolean; className?: string }) {
  const good = delta === 0 ? null : delta > 0 === upIsGood
  const Icon = delta >= 0 ? IconTrendingUp : IconTrendingDown
  return (
    <Badge tone={good === null ? 'neutral' : good ? 'success' : 'danger'} className={cn('h-5.5 gap-1 px-2', className)}>
      <Icon className="size-3.5" aria-hidden />
      <span>{formatDelta(delta)}</span>
    </Badge>
  )
}

export interface SparklineProps {
  readonly values: readonly number[]
  /** Accessible summary; the chart itself is an image to screen readers. */
  readonly label: string
  readonly tone?: 'primary' | 'success' | 'danger'
  readonly className?: string
}

const SPARK_TONE = { primary: 'var(--chart-1)', success: 'var(--success)', danger: 'var(--danger)' } as const

/** A tiny inline line chart with a gradient fill. Pure SVG: no chart library for 12 points. */
export function Sparkline({ values, label, tone = 'primary', className }: SparklineProps) {
  const gradientId = `${useId().replace(/:/g, '')}-spark`
  const width = 100
  const height = 32
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values.map((value, index) => [(index / Math.max(1, values.length - 1)) * width, height - 3 - ((value - min) / span) * (height - 6)] as const)
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const color = SPARK_TONE[tone]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={cn('h-8 w-24', className)} role="img" aria-label={label}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.32" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradientId})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export interface EmptyStateProps {
  readonly art: ReactNode
  readonly title: string
  readonly description: string
  readonly actions?: ReactNode
  readonly className?: string
}

/** A friendly, centred empty state: art, one sentence of help, and the next step. */
export function EmptyState({ art, title, description, actions, className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center px-6 py-14 text-center', className)}>
      <div className="mb-5">{art}</div>
      <h2 className="text-lg font-semibold tracking-tight text-fg">{title}</h2>
      <p className="mt-1.5 max-w-sm text-base text-fg-muted">{description}</p>
      {actions !== undefined && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
    </div>
  )
}

/** The Strutvane mark: a vane of three struts in the brand gradient. Original artwork. */
export function BrandMark({ className }: { className?: string }) {
  const id = `${useId().replace(/:/g, '')}-mark`
  return (
    <svg viewBox="0 0 32 32" className={cn('size-9', className)} aria-hidden focusable="false">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill={`url(#${id})`} />
      <path d="M9 21.5 L16 8 L23 21.5" fill="none" stroke="var(--primary-foreground)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12 17 H20" stroke="var(--primary-foreground)" strokeWidth="2.6" strokeLinecap="round" opacity="0.75" />
      <circle cx="16" cy="24.5" r="1.8" fill="var(--primary-foreground)" />
    </svg>
  )
}
