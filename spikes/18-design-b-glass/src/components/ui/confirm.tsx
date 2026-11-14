/**
 * Confirm dialog as a promise: `await confirm({...})` resolves true (confirmed) or false.
 *
 * Why a promise: destructive actions read top-to-bottom at the call site
 * (`if (await confirm(...)) deleteIt()`), and there is exactly one dialog instance for the app.
 * Built on Radix AlertDialog: focus starts on Cancel (the safe choice), Escape cancels.
 *
 * @example
 *   const confirm = useConfirm()
 *   if (await confirm({ title: 'Delete 3 invoices?', description: 'This cannot be undone.', confirmLabel: 'Delete', destructive: true })) remove()
 */
import { IconAlertTriangle } from '@tabler/icons-react'
import { AlertDialog } from 'radix-ui'
import { createContext, use, useCallback, useRef, useState, type ReactNode } from 'react'
import { Button } from './button.tsx'

export interface ConfirmOptions {
  readonly title: string
  readonly description: string
  readonly confirmLabel: string
  readonly destructive?: boolean
}

type Confirm = (options: ConfirmOptions) => Promise<boolean>

const ConfirmContext = createContext<Confirm | null>(null)

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null)
  const resolver = useRef<((answer: boolean) => void) | null>(null)

  const confirm = useCallback<Confirm>((next) => {
    // A second request while one is open cancels the first (fail safe: false).
    resolver.current?.(false)
    setOptions(next)
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve
    })
  }, [])

  const answer = (value: boolean): void => {
    resolver.current?.(value)
    resolver.current = null
    setOptions(null)
  }

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog.Root open={options !== null} onOpenChange={(open) => !open && answer(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="animate-glass-fade fixed inset-0 z-(--z-overlay) bg-scrim" />
          <AlertDialog.Content className="glass-overlay animate-glass-in fixed top-1/2 left-1/2 z-(--z-overlay) w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl p-6">
            <div className="flex gap-4">
              {options?.destructive === true && (
                <span className="grid size-11 shrink-0 place-items-center rounded-full bg-danger-soft text-danger" aria-hidden>
                  <IconAlertTriangle className="size-5" />
                </span>
              )}
              <div className="min-w-0">
                <AlertDialog.Title className="text-lg font-semibold tracking-tight text-fg">{options?.title}</AlertDialog.Title>
                <AlertDialog.Description className="mt-1.5 text-base text-fg-muted">{options?.description}</AlertDialog.Description>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <Button variant="secondary">Cancel</Button>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <Button variant={options?.destructive === true ? 'danger' : 'primary'} onClick={() => answer(true)}>
                  {options?.confirmLabel}
                </Button>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </ConfirmContext>
  )
}

export function useConfirm(): Confirm {
  const confirm = use(ConfirmContext)
  if (confirm === null) throw new Error('useConfirm() needs <ConfirmProvider> above it (see src/main.tsx).')
  return confirm
}
