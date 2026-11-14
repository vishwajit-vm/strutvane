/**
 * Overlays & feedback showcase: one place to open every floating surface for review: command
 * palette, notifications, confirm dialog, toasts, quick-view drawer, dialog, tooltip, popover,
 * plus the badge, button and skeleton sets.
 */
import { IconBell, IconCommand, IconInfoCircle, IconLayoutSidebarRight, IconMessage2, IconTrash } from '@tabler/icons-react'
import { useState, type ReactNode } from 'react'
import { StatusBadge, TrendChip } from '../../components/data-display.tsx'
import { PageHeader } from '../../components/PageHeader.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardBody, CardHeader } from '../../components/ui/card.tsx'
import { useConfirm } from '../../components/ui/confirm.tsx'
import { Dialog } from '../../components/ui/dialog.tsx'
import { Field } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/menu.tsx'
import { Kbd, Skeleton, Tooltip } from '../../components/ui/misc.tsx'
import { useToast } from '../../components/ui/toast.tsx'
import { INVOICES, INVOICE_STATUSES } from '../../data/invoices.ts'
import { modKeyLabel } from '../../lib/use-hotkey.ts'
import { NotificationsMenu } from '../../shell/TopBar.tsx'
import { useShell } from '../../shell/shell-state.tsx'
import { QuickViewDrawer } from '../invoices/QuickViewDrawer.tsx'

export function OverlaysPage() {
  const { openPalette } = useShell()
  const toast = useToast()
  const confirm = useConfirm()
  const [drawer, setDrawer] = useState(false)
  const [dialog, setDialog] = useState(false)
  const sample = INVOICES[3] ?? null

  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Home', to: '/' }, { label: 'Design kit' }, { label: 'Overlays & feedback' }]} title="Overlays & feedback" description="Every floating surface in the Glass direction. They are the only layers that blur heavily." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Demo title="Command palette" description="Jump anywhere, find records, run actions." icon={<IconCommand />}>
          <Button onClick={openPalette}>Open palette</Button>
          <span className="flex items-center gap-1 text-sm text-fg-muted">
            or press <Kbd>{modKeyLabel()}</Kbd>
            <Kbd>K</Kbd>
          </span>
        </Demo>
        <Demo title="Notifications" description="Unread items, tones and relative times." icon={<IconBell />}>
          <NotificationsMenu />
          <span className="text-sm text-fg-muted">The bell from the top bar</span>
        </Demo>
        <Demo title="Confirm dialog" description="Destructive actions ask first; Cancel has focus." icon={<IconTrash />}>
          <Button
            variant="danger"
            onClick={() =>
              void confirm({ title: 'Delete 3 invoices?', description: 'They move to the trash for 30 days.', confirmLabel: 'Delete invoices', destructive: true }).then((ok) =>
                toast(ok ? { title: '3 invoices deleted', action: { label: 'Undo', onClick: () => undefined } } : { title: 'Nothing was deleted', tone: 'info' }),
              )
            }
          >
            Delete…
          </Button>
        </Demo>
        <Demo title="Toasts" description="Success, info and error, with an optional action." icon={<IconMessage2 />}>
          <Button variant="secondary" onClick={() => toast({ title: 'Invoice sent', description: 'INV-2026-1127 was e-mailed to Larkspur.' })}>
            Success
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Export started', description: 'We’ll notify you when it is ready.', tone: 'info' })}>
            Info
          </Button>
          <Button variant="secondary" onClick={() => toast({ title: 'Payment failed', description: 'The card was declined. Ask the customer for another method.', tone: 'danger', action: { label: 'Retry', onClick: () => undefined } })}>
            Error
          </Button>
        </Demo>
        <Demo title="Quick-view drawer" description="Peek at a record without leaving the list." icon={<IconLayoutSidebarRight />}>
          <Button onClick={() => setDrawer(true)}>Open drawer</Button>
        </Demo>
        <Demo title="Dialog, popover, tooltip" description="Forms in dialogs; small panels; short labels." icon={<IconInfoCircle />}>
          <Button variant="secondary" onClick={() => setDialog(true)}>
            Dialog
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="secondary">Popover</Button>
            </PopoverTrigger>
            <PopoverContent className="w-64">
              <p className="text-base font-semibold text-fg">Payment terms</p>
              <p className="mt-1 text-sm text-fg-muted">Net 30 means the invoice is due 30 days after it is issued.</p>
            </PopoverContent>
          </Popover>
          <Tooltip label="Copies the invoice link">
            <Button variant="secondary">Tooltip</Button>
          </Tooltip>
        </Demo>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Buttons" />
          <CardBody className="flex flex-wrap gap-2">
            <Button>Primary</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="soft">Soft</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="danger">Danger</Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Badges & trends" />
          <CardBody className="flex flex-wrap gap-2">
            {INVOICE_STATUSES.map((status) => (
              <StatusBadge key={status} status={status} />
            ))}
            <Badge tone="primary">Enterprise</Badge>
            <TrendChip delta={0.124} />
            <TrendChip delta={-0.068} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Loading skeleton" />
          <CardBody className="flex flex-col gap-3" aria-busy="true">
            <div className="flex items-center gap-3">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="h-2.5 w-1/2" />
              </div>
            </div>
            <Skeleton className="h-20 w-full rounded-md" />
          </CardBody>
        </Card>
      </div>

      <QuickViewDrawer invoice={drawer ? sample : null} onOpenChange={setDrawer} onRemind={() => toast({ title: 'Reminder sent' })} />
      <Dialog
        open={dialog}
        onOpenChange={setDialog}
        title="Rename view"
        description="Saved views appear above the invoice table."
        footer={
          <>
            <Button variant="secondary" onClick={() => setDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setDialog(false)
                toast({ title: 'View renamed' })
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Field label="View name">{(control) => <Input {...control} defaultValue="Needs attention" autoFocus />}</Field>
      </Dialog>
    </>
  )
}

function Demo({ title, description, icon, children }: { title: string; description: string; icon: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} description={description} icon={icon} />
      <CardBody className="flex flex-wrap items-center gap-2">{children}</CardBody>
    </Card>
  )
}
