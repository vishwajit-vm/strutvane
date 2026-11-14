/**
 * The invoice detail tabs. Overview is a near-opaque "document" (long text and numbers must not
 * depend on the backdrop); Activity, Related and Files reuse the shared list patterns.
 */
import { IconCash, IconDownload, IconEye, IconFileTypePdf, IconMail, IconMessageCircle, IconPencil, IconPhoto, IconSend } from '@tabler/icons-react'
import { Link } from 'react-router'
import { EmptyState, StatusBadge } from '../../../components/data-display.tsx'
import { EmptyInvoicesArt } from '../../../components/illustrations.tsx'
import { Avatar } from '../../../components/ui/avatar.tsx'
import { Badge } from '../../../components/ui/badge.tsx'
import { Button } from '../../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../../components/ui/card.tsx'
import type { Invoice } from '../../../data/invoices.ts'
import { cn } from '../../../lib/cn.ts'
import { formatDate, formatMoney, formatTime } from '../../../lib/format.ts'

export function OverviewTab({ invoice }: { invoice: Invoice }) {
  const subtotal = invoice.total - invoice.tax
  return (
    <div className="grid items-start gap-5 xl:grid-cols-12">
      <Card material="solid" className="xl:col-span-8">
        <CardHeader title="Line items" description={`${invoice.items.length} ${invoice.items.length === 1 ? 'item' : 'items'}`} />
        <div className="scroll-thin overflow-x-auto">
          <table className="w-full min-w-[34rem] text-base">
            <thead>
              <tr className="border-y border-border bg-surface-muted text-left text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase">
                <th scope="col" className="py-2.5 pr-3 pl-6">
                  Description
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Qty
                </th>
                <th scope="col" className="px-3 py-2.5 text-right">
                  Unit price
                </th>
                <th scope="col" className="py-2.5 pr-6 pl-3 text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, index) => (
                <tr key={`${item.description}-${String(index)}`} className="border-b border-border">
                  <td className="py-3.5 pr-3 pl-6 font-medium text-fg">{item.description}</td>
                  <td className="px-3 py-3.5 text-right text-fg-muted tabular">{item.quantity.toLocaleString('en-US')}</td>
                  <td className="px-3 py-3.5 text-right text-fg-muted tabular">{formatMoney(item.unitPrice)}</td>
                  <td className="py-3.5 pr-6 pl-3 text-right font-semibold text-fg tabular">{formatMoney(item.quantity * item.unitPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto w-full max-w-xs space-y-2 px-6 py-5 text-base">
          <div className="flex justify-between text-fg-muted">
            <dt>Subtotal</dt>
            <dd className="tabular">{formatMoney(subtotal)}</dd>
          </div>
          <div className="flex justify-between text-fg-muted">
            <dt>Tax (8%)</dt>
            <dd className="tabular">{formatMoney(invoice.tax)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-2 text-lg font-bold text-fg">
            <dt>Total</dt>
            <dd className="tabular">{formatMoney(invoice.total)}</dd>
          </div>
        </dl>
      </Card>
      <div className="flex flex-col gap-5 xl:col-span-4">
        <Card material="solid">
          <CardHeader title="Details" />
          <CardBody>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-base xl:grid-cols-1 2xl:grid-cols-2">
              <Detail label="Invoice number" value={<span className="font-mono">{invoice.number}</span>} />
              <Detail label="Status" value={<StatusBadge status={invoice.status} />} />
              <Detail label="Issued" value={formatDate(invoice.issuedAt)} />
              <Detail label="Due" value={formatDate(invoice.dueAt)} />
              <Detail label="Contact" value={invoice.customer.contact} />
              <Detail label="E-mail" value={<a href={`mailto:${invoice.customer.email}`} className="break-all text-primary-text hover:underline">{invoice.customer.email}</a>} />
              <Detail label="Owner" value={<span className="flex items-center gap-2"><Avatar name={invoice.owner.name} size="xs" />{invoice.owner.name}</span>} />
              <Detail
                label="Tags"
                value={
                  invoice.tags.length === 0 ? (
                    <span className="text-fg-muted">None</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {invoice.tags.map((tag) => (
                        <Badge key={tag} tone="primary">
                          {tag}
                        </Badge>
                      ))}
                    </span>
                  )
                }
              />
            </dl>
          </CardBody>
        </Card>
        <Card material="solid">
          <CardHeader title="Notes" />
          <CardBody>
            <p className="text-base leading-relaxed text-fg">{invoice.notes === '' ? 'No notes on this invoice.' : invoice.notes}</p>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-fg-muted">{label}</dt>
      <dd className="mt-1 font-medium text-fg">{value}</dd>
    </div>
  )
}

export function ActivityTab({ invoice }: { invoice: Invoice }) {
  const base = invoice.issuedAt
  const at = (days: number, hours: number): Date => new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 9 + hours, 15)
  const entries = [
    { icon: IconPencil, tone: 'bg-neutral-soft text-fg-muted', who: invoice.owner.name, what: 'created this invoice as a draft', when: at(0, 0) },
    { icon: IconSend, tone: 'bg-primary-soft text-primary-soft-fg', who: invoice.owner.name, what: `sent it to ${invoice.customer.email}`, when: at(0, 1) },
    { icon: IconEye, tone: 'bg-info-soft text-info', who: invoice.customer.contact, what: 'viewed the invoice', when: at(1, 3) },
    { icon: IconMessageCircle, tone: 'bg-info-soft text-info', who: 'Daniel Reyes', what: 'commented: “PO number confirmed by phone.”', when: at(2, 1) },
    { icon: IconMail, tone: 'bg-warning-soft text-warning', who: 'Automation', what: 'sent a payment reminder', when: at(5, 0) },
    { icon: IconCash, tone: 'bg-success-soft text-success', who: invoice.customer.name, what: invoice.status === 'paid' ? 'paid in full' : 'paid a partial amount', when: at(9, 2) },
  ]
  return (
    <Card material="solid" className="max-w-3xl">
      <CardBody className="pt-6">
        <ol className="relative flex flex-col gap-6 before:absolute before:top-2 before:bottom-2 before:left-[1.0625rem] before:w-px before:bg-border">
          {entries.map((entry, index) => (
            <li key={index} className="relative flex gap-4">
              <span className={cn('relative grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-surface', entry.tone)} aria-hidden>
                <entry.icon className="size-4" />
              </span>
              <div className="min-w-0 pt-1">
                <p className="text-base text-fg">
                  <span className="font-semibold">{entry.who}</span> {entry.what}
                </p>
                <p className="mt-0.5 text-xs text-fg-muted">
                  {formatDate(entry.when)} at {formatTime(entry.when)}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </CardBody>
    </Card>
  )
}

export function RelatedTab({ invoices, customerName }: { invoices: readonly Invoice[]; customerName: string }) {
  if (invoices.length === 0) {
    return (
      <Card material="solid">
        <EmptyState art={<EmptyInvoicesArt className="h-28" />} title="No other invoices" description={`This is the only invoice for ${customerName} so far.`} />
      </Card>
    )
  }
  return (
    <Card material="solid">
      <CardHeader title={`Other invoices for ${customerName}`} description={`${invoices.length} found`} />
      <ul className="divide-y divide-border border-t border-border">
        {invoices.slice(0, 8).map((other) => (
          <li key={other.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-6 py-3.5 transition-fast hover:bg-surface-hover">
            <Link to={`/invoices/${other.id}`} className="font-mono text-sm font-semibold text-primary-text hover:underline">
              {other.number}
            </Link>
            <span className="text-sm text-fg-muted">{formatDate(other.issuedAt)}</span>
            <StatusBadge status={other.status} className="sm:ml-auto" />
            <span className="w-28 text-right text-base font-semibold text-fg tabular">{formatMoney(other.total)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export function FilesTab({ invoice }: { invoice: Invoice }) {
  const files = [
    { name: `${invoice.number}.pdf`, size: '184 KB', kind: 'pdf' as const, by: invoice.owner.name },
    { name: 'purchase-order-48213.pdf', size: '96 KB', kind: 'pdf' as const, by: invoice.customer.contact },
    { name: 'delivery-photo.jpg', size: '1.2 MB', kind: 'image' as const, by: 'Daniel Reyes' },
  ]
  return (
    <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {files.map((file) => (
        <li key={file.name}>
          <Card interactive className="flex items-center gap-4 p-4">
            <span className={cn('grid size-12 shrink-0 place-items-center rounded-md', file.kind === 'pdf' ? 'bg-danger-soft text-danger' : 'bg-info-soft text-info')} aria-hidden>
              {file.kind === 'pdf' ? <IconFileTypePdf className="size-6" /> : <IconPhoto className="size-6" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold text-fg">{file.name}</p>
              <p className="truncate text-xs text-fg-muted">
                {file.size} · added by {file.by}
              </p>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Download ${file.name}`}>
              <IconDownload aria-hidden />
            </Button>
          </Card>
        </li>
      ))}
    </ul>
  )
}
