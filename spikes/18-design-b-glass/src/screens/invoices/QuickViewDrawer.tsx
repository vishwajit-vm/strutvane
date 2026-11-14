/**
 * Quick-view drawer: peek at an invoice from the list without leaving it (glass sheet from the
 * right). Shows the essentials and links to the full page.
 */
import { IconExternalLink, IconPencil, IconSend } from '@tabler/icons-react'
import { Link } from 'react-router'
import { StatusBadge } from '../../components/data-display.tsx'
import { Avatar } from '../../components/ui/avatar.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Sheet } from '../../components/ui/dialog.tsx'
import { Progress } from '../../components/ui/misc.tsx'
import type { Invoice } from '../../data/invoices.ts'
import { formatDate, formatMoney } from '../../lib/format.ts'
import { collectedRatio, dueLabel } from './list/list-state.ts'

export function QuickViewDrawer({ invoice, onOpenChange, onRemind }: { invoice: Invoice | null; onOpenChange: (open: boolean) => void; onRemind?: (invoice: Invoice) => void }) {
  if (invoice === null) return <Sheet open={false} onOpenChange={onOpenChange} title="" />
  const ratio = collectedRatio(invoice)
  const due = dueLabel(invoice)
  const subtotal = invoice.total - invoice.tax
  return (
    <Sheet
      open
      onOpenChange={onOpenChange}
      title={<span className="font-mono">{invoice.number}</span>}
      description={`Issued ${formatDate(invoice.issuedAt)} by ${invoice.owner.name}`}
      footer={
        <>
          <Button variant="secondary" asChild>
            <Link to={`/invoices/${invoice.id}/edit`}>
              <IconPencil aria-hidden /> Edit
            </Link>
          </Button>
          <Button asChild>
            <Link to={`/invoices/${invoice.id}`}>
              Open invoice <IconExternalLink aria-hidden />
            </Link>
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3">
        <Avatar name={invoice.customer.name} shape="square" size="lg" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-md font-semibold text-fg">{invoice.customer.name}</p>
          <p className="truncate text-sm text-fg-muted">
            {invoice.customer.contact} · {invoice.customer.email}
          </p>
        </div>
      </div>

      <div className="mt-5 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-fg-muted">Amount due</span>
          <StatusBadge status={invoice.status} />
        </div>
        <p className="mt-1 text-3xl font-bold tracking-tight text-fg tabular">{formatMoney(invoice.total)}</p>
        <p className={due.late ? 'text-sm font-semibold text-danger' : 'text-sm text-fg-muted'}>
          Due {formatDate(invoice.dueAt)} · {due.text}
        </p>
        <div className="mt-4 flex items-center gap-3">
          <Progress value={ratio * 100} tone={ratio === 1 ? 'success' : 'primary'} label={`${Math.round(ratio * 100)}% collected`} className="flex-1" />
          <span className="text-xs font-semibold text-fg-muted tabular">{Math.round(ratio * 100)}% collected</span>
        </div>
      </div>

      <h3 className="mt-6 text-sm font-semibold text-fg">Line items</h3>
      <ul className="mt-2 divide-y divide-border rounded-lg border border-border bg-surface">
        {invoice.items.map((item, index) => (
          <li key={`${item.description}-${String(index)}`} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-medium text-fg">{item.description}</p>
              <p className="text-xs text-fg-muted tabular">
                {item.quantity.toLocaleString('en-US')} × {formatMoney(item.unitPrice)}
              </p>
            </div>
            <span className="text-base font-semibold text-fg tabular">{formatMoney(item.quantity * item.unitPrice)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-3 space-y-1.5 px-1 text-sm">
        <div className="flex justify-between text-fg-muted">
          <dt>Subtotal</dt>
          <dd className="tabular">{formatMoney(subtotal)}</dd>
        </div>
        <div className="flex justify-between text-fg-muted">
          <dt>Tax (8%)</dt>
          <dd className="tabular">{formatMoney(invoice.tax)}</dd>
        </div>
        <div className="flex justify-between text-base font-semibold text-fg">
          <dt>Total</dt>
          <dd className="tabular">{formatMoney(invoice.total)}</dd>
        </div>
      </dl>

      {onRemind !== undefined && invoice.status !== 'paid' && invoice.status !== 'void' && (
        <Button variant="soft" className="mt-6 w-full" onClick={() => onRemind(invoice)}>
          <IconSend aria-hidden /> Send payment reminder
        </Button>
      )}
    </Sheet>
  )
}
