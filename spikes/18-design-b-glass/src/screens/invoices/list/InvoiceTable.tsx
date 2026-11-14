/**
 * The invoices data table: selection, sortable headers (`aria-sort`), a sticky header inside its
 * own scroll area, avatar cells, status badges, collected progress, right-aligned amounts and a
 * row actions menu. Also the loading skeleton with the same geometry, so nothing jumps.
 */
import {
  IconArrowsSort,
  IconCopy,
  IconDots,
  IconEye,
  IconLayoutSidebarRight,
  IconPencil,
  IconSend,
  IconSortAscending,
  IconSortDescending,
  IconTrash,
} from '@tabler/icons-react'
import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router'
import { StatusBadge } from '../../../components/data-display.tsx'
import { Avatar } from '../../../components/ui/avatar.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { DropdownMenu, MenuContent, MenuItem, MenuSeparator } from '../../../components/ui/menu.tsx'
import { Progress, Skeleton } from '../../../components/ui/misc.tsx'
import { Checkbox } from '../../../components/ui/toggles.tsx'
import type { Invoice } from '../../../data/invoices.ts'
import { cn } from '../../../lib/cn.ts'
import { formatDate, formatMoney } from '../../../lib/format.ts'
import { collectedRatio, dueLabel, type ListQuery, type SortKey } from './list-state.ts'
import type { ColumnId, Density } from './ListToolbar.tsx'

export interface RowHandlers {
  readonly onQuickView: (invoice: Invoice) => void
  readonly onDelete: (invoices: readonly Invoice[]) => void
  readonly onRemind: (invoices: readonly Invoice[]) => void
  readonly onDuplicate: (invoice: Invoice) => void
}

export interface InvoiceTableProps extends RowHandlers {
  readonly rows: readonly Invoice[]
  readonly columns: ReadonlySet<ColumnId>
  readonly density: Density
  readonly sort: ListQuery['sort']
  readonly onSort: (key: SortKey) => void
  readonly selected: ReadonlySet<string>
  readonly onToggleRow: (id: string) => void
  readonly onToggleAll: (select: boolean) => void
}

const HEAD = 'sticky top-0 z-(--z-sticky) bg-surface-muted px-3 py-0 text-left text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase backdrop-blur-none'

