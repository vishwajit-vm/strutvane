/**
 * The invoice quick-look drawer: opened from the board, the calendar and the list's "Peek" action,
 * so a user can check an invoice without losing their place. "Open invoice" goes to the full page.
 */
import { ArrowUpRight, Mail } from 'lucide-react'
import { CustomerCell, DueLabel, InvoiceStatusBadge } from '../components/invoice-bits.tsx'
import { PropertyList } from '../components/property-list.tsx'
import { Avatar } from '../components/ui/avatar.tsx'
import { Badge } from '../components/ui/badge.tsx'
import { Button } from '../components/ui/button.tsx'
import { Dialog, SheetContent } from '../components/ui/dialog.tsx'
import { type Invoice, lineItemsFor, TERMS_LABELS } from '../data/invoices.ts'
import { formatDate, formatMoney } from '../lib/format.ts'
import { useRouter } from '../lib/router.tsx'

export function InvoiceDrawer({ invoice, onClose }: { invoice: Invoice | null; onClose: () => void }) {
  const { navigate } = useRouter()
  return (
    <Dialog.Root open={invoice !== null} onOpenChange={(open) => !open && onClose()}>
      {invoice !== null && (
        <SheetContent
          title={invoice.number}
          description={`Issued ${formatDate(invoice.issuedAt)} · ${invoice.customer.name}`}
          footer={
            <>
              <Button>
                <Mail aria-hidden /> Send reminder
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  onClose()
                  navigate(`/invoices/${invoice.id}`)
                }}
              >
                Open invoice <ArrowUpRight aria-hidden />
              </Button>
            </>
          }
        >
          <DrawerBody invoice={invoice} />
        </SheetContent>
      )}
    </Dialog.Root>
  )
}

function DrawerBody({ invoice }: { invoice: Invoice }) {
  const { items } = lineItemsFor(invoice)
  return (
    <div className="flex flex-col gap-6 p-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <InvoiceStatusBadge status={invoice.status} />
          <DueLabel invoice={invoice} />
        </div>
        <p className="figure mt-3 text-3xl font-semibold text-fg">{formatMoney(invoice.amount, invoice.currency)}</p>
        <p className="mt-0.5 text-xs text-fg-subtle">Total incl. VAT</p>
      </div>
      <div className="rounded-lg border border-border p-3">
        <CustomerCell invoice={invoice} />
        <p className="mt-2 truncate text-xs text-fg-subtle">{invoice.customer.email}</p>
      </div>
      <PropertyList
        items={[
          { label: 'Issued', value: formatDate(invoice.issuedAt) },
          { label: 'Due', value: formatDate(invoice.dueAt) },
          { label: 'Terms', value: TERMS_LABELS[invoice.terms] },
          {
            label: 'Owner',
            value: (
              <span className="flex items-center gap-2">
                <Avatar name={invoice.owner.name} tint={invoice.owner.tint} size="xs" />
                {invoice.owner.name}
              </span>
            ),
          },
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
      <section aria-labelledby="drawer-items">
        <h3 id="drawer-items" className="mb-2 text-xs font-medium text-fg-subtle">
          Line items
        </h3>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {items.map((item) => (
            <li key={item.description} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate text-fg">
                {item.description}
                {item.quantity > 1 && <span className="text-fg-subtle"> × {item.quantity}</span>}
              </span>
              <span className="num shrink-0 text-fg-muted">{formatMoney(item.unitPrice * item.quantity, invoice.currency)}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
