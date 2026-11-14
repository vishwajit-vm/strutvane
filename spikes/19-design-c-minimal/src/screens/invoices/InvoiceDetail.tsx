/**
 * Invoice detail: header with status and actions, a summary strip of the four numbers people
 * look for first, tabs (Overview, Activity, Related, Files) and a properties panel on the right.
 * The active tab lives in the URL (`?tab=activity`), so it survives reloads and can be linked.
 */
import { Copy, Download, Ellipsis, FileText, Link2, Mail, Pencil, Send, Sheet, Trash2, Ban } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { EmptyState } from '../../components/empty-state.tsx'
import { FileDrop } from '../../components/form/file-drop.tsx'
import { CustomerCell, DueLabel, InvoiceStatusBadge, Money } from '../../components/invoice-bits.tsx'
import { PageHeader } from '../../components/page-header.tsx'
import { PropertyList } from '../../components/property-list.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardHeader } from '../../components/ui/card.tsx'
import { Textarea } from '../../components/ui/input.tsx'
import { Menu, MenuContent, MenuItem, MenuSeparator } from '../../components/ui/menu.tsx'
import { Tabs, TabsList, TabsTrigger } from '../../components/ui/tabs.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { type ActivityItem, invoiceActivity, invoiceFiles } from '../../data/activity.ts'
import { type Invoice, invoiceById, invoicesForCustomer, lineItemsFor, TERMS_LABELS } from '../../data/invoices.ts'
import { me } from '../../data/people.ts'
import { formatBytes, formatDate, formatDue, formatMoney, formatRelative } from '../../lib/format.ts'
import { Link, useRouter, withParams } from '../../lib/router.tsx'
import { PageContainer } from '../../shell/AppShell.tsx'
import { useOverlays } from '../../shell/overlays.tsx'
import { ActivityTimeline } from '../dashboard/Panels.tsx'
import { NotFound } from '../NotFound.tsx'

type Tab = 'overview' | 'activity' | 'related' | 'files'
const TABS: readonly Tab[] = ['overview', 'activity', 'related', 'files']

export function InvoiceDetail({ id }: { id: string }) {
  const invoice = invoiceById(id)
  if (invoice === undefined) return <NotFound />
  return <DetailScreen invoice={invoice} />
}

/** One cell of the summary strip: small label over a strong value. */
function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 bg-surface px-4 py-3">
      <dt className="text-xs text-fg-subtle">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-fg">{children}</dd>
    </div>
  )
}

