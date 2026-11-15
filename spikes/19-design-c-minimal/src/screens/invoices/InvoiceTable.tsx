/**
 * The dense invoice table.
 *
 * - Sticky header inside its own scroll area (the table scrolls, the page chrome stays).
 * - Sortable headers (`aria-sort`), monospace right-aligned amounts, status dots, owner avatars.
 * - Selection with a tri-state "select page" checkbox.
 * - Keyboard: one row is in the Tab order (roving tabindex). `J`/`↓` and `K`/`↑` move, `Home`/`End`
 *   jump, `Enter` opens, `X` selects, `Space` peeks in the side drawer.
 * - Row actions appear on hover/focus on pointer devices and are always visible on touch.
 */
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, Download, Ellipsis, Eye, Mail, Pencil, Trash2 } from 'lucide-react'
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { CustomerCell, DueLabel, InvoiceStatusBadge, Money } from '../../components/invoice-bits.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Checkbox } from '../../components/ui/controls.tsx'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuShortcut } from '../../components/ui/menu.tsx'
import type { Invoice, Sort, SortKey } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { formatDate } from '../../lib/format.ts'
import { Link, useRouter } from '../../lib/router.tsx'
import { type ColumnId, type Density, ROW_HEIGHT } from './view-prefs.ts'

export interface RowActions {
  peek: (invoice: Invoice) => void
  remove: (invoices: readonly Invoice[]) => void
  duplicate: (invoice: Invoice) => void
  remind: (invoices: readonly Invoice[]) => void
}

interface InvoiceTableProps {
  rows: readonly Invoice[]
  columns: readonly ColumnId[]
  density: Density
  sort: Sort
  onSort: (key: SortKey) => void
  selected: ReadonlySet<string>
  onSelect: (ids: readonly string[], selected: boolean) => void
  actions: RowActions
}

interface ColumnSpec {
  id: ColumnId
  label: string
  sortKey?: SortKey
  align?: 'right'
  /** Tailwind width + responsive visibility. */
  className: string
  cell: (invoice: Invoice, density: Density) => ReactNode
}

const SPECS: readonly ColumnSpec[] = [
  { id: 'customer', label: 'Customer', sortKey: 'customer', className: 'min-w-52', cell: (invoice, density) => <CustomerCell invoice={invoice} withContact={density === 'comfortable'} /> },
  { id: 'status', label: 'Status', sortKey: 'status', className: 'w-28', cell: (invoice) => <InvoiceStatusBadge status={invoice.status} /> },
  { id: 'issuedAt', label: 'Issued', sortKey: 'issuedAt', className: 'w-32 max-md:hidden', cell: (invoice) => <span className="whitespace-nowrap text-fg-muted">{formatDate(invoice.issuedAt)}</span> },
  { id: 'dueAt', label: 'Due', sortKey: 'dueAt', className: 'w-36', cell: (invoice) => <DueLabel invoice={invoice} /> },
  {
    id: 'owner',
    label: 'Owner',
    className: 'w-40 max-lg:hidden',
    cell: (invoice) => (
      <span className="flex items-center gap-2 whitespace-nowrap text-fg-muted">
        <Avatar name={invoice.owner.name} tint={invoice.owner.tint} size="xs" />
        {invoice.owner.name.split(' ')[0]}
      </span>
    ),
  },
  {
    id: 'tags',
    label: 'Tags',
    className: 'w-44 max-lg:hidden',
    cell: (invoice) => (
      <span className="flex gap-1">
        {invoice.tags.map((tag) => (
          <Badge key={tag}>{tag}</Badge>
        ))}
      </span>
    ),
  },
  { id: 'amount', label: 'Amount', sortKey: 'amount', align: 'right', className: 'w-36', cell: (invoice) => <Money invoice={invoice} /> },
]

