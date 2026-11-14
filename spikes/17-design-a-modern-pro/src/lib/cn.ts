/**
 * `cn()`: join class names and let later Tailwind classes win over earlier ones.
 *
 * Why tailwind-merge is extended: the design adds two type steps (`text-label`, `text-overline`)
 * and a `shadow-primary`. Without telling tailwind-merge what they are, it would treat
 * `text-label` as a text *colour* and silently drop `text-muted-foreground` next to it.
 *
 * @example
 * cn('px-4 text-sm', isActive && 'bg-primary', className)
 */
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const merge = extendTailwindMerge({
  extend: {
    theme: { text: ['label', 'overline'] },
    classGroups: { shadow: [{ shadow: ['primary'] }] },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
