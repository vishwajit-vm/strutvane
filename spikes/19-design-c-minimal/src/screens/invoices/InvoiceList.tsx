/**
 * The invoice list: header, toolbar, chips, table (or empty / no-results / loading), pagination
 * and the bulk bar.
 *
 * On desktop the page fills the content panel and only the table area scrolls, so the header,
 * toolbar and pagination are always in view, like a native app. Edits (mark paid, delete) are kept
 * in local state with Undo, since the mock data itself is read-only.
 *
 * `?state=empty` and `?state=loading` force the empty and skeleton states for review.
 */
import { FilePlus2, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { EmptyState } from '../../components/empty-state.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { type Invoice, invoices, queryInvoices, type SortKey } from '../../data/invoices.ts'
import { plural } from '../../lib/format.ts'
import { Link, useRouter, withParams } from '../../lib/router.tsx'
import { useOverlays } from '../../shell/overlays.tsx'
import { BulkBar } from './BulkBar.tsx'
import { InvoicesHeader } from './InvoicesHeader.tsx'
import { InvoiceTable, InvoiceTableSkeleton, type RowActions } from './InvoiceTable.tsx'
import { readListState, sortParam } from './list-state.ts'
import { FilterChips, type ListChange, ListToolbar } from './ListToolbar.tsx'
import { Pagination } from './Pagination.tsx'
import { useViewPrefs } from './view-prefs.ts'

/** Local edits layered over the read-only mock: deleted ids and status changes. */
function useLocalEdits() {
  const [deleted, setDeleted] = useState<ReadonlySet<string>>(new Set())
  const [paid, setPaid] = useState<ReadonlySet<string>>(new Set())
  const rows = useMemo(
    () => invoices.filter((invoice) => !deleted.has(invoice.id)).map((invoice) => (paid.has(invoice.id) ? { ...invoice, status: 'paid' as const } : invoice)),
    [deleted, paid],
  )
  const add = (set: ReadonlySet<string>, ids: readonly string[]) => new Set([...set, ...ids])
  const drop = (set: ReadonlySet<string>, ids: readonly string[]) => new Set([...set].filter((id) => !ids.includes(id)))
  return {
    rows,
    remove: (ids: readonly string[]) => setDeleted((set) => add(set, ids)),
    restore: (ids: readonly string[]) => setDeleted((set) => drop(set, ids)),
    markPaid: (ids: readonly string[]) => setPaid((set) => add(set, ids)),
    unmarkPaid: (ids: readonly string[]) => setPaid((set) => drop(set, ids)),
  }
}

export function InvoiceList() {
  const { pathname, search, navigate } = useRouter()
  const forced = search.get('state')
  const state = readListState(search)
  const prefs = useViewPrefs()
  const edits = useLocalEdits()
  const toast = useToast()
  const { confirm, peek } = useOverlays()
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  // A new filter or search hides rows; a bulk action must never reach rows the user cannot see, so
  // the selection starts again (paging keeps it: the rows are still in the same result set).
  const filterKey = JSON.stringify(state.filters)
  useEffect(() => setSelected(new Set()), [filterKey])

  const source = forced === 'empty' ? [] : edits.rows
  const page = queryInvoices(source, state.filters, state.sort, state.page, state.pageSize)

  const onChange = useCallback(
    (change: ListChange, options?: { push?: boolean }) => {
      // On a saved view, removing a filter must override the view's own value, so "none" is
      // written as `-` instead of deleting the param (which would fall back to the view).
      const explicit: ListChange = { ...change }
      if (state.view !== null && change.view === undefined) {
        for (const key of ['status', 'owner', 'min'] as const) if (change[key] === null) explicit[key] = '-'
      }
      navigate(`${pathname}${withParams(search, explicit)}`, { replace: options?.push !== true })
    },
    [navigate, pathname, search, state.view],
  )

  const onSort = (key: SortKey) => {
    const direction = state.sort.key === key && state.sort.direction === 'asc' ? 'desc' : 'asc'
    onChange({ sort: sortParam({ key, direction }), page: null })
  }

  const onSelect = (ids: readonly string[], value: boolean) =>
    setSelected((current) => {
      const next = new Set(current)
      for (const id of ids) {
        if (value) next.add(id)
        else next.delete(id)
      }
      return next
    })

  // Escape clears the selection (the bulk bar shows the hint).
  useEffect(() => {
    if (selected.size === 0) return undefined
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]') === null) setSelected(new Set())
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected.size])

  const remove = async (targets: readonly Invoice[]) => {
    const first = targets[0]
    if (first === undefined) return
    const label = targets.length === 1 ? first.number : plural(targets.length, 'invoice')
    const ok = await confirm({
      title: `Delete ${label}?`,
      description: 'Deleted invoices move to the trash for 30 days. Customers keep any copy they were already sent.',
      confirmLabel: targets.length === 1 ? 'Delete invoice' : `Delete ${plural(targets.length, 'invoice')}`,
    })
    if (!ok) return
    const ids = targets.map((target) => target.id)
    edits.remove(ids)
    setSelected(new Set())
    toast({ title: `${label} deleted`, description: 'Moved to the trash.', action: { label: 'Undo', onClick: () => edits.restore(ids) } })
  }

  const actions: RowActions = {
    peek,
    remove: (targets) => void remove(targets),
    duplicate: (invoice) => toast({ title: `${invoice.number} duplicated`, description: 'A new draft was created with the same lines.', action: { label: 'Open', onClick: () => navigate('/invoices/new') } }),
    remind: (targets) => toast({ title: targets.length === 1 ? 'Reminder sent' : `${targets.length} reminders sent`, description: 'Customers get a polite nudge with a payment link.', tone: 'info' }),
  }

  const selectedRows = edits.rows.filter((invoice) => selected.has(invoice.id))
  const loading = forced === 'loading'
  const hasFilters = state.filters.search !== '' || state.filters.statuses.length > 0 || state.filters.ownerIds.length > 0 || state.filters.minAmount !== null

  let body
  if (loading) body = <InvoiceTableSkeleton />
  else if (source.length === 0)
    body = (
      <EmptyState
        illustration="invoices"
        title="No invoices yet"
        description="Create your first invoice, or import existing ones from a CSV export of your old tool."
        action={
          <>
            <Button>
              <Upload aria-hidden /> Import CSV
            </Button>
            <Button asChild variant="primary">
              <Link to="/invoices/new">
                <FilePlus2 aria-hidden /> New invoice
              </Link>
            </Button>
          </>
        }
      />
    )
  else if (page.total === 0)
    body = (
      <EmptyState
        illustration="search"
        title="No invoices match"
        description={hasFilters ? 'Try a different search, or remove a filter to widen the results.' : 'Nothing to show for this view.'}
        action={<Button onClick={() => onChange({ q: null, status: null, owner: null, min: null, page: null })}>Clear filters</Button>}
      />
    )
  else
    body = (
      <InvoiceTable
        rows={page.rows}
        columns={prefs.columns}
        density={prefs.density}
        sort={state.sort}
        onSort={onSort}
        selected={selected}
        onSelect={onSelect}
        actions={actions}
      />
    )

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:h-full lg:px-8 lg:py-6">
      <InvoicesHeader count={forced === 'empty' ? 0 : page.total} loading={loading} />
      <ListToolbar
        state={state}
        onChange={onChange}
        density={prefs.density}
        onDensity={prefs.setDensity}
        columns={prefs.columns}
        onToggleColumn={prefs.toggleColumn}
        disabled={loading || source.length === 0}
      />
      <FilterChips filters={state.filters} onChange={onChange} />
      <div
        role="region"
        aria-label="Invoice results"
        aria-busy={loading}
        tabIndex={-1}
        className="relative scroll-quiet min-h-0 overflow-auto rounded-lg border border-border bg-surface max-lg:max-h-[70dvh] lg:flex-1"
      >
        {body}
      </div>
      {!loading && page.total > 0 && (
        <Pagination
          page={page.page}
          pageCount={page.pageCount}
          pageSize={state.pageSize}
          total={page.total}
          onPage={(next) => onChange({ page: next === 1 ? null : String(next) }, { push: true })}
          onPageSize={(size) => onChange({ size: size === 25 ? null : String(size), page: null })}
        />
      )}
      <BulkBar
        count={selected.size}
        onMarkPaid={() => {
          const ids = selectedRows.map((row) => row.id)
          edits.markPaid(ids)
          setSelected(new Set())
          toast({ title: `${plural(ids.length, 'invoice')} marked as paid`, action: { label: 'Undo', onClick: () => edits.unmarkPaid(ids) } })
        }}
        onRemind={() => actions.remind(selectedRows)}
        onExport={() => toast({ title: 'Export ready', description: `${plural(selectedRows.length, 'invoice')} exported to invoices.csv.` })}
        onDelete={() => void remove(selectedRows)}
        onClear={() => setSelected(new Set())}
      />
    </div>
  )
}
