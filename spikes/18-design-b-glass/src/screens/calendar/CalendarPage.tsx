/**
 * Calendar: a month grid (Monday first) with colour-coded event pills, today highlighted, and an
 * agenda for the selected day. On phones the grid shows dots and the agenda carries the detail.
 */
import { IconChevronLeft, IconChevronRight, IconPlus } from '@tabler/icons-react'
import { useState } from 'react'
import { PageHeader } from '../../components/PageHeader.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../components/ui/card.tsx'
import { EVENTS, type CalendarEvent } from '../../data/workspace.ts'
import { cn } from '../../lib/cn.ts'
import { TODAY } from '../../lib/format.ts'

const KIND_STYLE: Readonly<Record<CalendarEvent['kind'], { pill: string; dot: string; label: string }>> = {
  due: { pill: 'bg-danger-soft text-danger', dot: 'bg-danger', label: 'Invoice due' },
  meeting: { pill: 'bg-primary-soft text-primary-soft-fg', dot: 'bg-control', label: 'Meeting' },
  reminder: { pill: 'bg-warning-soft text-warning', dot: 'bg-warning', label: 'Reminder' },
  payroll: { pill: 'bg-success-soft text-success', dot: 'bg-success', label: 'Finance' },
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const
const monthFormat = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' })
const dayFormat = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

/** The 6×7 grid of dates covering a month, starting on Monday. */
export function monthGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  return Array.from({ length: 42 }, (_, index) => new Date(year, month, 1 - offset + index))
}

const sameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))
  const [selected, setSelected] = useState(TODAY)
  const days = monthGrid(cursor.getFullYear(), cursor.getMonth())
  const eventsOn = (day: Date): CalendarEvent[] => EVENTS.filter((event) => sameDay(event.date, day))
  const agenda = eventsOn(selected)
  const shift = (months: number): void => setCursor((current) => new Date(current.getFullYear(), current.getMonth() + months, 1))

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Billing' }, { label: 'Calendar' }]}
        title="Calendar"
        description="Due dates, reminders and meetings in one place."
        actions={
          <Button>
            <IconPlus aria-hidden /> New event
          </Button>
        }
      />
      <div className="grid items-start gap-5 xl:grid-cols-12">
        <Card material="solid" className="overflow-hidden xl:col-span-9">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4">
            <h2 className="text-lg font-semibold tracking-tight text-fg" aria-live="polite">
              {monthFormat.format(cursor)}
            </h2>
            <div className="ml-auto flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setCursor(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1))}>
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}>
                <IconChevronLeft aria-hidden />
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}>
                <IconChevronRight aria-hidden />
              </Button>
            </div>
          </div>
          <div role="grid" aria-label={monthFormat.format(cursor)} className="border-t border-border">
            <div role="row" className="grid grid-cols-7 border-b border-border bg-surface-muted">
              {WEEKDAYS.map((day) => (
                <div key={day} role="columnheader" className="py-2 text-center text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
                  {day}
                </div>
              ))}
            </div>
            {[0, 1, 2, 3, 4, 5].map((week) => (
              <div key={week} role="row" className="grid grid-cols-7">
                {days.slice(week * 7, week * 7 + 7).map((day) => {
                  const inMonth = day.getMonth() === cursor.getMonth()
                  const events = eventsOn(day)
                  const isToday = sameDay(day, TODAY)
                  const isSelected = sameDay(day, selected)
                  return (
                    <div key={day.toISOString()} role="gridcell" aria-selected={isSelected} className="min-w-0 border-r border-b border-border last:border-r-0">
                      <button
                        type="button"
                        onClick={() => setSelected(day)}
                        aria-label={`${dayFormat.format(day)}${events.length > 0 ? `, ${events.length} ${events.length === 1 ? 'event' : 'events'}` : ''}`}
                        className={cn('flex h-full min-h-16 w-full flex-col gap-1 p-1.5 text-left transition-fast hover:bg-surface-hover sm:min-h-28 sm:p-2', isSelected && 'bg-surface-selected', !inMonth && 'opacity-55')}
                      >
                        <span className={cn('grid size-7 place-items-center rounded-full text-sm font-semibold tabular', isToday ? 'bg-brand-gradient text-primary-fg shadow-primary' : 'text-fg')}>{day.getDate()}</span>
                        <span className="hidden flex-col gap-1 sm:flex">
                          {events.slice(0, 2).map((event) => (
                            <span key={event.id} className={cn('truncate rounded-xs px-1.5 py-0.5 text-2xs font-semibold', KIND_STYLE[event.kind].pill)}>
                              {event.time !== null && <span className="tabular">{event.time} </span>}
                              {event.title}
                            </span>
                          ))}
                          {events.length > 2 && <span className="px-1.5 text-2xs font-semibold text-fg-muted">+{events.length - 2} more</span>}
                        </span>
                        <span className="flex gap-1 sm:hidden" aria-hidden>
                          {events.map((event) => (
                            <span key={event.id} className={cn('size-1.5 rounded-full', KIND_STYLE[event.kind].dot)} />
                          ))}
                        </span>
                      </button>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </Card>
        <div className="flex flex-col gap-5 xl:col-span-3">
          <Card>
            <CardHeader title={dayFormat.format(selected)} description={agenda.length === 0 ? 'Nothing scheduled' : `${agenda.length} ${agenda.length === 1 ? 'event' : 'events'}`} />
            <CardBody>
              {agenda.length === 0 ? (
                <p className="rounded-md border border-dashed border-input p-4 text-center text-sm text-fg-muted">A free day. Enjoy it.</p>
              ) : (
                <ul className="flex flex-col gap-2.5">
                  {agenda.map((event) => (
                    <li key={event.id} className="flex items-center gap-3 rounded-md border border-glass-border bg-glass-hover p-3">
                      <span className={cn('h-9 w-1 shrink-0 rounded-full', KIND_STYLE[event.kind].dot)} aria-hidden />
                      <div className="min-w-0">
                        <p className="truncate text-base font-semibold text-fg">{event.title}</p>
                        <p className="text-xs text-fg-muted">
                          {event.time ?? 'All day'} · {KIND_STYLE[event.kind].label}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Legend" />
            <CardBody>
              <ul className="grid grid-cols-2 gap-2.5 xl:grid-cols-1">
                {Object.values(KIND_STYLE).map((style) => (
                  <li key={style.label} className="flex items-center gap-2.5 text-sm text-fg">
                    <span className={cn('size-2.5 rounded-full', style.dot)} aria-hidden />
                    {style.label}
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}
