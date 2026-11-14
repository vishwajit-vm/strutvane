/**
 * Dashboard widgets: welcome card, KPI cards, top items, activity timeline and recent invoices.
 * Charts live in charts.tsx.
 */
import {
  IconArrowUpRight,
  IconBell,
  IconCash,
  IconClockHour4,
  IconFileInvoice,
  IconMessageCircle,
  IconPlus,
  IconReceipt,
  IconUserPlus,
  IconUsers,
  type Icon,
} from '@tabler/icons-react'
import { Link } from 'react-router'
import { Sparkline, StatusBadge, TrendChip } from '../../components/data-display.tsx'
import { WelcomeArt } from '../../components/illustrations.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../components/ui/card.tsx'
import { Progress } from '../../components/ui/misc.tsx'
import { ACTIVITY, KPIS, TOP_ITEMS, type ActivityKind, type Kpi } from '../../data/dashboard.ts'
import { INVOICES } from '../../data/invoices.ts'
import { CURRENT_USER } from '../../data/people.ts'
import { cn } from '../../lib/cn.ts'
import { formatDate, formatMoney, formatNumber, formatRelative, TODAY } from '../../lib/format.ts'

// ── Welcome ──────────────────────────────────────────────────────────────

export function WelcomeCard({ className }: { className?: string }) {
  const firstName = CURRENT_USER.name.split(' ')[0] ?? CURRENT_USER.name
  return (
    <Card className={cn('relative overflow-hidden', className)}>
      {/* A soft brand glow in the corner: depth without another blur layer. */}
      <div className="pointer-events-none absolute -top-24 -right-16 size-72 rounded-full bg-primary-soft blur-3xl" aria-hidden />
      <div className="relative flex flex-col gap-6 p-6 sm:flex-row sm:items-center sm:p-7">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary-text">Saturday, November 14</p>
          <h2 className="mt-1 text-2xl font-bold tracking-tight text-fg">Good morning, {firstName}</h2>
          <p className="mt-2 max-w-xl text-base text-fg-muted">
            You collected <strong className="font-semibold text-fg">{formatMoney(161_800)}</strong> this month, 87% of the goal. Three invoices became overdue overnight.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button asChild>
              <Link to="/invoices/new">
                <IconPlus aria-hidden /> New invoice
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link to="/invoices?status=overdue">Review overdue</Link>
            </Button>
          </div>
        </div>
        <div className="hidden w-full max-w-64 shrink-0 sm:block">
          <WelcomeArt className="w-full" />
        </div>
      </div>
      <div className="relative grid grid-cols-1 gap-px border-t border-glass-border sm:grid-cols-3">
        <GoalStat label="Monthly collection goal" value="87%" progress={87} />
        <GoalStat label="Invoices sent this week" value="24 / 30" progress={80} />
        <GoalStat label="Average payment score" value="92 / 100" progress={92} tone="success" />
      </div>
    </Card>
  )
}

function GoalStat({ label, value, progress, tone = 'primary' }: { label: string; value: string; progress: number; tone?: 'primary' | 'success' }) {
  return (
    <div className="px-6 py-4 sm:px-7">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-sm text-fg-muted">{label}</span>
        <span className="text-base font-bold text-fg tabular">{value}</span>
      </div>
      <Progress value={progress} tone={tone} label={`${label}: ${value}`} className="mt-2" />
    </div>
  )
}

// ── KPI cards ────────────────────────────────────────────────────────────

const KPI_ICON: Readonly<Record<string, Icon>> = { revenue: IconCash, outstanding: IconReceipt, 'new-customers': IconUsers, dso: IconClockHour4 }

function formatKpi(kpi: Kpi): string {
  if (kpi.format === 'money') return formatMoney(kpi.value, 'USD').replace(/\.00$/, '')
  if (kpi.format === 'days') return `${kpi.value} days`
  return formatNumber(kpi.value)
}

export function KpiCard({ kpi }: { kpi: Kpi }) {
  const Icon = KPI_ICON[kpi.id] ?? IconFileInvoice
  const good = kpi.delta > 0 === kpi.upIsGood
  return (
    <Card interactive className="p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-fg-muted">{kpi.label}</h2>
        <span className="grid size-9 place-items-center rounded-md bg-primary-soft text-primary-soft-fg" aria-hidden>
          <Icon className="size-[1.15rem]" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-bold tracking-tight text-fg tabular">{formatKpi(kpi)}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <TrendChip delta={kpi.delta} upIsGood={kpi.upIsGood} />
          <p className="mt-1.5 truncate text-xs text-fg-muted">{kpi.hint}</p>
        </div>
        <Sparkline values={kpi.series} tone={good ? 'success' : 'danger'} label={`${kpi.label} trend over 12 months, ${kpi.delta > 0 ? 'rising' : 'falling'}`} className="h-10 w-28" />
      </div>
    </Card>
  )
}

