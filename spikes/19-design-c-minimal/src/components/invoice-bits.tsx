/**
 * Small invoice-specific display pieces shared by the list, board, calendar, dashboard, drawer
 * and detail page, so an invoice looks the same wherever it appears.
 */
import type { Invoice, InvoiceStatus } from '../data/invoices.ts'
import { STATUS_LABELS } from '../data/invoices.ts'
import { cn } from '../lib/cn.ts'
import { daysFromNow, formatDate, formatDue, formatMoney } from '../lib/format.ts'
import { Avatar } from './ui/avatar.tsx'
import { StatusBadge, type Tone } from './ui/badge.tsx'

/** Status → tone. Open is the accent ("in flight"), overdue the only warm colour on the page. */
export const STATUS_TONE: Record<InvoiceStatus, Tone> = {
  draft: 'neutral',
  open: 'accent',
  overdue: 'danger',
  paid: 'success',
  void: 'neutral',
}

export function InvoiceStatusBadge({ status, className }: { status: InvoiceStatus; className?: string }) {
  return (
    <StatusBadge tone={STATUS_TONE[status]} {...(className !== undefined ? { className } : {})}>
      {STATUS_LABELS[status]}
    </StatusBadge>
  )
}

/** Monospace, tabular money: columns of amounts line up digit by digit. */
export function Money({ invoice, className }: { invoice: Pick<Invoice, 'amount' | 'currency'>; className?: string }) {
  return <span className={cn('num whitespace-nowrap text-fg', className)}>{formatMoney(invoice.amount, invoice.currency)}</span>
}

/**
 * Due date with context: overdue open invoices read in the danger text colour, everything due in
 * the next 3 days in the warning colour; paid and void invoices stay neutral.
 */
export function DueLabel({ invoice, className }: { invoice: Invoice; className?: string }) {
  const days = daysFromNow(invoice.dueAt)
  const settled = invoice.status === 'paid' || invoice.status === 'void'
  const tone = settled ? 'text-fg-subtle' : days < 0 ? 'text-danger-text' : days <= 3 ? 'text-warning-text' : 'text-fg-muted'
  // Settled invoices show the plain due date: the status column already says "Paid" or "Void".
  return <span className={cn('whitespace-nowrap text-sm', tone, className)}>{settled ? formatDate(invoice.dueAt) : formatDue(invoice.dueAt)}</span>
}

/** Company avatar + name (+ contact line when there is room). */
export function CustomerCell({ invoice, withContact = true }: { invoice: Invoice; withContact?: boolean }) {
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar name={invoice.customer.name} tint={invoice.customer.tint} shape="square" size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-fg">{invoice.customer.name}</span>
        {withContact && <span className="block truncate text-xs text-fg-subtle">{invoice.customer.contact}</span>}
      </span>
    </span>
  )
}
