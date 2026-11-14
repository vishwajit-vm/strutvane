/**
 * The dashboard's supporting panels: status breakdown, top customers, activity feed and recent
 * invoices. Each is a small card component with its own heading, so the dashboard grid composes
 * them without knowing their insides.
 */
import { ArrowRight, CircleDollarSign, FilePlus2, Mail, MessageSquare, Pencil, TriangleAlert, UserPlus } from 'lucide-react'
import type { ReactNode } from 'react'
import { CustomerCell, DueLabel, InvoiceStatusBadge, Money, STATUS_TONE } from '../../components/invoice-bits.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { StatusDot } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardBody, CardFooter, CardHeader } from '../../components/ui/card.tsx'
import { type ActivityItem, type ActivityKind, workspaceActivity } from '../../data/activity.ts'
import { invoices, STATUS_LABELS, STATUSES, totalsByStatus } from '../../data/invoices.ts'
import { customers } from '../../data/people.ts'
import { cn } from '../../lib/cn.ts'
import { formatCount, formatMoney, formatRelative } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'

const STATUS_BAR: Record<string, string> = {
  draft: 'bg-chart-4',
  open: 'bg-chart-1',
  overdue: 'bg-danger',
  paid: 'bg-success',
  void: 'bg-chart-3',
}

