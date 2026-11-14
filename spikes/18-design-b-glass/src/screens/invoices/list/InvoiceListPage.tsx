/**
 * Invoices list: header (breadcrumb, back, title + count, actions on one row), a solid card with
 * saved views, toolbar, chips, the table or grid, pagination, and the floating bulk bar.
 *
 * Mock states for review: `?state=empty` (no invoices yet) and `?state=loading` (skeleton).
 * `?status=overdue` pre-filters (used by the dashboard's "Review overdue" button).
 */
import { IconDownload, IconFileImport, IconPlus } from '@tabler/icons-react'
import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { EmptyState } from '../../../components/data-display.tsx'
import { EmptyInvoicesArt } from '../../../components/illustrations.tsx'
import { PageHeader } from '../../../components/PageHeader.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Card } from '../../../components/ui/card.tsx'
import { useConfirm } from '../../../components/ui/confirm.tsx'
import { useToast } from '../../../components/ui/toast.tsx'
import { INVOICE_STATUSES, INVOICES, type Invoice, type InvoiceStatus } from '../../../data/invoices.ts'
import { plural } from '../../../lib/format.ts'
import { QuickViewDrawer } from '../QuickViewDrawer.tsx'
import { InvoiceTable, InvoiceTableSkeleton } from './InvoiceTable.tsx'
import { applyQuery, DEFAULT_QUERY, filterInvoices, nextSort, paginate, SAVED_VIEWS, viewQuery, type ListQuery } from './list-state.ts'
import { BulkBar, InvoiceGrid, Pagination } from './ListParts.tsx'
import { FilterChips, ListToolbar, SavedViews, type ColumnId, type Density, type ViewMode } from './ListToolbar.tsx'

const ALL_COLUMNS: readonly ColumnId[] = ['customer', 'owner', 'issuedAt', 'dueAt', 'status', 'collected', 'total']

function initialQuery(status: string | null): ListQuery {
  const valid = INVOICE_STATUSES.find((candidate) => candidate === status)
  return valid === undefined ? DEFAULT_QUERY : { ...DEFAULT_QUERY, statuses: [valid satisfies InvoiceStatus] }
}

/**
 * Re-mount the list when the mock state or preset filter in the URL changes (e.g. from the
 * Screens menu), so its local state starts fresh instead of keeping the previous rows.
 */
export function InvoiceListPage() {
  const [params] = useSearchParams()
  return <InvoiceList key={`${params.get('state') ?? ''}|${params.get('status') ?? ''}`} />
}

