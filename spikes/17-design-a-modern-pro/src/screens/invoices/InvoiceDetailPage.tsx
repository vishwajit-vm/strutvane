/**
 * Invoice detail: header (back, title, status badge, actions on one row), four summary cards,
 * then tabs (Overview, Activity, Related payments, Files) beside a customer card.
 */
import {
  IconAlertTriangle,
  IconBuilding,
  IconCash,
  IconCopy,
  IconDotsVertical,
  IconDownload,
  IconFileTypePdf,
  IconMail,
  IconMapPin,
  IconPencil,
  IconPhoto,
  IconReceipt,
  IconSend,
  IconTrash,
  IconWallet,
} from '@tabler/icons-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { DescriptionList, EmptyState, PersonCell, StatusBadge, Timeline } from '../../components/data-display.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { ConfirmDialog } from '../../components/ui/dialog.tsx'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../../components/ui/menu.tsx'
import { Avatar, IconChip, Progress } from '../../components/ui/misc.tsx'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs.tsx'
import { toast } from '../../components/ui/toast.tsx'
import type { Tone } from '../../components/ui/tone.ts'
import { balanceOf, findInvoice, type Invoice } from '../../data/invoices.ts'
import { daysUntil, formatDate, formatMoney } from '../../lib/format.ts'
import { Link, navigate } from '../../lib/router.tsx'

function SummaryCard({ label, value, caption, tone, icon, children }: { readonly label: string; readonly value: string; readonly caption: ReactNode; readonly tone: Tone; readonly icon: ReactNode; readonly children?: ReactNode }): ReactElement {
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-xl border border-border/70 bg-card p-5 shadow-sm dark:border-border">
      <div className="flex items-center justify-between gap-3">
        <p className="text-label font-medium text-muted-foreground">{label}</p>
        <IconChip icon={icon} tone={tone} size="sm" />
      </div>
      <p className="text-2xl font-bold tracking-tight text-foreground tabular">{value}</p>
      <div className="text-xs text-muted-foreground">{caption}</div>
      {children}
    </section>
  )
}

function dueCaption(invoice: Invoice): { readonly text: string; readonly tone: Tone } {
  if (invoice.status === 'paid') return { text: 'Paid in full', tone: 'success' }
  const days = daysUntil(invoice.dueAt)
  if (days < 0) return { text: `${-days} days overdue`, tone: 'danger' }
  if (days === 0) return { text: 'Due today', tone: 'warning' }
  return { text: `Due in ${days} days`, tone: days <= 7 ? 'warning' : 'info' }
}

/** Mock payments derived from the invoice (for the Related tab). */
function paymentsOf(invoice: Invoice): readonly { readonly id: string; readonly date: Date; readonly amount: number; readonly method: string; readonly status: 'Succeeded' | 'Failed' }[] {
  if (invoice.paid === 0) return invoice.status === 'overdue' ? [{ id: 'PAY-90412', date: invoice.dueAt, amount: invoice.amount, method: invoice.method, status: 'Failed' }] : []
  const first = invoice.status === 'paid' ? invoice.paid : Math.round(invoice.paid * 0.6)
  const rows = [{ id: 'PAY-88231', date: new Date(invoice.issuedAt.getTime() + 6 * 86_400_000), amount: first, method: invoice.method, status: 'Succeeded' as const }]
  if (invoice.paid - first > 0) rows.push({ id: 'PAY-89107', date: new Date(invoice.issuedAt.getTime() + 15 * 86_400_000), amount: invoice.paid - first, method: 'Bank transfer', status: 'Succeeded' as const })
  return rows
}

