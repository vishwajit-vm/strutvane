/**
 * `<ResourceTable>`: the rows of one list page, rendered with TanStack Table (v9) in manual
 * (server-side) sorting mode. Sorting, paging and filtering all happen on the server; the table
 * only draws what it is given.
 *
 * Accessibility: a real `<table>` with a caption, `scope="col"` headers, `aria-sort` on sortable
 * headers and sort buttons inside them (keyboard: Tab to the header, Enter or Space to sort).
 *
 * @module
 */
import { Link } from '@tanstack/react-router'
import { type ColumnDef, rowSortingFeature, type SortingState, tableFeatures, useTable } from '@tanstack/react-table'
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconEye, IconPencil } from '@tabler/icons-react'
import { createContext, useContext, useMemo, type ReactElement } from 'react'
import type { FieldMetadata } from '../../shared/metadata.ts'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import type { ApiRow } from '../api/client.ts'
import { sortDirectionOf } from '../api/list-params.ts'
import { useSession } from '../auth/session.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { buttonVariants } from '../components/ui/button.tsx'
import { isTrashed, recordRouteKey, recordTitle } from '../data/queries.ts'
import { cn } from '../lib/cn.ts'
import { useRegistry } from '../registry.tsx'
import { FieldValue, isNumeric } from './cells.tsx'
import type { Density } from './view-prefs.ts'
import { DeleteButton, RestoreButton } from './DeleteButton.tsx'

const features = tableFeatures({ rowSortingFeature })

/**
 * Related rows reach the cells through context, not through the column definitions. Why: cell
 * renderers are components; if their definitions depended on data that arrives later (relation
 * titles), every arrival would create new component types and React would remount the cells,
 * closing an open delete dialog mid-click (found by the delete test).
 */
const RelatedRowsContext = createContext<ResourceTableProps['related']>(undefined)
/** The current search term, for highlighting matches in text cells (same context reasoning). */
const HighlightContext = createContext('')

/**
 * Props of {@link ResourceTable}.
 *
 * @example
 * const props: ResourceTableProps = { resource: posts, rows, sort: '-created_at', onSort: setSort, related: undefined, busy: false }
 */
export interface ResourceTableProps {
  readonly resource: ResolvedResourceUi
  readonly rows: readonly ApiRow[]
  /** The current sort string (`-price`). */
  readonly sort: string
  /** Called with the field name when its header is clicked. */
  readonly onSort: (field: string) => void
  /** Related rows per foreign key column, from `useRelatedRows`. */
  readonly related: ReadonlyMap<string, ReadonlyMap<number, ApiRow>> | undefined
  /** A newer page is loading: rows stay visible but dimmed. */
  readonly busy: boolean
  /** The columns to show (the resolved columns minus the ones this viewer hid). */
  readonly columns: readonly FieldMetadata[]
  readonly density: Density
  /** Search term to highlight in text cells; `''` for none. */
  readonly highlight: string
}

/**
 * The list table.
 *
 * @example
 * <ResourceTable resource={posts} rows={page.data} sort={sort} onSort={toggleSort} related={related} busy={isFetching} />
 */
