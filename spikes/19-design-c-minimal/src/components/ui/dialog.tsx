/**
 * Modal layers: `Dialog` (centred), `Sheet` (side drawer) and `AlertDialog` (confirmations).
 *
 * All three dim the page with the `--overlay` scrim, trap focus, close on Escape and return focus
 * to the trigger (Radix). The drawer slides 16 px from the right instead of the whole width, which
 * reads as calm rather than theatrical.
 *
 * @example
 * <Dialog.Root open={open} onOpenChange={setOpen}>
 *   <DialogContent title="Invite member" description="They get an e-mail with a link.">…</DialogContent>
 * </Dialog.Root>
 */
import { X } from 'lucide-react'
import { AlertDialog as AlertPrimitive, Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { Button } from './button.tsx'

export const Dialog = DialogPrimitive
export const AlertDialog = AlertPrimitive

const overlayClasses = 'fixed inset-0 z-50 bg-overlay animate-fade-in'

interface DialogContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Footer buttons, right-aligned; the primary action goes last. */
  footer?: ReactNode
}

/** A centred dialog with a title row, scrollable body and footer. */
export function DialogContent({ title, description, footer, children, className, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100vw-32px)] max-w-lg -translate-x-1/2 flex-col rounded-xl border border-border bg-surface shadow-pop animate-pop-in outline-none',
          className,
        )}
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        {...props}
      >
        <div className="flex items-start gap-3 px-5 pb-2 pt-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
            {description !== undefined && <DialogPrimitive.Description className="mt-1 text-sm text-fg-muted">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5 -mt-0.5">
              <X aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-5 py-3">{children}</div>
        {footer !== undefined && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

interface SheetContentProps extends Omit<ComponentProps<typeof DialogPrimitive.Content>, 'title'> {
  title: ReactNode
  description?: ReactNode
  /** Extra controls in the header, left of the close button. */
  headerActions?: ReactNode
  footer?: ReactNode
  side?: 'right' | 'left'
}

/** Side drawer: a quick look at a record without leaving the current screen. */
export function SheetContent({ title, description, headerActions, footer, side = 'right', children, className, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full max-w-md flex-col border-border bg-surface shadow-pop outline-none',
          side === 'right' ? 'right-0 border-l animate-drawer-in' : 'left-0 border-r animate-fade-in',
          className,
        )}
        {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        {...props}
      >
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
          <div className="min-w-0 flex-1">
            <DialogPrimitive.Title className="truncate text-sm font-semibold text-fg">{title}</DialogPrimitive.Title>
            {description !== undefined && <DialogPrimitive.Description className="truncate text-xs text-fg-subtle">{description}</DialogPrimitive.Description>}
          </div>
          {headerActions}
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Close">
              <X aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">{children}</div>
        {footer !== undefined && <div className="flex items-center justify-end gap-2 border-t border-border px-4 py-3">{footer}</div>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

interface ConfirmContentProps {
  title: ReactNode
  description: ReactNode
  confirmLabel: string
  /** `danger` for anything that deletes or cannot be undone. */
  tone?: 'danger' | 'primary'
  onConfirm: () => void
}

/**
 * The confirm dialog body. Cancel receives focus first, so pressing Enter by reflex never
 * destroys anything; the destructive button says exactly what it does ("Delete 3 invoices").
 */
export function ConfirmContent({ title, description, confirmLabel, tone = 'danger', onConfirm }: ConfirmContentProps) {
  return (
    <AlertPrimitive.Portal>
      <AlertPrimitive.Overlay className={overlayClasses} />
      <AlertPrimitive.Content className="fixed left-1/2 top-[20vh] z-50 w-[calc(100vw-32px)] max-w-md -translate-x-1/2 rounded-xl border border-border bg-surface p-5 shadow-pop animate-pop-in outline-none">
        <AlertPrimitive.Title className="text-base font-semibold text-fg">{title}</AlertPrimitive.Title>
        <AlertPrimitive.Description className="mt-1.5 text-sm text-fg-muted">{description}</AlertPrimitive.Description>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <AlertPrimitive.Cancel asChild>
            <Button>Cancel</Button>
          </AlertPrimitive.Cancel>
          <AlertPrimitive.Action asChild>
            <Button variant={tone} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </AlertPrimitive.Action>
        </div>
      </AlertPrimitive.Content>
    </AlertPrimitive.Portal>
  )
}
