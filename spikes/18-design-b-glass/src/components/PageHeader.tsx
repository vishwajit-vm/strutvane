/**
 * Page header: breadcrumb + back, then the title row with its actions.
 *
 * Alignment rule (DESIGN-B.md §5.1): the title block and the action buttons share ONE row and are
 * vertically centred (`items-center`), primary action last (rightmost). On phones the actions wrap
 * under the title and stay left-aligned, so nothing overflows.
 *
 * @example
 *   <PageHeader
 *     breadcrumbs={[{ label: 'Billing', to: '/' }, { label: 'Invoices' }]}
 *     back="/"
 *     title="Invoices" count={86}
 *     description="Create, send and track invoices."
 *     actions={<><Button variant="secondary">Export</Button><Button>New invoice</Button></>}
 *   />
 */
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '../lib/cn.ts'
import { formatNumber } from '../lib/format.ts'

export interface Crumb {
  readonly label: string
  /** Omit on the last crumb (the current page). */
  readonly to?: string
}

export interface PageHeaderProps {
  readonly title: ReactNode
  readonly breadcrumbs?: readonly Crumb[]
  /** Where "Back" goes; omit to hide the back button. */
  readonly back?: string
  readonly count?: number
  readonly description?: ReactNode
  /** Extra inline meta next to the title (e.g. a status badge). */
  readonly meta?: ReactNode
  readonly actions?: ReactNode
  readonly className?: string
}

export function PageHeader({ title, breadcrumbs, back, count, description, meta, actions, className }: PageHeaderProps) {
  return (
    <header className={cn('mb-6 flex flex-col gap-3', className)}>
      {(breadcrumbs !== undefined || back !== undefined) && (
        <div className="flex min-w-0 items-center gap-2">
          {back !== undefined && (
            <Link
              to={back}
              className="glass-card inline-flex h-7 shrink-0 items-center gap-1 rounded-full pr-3 pl-2 text-xs font-semibold text-fg transition-base hover:-translate-x-0.5 hover:text-primary-text"
            >
              <IconChevronLeft className="size-3.5" aria-hidden />
              Back
            </Link>
          )}
          {breadcrumbs !== undefined && <Breadcrumbs items={breadcrumbs} />}
        </div>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="text-2xl font-bold tracking-tight text-fg">{title}</h1>
            {count !== undefined && (
              <span className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-xs font-bold text-primary-soft-fg tabular" aria-label={`${formatNumber(count)} total`}>
                {formatNumber(count)}
              </span>
            )}
            {meta}
          </div>
          {description !== undefined && <p className="mt-1 max-w-2xl text-base text-fg-muted">{description}</p>}
        </div>
        {actions !== undefined && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function Breadcrumbs({ items }: { items: readonly Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1 text-xs font-medium text-fg-muted">
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <li key={`${item.label}-${String(index)}`} className={cn('flex min-w-0 items-center gap-1', !last && 'shrink-0')}>
              {item.to !== undefined && !last ? (
                <Link to={item.to} className="rounded-xs hover:text-primary-text hover:underline">
                  {item.label}
                </Link>
              ) : (
                <span className="truncate text-fg" aria-current="page">
                  {item.label}
                </span>
              )}
              {!last && <IconChevronRight className="size-3 shrink-0 opacity-70" aria-hidden />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
