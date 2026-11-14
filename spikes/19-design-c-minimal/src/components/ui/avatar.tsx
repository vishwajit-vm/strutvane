/**
 * Avatar: initials on a desaturated tint. No photos in the mockup (no third-party images), and
 * initials stay legible in both themes because the tint and text colour are both tokens.
 *
 * @example
 * <Avatar name="Maya Okafor" tint={1} />
 * <Avatar name="Halcyon Freight" tint={3} shape="square" size="lg" />
 */
import { initials } from '../../lib/format.ts'
import { cn } from '../../lib/cn.ts'
import type { Tint } from '../../data/people.ts'

const TINT: Record<Tint, string> = {
  1: 'bg-avatar-1',
  2: 'bg-avatar-2',
  3: 'bg-avatar-3',
  4: 'bg-avatar-4',
  5: 'bg-avatar-5',
}

const SIZE = {
  xs: 'size-5 text-2xs',
  sm: 'size-6 text-2xs',
  md: 'size-8 text-xs',
  lg: 'size-10 text-sm',
  xl: 'size-16 text-xl',
} as const

interface AvatarProps {
  name: string
  tint: Tint
  size?: keyof typeof SIZE
  /** People are round; organisations are rounded squares, so the two never get confused. */
  shape?: 'circle' | 'square'
  /** When the name is already visible next to the avatar, hide it from screen readers. */
  decorative?: boolean
  className?: string
}

export function Avatar({ name, tint, size = 'sm', shape = 'circle', decorative = true, className }: AvatarProps) {
  return (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': name })}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center font-semibold text-avatar-fg ring-1 ring-border',
        shape === 'circle' ? 'rounded-full' : 'rounded-md',
        TINT[tint],
        SIZE[size],
        className,
      )}
    >
      {initials(name)}
    </span>
  )
}

/** Overlapping avatars for "who is involved", with a `+N` counter after `max`. */
export function AvatarStack({ people, max = 3 }: { people: readonly { name: string; tint: Tint }[]; max?: number }) {
  const shown = people.slice(0, max)
  const rest = people.length - shown.length
  return (
    <span className="flex items-center -space-x-1.5" aria-label={people.map((person) => person.name).join(', ')} role="img">
      {shown.map((person) => (
        <Avatar key={person.name} name={person.name} tint={person.tint} size="xs" className="ring-2 ring-surface" />
      ))}
      {rest > 0 && <span className="z-0 inline-flex size-5 items-center justify-center rounded-full bg-muted text-2xs font-medium text-fg-muted ring-2 ring-surface">+{rest}</span>}
    </span>
  )
}
