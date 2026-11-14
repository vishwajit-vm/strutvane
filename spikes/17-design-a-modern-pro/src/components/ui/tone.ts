/**
 * Tone → class maps. Every coloured accent in the UI (badges, avatars, icon chips, timeline dots)
 * goes through these maps, so a tone always looks the same and always uses a pair the contrast
 * test has verified (`text-success` on `bg-success-soft`, ...).
 *
 * @example
 * <span className={cn(TONE_SOFT.success, 'rounded-sm px-2')}>Paid</span>
 */
import type { Tone } from '../../data/people.ts'

export type { Tone }

/** Tinted surface + readable text (badges, avatars, icon chips). */
export const TONE_SOFT: Readonly<Record<Tone, string>> = {
  primary: 'bg-primary-soft text-primary-soft-foreground',
  success: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-info-soft text-info',
  neutral: 'bg-secondary text-secondary-foreground',
}

/** Text colour only (trend numbers, inline icons). */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  primary: 'text-primary-soft-foreground',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  neutral: 'text-muted-foreground',
}

/** Solid dot / bar fill (status dots, progress bars, timeline markers). */
export const TONE_FILL: Readonly<Record<Tone, string>> = {
  primary: 'bg-primary',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
  info: 'bg-info',
  neutral: 'bg-muted-foreground',
}
