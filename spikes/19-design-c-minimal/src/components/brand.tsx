/**
 * The Strutvane mark and wordmark: an original drawing (a strut carrying a vane), made for this
 * mockup. It is drawn with `currentColor` and the surface token, so it follows the theme.
 *
 * @example <Logo /> // mark + wordmark
 */
import { cn } from '../lib/cn.ts'

/** The 20 px mark alone (collapsed sidebar, favicon-sized places). */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn('size-6 shrink-0', className)}>
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M7.5 17.5 13.5 6.5" stroke="var(--surface)" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13.5 6.5h4.2l-2.6 4.4h-4.1z" fill="var(--surface)" />
    </svg>
  )
}

/** Mark + "Strutvane" wordmark. The text is real text, so it is readable and translatable. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-fg', className)}>
      <LogoMark />
      <span className="text-base font-semibold tracking-(--tracking-title)">Strutvane</span>
    </span>
  )
}
