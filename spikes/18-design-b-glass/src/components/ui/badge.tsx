/**
 * Badge: a small pill for status, counts and tags. Tones map to the status tokens, whose text on
 * soft fill is AA-verified over glass and over solid surfaces (test/contrast.test.ts).
 *
 * @example
 *   <Badge tone="success" dot>Paid</Badge>
 *   <Badge tone="neutral">86</Badge>
 */
import type { ComponentProps } from 'react'
import { cn } from '../../lib/cn.ts'

export type BadgeTone = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'neutral'

const TONES: Readonly<Record<BadgeTone, string>> = {
  primary: 'bg-primary-soft text-primary-soft-fg',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-neutral-soft text-fg-muted',
}

export interface BadgeProps extends ComponentProps<'span'> {
  readonly tone?: BadgeTone
  /** Show a leading status dot (colour is never the only signal: the label is always there). */
  readonly dot?: boolean
}

export function Badge({ tone = 'neutral', dot = false, className, children, ...props }: BadgeProps) {
  return (
    <span
      className={cn('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold tabular', TONES[tone], className)}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  )
}
