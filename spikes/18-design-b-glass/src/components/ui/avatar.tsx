/**
 * Avatar: initials on a soft tone picked from the name, so the same person always gets the same
 * colour without uploading a photo. Optional presence dot.
 *
 * @example <Avatar name="Maya Okafor" size="sm" status="online" />
 */
import { cn } from '../../lib/cn.ts'
import { initials } from '../../lib/format.ts'
import { hashString } from '../../lib/random.ts'

const TONES = [
  'bg-tone-1-soft text-tone-1',
  'bg-tone-2-soft text-tone-2',
  'bg-tone-3-soft text-tone-3',
  'bg-tone-4-soft text-tone-4',
  'bg-tone-5-soft text-tone-5',
  'bg-tone-6-soft text-tone-6',
] as const

const SIZES = {
  xs: 'size-6 text-2xs',
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-14 text-lg',
  xl: 'size-20 text-2xl',
} as const

export interface AvatarProps {
  readonly name: string
  readonly size?: keyof typeof SIZES
  /** Square-ish avatars are used for companies, round ones for people. */
  readonly shape?: 'round' | 'square'
  readonly status?: 'online' | 'away'
  readonly className?: string
}

/** The tone class for a name (exported for tests and for tags that should match avatars). */
export function toneFor(name: string): string {
  return TONES[hashString(name) % TONES.length] ?? TONES[0]
}

export function Avatar({ name, size = 'sm', shape = 'round', status, className }: AvatarProps) {
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <span
        className={cn(
          'grid place-items-center font-semibold tracking-wide ring-2 ring-glass-border',
          SIZES[size],
          shape === 'round' ? 'rounded-full' : 'rounded-md',
          toneFor(name),
        )}
        aria-hidden
      >
        {initials(name)}
      </span>
      {status !== undefined && (
        <span
          className={cn('absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-surface', status === 'online' ? 'bg-success' : 'bg-warning')}
          aria-hidden
        />
      )}
    </span>
  )
}
