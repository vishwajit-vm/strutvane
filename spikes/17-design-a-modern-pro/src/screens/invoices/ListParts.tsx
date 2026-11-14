/**
 * Smaller pieces of the invoice list: the status tabs with counts, the pager footer, the floating
 * bulk-action bar and the quick-view drawer.
 *
 * @module
 */
import { IconChevronLeft, IconChevronRight, IconDownload, IconExternalLink, IconMailForward, IconPencil, IconSend, IconTrash, IconX } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { DescriptionList, PersonCell, STATUS_META, StatusBadge } from '../../components/data-display.tsx'
import { Button } from '../../components/ui/button.tsx'
import { SheetContent, SheetDescription, SheetTitle } from '../../components/ui/dialog.tsx'
import { Progress } from '../../components/ui/misc.tsx'
import { Select } from '../../components/ui/select.tsx'
import { balanceOf, INVOICE_STATUSES, type Invoice, type InvoiceStatus } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { formatDate, formatInteger, formatMoney } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'
import { pageWindow } from './list-model.ts'

/** Status quick-filter tabs with live counts (counts ignore the status filter itself). */
export function StatusTabs({ value, counts, total, onChange }: { readonly value: InvoiceStatus | 'all'; readonly counts: Readonly<Record<InvoiceStatus, number>>; readonly total: number; readonly onChange: (value: InvoiceStatus | 'all') => void }): ReactElement {
  const tabs: readonly { readonly id: InvoiceStatus | 'all'; readonly label: string; readonly count: number }[] = [
    { id: 'all', label: 'All', count: total },
    ...INVOICE_STATUSES.map((status) => ({ id: status, label: STATUS_META[status].label, count: counts[status] })),
  ]
  return (
    <div role="tablist" aria-label="Filter by status" className="scrollbar-thin relative flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border px-3 sm:px-4">
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={cn(
              '-mb-px inline-flex h-12 shrink-0 cursor-pointer items-center gap-2 border-b-2 px-3 text-sm font-semibold outline-none transition-colors focus-visible:ring-3 focus-visible:ring-ring/30',
              active ? 'border-primary text-primary-soft-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
            <span className={cn('rounded-full px-2 py-0.5 text-xs font-bold tabular', active ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground')}>{formatInteger(tab.count)}</span>
          </button>
        )
      })}
    </div>
  )
}

/** "Showing 1–10 of 64", rows-per-page, and numbered pages with ellipses. */
export function Pager({ page, pageCount, from, to, total, pageSize, onPageChange, onPageSizeChange }: { readonly page: number; readonly pageCount: number; readonly from: number; readonly to: number; readonly total: number; readonly pageSize: number; readonly onPageChange: (page: number) => void; readonly onPageSizeChange: (size: number) => void }): ReactElement {
  return (
    <nav aria-label="Pagination" className="flex flex-col gap-3 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="flex items-center gap-3 text-label text-muted-foreground">
        <span>
          Showing <strong className="font-semibold text-foreground tabular">{from}–{to}</strong> of <strong className="font-semibold text-foreground tabular">{formatInteger(total)}</strong>
        </span>
        <span className="hidden h-4 w-px bg-border sm:block" />
        <span className="flex items-center gap-2">
          Rows
          <Select aria-label="Rows per page" size="sm" className="w-18" value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))} options={[10, 25, 50].map((size) => ({ value: String(size), label: String(size) }))} />
        </span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)} aria-label="Previous page">
          <IconChevronLeft />
        </Button>
        {pageWindow(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} aria-hidden className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              onClick={() => onPageChange(item)}
              aria-label={`Page ${item}`}
              aria-current={item === page ? 'page' : undefined}
              className={cn(
                'grid size-8 cursor-pointer place-items-center rounded-md text-label font-semibold outline-none transition-colors tabular focus-visible:ring-3 focus-visible:ring-ring/30',
                item === page ? 'bg-primary text-primary-foreground shadow-primary' : 'text-foreground hover:bg-subtle',
              )}
            >
              {item}
            </button>
          ),
        )}
        <Button variant="ghost" size="icon-sm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)} aria-label="Next page">
          <IconChevronRight />
        </Button>
      </div>
    </nav>
  )
}

