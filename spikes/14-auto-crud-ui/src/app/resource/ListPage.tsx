/**
 * `<ListPage>`: `/posts`. The list's state lives in the URL (`?page=2&sort=-price&filter=...`), so
 * every view can be bookmarked, shared and restored with the Back button.
 *
 * @module
 */
import { Link, useNavigate, useSearch } from '@tanstack/react-router'
import { IconPlus } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ListParams } from '../api/list-params.ts'
import { useSession } from '../auth/session.tsx'
import { PageHeader } from '../components/PageHeader.tsx'
import { buttonVariants } from '../components/ui/button.tsx'
import { validateListSearch, type ListSearch } from '../route-search.ts'
import { ListView } from './ListView.tsx'
import { ResourceGate } from './states.tsx'

/**
 * The list screen of the resource named in the URL.
 *
 * @example
 * createRoute({ getParentRoute: () => appRoute, path: '$resource', component: ListPage })
 */
export function ListPage(): ReactElement {
  // Keyed by resource: moving from /posts to /tags starts a fresh list (search box, filter panel).
  return <ResourceGate ability="viewAny">{(resource) => <ResourceList key={resource.name} resource={resource} />}</ResourceGate>
}

function ResourceList({ resource }: { readonly resource: ResolvedResourceUi }): ReactElement {
  const { can } = useSession()
  const navigate = useNavigate()
  const search = validateListSearch(useSearch({ strict: false }))
  const params = paramsFromSearch(resource, search)

  const onChange = (patch: Partial<ListParams>): void => {
    const next = { ...params, ...patch }
    void navigate({
      to: '/$resource',
      params: { resource: resource.metadata.route },
      search: searchFromParams(resource, next),
      // Typing in the search box should not fill the Back history with one entry per word.
      replace: patch.search !== undefined,
    })
  }

  return (
    <div>
      <PageHeader
        title={resource.label.plural}
        crumbs={[{ label: 'Home', to: '/' }, { label: resource.label.plural }]}
        description={`Search, filter and manage ${resource.label.plural.toLowerCase()}.`}
        actions={
          can('create', resource.name) ? (
            <Link to="/$resource/new" params={{ resource: resource.metadata.route }} className={buttonVariants()}>
              <IconPlus aria-hidden="true" />
              New {resource.label.singular.toLowerCase()}
            </Link>
          ) : undefined
        }
      />
      <ListView resource={resource} params={params} onChange={onChange} />
    </div>
  )
}

/**
 * URL state → list params, with the resource's defaults filled in.
 *
 * @example
 * paramsFromSearch(posts, { page: 2 }) // { page: 2, perPage: 25, sort: '-created_at', ... }
 */
export function paramsFromSearch(resource: ResolvedResourceUi, search: ListSearch): ListParams {
  return {
    page: search.page ?? 1,
    perPage: search.perPage ?? resource.pageSize,
    search: search.search ?? '',
    sort: search.sort ?? resource.defaultSort,
    filters: search.filter ?? {},
    trashed: search.trashed ?? 'without',
  }
}

/**
 * List params → URL state, leaving defaults out so URLs stay short.
 *
 * @example
 * searchFromParams(posts, { page: 1, perPage: 25, search: '', sort: '-created_at', filters: {}, trashed: 'without' }) // {}
 */
export function searchFromParams(resource: ResolvedResourceUi, params: ListParams): ListSearch {
  return {
    ...(params.page === 1 ? {} : { page: params.page }),
    ...(params.perPage === resource.pageSize ? {} : { perPage: params.perPage }),
    ...(params.search.trim() === '' ? {} : { search: params.search }),
    ...(params.sort === resource.defaultSort ? {} : { sort: params.sort }),
    ...(Object.keys(params.filters).length === 0 ? {} : { filter: params.filters }),
    ...(params.trashed === 'without' ? {} : { trashed: params.trashed }),
  }
}