function SortHeader({ spec, sort, onSort }: { spec: ColumnSpec; sort: Sort; onSort: (key: SortKey) => void }) {
  const key = spec.sortKey
  if (key === undefined) return <span>{spec.label}</span>
  const active = sort.key === key
  const Icon = !active ? ChevronsUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={() => onSort(key)}
      className={cn(
        'group/sort -mx-1.5 inline-flex h-7 cursor-pointer items-center gap-1 rounded-sm px-1.5 hover:bg-muted hover:text-fg',
        spec.align === 'right' && 'flex-row-reverse',
        active && 'text-fg',
      )}
    >
      {spec.label}
      <Icon aria-hidden className={cn('size-3', !active && 'opacity-0 group-hover/sort:opacity-100 group-focus-visible/sort:opacity-100')} />
    </button>
  )
}

function RowMenu({ invoice, actions }: { invoice: Invoice; actions: RowActions }) {
  const { navigate } = useRouter()
  return (
    <Menu.Root>
      <Menu.Trigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Actions for ${invoice.number}`}
          tabIndex={-1}
          className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-within:opacity-100 data-[state=open]:opacity-100"
        >
          <Ellipsis aria-hidden />
        </Button>
      </Menu.Trigger>
      <MenuContent align="end" className="w-52">
        <MenuItem onSelect={() => actions.peek(invoice)}>
          <Eye aria-hidden /> Peek <MenuShortcut>Space</MenuShortcut>
        </MenuItem>
        <MenuItem onSelect={() => navigate(`/invoices/${invoice.id}/edit`)}>
          <Pencil aria-hidden /> Edit
        </MenuItem>
        <MenuItem onSelect={() => actions.duplicate(invoice)}>
          <Copy aria-hidden /> Duplicate
        </MenuItem>
        <MenuItem onSelect={() => actions.remind([invoice])} disabled={invoice.status === 'paid' || invoice.status === 'void' || invoice.status === 'draft'}>
          <Mail aria-hidden /> Send reminder
        </MenuItem>
        <MenuItem>
          <Download aria-hidden /> Download PDF
        </MenuItem>
        <MenuSeparator />
        <MenuItem destructive onSelect={() => actions.remove([invoice])}>
          <Trash2 aria-hidden /> Delete
        </MenuItem>
      </MenuContent>
    </Menu.Root>
  )
}

export function InvoiceTable({ rows, columns, density, sort, onSort, selected, onSelect, actions }: InvoiceTableProps) {
  const { navigate } = useRouter()
  const [focusIndex, setFocusIndex] = useState(0)
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([])
  const visible = SPECS.filter((spec) => columns.includes(spec.id))
  const pageIds = rows.map((row) => row.id)
  const selectedOnPage = pageIds.filter((id) => selected.has(id)).length
  const headerState = selectedOnPage === 0 ? false : selectedOnPage === pageIds.length ? true : 'indeterminate'

  // A new page or sort resets the roving focus to the first row. Keyed by the row ids, not the
  // array: the list rebuilds the array on every render, which reset focus on every keystroke.
  const pageKey = pageIds.join(',')
  useEffect(() => setFocusIndex(0), [pageKey])

  const moveTo = (index: number) => {
    const next = Math.max(0, Math.min(rows.length - 1, index))
    setFocusIndex(next)
    rowRefs.current[next]?.focus()
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, invoice: Invoice, index: number) => {
    if (event.target !== event.currentTarget) return
    const key = event.key
    if (key === 'ArrowDown' || key === 'j') moveTo(index + 1)
    else if (key === 'ArrowUp' || key === 'k') moveTo(index - 1)
    else if (key === 'Home') moveTo(0)
    else if (key === 'End') moveTo(rows.length - 1)
    else if (key === 'Enter') navigate(`/invoices/${invoice.id}`)
    else if (key === 'x') onSelect([invoice.id], !selected.has(invoice.id))
    else if (key === ' ') actions.peek(invoice)
    else return
    event.preventDefault()
  }

  const onRowClick = (event: MouseEvent<HTMLTableRowElement>, invoice: Invoice, index: number) => {
    setFocusIndex(index)
    // Clicks on links, buttons and checkboxes do their own thing.
    if ((event.target as HTMLElement).closest('a, button, [role="checkbox"], [role="menuitem"]') !== null) return
    navigate(`/invoices/${invoice.id}`)
  }

  const height = ROW_HEIGHT[density]

  return (
    <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm">
      <caption className="sr-only">Invoices. Use J and K or the arrow keys to move between rows, Enter to open, X to select.</caption>
      <thead>
        <tr className="h-9 text-left text-xs font-medium text-fg-muted">
          <th scope="col" className="sticky top-0 z-10 w-10 border-b border-border bg-subtle pl-4 pr-2">
            <Checkbox aria-label="Select all invoices on this page" checked={headerState} onCheckedChange={(value) => onSelect(pageIds, value === true)} />
          </th>
          <th scope="col" aria-sort={sort.key === 'number' ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined} className="sticky top-0 z-10 w-32 border-b border-border bg-subtle px-3 font-medium">
            <SortHeader spec={{ id: 'customer', label: 'Invoice', sortKey: 'number', className: '', cell: () => null }} sort={sort} onSort={onSort} />
          </th>
          {visible.map((spec) => (
            <th
              key={spec.id}
              scope="col"
              aria-sort={spec.sortKey !== undefined && sort.key === spec.sortKey ? (sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
              className={cn('sticky top-0 z-10 border-b border-border bg-subtle px-3 font-medium', spec.align === 'right' && 'text-right', spec.className)}
            >
              <SortHeader spec={spec} sort={sort} onSort={onSort} />
            </th>
          ))}
          <th scope="col" className="sticky top-0 z-10 w-12 border-b border-border bg-subtle pr-3">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((invoice, index) => {
          const isSelected = selected.has(invoice.id)
          return (
            <tr
              key={invoice.id}
              ref={(element) => {
                rowRefs.current[index] = element
              }}
              tabIndex={index === focusIndex ? 0 : -1}
              aria-label={`${invoice.number}, ${invoice.customer.name}`}
              onKeyDown={(event) => onRowKeyDown(event, invoice, index)}
              onClick={(event) => onRowClick(event, invoice, index)}
              onFocus={() => setFocusIndex(index)}
              className={cn(
                'group cursor-pointer outline-none transition-colors duration-75 [&>td]:border-b [&>td]:border-border',
                height,
                isSelected ? 'bg-accent-subtle/60 hover:bg-accent-subtle' : 'hover:bg-subtle/70',
                'focus-visible:bg-subtle focus-visible:[&>td:first-child]:shadow-[inset_2px_0_0_var(--accent)]',
              )}
            >
              <td className="pl-4 pr-2">
                <Checkbox aria-label={`Select ${invoice.number}`} checked={isSelected} tabIndex={-1} onCheckedChange={(value) => onSelect([invoice.id], value === true)} />
              </td>
              <td className="px-3">
                <Link to={`/invoices/${invoice.id}`} tabIndex={-1} className="num whitespace-nowrap font-medium text-fg hover:underline">
                  {invoice.number}
                </Link>
              </td>
              {visible.map((spec) => (
                <td key={spec.id} className={cn('px-3', spec.align === 'right' && 'text-right', spec.className)}>
                  {spec.cell(invoice, density)}
                </td>
              ))}
              <td className="pr-3 text-right">
                <RowMenu invoice={invoice} actions={actions} />
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/** Skeleton rows that mirror the real column widths, so nothing jumps when data arrives. */
export function InvoiceTableSkeleton({ rows = 10 }: { rows?: number }) {
  const widths = ['w-16', 'w-40', 'w-16', 'w-20', 'w-24', 'w-20']
  return (
    <table className="w-full min-w-[720px] border-separate border-spacing-0 text-sm" aria-hidden>
      <thead>
        <tr className="h-9">
          {['', ...widths].map((_, index) => (
            <th key={index} className="sticky top-0 border-b border-border bg-subtle px-3 first:pl-4" />
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: rows }, (_, row) => (
          <tr key={row} className="h-row-default [&>td]:border-b [&>td]:border-border">
            <td className="w-10 pl-4 pr-2">
              <span className="block size-4 animate-shimmer rounded-xs bg-muted" />
            </td>
            {widths.map((width, column) => (
              <td key={column} className="px-3">
                <span className={cn('block h-3 animate-shimmer rounded-sm bg-muted', width, column === widths.length - 1 && 'ml-auto')} style={{ animationDelay: `${row * 60}ms` }} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
