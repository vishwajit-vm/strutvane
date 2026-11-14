/**
 * "Overlays & feedback": every floating or transient pattern on one page so the lead can try
 * them side by side: command palette, notification dropdown, confirm dialog, toasts (four tones),
 * drawer, plus the button, badge and form-control vocabulary.
 */
import { IconBell, IconCommand, IconLayoutSidebarRightExpand, IconPlus, IconTrash } from '@tabler/icons-react'
import { useState, type ReactElement, type ReactNode } from 'react'
import { PageHeader } from '../../components/page-header.tsx'
import { Badge } from '../../components/ui/badge.tsx'
import { Button } from '../../components/ui/button.tsx'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card.tsx'
import { Checkbox, Switch } from '../../components/ui/checkbox.tsx'
import { ConfirmDialog, Sheet } from '../../components/ui/dialog.tsx'
import { Label } from '../../components/ui/field.tsx'
import { Input } from '../../components/ui/input.tsx'
import { IconChip, Kbd, Skeleton } from '../../components/ui/misc.tsx'
import { toast } from '../../components/ui/toast.tsx'
import { featuredInvoice } from '../../data/invoices.ts'
import { useCommandPalette } from '../../shell/CommandPalette.tsx'
import { NotificationsMenu } from '../../shell/Topbar.tsx'
import { QuickView } from '../invoices/ListParts.tsx'

function Demo({ title, description, icon, children }: { readonly title: string; readonly description: string; readonly icon: ReactNode; readonly children: ReactNode }): ReactElement {
  return (
    <Card>
      <CardHeader className="justify-start gap-3">
        <IconChip icon={icon} />
        <div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">{children}</CardContent>
    </Card>
  )
}

export function OverlaysPage(): ReactElement {
  const { open } = useCommandPalette()
  const [confirm, setConfirm] = useState(false)
  const [drawer, setDrawer] = useState(false)
  return (
    <>
      <PageHeader breadcrumbs={[{ label: 'Design system' }, { label: 'Overlays & feedback' }]} title="Overlays & feedback" description="Every floating and transient pattern in direction A, ready to try." />
      <div className="grid gap-6 lg:grid-cols-2">
        <Demo title="Command palette" description="Jump anywhere with the keyboard." icon={<IconCommand />}>
          <Button variant="primary" onClick={open}>
            Open palette
          </Button>
          <span className="flex items-center gap-1.5 text-label text-muted-foreground">
            or press <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>
          </span>
        </Demo>
        <Demo title="Notifications" description="The top-bar dropdown, also usable here." icon={<IconBell />}>
          <NotificationsMenu />
          <span className="text-label text-muted-foreground">Click the bell: unread items are tinted; “Mark all as read” clears them.</span>
        </Demo>
        <Demo title="Confirm dialog" description="One pattern for destructive actions." icon={<IconTrash />}>
          <Button variant="danger" onClick={() => setConfirm(true)}>
            <IconTrash /> Delete invoice
          </Button>
          <span className="text-label text-muted-foreground">Cancel has focus first, so Enter never deletes by accident.</span>
        </Demo>
        <Demo title="Drawer (quick view)" description="Peek at a record without leaving the list." icon={<IconLayoutSidebarRightExpand />}>
          <Button variant="outline" onClick={() => setDrawer(true)}>
            Open quick view
          </Button>
        </Demo>
        <Demo title="Toasts" description="Short confirmations; never the only place an error appears." icon={<IconPlus />}>
          <Button variant="outline" onClick={() => toast({ tone: 'success', title: 'Invoice saved', description: 'INV-1065 was created and emailed.' })}>
            Success
          </Button>
          <Button variant="outline" onClick={() => toast({ tone: 'info', title: 'Sync in progress', description: 'Pulling payments from your bank.' })}>
            Info
          </Button>
          <Button variant="outline" onClick={() => toast({ tone: 'warning', title: 'Card expires soon', description: 'Update the payment method before Dec 1.' })}>
            Warning
          </Button>
          <Button variant="outline" onClick={() => toast({ tone: 'danger', title: 'Payment failed', description: 'The bank declined INV-1049. Retry in 3 days.' })}>
            Error
          </Button>
        </Demo>
        <Demo title="Buttons & badges" description="Variants and sizes of the core vocabulary." icon={<IconPlus />}>
          <Button variant="primary">Primary</Button>
          <Button variant="soft">Soft</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button variant="primary" size="sm">
            Small
          </Button>
          <div className="flex w-full flex-wrap gap-2 pt-1">
            <Badge tone="primary">Primary</Badge>
            <Badge tone="success" dot>
              Paid
            </Badge>
            <Badge tone="info" dot>
              Pending
            </Badge>
            <Badge tone="warning" dot>
              Partly paid
            </Badge>
            <Badge tone="danger" dot>
              Overdue
            </Badge>
            <Badge tone="neutral">Draft</Badge>
            <Badge variant="outline">Outline</Badge>
          </div>
        </Demo>
        <Demo title="Controls" description="Inputs share one height, radius and focus ring." icon={<IconPlus />}>
          <Input aria-label="Example input" placeholder="Text input" className="max-w-56" />
          <Input aria-label="Invalid example" aria-invalid defaultValue="Invalid value" className="max-w-56" />
          <div className="flex items-center gap-2">
            <Checkbox id="kit-check" defaultChecked />
            <Label htmlFor="kit-check" className="font-medium">
              Checkbox
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="kit-switch" defaultChecked />
            <Label htmlFor="kit-switch" className="font-medium">
              Switch
            </Label>
          </div>
        </Demo>
        <Demo title="Skeletons" description="Loading placeholders shimmer, then fade to content." icon={<IconPlus />}>
          <div className="flex w-full items-center gap-3">
            <Skeleton className="size-10 rounded-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-3.5 w-1/2" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </Demo>
      </div>
      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title={`Delete ${featuredInvoice.id}?`}
        description="It moves to Trash and is removed for good after 30 days."
        confirmLabel="Delete invoice"
        onConfirm={() => toast({ tone: 'success', title: `${featuredInvoice.id} deleted` })}
      />
      <Sheet open={drawer} onOpenChange={setDrawer}>
        {drawer ? <QuickView invoice={featuredInvoice} onRemind={() => toast({ tone: 'success', title: 'Reminder sent' })} /> : null}
      </Sheet>
    </>
  )
}
