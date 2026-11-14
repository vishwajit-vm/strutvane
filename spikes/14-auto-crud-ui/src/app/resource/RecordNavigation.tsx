/**
 * Small conveniences on the detail page (DESIGN.md §11):
 * - `<RecordPager>`: previous/next record without going back to the list;
 * - `<CopyButtons>`: copy the record's link or id, with a toast;
 * - `useRelationCounts`: how many related rows each tab holds ("Posts 14").
 *
 * @module
 */
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { IconChevronLeft, IconChevronRight, IconCopy, IconLink } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import type { RelationMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ApiClient, ApiRow } from '../api/client.ts'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { useToast } from '../components/ui/toast.tsx'
import { recordId, recordRouteKey, recordTitle } from '../data/queries.ts'
import { copyText } from '../lib/clipboard.ts'
import { useApi } from '../registry.tsx'

/**
 * The neighbours of a record in the list's default order.
 *
 * Approximated by the primary key: newest-first lists (`-created_at`, `-id`) step to the lower id
 * for "next", oldest-first lists to the higher id. Exact for id order, close for creation order,
 * and it needs no position endpoint (spike 10 has none). Soft-deleted rows are skipped, as in the
 * list.
 *
 * @example
 * const { data } = useNeighbours(posts, post) // { previous: ApiRow | undefined, next: ApiRow | undefined }
 */
export function useNeighbours(resource: ResolvedResourceUi, row: ApiRow) {
  const api = useApi()
  const id = recordId(resource, row)
  return useQuery({
    queryKey: ['neighbours', resource.name, id],
    enabled: id !== undefined,
    queryFn: async () => {
      const newestFirst = resource.defaultSort.startsWith('-')
      const [before, after] = await Promise.all([neighbour(api, resource, id ?? 0, newestFirst ? 'gt' : 'lt'), neighbour(api, resource, id ?? 0, newestFirst ? 'lt' : 'gt')])
      return { previous: before, next: after }
    },
  })
}

async function neighbour(api: ApiClient, resource: ResolvedResourceUi, id: number, operator: 'gt' | 'lt'): Promise<ApiRow | undefined> {
  const key = resource.metadata.primaryKey
  const page = await api.list(resource.metadata, { page: 1, perPage: 10, search: '', sort: operator === 'gt' ? key : `-${key}`, filters: { [`${key}.${operator}`]: String(id) }, trashed: 'without' })
  return page.data[0]
}

/**
 * Previous / next record links.
 *
 * @example
 * <RecordPager resource={posts} row={post} />
 */
export function RecordPager({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const neighbours = useNeighbours(resource, row)
  const singular = resource.label.singular.toLowerCase()
  return (
    <nav aria-label={`Other ${resource.label.plural.toLowerCase()}`} className="flex gap-1">
      <PagerLink resource={resource} row={neighbours.data?.previous} label={`Previous ${singular}`} direction="previous" />
      <PagerLink resource={resource} row={neighbours.data?.next} label={`Next ${singular}`} direction="next" />
    </nav>
  )
}

function PagerLink({ resource, row, label, direction }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow | undefined; readonly label: string; readonly direction: 'previous' | 'next' }): ReactElement {
  const Icon = direction === 'previous' ? IconChevronLeft : IconChevronRight
  if (row === undefined) {
    return (
      <Button variant="soft" size="icon" disabled aria-label={`${label}: none`}>
        <Icon aria-hidden="true" />
      </Button>
    )
  }
  const title = recordTitle(resource, row)
  return (
    <Link to="/$resource/$key" params={{ resource: resource.metadata.route, key: recordRouteKey(resource, row) }} aria-label={`${label}: ${title}`} title={title} className={buttonVariants({ variant: 'soft', size: 'icon' })}>
      <Icon aria-hidden="true" />
    </Link>
  )
}

/**
 * "Copy link" and "Copy ID" buttons.
 *
 * @example
 * <CopyButtons resource={posts} row={post} />
 */
export function CopyButtons({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const toast = useToast()
  const id = String(recordId(resource, row) ?? '')
  const copy = async (text: string, what: string): Promise<void> => {
    toast((await copyText(text)) ? `${what} copied.` : `Could not copy the ${what.toLowerCase()}. Select it and press Ctrl+C instead.`)
  }
  return (
    <>
      <Button variant="soft" size="icon" aria-label="Copy link" title="Copy link" onClick={() => void copy(window.location.href, 'Link')}>
        <IconLink aria-hidden="true" />
      </Button>
      <Button variant="soft" size="icon" aria-label={`Copy ID (${id})`} title={`Copy ID (${id})`} onClick={() => void copy(id, 'ID')}>
        <IconCopy aria-hidden="true" />
      </Button>
    </>
  )
}

/**
 * Row counts for each hasMany tab (one small list request per tab, `filter[fk][eq]=id`).
 *
 * @example
 * const counts = useRelationCounts([{ relation, target }], 1)
 * counts.data?.get('posts') // 14
 */
export function useRelationCounts(tabs: readonly { readonly relation: RelationMetadata; readonly target: ResolvedResourceUi }[], parentId: number | undefined) {
  const api = useApi()
  return useQuery({
    queryKey: ['relation-counts', tabs.map((tab) => [tab.target.name, tab.relation.foreignKey]), parentId],
    enabled: parentId !== undefined && tabs.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        tabs.map(async ({ relation, target }) => {
          const page = await api.list(target.metadata, { page: 1, perPage: 10, search: '', sort: '', filters: { [`${relation.foreignKey}.eq`]: String(parentId) }, trashed: 'without' })
          return [relation.name, page.meta.total] as const
        }),
      )
      return new Map(entries)
    },
  })
}
