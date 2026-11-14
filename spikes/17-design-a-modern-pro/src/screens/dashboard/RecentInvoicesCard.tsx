/**
 * The newest invoices as a compact table: customer avatar cell, amount, a payment progress bar,
 * status badge and a view link. Scrolls sideways inside the card on narrow screens.
 */
import { IconArrowRight } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { PersonCell, StatusBadge } from '../../components/data-display.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { Progress } from '../../components/ui/misc.tsx'
import { invoices } from '../../data/invoices.ts'
import { formatDate, formatMoney } from '../../lib/format.ts'
import { Link } from '../../lib/router.tsx'

export function RecentInvoicesCard(): ReactElement {
  const rows = invoices.slice(0, 6)
  return (
    <Card className="pb-0 sm:pb-0">
      <CardHeader className="items-center">
        <div>
          <CardTitle>Recent invoices</CardTitle>
          <CardDescription>The latest six across all customers</CardDescription>
        </div>
        <Button asChild variant="soft" size="sm">
          <Link to="/invoices">
            View all <IconArrowRight />
          </Link>
        </Button>
      </CardHeader>
      <CardContent flush className="scrollbar-thin relative overflow-x-auto">
        <table className="w-full min-w-[46rem] text-sm">
          <thead>
            <tr className="border-y border-border bg-muted/60 text-left text-overline font-semibold uppercase text-muted-foreground">
              <th scope="col" className="py-3 pl-5 pr-3 font-semibold sm:pl-6">Customer</th>
              <th scope="col" className="px-3 py-3 font-semibold">Invoice</th>
              <th scope="col" className="px-3 py-3 font-semibold">Issued</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Amount</th>
              <th scope="col" className="px-3 py-3 font-semibold">Collected</th>
              <th scope="col" className="py-3 pl-3 pr-5 font-semibold sm:pr-6">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((invoice) => {
              const percent = Math.round((invoice.paid / invoice.amount) * 100)
              return (
                <tr key={invoice.id} className="border-b border-border transition-colors last:border-b-0 hover:bg-muted/50">
                  <td className="py-3 pl-5 pr-3 sm:pl-6">
                    <PersonCell name={invoice.customer.name} secondary={invoice.customer.contact} tone={invoice.customer.tone} />
                  </td>
                  <td className="px-3 py-3">
                    <Link to={`/invoices/${invoice.id}`} className="font-semibold text-primary-soft-foreground hover:underline">
                      {invoice.id}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground">{formatDate(invoice.issuedAt)}</td>
                  <td className="whitespace-nowrap px-3 py-3 text-right font-semibold text-foreground tabular">{formatMoney(invoice.amount)}</td>
                  <td className="px-3 py-3">
                    <div className="flex w-32 items-center gap-2.5">
                      <Progress value={percent} tone={percent === 100 ? 'success' : percent > 0 ? 'warning' : 'neutral'} label={`${invoice.id}: ${percent}% collected`} />
                      <span className="w-9 shrink-0 text-right text-xs text-muted-foreground tabular">{percent}%</span>
                    </div>
                  </td>
                  <td className="py-3 pl-3 pr-5 sm:pr-6">
                    <StatusBadge status={invoice.status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}
