/**
 * Smaller parts of the invoice list: the grid (card) view, pagination with page size, and the
 * floating bulk-action bar that appears when rows are selected.
 */
import { IconChevronLeft, IconChevronRight, IconCircleCheck, IconDownload, IconSend, IconTrash, IconX } from '@tabler/icons-react'
import { Link } from 'react-router'
import { StatusBadge } from '../../../components/data-display.tsx'
import { Avatar } from '../../../components/ui/avatar.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Progress } from '../../../components/ui/misc.tsx'
import { Select } from '../../../components/ui/select.tsx'
import { Checkbox } from '../../../components/ui/toggles.tsx'
import type { Invoice } from '../../../data/invoices.ts'
import { cn } from '../../../lib/cn.ts'
import { formatDate, formatMoney, formatNumber } from '../../../lib/format.ts'
import { collectedRatio, dueLabel, pageWindow, type Page } from './list-state.ts'
import { RowActions, type RowHandlers } from './InvoiceTable.tsx'

// ── Grid view ─────────────────────────────────────────────────────────────

export function InvoiceGrid({ rows, selected, onToggleRow, ...handlers }: RowHandlers & { rows: readonly Invoice[]; selected: ReadonlySet<string>; onToggleRow: (id: string) => void }) {
  return (
    <ul className="grid gap-4 border-t border-border p-4 sm:grid-cols-2 sm:p-5 xl:grid-cols-3" aria-label="Invoices">
      {rows.map((invoice) => {
        const due = dueLabel(invoice)
        const ratio = collectedRatio(invoice)
        const isSelected = selected.has(invoice.id)
        return (
          <li
            key={invoice.id}
            className={cn(
              'group relative rounded-lg border bg-surface p-4 shadow-glass transition-base hover:-translate-y-0.5 hover:shadow-float',
              isSelected ? 'border-control shadow-[0_0_0_3px_var(--primary-soft)]' : 'border-border',
            )}
          >
            <div className="flex items-start gap-3">
              <Avatar name={invoice.customer.name} shape="square" size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-fg">{invoice.customer.name}</p>
                <Link to={`/invoices/${invoice.id}`} className="font-mono text-xs font-semibold text-primary-text hover:underline">
                  {invoice.number}
                </Link>
              </div>
              <Checkbox checked={isSelected} onCheckedChange={() => onToggleRow(invoice.id)} aria-label={`Select ${invoice.number}`} />
            </div>
            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-bold tracking-tight text-fg tabular">{formatMoney(invoice.total)}</p>
                <p className={cn('text-xs', due.late ? 'font-semibold text-danger' : 'text-fg-muted')}>
                  {formatDate(invoice.dueAt)} · {due.text}
                </p>
              </div>
              <StatusBadge status={invoice.status} />
            </div>
            <div className="mt-4 flex items-center gap-3 border-t border-border pt-3">
              <Progress value={ratio * 100} tone={ratio === 1 ? 'success' : 'primary'} label={`${Math.round(ratio * 100)}% collected`} className="flex-1" />
              <span className="text-xs font-semibold text-fg-muted tabular">{Math.round(ratio * 100)}%</span>
              <RowActions invoice={invoice} {...handlers} />
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Pagination ────────────────────────────────────────────────────────────

export function Pagination({ page, pageSize, onPageChange, onPageSizeChange, noun = 'invoices' }: { page: Page<unknown>; pageSize: number; onPageChange: (page: number) => void; onPageSizeChange: (size: number) => void; noun?: string }) {
  return (
    <nav aria-label="Pagination" className="flex flex-col items-center gap-3 border-t border-border px-4 py-3.5 sm:flex-row sm:px-5">
      <p className="text-sm text-fg-muted" aria-live="polite">
        Showing <span className="font-semibold text-fg tabular">{page.from}</span>–<span className="font-semibold text-fg tabular">{page.to}</span> of{' '}
        <span className="font-semibold text-fg tabular">{formatNumber(page.total)}</span> {noun}
      </p>
      <div className="flex items-center gap-2 sm:ml-auto">
        <span className="hidden text-sm text-fg-muted sm:inline">Rows</span>
        <Select
          aria-label="Rows per page"
          size="sm"
          className="w-[4.5rem]"
          value={String(pageSize)}
          onValueChange={(value) => onPageSizeChange(Number(value))}
          options={[10, 25, 50].map((size) => ({ value: String(size), label: String(size) }))}
        />
      </div>
      <ol className="flex items-center gap-1">
        <li>
          <Button variant="ghost" size="icon-sm" aria-label="Previous page" disabled={page.page <= 1} onClick={() => onPageChange(page.page - 1)}>
            <IconChevronLeft aria-hidden />
          </Button>
        </li>
        {pageWindow(page.page, page.pageCount).map((item, index) =>
          item === 'gap' ? (
            <li key={`gap-${String(index)}`} className="px-1 text-fg-muted" aria-hidden>
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                onClick={() => onPageChange(item)}
                aria-current={item === page.page ? 'page' : undefined}
                aria-label={`Page ${item}`}
                className={cn(
                  'grid h-8 min-w-8 place-items-center rounded-sm px-2 text-sm font-semibold tabular transition-fast',
                  item === page.page ? 'bg-brand-gradient text-primary-fg shadow-primary' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                )}
              >
                {item}
              </button>
            </li>
          ),
        )}
        <li>
          <Button variant="ghost" size="icon-sm" aria-label="Next page" disabled={page.page >= page.pageCount} onClick={() => onPageChange(page.page + 1)}>
            <IconChevronRight aria-hidden />
          </Button>
        </li>
      </ol>
    </nav>
  )
}

// ── Bulk bar ──────────────────────────────────────────────────────────────

export interface BulkBarProps {
  readonly count: number
  readonly total: number
  readonly onClear: () => void
  readonly onRemind: () => void
  readonly onMarkPaid: () => void
  readonly onExport: () => void
  readonly onDelete: () => void
}

/** Floats at the bottom centre while rows are selected; announced as a toolbar. */
export function BulkBar({ count, total, onClear, onRemind, onMarkPaid, onExport, onDelete }: BulkBarProps) {
  if (count === 0) return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-(--z-dropdown) flex justify-center px-3 lg:pl-[calc(var(--sidebar-width)+var(--chrome-gap)*2)]">
      <div role="toolbar" aria-label="Bulk actions" className="glass-overlay animate-glass-in pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-2xl p-1.5 pl-4">
        <p className="mr-2 shrink-0 text-sm font-semibold whitespace-nowrap text-fg" aria-live="polite">
          <span className="bg-brand-gradient mr-2 inline-grid min-w-6 place-items-center rounded-full px-1.5 text-xs text-primary-fg tabular">{count}</span>
          <span className="hidden sm:inline">of {total} </span>selected
        </p>
        <Button variant="ghost" size="sm" onClick={onRemind}>
          <IconSend aria-hidden /> <span className="max-md:sr-only">Send reminder</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onMarkPaid}>
          <IconCircleCheck aria-hidden /> <span className="max-md:sr-only">Mark paid</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onExport}>
          <IconDownload aria-hidden /> <span className="max-md:sr-only">Export</span>
        </Button>
        <Button variant="ghost" size="sm" onClick={onDelete} className="text-danger hover:bg-danger-soft">
          <IconTrash aria-hidden /> <span className="max-md:sr-only">Delete</span>
        </Button>
        <span className="mx-1 h-6 w-px shrink-0 bg-border" aria-hidden />
        <Button variant="ghost" size="icon-sm" aria-label="Clear selection" onClick={onClear}>
          <IconX aria-hidden />
        </Button>
      </div>
    </div>
  )
}
