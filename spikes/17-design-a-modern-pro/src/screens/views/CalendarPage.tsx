/**
 * Calendar view of invoices by due date (resource-views package): a month grid on tablets and up,
 * an agenda list on phones (a 7-column grid is unreadable at 375px), with today highlighted,
 * status-coloured event chips, "+N more", month navigation and an "upcoming" side list.
 */
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useState, type ReactElement } from 'react'
import { STATUS_META, StatusBadge } from '../../components/data-display.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { Avatar } from '../../components/ui/misc.tsx'
import { TONE_FILL, TONE_SOFT } from '../../components/ui/tone.ts'
import { invoices, type Invoice } from '../../data/invoices.ts'
import { cn } from '../../lib/cn.ts'
import { formatCompactMoney, formatMoney, TODAY } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'
import { PHONE_QUERY, useMediaQuery } from '../../lib/use-media-query.ts'
import { ViewSwitch } from '../invoices/ViewSwitch.tsx'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const MAX_CHIPS = 3
const dayKey = (date: Date): string => `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
const sameDay = (a: Date, b: Date): boolean => dayKey(a) === dayKey(b)

/** The 6×7 dates shown for a month, starting on Monday. */
export function monthGrid(year: number, month: number): readonly Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_unused, index) => new Date(year, month, 1 - offset + index))
}

function byDay(list: readonly Invoice[]): ReadonlyMap<string, readonly Invoice[]> {
  const map = new Map<string, Invoice[]>()
  for (const invoice of list) {
    const key = dayKey(invoice.dueAt)
    map.set(key, [...(map.get(key) ?? []), invoice])
  }
  return map
}

function EventChip({ invoice }: { readonly invoice: Invoice }): ReactElement {
  const tone = STATUS_META[invoice.status].tone
  return (
    <Link to={`/invoices/${invoice.id}`} title={`${invoice.id} · ${invoice.customer.name} · ${formatMoney(invoice.amount)}`} className={cn('flex items-center gap-1.5 truncate rounded-md px-1.5 py-1 text-xs font-semibold transition-[filter] hover:brightness-95 dark:hover:brightness-125', TONE_SOFT[tone])}>
      <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', TONE_FILL[tone])} />
      <span className="truncate">{invoice.customer.name.split(' ')[0]}</span>
      <span className="ml-auto shrink-0 tabular max-2xl:hidden">{formatCompactMoney(invoice.amount)}</span>
    </Link>
  )
}

export function CalendarPage(): ReactElement {
  const [cursor, setCursor] = useState({ year: TODAY.getFullYear(), month: TODAY.getMonth() })
  const isPhone = useMediaQuery(PHONE_QUERY)
  const events = byDay(invoices)
  const days = monthGrid(cursor.year, cursor.month)
  const title = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const shift = (delta: number): void => {
    const next = new Date(cursor.year, cursor.month + delta, 1)
    setCursor({ year: next.getFullYear(), month: next.getMonth() })
  }
  const inMonth = invoices.filter((invoice) => invoice.dueAt.getFullYear() === cursor.year && invoice.dueAt.getMonth() === cursor.month).sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime())
  const upcoming = invoices.filter((invoice) => invoice.dueAt >= TODAY && invoice.status !== 'paid').sort((a, b) => a.dueAt.getTime() - b.dueAt.getTime()).slice(0, 6)

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing' }, { label: 'Invoices', to: '/invoices' }, { label: 'Calendar' }]}
        back="/invoices"
        title="Due-date calendar"
        actions={
          <>
            <ViewSwitch current="calendar" />
            <Button asChild variant="primary">
              <Link to="/invoices/new">
                <IconPlus /> New invoice
              </Link>
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <section aria-label={`Calendar, ${title}`} className="min-w-0 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm dark:border-border">
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-4 sm:px-6">
            <h2 className="text-lg font-bold tracking-tight" aria-live="polite">
              {title}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setCursor({ year: TODAY.getFullYear(), month: TODAY.getMonth() })}>
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous month">
                <IconChevronLeft />
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label="Next month">
                <IconChevronRight />
              </Button>
            </div>
            <div className="flex w-full flex-wrap gap-x-4 gap-y-1.5">
              {(['pending', 'partial', 'overdue', 'paid', 'draft'] as const).map((status) => (
                <span key={status} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className={cn('size-2 rounded-full', TONE_FILL[STATUS_META[status].tone])} />
                  {STATUS_META[status].label}
                </span>
              ))}
            </div>
          </div>
          {isPhone ? (
            <ol className="divide-y divide-border">
              {inMonth.length === 0 ? <li className="px-5 py-10 text-center text-sm text-muted-foreground">Nothing due this month.</li> : null}
              {inMonth.map((invoice) => (
                <li key={invoice.id} className="flex items-center gap-3 px-5 py-3">
                  <span className={cn('flex w-11 shrink-0 flex-col items-center rounded-lg py-1', sameDay(invoice.dueAt, TODAY) ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
                    <span className="text-overline font-semibold uppercase">{invoice.dueAt.toLocaleDateString('en-US', { weekday: 'short' })}</span>
                    <span className="text-base font-bold leading-5 tabular">{invoice.dueAt.getDate()}</span>
                  </span>
                  <Link to={`/invoices/${invoice.id}`} className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{invoice.customer.name}</span>
                    <span className="text-xs text-muted-foreground tabular">
                      {invoice.id} · {formatMoney(invoice.amount)}
                    </span>
                  </Link>
                  <StatusBadge status={invoice.status} />
                </li>
              ))}
            </ol>
          ) : (
            <div role="table" aria-label={title} className="grid grid-cols-7">
              <div role="row" className="contents">
                {WEEKDAYS.map((day) => (
                  <div key={day} role="columnheader" className="border-b border-border bg-muted py-2.5 text-center text-overline font-semibold uppercase text-muted-foreground">
                    {day}
                  </div>
                ))}
              </div>
              {Array.from({ length: 6 }, (_unused, week) => (
                <div key={week} role="row" className="contents">
                  {days.slice(week * 7, week * 7 + 7).map((date) => {
                    const list = events.get(dayKey(date)) ?? []
                    const outside = date.getMonth() !== cursor.month
                    const today = sameDay(date, TODAY)
                    return (
                      <div key={dayKey(date)} role="cell" aria-label={`${date.toDateString()}, ${list.length} due`} className={cn('flex min-h-28 min-w-0 flex-col gap-1 border-b border-r border-border p-1.5 [&:nth-child(7n)]:border-r-0', outside && 'bg-muted/40')}>
                        <span className={cn('mb-0.5 grid size-7 place-items-center self-end rounded-full text-label font-semibold tabular', today ? 'bg-primary text-primary-foreground shadow-primary' : outside ? 'text-muted-foreground' : 'text-foreground')}>{date.getDate()}</span>
                        {list.slice(0, MAX_CHIPS).map((invoice) => (
                          <EventChip key={invoice.id} invoice={invoice} />
                        ))}
                        {list.length > MAX_CHIPS ? <span className="px-1.5 text-xs font-semibold text-muted-foreground">+{list.length - MAX_CHIPS} more</span> : null}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          )}
        </section>
        <Card className="self-start">
          <CardHeader>
            <div>
              <CardTitle>Coming up</CardTitle>
              <CardDescription>Next unpaid due dates</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-4">
              {upcoming.map((invoice) => (
                <li key={invoice.id} className="flex items-center gap-3">
                  <span className="flex w-11 shrink-0 flex-col items-center rounded-lg bg-primary-soft py-1 text-primary-soft-foreground">
                    <span className="text-overline font-semibold uppercase">{invoice.dueAt.toLocaleDateString('en-US', { month: 'short' })}</span>
                    <span className="text-base font-bold leading-5 tabular">{invoice.dueAt.getDate()}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <Link to={`/invoices/${invoice.id}`} className="block truncate text-sm font-semibold hover:underline">
                      {invoice.customer.name}
                    </Link>
                    <span className="text-xs text-muted-foreground tabular">{formatMoney(invoice.amount)}</span>
                  </div>
                  <Avatar name={invoice.owner.name} tone={invoice.owner.tone} size="xs" />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
