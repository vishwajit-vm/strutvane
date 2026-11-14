/**
 * Dashboard: hero + four KPI cards, revenue chart + status donut, goal / top plans / activity,
 * and the recent invoices table. A 12-column grid with one 24px gutter everywhere; each row's
 * cards stretch to equal height so their bottoms line up.
 */
import { IconCalendar, IconDownload } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { kpis } from '../../data/dashboard.ts'
import { ActivityCard, GoalCard, TopItemsCard } from './InsightCards.tsx'
import { KpiCard } from './KpiCard.tsx'
import { RecentInvoicesCard } from './RecentInvoicesCard.tsx'
import { RevenueCard } from './RevenueCard.tsx'
import { StatusDonutCard } from './StatusDonutCard.tsx'
import { WelcomeCard } from './WelcomeCard.tsx'
import { cn } from '../../lib/cn.ts'

export function DashboardPage(): ReactElement {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Billing performance for Halyard Systems"
        actions={
          <>
            <Button variant="outline">
              <IconCalendar /> Nov 1 – Nov 14
            </Button>
            <Button variant="primary" onClick={() => toast({ tone: 'success', title: 'Report is being prepared', description: 'We’ll email you the PDF in a minute.' })}>
              <IconDownload /> Export
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-12 gap-4 sm:gap-6">
        <div className="col-span-12 xl:col-span-6">
          <WelcomeCard />
        </div>
        <div className="col-span-12 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 xl:col-span-6">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.id} kpi={kpi} />
          ))}
        </div>
        <Cell span="xl:col-span-8">
          <RevenueCard />
        </Cell>
        <Cell span="lg:col-span-6 xl:col-span-4">
          <StatusDonutCard />
        </Cell>
        <Cell span="lg:col-span-6 xl:col-span-4">
          <GoalCard />
        </Cell>
        <Cell span="lg:col-span-6 xl:col-span-4">
          <TopItemsCard />
        </Cell>
        <Cell span="lg:col-span-6 xl:col-span-4">
          <ActivityCard />
        </Cell>
        <Cell span="">
          <RecentInvoicesCard />
        </Cell>
      </div>
    </>
  )
}

function Cell({ span, children }: { readonly span: string; readonly children: ReactElement }): ReactElement {
  return <div className={cn('col-span-12 min-w-0', span)}>{children}</div>
}
