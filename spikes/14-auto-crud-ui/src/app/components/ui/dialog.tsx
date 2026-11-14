/**
 * `<Dialog>`: a modal dialog with the accessibility behaviour people expect from shadcn's
 * (Radix) dialog, written out in a few lines so the owned copy has no extra dependency:
 *
 * - focus moves into the dialog when it opens, and back to the opener when it closes;
 * - Tab and Shift+Tab stay inside the dialog (focus trap);
 * - Escape and a click on the backdrop close it;
 * - `aria-modal`, `aria-labelledby` and `aria-describedby` are wired.
 *
 * @module
 */
import { useEffect, useRef, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '../../lib/cn.ts'

/** Elements that can receive keyboard focus, for the trap. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Props of {@link Dialog}.
 *
 * @example
 * const props: DialogProps = { open: true, onClose: close, labelledBy: 'title-id', children: null }
 */
export interface DialogProps {
  readonly open: boolean
  readonly onClose: () => void
  /** Id of the element that names the dialog (its heading). */
  readonly labelledBy: string
  readonly describedBy?: string
  /** `alertdialog` for confirmations that need an answer (delete), `dialog` otherwise. */
  readonly role?: 'dialog' | 'alertdialog'
  /** Element to focus first; defaults to the first focusable element. */
  readonly initialFocus?: RefObject<HTMLElement | null>
  readonly children: ReactNode
  readonly className?: string
}

/**
 * A modal dialog rendered into `document.body`.
 *
 * @example
 * <Dialog open={open} onClose={() => setOpen(false)} labelledBy="confirm-title" role="alertdialog">
 *   <h2 id="confirm-title">Delete this post?</h2>
 * </Dialog>
 */
export function Dialog(props: DialogProps): ReactElement | null {
  if (!props.open) return null
  return createPortal(<OpenDialog {...props} />, document.body)
}

function OpenDialog({ onClose, labelledBy, describedBy, role = 'dialog', initialFocus, children, className }: DialogProps): ReactElement {
  const panel = useRef<HTMLDivElement>(null)
  useFocusOnOpenAndRestoreOnClose(panel, initialFocus)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key === 'Tab') trapTab(event, panel.current)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 pt-[15vh]" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        onKeyDown={onKeyDown}
        className={cn('w-full max-w-lg rounded-lg border bg-background p-5 text-foreground shadow-lg', className)}
      >
        {children}
      </div>
    </div>
  )
}

/** Focus the right element when the dialog mounts, and give focus back to the opener on unmount. */
function useFocusOnOpenAndRestoreOnClose(panel: RefObject<HTMLDivElement | null>, initialFocus: RefObject<HTMLElement | null> | undefined): void {
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = initialFocus?.current ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE) ?? panel.current
    target?.focus()
    return () => opener?.focus()
    // Runs once per opening on purpose: re-focusing on every render would fight the user.
  }, [])
}

/** Keep Tab inside the panel: wrap from the last element to the first and back. */
function trapTab(event: KeyboardEvent<HTMLDivElement>, panel: HTMLDivElement | null): void {
  if (panel === null) return
  const focusable = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)]
  const first = focusable[0]
  const last = focusable.at(-1)
  if (first === undefined || last === undefined) return
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault()
    last.focus()
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}