export function ResourceTable({ resource, rows, sort, onSort, related, busy, columns: shown, density, highlight }: ResourceTableProps): ReactElement {
  const columns = useColumns(resource, shown)
  const sorting: SortingState = useMemo(
    () => shown.flatMap((field) => {
      const direction = sortDirectionOf(sort, field.name)
      return direction === false ? [] : [{ id: field.name, desc: direction === 'desc' }]
    }),
    [shown, sort],
  )
  const table = useTable({
    features,
    columns,
    data: rows as ApiRow[],
    getRowId: (row) => recordRouteKey(resource, row),
    state: { sorting },
    manualSorting: true,
  })

  return (
    <RelatedRowsContext.Provider value={related}>
    <HighlightContext.Provider value={highlight.trim()}>
      {/*
        The table scrolls inside its card, never the page. `relative` matters: it makes this box the
        containing block of the visually hidden (position: absolute) texts inside cells; without
        it they escape the scroll box and widen the whole page (found at 1440 px, DESIGN.md §3).
        The capped height gives the sticky header something to stick to.
      */}
      <div data-scroll-container="" className={cn('relative -mx-5 max-h-[70vh] overflow-auto border-y transition-opacity duration-(--duration-base)', busy && 'opacity-60')}>
        <table className="w-full text-sm" aria-busy={busy || undefined}>
          <caption className="sr-only">{resource.label.plural}</caption>
          <thead className="sticky top-0 z-(--z-sticky) border-b bg-muted text-left text-xs uppercase tracking-wider text-muted-foreground">
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => {
                  const field = shown.find((candidate) => candidate.name === header.column.id)
                  return field === undefined ? (
                    <th key={header.id} scope="col" className="px-5 py-3 text-right font-semibold">
                      <span className="sr-only">Actions</span>
                    </th>
                  ) : (
                    <SortableHeader key={header.id} field={field} direction={sortDirectionOf(sort, field.name)} onSort={onSort} />
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('border-b transition-colors duration-(--duration-fast) last:border-0 hover:bg-accent/40', isTrashed(resource, row.original) && 'text-muted-foreground')}>
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className={cn('max-w-64 truncate px-5 text-base first:pl-5', density === 'compact' ? 'h-9 py-1' : 'h-13 py-2', alignmentOf(shown, cell.column.id))}>
                    <table.FlexRender cell={cell} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </HighlightContext.Provider>
    </RelatedRowsContext.Provider>
  )
}

function alignmentOf(columns: readonly FieldMetadata[], id: string): string {
  const field = columns.find((candidate) => candidate.name === id)
  if (field === undefined) return 'text-right'
  return isNumeric(field) && field.references === undefined ? 'text-right tabular-nums' : ''
}

/** Column definitions: one per resolved column, the title column links to the detail page. */
function useColumns(resource: ResolvedResourceUi, shown: readonly FieldMetadata[]): ColumnDef<typeof features, ApiRow>[] {
  const { byName } = useRegistry()
  return useMemo(() => {
    const fieldColumns: ColumnDef<typeof features, ApiRow>[] = shown.map((field) => {
      const target = field.references === undefined ? undefined : byName.get(field.references)
      return {
        id: field.name,
        accessorFn: (row: ApiRow) => row[field.name],
        header: field.label,
        enableSorting: field.sortable,
        cell: (context) => {
          const row = context.row.original
          if (field.name === resource.metadata.titleField) return <TitleCell resource={resource} row={row} />
          return <RelatedFieldValue field={field} row={row} target={target} />
        },
      }
    })
    const actions: ColumnDef<typeof features, ApiRow> = { id: '__actions', header: 'Actions', enableSorting: false, cell: (context) => <RowActions resource={resource} row={context.row.original} /> }
    return [...fieldColumns, actions]
  }, [resource, shown, byName])
}

/** A cell value, with relation titles from {@link RelatedRowsContext} when the field is a foreign key. */
function RelatedFieldValue({ field, row, target }: { readonly field: FieldMetadata; readonly row: ApiRow; readonly target: ResolvedResourceUi | undefined }): ReactElement {
  const related = useContext(RelatedRowsContext)
  const highlight = useContext(HighlightContext)
  const value = row[field.name]
  if (target === undefined && typeof value === 'string' && field.searchable === 'text' && highlight !== '') return <Highlighted text={value} term={highlight} />
  if (target === undefined) return <FieldValue field={field} value={value} />
  return <FieldValue field={field} value={row[field.name]} related={{ resource: target, rows: related?.get(field.name) }} />
}

function TitleCell({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const highlight = useContext(HighlightContext)
  const trashed = isTrashed(resource, row)
  return (
    <span className="inline-flex items-center gap-2">
      {trashed ? (
        <span>
          <Highlighted text={recordTitle(resource, row)} term={highlight} />
        </span>
      ) : (
        <Link to="/$resource/$key" params={{ resource: resource.metadata.route, key: recordRouteKey(resource, row) }} className="font-medium text-foreground underline-offset-4 hover:underline">
          <Highlighted text={recordTitle(resource, row)} term={highlight} />
        </Link>
      )}
      {trashed && <Badge tone="danger">Deleted</Badge>}
    </span>
  )
}

function SortableHeader({ field, direction, onSort }: { readonly field: FieldMetadata; readonly direction: 'asc' | 'desc' | false; readonly onSort: (field: string) => void }): ReactElement {
  const align = isNumeric(field) && field.references === undefined ? 'text-right' : ''
  if (!field.sortable) {
    return (
      <th scope="col" className={cn('px-5 py-3 font-semibold', align)}>
        {field.label}
      </th>
    )
  }
  const Icon = direction === 'asc' ? IconArrowUp : direction === 'desc' ? IconArrowDown : IconArrowsSort
  return (
    <th scope="col" className={cn('px-3 py-1.5 font-semibold', align)} aria-sort={direction === 'asc' ? 'ascending' : direction === 'desc' ? 'descending' : 'none'}>
      <button type="button" onClick={() => onSort(field.name)} className="inline-flex min-h-8 items-center gap-1 rounded-md px-2 uppercase tracking-wider hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {field.label}
        <Icon aria-hidden="true" className={cn('size-3.5', direction === false && 'opacity-40')} />
      </button>
    </th>
  )
}

function RowActions({ resource, row }: { readonly resource: ResolvedResourceUi; readonly row: ApiRow }): ReactElement {
  const { can } = useSession()
  const title = recordTitle(resource, row)
  const params = { resource: resource.metadata.route, key: recordRouteKey(resource, row) }
  if (isTrashed(resource, row)) return <span className="flex justify-end">{can('restore', resource.name) && <RestoreButton resource={resource} row={row} />}</span>
  return (
    <span className="flex justify-end gap-1">
      {can('view', resource.name) && (
        <Link to="/$resource/$key" params={params} aria-label={`View ${title}`} className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
          <IconEye aria-hidden="true" />
        </Link>
      )}
      {can('update', resource.name) && (
        <Link to="/$resource/$key/edit" params={params} aria-label={`Edit ${title}`} className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
          <IconPencil aria-hidden="true" />
        </Link>
      )}
      {can('delete', resource.name) && <DeleteButton resource={resource} row={row} />}
    </span>
  )
}

/**
 * Text with every case-insensitive match of the search term wrapped in `<mark>`, so the eye finds
 * why a row matched. Matching mirrors the server's literal "contains" (no wildcards).
 *
 * @example
 * <Highlighted text="Pricing notes" term="pric" /> // <mark>Pric</mark>ing notes
 */
export function Highlighted({ text, term }: { readonly text: string; readonly term: string }): ReactElement {
  if (term === '') return <>{text}</>
  const parts: ReactElement[] = []
  // Match on the ORIGINAL text: indexes found in text.toLowerCase() do not line up with text when
  // lower-casing changes the length ("İ" becomes two code units), so the wrong letters were marked.
  const pattern = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu')
  let start = 0
  for (const match of text.matchAll(pattern)) {
    const index = match.index
    if (match[0] === '') break
    if (index > start) parts.push(<span key={`t${start}`}>{text.slice(start, index)}</span>)
    parts.push(
      <mark key={`m${index}`} className="rounded-sm bg-warning-soft px-0.5 text-foreground">
        {match[0]}
      </mark>,
    )
    start = index + match[0].length
  }
  if (start < text.length) parts.push(<span key={`t${start}`}>{text.slice(start)}</span>)
  return <>{parts}</>
}
