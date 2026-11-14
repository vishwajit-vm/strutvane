/**
 * TanStack Query hooks for the screens, plus the tiny record helpers they share (title, route key).
 *
 * Query keys are `['list', resource, params]`, `['record', resource, key]` and
 * `['titles', resource, ids]`, so a write can invalidate everything about one resource with
 * `invalidateResource()`.
 *
 * @module
 */
import { keepPreviousData, useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ApiRow, ListPage } from '../api/client.ts'
import type { ListParams } from '../api/list-params.ts'
import { useApi, useRegistry } from '../registry.tsx'

/** At most this many related titles are fetched in one request (spike 10 allows 100 `in` values). */
const MAX_TITLE_BATCH = 100

/**
 * Load one page of a list. While the next page loads, the previous rows stay on screen (dimmed)
 * instead of flashing to a skeleton: `keepPreviousData`.
 *
 * @example
 * const query = useListQuery(posts, params)
 * query.data?.meta.total
 */
export function useListQuery(resource: ResolvedResourceUi, params: ListParams): UseQueryResult<ListPage> {
  const api = useApi()
  return useQuery({
    queryKey: ['list', resource.name, params],
    queryFn: () => api.list(resource.metadata, params),
    placeholderData: keepPreviousData,
  })
}

/**
 * Load one record by its route key (slug or id).
 *
 * @example
 * const { data: post } = useRecord(posts, 'my-first-post')
 */
export function useRecord(resource: ResolvedResourceUi, key: string): UseQueryResult<ApiRow> {
  const api = useApi()
  return useQuery({ queryKey: ['record', resource.name, key], queryFn: () => api.findByRouteKey(resource.metadata, key) })
}

/**
 * Related rows for every foreign key column on a page, keyed by field name then id. All lookups
 * run in one query (one request per relation, `filter[id][in]=1,2,3`), not one per row.
 *
 * Why one hook for all relations: the number of relation columns differs per resource, and hooks
 * cannot be called in a loop whose length changes when the user navigates between resources.
 *
 * @example
 * const related = useRelatedRows(posts, posts.columns, page.data)
 * related.data?.get('author_id')?.get(1)?.['name'] // 'Asha Rao'
 */
export function useRelatedRows(resource: ResolvedResourceUi, fields: readonly FieldMetadata[], rows: readonly ApiRow[]): UseQueryResult<ReadonlyMap<string, ReadonlyMap<number, ApiRow>>> {
  const api = useApi()
  const { byName } = useRegistry()
  const lookups = fields.flatMap((field) => {
    const target = field.references === undefined ? undefined : byName.get(field.references)
    if (target === undefined) return []
    const ids = [...new Set(rows.map((row) => row[field.name]).filter((id): id is number => typeof id === 'number'))].sort((a, b) => a - b).slice(0, MAX_TITLE_BATCH)
    return ids.length === 0 ? [] : [{ field: field.name, target, ids }]
  })
  return useQuery({
    queryKey: ['titles', resource.name, lookups.map((lookup) => [lookup.field, lookup.target.name, lookup.ids])],
    enabled: lookups.length > 0,
    queryFn: async () => {
      const entries = await Promise.all(
        lookups.map(async ({ field, target, ids }) => {
          const key = target.metadata.primaryKey
          const page = await api.list(target.metadata, { page: 1, perPage: MAX_TITLE_BATCH, search: '', sort: '', filters: { [`${key}.in`]: ids.join(',') }, trashed: 'without' })
          return [field, new Map(page.data.map((row) => [Number(row[key]), row]))] as const
        }),
      )
      return new Map(entries)
    },
  })
}

/**
 * Forget everything cached about a resource after a write, so lists and details refetch.
 *
 * @example
 * await invalidateResource(queryClient, 'posts')
 */
export async function invalidateResource(queryClient: QueryClient, resource: string): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['list', resource] }),
    queryClient.invalidateQueries({ queryKey: ['record', resource] }),
    queryClient.invalidateQueries({ queryKey: ['titles', resource] }),
  ])
}

/**
 * The human name of a row: its title field, or `#id` when that is empty.
 *
 * @example
 * recordTitle(posts, { id: 3, title: 'Hello' }) // 'Hello'
 * recordTitle(tags, { id: 7, name: '' }) // '#7'
 */
export function recordTitle(resource: ResolvedResourceUi, row: ApiRow): string {
  const title = row[resource.metadata.titleField]
  if (typeof title === 'string' && title.trim() !== '') return title
  if (typeof title === 'number') return String(title)
  return `#${String(row[resource.metadata.primaryKey] ?? '?')}`
}

/**
 * The value used in this row's UI URL: its slug, or its id.
 *
 * @example
 * recordRouteKey(posts, { id: 3, slug: 'hello' }) // 'hello'
 */
export function recordRouteKey(resource: ResolvedResourceUi, row: ApiRow): string {
  return String(row[resource.routeKey] ?? row[resource.metadata.primaryKey] ?? '')
}

/**
 * The numeric primary key of a row (what writes use), or `undefined` if it is missing.
 *
 * @example
 * recordId(posts, { id: 3 }) // 3
 */
export function recordId(resource: ResolvedResourceUi, row: ApiRow): number | undefined {
  const id = row[resource.metadata.primaryKey]
  return typeof id === 'number' ? id : undefined
}

/**
 * Is this row in the trash (soft-deleted)?
 *
 * @example
 * isTrashed(posts, { deleted_at: '2026-11-01T09:00:00.000Z' }) // true
 */
export function isTrashed(resource: ResolvedResourceUi, row: ApiRow): boolean {
  return resource.metadata.softDeletes && typeof row['deleted_at'] === 'string'
}
