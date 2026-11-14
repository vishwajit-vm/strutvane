/**
 * Dashboard: greeting header with range + actions, four KPIs, then a two-column body
 * (revenue and recent invoices on the left, status, top customers and activity on the right).
 * Two stacked columns instead of a strict grid means no empty holes when panels differ in height.
 */
import { Download, Plus } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../../components/page-header.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Segmented } from '../../components/ui/controls.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { Link } from '../../lib/router.tsx'
import { PageContainer } from '../../shell/AppShell.tsx'
import { type Kpi, KpiCard } from './KpiCard.tsx'
import { ActivityFeed, RecentInvoices, StatusBreakdown, TopCustomers } from './Panels.tsx'
import { RevenueChart } from './RevenueChart.tsx'

type Range = '7d' | '30d' | '90d'

const RANGE_HINT: Record<Range, string> = { '7d': 'vs. previous 7 days', '30d': 'vs. previous 30 days', '90d': 'vs. previous quarter' }

/** KPI values per range. Mock numbers, but internally consistent (e.g. overdue < outstanding). */
const KPIS: Record<Range, readonly Omit<Kpi, 'hint'>[]> = {
  '7d': [
    { label: 'Revenue', value: '€118.4K', delta: 6.1, goodWhen: 'up', trend: [12, 14, 13, 17, 16, 19, 21] },
    { label: 'Outstanding', value: '€86.2K', delta: -3.1, goodWhen: 'down', trend: [30, 29, 31, 28, 27, 27, 26] },
    { label: 'Overdue', value: '€14.9K', delta: 8.2, goodWhen: 'down', trend: [9, 10, 10, 11, 12, 13, 14] },
    { label: 'Avg. days to pay', value: '18.4', delta: -2.1, unit: ' d', goodWhen: 'down', trend: [22, 21, 21, 20, 19, 19, 18] },
  ],
  '30d': [
    { label: 'Revenue', value: '€482.9K', delta: 12.4, goodWhen: 'up', trend: [31, 33, 32, 36, 35, 39, 41, 40, 44, 47, 46, 51] },
    { label: 'Outstanding', value: '€86.2K', delta: -3.1, goodWhen: 'down', trend: [34, 33, 35, 31, 30, 31, 29, 28, 29, 27, 27, 26] },
    { label: 'Overdue', value: '€14.9K', delta: 8.2, goodWhen: 'down', trend: [8, 9, 8, 10, 11, 10, 12, 12, 13, 13, 14, 15] },
    { label: 'Avg. days to pay', value: '18.4', delta: -2.1, unit: ' d', goodWhen: 'down', trend: [24, 23, 23, 22, 22, 21, 21, 20, 20, 19, 19, 18] },
  ],
  '90d': [
    { label: 'Revenue', value: '€1.27M', delta: 15.8, goodWhen: 'up', trend: [80, 84, 83, 90, 95, 94, 101, 108, 112] },
    { label: 'Outstanding', value: '€91.7K', delta: 1.4, goodWhen: 'down', trend: [28, 29, 28, 30, 31, 30, 31, 32, 31] },
    { label: 'Overdue', value: '€21.3K', delta: -4.6, goodWhen: 'down', trend: [16, 17, 15, 15, 14, 15, 14, 13, 13] },
    { label: 'Avg. days to pay', value: '19.2', delta: -1.2, unit: ' d', goodWhen: 'down', trend: [22, 22, 21, 21, 21, 20, 20, 19, 19] },
  ],
}

export function Dashboard() {
  const [range, setRange] = useState<Range>('30d')
  const toast = useToast()
  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: 'Northwind Labs', to: '/' }, { label: 'Dashboard' }]}
        title="Good morning, Maya"
        description="Saturday, 14 November · 3 invoices need attention today."
        actions={
          <>
            <Segmented
              aria-label="Reporting period"
              value={range}
              onValueChange={setRange}
              items={[
                { value: '7d', label: '7D' },
                { value: '30d', label: '30D' },
                { value: '90d', label: '90D' },
              ]}
            />
            <Button onClick={() => toast({ title: 'Export started', description: 'We’ll e-mail you the CSV in a minute.', tone: 'info' })}>
              <Download aria-hidden /> Export
            </Button>
            <Button asChild variant="primary">
              <Link to="/invoices/new">
                <Plus aria-hidden /> New invoice
              </Link>
            </Button>
          </>
        }
      />
      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {KPIS[range].map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} hint={RANGE_HINT[range]} />
        ))}
      </div>
      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <RevenueChart />
          <RecentInvoices />
        </div>
        <div className="flex min-w-0 flex-col gap-3">
          <StatusBreakdown />
          <TopCustomers />
          <ActivityFeed />
        </div>
      </div>
    </PageContainer>
  )
}
