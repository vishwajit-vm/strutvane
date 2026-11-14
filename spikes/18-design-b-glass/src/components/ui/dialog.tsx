/**
 * Modal surfaces on Radix Dialog: a centred Dialog and a side Sheet (drawer). Both have a soft
 * scrim and a blurred glass panel, trap focus, close on Escape and return focus to the trigger.
 *
 * @example
 *   <Dialog open={open} onOpenChange={setOpen} title="Invite member" description="They get an e-mail.">
 *     …form…
 *   </Dialog>
 *   <Sheet open={open} onOpenChange={setOpen} title="INV-2026-1042">…</Sheet>
 */
import { IconX } from '@tabler/icons-react'
import { Dialog as RadixDialog } from 'radix-ui'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'
import { Button } from './button.tsx'

interface ModalProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: ReactNode
  readonly description?: ReactNode
  readonly children?: ReactNode
  /** Buttons for the footer, right-aligned (primary last). */
  readonly footer?: ReactNode
  readonly className?: string
}

function Scrim() {
  return <RadixDialog.Overlay className="animate-glass-fade fixed inset-0 z-(--z-overlay) bg-scrim" />
}

function CloseButton() {
  return (
    <RadixDialog.Close asChild>
      <Button variant="ghost" size="icon-sm" aria-label="Close" className="-mr-1.5">
        <IconX aria-hidden />
      </Button>
    </RadixDialog.Close>
  )
}

export function Dialog({ open, onOpenChange, title, description, children, footer, className }: ModalProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Scrim />
        <RadixDialog.Content
          className={cn(
            'glass-overlay animate-glass-in fixed top-1/2 left-1/2 z-(--z-overlay) flex max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl',
            className,
          )}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <div className="flex items-start gap-3 px-6 pt-6">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-lg font-semibold tracking-tight text-fg">{title}</RadixDialog.Title>
              {description !== undefined && <RadixDialog.Description className="mt-1 text-base text-fg-muted">{description}</RadixDialog.Description>}
            </div>
            <CloseButton />
          </div>
          {children !== undefined && <div className="scroll-thin min-h-0 overflow-y-auto px-6 pt-4 pb-2">{children}</div>}
          {footer !== undefined && <div className="flex flex-wrap justify-end gap-2 px-6 pt-4 pb-6">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}

/** A drawer from the right (or left, for the mobile navigation). */
export function Sheet({ open, onOpenChange, title, description, children, footer, className, bodyClassName, side = 'right' }: ModalProps & { side?: 'left' | 'right'; bodyClassName?: string }) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <Scrim />
        <RadixDialog.Content
          className={cn(
            'glass-overlay fixed inset-y-2 z-(--z-overlay) flex w-[min(28rem,calc(100vw-1rem))] flex-col rounded-2xl',
            side === 'right' ? 'animate-slide-right right-2' : 'animate-slide-left left-2',
            className,
          )}
          {...(description === undefined ? { 'aria-describedby': undefined } : {})}
        >
          <div className="flex items-start gap-3 border-b border-border px-6 py-5">
            <div className="min-w-0 flex-1">
              <RadixDialog.Title className="text-lg font-semibold tracking-tight text-fg">{title}</RadixDialog.Title>
              {description !== undefined && <RadixDialog.Description className="mt-0.5 text-sm text-fg-muted">{description}</RadixDialog.Description>}
            </div>
            <CloseButton />
          </div>
          <div className={cn('scroll-thin min-h-0 flex-1 overflow-y-auto px-6 py-5', bodyClassName)}>{children}</div>
          {footer !== undefined && <div className="flex flex-wrap justify-end gap-2 border-t border-border px-6 py-4">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