export function KpiGrid() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {KPIS.map((kpi) => (
        <KpiCard key={kpi.id} kpi={kpi} />
      ))}
    </div>
  )
}

// ── Top items ────────────────────────────────────────────────────────────

export function TopItems({ className }: { className?: string }) {
  const max = Math.max(...TOP_ITEMS.map((item) => item.revenue))
  return (
    <Card className={className}>
      <CardHeader title="Top items" description="Revenue by catalogue item" />
      <CardBody>
        <ol className="flex flex-col gap-4">
          {TOP_ITEMS.map((item, index) => (
            <li key={item.name} className="flex items-center gap-3.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-md bg-neutral-soft text-sm font-bold text-fg-muted tabular" aria-hidden>
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="truncate text-base font-semibold text-fg">{item.name}</span>
                  <span className="shrink-0 text-base font-semibold text-fg tabular">{formatMoney(item.revenue, 'USD', true)}</span>
                </div>
                <Progress value={(item.revenue / max) * 100} label={`${item.name}: ${formatMoney(item.revenue)}`} className="mt-2" />
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}

// ── Activity timeline ────────────────────────────────────────────────────

const ACTIVITY_STYLE: Readonly<Record<ActivityKind, { icon: Icon; className: string }>> = {
  payment: { icon: IconCash, className: 'bg-success-soft text-success' },
  invoice: { icon: IconFileInvoice, className: 'bg-primary-soft text-primary-soft-fg' },
  comment: { icon: IconMessageCircle, className: 'bg-info-soft text-info' },
  member: { icon: IconUserPlus, className: 'bg-warning-soft text-warning' },
  reminder: { icon: IconBell, className: 'bg-neutral-soft text-fg-muted' },
}

export function ActivityTimeline({ className }: { className?: string }) {
  return (
    <Card className={className}>
      <CardHeader
        title="Recent activity"
        description="Across your workspace"
        actions={
          <Button variant="ghost" size="sm">
            View all
          </Button>
        }
      />
      <CardBody>
        <ol className="relative flex flex-col gap-5 before:absolute before:top-2 before:bottom-2 before:left-[1.0625rem] before:w-px before:bg-border">
          {ACTIVITY.map((entry) => {
            const style = ACTIVITY_STYLE[entry.kind]
            return (
              <li key={entry.id} className="relative flex gap-3.5">
                <span className={cn('relative grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-glass-border', style.className)} aria-hidden>
                  <style.icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="text-base text-fg">
                    <span className="font-semibold">{entry.actor}</span> {entry.text} <span className="text-fg-muted">{entry.target}</span>
                  </p>
                  <p className="mt-0.5 text-xs text-fg-muted">{formatRelative(new Date(TODAY.getTime() - entry.minutesAgo * 60_000))}</p>
                </div>
              </li>
            )
          })}
        </ol>
      </CardBody>
    </Card>
  )
}

// ── Recent invoices table ────────────────────────────────────────────────

export function RecentInvoices({ className }: { className?: string }) {
  const rows = INVOICES.slice(0, 6)
  return (
    <Card material="solid" className={className}>
      <CardHeader
        title="Recent invoices"
        description="The latest six, newest first"
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link to="/invoices">
              View all <IconArrowUpRight aria-hidden />
            </Link>
          </Button>
        }
      />
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full min-w-[40rem] text-left text-base">
          <thead>
            <tr className="border-y border-border bg-surface-muted text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
              <th scope="col" className="py-2.5 pr-3 pl-6 font-semibold">
                Customer
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Invoice
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Issued
              </th>
              <th scope="col" className="px-3 py-2.5 font-semibold">
                Status
              </th>
              <th scope="col" className="py-2.5 pr-6 pl-3 text-right font-semibold">
                Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => (
              <tr key={invoice.id} className="border-b border-border transition-fast last:border-0 hover:bg-surface-hover">
                <td className="py-3 pr-3 pl-6">
                  <div className="flex items-center gap-3">
                    <Avatar name={invoice.customer.name} shape="square" />
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-fg">{invoice.customer.name}</p>
                      <p className="truncate text-xs text-fg-muted">{invoice.customer.contact}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <Link to={`/invoices/${invoice.id}`} className="font-mono text-sm font-medium whitespace-nowrap text-primary-text hover:underline">
                    {invoice.number}
                  </Link>
                </td>
                <td className="px-3 py-3 text-fg-muted">{formatDate(invoice.issuedAt)}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={invoice.status} />
                </td>
                <td className="py-3 pr-6 pl-3 text-right font-semibold text-fg tabular">{formatMoney(invoice.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
