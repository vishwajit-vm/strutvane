/**
 * Invoice detail: header (number, status, actions), four summary cards, then tabs: Overview
 * (fields, line items, notes), Activity (timeline), Related (other invoices for the customer)
 * and Files.
 */
import { IconCash, IconCopy, IconDots, IconDownload, IconPencil, IconPrinter, IconSend, IconTrash } from '@tabler/icons-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { StatusBadge, TrendChip } from '../../../components/data-display.tsx'
import { PageHeader } from '../../../components/PageHeader.tsx'
import { Avatar } from '../../../components/ui/avatar.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Card } from '../../../components/ui/card.tsx'
import { useConfirm } from '../../../components/ui/confirm.tsx'
import { DropdownMenu, MenuContent, MenuItem, MenuSeparator } from '../../../components/ui/menu.tsx'
import { Progress, TabPanel, Tabs } from '../../../components/ui/misc.tsx'
import { useToast } from '../../../components/ui/toast.tsx'
import { findInvoice, INVOICES, type Invoice } from '../../../data/invoices.ts'
import { formatDate, formatMoney } from '../../../lib/format.ts'
import { NotFoundPage } from '../../NotFoundPage.tsx'
import { collectedRatio, dueLabel } from '../list/list-state.ts'
import { ActivityTab, FilesTab, OverviewTab, RelatedTab } from './tabs.tsx'

export function InvoiceDetailPage() {
  const { id } = useParams()
  const invoice = findInvoice(id)
  if (invoice === undefined) return <NotFoundPage />
  return <InvoiceDetail key={invoice.id} invoice={invoice} />
}

function InvoiceDetail({ invoice }: { invoice: Invoice }) {
  const navigate = useNavigate()
  const toast = useToast()
  const confirm = useConfirm()
  const [tab, setTab] = useState('overview')
  const related = INVOICES.filter((other) => other.customer.id === invoice.customer.id && other.id !== invoice.id)
  const ratio = collectedRatio(invoice)
  const due = dueLabel(invoice)
  const open = invoice.status === 'pending' || invoice.status === 'overdue'

  const remove = async (): Promise<void> => {
    const ok = await confirm({ title: `Delete ${invoice.number}?`, description: 'It moves to the trash for 30 days. The customer keeps any copy already sent.', confirmLabel: 'Delete invoice', destructive: true })
    if (!ok) return
    toast({ title: `${invoice.number} deleted`, description: 'Restore it from the trash within 30 days.' })
    void navigate('/invoices')
  }

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Invoices', to: '/invoices' }, { label: invoice.number }]}
        back="/invoices"
        title={<span className="font-mono tracking-tight">{invoice.number}</span>}
        meta={<StatusBadge status={invoice.status} className="h-7 px-3 text-sm" />}
        description={
          <>
            Billed to <strong className="font-semibold text-fg">{invoice.customer.name}</strong> on {formatDate(invoice.issuedAt)} · owned by {invoice.owner.name}
          </>
        }
        actions={
          <>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <Button variant="secondary" size="icon" aria-label="More actions">
                  <IconDots aria-hidden />
                </Button>
              </DropdownMenu.Trigger>
              <MenuContent align="end">
                <MenuItem icon={<IconDownload />} onSelect={() => toast({ title: 'PDF downloading', tone: 'info' })}>
                  Download PDF
                </MenuItem>
                <MenuItem icon={<IconPrinter />}>Print</MenuItem>
                <MenuItem icon={<IconCopy />} onSelect={() => toast({ title: `${invoice.number} duplicated`, description: 'Saved as a draft.' })}>
                  Duplicate
                </MenuItem>
                <MenuSeparator />
                <MenuItem icon={<IconTrash />} destructive onSelect={() => void remove()}>
                  Delete
                </MenuItem>
              </MenuContent>
            </DropdownMenu.Root>
            <Button variant="secondary" asChild>
              <Link to={`/invoices/${invoice.id}/edit`}>
                <IconPencil aria-hidden /> Edit
              </Link>
            </Button>
            {open ? (
              <Button onClick={() => toast({ title: 'Payment recorded', description: `${formatMoney(invoice.total)} from ${invoice.customer.name}.` })}>
                <IconCash aria-hidden /> Record payment
              </Button>
            ) : (
              <Button onClick={() => toast({ title: 'Receipt sent', description: `A copy went to ${invoice.customer.email}.` })}>
                <IconSend aria-hidden /> Send receipt
              </Button>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Amount">
          <p className="text-2xl font-bold tracking-tight text-fg tabular">{formatMoney(invoice.total)}</p>
          <p className="mt-1 text-xs text-fg-muted">incl. {formatMoney(invoice.tax)} tax</p>
        </SummaryCard>
        <SummaryCard label="Collected">
          <p className="text-2xl font-bold tracking-tight text-fg tabular">{formatMoney(invoice.total * ratio)}</p>
          <div className="mt-2 flex items-center gap-2.5">
            <Progress value={ratio * 100} tone={ratio === 1 ? 'success' : 'primary'} label={`${Math.round(ratio * 100)}% collected`} className="flex-1" />
            <span className="text-xs font-semibold text-fg-muted tabular">{Math.round(ratio * 100)}%</span>
          </div>
        </SummaryCard>
        <SummaryCard label="Due date">
          <p className="text-2xl font-bold tracking-tight text-fg">{formatDate(invoice.dueAt)}</p>
          <p className={due.late ? 'mt-1 text-xs font-semibold text-danger' : 'mt-1 text-xs text-fg-muted'}>{due.text}</p>
        </SummaryCard>
        <SummaryCard label="Customer">
          <div className="flex items-center gap-3">
            <Avatar name={invoice.customer.name} shape="square" size="md" />
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-fg">{invoice.customer.name}</p>
              <p className="flex items-center gap-1.5 text-xs text-fg-muted">
                Pays in 16 days avg. <TrendChip delta={-0.08} upIsGood={false} className="h-4.5 px-1.5 text-2xs" />
              </p>
            </div>
          </div>
        </SummaryCard>
      </div>

      <Tabs
        className="mt-6"
        value={tab}
        onValueChange={setTab}
        aria-label="Invoice sections"
        tabs={[
          { value: 'overview', label: 'Overview' },
          { value: 'activity', label: 'Activity', count: 6 },
          { value: 'related', label: 'Related', count: related.length },
          { value: 'files', label: 'Files', count: 3 },
        ]}
      >
        <TabPanel value="overview">
          <OverviewTab invoice={invoice} />
        </TabPanel>
        <TabPanel value="activity">
          <ActivityTab invoice={invoice} />
        </TabPanel>
        <TabPanel value="related">
          <RelatedTab invoices={related} customerName={invoice.customer.name} />
        </TabPanel>
        <TabPanel value="files">
          <FilesTab invoice={invoice} />
        </TabPanel>
      </Tabs>
    </>
  )
}

function SummaryCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="p-5">
      <h2 className="mb-2 text-sm font-semibold text-fg-muted">{label}</h2>
      {children}
    </Card>
  )
}