function InvoiceList() {
  const [params] = useSearchParams()
  const mockState = params.get('state')
  const toast = useToast()
  const confirm = useConfirm()

  const [invoices, setInvoices] = useState<readonly Invoice[]>(mockState === 'empty' ? [] : INVOICES)
  const [query, setQuery] = useState<ListQuery>(() => initialQuery(params.get('status')))
  const [savedView, setSavedView] = useState<string | null>(params.get('status') === null ? 'all' : null)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [columns, setColumns] = useState<ReadonlySet<ColumnId>>(() => new Set(ALL_COLUMNS))
  const [density, setDensity] = useState<Density>('comfortable')
  const [view, setView] = useState<ViewMode>('table')
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set())
  const [quickView, setQuickView] = useState<Invoice | null>(null)

  const visible = useMemo(() => applyQuery(invoices, query), [invoices, query])
  const current = paginate(visible, page, pageSize)
  const viewCounts = useMemo(() => Object.fromEntries(SAVED_VIEWS.map((saved) => [saved.id, filterInvoices(invoices, viewQuery(saved)).length])), [invoices])

  const changeQuery = (next: ListQuery): void => {
    setQuery(next)
    setPage(1)
    setSavedView(null)
  }
  const selectView = (id: string): void => {
    const saved = SAVED_VIEWS.find((candidate) => candidate.id === id)
    if (saved === undefined) return
    setQuery(viewQuery(saved))
    setSavedView(id)
    setPage(1)
  }
  const toggleRow = (id: string): void =>
    setSelected((currentSet) => {
      const next = new Set(currentSet)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const toggleAll = (select: boolean): void =>
    setSelected((currentSet) => {
      const next = new Set(currentSet)
      for (const row of current.rows) {
        if (select) next.add(row.id)
        else next.delete(row.id)
      }
      return next
    })

  const remove = async (targets: readonly Invoice[]): Promise<void> => {
    const ok = await confirm({
      title: targets.length === 1 ? `Delete ${targets[0]?.number ?? 'invoice'}?` : `Delete ${targets.length} invoices?`,
      description: 'Deleted invoices move to the trash for 30 days. Customers keep any copy already sent to them.',
      confirmLabel: targets.length === 1 ? 'Delete invoice' : `Delete ${targets.length} invoices`,
      destructive: true,
    })
    if (!ok) return
    const ids = new Set(targets.map((invoice) => invoice.id))
    const before = invoices
    setInvoices((list) => list.filter((invoice) => !ids.has(invoice.id)))
    setSelected(new Set())
    toast({ title: `${plural(targets.length, 'invoice')} deleted`, description: 'You can restore them from the trash.', action: { label: 'Undo', onClick: () => setInvoices(before) } })
  }
  const remind = (targets: readonly Invoice[]): void => {
    const open = targets.filter((invoice) => invoice.status === 'pending' || invoice.status === 'overdue')
    toast(
      open.length === 0
        ? { title: 'Nothing to remind', description: 'Only pending or overdue invoices get reminders.', tone: 'info' }
        : { title: `${plural(open.length, 'reminder')} sent`, description: open.length === 1 ? `${open[0]?.customer.name ?? ''} will get an e-mail now.` : 'Customers will get an e-mail now.' },
    )
  }
  const duplicate = (invoice: Invoice): void => toast({ title: `${invoice.number} duplicated`, description: 'The copy is saved as a draft.' })
  const handlers = { onQuickView: setQuickView, onDelete: (rows: readonly Invoice[]) => void remove(rows), onRemind: remind, onDuplicate: duplicate }
  const selectedRows = invoices.filter((invoice) => selected.has(invoice.id))

  const header = (
    <PageHeader
      breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Billing', to: '/invoices' }, { label: 'Invoices' }]}
      back="/"
      title="Invoices"
      count={invoices.length}
      description="Create, send and track every invoice. Overdue ones float to the top of “Needs attention”."
      actions={
        <>
          <Button variant="secondary" className="max-sm:flex-1">
            <IconFileImport aria-hidden /> Import
          </Button>
          <Button variant="secondary" className="max-sm:flex-1">
            <IconDownload aria-hidden /> Export
          </Button>
          <Button asChild className="max-sm:w-full">
            <Link to="/invoices/new">
              <IconPlus aria-hidden /> New invoice
            </Link>
          </Button>
        </>
      }
    />
  )

  if (invoices.length === 0) {
    return (
      <>
        {header}
        <Card material="solid">
          <EmptyState
            art={<EmptyInvoicesArt className="h-40" />}
            title="No invoices yet"
            description="Create your first invoice, or import existing ones from a CSV or your accounting tool."
            actions={
              <>
                <Button variant="secondary">
                  <IconFileImport aria-hidden /> Import CSV
                </Button>
                <Button asChild>
                  <Link to="/invoices/new">
                    <IconPlus aria-hidden /> Create invoice
                  </Link>
                </Button>
              </>
            }
          />
        </Card>
      </>
    )
  }

  return (
    <>
      {header}
      <Card material="solid" className="overflow-hidden">
        <SavedViews active={savedView} counts={viewCounts} onSelect={selectView} onSave={() => toast({ title: 'View saved', description: 'Find it under Saved views.', tone: 'info' })} />
        <ListToolbar
          query={query}
          onQueryChange={changeQuery}
          columns={columns}
          onToggleColumn={(column) =>
            setColumns((currentSet) => {
              const next = new Set(currentSet)
              if (next.has(column)) next.delete(column)
              else next.add(column)
              return next
            })
          }
          density={density}
          onDensityChange={setDensity}
          view={view}
          onViewChange={setView}
        />
        <FilterChips query={query} onQueryChange={changeQuery} />
        {mockState === 'loading' ? (
          <InvoiceTableSkeleton rows={pageSize > 8 ? 8 : pageSize} />
        ) : visible.length === 0 ? (
          <div className="border-t border-border">
            <EmptyState
              art={<EmptyInvoicesArt className="h-32" />}
              title="No invoices match"
              description="Try a different search or remove a filter."
              actions={
                <Button variant="secondary" onClick={() => changeQuery(DEFAULT_QUERY)}>
                  Clear search and filters
                </Button>
              }
            />
          </div>
        ) : view === 'table' ? (
          <InvoiceTable
            rows={current.rows}
            columns={columns}
            density={density}
            sort={query.sort}
            onSort={(key) => setQuery({ ...query, sort: nextSort(query.sort, key) })}
            selected={selected}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            {...handlers}
          />
        ) : (
          <InvoiceGrid rows={current.rows} selected={selected} onToggleRow={toggleRow} {...handlers} />
        )}
        {mockState !== 'loading' && visible.length > 0 && (
          <Pagination
            page={current}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        )}
      </Card>
      <BulkBar
        count={selected.size}
        total={invoices.length}
        onClear={() => setSelected(new Set())}
        onRemind={() => remind(selectedRows)}
        onMarkPaid={() => {
          toast({ title: `${plural(selected.size, 'invoice')} marked as paid` })
          setSelected(new Set())
        }}
        onExport={() => toast({ title: 'Export started', description: `${plural(selected.size, 'invoice')} as CSV.`, tone: 'info' })}
        onDelete={() => void remove(selectedRows)}
      />
      <QuickViewDrawer invoice={quickView} onOpenChange={(open) => !open && setQuickView(null)} onRemind={(invoice) => remind([invoice])} />
    </>
  )
}
