/**
 * Glass menus and popovers on Radix: DropdownMenu parts and a Popover wrapper.
 *
 * Overlays are the one place glass blurs heavily (`glass-overlay`): they sit over busy content.
 *
 * @example
 *   <DropdownMenu.Root>
 *     <DropdownMenu.Trigger asChild><Button variant="ghost" size="icon-sm" aria-label="Row actions"><IconDots /></Button></DropdownMenu.Trigger>
 *     <MenuContent align="end"><MenuItem icon={<IconEye />} onSelect={open}>View</MenuItem></MenuContent>
 *   </DropdownMenu.Root>
 */
import { DropdownMenu, Popover as RadixPopover } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export { DropdownMenu }

const overlayClass = 'glass-overlay animate-glass-in z-(--z-dropdown) rounded-lg p-1.5 outline-none'

export function MenuContent({ className, sideOffset = 8, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={sideOffset} className={cn(overlayClass, 'min-w-48', className)} {...props} />
    </DropdownMenu.Portal>
  )
}

const itemClass = cn(
  'flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-2 text-base text-fg outline-none transition-fast',
  'data-highlighted:bg-primary-soft data-highlighted:text-primary-soft-fg data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
)

export interface MenuItemProps extends ComponentProps<typeof DropdownMenu.Item> {
  readonly icon?: ReactNode
  readonly shortcut?: string
  readonly destructive?: boolean
}

export function MenuItem({ icon, shortcut, destructive = false, className, children, ...props }: MenuItemProps) {
  return (
    <DropdownMenu.Item className={cn(itemClass, destructive && 'text-danger data-highlighted:bg-danger-soft data-highlighted:text-danger', className)} {...props}>
      {icon !== undefined && (
        <span className="text-current opacity-80" aria-hidden>
          {icon}
        </span>
      )}
      <span className="flex-1">{children}</span>
      {shortcut !== undefined && <span className="text-xs tracking-wide text-fg-muted">{shortcut}</span>}
    </DropdownMenu.Item>
  )
}

export function MenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(itemClass, 'pl-8 relative', className)} {...props}>
      <span className="absolute left-2.5 grid size-4 place-items-center rounded-xs border border-input data-[state=checked]:border-control">
        <DropdownMenu.ItemIndicator className="size-2 rounded-[2px] bg-control" />
      </span>
      {children}
    </DropdownMenu.CheckboxItem>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn('px-2.5 pt-1.5 pb-1 text-2xs font-semibold tracking-[0.08em] text-fg-muted uppercase', className)} {...props} />
}

export function MenuSeparator() {
  return <DropdownMenu.Separator className="-mx-1.5 my-1.5 h-px bg-border" />
}

/** A glass popover panel. Use for filters and other small forms. */
export const Popover = RadixPopover.Root
export const PopoverTrigger = RadixPopover.Trigger

export function PopoverContent({ className, sideOffset = 8, align = 'start', ...props }: ComponentProps<typeof RadixPopover.Content>) {
  return (
    <RadixPopover.Portal>
      <RadixPopover.Content sideOffset={sideOffset} align={align} className={cn(overlayClass, 'p-4', className)} {...props} />
    </RadixPopover.Portal>
  )
}
