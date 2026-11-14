/**
 * PageHeader: breadcrumb, then one row with back button, title, count/status and actions.
 *
 * The rule the lead asked for: the title and the primary action share one row and one vertical
 * centre line (`items-center` on a 36 px row), whatever the title length. On phones the actions
 * wrap under the title instead of squeezing it.
 *
 * @example
 * <PageHeader
 *   breadcrumbs={[{ label: 'Billing', to: '/' }, { label: 'Invoices' }]}
 *   back="/"
 *   title="Invoices"
 *   count={238}
 *   actions={<><Button>Export</Button><Button variant="primary">New invoice</Button></>}
 * />
 */
import { ArrowLeft, ChevronRight } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { formatCount } from '../lib/format.ts'
import { Link } from '../lib/router.tsx'
import { Button } from './ui/button.tsx'
import { Tooltip } from './ui/menu.tsx'

export interface Crumb {
  label: string
  /** Omit on the last crumb (the current page). */
  to?: string
}

/** Breadcrumb trail; the last item is the current page (`aria-current="page"`). */
export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1 text-xs text-fg-subtle">
        {items.map((item, index) => (
          <li key={item.label} className="flex min-w-0 items-center gap-1">
            {index > 0 && <ChevronRight aria-hidden className="size-3 shrink-0 text-fg-subtle/70" />}
            {item.to !== undefined ? (
              <Link to={item.to} className="truncate rounded-xs hover:text-fg">
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate text-fg-muted">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}

interface PageHeaderProps {
  title: ReactNode
  breadcrumbs?: readonly Crumb[]
  /** Where the back button goes; omit to hide it (top-level pages). */
  back?: string
  /** A count shown next to the title, e.g. the number of records. */
  count?: number
  /** Inline next to the title: a status badge, a "Draft" marker. */
  meta?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  className?: string
}

export function PageHeader({ title, breadcrumbs, back, count, meta, description, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('flex flex-col gap-2', className)}>
      {breadcrumbs !== undefined && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-3">
        {/* Grows on desktop; on phones a 16rem basis pushes the actions onto their own row. */}
        <div className="flex min-h-9 min-w-0 flex-[1_1_16rem] items-center gap-2.5">
          {back !== undefined && (
            <Tooltip content="Back">
              <Button asChild variant="secondary" size="icon-sm" aria-label="Back">
                <Link to={back}>
                  <ArrowLeft aria-hidden />
                </Link>
              </Button>
            </Tooltip>
          )}
          <h1 className="min-w-0 truncate text-xl font-semibold tracking-(--tracking-title) text-fg">{title}</h1>
          {count !== undefined && (
            <span className="num rounded-sm border border-border bg-subtle px-1.5 py-px text-xs font-medium text-fg-muted" aria-label={`${count} total`}>
              {formatCount(count)}
            </span>
          )}
          {meta}
        </div>
        {actions !== undefined && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {description !== undefined && <p className="max-w-2xl text-sm text-fg-muted">{description}</p>}
    </header>
  )
}
