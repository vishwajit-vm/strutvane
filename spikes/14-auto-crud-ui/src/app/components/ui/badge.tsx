/**
 * `<Badge>`: a small label for enum values and states such as "Deleted".
 *
 * @module
 */
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * Props of {@link Badge}.
 *
 * @example
 * const props: BadgeProps = { tone: 'muted', children: 'draft' }
 */
export interface BadgeProps {
  readonly children: ReactNode
  readonly tone?: 'default' | 'muted' | 'danger'
  readonly className?: string
}

const TONES = {
  default: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
  danger: 'bg-destructive/10 text-destructive',
} as const

/**
 * A badge. Its text carries the meaning; colour only reinforces it (WCAG: colour is never the
 * only signal).
 *
 * @example
 * <Badge tone="danger">Deleted</Badge>
 */
export function Badge({ children, tone = 'default', className }: BadgeProps): ReactElement {
  return <span className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', TONES[tone], className)}>{children}</span>
}
