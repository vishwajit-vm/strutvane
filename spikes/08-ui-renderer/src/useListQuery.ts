/**
 * List state for a resource page: filters (chips), sort, search and cursor pagination, exposed as
 * a typed ListQuery plus a URL search string. Router-agnostic: pass `initialSearch` from the
 * router and persist `searchString` back however the router likes.
 *
 * Cursor pagination keeps a stack of previous cursors so "Previous" works without the server
 * supporting backwards cursors. Any change to filters/sort/search/page size resets to page 1,
 * because a cursor is only valid for the query it was issued for.
 */
import { useCallback, useMemo, useReducer } from 'react'
import type { ListQuery, ResourceDescriptor, SortDirective } from './contracts.ts'
import {
  type ListState,
  parseSearchString,
  type RejectedParam,
  type SimpleFilter,
  toListQuery,
  toSearchString,
} from './list-query-url.ts'

interface State {
  readonly list: ListState
  readonly previousCursors: readonly (string | undefined)[]
}

type Action =
  | { type: 'sort'; sort: readonly SortDirective[] }
  | { type: 'addFilter'; filter: SimpleFilter }
  | { type: 'removeFilter'; index: number }
  | { type: 'search'; search: string }
  | { type: 'pageSize'; size: number }
  | { type: 'next'; cursor: string }
  | { type: 'previous' }

/** Reset pagination: used by every action that changes what the query means. */
function firstPage(list: ListState): ListState {
  const { cursor: _dropped, ...rest } = list
  return rest
}

export function listReducer(state: State, action: Action): State {
  switch (action.type) {
    case 'sort':
      return { list: { ...firstPage(state.list), sort: action.sort }, previousCursors: [] }
    case 'addFilter':
      return {
        list: { ...firstPage(state.list), filters: [...state.list.filters, action.filter] },
        previousCursors: [],
      }
    case 'removeFilter':
      return {
        list: {
          ...firstPage(state.list),
          filters: state.list.filters.filter((_, i) => i !== action.index),
        },
        previousCursors: [],
      }
    case 'search':
      return { list: { ...firstPage(state.list), search: action.search }, previousCursors: [] }
    case 'pageSize':
      return { list: { ...firstPage(state.list), pageSize: action.size }, previousCursors: [] }
    case 'next':
      return {
        list: { ...state.list, cursor: action.cursor },
        previousCursors: [...state.previousCursors, state.list.cursor],
      }
    case 'previous': {
      if (state.previousCursors.length === 0) return state
      const previous = state.previousCursors[state.previousCursors.length - 1]
      const base = firstPage(state.list)
      return {
        list: previous === undefined ? base : { ...base, cursor: previous },
        previousCursors: state.previousCursors.slice(0, -1),
      }
    }
  }
}

export interface UseListQueryResult {
  readonly state: ListState
  readonly listQuery: ListQuery
  readonly searchString: string
  readonly rejected: readonly RejectedParam[]
  readonly hasPrevious: boolean
  setSort(sort: readonly SortDirective[]): void
  addFilter(filter: SimpleFilter): void
  removeFilter(index: number): void
  setSearch(search: string): void
  setPageSize(size: number): void
  nextPage(cursor: string): void
  previousPage(): void
}

export function useListQuery(
  resource: ResourceDescriptor,
  initialSearch = '',
): UseListQueryResult {
  // Parse once at mount; later URL changes are owned by this hook.
  const initial = useMemo(() => parseSearchString(initialSearch, resource), [initialSearch, resource])
  const [state, dispatch] = useReducer(listReducer, { list: initial.state, previousCursors: [] })

  const listQuery = useMemo(() => toListQuery(state.list), [state.list])
  const searchString = useMemo(() => toSearchString(state.list), [state.list])

  return {
    state: state.list,
    listQuery,
    searchString,
    rejected: initial.rejected,
    hasPrevious: state.previousCursors.length > 0,
    setSort: useCallback((sort) => dispatch({ type: 'sort', sort }), []),
    addFilter: useCallback((filter) => dispatch({ type: 'addFilter', filter }), []),
    removeFilter: useCallback((index) => dispatch({ type: 'removeFilter', index }), []),
    setSearch: useCallback((search) => dispatch({ type: 'search', search }), []),
    setPageSize: useCallback((size) => dispatch({ type: 'pageSize', size }), []),
    nextPage: useCallback((cursor) => dispatch({ type: 'next', cursor }), []),
    previousPage: useCallback(() => dispatch({ type: 'previous' }), []),
  }
}
