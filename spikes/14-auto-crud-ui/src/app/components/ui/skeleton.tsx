/**
 * `<Skeleton>` and `<VisuallyHidden>`: two tiny presentational helpers.
 *
 * @module
 */
import type { ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * A grey loading placeholder. Decorative: the surrounding region carries `aria-busy`.
 *
 * @example
 * <Skeleton className="h-4 w-32" />
 */
export function Skeleton({ className }: { readonly className?: string }): ReactElement {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-md bg-muted motion-reduce:animate-none', className)} />
}

/**
 * Text that screen readers announce but sighted users do not see (Tailwind `sr-only`).
 *
 * @example
 * <VisuallyHidden>empty</VisuallyHidden>
 */
export function VisuallyHidden({ children }: { readonly children: ReactNode }): ReactElement {
  return <span className="sr-only">{children}</span>
}
