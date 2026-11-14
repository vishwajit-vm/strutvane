/**
 * True when the user asked the OS for reduced motion.
 *
 * Why a hook: CSS transitions already read the motion tokens (0 ms under reduced motion), but
 * JavaScript animations, like Recharts' draw-in, must be switched off explicitly.
 *
 * @example <Area isAnimationActive={!useReducedMotion()} />
 */
import { useSyncExternalStore } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function subscribe(onChange: () => void): () => void {
  if (typeof window.matchMedia !== 'function') return () => undefined
  const query = window.matchMedia(QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches,
    () => false,
  )
}
