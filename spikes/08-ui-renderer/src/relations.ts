/**
 * Options for belongsTo fields (picker + cell), fetched once per target resource and cached by
 * TanStack Query, so a 500-row list showing customer names issues ONE request, not 500.
 *
 * Spike limitation: loads the first page (max 100) sorted by title. The real picker must be an
 * async combobox (search-as-you-type) for large targets.
 */
import { useQuery } from '@tanstack/react-query'
import { LIST_QUERY_LIMITS } from './contracts.ts'
import { useResource, useUI } from './registry.tsx'

export interface RelationOption {
  readonly value: string
  readonly label: string
}

const EMPTY: readonly RelationOption[] = []

export function useRelationOptions(targetName: string | undefined): {
  options: readonly RelationOption[]
  isLoading: boolean
} {
  const { api } = useUI()
  const target = useResource(targetName ?? '')
  const query = useQuery({
    queryKey: ['strutvane', 'relation-options', target?.path],
    enabled: target !== undefined,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      if (!target) return EMPTY
      const result = await api.list(
        target.path,
        { sort: [{ field: target.titleField, direction: 'asc' }], page: { kind: 'cursor', size: LIST_QUERY_LIMITS.maxPageSize } },
        signal,
      )
      return result.data.map((r) => ({ value: r.id, label: String(r[target.titleField] ?? r.id) }))
    },
  })
  return { options: query.data ?? EMPTY, isLoading: query.isLoading }
}
