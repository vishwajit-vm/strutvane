/**
 * Dashboard: welcome, four KPIs, revenue + status charts, top items, activity and recent records.
 *
 * Grid: 12 columns on wide screens (8/4, 5/7, 12), one column on phones; 16–20 px gaps throughout.
 */
import { IconCalendar, IconDownload } from '@tabler/icons-react'
import { PageHeader } from '../../components/PageHeader.tsx'
import { Button } from '../../components/ui/button.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { RevenueChart, StatusDonut } from './charts.tsx'
import { ActivityTimeline, KpiGrid, RecentInvoices, TopItems, WelcomeCard } from './widgets.tsx'

export function DashboardPage() {
  const toast = useToast()
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="How Halcyon Supply Co. is doing this month."
        actions={
          <>
            <Button variant="secondary">
              <IconCalendar aria-hidden /> Nov 1 – Nov 14
            </Button>
            <Button onClick={() => toast({ title: 'Report is being prepared', description: 'We’ll notify you when the PDF is ready.', tone: 'info' })}>
              <IconDownload aria-hidden /> Export report
            </Button>
          </>
        }
      />
      <div className="flex flex-col gap-5">
        <WelcomeCard />
        <KpiGrid />
        <div className="grid gap-5 xl:grid-cols-12">
          <RevenueChart className="xl:col-span-8" />
          <StatusDonut className="xl:col-span-4" />
        </div>
        <div className="grid gap-5 xl:grid-cols-12">
          <TopItems className="xl:col-span-5" />
          <ActivityTimeline className="xl:col-span-7" />
        </div>
        <RecentInvoices />
      </div>
    </>
  )
}
