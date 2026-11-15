/**
 * `<ListView>`: a complete list (toolbar, filters, table, pagination and every state) for one
 * resource, driven by {@link ListParams}. The list page keeps those params in the URL; relation
 * tabs on a detail page keep them in local state. Same component, same behaviour.
 *
 * States (design doc §4.12):
 * - first load: skeleton rows, `aria-busy`;
 * - next page/sort/filter: previous rows stay, dimmed (no layout jump);
 * - empty: "No posts yet" + Create (if allowed); empty with filters: "No posts match" + Clear;
 * - error: the server's friendly message + Retry.
 *
 * @module
 */
import { Link } from '@tanstack/react-router'
import { IconColumns, IconFilter, IconInbox, IconLayoutRows, IconLink, IconPlus } from '@tabler/icons-react'
import { useEffect, useId, useMemo, useState, type ReactElement } from 'react'
import type { ResolvedResourceUi } from '../../shared/resolve-ui.ts'
import { activeFilterCount, nextSort, withFilter, type ListParams, type TrashedMode } from '../api/list-params.ts'
import { useSession } from '../auth/session.tsx'
import { Button, buttonVariants } from '../components/ui/button.tsx'
import { Card } from '../components/ui/card.tsx'
import { DropdownMenu } from '../components/ui/dropdown-menu.tsx'
import { useToast } from '../components/ui/toast.tsx'
import { copyText } from '../lib/clipboard.ts'
import { FilterChips } from './FilterChips.tsx'
import { useViewPrefs } from './view-prefs.ts'
import { Input } from '../components/ui/input.tsx'
import { NativeSelect } from '../components/ui/native-select.tsx'
import { Skeleton } from '../components/ui/skeleton.tsx'
import { useListQuery, useRelatedRows } from '../data/queries.ts'
import { useDebouncedValue } from '../lib/hooks.ts'
import { FilterPanel } from './FilterPanel.tsx'
import { Pagination } from './Pagination.tsx'
import { ResourceTable } from './ResourceTable.tsx'
import { LoadError } from './states.tsx'

/** Wait this long after the last keystroke before searching (design doc §4.2). */
const SEARCH_DEBOUNCE_MS = 300

/**
 * Props of {@link ListView}.
 *
 * @example
 * const props: ListViewProps = { resource: posts, params, onChange: (patch) => setParams({ ...params, ...patch }) }
 */
export interface ListViewProps {
  readonly resource: ResolvedResourceUi
  readonly params: ListParams
  /** Apply a change. Anything other than a page change also resets to page 1. */
  readonly onChange: (patch: Partial<ListParams>) => void
  /** Relation tabs hide the search, filters and trash controls. */
  readonly compact?: boolean
}

/**
 * One resource's list.
 *
 * @example
 * <ListView resource={posts} params={params} onChange={update} />
 */
