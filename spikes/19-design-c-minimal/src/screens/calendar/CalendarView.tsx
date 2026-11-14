/**
 * Calendar view: invoices on their due date. A month grid on wide screens, an agenda list on
 * phones (a 7-column grid is unreadable at 375 px). Today is marked with an accent disc; each day
 * shows up to three invoices and a "+N more" that opens the busiest days in the drawer one by one.
 */
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { STATUS_TONE } from '../../components/invoice-bits.tsx'
import { StatusDot } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Popover, PopoverContent } from '../../components/ui/menu.tsx'
import { type Invoice, invoices } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { formatMoney, NOW } from '../../lib/format.ts'
import { useOverlays } from '../../shell/overlays.tsx'
import { InvoicesHeader, ViewSwitch } from '../invoices/InvoicesHeader.tsx'
import { monthGrid, monthTitle, shiftMonth } from './month.ts'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const TODAY = NOW.toISOString().slice(0, 10)
const MAX_PER_DAY = 3

function byDueDate(): Map<string, Invoice[]> {
  const map = new Map<string, Invoice[]>()
  for (const invoice of invoices) {
    if (invoice.status === 'void') continue
    const key = invoice.dueAt.slice(0, 10)
    map.set(key, [...(map.get(key) ?? []), invoice])
  }
  return map
}

/** One invoice chip: status dot, number, compact amount. */
function EventChip({ invoice, onOpen }: { invoice: Invoice; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        'flex h-6 w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-sm border border-border bg-surface px-1.5 text-left text-xs shadow-xs hover:border-border-strong',
        invoice.status === 'paid' && 'text-fg-subtle',
      )}
    >
      <StatusDot tone={STATUS_TONE[invoice.status]} />
      <span className={cn('num min-w-0 flex-1 truncate', invoice.status === 'paid' ? 'line-through decoration-fg-subtle/60' : 'text-fg')}>{invoice.number.replace('INV-', '')}</span>
      <span className="num shrink-0 text-fg-muted">{formatMoney(invoice.amount, invoice.currency, true)}</span>
      <span className="sr-only">, {invoice.customer.name}, {invoice.status}</span>
    </button>
  )
}

export function CalendarView() {
  const { peek } = useOverlays()
  const [{ year, month }, setMonth] = useState({ year: 2026, month: 10 })
  const due = useMemo(byDueDate, [])
  const cells = monthGrid(year, month)
  const inMonth = cells.filter((cell) => cell.inMonth)
  const monthCount = inMonth.reduce((sum, cell) => sum + (due.get(cell.date)?.length ?? 0), 0)

  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:h-full lg:px-8 lg:py-6">
      <InvoicesHeader count={invoices.length} />
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-base font-semibold text-fg" aria-live="polite">
          {monthTitle(year, month)}
        </h2>
        <span className="num text-sm text-fg-subtle">{monthCount} due</span>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1">
            <Button size="icon-sm" aria-label="Previous month" onClick={() => setMonth(shiftMonth(year, month, -1))}>
              <ChevronLeft aria-hidden />
            </Button>
            <Button size="sm" onClick={() => setMonth({ year: 2026, month: 10 })}>
              Today
            </Button>
            <Button size="icon-sm" aria-label="Next month" onClick={() => setMonth(shiftMonth(year, month, 1))}>
              <ChevronRight aria-hidden />
            </Button>
          </div>
          <ViewSwitch value="calendar" />
        </div>
      </div>

      {/* Month grid (≥ 768 px). */}
      <div className="hidden min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border md:flex">
        <div className="grid grid-cols-7 border-b border-border bg-subtle/60" aria-hidden>
          {WEEKDAYS.map((day) => (
            <div key={day} className="px-2 py-2 text-xs font-medium text-fg-subtle">
              {day}
            </div>
          ))}
        </div>
        <ol className="scroll-quiet grid min-h-0 flex-1 auto-rows-[minmax(120px,1fr)] grid-cols-7 gap-px overflow-y-auto bg-border" aria-label={`Due dates in ${monthTitle(year, month)}`}>
          {cells.map((cell) => {
            const items = due.get(cell.date) ?? []
            const isToday = cell.date === TODAY
            return (
              <li key={cell.date} className={cn('flex min-w-0 flex-col gap-1 overflow-hidden p-1.5', cell.inMonth ? 'bg-surface' : 'bg-subtle/70')}>
                <span
                  className={cn(
                    'num inline-flex size-6 items-center justify-center rounded-full text-xs',
                    isToday ? 'bg-accent font-medium text-accent-fg' : cell.inMonth ? 'text-fg-muted' : 'text-fg-subtle',
                  )}
                  {...(isToday ? { 'aria-current': 'date' as const } : {})}
                >
                  {cell.day}
                </span>
                {items.slice(0, MAX_PER_DAY).map((invoice) => (
                  <EventChip key={invoice.id} invoice={invoice} onOpen={() => peek(invoice)} />
                ))}
                {items.length > MAX_PER_DAY && (
                  <Popover.Root>
                    <Popover.Trigger className="h-5 cursor-pointer rounded-sm px-1.5 text-left text-xs font-medium text-fg-muted hover:bg-subtle hover:text-fg">
                      +{items.length - MAX_PER_DAY} more
                    </Popover.Trigger>
                    <PopoverContent className="flex w-64 flex-col gap-1 p-2" aria-label={`Invoices due ${cell.date}`}>
                      {items.map((invoice) => (
                        <EventChip key={invoice.id} invoice={invoice} onOpen={() => peek(invoice)} />
                      ))}
                    </PopoverContent>
                  </Popover.Root>
                )}
              </li>
            )
          })}
        </ol>
      </div>

      {/* Agenda (< 768 px). */}
      <ol className="flex flex-col gap-4 md:hidden" aria-label={`Due dates in ${monthTitle(year, month)}`}>
        {inMonth
          .filter((cell) => (due.get(cell.date)?.length ?? 0) > 0)
          .map((cell) => (
            <li key={cell.date}>
              <h3 className={cn('mb-1.5 text-xs font-medium', cell.date === TODAY ? 'text-accent-text' : 'text-fg-subtle')}>
                {new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(cell.date))}
                {cell.date === TODAY && ' · Today'}
              </h3>
              <ul className="flex flex-col gap-1">
                {(due.get(cell.date) ?? []).map((invoice) => (
                  <li key={invoice.id}>
                    <button type="button" onClick={() => peek(invoice)} className="flex h-11 w-full cursor-pointer items-center gap-2.5 rounded-md border border-border bg-surface px-3 text-left text-sm">
                      <StatusDot tone={STATUS_TONE[invoice.status]} />
                      <span className="num text-fg-muted">{invoice.number}</span>
                      <span className="min-w-0 flex-1 truncate text-fg">{invoice.customer.name}</span>
                      <span className="num text-fg">{formatMoney(invoice.amount, invoice.currency, true)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
      </ol>
    </div>
  )
}
