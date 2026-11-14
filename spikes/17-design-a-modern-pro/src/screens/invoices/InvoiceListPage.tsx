/**
 * Invoice list: page header (breadcrumb, back, title + count, actions on one row), then a single
 * card holding status tabs, the toolbar, filter chips, the table and the pager. Also renders the
 * empty and loading states (`?state=empty`, `?state=loading`), the bulk bar, the quick-view
 * drawer and the delete confirmation.
 */
import { IconFileImport, IconPlus, IconUpload } from '@tabler/icons-react'
import { useMemo, useState, type ReactElement } from 'react'
import { EmptyState } from '../../components/data-display.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { ConfirmDialog, Sheet } from '../../components/ui/dialog.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { invoices as allInvoices, countByStatus, type Invoice } from '../../data/invoices.ts'
import { plural } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'
import { InvoiceTable, InvoiceTableSkeleton } from './InvoiceTable.tsx'
import { FilterChips, InvoiceToolbar, type Density } from './InvoiceToolbar.tsx'
import { filterInvoices, NO_FILTERS, paginate, SAVED_VIEWS, sortInvoices, type ColumnId, type InvoiceFilters, type Sort } from './list-model.ts'
import { BulkBar, Pager, QuickView, StatusTabs } from './ListParts.tsx'

/** Which state to show: real data, the empty state, or the loading skeleton. */
export type ListState = 'ready' | 'empty' | 'loading'

