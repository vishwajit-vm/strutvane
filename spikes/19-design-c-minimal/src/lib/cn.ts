/**
 * Join class names and let later Tailwind classes win over earlier ones.
 *
 * Why: components ship sensible defaults and callers pass `className` to adjust them; without the
 * merge, `cn('h-8', 'h-9')` would keep both classes and the winner would depend on CSS order.
 *
 * @example cn('h-8 px-3', isWide && 'px-4') // → 'h-8 px-4'
 */
import { type ClassValue, clsx } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge the custom type scale, so `text-sm` (a size) and `text-fg` (a colour) are
// not treated as the same group and both survive a merge.
const merge = extendTailwindMerge({
  extend: {
    // The density and shell sizes from tokens.css (`h-control-md`, `w-sidebar`), so a caller's
    // `h-auto` or `h-control-lg` correctly replaces a component's default height.
    theme: { spacing: ['control-sm', 'control-md', 'control-lg', 'row-compact', 'row-default', 'row-comfortable', 'sidebar', 'topbar'] },
    classGroups: {
      'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'lg', 'xl', '2xl', '3xl'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
