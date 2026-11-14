/**
 * Toasts: short confirmations after an action ("Invoice sent"), bottom-right on desktop and
 * bottom-centre on phones. Radix announces them politely to screen readers, pauses the timer on
 * hover/focus, and supports swipe-to-dismiss. F8 jumps to the toast region from anywhere.
 *
 * @example
 * const toast = useToast()
 * toast({ title: 'Invoice sent', description: 'INV-2264 is on its way to Halcyon Freight.', action: { label: 'Undo', onClick: undo } })
 */
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react'
import { Toast } from 'radix-ui'
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from 'react'
import { cn } from '../../lib/cn.ts'

export interface ToastOptions {
  title: string
  description?: string
  tone?: 'success' | 'info' | 'danger'
  /** One optional follow-up, typically Undo. */
  action?: { label: string; onClick: () => void }
}

type ShowToast = (options: ToastOptions) => void

const ToastContext = createContext<ShowToast | null>(null)

const ICONS = {
  success: <CircleCheck aria-hidden className="size-4 text-success" />,
  info: <Info aria-hidden className="size-4 text-accent-text" />,
  danger: <CircleAlert aria-hidden className="size-4 text-danger-text" />,
} as const

interface Item extends ToastOptions {
  id: number
  open: boolean
}

let nextId = 1

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Item[]>([])

  const show = useCallback<ShowToast>((options) => {
    const id = nextId++
    // Keep at most three on screen; older ones leave first.
    setItems((current) => [...current.slice(-2), { ...options, id, open: true }])
  }, [])

  const close = (id: number) => setItems((current) => current.map((item) => (item.id === id ? { ...item, open: false } : item)))
  const remove = (id: number) => setItems((current) => current.filter((item) => item.id !== id))

  const value = useMemo(() => show, [show])
  return (
    <ToastContext value={value}>
      <Toast.Provider swipeDirection="right" duration={5000}>
        {children}
        {items.map((item) => (
          <Toast.Root
            key={item.id}
            open={item.open}
            onOpenChange={(open) => {
              if (!open) {
                close(item.id)
                window.setTimeout(() => remove(item.id), 200)
              }
            }}
            className={cn(
              'pointer-events-auto flex w-full items-start gap-3 rounded-lg border border-border bg-surface p-3 pr-2 shadow-pop animate-rise-in',
              'data-[state=closed]:animate-fade-in data-[state=closed]:opacity-0 data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
            )}
          >
            <span className="mt-0.5">{ICONS[item.tone ?? 'success']}</span>
            <div className="min-w-0 flex-1">
              <Toast.Title className="text-sm font-medium text-fg">{item.title}</Toast.Title>
              {item.description !== undefined && <Toast.Description className="mt-0.5 text-sm text-fg-muted">{item.description}</Toast.Description>}
            </div>
            {item.action !== undefined && (
              <Toast.Action altText={item.action.label} asChild>
                <button
                  type="button"
                  onClick={item.action.onClick}
                  className="h-7 shrink-0 cursor-pointer rounded-md px-2 text-sm font-medium text-accent-text hover:bg-accent-subtle"
                >
                  {item.action.label}
                </button>
              </Toast.Action>
            )}
            <Toast.Close aria-label="Dismiss" className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-fg-subtle hover:bg-subtle hover:text-fg">
              <X aria-hidden className="size-3.5" />
            </Toast.Close>
          </Toast.Root>
        ))}
        <Toast.Viewport className="fixed bottom-0 right-0 z-[60] flex w-full max-w-sm flex-col gap-2 p-4 outline-none max-sm:left-1/2 max-sm:-translate-x-1/2" />
      </Toast.Provider>
    </ToastContext>
  )
}

/** Show a toast. Must be used inside {@link ToastProvider}. */
export function useToast(): ShowToast {
  const show = useContext(ToastContext)
  if (show === null) throw new Error('useToast() needs <ToastProvider> above it: wrap the app in <ToastProvider>.')
  return show
}
