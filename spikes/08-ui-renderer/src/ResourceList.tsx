/**
 * The list page for one resource, built entirely from its descriptor:
 * columns (ui.listColumns, else sensible defaults) → TanStack Table (v9) for header/cell models and
 * sort state; filtering, search, sorting and cursor pagination are SERVER-side (manualSorting) and
 * flow through useListQuery → ListQuery → api.list via TanStack Query.
 *
 * Accessibility: a real <table> with caption, `scope="col"`, sortable headers as buttons with
 * `aria-sort`, labelled pagination nav, and a polite live region announcing result counts.
 * Performance: above `virtualizeThreshold` rows only the visible window is rendered
 * (@tanstack/react-virtual) with spacer rows, `aria-rowcount` / `aria-rowindex` keep the semantics.
 */
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import {
  type ColumnDef,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  type Updater,
  useTable,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useId, useMemo, useRef } from 'react'
import type { ApiRecord, FieldDescriptor, ResourceDescriptor, SortDirective } from './contracts.ts'
import { ApiProblemError, problemBannerText } from './errors.ts'
import { FilterBar } from './FilterBar.tsx'
import { resolveCell, useUI } from './registry.tsx'
import { useListQuery } from './useListQuery.ts'

const features = tableFeatures({ rowSortingFeature })
const EMPTY_ROWS: ApiRecord[] = []
const NOT_LISTED = new Set(['id', 'array', 'text'])
const ROW_HEIGHT = 40

/** Columns shown for a resource: explicit `ui.listColumns`, else up to 6 simple fields. */
export function listFields(resource: ResourceDescriptor): FieldDescriptor[] {
  const byName = new Map(resource.fields.map((f) => [f.name, f]))
  const explicit = resource.ui?.listColumns
  if (explicit) return explicit.map((n) => byName.get(n)).filter((f): f is FieldDescriptor => f !== undefined)
  return resource.fields.filter((f) => !NOT_LISTED.has(f.type)).slice(0, 6)
}

const toSorting = (sort: readonly SortDirective[]): SortingState =>
  sort.map((s) => ({ id: s.field, desc: s.direction === 'desc' }))
const fromSorting = (sorting: SortingState): SortDirective[] =>
  sorting.map((s) => ({ field: s.id, direction: s.desc ? 'desc' : 'asc' }))

export interface ResourceListProps {
  readonly resource: ResourceDescriptor
  /** Initial URL query string (from the router). */
  readonly initialSearch?: string
  /** Called with the new query string whenever list state changes (persist it in the URL). */
  readonly onSearchStringChange?: (search: string) => void
  readonly onCreate?: () => void
  readonly onEdit?: (record: ApiRecord) => void
  /** Render only visible rows above this many rows. */
  readonly virtualizeThreshold?: number
  /** Override page size (tests / "show more"); clamped to the protocol maximum by the client. */
  readonly pageSize?: number
}

