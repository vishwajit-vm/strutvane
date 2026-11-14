/**
 * The Strutvane mark and wordmark, drawn for this mockup (an original "vane on a strut" glyph on
 * the brand gradient). Colours come from tokens, so the mark follows the accent hue and theme.
 *
 * @example
 * <Logo />            // mark + wordmark
 * <Logo compact />    // mark only (collapsed sidebar)
 */
import { useId, type ReactElement } from 'react'
import { cn } from '../lib/cn.ts'

/** The square mark on its own. */
export function LogoMark({ className }: { readonly className?: string }): ReactElement {
  const gradient = useId()
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8 shrink-0', className)}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--primary)" />
          <stop offset="1" stopColor="var(--primary-2)" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradient})`} />
      {/* The strut: a diagonal mast with a pivot at its foot. */}
      <path d="M10.5 22.5 21.5 9.5" stroke="var(--primary-foreground)" strokeWidth="2.6" strokeLinecap="round" />
      <circle cx="10" cy="23" r="2.4" fill="var(--primary-foreground)" />
      {/* The vane: a swept fin catching the wind. */}
      <path d="M21.5 9.5c-.6 3.8-2.7 6.4-6.4 7.6 1.2-3.6 3.4-6.2 6.4-7.6Z" fill="var(--primary-foreground)" opacity="0.85" />
    </svg>
  )
}

export function Logo({ compact = false, className }: { readonly compact?: boolean; readonly className?: string }): ReactElement {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <LogoMark />
      {compact ? null : <span className="text-lg font-extrabold tracking-tight text-foreground">strutvane</span>}
    </span>
  )
}
