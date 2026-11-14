/**
 * `cn()`: join class names and let later Tailwind classes win over earlier ones, the helper every
 * shadcn component uses.
 *
 * Why tailwind-merge: a component's default `px-3` must yield to a caller's `px-6`; plain string
 * joining would keep both and the result would depend on CSS order.
 *
 * @module
 */
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Combine class names, resolving Tailwind conflicts.
 *
 * @example
 * cn('px-3 text-sm', isActive && 'bg-accent', 'px-6') // 'text-sm bg-accent px-6'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
