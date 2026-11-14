/**
 * Floating surfaces: `<DropdownMenu>` parts and `<Popover>` parts (Radix), styled once.
 *
 * Every floating surface shares the same recipe: popover background, hairline border, 10px
 * radius, large soft shadow, and a short pop-in. Menu items highlight with the neutral `subtle`
 * tone; destructive items use `variant="danger"`.
 *
 * @example
 * <DropdownMenu>
 *   <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Row actions"><IconDots /></Button></DropdownMenuTrigger>
 *   <DropdownMenuContent align="end">
 *     <DropdownMenuItem><IconEye /> View</DropdownMenuItem>
 *     <DropdownMenuItem variant="danger"><IconTrash /> Delete</DropdownMenuItem>
 *   </DropdownMenuContent>
 * </DropdownMenu>
 */
import { IconCheck } from '@tabler/icons-react'
import { DropdownMenu as Menu, Popover as PopoverPrimitive } from 'radix-ui'
import type { ComponentProps, ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

/** The shared floating-surface recipe. */
export const floatingClasses = 'z-50 rounded-lg border border-border bg-popover text-popover-foreground shadow-lg outline-none animate-pop-in'

const itemClasses = cn(
  'relative flex cursor-pointer select-none items-center gap-2.5 rounded-md px-2.5 py-2 text-sm outline-none transition-colors',
  'data-highlighted:bg-subtle data-disabled:pointer-events-none data-disabled:opacity-50',
  "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4.5 [&_svg]:text-muted-foreground",
)

export const DropdownMenu = Menu.Root
export const DropdownMenuTrigger = Menu.Trigger
export const DropdownMenuGroup = Menu.Group
export const DropdownMenuRadioGroup = Menu.RadioGroup

export function DropdownMenuContent({ className, sideOffset = 6, ...props }: ComponentProps<typeof Menu.Content>): ReactElement {
  return (
    <Menu.Portal>
      <Menu.Content sideOffset={sideOffset} className={cn(floatingClasses, 'min-w-52 p-1.5', className)} {...props} />
    </Menu.Portal>
  )
}

export function DropdownMenuItem({ className, variant = 'default', ...props }: ComponentProps<typeof Menu.Item> & { readonly variant?: 'default' | 'danger' }): ReactElement {
  return <Menu.Item data-variant={variant} className={cn(itemClasses, variant === 'danger' && 'text-danger [&_svg]:text-danger data-highlighted:bg-danger-soft', className)} {...props} />
}

export function DropdownMenuCheckboxItem({ className, children, ...props }: ComponentProps<typeof Menu.CheckboxItem>): ReactElement {
  return (
    <Menu.CheckboxItem className={cn(itemClasses, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <IconCheck aria-hidden className="size-4 text-primary-soft-foreground!" />
      </Menu.ItemIndicator>
    </Menu.CheckboxItem>
  )
}

export function DropdownMenuRadioItem({ className, children, ...props }: ComponentProps<typeof Menu.RadioItem>): ReactElement {
  return (
    <Menu.RadioItem className={cn(itemClasses, 'pr-8', className)} {...props}>
      {children}
      <Menu.ItemIndicator className="absolute right-2.5">
        <IconCheck aria-hidden className="size-4 text-primary-soft-foreground!" />
      </Menu.ItemIndicator>
    </Menu.RadioItem>
  )
}

export function DropdownMenuLabel({ className, ...props }: ComponentProps<typeof Menu.Label>): ReactElement {
  return <Menu.Label className={cn('px-2.5 pb-1 pt-2 text-overline font-semibold uppercase text-muted-foreground', className)} {...props} />
}

export function DropdownMenuSeparator({ className, ...props }: ComponentProps<typeof Menu.Separator>): ReactElement {
  return <Menu.Separator className={cn('-mx-1.5 my-1.5 h-px bg-border', className)} {...props} />
}

export const Popover = PopoverPrimitive.Root
export const PopoverTrigger = PopoverPrimitive.Trigger
export const PopoverAnchor = PopoverPrimitive.Anchor
export const PopoverClose = PopoverPrimitive.Close

export function PopoverContent({ className, sideOffset = 8, align = 'start', ...props }: ComponentProps<typeof PopoverPrimitive.Content>): ReactElement {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content sideOffset={sideOffset} align={align} className={cn(floatingClasses, 'w-80 max-w-[calc(100vw-2rem)] p-4', className)} {...props} />
    </PopoverPrimitive.Portal>
  )
}