export function ResourceList({
  resource,
  initialSearch = '',
  onSearchStringChange,
  onCreate,
  onEdit,
  virtualizeThreshold = 100,
  pageSize,
}: ResourceListProps) {
  const { api, registry } = useUI()
  const ids = useId()
  const list = useListQuery(resource, initialSearch)
  const { setPageSize } = list
  useEffect(() => {
    if (pageSize !== undefined) setPageSize(pageSize)
  }, [pageSize, setPageSize])
  useEffect(() => {
    onSearchStringChange?.(list.searchString)
  }, [list.searchString, onSearchStringChange])

  const query = useQuery({
    queryKey: ['strutvane', 'list', resource.path, list.listQuery],
    queryFn: ({ signal }) => api.list(resource.path, list.listQuery, signal),
    placeholderData: keepPreviousData,
  })

  const fields = useMemo(() => listFields(resource), [resource])
  const columns = useMemo<ColumnDef<typeof features, ApiRecord>[]>(
    () =>
      fields.map((field) => {
        const CellComponent = resolveCell(registry, resource, field)
        return {
          id: field.name,
          accessorFn: (row: ApiRecord) => row[field.name],
          header: field.label,
          enableSorting: field.sortable,
          cell: (ctx) => (
            <CellComponent field={field} value={ctx.row.original[field.name]} record={ctx.row.original} resource={resource} />
          ),
        }
      }),
    [fields, registry, resource],
  )

  const sorting = useMemo(() => toSorting(list.state.sort), [list.state.sort])
  const { setSort } = list
  const table = useTable({
    features,
    columns,
    data: (query.data?.data as ApiRecord[] | undefined) ?? EMPTY_ROWS,
    getRowId: (row) => row.id,
    state: { sorting },
    onSortingChange: (updater: Updater<SortingState>) => {
      setSort(fromSorting(typeof updater === 'function' ? updater(sorting) : updater))
    },
    manualSorting: true,
    enableMultiSort: false,
    // TanStack auto-detects the first sort direction from the data (numbers start DESC, text ASC).
    // A generated UI must behave the same on every column, so the first click is always ascending.
    sortDescFirst: false,
  })

  const rows = table.getRowModel().rows
  const virtualize = rows.length > virtualizeThreshold
  const scrollRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count: virtualize ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
    // Layout-free environments (tests, SSR) have no element size; assume a typical viewport.
    initialRect: { width: 1024, height: 600 },
  })
  const measured = virtualize ? virtualizer.getVirtualItems() : []
  // Fail-safe: a container that cannot be measured (hidden tab, unstyled parent, no layout engine)
  // makes the virtualizer return NO rows. Never show an empty table when data exists: fall back to
  // the first window of rows until a real measurement arrives.
  const fallbackWindow = Math.ceil(600 / ROW_HEIGHT) + 10
  const virtualItems =
    virtualize && measured.length === 0 && rows.length > 0
      ? Array.from({ length: Math.min(fallbackWindow, rows.length) }, (_, index) => ({
          index,
          start: index * ROW_HEIGHT,
          end: (index + 1) * ROW_HEIGHT,
        }))
      : measured
  const visible = virtualize ? virtualItems.map((v) => ({ row: rows[v.index], index: v.index })) : rows.map((row, index) => ({ row, index }))
  const padTop = virtualize ? (virtualItems[0]?.start ?? 0) : 0
  const padBottom = virtualize ? rows.length * ROW_HEIGHT - (virtualItems[virtualItems.length - 1]?.end ?? 0) : 0

  const caps = resource.capabilities
  const hasSearch = resource.fields.some((f) => f.searchable)
  const colSpan = fields.length + (caps.update && onEdit ? 1 : 0)
  const pageInfo = query.data?.meta.page
  const error = query.error instanceof ApiProblemError ? problemBannerText(query.error.problem) : query.error ? 'Could not load the list. Please retry.' : null

  return (
    <section aria-labelledby={`${ids}-title`}>
      <h2 id={`${ids}-title`}>{resource.pluralLabel}</h2>

      <div>
        {hasSearch && (
          <>
            <label htmlFor={`${ids}-search`}>Search {resource.pluralLabel}</label>
            <input id={`${ids}-search`} type="search" value={list.state.search} onChange={(e) => list.setSearch(e.target.value)} />
          </>
        )}
        {caps.create && onCreate && (
          <button type="button" onClick={onCreate}>
            New {resource.label.toLowerCase()}
          </button>
        )}
      </div>

      <FilterBar resource={resource} filters={list.state.filters} onAdd={list.addFilter} onRemove={list.removeFilter} />

      {error && <p role="alert">{error}</p>}
      <p role="status" aria-live="polite">
        {query.isLoading ? `Loading ${resource.pluralLabel.toLowerCase()}…` : `Showing ${rows.length} ${resource.pluralLabel.toLowerCase()}`}
      </p>

      <div ref={scrollRef} style={virtualize ? { maxHeight: 600, overflowY: 'auto' } : undefined}>
        <table aria-rowcount={virtualize ? rows.length + 1 : undefined}>
          <caption>{resource.pluralLabel}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id} aria-rowindex={virtualize ? 1 : undefined}>
                {group.headers.map((header) => {
                  const sorted = header.column.getIsSorted()
                  const canSort = header.column.getCanSort()
                  return (
                    <th
                      key={header.id}
                      scope="col"
                      aria-sort={canSort ? (sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none') : undefined}
                    >
                      {canSort ? (
                        <button type="button" onClick={header.column.getToggleSortingHandler()}>
                          <table.FlexRender header={header} />
                          <span aria-hidden="true">{sorted === 'asc' ? ' ▲' : sorted === 'desc' ? ' ▼' : ''}</span>
                        </button>
                      ) : (
                        <table.FlexRender header={header} />
                      )}
                    </th>
                  )
                })}
                {caps.update && onEdit && (
                  <th scope="col">
                    <span className="sr-only">Actions</span>
                  </th>
                )}
              </tr>
            ))}
          </thead>
          <tbody>
            {padTop > 0 && (
              <tr aria-hidden="true">
                <td colSpan={colSpan} style={{ height: padTop, padding: 0 }} />
              </tr>
            )}
            {visible.map(({ row, index }) =>
              row ? (
                <tr key={row.id} aria-rowindex={virtualize ? index + 2 : undefined} style={virtualize ? { height: ROW_HEIGHT } : undefined}>
                  {row.getAllCells().map((cell) => (
                    <td key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </td>
                  ))}
                  {caps.update && onEdit && (
                    <td>
                      <button type="button" aria-label={`Edit ${String(row.original[resource.titleField] ?? row.id)}`} onClick={() => onEdit(row.original)}>
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ) : null,
            )}
            {padBottom > 0 && (
              <tr aria-hidden="true">
                <td colSpan={colSpan} style={{ height: padBottom, padding: 0 }} />
              </tr>
            )}
            {!query.isLoading && rows.length === 0 && (
              <tr>
                <td colSpan={colSpan}>No {resource.pluralLabel.toLowerCase()} match these filters.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <nav aria-label={`${resource.pluralLabel} pagination`}>
        <button type="button" disabled={!list.hasPrevious} onClick={list.previousPage}>
          Previous page
        </button>
        <button
          type="button"
          disabled={!pageInfo?.hasMore || !pageInfo.nextCursor}
          onClick={() => pageInfo?.nextCursor && list.nextPage(pageInfo.nextCursor)}
        >
          Next page
        </button>
      </nav>
    </section>
  )
}
