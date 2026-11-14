/**
 * Card (panel): a surface with a hairline border and an 8 px radius. Crisp uses borders, not
 * shadows, to separate content, so cards sit flat on the page and only floating layers lift.
 *
 * @example
 * <Card>
 *   <CardHeader title="Revenue" description="Last 12 months" actions={<Button size="sm">Export</Button>} />
 *   <CardBody>…</CardBody>
 * </Card>
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export function Card({ className, ...props }: ComponentProps<'section'>) {
  return <section className={cn('min-w-0 rounded-lg border border-border bg-surface', className)} {...props} />
}

interface CardHeaderProps {
  title: ReactNode
  /** Rendered as the heading text; `h2` by default so page outlines stay correct. */
  as?: 'h2' | 'h3'
  description?: ReactNode
  actions?: ReactNode
  className?: string
  id?: string
}

/** Title row: heading and optional description on the left, actions vertically centred on the right. */
export function CardHeader({ title, as: Heading = 'h2', description, actions, className, id }: CardHeaderProps) {
  return (
    <header className={cn('flex min-h-12 items-center gap-3 px-4 py-3', className)}>
      <div className="min-w-0 flex-1">
        <Heading id={id} className="truncate text-sm font-semibold text-fg">
          {title}
        </Heading>
        {description !== undefined && <p className="mt-0.5 truncate text-xs text-fg-subtle">{description}</p>}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
    </header>
  )
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-4 pb-4', className)} {...props} />
}

/** A footer strip separated by a hairline, for "View all" links and totals. */
export function CardFooter({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex items-center border-t border-border px-4 py-2.5', className)} {...props} />
}

/** A loading placeholder block. `aria-hidden`: the surrounding region announces `aria-busy`. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cn('block animate-shimmer rounded-sm bg-muted', className)} />
}
