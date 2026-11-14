/**
 * `<Badge>`: a small status or count label. Soft (tinted) by default, which reads calmly in dense
 * tables; `solid` is for counts on the accent (sidebar, tabs), `outline` for neutral metadata.
 *
 * @example
 * <Badge tone="success" dot>Paid</Badge>
 * <Badge tone="primary" variant="solid">12</Badge>
 */
import type { ComponentProps, ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'
import { TONE_FILL, TONE_SOFT, type Tone } from './tone.ts'

/** Props of {@link Badge}. */
export interface BadgeProps extends ComponentProps<'span'> {
  readonly tone?: Tone
  readonly variant?: 'soft' | 'solid' | 'outline'
  /** A leading dot in the tone colour (status badges). */
  readonly dot?: boolean
}

export function Badge({ tone = 'neutral', variant = 'soft', dot = false, className, children, ...props }: BadgeProps): ReactElement {
  return (
    <span
      data-slot="badge"
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2 text-xs font-semibold',
        variant === 'soft' && TONE_SOFT[tone],
        variant === 'solid' && 'h-5 min-w-5 justify-center rounded-full bg-primary px-1.5 text-primary-foreground',
        variant === 'outline' && 'border border-border text-muted-foreground',
        className,
      )}
      {...props}
    >
      {dot ? <span aria-hidden className={cn('size-1.5 rounded-full', TONE_FILL[tone])} /> : null}
      {children}
    </span>
  )
}
