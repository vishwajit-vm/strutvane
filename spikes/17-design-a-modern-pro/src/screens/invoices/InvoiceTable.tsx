/**
 * The invoice data table: selection column, sortable headers (`aria-sort`), avatar cells, status
 * badges, right-aligned tabular numbers, a due-date hint coloured by urgency, a payment progress
 * bar and a row-actions menu. The header is sticky inside the scroll area, so it stays visible
 * while the rows scroll; wide tables scroll sideways inside the card, never the page.
 *
 * @module
 */
import { IconArrowsSort, IconCopy, IconDots, IconEye, IconLayoutSidebarRightExpand, IconPencil, IconSend, IconSortAscending, IconSortDescending, IconTrash } from '@tabler/icons-react'
import type { ReactElement, ReactNode } from 'react'
import { PersonCell, StatusBadge } from '../../components/data-display.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/checkbox.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/menu.tsx'
import { Avatar, Progress, Skeleton } from '../../components/ui/misc.tsx'
import { balanceOf, type Invoice } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { daysUntil, formatDate, formatMoney } from '../../lib/format.ts'
import { Link, navigate } from '../../lib/router.tsx'
import type { Density } from './InvoiceToolbar.tsx'
import type { ColumnId, Sort, SortKey } from './list-model.ts'

/** Props of {@link InvoiceTable}. */
export interface InvoiceTableProps {
  readonly rows: readonly Invoice[]
  readonly hidden: ReadonlySet<ColumnId>
  readonly density: Density
  readonly sort: Sort
  readonly onSortChange: (sort: Sort) => void
  readonly selected: ReadonlySet<string>
  readonly onSelectedChange: (selected: ReadonlySet<string>) => void
  readonly onQuickView: (invoice: Invoice) => void
  readonly onDelete: (invoice: Invoice) => void
  readonly onRemind: (invoice: Invoice) => void
}

const thBase = 'sticky top-0 z-10 whitespace-nowrap border-b border-border bg-muted px-3 py-3 text-left text-overline font-semibold uppercase text-muted-foreground'

