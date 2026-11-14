/**
 * Board view: invoices as cards in status columns (Draft → Open → Overdue → Paid).
 *
 * Move a card by dragging it, or from the keyboard: focus a card and press Alt + ← / → to move it
 * one column, with a spoken confirmation. Enter or click opens the side drawer. Columns show the
 * count and total so the board doubles as a pipeline summary.
 */
import { GripVertical, Plus } from 'lucide-react'
import { type DragEvent, type KeyboardEvent, useMemo, useState } from 'react'
import { DueLabel, STATUS_TONE } from '../../components/invoice-bits.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { StatusDot } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { type Invoice, type InvoiceStatus, invoices, STATUS_LABELS } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { formatMoney } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'
import { useOverlays } from '../../shell/overlays.tsx'
import { InvoicesHeader, ViewSwitch } from '../invoices/InvoicesHeader.tsx'

const COLUMNS: readonly InvoiceStatus[] = ['draft', 'open', 'overdue', 'paid']
const PER_COLUMN = 8

/** Only recent invoices belong on a working board; older paid ones would bury the live work. */
const BOARD_SOURCE = invoices.filter((invoice) => invoice.status !== 'void').slice(0, 90)

function Card({ invoice, onOpen, onMove, onDragStart }: { invoice: Invoice; onOpen: () => void; onMove: (direction: -1 | 1) => void; onDragStart: (event: DragEvent<HTMLButtonElement>) => void }) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!event.altKey) return
    if (event.key === 'ArrowRight') onMove(1)
    else if (event.key === 'ArrowLeft') onMove(-1)
    else return
    event.preventDefault()
  }
  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      onKeyDown={onKeyDown}
      aria-label={`${invoice.number}, ${invoice.customer.name}, ${formatMoney(invoice.amount, invoice.currency)}. Alt plus arrow keys to move.`}
      className="group w-full cursor-pointer rounded-lg border border-border bg-surface p-3 text-left shadow-xs transition-[border-color,box-shadow] duration-150 hover:border-border-strong hover:shadow-sm active:cursor-grabbing"
    >
      <div className="flex items-center gap-2">
        <span className="num text-xs text-fg-subtle">{invoice.number}</span>
        <GripVertical aria-hidden className="ml-auto size-3.5 text-fg-subtle opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <div className="mt-2 flex items-center gap-2">
        <Avatar name={invoice.customer.name} tint={invoice.customer.tint} shape="square" size="xs" />
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-fg">{invoice.customer.name}</span>
      </div>
      <p className="figure mt-2 text-base font-semibold text-fg">{formatMoney(invoice.amount, invoice.currency)}</p>
      <div className="mt-3 flex items-center gap-2 border-t border-border pt-2.5">
        <DueLabel invoice={invoice} className="text-xs" />
        {invoice.tags[0] !== undefined && <span className="truncate rounded-xs bg-subtle px-1 text-2xs font-medium text-fg-muted">{invoice.tags[0]}</span>}
        <Avatar name={invoice.owner.name} tint={invoice.owner.tint} size="xs" className="ml-auto" />
      </div>
    </button>
  )
}

export function BoardView() {
  const { peek } = useOverlays()
  const toast = useToast()
  const [moved, setMoved] = useState<ReadonlyMap<string, InvoiceStatus>>(new Map())
  const [over, setOver] = useState<InvoiceStatus | null>(null)
  const [announcement, setAnnouncement] = useState('')
  const [expanded, setExpanded] = useState<ReadonlySet<InvoiceStatus>>(new Set())

  const rows = useMemo(() => BOARD_SOURCE.map((invoice) => ({ ...invoice, status: moved.get(invoice.id) ?? invoice.status })), [moved])

  const move = (invoice: Invoice, to: InvoiceStatus) => {
    if (invoice.status === to) return
    setMoved((current) => new Map(current).set(invoice.id, to))
    setAnnouncement(`${invoice.number} moved to ${STATUS_LABELS[to]}.`)
    toast({ title: `Moved to ${STATUS_LABELS[to]}`, description: `${invoice.number} · ${invoice.customer.name}`, action: { label: 'Undo', onClick: () => setMoved((current) => new Map(current).set(invoice.id, invoice.status)) } })
  }

  const onDrop = (event: DragEvent<HTMLElement>, status: InvoiceStatus) => {
    event.preventDefault()
    setOver(null)
    const invoice = rows.find((row) => row.id === event.dataTransfer.getData('text/plain'))
    if (invoice !== undefined) move(invoice, status)
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:h-full lg:px-8 lg:py-6">
      <InvoicesHeader count={rows.length} />
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-fg-muted">
          Grouped by <span className="font-medium text-fg">status</span> · last 90 invoices
        </p>
        <div className="ml-auto">
          <ViewSwitch value="board" />
        </div>
      </div>
      <p className="sr-only" aria-live="assertive">
        {announcement}
      </p>
      <div className="relative scroll-quiet -mx-4 flex min-h-0 flex-1 gap-3 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {COLUMNS.map((status) => {
          const cards = rows.filter((row) => row.status === status)
          const total = cards.reduce((sum, card) => sum + card.amount, 0)
          const shown = expanded.has(status) ? cards : cards.slice(0, PER_COLUMN)
          return (
            <section
              key={status}
              aria-label={`${STATUS_LABELS[status]}, ${cards.length} invoices`}
              onDragOver={(event) => {
                event.preventDefault()
                setOver(status)
              }}
              onDragLeave={() => setOver((current) => (current === status ? null : current))}
              onDrop={(event) => onDrop(event, status)}
              className={cn(
                'flex w-72 shrink-0 flex-col rounded-xl border border-border bg-subtle/70 transition-colors duration-150 lg:min-h-0',
                over === status && 'border-accent bg-accent-subtle/60',
              )}
            >
              <header className="flex h-11 shrink-0 items-center gap-2 px-3">
                <StatusDot tone={STATUS_TONE[status]} />
                <h2 className="text-sm font-semibold text-fg">{STATUS_LABELS[status]}</h2>
                <span className="num text-xs text-fg-subtle">{cards.length}</span>
                <span className="num ml-auto text-xs text-fg-muted">{formatMoney(total, 'EUR', true)}</span>
              </header>
              <ul className="scroll-quiet flex min-h-24 flex-col gap-2 overflow-y-auto px-2 pb-2">
                {shown.map((card) => (
                  <li key={card.id}>
                    <Card
                      invoice={card}
                      onOpen={() => peek(card)}
                      onDragStart={(event) => {
                        event.dataTransfer.setData('text/plain', card.id)
                        event.dataTransfer.effectAllowed = 'move'
                      }}
                      onMove={(direction) => {
                        const next = COLUMNS[COLUMNS.indexOf(status) + direction]
                        if (next !== undefined) move(card, next)
                      }}
                    />
                  </li>
                ))}
                {cards.length > PER_COLUMN && !expanded.has(status) && (
                  <li>
                    <Button variant="ghost" size="sm" className="w-full" onClick={() => setExpanded((current) => new Set(current).add(status))}>
                      Show {cards.length - PER_COLUMN} more
                    </Button>
                  </li>
                )}
                {status === 'draft' && (
                  <li>
                    <Button asChild variant="ghost" size="sm" className="w-full justify-start text-fg-subtle">
                      <Link to="/invoices/new">
                        <Plus aria-hidden /> New draft
                      </Link>
                    </Button>
                  </li>
                )}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