/** A single stacked bar of invoice value per status, then one row per status with count and value. */
export function StatusBreakdown() {
  const totals = totalsByStatus(invoices)
  const sum = STATUSES.reduce((total, status) => total + totals[status].amount, 0)
  return (
    <Card aria-labelledby="status-title">
      <CardHeader id="status-title" title="Invoices by status" description={`${formatCount(invoices.length)} invoices · ${formatMoney(sum, 'EUR', true)} total`} />
      <CardBody>
        <div className="flex h-2 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {STATUSES.map((status) => (
            <span key={status} className={cn('h-full first:rounded-l-full last:rounded-r-full', STATUS_BAR[status])} style={{ width: `${(totals[status].amount / sum) * 100}%` }} />
          ))}
        </div>
        <table className="mt-4 w-full text-sm">
          <caption className="sr-only">Invoice count and value per status</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Invoices</th>
              <th scope="col">Value</th>
              <th scope="col">Share</th>
            </tr>
          </thead>
          <tbody>
            {STATUSES.map((status) => (
              <tr key={status} className="h-8">
                <th scope="row" className="text-left font-normal">
                  <Link to={`/invoices?status=${status}`} className="inline-flex items-center gap-2 rounded-xs text-fg hover:underline">
                    <StatusDot tone={STATUS_TONE[status]} /> {STATUS_LABELS[status]}
                  </Link>
                </th>
                <td className="num w-12 text-right text-fg-subtle">{totals[status].count}</td>
                <td className="num w-24 text-right text-fg">{formatMoney(totals[status].amount, 'EUR', true)}</td>
                <td className="num w-14 text-right text-fg-subtle">{((totals[status].amount / sum) * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  )
}

/** Top five customers by paid value, each with a thin proportional bar. */
export function TopCustomers() {
  const paid = new Map<string, number>()
  for (const invoice of invoices) if (invoice.status === 'paid') paid.set(invoice.customer.id, (paid.get(invoice.customer.id) ?? 0) + invoice.amount)
  const ranked = customers
    .map((customer) => ({ customer, amount: paid.get(customer.id) ?? 0 }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 5)
  const top = ranked[0]?.amount ?? 1
  return (
    <Card aria-labelledby="top-title">
      <CardHeader id="top-title" title="Top customers" description="By paid value, last 12 months" />
      <ol className="flex flex-col gap-3.5 px-4 pb-4">
        {ranked.map(({ customer, amount }, index) => (
          <li key={customer.id} className="flex items-center gap-3">
            <span className="num w-3 text-xs text-fg-subtle">{index + 1}</span>
            <Avatar name={customer.name} tint={customer.tint} shape="square" size="sm" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-fg">{customer.name}</span>
                <span className="num shrink-0 text-sm text-fg">{formatMoney(amount, 'EUR', true)}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                <div className="h-full rounded-full bg-chart-1" style={{ width: `${(amount / top) * 100}%` }} />
              </div>
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

const KIND_ICON: Record<ActivityKind, ReactNode> = {
  paid: <CircleDollarSign aria-hidden />,
  sent: <Mail aria-hidden />,
  created: <FilePlus2 aria-hidden />,
  commented: <MessageSquare aria-hidden />,
  reminder: <Mail aria-hidden />,
  overdue: <TriangleAlert aria-hidden />,
  member: <UserPlus aria-hidden />,
  edited: <Pencil aria-hidden />,
}

/** Render `**bold**` segments of an activity sentence as emphasised text. */
export function ActivityText({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, index) =>
        part.startsWith('**') ? (
          <span key={index} className="font-medium text-fg">
            {part.slice(2, -2)}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  )
}

/** A vertical timeline: avatar (or a system icon) on a hairline rail, sentence, relative time. */
export function ActivityTimeline({ items }: { items: readonly ActivityItem[] }) {
  return (
    <ol className="relative flex flex-col">
      {items.map((item, index) => (
        <li key={item.id} className="relative flex gap-3 pb-4 last:pb-0">
          {index < items.length - 1 && <span aria-hidden className="absolute left-3 top-7 -bottom-0 w-px bg-border" />}
          {item.actor === null ? (
            <span className={cn('relative flex size-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface [&_svg]:size-3', item.kind === 'overdue' ? 'text-danger-text' : item.kind === 'paid' ? 'text-success-text' : 'text-fg-muted')}>
              {KIND_ICON[item.kind]}
            </span>
          ) : (
            <Avatar name={item.actor.name} tint={item.actor.tint} size="sm" className="relative" />
          )}
          <div className="min-w-0 flex-1 pt-0.5 text-sm text-fg-muted">
            {item.actor !== null && <span className="font-medium text-fg">{item.actor.name} </span>}
            {item.href !== undefined ? (
              <Link to={item.href} className="rounded-xs hover:underline">
                <ActivityText text={item.text} />
              </Link>
            ) : (
              <ActivityText text={item.text} />
            )}
            <p className="mt-0.5 text-xs text-fg-subtle">
              <time dateTime={item.at}>{formatRelative(item.at)}</time>
            </p>
          </div>
        </li>
      ))}
    </ol>
  )
}

export function ActivityFeed() {
  return (
    <Card aria-labelledby="activity-title">
      <CardHeader id="activity-title" title="Activity" description="Across the workspace" />
      <CardBody>
        <ActivityTimeline items={workspaceActivity.slice(0, 6)} />
      </CardBody>
    </Card>
  )
}

/** The six most recent invoices as a compact table, with a link to the full list. */
export function RecentInvoices() {
  const rows = invoices.slice(0, 6)
  return (
    <Card aria-labelledby="recent-title" className="overflow-hidden">
      <CardHeader
        id="recent-title"
        title="Recent invoices"
        description="Latest six, newest first"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link to="/invoices">
              View all <ArrowRight aria-hidden />
            </Link>
          </Button>
        }
      />
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="h-8 border-y border-border bg-subtle/60 text-left text-xs text-fg-subtle">
              <th scope="col" className="pl-4 font-medium">
                Invoice
              </th>
              <th scope="col" className="font-medium">
                Customer
              </th>
              <th scope="col" className="font-medium">
                Status
              </th>
              <th scope="col" className="font-medium">
                Due
              </th>
              <th scope="col" className="pr-4 text-right font-medium">
                Amount
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((invoice) => (
              <tr key={invoice.id} className="h-12 hover:bg-subtle/60">
                <td className="pl-4">
                  <Link to={`/invoices/${invoice.id}`} className="num rounded-xs font-medium text-fg hover:underline">
                    {invoice.number}
                  </Link>
                </td>
                <td className="max-w-48 pr-3">
                  <CustomerCell invoice={invoice} withContact={false} />
                </td>
                <td>
                  <InvoiceStatusBadge status={invoice.status} />
                </td>
                <td>
                  <DueLabel invoice={invoice} />
                </td>
                <td className="pr-4 text-right">
                  <Money invoice={invoice} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <CardFooter className="justify-between text-xs text-fg-subtle">
        <span>Updated just now</span>
        <Link to="/invoices/new" className="font-medium text-accent-text hover:underline">
          Create invoice
        </Link>
      </CardFooter>
    </Card>
  )
}
