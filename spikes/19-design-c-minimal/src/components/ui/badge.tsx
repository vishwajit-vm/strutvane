/**
 * Badges and status indicators.
 *
 * Crisp keeps status quiet: a small coloured dot plus a text label in the normal text colour,
 * on a neutral pill. Colour is a hint; the word carries the meaning (WCAG 1.4.1), and a screen
 * full of statuses still reads calm instead of like a traffic light.
 *
 * @example
 * <StatusBadge tone="success">Paid</StatusBadge>
 * <Badge>12</Badge>
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export type Tone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const DOT: Record<Tone, string> = {
  neutral: 'bg-neutral',
  accent: 'bg-accent',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
}

/** A 6 px status dot. Decorative: always pair it with a visible label. */
export function StatusDot({ tone, className }: { tone: Tone; className?: string }) {
  return <span aria-hidden className={cn('inline-block size-1.5 shrink-0 rounded-full', DOT[tone], className)} />
}

/** Dot + label on a hairline pill: the standard status token in tables, headers and cards. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-5 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border bg-surface px-2 text-xs font-medium text-fg',
        className,
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  )
}

const BADGE: Record<Tone, string> = {
  neutral: 'bg-subtle text-fg-muted border-border',
  accent: 'bg-accent-subtle text-accent-text border-transparent',
  success: 'bg-success-subtle text-success-text border-transparent',
  warning: 'bg-warning-subtle text-warning-text border-transparent',
  danger: 'bg-danger-subtle text-danger-text border-transparent',
}

/** A small filled label for counts, roles and tags. */
export function Badge({ tone = 'neutral', className, ...props }: ComponentProps<'span'> & { tone?: Tone }) {
  return (
    <span
      className={cn('inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm border px-1.5 text-xs font-medium tabular', BADGE[tone], className)}
      {...props}
    />
  )
}

/** A keyboard key hint, e.g. `<Kbd>⌘</Kbd><Kbd>K</Kbd>`. Hidden from screen readers by callers when redundant. */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>) {
  return (
    <kbd
      className={cn(
        'inline-flex h-5 min-w-5 items-center justify-center rounded-xs border border-border bg-subtle px-1 font-sans text-2xs font-medium text-fg-muted',
        className,
      )}
      {...props}
    />
  )
}
