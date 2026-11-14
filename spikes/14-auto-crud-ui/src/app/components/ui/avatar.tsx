/**
 * `<Avatar>`: initials in a soft-coloured circle. No images, so nothing to load or license.
 *
 * @module
 */
import type { ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

/** Soft background + strong text pairs from the theme (all checked for contrast). */
const TONES = ['bg-primary-soft text-primary-soft-foreground', 'bg-success-soft text-success', 'bg-warning-soft text-warning', 'bg-destructive-soft text-destructive'] as const

/**
 * Up to two initials from a name or an email address.
 *
 * @example
 * initials('Asha Rao') // 'AR'
 * initials('ben@example.com') // 'B'
 */
export function initials(name: string): string {
  const words = name.split('@')[0]?.split(/[\s._-]+/).filter((word) => word !== '') ?? []
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/**
 * An initials avatar. The colour is picked from the name, so the same person always looks the
 * same. Decorative: the name itself must be in the surrounding text or label.
 *
 * @example
 * <Avatar name="Asha Rao" />
 */
export function Avatar({ name, className }: { readonly name: string; readonly className?: string }): ReactElement {
  const tone = TONES[[...name].reduce((sum, character) => sum + character.charCodeAt(0), 0) % TONES.length] ?? TONES[0]
  return (
    <span aria-hidden="true" className={cn('inline-flex size-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold', tone, className)}>
      {initials(name) || '?'}
    </span>
  )
}
