/**
 * `useMediaQuery()`: true while a CSS media query matches; updates live on resize.
 *
 * Used where layout must change *behaviour*, not just style (the sidebar becomes a drawer below
 * `lg`, the calendar becomes an agenda on phones). Pure styling stays in Tailwind breakpoints.
 *
 * @example
 * const isDesktop = useMediaQuery(DESKTOP_QUERY)
 */
import { useSyncExternalStore } from 'react'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** The breakpoint where the sidebar is docked instead of a drawer (Tailwind `lg`). */
export const DESKTOP_QUERY = '(min-width: 1024px)'

/** Phones (below Tailwind `sm`). */
export const PHONE_QUERY = '(max-width: 639px)'
