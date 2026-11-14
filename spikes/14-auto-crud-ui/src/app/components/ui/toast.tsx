/**
 * Toasts: short "Post created" confirmations after an action, announced politely to screen
 * readers and dismissed automatically (or with their close button).
 *
 * Why a polite live region: an action's result must be heard without stealing focus from where
 * the user is working (WCAG 4.1.3 status messages).
 *
 * @module
 */
import { IconCircleCheck, IconX } from '@tabler/icons-react'
import { createContext, useCallback, useContext, useRef, useState, type ReactElement, type ReactNode } from 'react'

/** How long a toast stays, in milliseconds. */
const TOAST_MS = 4000

interface Toast {
  readonly id: number
  readonly message: string
}

/**
 * Show a toast.
 *
 * @example
 * const toast = useToast()
 * toast('Post created')
 */
export type ShowToast = (message: string) => void

const ToastContext = createContext<ShowToast | null>(null)

/**
 * Provide toasts and render the toast region (bottom right).
 *
 * @example
 * <ToastProvider><App /></ToastProvider>
 */
export function ToastProvider({ children }: { readonly children: ReactNode }): ReactElement {
  const [toasts, setToasts] = useState<readonly Toast[]>([])
  const nextId = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), [])
  const show = useCallback<ShowToast>(
    (message) => {
      const id = nextId.current++
      setToasts((current) => [...current, { id, message }])
      setTimeout(() => dismiss(id), TOAST_MS)
    },
    [dismiss],
  )
  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* A plain polite live region (no role="status"): screens keep their own status messages. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-(--z-toast) flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto flex items-center gap-3 rounded-xl bg-card p-3.5 text-sm shadow-popover">
            <IconCircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" />
            <span className="flex-1">{toast.message}</span>
            <button type="button" aria-label="Dismiss" onClick={() => dismiss(toast.id)} className="rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <IconX aria-hidden="true" className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/**
 * Get the toast function. Outside a provider it does nothing (so components stay usable alone).
 *
 * @example
 * const toast = useToast()
 */
export function useToast(): ShowToast {
  return useContext(ToastContext) ?? noop
}

function noop(): void {
  // No provider: toasts are optional decoration, never required for correctness.
}