export function InvoiceListPage({ state = 'ready', initialStatus = 'all' }: { readonly state?: ListState; readonly initialStatus?: InvoiceFilters['status'] }): ReactElement {
  const source = state === 'empty' ? [] : allInvoices
  const [filters, setFilters] = useState<InvoiceFilters>({ ...NO_FILTERS, status: initialStatus })
  const [savedView, setSavedView] = useState('all')
  const [sort, setSort] = useState<Sort>({ key: 'dueAt', direction: 'desc' })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)
  const [hidden, setHidden] = useState<ReadonlySet<ColumnId>>(new Set(['issued']))
  const [density, setDensity] = useState<Density>('comfortable')
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [quickView, setQuickView] = useState<Invoice | null>(null)
  const [pendingDelete, setPendingDelete] = useState<readonly Invoice[]>([])

  const changeFilters = (next: InvoiceFilters): void => {
    setFilters(next)
    setPage(1)
    const matching = SAVED_VIEWS.find((view) => JSON.stringify({ ...view.filters, search: next.search, status: next.status }) === JSON.stringify(next))
    setSavedView(matching?.id ?? 'custom')
  }

  const statusCounts = useMemo(() => countByStatus(filterInvoices(source, filters, false)), [source, filters])
  const filtered = useMemo(() => sortInvoices(filterInvoices(source, filters), sort), [source, filters, sort])
  const pageData = paginate(filtered, page, pageSize)

  const remind = (count: number): void => toast({ tone: 'success', title: count === 1 ? 'Reminder sent' : `${count} reminders sent`, description: 'Customers will get a friendly email with a payment link.' })

  const confirmDelete = (): void => {
    toast({ tone: 'success', title: pendingDelete.length === 1 ? `${pendingDelete[0]?.id ?? 'Invoice'} deleted` : `${pendingDelete.length} invoices deleted`, description: 'You can restore them from Trash for 30 days.' })
    setSelected(new Set())
    setPendingDelete([])
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing' }, { label: 'Invoices' }]}
        back="/dashboard"
        title="Invoices"
        count={source.length}
        actions={
          <>
            <Button variant="outline" onClick={() => toast({ tone: 'info', title: 'Import', description: 'Upload a CSV with one invoice per row.' })}>
              <IconFileImport /> Import
            </Button>
            <Button asChild variant="primary">
              <Link to="/invoices/new">
                <IconPlus /> New invoice
              </Link>
            </Button>
          </>
        }
      />
      <section aria-label="Invoice list" className="flex min-w-0 flex-col gap-4 overflow-hidden rounded-xl border border-border/70 bg-card pb-4 shadow-sm sm:pb-5 dark:border-border">
        <StatusTabs value={filters.status} counts={statusCounts} total={filterInvoices(source, { ...filters, status: 'all' }).length} onChange={(status) => changeFilters({ ...filters, status })} />
        <InvoiceToolbar
          filters={filters}
          onFiltersChange={changeFilters}
          savedView={savedView}
          onSavedViewChange={(id) => {
            const view = SAVED_VIEWS.find((item) => item.id === id)
            if (view !== undefined) {
              setFilters(view.filters)
              setSavedView(id)
              setPage(1)
            }
          }}
          hidden={hidden}
          onToggleColumn={(id) => {
            const next = new Set(hidden)
            if (next.has(id)) next.delete(id)
            else next.add(id)
            setHidden(next)
          }}
          density={density}
          onDensityChange={setDensity}
        />
        <FilterChips filters={filters} onFiltersChange={changeFilters} />
        <div className="border-t border-border">
          {state === 'loading' ? (
            <InvoiceTableSkeleton />
          ) : source.length === 0 ? (
            <EmptyState
              title="No invoices yet"
              description="Create your first invoice, or import existing ones from a spreadsheet. Customers can pay online straight from the email."
              action={
                <>
                  <Button variant="outline" onClick={() => toast({ tone: 'info', title: 'Import', description: 'Upload a CSV with one invoice per row.' })}>
                    <IconUpload /> Import CSV
                  </Button>
                  <Button asChild variant="primary">
                    <Link to="/invoices/new">
                      <IconPlus /> Create invoice
                    </Link>
                  </Button>
                </>
              }
            />
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No matching invoices"
              description="Nothing matches these filters. Try a different search or clear the filters."
              action={
                <Button variant="soft" onClick={() => changeFilters(NO_FILTERS)}>
                  Clear all filters
                </Button>
              }
            />
          ) : (
            <InvoiceTable
              rows={pageData.rows}
              hidden={hidden}
              density={density}
              sort={sort}
              onSortChange={setSort}
              selected={selected}
              onSelectedChange={setSelected}
              onQuickView={setQuickView}
              onDelete={(invoice) => setPendingDelete([invoice])}
              onRemind={() => remind(1)}
            />
          )}
        </div>
        {state === 'ready' && filtered.length > 0 ? (
          <Pager
            page={pageData.page}
            pageCount={pageData.pageCount}
            from={pageData.from}
            to={pageData.to}
            total={filtered.length}
            pageSize={pageSize}
            onPageChange={setPage}
            onPageSizeChange={(size) => {
              setPageSize(size)
              setPage(1)
            }}
          />
        ) : null}
      </section>
      <BulkBar
        count={selected.size}
        onClear={() => setSelected(new Set())}
        onRemind={() => remind(selected.size)}
        onExport={() => toast({ tone: 'success', title: `Exporting ${plural(selected.size, 'invoice')}`, description: 'The CSV will download in a moment.' })}
        onDelete={() => setPendingDelete(allInvoices.filter((invoice) => selected.has(invoice.id)))}
      />
      <Sheet open={quickView !== null} onOpenChange={(open) => (open ? undefined : setQuickView(null))}>
        {quickView === null ? null : <QuickView invoice={quickView} onRemind={() => remind(1)} />}
      </Sheet>
      <ConfirmDialog
        open={pendingDelete.length > 0}
        onOpenChange={(open) => (open ? undefined : setPendingDelete([]))}
        title={pendingDelete.length === 1 ? `Delete ${pendingDelete[0]?.id ?? 'invoice'}?` : `Delete ${pendingDelete.length} invoices?`}
        description="Deleted invoices move to Trash and are removed for good after 30 days. Customers keep any emails already sent."
        confirmLabel={pendingDelete.length === 1 ? 'Delete invoice' : `Delete ${pendingDelete.length} invoices`}
        onConfirm={confirmDelete}
      />
    </>
  )
}
