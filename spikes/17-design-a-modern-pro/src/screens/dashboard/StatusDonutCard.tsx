/**
 * Invoices by status: a rounded-segment donut with the total in the centre and a legend that
 * doubles as a data table (count and share per status), so the numbers never depend on hover.
 */
import type { ReactElement } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { CardMenu } from '../../components/card-menu.tsx'
import { ChartTooltip } from '../../components/chart.tsx'
import { STATUS_META } from '../../components/data-display.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { countByStatus, INVOICE_STATUSES, type InvoiceStatus } from '../../data/invoices.ts'
import { formatInteger } from '../../lib/format.ts'

/** Chart colours per status: the chart palette's nearest match to each status badge's hue. */
export const STATUS_CHART_COLOR: Readonly<Record<InvoiceStatus, string>> = {
  paid: 'var(--chart-5)',
  pending: 'var(--chart-2)',
  partial: 'var(--chart-3)',
  overdue: 'var(--chart-4)',
  draft: 'var(--muted-foreground)',
}

export function StatusDonutCard(): ReactElement {
  const counts = countByStatus()
  const order: readonly InvoiceStatus[] = ['paid', 'pending', 'partial', 'overdue', 'draft']
  const data = order.map((status) => ({ name: STATUS_META[status].label, status, value: counts[status] }))
  const total = INVOICE_STATUSES.reduce((sum, status) => sum + counts[status], 0)

  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Invoices by status</CardTitle>
          <CardDescription>All {formatInteger(total)} invoices this quarter</CardDescription>
        </div>
        <CardMenu label="Status chart options" />
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6">
        <div className="relative mx-auto aspect-square w-full max-w-56">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip content={<ChartTooltip format={(value) => `${formatInteger(value)} invoices`} />} />
              <Pie data={data} dataKey="value" nameKey="name" innerRadius="72%" outerRadius="100%" paddingAngle={3} cornerRadius={6} stroke="none" startAngle={90} endAngle={-270}>
                {data.map((entry) => (
                  <Cell key={entry.status} fill={STATUS_CHART_COLOR[entry.status]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[1.75rem] font-bold leading-9 text-foreground tabular">{formatInteger(total)}</span>
            <span className="text-xs text-muted-foreground">Invoices</span>
          </div>
        </div>
        <ul className="flex flex-col gap-3">
          {data.map((entry) => (
            <li key={entry.status} className="flex items-center gap-3 text-sm">
              <span aria-hidden className="size-2.5 rounded-full" style={{ background: STATUS_CHART_COLOR[entry.status] }} />
              <span className="flex-1 text-muted-foreground">{entry.name}</span>
              <span className="font-semibold text-foreground tabular">{formatInteger(entry.value)}</span>
              <span className="w-11 text-right text-xs text-muted-foreground tabular">{Math.round((entry.value / total) * 100)}%</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