export function InvoiceTable({ rows, columns, density, sort, onSort, selected, onToggleRow, onToggleAll, ...handlers }: InvoiceTableProps) {
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id))
  const someSelected = rows.some((row) => selected.has(row.id))
  const cell = density === 'compact' ? 'py-2' : 'py-3.5'
  const show = (column: ColumnId): boolean => columns.has(column)

  return (
    <div className="scroll-thin max-h-[min(42rem,calc(100dvh-14rem))] overflow-auto border-t border-border">
      <table className="w-full min-w-[52rem] border-separate border-spacing-0 text-base">
        <caption className="sr-only">Invoices. Column headers with buttons can be sorted.</caption>
        <thead>
          <tr className="h-11">
            <th scope="col" className={cn(HEAD, 'w-12 pr-0 pl-5')}>
              <Checkbox
                checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                onCheckedChange={() => onToggleAll(!allSelected)}
                aria-label={allSelected ? 'Deselect all rows on this page' : 'Select all rows on this page'}
              />
            </th>
            <SortHeader label="Invoice" sortKey="number" sort={sort} onSort={onSort} />
            {show('customer') && <SortHeader label="Customer" sortKey="customer" sort={sort} onSort={onSort} />}
            {show('owner') && (
              <th scope="col" className={HEAD}>
                Owner
              </th>
            )}
            {show('issuedAt') && <SortHeader label="Issued" sortKey="issuedAt" sort={sort} onSort={onSort} />}
            {show('dueAt') && <SortHeader label="Due" sortKey="dueAt" sort={sort} onSort={onSort} />}
            {show('status') && <SortHeader label="Status" sortKey="status" sort={sort} onSort={onSort} />}
            {show('collected') && (
              <th scope="col" className={cn(HEAD, 'w-32')}>
                Collected
              </th>
            )}
            {show('total') && <SortHeader label="Amount" sortKey="total" sort={sort} onSort={onSort} align="right" />}
            <th scope="col" className={cn(HEAD, 'w-14 pr-5')}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((invoice) => {
            const isSelected = selected.has(invoice.id)
            const due = dueLabel(invoice)
            const ratio = collectedRatio(invoice)
            return (
              <tr key={invoice.id} className={cn('group transition-fast', isSelected ? 'bg-surface-selected' : 'hover:bg-surface-hover')}>
                <Td className={cn(cell, 'pr-0 pl-5')}>
                  <Checkbox checked={isSelected} onCheckedChange={() => onToggleRow(invoice.id)} aria-label={`Select ${invoice.number}`} />
                </Td>
                <Td className={cell}>
                  <Link to={`/invoices/${invoice.id}`} className="font-mono text-sm font-semibold whitespace-nowrap text-primary-text hover:underline">
                    {invoice.number}
                  </Link>
                  {invoice.tags.length > 0 && density === 'comfortable' && <p className="mt-0.5 truncate text-xs text-fg-muted">{invoice.tags.join(' · ')}</p>}
                </Td>
                {show('customer') && (
                  <Td className={cell}>
                    <div className="flex items-center gap-3">
                      <Avatar name={invoice.customer.name} shape="square" size={density === 'compact' ? 'xs' : 'sm'} />
                      <div className="min-w-0">
                        <p className="max-w-56 truncate font-semibold text-fg">{invoice.customer.name}</p>
                        {density === 'comfortable' && <p className="max-w-56 truncate text-xs text-fg-muted">{invoice.customer.email}</p>}
                      </div>
                    </div>
                  </Td>
                )}
                {show('owner') && (
                  <Td className={cell}>
                    <span className="flex items-center gap-2">
                      <Avatar name={invoice.owner.name} size="xs" />
                      <span className="sr-only truncate text-sm text-fg 2xl:not-sr-only">{invoice.owner.name.split(' ')[0]}</span>
                    </span>
                  </Td>
                )}
                {show('issuedAt') && <Td className={cn(cell, 'whitespace-nowrap text-fg-muted')}>{formatDate(invoice.issuedAt)}</Td>}
                {show('dueAt') && (
                  <Td className={cn(cell, 'whitespace-nowrap')}>
                    <p className="text-fg">{formatDate(invoice.dueAt)}</p>
                    {density === 'comfortable' && <p className={cn('text-xs', due.late ? 'font-semibold text-danger' : 'text-fg-muted')}>{due.text}</p>}
                  </Td>
                )}
                {show('status') && (
                  <Td className={cell}>
                    <StatusBadge status={invoice.status} />
                  </Td>
                )}
                {show('collected') && (
                  <Td className={cell}>
                    <div className="flex items-center gap-2.5">
                      <Progress value={ratio * 100} tone={ratio === 1 ? 'success' : 'primary'} label={`${Math.round(ratio * 100)}% collected`} className="w-16" />
                      <span className="w-9 text-right text-xs font-semibold text-fg-muted tabular">{Math.round(ratio * 100)}%</span>
                    </div>
                  </Td>
                )}
                {show('total') && <Td className={cn(cell, 'text-right font-semibold whitespace-nowrap text-fg tabular')}>{formatMoney(invoice.total)}</Td>}
                <Td className={cn(cell, 'pr-5 text-right')}>
                  <RowActions invoice={invoice} {...handlers} />
                </Td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Td({ className, children }: { className?: string; children: ReactNode }) {
  return <td className={cn('border-b border-border px-3 align-middle', className)}>{children}</td>
}

function SortHeader({ label, sortKey, sort, onSort, align = 'left' }: { label: string; sortKey: SortKey; sort: ListQuery['sort']; onSort: (key: SortKey) => void; align?: 'left' | 'right' }) {
  const active = sort.key === sortKey
  const Icon = !active ? IconArrowsSort : sort.dir === 'asc' ? IconSortAscending : IconSortDescending
  return (
    <th scope="col" aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'} className={cn(HEAD, align === 'right' && 'text-right')}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn('-mx-1.5 inline-flex h-7 items-center gap-1.5 rounded-xs px-1.5 uppercase hover:text-fg', active && 'text-fg', align === 'right' && 'flex-row-reverse')}
      >
        {label}
        <Icon className={cn('size-3.5', !active && 'opacity-60')} aria-hidden />
      </button>
    </th>
  )
}

export function RowActions({ invoice, onQuickView, onDelete, onRemind, onDuplicate }: RowHandlers & { invoice: Invoice }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${invoice.number}`}>
          <IconDots aria-hidden />
        </Button>
      </DropdownMenu.Trigger>
      <MenuContent align="end">
        <MenuItem icon={<IconLayoutSidebarRight />} onSelect={() => onQuickView(invoice)}>
          Quick view
        </MenuItem>
        <MenuItem icon={<IconEye />} onSelect={() => void navigate(`/invoices/${invoice.id}`)}>
          Open
        </MenuItem>
        <MenuItem icon={<IconPencil />} onSelect={() => void navigate(`/invoices/${invoice.id}/edit`)}>
          Edit
        </MenuItem>
        <MenuItem icon={<IconCopy />} onSelect={() => onDuplicate(invoice)}>
          Duplicate
        </MenuItem>
        <MenuItem icon={<IconSend />} disabled={invoice.status === 'paid' || invoice.status === 'void'} onSelect={() => onRemind([invoice])}>
          Send reminder
        </MenuItem>
        <MenuSeparator />
        <MenuItem icon={<IconTrash />} destructive onSelect={() => onDelete([invoice])}>
          Delete
        </MenuItem>
      </MenuContent>
    </DropdownMenu.Root>
  )
}

/** Skeleton rows with the table's exact geometry (shown while loading). */
export function InvoiceTableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="border-t border-border" aria-busy="true" aria-label="Loading invoices">
      <div className="flex h-11 items-center gap-6 bg-surface-muted px-5">
        {['w-12', 'w-28', 'w-24', 'w-16', 'w-16', 'w-14'].map((width, index) => (
          <Skeleton key={index} className={cn('h-2.5', width)} />
        ))}
      </div>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-4 border-b border-border px-5 py-3.5">
          <Skeleton className="size-4.5 rounded-xs" />
          <Skeleton className="h-3 w-28" />
          <Skeleton className="size-8 rounded-md" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-2.5 w-28" />
          </div>
          <Skeleton className="hidden h-3 w-20 md:block" />
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  )
}