/** A floating dark pill at the bottom of the screen while rows are selected. */
export function BulkBar({ count, onClear, onRemind, onExport, onDelete }: { readonly count: number; readonly onClear: () => void; readonly onRemind: () => void; readonly onExport: () => void; readonly onDelete: () => void }): ReactElement | null {
  if (count === 0) return null
  const action = 'h-9 gap-1.5 rounded-full px-3 text-background hover:bg-background/15 [&_svg]:text-background'
  return (
    <div role="region" aria-label="Bulk actions" className="fixed inset-x-4 bottom-6 z-40 mx-auto flex max-w-fit flex-wrap items-center justify-center gap-1 rounded-2xl bg-foreground p-1.5 pl-4 text-background shadow-xl animate-pop-in sm:rounded-full">
      <span className="mr-2 text-sm font-semibold tabular" aria-live="polite">
        {count} selected
      </span>
      <Button variant="ghost" className={action} onClick={onRemind}>
        <IconSend /> <span className="max-sm:sr-only">Send reminders</span>
      </Button>
      <Button variant="ghost" className={action} onClick={onExport}>
        <IconDownload /> <span className="max-sm:sr-only">Export</span>
      </Button>
      <Button variant="ghost" className={cn(action)} onClick={onDelete}>
        <IconTrash /> <span className="max-sm:sr-only">Delete</span>
      </Button>
      <Button variant="ghost" size="icon" className="size-9 rounded-full text-background hover:bg-background/15" onClick={onClear} aria-label="Clear selection">
        <IconX />
      </Button>
    </div>
  )
}

/** The quick-view drawer content for one invoice. Render inside an open `<Sheet>`. */
export function QuickView({ invoice, onRemind }: { readonly invoice: Invoice; readonly onRemind: () => void }): ReactElement {
  const percent = Math.round((invoice.paid / invoice.amount) * 100)
  return (
    <SheetContent side="right">
      <div className="border-b border-border px-6 pb-5 pt-6">
        <div className="flex items-center gap-2.5 pr-8">
          <SheetTitle>{invoice.id}</SheetTitle>
          <StatusBadge status={invoice.status} />
        </div>
        <SheetDescription className="mt-1">Issued {formatDate(invoice.issuedAt)} · due {formatDate(invoice.dueAt)}</SheetDescription>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto px-6 py-6">
        <PersonCell name={invoice.customer.name} secondary={`${invoice.customer.contact} · ${invoice.customer.email}`} tone={invoice.customer.tone} />
        <div className="mt-6 rounded-xl bg-brand-gradient p-5 text-primary-foreground shadow-primary">
          <p className="text-label text-primary-foreground/85">Balance due</p>
          <p className="mt-1 text-[1.75rem] font-bold leading-9 tabular">{formatMoney(balanceOf(invoice))}</p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-primary-foreground/25">
            <div className="h-full rounded-full bg-primary-foreground" style={{ width: `${percent}%` }} />
          </div>
          <p className="mt-2 text-xs text-primary-foreground/85">
            {formatMoney(invoice.paid)} of {formatMoney(invoice.amount)} collected ({percent}%)
          </p>
        </div>
        <h3 className="mb-3 mt-7 text-overline font-semibold uppercase text-muted-foreground">Line items</h3>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {invoice.items.map((item) => (
            <li key={item.description} className="flex items-center justify-between gap-4 px-4 py-3 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-foreground">{item.description}</span>
                <span className="text-xs text-muted-foreground tabular">
                  {item.quantity} × {formatMoney(item.unitPrice)}
                </span>
              </span>
              <span className="font-semibold tabular">{formatMoney(item.quantity * item.unitPrice)}</span>
            </li>
          ))}
        </ul>
        <DescriptionList
          className="mt-7"
          items={[
            { label: 'Owner', value: invoice.owner.name },
            { label: 'Method', value: invoice.method },
            { label: 'Country', value: invoice.customer.country },
            { label: 'Collected', value: <Progress value={percent} label={`${percent}% collected`} tone={percent === 100 ? 'success' : 'warning'} className="mt-2" /> },
          ]}
        />
      </div>
      <div className="flex flex-wrap gap-2 border-t border-border px-6 py-4">
        <Button variant="outline" onClick={onRemind} disabled={invoice.status === 'paid'}>
          <IconMailForward /> Remind
        </Button>
        <Button asChild variant="outline">
          <Link to={`/invoices/${invoice.id}/edit`}>
            <IconPencil /> Edit
          </Link>
        </Button>
        <Button asChild variant="primary" className="ml-auto">
          <Link to={`/invoices/${invoice.id}`}>
            Open <IconExternalLink />
          </Link>
        </Button>
      </div>
    </SheetContent>
  )
}
