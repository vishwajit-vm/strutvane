/**
 * Toasts on Radix Toast (announced politely to screen readers, swipe to dismiss, pause on hover).
 *
 * `toast()` can be called from anywhere (event handlers, after a save) without a hook: a tiny
 * module-level store holds the queue and `<Toaster>` renders it.
 *
 * @example
 * toast({ tone: 'success', title: 'Invoice saved', description: 'INV-1065 was created.' })
 */
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconX } from '@tabler/icons-react'
import { Toast as ToastPrimitive } from 'radix-ui'
import { useSyncExternalStore, type ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'
import { TONE_SOFT } from './tone.ts'

/** A toast to show. */
export interface ToastInput {
  readonly title: string
  readonly description?: string
  readonly tone?: 'success' | 'danger' | 'info' | 'warning'
}

interface QueuedToast extends ToastInput {
  readonly id: number
}

let queue: readonly QueuedToast[] = []
let nextId = 1
const listeners = new Set<() => void>()
const emit = (): void => listeners.forEach((listener) => listener())

/** Show a toast. Keeps at most three on screen; the oldest leaves first. */
export function toast(input: ToastInput): void {
  queue = [...queue, { ...input, id: nextId++ }].slice(-3)
  emit()
}

function dismiss(id: number): void {
  queue = queue.filter((item) => item.id !== id)
  emit()
}

const ICONS = { success: IconCircleCheck, danger: IconAlertTriangle, warning: IconAlertTriangle, info: IconInfoCircle } as const

/** Renders the toast queue. Mount once at the app root. */
export function Toaster(): ReactElement {
  const items = useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => queue,
    () => queue,
  )
  return (
    <ToastPrimitive.Provider swipeDirection="right" duration={5000}>
      {items.map((item) => {
        const tone = item.tone ?? 'success'
        const Icon = ICONS[tone]
        return (
          <ToastPrimitive.Root
            key={item.id}
            onOpenChange={(open) => (open ? undefined : dismiss(item.id))}
            className="relative flex w-full items-start gap-3 rounded-xl border border-border bg-popover p-4 pr-10 text-popover-foreground shadow-xl animate-slide-in-right data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x) data-[swipe=end]:hidden"
          >
            <span aria-hidden className={cn('grid size-8 shrink-0 place-items-center rounded-md', TONE_SOFT[tone])}>
              <Icon className="size-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <ToastPrimitive.Title className="text-sm font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description === undefined ? null : <ToastPrimitive.Description className="mt-0.5 text-label text-muted-foreground">{item.description}</ToastPrimitive.Description>}
            </div>
            <ToastPrimitive.Close aria-label="Dismiss notification" className="absolute right-2.5 top-2.5 grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-subtle">
              <IconX aria-hidden className="size-4" />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        )
      })}
      <ToastPrimitive.Viewport className="fixed right-4 top-18 z-[60] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 outline-none" />
    </ToastPrimitive.Provider>
  )
}
