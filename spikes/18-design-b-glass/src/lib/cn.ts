/**
 * Join class names and let later Tailwind utilities win over earlier ones.
 *
 * Why: components accept a `className` override; `twMerge` makes `cn('px-4', 'px-2')` → `px-2`
 * instead of leaving both and depending on stylesheet order.
 *
 * @example cn('rounded-md px-3', isActive && 'bg-primary-soft', className)
 */
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

// Teach tailwind-merge our custom type scale, so `text-sm` and `text-fg` are not treated as the
// same group (one is a size, the other a colour) and both survive the merge.
const merge = extendTailwindMerge({
  extend: { classGroups: { 'font-size': [{ text: ['2xs', 'xs', 'sm', 'base', 'md', 'lg', 'xl', '2xl', '3xl'] }] } },
})

export function cn(...inputs: ClassValue[]): string {
  return merge(clsx(inputs))
}