function SortHeader({ label, sortKey, sort, onSortChange, align = 'left' }: { readonly label: string; readonly sortKey: SortKey; readonly sort: Sort; readonly onSortChange: (sort: Sort) => void; readonly align?: 'left' | 'right' }): ReactElement {
  const active = sort.key === sortKey
  const Icon = !active ? IconArrowsSort : sort.direction === 'asc' ? IconSortAscending : IconSortDescending
  return (
    <th scope="col" aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn(thBase, align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onSortChange({ key: sortKey, direction: active && sort.direction === 'asc' ? 'desc' : 'asc' })}
        className={cn('inline-flex cursor-pointer items-center gap-1 rounded-sm uppercase outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30', active && 'text-foreground', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        <Icon aria-hidden className={cn('size-3.5', !active && 'opacity-50')} />
      </button>
    </th>
  )
}

/** "in 5 days", "Due today", "12 days late" coloured by urgency. */
function DueHint({ invoice }: { readonly invoice: Invoice }): ReactElement | null {
  if (invoice.status === 'paid' || invoice.status === 'draft') return null
  const days = daysUntil(invoice.dueAt)
  if (days < 0) return <span className="text-xs font-semibold text-danger">{-days} days late</span>
  if (days === 0) return <span className="text-xs font-semibold text-warning">Due today</span>
  return <span className={cn('text-xs', days <= 7 ? 'font-semibold text-warning' : 'text-muted-foreground')}>in {days} days</span>
}

function RowActions({ invoice, onQuickView, onDelete, onRemind }: { readonly invoice: Invoice } & Pick<InvoiceTableProps, 'onQuickView' | 'onDelete' | 'onRemind'>): ReactElement {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${invoice.id}`} className="text-muted-foreground">
          <IconDots />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => navigate(`/invoices/${invoice.id}`)}>
          <IconEye /> View details
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onQuickView(invoice)}>
          <IconLayoutSidebarRightExpand /> Quick view
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`/invoices/${invoice.id}/edit`)}>
          <IconPencil /> Edit
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onRemind(invoice)} disabled={invoice.status === 'paid' || invoice.status === 'draft'}>
          <IconSend /> Send reminder
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate('/invoices/new')}>
          <IconCopy /> Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="danger" onSelect={() => onDelete(invoice)}>
          <IconTrash /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function InvoiceTable(props: InvoiceTableProps): ReactElement {
  const { rows, hidden, density, sort, onSortChange, selected, onSelectedChange } = props
  const show = (column: ColumnId): boolean => !hidden.has(column)
  const pad = density === 'compact' ? 'py-2' : 'py-3.5'
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const someSelected = rows.some((row) => selected.has(row.id))

  const toggleAll = (): void => {
    const next = new Set(selected)
    for (const row of rows) {
      if (allSelected) next.delete(row.id)
      else next.add(row.id)
    }
    onSelectedChange(next)
  }
  const toggleOne = (id: string): void => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectedChange(next)
  }

  return (
    <div className="scrollbar-thin relative max-h-[40rem] overflow-auto">
      <table className="w-full min-w-[60rem] border-separate border-spacing-0 text-sm">
        <thead>
          <tr>
            <th scope="col" className={cn(thBase, 'w-12 pl-5 pr-2 sm:pl-6')}>
              <Checkbox aria-label="Select all invoices on this page" checked={allSelected ? true : someSelected ? 'indeterminate' : false} onCheckedChange={toggleAll} />
            </th>
            <SortHeader label="Invoice" sortKey="id" sort={sort} onSortChange={onSortChange} />
            {show('customer') ? <SortHeader label="Customer" sortKey="customer" sort={sort} onSortChange={onSortChange} /> : null}
            {show('owner') ? (
              <th scope="col" className={thBase}>
                Owner
              </th>
            ) : null}
            {show('issued') ? (
              <th scope="col" className={thBase}>
                Issued
              </th>
            ) : null}
            {show('due') ? <SortHeader label="Due" sortKey="dueAt" sort={sort} onSortChange={onSortChange} /> : null}
            {show('amount') ? <SortHeader label="Amount" sortKey="amount" sort={sort} onSortChange={onSortChange} align="right" /> : null}
            {show('collected') ? (
              <th scope="col" className={thBase}>
                Collected
              </th>
            ) : null}
            {show('status') ? (
              <th scope="col" className={thBase}>
                Status
              </th>
            ) : null}
            <th scope="col" className={cn(thBase, 'w-14 pr-5 text-right sm:pr-6')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => {
            const isSelected = selected.has(invoice.id)
            const percent = Math.round((invoice.paid / invoice.amount) * 100)
            const td = cn('border-b border-border px-3 transition-colors', pad, isSelected ? 'bg-primary-soft/40' : 'group-hover:bg-muted/50')
            return (
              <tr key={invoice.id} className="group" aria-selected={isSelected}>
                <td className={cn(td, 'pl-5 pr-2 sm:pl-6')}>
                  <Checkbox aria-label={`Select ${invoice.id}`} checked={isSelected} onCheckedChange={() => toggleOne(invoice.id)} />
                </td>
                <td className={td}>
                  <Link to={`/invoices/${invoice.id}`} className="font-semibold text-primary-soft-foreground hover:underline">
                    {invoice.id}
                  </Link>
                  <span className="block whitespace-nowrap text-xs text-muted-foreground">{invoice.items.length} {invoice.items.length === 1 ? 'item' : 'items'} · {invoice.method}</span>
                </td>
                {show('customer') ? (
                  <td className={cn(td, 'max-w-64')}>
                    <PersonCell name={invoice.customer.name} secondary={invoice.customer.email} tone={invoice.customer.tone} size={density === 'compact' ? 'sm' : 'md'} />
                  </td>
                ) : null}
                {show('owner') ? (
                  <td className={td}>
                    <span className="flex items-center gap-2 whitespace-nowrap">
                      <Avatar name={invoice.owner.name} tone={invoice.owner.tone} size="xs" />
                      {invoice.owner.name.split(' ')[0]}
                    </span>
                  </td>
                ) : null}
                {show('issued') ? <td className={cn(td, 'whitespace-nowrap text-muted-foreground')}>{formatDate(invoice.issuedAt)}</td> : null}
                {show('due') ? (
                  <td className={cn(td, 'whitespace-nowrap')}>
                    <span className="block text-foreground">{formatDate(invoice.dueAt)}</span>
                    <DueHint invoice={invoice} />
                  </td>
                ) : null}
                {show('amount') ? (
                  <td className={cn(td, 'whitespace-nowrap text-right')}>
                    <span className="block font-semibold text-foreground tabular">{formatMoney(invoice.amount)}</span>
                    {balanceOf(invoice) > 0 && invoice.paid > 0 ? <span className="text-xs text-muted-foreground tabular">{formatMoney(balanceOf(invoice))} due</span> : null}
                  </td>
                ) : null}
                {show('collected') ? (
                  <td className={td}>
                    <div className="flex w-28 items-center gap-2">
                      <Progress value={percent} tone={percent === 100 ? 'success' : percent > 0 ? 'warning' : 'neutral'} label={`${invoice.id}: ${percent}% collected`} />
                      <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular">{percent}%</span>
                    </div>
                  </td>
                ) : null}
                {show('status') ? (
                  <td className={td}>
                    <StatusBadge status={invoice.status} />
                  </td>
                ) : null}
                <td className={cn(td, 'pr-5 text-right sm:pr-6')}>
                  <RowActions invoice={invoice} onQuickView={props.onQuickView} onDelete={props.onDelete} onRemind={props.onRemind} />
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** The loading state: the same table frame with shimmering placeholder rows. */
export function InvoiceTableSkeleton({ rows = 8 }: { readonly rows?: number }): ReactElement {
  const cells: readonly ReactNode[] = [
    <Skeleton key="c" className="size-4.5 rounded-[0.3rem]" />,
    <div key="i" className="flex flex-col gap-1.5">
      <Skeleton className="h-3.5 w-20" />
      <Skeleton className="h-3 w-28" />
    </div>,
    <div key="p" className="flex items-center gap-3">
      <Skeleton className="size-9.5 rounded-full" />
      <div className="flex flex-col gap-1.5">
        <Skeleton className="h-3.5 w-32" />
        <Skeleton className="h-3 w-40" />
      </div>
    </div>,
    <Skeleton key="d" className="h-3.5 w-24" />,
    <Skeleton key="a" className="ml-auto h-3.5 w-20" />,
    <Skeleton key="s" className="h-6 w-20 rounded-sm" />,
  ]
  return (
    <div role="status" aria-label="Loading invoices" className="overflow-hidden">
      <div className="flex h-11 items-center gap-6 border-b border-border bg-muted px-5 sm:px-6">
        <Skeleton className="h-3 w-full max-w-xl" />
      </div>
      {Array.from({ length: rows }, (_unused, index) => (
        <div key={index} className="grid grid-cols-[2rem_8rem_minmax(0,1fr)_7rem_7rem_6rem] items-center gap-4 border-b border-border px-5 py-4 sm:px-6" style={{ opacity: 1 - index * 0.08 }}>
          {cells}
        </div>
      ))}
      <span className="sr-only">Loading invoices…</span>
    </div>
  )
}