function DetailScreen({ invoice }: { invoice: Invoice }) {
  const { search, pathname, navigate } = useRouter()
  const { confirm } = useOverlays()
  const toast = useToast()
  const requested = search.get('tab')
  const tab: Tab = TABS.find((candidate) => candidate === requested) ?? 'overview'
  const related = invoicesForCustomer(invoice.customer.id).filter((other) => other.id !== invoice.id)

  const remove = async () => {
    const ok = await confirm({
      title: `Delete ${invoice.number}?`,
      description: `The invoice and its ${invoiceFiles.length} files move to the trash for 30 days. ${invoice.customer.name} keeps any copy already sent.`,
      confirmLabel: 'Delete invoice',
    })
    if (!ok) return
    toast({ title: `${invoice.number} deleted`, description: 'Moved to the trash.', action: { label: 'Undo', onClick: () => navigate(`/invoices/${invoice.id}`) } })
    navigate('/invoices')
  }

  return (
    <PageContainer>
      <PageHeader
        breadcrumbs={[{ label: 'Invoices', to: '/invoices' }, { label: invoice.number }]}
        back="/invoices"
        title={<span className="num tracking-(--tracking-title)">{invoice.number}</span>}
        meta={<InvoiceStatusBadge status={invoice.status} />}
        actions={
          <>
            <Button onClick={() => toast({ title: 'Reminder sent', description: `${invoice.customer.contact} gets a polite nudge with a payment link.`, tone: 'info' })}>
              <Mail aria-hidden /> <span className="max-sm:hidden">Send reminder</span>
            </Button>
            <Button asChild>
              <Link to={`/invoices/${invoice.id}/edit`}>
                <Pencil aria-hidden /> Edit
              </Link>
            </Button>
            <Button variant="primary" onClick={() => toast({ title: 'Payment recorded', description: `${formatMoney(invoice.amount, invoice.currency)} marked as received.` })}>
              Record payment
            </Button>
            <Menu.Root>
              <Menu.Trigger asChild>
                <Button size="icon" aria-label="More actions">
                  <Ellipsis aria-hidden />
                </Button>
              </Menu.Trigger>
              <MenuContent align="end" className="w-52">
                <MenuItem>
                  <Download aria-hidden /> Download PDF
                </MenuItem>
                <MenuItem onSelect={() => toast({ title: 'Link copied', description: 'Anyone in Northwind Labs can open it.', tone: 'info' })}>
                  <Link2 aria-hidden /> Copy link
                </MenuItem>
                <MenuItem onSelect={() => navigate('/invoices/new')}>
                  <Copy aria-hidden /> Duplicate
                </MenuItem>
                <MenuItem>
                  <Ban aria-hidden /> Void invoice
                </MenuItem>
                <MenuSeparator />
                <MenuItem destructive onSelect={() => void remove()}>
                  <Trash2 aria-hidden /> Delete
                </MenuItem>
              </MenuContent>
            </Menu.Root>
          </>
        }
      />

      <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        <Stat label="Amount due">
          <Money invoice={invoice} className="text-base font-medium tracking-(--tracking-title)" />
        </Stat>
        <Stat label="Due">
          {formatDate(invoice.dueAt)} <span className="font-normal text-fg-subtle">· {formatDue(invoice.dueAt).replace('Due ', '')}</span>
        </Stat>
        <Stat label="Customer">
          <Link to={withParams(search, { tab: 'related' }) || pathname} className="hover:underline">
            {invoice.customer.name}
          </Link>
        </Stat>
        <Stat label="Owner">
          <span className="flex items-center gap-2">
            <Avatar name={invoice.owner.name} tint={invoice.owner.tint} size="xs" />
            {invoice.owner.name}
          </span>
        </Stat>
      </dl>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Tabs.Root value={tab} onValueChange={(value) => navigate(`${pathname}${withParams(search, { tab: value === 'overview' ? null : value })}`, { replace: true })} className="min-w-0">
          <TabsList aria-label="Invoice sections">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="activity" count={invoiceActivity.length}>
              Activity
            </TabsTrigger>
            <TabsTrigger value="related" count={related.length}>
              Related
            </TabsTrigger>
            <TabsTrigger value="files" count={invoiceFiles.length}>
              Files
            </TabsTrigger>
          </TabsList>
          <Tabs.Content value="overview" className="pt-5 outline-none">
            <Overview invoice={invoice} />
          </Tabs.Content>
          <Tabs.Content value="activity" className="pt-5 outline-none">
            <ActivityTab />
          </Tabs.Content>
          <Tabs.Content value="related" className="pt-5 outline-none">
            <RelatedTab invoices={related} customer={invoice.customer.name} />
          </Tabs.Content>
          <Tabs.Content value="files" className="pt-5 outline-none">
            <FilesTab />
          </Tabs.Content>
        </Tabs.Root>
        <PropertiesPanel invoice={invoice} />
      </div>
    </PageContainer>
  )
}

function Overview({ invoice }: { invoice: Invoice }) {
  const { items, subtotal, tax } = lineItemsFor(invoice)
  const money = (minor: number) => formatMoney(minor, invoice.currency)
  return (
    <div className="flex flex-col gap-6">
      <Card className="overflow-hidden">
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <caption className="sr-only">Line items</caption>
            <thead>
              <tr className="h-9 border-b border-border bg-subtle/60 text-left text-xs text-fg-muted">
                <th scope="col" className="pl-4 font-medium">
                  Description
                </th>
                <th scope="col" className="w-16 text-right font-medium">
                  Qty
                </th>
                <th scope="col" className="w-36 text-right font-medium">
                  Unit price
                </th>
                <th scope="col" className="w-36 pr-4 text-right font-medium">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item) => (
                <tr key={item.description} className="h-12">
                  <td className="pl-4 text-fg">{item.description}</td>
                  <td className="num text-right text-fg-muted">{item.quantity}</td>
                  <td className="num text-right text-fg-muted">{money(item.unitPrice)}</td>
                  <td className="num pr-4 text-right text-fg">{money(item.unitPrice * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto flex w-full max-w-xs flex-col gap-1.5 border-t border-border px-4 py-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-fg-muted">Subtotal</dt>
            <dd className="num text-fg">{money(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-fg-muted">VAT 21%</dt>
            <dd className="num text-fg">{money(tax)}</dd>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-border pt-2.5">
            <dt className="font-medium text-fg">Total</dt>
            <dd className="num font-semibold text-fg">{money(invoice.amount)}</dd>
          </div>
        </dl>
      </Card>
      <Card>
        <CardHeader title="Notes to customer" as="h3" />
        <p className="px-4 pb-4 text-sm text-fg-muted">Thank you for your business. Payment by SEPA transfer to the account on the invoice; please quote {invoice.number} as the reference.</p>
      </Card>
    </div>
  )
}

function ActivityTab() {
  const [items, setItems] = useState<readonly ActivityItem[]>(invoiceActivity)
  const [draft, setDraft] = useState('')
  const post = () => {
    if (draft.trim() === '') return
    setItems((current) => [{ id: `c${current.length}`, kind: 'commented', actor: me, text: `commented: “${draft.trim()}”`, at: '2026-11-14T09:30:00Z' }, ...current])
    setDraft('')
  }
  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-3">
        <Avatar name={me.name} tint={me.tint} size="sm" className="mt-1" />
        <div className="min-w-0 flex-1 rounded-lg border border-input bg-surface shadow-xs focus-within:border-accent focus-within:ring-3 focus-within:ring-ring/20">
          <Textarea
            aria-label="Add a comment"
            rows={2}
            placeholder="Add a comment… Use @ to mention a teammate."
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) post()
            }}
            className="resize-none border-0 shadow-none focus-visible:ring-0"
          />
          <div className="flex items-center justify-between px-2.5 pb-2">
            <span className="text-xs text-fg-subtle">Ctrl + Enter to post</span>
            <Button size="sm" variant="primary" disabled={draft.trim() === ''} onClick={post}>
              <Send aria-hidden /> Comment
            </Button>
          </div>
        </div>
      </div>
      <ActivityTimeline items={items} />
    </div>
  )
}

