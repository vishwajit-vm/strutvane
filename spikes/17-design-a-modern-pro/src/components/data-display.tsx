/**
 * Data display pieces shared across screens: `<StatusBadge>` (invoice status), `<Sparkline>`,
 * `<Timeline>`, `<EmptyState>`, `<PersonCell>` and `<DescriptionList>`.
 *
 * @module
 */
import { useId, type ReactElement, type ReactNode } from 'react'
import type { InvoiceStatus } from '../data/invoices.ts'
import { cn } from '../lib/cn.ts'
import { EmptyIllustration } from './illustrations.tsx'
import { Badge } from './ui/badge.tsx'
import { Avatar } from './ui/misc.tsx'
import { TONE_FILL, TONE_SOFT, type Tone } from './ui/tone.ts'

/** Status → colour and label. One map, so the list, board, calendar and detail never disagree. */
export const STATUS_META: Readonly<Record<InvoiceStatus, { readonly label: string; readonly tone: Tone }>> = {
  draft: { label: 'Draft', tone: 'neutral' },
  pending: { label: 'Pending', tone: 'info' },
  partial: { label: 'Partly paid', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  overdue: { label: 'Overdue', tone: 'danger' },
}

/**
 * The status of an invoice as a soft badge with a dot.
 *
 * @example
 * <StatusBadge status="overdue" />
 */
export function StatusBadge({ status, className }: { readonly status: InvoiceStatus; readonly className?: string }): ReactElement {
  const meta = STATUS_META[status]
  return (
    <Badge tone={meta.tone} dot className={className}>
      {meta.label}
    </Badge>
  )
}

/** Stroke colours for sparklines and charts, per tone (CSS variables, theme-aware). */
export const TONE_STROKE: Readonly<Record<Tone, string>> = {
  primary: 'var(--chart-1)',
  success: 'var(--chart-5)',
  warning: 'var(--chart-3)',
  danger: 'var(--chart-4)',
  info: 'var(--chart-2)',
  neutral: 'var(--muted-foreground)',
}

/**
 * A tiny trend line with a soft gradient fill. Pure SVG (no chart library) so dozens of them in a
 * table cost nothing. Decorative: the number it illustrates is always printed beside it.
 *
 * @example
 * <Sparkline values={[3, 5, 4, 8]} tone="success" />
 */
export function Sparkline({ values, tone = 'primary', className, width = 120, height = 40, endDot = true }: { readonly values: readonly number[]; readonly tone?: Tone; readonly className?: string; readonly width?: number; readonly height?: number; /** Marks the latest value; turn off when the SVG is stretched (the dot would turn oval). */ readonly endDot?: boolean }): ReactElement {
  const gradient = useId()
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = width / Math.max(1, values.length - 1)
  const points = values.map((value, index) => [index * step, height - 3 - ((value - min) / range) * (height - 6)] as const)
  const line = points.map(([x, y], index) => `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')
  const last = points.at(-1) ?? [0, 0]
  return (
    <svg viewBox={`0 0 ${width} ${height}`} aria-hidden className={cn('overflow-visible', className)} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={TONE_STROKE[tone]} stopOpacity="0.32" />
          <stop offset="1" stopColor={TONE_STROKE[tone]} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line} L${width} ${height} L0 ${height} Z`} fill={`url(#${gradient})`} />
      <path d={line} fill="none" stroke={TONE_STROKE[tone]} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {endDot ? <circle cx={last[0]} cy={last[1]} r="3" fill="var(--card)" stroke={TONE_STROKE[tone]} strokeWidth="2" vectorEffect="non-scaling-stroke" /> : null}
    </svg>
  )
}

/** One entry of a {@link Timeline}. */
export interface TimelineEntry {
  readonly id: string
  readonly tone: Tone
  readonly title: ReactNode
  readonly time: string
  readonly body?: ReactNode
  readonly icon?: ReactNode
}

/**
 * A vertical activity timeline: tinted markers on a hairline rail, title + time on one row and an
 * optional detail box underneath.
 */
export function Timeline({ entries }: { readonly entries: readonly TimelineEntry[] }): ReactElement {
  return (
    <ol className="relative flex flex-col">
      {entries.map((entry, index) => (
        <li key={entry.id} className="relative flex gap-4 pb-6 last:pb-0">
          {index < entries.length - 1 ? <span aria-hidden className="absolute left-[0.6875rem] top-7 bottom-1 w-px bg-border" /> : null}
          {entry.icon === undefined ? (
            <span aria-hidden className={cn('relative mt-1 grid size-5.5 shrink-0 place-items-center rounded-full', TONE_SOFT[entry.tone])}>
              <span className={cn('size-2.5 rounded-full', TONE_FILL[entry.tone])} />
            </span>
          ) : (
            <span aria-hidden className={cn('relative grid size-7 shrink-0 place-items-center rounded-full -ml-0.5 [&_svg]:size-4', TONE_SOFT[entry.tone])}>
              {entry.icon}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3">
              <p className="text-sm text-foreground">{entry.title}</p>
              <p className="shrink-0 text-xs text-muted-foreground">{entry.time}</p>
            </div>
            {entry.body === undefined ? null : <div className="mt-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-label text-muted-foreground">{entry.body}</div>}
          </div>
        </li>
      ))}
    </ol>
  )
}

/**
 * An empty state with an illustration, a friendly sentence and a way forward.
 *
 * @example
 * <EmptyState title="No invoices yet" description="Create one to get paid." action={<Button>New invoice</Button>} />
 */
export function EmptyState({ title, description, action, className }: { readonly title: string; readonly description: ReactNode; readonly action?: ReactNode; readonly className?: string }): ReactElement {
  return (
    <div className={cn('mx-auto flex max-w-sm flex-col items-center px-4 py-12 text-center', className)}>
      <EmptyIllustration className="mb-6 w-44" />
      <h2 className="text-lg font-semibold text-foreground">{title}</h2>
      <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
      {action === undefined ? null : <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  )
}

/** Avatar + name + secondary line, the standard "who" cell. */
export function PersonCell({ name, secondary, tone, size = 'md' }: { readonly name: string; readonly secondary?: string; readonly tone: Tone; readonly size?: 'sm' | 'md' }): ReactElement {
  return (
    <span className="flex min-w-0 items-center gap-3">
      <Avatar name={name} tone={tone} size={size} />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold text-foreground">{name}</span>
        {secondary === undefined ? null : <span className="block truncate text-xs text-muted-foreground">{secondary}</span>}
      </span>
    </span>
  )
}

/** A two-column label/value list (detail pages). Labels are muted, values strong. */
export function DescriptionList({ items, className }: { readonly items: readonly { readonly label: string; readonly value: ReactNode }[]; readonly className?: string }): ReactElement {
  return (
    <dl className={cn('grid gap-x-8 gap-y-5 sm:grid-cols-2', className)}>
      {items.map((item) => (
        <div key={item.label} className="min-w-0">
          <dt className="text-label text-muted-foreground">{item.label}</dt>
          <dd className="mt-1 text-sm font-semibold text-foreground">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
