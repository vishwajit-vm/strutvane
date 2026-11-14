/**
 * `<DropdownMenu>`: a menu button (WAI-ARIA "menu button" pattern) for the user menu and
 * notifications.
 *
 * - The trigger has `aria-haspopup="menu"` and `aria-expanded`.
 * - Opening moves focus to the first item; Down/Up/Home/End move; Escape closes and returns focus.
 * - Tab or a click outside closes it.
 *
 * @module
 */
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactElement, type ReactNode, type RefObject } from 'react'
import { cn } from '../../lib/cn.ts'

/**
 * One menu entry. An item without `onSelect` is informative text (for example a notification).
 *
 * @example
 * const item: DropdownItem = { id: 'sign-out', label: 'Sign out', onSelect: signOut }
 */
export interface DropdownItem {
  readonly id: string
  readonly label: ReactNode
  readonly icon?: ReactNode
  readonly onSelect?: () => void
}

/**
 * Props of {@link DropdownMenu}.
 *
 * @example
 * const props: DropdownMenuProps = { label: 'Account', trigger: <Avatar name="Asha" />, items: [] }
 */
export interface DropdownMenuProps {
  /** Accessible name of the trigger button (and of the menu). */
  readonly label: string
  readonly trigger: ReactNode
  /** Optional block above the items (the signed-in user's name). */
  readonly header?: ReactNode
  readonly items: readonly DropdownItem[]
  /** Shown when there are no items ("No new notifications"). */
  readonly empty?: ReactNode
  readonly align?: 'start' | 'end'
}

/**
 * A dropdown menu.
 *
 * @example
 * <DropdownMenu label="Account" trigger={<Avatar name={user.email} />} items={[{ id: 'out', label: 'Sign out', onSelect: signOut }]} />
 */
export function DropdownMenu({ label, trigger, header, items, empty, align = 'end' }: DropdownMenuProps): ReactElement {
  const [open, setOpen] = useState(false)
  const menuId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  useCloseOnOutsideClick(open, menu, button, () => setOpen(false))
  useEffect(() => {
    // Focus the first item when the menu opens (or the menu itself when it only has text).
    if (open) (menu.current?.querySelector<HTMLElement>('[role="menuitem"]') ?? menu.current)?.focus()
  }, [open])

  const close = (returnFocus: boolean): void => {
    setOpen(false)
    if (returnFocus) button.current?.focus()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const entries = [...(menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])]
    const index = entries.findIndex((entry) => entry === document.activeElement)
    const target = targetIndex(event.key, index, entries.length)
    if (event.key === 'Escape') {
      event.preventDefault()
      close(true)
    } else if (event.key === 'Tab') {
      close(false)
    } else if (target !== undefined && entries.length > 0) {
      event.preventDefault()
      entries[(target + entries.length) % entries.length]?.focus()
    }
  }

  return (
    <div className="relative">
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((current) => !current)}
        className="relative inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {trigger}
      </button>
      {open && (
        <div
          ref={menu}
          id={menuId}
          role="menu"
          aria-label={label}
          tabIndex={-1}
          onKeyDown={onKeyDown}
          className={cn('absolute z-(--z-dropdown) mt-2 w-72 rounded-xl bg-card p-1.5 text-card-foreground shadow-popover outline-none', align === 'end' ? 'right-0' : 'left-0')}
        >
          {header !== undefined && <div className="border-b px-3 pb-2 pt-1.5">{header}</div>}
          {items.length === 0 && empty !== undefined && <p className="px-3 py-4 text-center text-sm text-muted-foreground">{empty}</p>}
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true)
                item.onSelect?.()
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground focus-visible:outline-none"
            >
              {item.icon}
              <span className="flex-1">{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Where a navigation key moves focus, or `undefined` for other keys. */
function targetIndex(key: string, current: number, count: number): number | undefined {
  if (key === 'ArrowDown') return current + 1
  if (key === 'ArrowUp') return current - 1
  if (key === 'Home') return 0
  if (key === 'End') return count - 1
  return undefined
}

/** Close the menu on a pointer press outside both the menu and its trigger. */
function useCloseOnOutsideClick(open: boolean, menu: RefObject<HTMLDivElement | null>, button: RefObject<HTMLButtonElement | null>, close: () => void): void {
  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Node && !menu.current?.contains(target) && !button.current?.contains(target)) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, menu, button, close])
}