export function InvoiceDetailPage({ invoiceId }: { readonly invoiceId: string }): ReactElement {
  const invoice = findInvoice(invoiceId)
  const [confirmOpen, setConfirmOpen] = useState(false)
  if (invoice === undefined) {
    return (
      <Card>
        <EmptyState title={`Invoice ${invoiceId} not found`} description="It may have been deleted, or the link is mistyped." action={<Button asChild variant="primary"><Link to="/invoices">Back to invoices</Link></Button>} />
      </Card>
    )
  }
  const percent = Math.round((invoice.paid / invoice.amount) * 100)
  const due = dueCaption(invoice)
  const subtotal = invoice.amount
  const remind = (): void => toast({ tone: 'success', title: 'Reminder sent', description: `${invoice.customer.contact} will get a payment link by email.` })

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Billing' }, { label: 'Invoices', to: '/invoices' }, { label: invoice.id }]}
        back="/invoices"
        title={invoice.id}
        badge={<StatusBadge status={invoice.status} />}
        description={`${invoice.customer.name} · issued ${formatDate(invoice.issuedAt)}`}
        actions={
          <>
            <Button variant="soft" onClick={remind} disabled={invoice.status === 'paid'}>
              <IconSend /> Send reminder
            </Button>
            <Button asChild variant="primary">
              <Link to={`/invoices/${invoice.id}/edit`}>
                <IconPencil /> Edit
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions" className="max-sm:flex-none">
                  <IconDotsVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => toast({ tone: 'success', title: 'PDF downloading' })}>
                  <IconDownload /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toast({ tone: 'success', title: 'Payment recorded', description: 'Balance updated.' })}>
                  <IconCash /> Record payment
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate('/invoices/new')}>
                  <IconCopy /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="danger" onSelect={() => setConfirmOpen(true)}>
                  <IconTrash /> Delete invoice
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 sm:gap-6 xl:grid-cols-4">
        <SummaryCard label="Invoice total" value={formatMoney(invoice.amount)} caption={`${invoice.items.length} line items · incl. tax`} tone="primary" icon={<IconReceipt />} />
        <SummaryCard label="Collected" value={formatMoney(invoice.paid)} caption={`${percent}% of the total`} tone="success" icon={<IconWallet />}>
          <Progress value={percent} tone="success" label={`${percent}% collected`} />
        </SummaryCard>
        <SummaryCard label="Balance due" value={formatMoney(balanceOf(invoice))} caption={invoice.method} tone="warning" icon={<IconCash />} />
        <SummaryCard label="Due date" value={formatDate(invoice.dueAt)} caption={<Badge tone={due.tone}>{due.text}</Badge>} tone={due.tone} icon={<IconAlertTriangle />} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card className="min-w-0 pt-2 sm:pt-2">
          <Tabs defaultValue="overview">
            <TabsList variant="line" className="px-3 sm:px-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
              <TabsTrigger value="related">
                Payments <Badge tone="primary" className="h-5 px-1.5">{paymentsOf(invoice).length}</Badge>
              </TabsTrigger>
              <TabsTrigger value="files">Files</TabsTrigger>
            </TabsList>
            <TabsContent value="overview" className="flex flex-col gap-8 px-5 pt-6 sm:px-6">
              <DescriptionList
                items={[
                  { label: 'Invoice number', value: invoice.id },
                  { label: 'Customer', value: invoice.customer.name },
                  { label: 'Issue date', value: formatDate(invoice.issuedAt) },
                  { label: 'Due date', value: formatDate(invoice.dueAt) },
                  { label: 'Payment method', value: invoice.method },
                  { label: 'Owner', value: <span className="inline-flex items-center gap-2"><Avatar name={invoice.owner.name} tone={invoice.owner.tone} size="xs" />{invoice.owner.name}</span> },
                  { label: 'Reminders', value: 'Automatic · next on Nov 17' },
                  { label: 'Tags', value: invoice.tags.length === 0 ? '—' : <span className="flex flex-wrap gap-1.5">{invoice.tags.map((tag) => <Badge key={tag} tone="primary">{tag}</Badge>)}</span> },
                ]}
              />
              <div className="min-w-0">
                <h3 className="mb-3 text-sm font-semibold">Line items</h3>
                <div className="scrollbar-thin relative overflow-x-auto rounded-lg border border-border">
                  <table className="w-full min-w-[32rem] text-sm">
                    <thead>
                      <tr className="bg-muted text-left text-overline font-semibold uppercase text-muted-foreground">
                        <th scope="col" className="px-4 py-2.5 font-semibold">Item</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Qty</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Unit price</th>
                        <th scope="col" className="px-4 py-2.5 text-right font-semibold">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.items.map((item) => (
                        <tr key={item.description} className="border-t border-border">
                          <td className="px-4 py-3 font-medium">{item.description}</td>
                          <td className="px-4 py-3 text-right tabular">{item.quantity}</td>
                          <td className="px-4 py-3 text-right tabular">{formatMoney(item.unitPrice)}</td>
                          <td className="px-4 py-3 text-right font-semibold tabular">{formatMoney(item.quantity * item.unitPrice)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-border bg-muted/50">
                        <th scope="row" colSpan={3} className="px-4 py-3 text-right font-semibold">
                          Total
                        </th>
                        <td className="px-4 py-3 text-right text-base font-bold tabular">{formatMoney(subtotal)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="activity" className="px-5 pt-6 sm:px-6">
              <Timeline
                entries={[
                  ...(invoice.paid > 0 ? [{ id: 'paid', tone: 'success' as const, icon: <IconCash />, title: <><strong className="font-semibold">Payment received</strong> · {formatMoney(invoice.paid)}</>, time: formatDate(new Date(invoice.issuedAt.getTime() + 6 * 86_400_000)), body: `Received by ${invoice.method.toLowerCase()} and matched automatically.` }] : []),
                  { id: 'reminder', tone: 'warning', icon: <IconSend />, title: <><strong className="font-semibold">Reminder sent</strong> to {invoice.customer.contact}</>, time: formatDate(new Date(invoice.issuedAt.getTime() + 4 * 86_400_000)) },
                  { id: 'viewed', tone: 'info', icon: <IconMail />, title: <><strong className="font-semibold">{invoice.customer.contact}</strong> viewed the invoice</>, time: formatDate(new Date(invoice.issuedAt.getTime() + 86_400_000)), body: 'Opened from the email on Chrome · Windows.' },
                  { id: 'sent', tone: 'primary', icon: <IconSend />, title: <><strong className="font-semibold">{invoice.owner.name}</strong> sent the invoice</>, time: formatDate(invoice.issuedAt) },
                  { id: 'created', tone: 'neutral', icon: <IconReceipt />, title: <><strong className="font-semibold">{invoice.owner.name}</strong> created the invoice</>, time: formatDate(invoice.issuedAt) },
                ]}
              />
            </TabsContent>
            <TabsContent value="related" className="pt-4">
              {paymentsOf(invoice).length === 0 ? (
                <EmptyState title="No payments yet" description="Payments show up here as soon as the customer pays, or when you record one." />
              ) : (
                <div className="scrollbar-thin relative overflow-x-auto">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead>
                      <tr className="border-y border-border bg-muted text-left text-overline font-semibold uppercase text-muted-foreground">
                        <th scope="col" className="py-2.5 pl-5 pr-3 font-semibold sm:pl-6">Payment</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Date</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold">Method</th>
                        <th scope="col" className="px-3 py-2.5 text-right font-semibold">Amount</th>
                        <th scope="col" className="py-2.5 pl-3 pr-5 font-semibold sm:pr-6">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paymentsOf(invoice).map((payment) => (
                        <tr key={payment.id} className="border-b border-border last:border-b-0">
                          <td className="py-3 pl-5 pr-3 font-semibold sm:pl-6">{payment.id}</td>
                          <td className="px-3 py-3 text-muted-foreground">{formatDate(payment.date)}</td>
                          <td className="px-3 py-3">{payment.method}</td>
                          <td className="px-3 py-3 text-right font-semibold tabular">{formatMoney(payment.amount)}</td>
                          <td className="py-3 pl-3 pr-5 sm:pr-6">
                            <Badge tone={payment.status === 'Succeeded' ? 'success' : 'danger'} dot>
                              {payment.status}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
            <TabsContent value="files" className="grid gap-4 px-5 pt-6 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
              {[
                { name: `${invoice.id}.pdf`, size: '184 KB', kind: 'pdf' },
                { name: 'purchase-order-7731.pdf', size: '248 KB', kind: 'pdf' },
                { name: 'signed-contract.png', size: '1.2 MB', kind: 'image' },
              ].map((file) => (
                <div key={file.name} className="group flex flex-col overflow-hidden rounded-lg border border-border transition-shadow hover:shadow-md">
                  <div className={`grid h-28 place-items-center ${file.kind === 'pdf' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info'}`}>
                    {file.kind === 'pdf' ? <IconFileTypePdf aria-hidden className="size-10" stroke={1.5} /> : <IconPhoto aria-hidden className="size-10" stroke={1.5} />}
                  </div>
                  <div className="flex items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{file.name}</p>
                      <p className="text-xs text-muted-foreground">{file.size}</p>
                    </div>
                    <Button variant="ghost" size="icon-sm" aria-label={`Download ${file.name}`} onClick={() => toast({ tone: 'success', title: `Downloading ${file.name}` })}>
                      <IconDownload />
                    </Button>
                  </div>
                </div>
              ))}
            </TabsContent>
          </Tabs>
        </Card>

        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Customer</CardTitle>
              <Button variant="link" size="sm" onClick={() => toast({ tone: 'info', title: 'Customer profile', description: 'Customers are not part of this mockup.' })}>
                View
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <PersonCell name={invoice.customer.name} secondary={`${invoice.customer.contact}, billing contact`} tone={invoice.customer.tone} />
              <ul className="flex flex-col gap-3 text-sm">
                <li className="flex items-center gap-3"><IconMail aria-hidden className="size-4.5 text-muted-foreground" /><span className="truncate">{invoice.customer.email}</span></li>
                <li className="flex items-center gap-3"><IconMapPin aria-hidden className="size-4.5 text-muted-foreground" />{invoice.customer.country}</li>
                <li className="flex items-center gap-3"><IconBuilding aria-hidden className="size-4.5 text-muted-foreground" />Customer since 2024 · 14 invoices</li>
              </ul>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/70 p-3">
                  <p className="text-xs text-muted-foreground">Lifetime value</p>
                  <p className="mt-0.5 text-base font-bold tabular">$86,420</p>
                </div>
                <div className="rounded-lg bg-muted/70 p-3">
                  <p className="text-xs text-muted-foreground">Avg. days to pay</p>
                  <p className="mt-0.5 text-base font-bold tabular">12.6</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-brand-gradient text-primary-foreground border-transparent dark:border-transparent">
            <CardContent className="flex flex-col gap-3">
              <p className="text-label text-primary-foreground/85">Collect faster</p>
              <p className="text-lg font-semibold leading-6">Turn on card payments and get paid 9 days sooner on average.</p>
              <Button className="mt-1 self-start bg-primary-foreground text-primary hover:bg-primary-foreground/90" onClick={() => toast({ tone: 'success', title: 'Card payments enabled' })}>
                Enable card payments
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete ${invoice.id}?`}
        description={`The invoice to ${invoice.customer.name} (${formatMoney(invoice.amount)}) moves to Trash and is removed for good after 30 days.`}
        confirmLabel="Delete invoice"
        onConfirm={() => {
          toast({ tone: 'success', title: `${invoice.id} deleted`, description: 'You can restore it from Trash for 30 days.' })
          navigate('/invoices')
        }}
      />
    </>
  )
}
