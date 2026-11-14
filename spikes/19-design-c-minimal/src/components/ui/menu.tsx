/**
 * Dropdown menu, popover and tooltip: the floating layers. They share one surface
 * (`floatingClasses`): hairline border, 8 px radius, the only real shadow in the system, and a
 * 140 ms pop-in. Radix supplies focus management, typeahead, Escape and outside-click handling.
 *
 * @example
 * <Menu.Root>
 *   <Menu.Trigger asChild><Button variant="ghost" size="icon" aria-label="Row actions"><Ellipsis /></Button></Menu.Trigger>
 *   <MenuContent align="end">
 *     <MenuItem onSelect={edit}><Pencil /> Edit <MenuShortcut>E</MenuShortcut></MenuItem>
 *   </MenuContent>
 * </Menu.Root>
 */
import { Check } from 'lucide-react'
import { DropdownMenu, Popover as PopoverPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export const floatingClasses = 'z-50 rounded-lg border border-border bg-surface text-fg shadow-pop animate-pop-in outline-none'

export const Menu = DropdownMenu

export function MenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof DropdownMenu.Content>) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content sideOffset={sideOffset} className={cn(floatingClasses, 'min-w-48 p-1', className)} {...props} />
    </DropdownMenu.Portal>
  )
}

const itemClasses = cn(
  'relative flex h-control-md cursor-pointer select-none items-center gap-2 rounded-md px-2 text-sm text-fg outline-none',
  'data-[highlighted]:bg-subtle data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  '[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle',
)

export function MenuItem({ className, destructive = false, ...props }: ComponentProps<typeof DropdownMenu.Item> & { destructive?: boolean }) {
  return <DropdownMenu.Item className={cn(itemClasses, destructive && 'text-danger-text [&_svg]:text-danger-text', className)} {...props} />
}

/** A checkable item (column visibility). The check sits in a fixed slot so labels stay aligned. */
export function MenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof DropdownMenu.CheckboxItem>) {
  return (
    <DropdownMenu.CheckboxItem className={cn(itemClasses, 'pl-8', className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2 flex items-center">
        <Check aria-hidden className="text-accent-text!" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.CheckboxItem>
  )
}

/** A radio item (density, sort). */
export function MenuRadioItem({ className, children, ...props }: ComponentProps<typeof DropdownMenu.RadioItem>) {
  return (
    <DropdownMenu.RadioItem className={cn(itemClasses, 'pl-8', className)} {...props}>
      <DropdownMenu.ItemIndicator className="absolute left-2 flex items-center">
        <Check aria-hidden className="text-accent-text!" />
      </DropdownMenu.ItemIndicator>
      {children}
    </DropdownMenu.RadioItem>
  )
}

export function MenuLabel({ className, ...props }: ComponentProps<typeof DropdownMenu.Label>) {
  return <DropdownMenu.Label className={cn('px-2 pb-1 pt-1.5 text-xs font-medium text-fg-subtle', className)} {...props} />
}

export function MenuSeparator({ className, ...props }: ComponentProps<typeof DropdownMenu.Separator>) {
  return <DropdownMenu.Separator className={cn('-mx-1 my-1 h-px bg-border', className)} {...props} />
}

/** Right-aligned shortcut hint inside a menu item. */
export function MenuShortcut({ children }: { children: ReactNode }) {
  return <span className="ml-auto pl-4 text-xs tracking-wide text-fg-subtle">{children}</span>
}

export const Popover = PopoverPrimitive

export function PopoverContent({ className, sideOffset = 6, align = 'start', ...props }: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} align={align} className={cn(floatingClasses, 'w-72 p-3', className)} {...props} />
    </PopoverPrimitive.Portal>
  )
}

/**
 * A tooltip for icon buttons and truncated text. Tooltips repeat the accessible name; they never
 * hold information that is not available another way (they are invisible on touch screens).
 */
export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 rounded-md bg-inverse px-2 py-1 text-xs font-medium text-inverse-fg shadow-pop animate-fade-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  )
}

export const TooltipProvider = TooltipPrimitive.Provider
