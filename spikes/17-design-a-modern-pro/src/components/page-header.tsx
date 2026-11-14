/**
 * `<PageHeader>`: the top of every inner page, built to one alignment rule: the back button, the
 * title (+ count badge) and the action buttons share **one row, vertically centred**. On phones
 * the actions drop below the title as a full-width row instead of squeezing it.
 *
 * Breadcrumbs sit above, in small muted text, so the title stays the strongest element.
 *
 * @example
 * <PageHeader
 *   breadcrumbs={[{ label: 'Billing' }, { label: 'Invoices' }]}
 *   back="/dashboard" title="Invoices" count={64}
 *   actions={<><Button>Export</Button><Button variant="primary">New invoice</Button></>}
 * />
 */
import { IconArrowLeft, IconChevronRight, IconSmartHome } from '@tabler/icons-react'
import { Fragment, type ReactElement, type ReactNode } from 'react'
import { cn } from '../lib/cn.ts'
import { formatInteger } from '../lib/format.ts'
import { Link } from '../lib/router.tsx'
import { Button } from './ui/button.tsx'

export interface Crumb {
  readonly label: string
  readonly to?: string
}

/** Props of {@link PageHeader}. */
export interface PageHeaderProps {
  readonly title: ReactNode
  readonly breadcrumbs?: readonly Crumb[]
  /** Route of the back button; omitted → no back button. */
  readonly back?: string
  readonly count?: number
  /** Inline next to the title (status badge on a detail page). */
  readonly badge?: ReactNode
  readonly description?: ReactNode
  readonly actions?: ReactNode
  readonly className?: string
}

export function PageHeader({ title, breadcrumbs = [], back, count, badge, description, actions, className }: PageHeaderProps): ReactElement {
  return (
    <header className={cn('mb-6 flex flex-col gap-3', className)}>
      {breadcrumbs.length > 0 ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          {back === undefined ? null : (
            <Button asChild variant="outline" size="icon" className="rounded-lg">
              <Link to={back} aria-label="Back">
                <IconArrowLeft />
              </Link>
            </Button>
          )}
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate text-2xl font-bold leading-8 tracking-tight text-foreground">{title}</h1>
              {count === undefined ? null : (
                <span className="inline-flex h-6 items-center rounded-full bg-primary-soft px-2.5 text-xs font-bold text-primary-soft-foreground tabular" aria-label={`${formatInteger(count)} records`}>
                  {formatInteger(count)}
                </span>
              )}
              {badge}
            </div>
            {description === undefined ? null : <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {actions === undefined ? null : <div className="flex shrink-0 flex-wrap items-center gap-2 sm:flex-nowrap [&>*]:max-sm:flex-1">{actions}</div>}
      </div>
    </header>
  )
}

function Breadcrumbs({ items }: { readonly items: readonly Crumb[] }): ReactElement {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-1.5 text-label text-muted-foreground">
        <li>
          <Link to="/dashboard" className="flex items-center rounded-sm hover:text-foreground" aria-label="Home">
            <IconSmartHome aria-hidden className="size-4" />
          </Link>
        </li>
        {items.map((item, index) => {
          const last = index === items.length - 1
          return (
            <Fragment key={item.label}>
              <li aria-hidden>
                <IconChevronRight className="size-3.5" />
              </li>
              <li>
                {item.to === undefined || last ? (
                  <span aria-current={last ? 'page' : undefined} className={cn(last && 'font-medium text-foreground')}>
                    {item.label}
                  </span>
                ) : (
                  <Link to={item.to} className="rounded-sm hover:text-foreground">
                    {item.label}
                  </Link>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
