/**
 * Modal surfaces on Radix Dialog / AlertDialog (focus trap, Escape, scroll lock, return focus):
 *
 * - `<Dialog>` + `<DialogContent>`: a centred modal (create token, invite member);
 * - `<Sheet>` + `<SheetContent side>`: a drawer from the right (quick view) or left (mobile nav);
 * - `<ConfirmDialog>`: the one confirmation pattern (alertdialog role, Cancel focused first so
 *   Enter never deletes by accident).
 *
 * @example
 * <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete INV-1042?"
 *   description="This cannot be undone." confirmLabel="Delete invoice" onConfirm={remove} />
 */
import { IconAlertTriangle, IconX } from '@tabler/icons-react'
import { AlertDialog, Dialog as DialogPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { Button } from './button.tsx'

const overlayClasses = 'fixed inset-0 z-50 bg-overlay backdrop-blur-[2px] animate-fade-in'

export const Dialog = DialogPrimitive.Root
export const DialogTrigger = DialogPrimitive.Trigger
export const DialogClose = DialogPrimitive.Close

function CloseButton(): ReactElement {
  return (
    <DialogPrimitive.Close asChild>
      <Button variant="ghost" size="icon-sm" aria-label="Close" className="absolute right-3 top-3 text-muted-foreground">
        <IconX />
      </Button>
    </DialogPrimitive.Close>
  )
}

export function DialogContent({ className, children, ...props }: ComponentProps<typeof DialogPrimitive.Content>): ReactElement {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-2xl bg-popover p-6 text-popover-foreground shadow-xl outline-none animate-pop-in',
          className,
        )}
        {...props}
      >
        {children}
        <CloseButton />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

export function DialogHeader({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return <div className={cn('flex flex-col gap-1 pr-8', className)} {...props} />
}

export function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>): ReactElement {
  return <DialogPrimitive.Title className={cn('text-lg font-semibold leading-7 text-foreground', className)} {...props} />
}

export function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>): ReactElement {
  return <DialogPrimitive.Description className={cn('text-sm text-muted-foreground', className)} {...props} />
}

export function DialogFooter({ className, ...props }: ComponentProps<'div'>): ReactElement {
  return <div className={cn('flex flex-col-reverse gap-2 sm:flex-row sm:justify-end', className)} {...props} />
}

export const Sheet = DialogPrimitive.Root
export const SheetTrigger = DialogPrimitive.Trigger
export const SheetClose = DialogPrimitive.Close
export const SheetTitle = DialogTitle
export const SheetDescription = DialogDescription

/** A drawer. `side="right"` for quick views, `side="left"` for the mobile navigation. */
export function SheetContent({ className, children, side = 'right', showClose = true, ...props }: ComponentProps<typeof DialogPrimitive.Content> & { readonly side?: 'left' | 'right'; readonly showClose?: boolean }): ReactElement {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className={overlayClasses} />
      <DialogPrimitive.Content
        className={cn(
          'fixed inset-y-0 z-50 flex w-full flex-col bg-popover text-popover-foreground shadow-xl outline-none',
          side === 'right' ? 'right-0 max-w-md animate-slide-in-right sm:rounded-l-2xl' : 'left-0 max-w-72 animate-slide-in-left',
          className,
        )}
        {...props}
      >
        {children}
        {showClose ? <CloseButton /> : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  )
}

/** Props of {@link ConfirmDialog}. */
export interface ConfirmDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description: ReactNode
  readonly confirmLabel: string
  readonly onConfirm: () => void
  /** `danger` shows a warning icon and a red confirm button. */
  readonly tone?: 'danger' | 'primary'
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel, onConfirm, tone = 'danger' }: ConfirmDialogProps): ReactElement {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className={overlayClasses} />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-popover p-6 text-popover-foreground shadow-xl outline-none animate-pop-in">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:text-left">
            <span aria-hidden className={cn('grid size-11 shrink-0 place-items-center rounded-full', tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary-soft-foreground')}>
              <IconAlertTriangle className="size-5.5" />
            </span>
            <div className="flex flex-col gap-1.5">
              <AlertDialog.Title className="text-lg font-semibold leading-7">{title}</AlertDialog.Title>
              <AlertDialog.Description className="text-sm text-muted-foreground">{description}</AlertDialog.Description>
            </div>
          </div>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline">Cancel</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm}>
                {confirmLabel}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  )
}