function RelatedTab({ invoices, customer }: { invoices: readonly Invoice[]; customer: string }) {
  if (invoices.length === 0) return <EmptyState illustration="invoices" title="No other invoices" description={`This is the only invoice for ${customer}.`} />
  return (
    <Card className="overflow-hidden">
      <CardHeader title={`Other invoices for ${customer}`} as="h3" description={`${invoices.length} invoices, newest first`} />
      <ul className="divide-y divide-border border-t border-border">
        {invoices.slice(0, 8).map((other) => (
          <li key={other.id}>
            <Link to={`/invoices/${other.id}`} className="flex h-12 items-center gap-4 px-4 text-sm outline-offset-[-2px] hover:bg-subtle/70">
              <span className="num w-20 font-medium text-fg">{other.number}</span>
              <InvoiceStatusBadge status={other.status} />
              <span className="flex-1 text-fg-muted max-sm:hidden">{formatDate(other.issuedAt)}</span>
              <Money invoice={other} className="ml-auto" />
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function FilesTab() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-hidden">
        <ul className="divide-y divide-border">
          {invoiceFiles.map((file) => (
            <li key={file.id} className="flex items-center gap-3 px-4 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-subtle text-fg-muted">
                {file.kind === 'sheet' ? <Sheet aria-hidden className="size-4" /> : <FileText aria-hidden className="size-4" />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{file.name}</p>
                <p className="truncate text-xs text-fg-subtle">
                  {formatBytes(file.size)} · {file.uploadedBy.name} · {formatRelative(file.at)}
                </p>
              </div>
              <Button variant="ghost" size="icon-sm" aria-label={`Download ${file.name}`}>
                <Download aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      </Card>
      <FileDrop accept={['application/pdf', 'image/png', 'image/jpeg']} maxBytes={10 * 1024 * 1024} label="Add files to this invoice" />
    </div>
  )
}

function PropertiesPanel({ invoice }: { invoice: Invoice }) {
  const paidShare = invoice.status === 'paid' ? 100 : 0
  return (
    <aside aria-label="Properties" className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Properties" as="h2" />
        <PropertyList
          className="px-4 pb-3"
          items={[
            { label: 'Status', value: <InvoiceStatusBadge status={invoice.status} /> },
            { label: 'Due', value: <DueLabel invoice={invoice} /> },
            { label: 'Issued', value: formatDate(invoice.issuedAt) },
            { label: 'Terms', value: TERMS_LABELS[invoice.terms] },
            { label: 'Currency', value: invoice.currency },
            { label: 'Reference', value: <span className="num">PO-88213</span> },
            {
              label: 'Tags',
              value:
                invoice.tags.length === 0 ? (
                  <span className="text-fg-subtle">None</span>
                ) : (
                  <span className="flex flex-wrap gap-1">
                    {invoice.tags.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </span>
                ),
            },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Payment" as="h2" description={paidShare === 100 ? 'Paid in full' : 'No payments yet'} />
        <div className="px-4 pb-4">
          <div className="flex items-baseline justify-between text-sm">
            <span className="num text-fg">{formatMoney((invoice.amount * paidShare) / 100, invoice.currency)}</span>
            <span className="num text-fg-subtle">of {formatMoney(invoice.amount, invoice.currency)}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label="Paid" aria-valuenow={paidShare} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full rounded-full bg-success" style={{ width: `${paidShare}%` }} />
          </div>
          <p className="mt-3 text-xs text-fg-subtle">Reminders on · next on {formatDate('2026-11-17T08:00:00Z')}</p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Customer" as="h2" />
        <div className="flex flex-col gap-3 px-4 pb-4">
          <CustomerCell invoice={invoice} />
          <p className="truncate text-sm text-fg-muted">{invoice.customer.email}</p>
          <p className="text-sm text-fg-muted">{invoice.customer.country}</p>
        </div>
      </Card>
    </aside>
  )
}