export function ListView({ resource, params, onChange, compact = false }: ListViewProps): ReactElement {
  const query = useListQuery(resource, params)
  const rows = query.data?.data ?? []
  const view = useViewPrefs(resource.name)
  // The title column always stays: without it a row has nothing to click. Memoised: a new array
  // on every render would give the table new cell components and remount every cell (closing an
  // open delete dialog; the defect the delete test caught twice).
  const columns = useMemo(
    () => resource.columns.filter((field) => field.name === resource.metadata.titleField || !view.prefs.hidden.includes(field.name)),
    [resource.columns, resource.metadata.titleField, view.prefs.hidden],
  )
  const related = useRelatedRows(resource, columns, rows)
  const [filtersOpen, setFiltersOpen] = useState(activeFilterCount(params.filters, 'without') > 0)
  const noun = resource.label.plural.toLowerCase()
  const filtered = params.search.trim() !== '' || activeFilterCount(params.filters, params.trashed) > 0
  const clearAll = (): void => onChange({ search: '', filters: {}, trashed: 'without', page: 1 })
  // For a list URL the server refuses (an unknown field or operator, an over-long search).
  const resetAll = (): void => onChange({ search: '', filters: {}, trashed: 'without', page: 1, sort: resource.defaultSort })
  const lastPage = query.data?.meta.lastPage ?? 1

  const body = (
    <div className="space-y-4">
      {!compact && (
        <ListToolbar resource={resource} params={params} onChange={onChange} filtersOpen={filtersOpen} onToggleFilters={() => setFiltersOpen((open) => !open)} view={view} />
      )}
      {!compact && <FilterChips resource={resource} params={params} onChange={onChange} />}
      {!compact && filtersOpen && resource.filterFields.length > 0 && (
        <FilterPanel resource={resource} filters={params.filters} onFilter={(key, value) => onChange({ filters: withFilter(params.filters, key, value), page: 1 })} />
      )}
      {/* Announces the new count politely after every search, filter or page change. */}
      <p role="status" className="sr-only">
        {query.data === undefined ? '' : `${query.data.meta.total} ${noun} found`}
      </p>
      {query.isError ? (
        <LoadError what={noun} error={query.error} onRetry={() => void query.refetch()} onReset={{ label: 'Reset search, filters and sort', run: resetAll }} />
      ) : query.data === undefined ? (
        <LoadingRows resource={resource} />
      ) : query.data.meta.total === 0 ? (
        <EmptyState resource={resource} filtered={filtered} onClear={clearAll} />
      ) : rows.length === 0 && params.page > lastPage ? (
        // A stale or edited URL (?page=99): there ARE rows, just not on this page.
        <div className="rounded-xl border border-dashed px-4 py-10 text-center">
          <p className="font-medium">
            Page {params.page} is past the end: there {lastPage === 1 ? 'is 1 page' : `are ${lastPage} pages`}.
          </p>
          <Button variant="outline" className="mt-4" onClick={() => onChange({ page: lastPage })}>
            Go to the last page ({lastPage})
          </Button>
        </div>
      ) : (
        <>
          <ResourceTable resource={resource} rows={rows} columns={columns} density={view.prefs.density} highlight={params.search} sort={params.sort} related={related.data} busy={query.isPlaceholderData} onSort={(field) => onChange({ sort: nextSort(params.sort, field, resource.defaultSort), page: 1 })} />
          <Pagination meta={query.data.meta} noun={noun} onPage={(page) => onChange({ page })} onPerPage={(perPage) => onChange({ perPage, page: 1 })} />
        </>
      )}
    </div>
  )
  // On its own page the list sits in a card; inside a detail tab the tab panel is the card.
  return compact ? body : <Card className="p-5">{body}</Card>
}

