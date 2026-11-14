/**
 * App-wide overlays any screen can open: the confirm dialog, the invoice side drawer, the command
 * palette and the notifications popover. One provider owns their state so a screen (or the
 * "Screens" switcher) can trigger them without prop drilling.
 *
 * @example
 * const { confirm, peek } = useOverlays()
 * if (await confirm({ title: 'Delete INV-2264?', description: '…', confirmLabel: 'Delete invoice' })) remove()
 * peek(invoice) // opens the side drawer
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AlertDialog, ConfirmContent } from '../components/ui/dialog.tsx'
import type { Invoice } from '../data/invoices.ts'
import { InvoiceDrawer } from './InvoiceDrawer.tsx'

export interface ConfirmOptions {
  title: string
  description: ReactNode
  confirmLabel: string
  tone?: 'danger' | 'primary'
}

interface OverlayState {
  /** Ask for confirmation; resolves `true` on confirm, `false` on cancel/Escape. */
  confirm: (options: ConfirmOptions) => Promise<boolean>
  /** Open the side drawer with a quick view of an invoice. */
  peek: (invoice: Invoice) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  notificationsOpen: boolean
  setNotificationsOpen: (open: boolean) => void
  shortcutsOpen: boolean
  setShortcutsOpen: (open: boolean) => void
}

const OverlayContext = createContext<OverlayState | null>(null)

export function OverlayProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((value: boolean) => void) | null>(null)
  const [peeked, setPeeked] = useState<Invoice | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  const confirm = useCallback((options: ConfirmOptions) => {
    // A second confirm while one is open answers the first with "cancel" so no promise is left hanging.
    resolver.current?.(false)
    setPending(options)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const settle = (value: boolean) => {
    resolver.current?.(value)
    resolver.current = null
    setPending(null)
  }

  const value = useMemo<OverlayState>(
    () => ({ confirm, peek: setPeeked, paletteOpen, setPaletteOpen, notificationsOpen, setNotificationsOpen, shortcutsOpen, setShortcutsOpen }),
    [confirm, paletteOpen, notificationsOpen, shortcutsOpen],
  )

  return (
    <OverlayContext value={value}>
      {children}
      <AlertDialog.Root open={pending !== null} onOpenChange={(open) => !open && settle(false)}>
        {pending !== null && (
          <ConfirmContent
            title={pending.title}
            description={pending.description}
            confirmLabel={pending.confirmLabel}
            tone={pending.tone ?? 'danger'}
            onConfirm={() => settle(true)}
          />
        )}
      </AlertDialog.Root>
      <InvoiceDrawer invoice={peeked} onClose={() => setPeeked(null)} />
    </OverlayContext>
  )
}

/** Open app-wide overlays. Must be used inside {@link OverlayProvider}. */
export function useOverlays(): OverlayState {
  const state = useContext(OverlayContext)
  if (state === null) throw new Error('useOverlays() needs <OverlayProvider> above it: wrap the app in <OverlayProvider>.')
  return state
}
