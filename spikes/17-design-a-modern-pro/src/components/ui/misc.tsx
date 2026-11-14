/**
 * Small display primitives used everywhere: `<Avatar>`, `<IconChip>`, `<Skeleton>`, `<Progress>`,
 * `<Kbd>`, `<Tooltip>` and `<TrendChip>`.
 *
 * They are grouped in one file because each is a few lines and they share the tone maps.
 *
 * @example
 * <Avatar name="Maya Okafor" tone="primary" size="md" status="online" />
 * <IconChip tone="success" icon={<IconCash />} />
 * <TrendChip value={12.4} good />
 */
import { IconTrendingDown, IconTrendingUp } from '@tabler/icons-react'
import { Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { formatPercentChange, initials } from '../../lib/format.ts'
import { TONE_FILL, TONE_SOFT, type Tone } from './tone.ts'

const AVATAR_SIZES = {
  xs: 'size-6 text-[0.625rem]',
  sm: 'size-8 text-xs',
  md: 'size-9.5 text-label',
  lg: 'size-12 text-base',
  xl: 'size-24 text-3xl',
} as const

/** Props of {@link Avatar}. */
export interface AvatarProps {
  readonly name: string
  readonly tone?: Tone
  readonly size?: keyof typeof AVATAR_SIZES
  /** Presence dot in the corner. */
  readonly status?: 'online' | 'away' | 'offline'
  readonly className?: string
}

/**
 * Initials on a tinted disc. Decorative by default (`aria-hidden`), because the person's name is
 * always printed next to it; repeating it would make screen readers say every name twice.
 */
export function Avatar({ name, tone = 'primary', size = 'md', status, className }: AvatarProps): ReactElement {
  return (
    <span aria-hidden className={cn('relative inline-grid shrink-0 select-none place-items-center rounded-full font-bold', AVATAR_SIZES[size], TONE_SOFT[tone], className)}>
      {initials(name)}
      {status === undefined ? null : (
        <span
          className={cn(
            'absolute bottom-0 right-0 size-2.5 rounded-full ring-2 ring-card',
            status === 'online' ? 'bg-success' : status === 'away' ? 'bg-warning' : 'bg-muted-foreground',
            size === 'xl' && 'bottom-1.5 right-1.5 size-4 ring-4',
          )}
        />
      )}
    </span>
  )
}

/** A stack of overlapping avatars with a "+N" counter. */
export function AvatarGroup({ people, max = 4 }: { readonly people: readonly { readonly name: string; readonly tone: Tone }[]; readonly max?: number }): ReactElement {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="flex -space-x-2">
      {shown.map((person) => (
        <Avatar key={person.name} name={person.name} tone={person.tone} size="sm" className="ring-2 ring-card" />
      ))}
      {rest > 0 ? <span className="grid size-8 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground ring-2 ring-card">+{rest}</span> : null}
    </span>
  )
}

/** A tinted rounded square holding an icon: the signature accent of the design's cards. */
export function IconChip({ icon, tone = 'primary', size = 'md', className }: { readonly icon: ReactNode; readonly tone?: Tone; readonly size?: 'sm' | 'md' | 'lg'; readonly className?: string }): ReactElement {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-lg',
        size === 'sm' && 'size-8 [&_svg]:size-4',
        size === 'md' && 'size-10 [&_svg]:size-5',
        size === 'lg' && 'size-12 rounded-xl [&_svg]:size-6',
        TONE_SOFT[tone],
        className,
      )}
    >
      {icon}
    </span>
  )
}

/** Loading placeholder with a slow shimmer sweep (disabled under reduced motion by styles.css). */
export function Skeleton({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return (
    <div
      aria-hidden
      className={cn(
        'relative overflow-hidden rounded-md bg-subtle',
        'after:absolute after:inset-0 after:-translate-x-full after:animate-shimmer after:bg-linear-to-r after:from-transparent after:via-card/60 after:to-transparent',
        className,
      )}
      {...props}
    />
  )
}

/** A thin progress bar. `label` becomes its accessible name. */
export function Progress({ value, tone = 'primary', label, className }: { readonly value: number; readonly tone?: Tone; readonly label: string; readonly className?: string }): ReactElement {
  const clamped = Math.max(0, Math.min(100, value))
  return (
    <div role="progressbar" aria-label={label} aria-valuenow={Math.round(clamped)} aria-valuemin={0} aria-valuemax={100} className={cn('h-1.5 w-full overflow-hidden rounded-full bg-subtle', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', TONE_FILL[tone])} style={{ width: `${clamped}%` }} />
    </div>
  )
}

/** A keyboard key (`⌘K`, `Esc`). */
export function Kbd({ className, ...props }: ComponentProps<'kbd'>): ReactElement {
  return (
    <kbd
      className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-[0.3rem] border border-border bg-card px-1.5 font-sans text-overline font-semibold tracking-normal text-muted-foreground shadow-xs', className)}
      {...props}
    />
  )
}

/** Trend with arrow: green when good news, red when bad, whichever direction the number moved. */
export function TrendChip({ value, good, className }: { readonly value: number; readonly good: boolean; readonly className?: string }): ReactElement {
  const Icon = value >= 0 ? IconTrendingUp : IconTrendingDown
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-sm px-1.5 text-xs font-bold tabular', good ? TONE_SOFT.success : TONE_SOFT.danger, className)}>
      <Icon aria-hidden className="size-3.5" stroke={2.25} />
      {formatPercentChange(value)}
    </span>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider

/**
 * A short label on hover/focus. Only for icon-only buttons that already have an `aria-label`;
 * never put essential information in a tooltip.
 */
export function Tooltip({ content, children, side = 'top' }: { readonly content: ReactNode; readonly children: ReactElement; readonly side?: 'top' | 'right' | 'bottom' | 'left' }): ReactElement {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={6} className="z-50 rounded-md bg-foreground px-2 py-1 text-xs font-medium text-background shadow-md animate-fade-in">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}
