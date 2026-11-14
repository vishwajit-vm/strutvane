/**
 * Toasts: short, non-blocking confirmations after an action ("Invoice sent").
 *
 * Built on Radix Toast (announced politely to screen readers, pause on hover/focus, swipe to
 * dismiss, F8 jumps to the region). `useToast()` returns a function; call it from anywhere under
 * <Toaster>.
 *
 * @example
 *   const toast = useToast()
 *   toast({ title: 'Invoice sent', description: 'INV-2026-1042 was e-mailed to Larkspur.', tone: 'success' })
 */
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import { Toast as RadixToast } from 'radix-ui'
import { createContext, use, useCallback, useMemo, useState, type ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export interface ToastInput {
  readonly title: string
  readonly description?: string
  readonly tone?: 'success' | 'info' | 'danger'
  /** An optional action, e.g. Undo. */
  readonly action?: { readonly label: string; readonly onClick: () => void }
}

interface ToastEntry extends ToastInput {
  readonly id: number
}

type ShowToast = (toast: ToastInput) => void

const ToastContext = createContext<ShowToast | null>(null)

const ICONS = {
  success: <IconCircleCheck className="size-5 text-success" aria-hidden />,
  info: <IconInfoCircle className="size-5 text-primary-text" aria-hidden />,
  danger: <IconAlertTriangle className="size-5 text-danger" aria-hidden />,
} as const

let nextId = 1

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<readonly ToastEntry[]>([])
  const show = useCallback<ShowToast>((toast) => {
    const id = nextId++
    // Keep at most three on screen; the oldest leaves first.
    setToasts((current) => [...current.slice(-2), { ...toast, id }])
  }, [])
  const remove = (id: number): void => setToasts((current) => current.filter((toast) => toast.id !== id))
  const value = useMemo(() => show, [show])

  return (
    <ToastContext value={value}>
      <RadixToast.Provider swipeDirection="right" duration={5000}>
        {children}
        {toasts.map((toast) => (
          <RadixToast.Root
            key={toast.id}
            onOpenChange={(open) => {
              if (!open) remove(toast.id)
            }}
            className="glass-overlay animate-glass-in flex w-full items-start gap-3 rounded-lg p-4 data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)"
          >
            <span className="mt-px">{ICONS[toast.tone ?? 'success']}</span>
            <div className="min-w-0 flex-1">
              <RadixToast.Title className="text-base font-semibold text-fg">{toast.title}</RadixToast.Title>
              {toast.description !== undefined && <RadixToast.Description className="mt-0.5 text-sm text-fg-muted">{toast.description}</RadixToast.Description>}
              {toast.action !== undefined && (
                <RadixToast.Action altText={toast.action.label} asChild>
                  <button type="button" onClick={toast.action.onClick} className="mt-2 text-sm font-semibold text-primary-text hover:underline">
                    {toast.action.label}
                  </button>
                </RadixToast.Action>
              )}
            </div>
            <RadixToast.Close aria-label="Dismiss notification" className={cn('-mt-1 -mr-1 grid size-7 place-items-center rounded-sm text-fg-muted hover:bg-glass-hover hover:text-fg')}>
              <IconX className="size-4" aria-hidden />
            </RadixToast.Close>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed right-0 bottom-0 z-(--z-toast) flex w-full max-w-sm flex-col gap-2 p-4 outline-none sm:p-6" />
      </RadixToast.Provider>
    </ToastContext>
  )
}

/** Show a toast. Throws outside <Toaster> (a wiring bug, caught by the smoke tests). */
export function useToast(): ShowToast {
  const show = use(ToastContext)
  if (show === null) throw new Error('useToast() needs <Toaster> above it (see src/main.tsx).')
  return show
}
