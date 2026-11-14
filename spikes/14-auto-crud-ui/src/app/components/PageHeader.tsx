/**
 * `<PageHeader>`: every screen's title row: breadcrumbs, the `<h1>`, an optional description and
 * actions on the right. One component, so all screens line up and announce the same way.
 *
 * @module
 */
import { Link } from '@tanstack/react-router'
import { IconChevronRight } from '@tabler/icons-react'
import type { ReactElement, ReactNode } from 'react'

/**
 * One breadcrumb. The last one is the current page (no link).
 *
 * @example
 * const crumb: Crumb = { label: 'Posts', to: '/$resource', params: { resource: 'posts' } }
 */
export type Crumb =
  | { readonly label: string; readonly to: '/' }
  | { readonly label: string; readonly to: '/$resource'; readonly params: { readonly resource: string } }
  | { readonly label: string; readonly to?: undefined }

/**
 * Props of {@link PageHeader}.
 *
 * @example
 * const props: PageHeaderProps = { title: 'Posts', crumbs: [{ label: 'Dashboard', to: '/' }, { label: 'Posts' }] }
 */
export interface PageHeaderProps {
  readonly title: ReactNode
  readonly crumbs: readonly Crumb[]
  readonly description?: ReactNode
  readonly actions?: ReactNode
}

/**
 * The page header.
 *
 * @example
 * <PageHeader title="Posts" crumbs={[{ label: 'Dashboard', to: '/' }, { label: 'Posts' }]} actions={<NewButton />} />
 */
export function PageHeader({ title, crumbs, description, actions }: PageHeaderProps): ReactElement {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted-foreground">
          <ol className="flex flex-wrap items-center gap-1">
            {crumbs.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <IconChevronRight aria-hidden="true" className="size-3.5" />}
                <CrumbLink crumb={crumb} current={index === crumbs.length - 1} />
              </li>
            ))}
          </ol>
        </nav>
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description !== undefined && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions !== undefined && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

function CrumbLink({ crumb, current }: { readonly crumb: Crumb; readonly current: boolean }): ReactElement {
  if (current || crumb.to === undefined) return <span aria-current={current ? 'page' : undefined} className="truncate text-foreground">{crumb.label}</span>
  if (crumb.to === '/') return <Link to="/" className="hover:text-primary hover:underline">{crumb.label}</Link>
  return <Link to="/$resource" params={crumb.params} className="hover:text-primary hover:underline">{crumb.label}</Link>
}
