/**
 * Toasts: short "Post created" confirmations after an action, announced politely to screen
 * readers, optionally with one action ("Undo").
 *
 * Timing rules (WCAG 2.2.1):
 * - a plain toast stays 4 s;
 * - a toast with an action stays 10 s, and never disappears while the pointer or keyboard focus
 *   is on it;
 * - every toast action also has a permanent path elsewhere (Undo delete = Deleted records →
 *   Restore), so missing a toast never loses the ability.
 *
 * @module
 */
import { IconCircleCheck, IconX } from '@tabler/icons-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'

/** How long a plain toast stays, in milliseconds. */
const TOAST_MS = 4000
/** How long a toast with an action stays: enough time to read it and decide. */
const ACTION_TOAST_MS = 10_000

/**
 * An optional button on a toast.
 *
 * @example
 * const undo: ToastAction = { label: 'Undo', onAction: restore }
 */
export interface ToastAction {
  readonly label: string
  readonly onAction: () => void
}

interface Toast {
  readonly id: number
  readonly message: string
  readonly action: ToastAction | undefined
}

/**
 * Show a toast, optionally with an action.
 *
 * @example
 * const toast = useToast()
 * toast('Post created.')
 * toast('“Hello” moved to the trash.', { label: 'Undo', onAction: restore })
 */
export type ShowToast = (message: string, action?: ToastAction) => void

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
  const show = useCallback<ShowToast>((message, action) => {
    const id = nextId.current++
    setToasts((current) => [...current, { id, message, action }])
  }, [])
  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* A plain polite live region (no role="status"): screens keep their own status messages. */}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-(--z-toast) flex w-80 flex-col gap-2">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} dismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  )
}

/** One toast with its own timer, paused while hovered or focused. */
function ToastItem({ toast, dismiss }: { readonly toast: Toast; readonly dismiss: (id: number) => void }): ReactElement {
  const [paused, setPaused] = useState(false)
  const onDismiss = (): void => dismiss(toast.id)
  useEffect(() => {
    if (paused) return undefined
    // `dismiss` is stable, so other toasts arriving never restart this toast's timer.
    const timer = setTimeout(() => dismiss(toast.id), toast.action === undefined ? TOAST_MS : ACTION_TOAST_MS)
    return () => clearTimeout(timer)
  }, [paused, dismiss, toast.id, toast.action])
  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className="pointer-events-auto flex items-center gap-3 rounded-xl bg-card p-3.5 text-sm shadow-popover"
    >
      <IconCircleCheck aria-hidden="true" className="size-5 shrink-0 text-success" />
      <span className="flex-1">{toast.message}</span>
      {toast.action !== undefined && (
        <button
          type="button"
          onClick={() => {
            toast.action?.onAction()
            onDismiss()
          }}
          className="rounded-md px-2 py-1 text-sm font-semibold text-primary hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Dismiss" onClick={onDismiss} className="rounded p-1 text-muted-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <IconX aria-hidden="true" className="size-4" />
      </button>
    </div>
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