/** Search box, filter toggle and the deleted-records selector. */
function ListToolbar({ resource, params, onChange, filtersOpen, onToggleFilters, view }: ListViewProps & { readonly filtersOpen: boolean; readonly onToggleFilters: () => void; readonly view: ReturnType<typeof useViewPrefs> }): ReactElement {
  const toast = useToast()
  const searchId = useId()
  const trashedId = useId()
  const [text, setText] = useState(params.search)
  // The last search this box sent. When the URL's search differs from it, someone else changed it
  // ("Clear filters", Back button): show that value instead of the stale text.
  const [sent, setSent] = useState(params.search)
  if (params.search !== sent) {
    setSent(params.search)
    setText(params.search)
  }
  const send = (value: string): void => {
    setSent(value)
    onChange({ search: value, page: 1 })
  }
  const debounced = useDebouncedValue(text, SEARCH_DEBOUNCE_MS)
  useEffect(() => {
    if (debounced !== sent) send(debounced)
    // Only a change of the typed text may trigger a search, not every re-render.
  }, [debounced])
  const filterCount = activeFilterCount(params.filters, 'without')

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="min-w-48 flex-1">
        <label htmlFor={searchId} className="sr-only">
          Search {resource.label.plural.toLowerCase()}
        </label>
        <Input
          id={searchId}
          type="search"
          placeholder={`Search ${resource.label.plural.toLowerCase()}…`}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && text !== sent) send(text)
          }}
        />
      </div>
      {resource.filterFields.length > 0 && (
        <Button variant="outline" aria-expanded={filtersOpen} onClick={onToggleFilters}>
          <IconFilter aria-hidden="true" />
          Filters{filterCount > 0 ? ` (${filterCount})` : ''}
        </Button>
      )}
      <DropdownMenu
        label="Columns"
        align="end"
        triggerClassName={buttonVariants({ variant: 'outline' })}
        trigger={
          <>
            <IconColumns aria-hidden="true" />
            Columns
          </>
        }
        items={resource.columns
          .filter((field) => field.name !== resource.metadata.titleField)
          .map((field) => ({ id: field.name, label: field.label, checked: !view.prefs.hidden.includes(field.name), onSelect: () => view.toggleColumn(field.name) }))}
      />
      <Button
        variant="outline"
        size="icon"
        aria-pressed={view.prefs.density === 'compact'}
        aria-label="Compact rows"
        title="Compact rows"
        onClick={() => view.setDensity(view.prefs.density === 'compact' ? 'comfortable' : 'compact')}
      >
        <IconLayoutRows aria-hidden="true" />
      </Button>
      <Button
        variant="outline"
        size="icon"
        aria-label="Copy link to this view"
        title="Copy link to this view (filters, sort and page included)"
        onClick={() => void copyText(window.location.href).then((ok) => toast(ok ? 'Link to this view copied.' : 'Could not copy the link. Copy it from the address bar instead.'))}
      >
        <IconLink aria-hidden="true" />
      </Button>
      {resource.metadata.softDeletes && (
        <div className="flex items-center gap-2">
          <label htmlFor={trashedId} className="whitespace-nowrap text-sm text-muted-foreground">
            Deleted records
          </label>
          <NativeSelect id={trashedId} className="w-auto" value={params.trashed} onChange={(event) => onChange({ trashed: toTrashedMode(event.target.value), page: 1 })}>
            <option value="without">Hide deleted</option>
            <option value="with">Include deleted</option>
            <option value="only">Only deleted</option>
          </NativeSelect>
        </div>
      )}
    </div>
  )
}

function toTrashedMode(value: string): TrashedMode {
  return value === 'with' || value === 'only' ? value : 'without'
}

/** Skeleton rows shaped like the real table, so nothing jumps when data arrives. */
function LoadingRows({ resource }: { readonly resource: ResolvedResourceUi }): ReactElement {
  return (
    <div aria-busy="true" aria-label={`Loading ${resource.label.plural.toLowerCase()}`} role="region" className="space-y-3 py-2">
      {[0, 1, 2, 3, 4].map((row) => (
        <div key={row} className="flex gap-3">
          {resource.columns.slice(0, 5).map((field) => (
            <Skeleton key={field.name} className="h-5 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

function EmptyState({ resource, filtered, onClear }: { readonly resource: ResolvedResourceUi; readonly filtered: boolean; readonly onClear: () => void }): ReactElement {
  const { can } = useSession()
  const noun = resource.label.plural.toLowerCase()
  return (
    <div className="rounded-xl border border-dashed px-4 py-14 text-center">
      <span aria-hidden="true" className="mx-auto flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-soft-foreground">
        <IconInbox className="size-7" />
      </span>
      {filtered ? (
        <>
          <p className="mt-3 font-medium">No {noun} match your search or filters</p>
          <Button variant="outline" className="mt-4" onClick={onClear}>
            Clear search and filters
          </Button>
        </>
      ) : (
        <>
          <p className="mt-3 font-medium">No {noun} yet</p>
          {can('create', resource.name) && (
            <Link to="/$resource/new" params={{ resource: resource.metadata.route }} className={buttonVariants({ className: 'mt-4' })}>
              <IconPlus aria-hidden="true" />
              Create {resource.label.singular.toLowerCase()}
            </Link>
          )}
        </>
      )}
    </div>
  )
}
