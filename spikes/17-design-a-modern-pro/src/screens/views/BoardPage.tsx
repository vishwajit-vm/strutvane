/**
 * Kanban board view of invoices (resource-views package): one column per status with count and
 * total, cards with customer, amount, due hint and owner. Cards move by drag and drop, or from
 * the keyboard through each card's "Move to" menu (drag and drop alone is not accessible).
 */
import { IconArrowsMove, IconCalendarDue, IconDots, IconPlus } from '@tabler/icons-react'
import { useState, type DragEvent, type ReactElement } from 'react'
import { STATUS_META } from '../../components/data-display.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../../components/ui/menu.tsx'
import { Avatar } from '../../components/ui/misc.tsx'
import { TONE_FILL } from '../../components/ui/tone.ts'
import { toast } from '../../components/ui/toast.tsx'
import { invoices, type Invoice, type InvoiceStatus } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { daysUntil, formatCompactMoney, formatDayMonth, formatMoney } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'
import { ViewSwitch } from '../invoices/ViewSwitch.tsx'

const COLUMNS: readonly InvoiceStatus[] = ['draft', 'pending', 'partial', 'overdue', 'paid']
const PER_COLUMN = 6

function BoardCard({ invoice, onMove }: { readonly invoice: Invoice; readonly onMove: (status: InvoiceStatus) => void }): ReactElement {
  const days = daysUntil(invoice.dueAt)
  const late = invoice.status === 'overdue'
  return (
    <article
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', invoice.id)}
      aria-label={`${invoice.id}, ${invoice.customer.name}, ${formatMoney(invoice.amount)}`}
      className="group cursor-grab rounded-lg border border-border/70 bg-card p-3.5 shadow-xs transition-[box-shadow,transform] duration-150 hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing dark:border-border"
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`/invoices/${invoice.id}`} className="text-label font-semibold text-primary-soft-foreground hover:underline">
          {invoice.id}
        </Link>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={`Move ${invoice.id}`} className="-mr-1.5 -mt-1.5 size-7 text-muted-foreground">
              <IconDots />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>Move to</DropdownMenuLabel>
            {COLUMNS.filter((status) => status !== invoice.status).map((status) => (
              <DropdownMenuItem key={status} onSelect={() => onMove(status)}>
                <IconArrowsMove /> {STATUS_META[status].label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <p className="mt-1 truncate text-sm font-semibold text-foreground">{invoice.customer.name}</p>
      <p className="text-lg font-bold tracking-tight text-foreground tabular">{formatMoney(invoice.amount)}</p>
      {invoice.tags.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {invoice.tags.map((tag) => (
            <span key={tag} className="rounded-sm bg-secondary px-1.5 py-0.5 text-overline font-semibold tracking-normal text-secondary-foreground">
              {tag}
            </span>
          ))}
        </div>
      ) : null}
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className={cn('inline-flex items-center gap-1 text-xs', late ? 'font-semibold text-danger' : 'text-muted-foreground')}>
          <IconCalendarDue aria-hidden className="size-4" />
          {late ? `${-days}d late` : formatDayMonth(invoice.dueAt)}
        </span>
        <Avatar name={invoice.owner.name} tone={invoice.owner.tone} size="xs" />
      </div>
    </article>
  )
}

export function BoardPage(): ReactElement {
  const [statusOf, setStatusOf] = useState<ReadonlyMap<string, InvoiceStatus>>(new Map())
  const [over, setOver] = useState<InvoiceStatus | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<InvoiceStatus>>(new Set())
  const current = invoices.map((invoice) => ({ ...invoice, status: statusOf.get(invoice.id) ?? invoice.status }))

  const move = (id: string, status: InvoiceStatus): void => {
    setStatusOf(new Map(statusOf).set(id, status))
    toast({ tone: 'success', title: `${id} moved`, description: `Now in “${STATUS_META[status].label}”.` })
  }
  const onDrop = (event: DragEvent<HTMLElement>, status: InvoiceStatus): void => {
    event.preventDefault()
    setOver(null)
    const id = event.dataTransfer.getData('text/plain')
    if (id !== '' && current.find((invoice) => invoice.id === id)?.status !== status) move(id, status)
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing' }, { label: 'Invoices', to: '/invoices' }, { label: 'Board' }]}
        back="/invoices"
        title="Invoice board"
        count={invoices.length}
        actions={
          <>
            <ViewSwitch current="board" />
            <Button asChild variant="primary">
              <Link to="/invoices/new">
                <IconPlus /> New invoice
              </Link>
            </Button>
          </>
        }
      />
      <div className="scrollbar-thin relative -mx-4 flex gap-3 overflow-x-auto px-4 pb-4 sm:-mx-6 sm:px-6 lg:mx-0 lg:px-0">
        {COLUMNS.map((status) => {
          const cards = current.filter((invoice) => invoice.status === status)
          const shown = expanded.has(status) ? cards : cards.slice(0, PER_COLUMN)
          const meta = STATUS_META[status]
          return (
            <section
              key={status}
              aria-label={`${meta.label}: ${cards.length} invoices`}
              onDragOver={(event) => {
                event.preventDefault()
                setOver(status)
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(event) => onDrop(event, status)}
              className={cn('flex w-[16.5rem] shrink-0 flex-col gap-3 rounded-xl bg-muted/80 p-3 transition-colors lg:w-auto lg:min-w-[13rem] lg:flex-1', over === status && 'bg-primary-soft ring-2 ring-primary/40')}
            >
              <header className="flex items-center gap-2 px-1 pt-1">
                <span aria-hidden className={cn('size-2.5 rounded-full', TONE_FILL[meta.tone])} />
                <h2 className="text-sm font-semibold">{meta.label}</h2>
                <span className="rounded-full bg-card px-2 py-0.5 text-xs font-bold text-muted-foreground shadow-xs tabular">{cards.length}</span>
                <span className="ml-auto text-xs font-semibold text-muted-foreground tabular">{formatCompactMoney(cards.reduce((sum, invoice) => sum + invoice.amount, 0))}</span>
              </header>
              <div className={cn('h-1 rounded-full', TONE_FILL[meta.tone])} />
              {shown.map((invoice) => (
                <BoardCard key={invoice.id} invoice={invoice} onMove={(next) => move(invoice.id, next)} />
              ))}
              {cards.length > PER_COLUMN && !expanded.has(status) ? (
                <Button variant="ghost" size="sm" onClick={() => setExpanded(new Set(expanded).add(status))}>
                  Show {cards.length - PER_COLUMN} more
                </Button>
              ) : null}
              {cards.length === 0 ? <p className="rounded-lg border-2 border-dashed border-border px-3 py-8 text-center text-label text-muted-foreground">Drop invoices here</p> : null}
            </section>
          )
        })}
      </div>
    </>
  )
}
