/**
 * Card: the main container. Two materials (DESIGN-B.md §3):
 *   - `glass` (default): translucent, for summaries, KPIs, charts and short text;
 *   - `solid`: near-opaque, for tables, forms and long text, so reading never depends on the backdrop.
 *
 * @example
 *   <Card>
 *     <CardHeader title="Revenue" description="Last 12 months" actions={<Button size="sm">Export</Button>} />
 *     <CardBody>…</CardBody>
 *   </Card>
 */
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export interface CardProps extends ComponentProps<'section'> {
  readonly material?: 'glass' | 'solid'
  /** Lift slightly on hover: for cards that are links or open something. */
  readonly interactive?: boolean
}

export function Card({ material = 'glass', interactive = false, className, ...props }: CardProps) {
  return (
    <section
      className={cn(
        'min-w-0 rounded-xl',
        material === 'glass' ? 'glass-card' : 'surface',
        interactive && 'transition-base hover:-translate-y-0.5 hover:shadow-float',
        className,
      )}
      {...props}
    />
  )
}

export interface CardHeaderProps {
  readonly title: ReactNode
  readonly description?: ReactNode
  /** Buttons or menus, vertically centred against the title. */
  readonly actions?: ReactNode
  /** Heading level for the title; defaults to h2 (cards sit under the page's h1). */
  readonly as?: 'h2' | 'h3'
  readonly icon?: ReactNode
  readonly className?: string
}

export function CardHeader({ title, description, actions, as: Heading = 'h2', icon, className }: CardHeaderProps) {
  return (
    <header className={cn('flex items-center gap-3 px-5 pt-5 pb-3 sm:px-6', className)}>
      {icon !== undefined && (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary-soft-fg [&_svg]:size-[1.15rem]" aria-hidden>
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <Heading className="truncate text-md font-semibold tracking-tight text-fg">{title}</Heading>
        {description !== undefined && <p className="truncate text-sm text-fg-muted">{description}</p>}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  )
}

export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('px-5 pb-5 sm:px-6 sm:pb-6', className)} {...props} />
}
