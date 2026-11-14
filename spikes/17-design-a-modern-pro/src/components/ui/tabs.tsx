/**
 * `<Tabs>` (Radix): two looks from one component.
 *
 * - `pill` (default): accent-filled pills, for page-level sections (account settings);
 * - `line`: an underline, for tabs inside a card or under a page header (record detail).
 *
 * The list scrolls horizontally on phones instead of wrapping, so tab order never jumps around.
 *
 * @example
 * <Tabs defaultValue="overview">
 *   <TabsList variant="line"><TabsTrigger value="overview">Overview</TabsTrigger></TabsList>
 *   <TabsContent value="overview">…</TabsContent>
 * </Tabs>
 */
import { Tabs as TabsPrimitive } from 'radix-ui'
import { createContext, useContext, type ComponentProps, type ReactElement } from 'react'
import { cn } from '../../lib/cn.ts'

type TabsVariant = 'pill' | 'line'
const VariantContext = createContext<TabsVariant>('pill')

export const Tabs = TabsPrimitive.Root

export function TabsList({ variant = 'pill', className, ...props }: ComponentProps<typeof TabsPrimitive.List> & { readonly variant?: TabsVariant }): ReactElement {
  return (
    <VariantContext value={variant}>
      <TabsPrimitive.List
        className={cn(
          'scrollbar-thin relative flex max-w-full items-center overflow-x-auto overflow-y-hidden',
          variant === 'pill' ? '-my-1.5 gap-1.5 py-1.5' : 'gap-1 border-b border-border',
          className,
        )}
        {...props}
      />
    </VariantContext>
  )
}

export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>): ReactElement {
  const variant = useContext(VariantContext)
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center gap-2 whitespace-nowrap text-sm font-semibold outline-none transition-colors [&_svg]:size-4.5',
        'focus-visible:ring-3 focus-visible:ring-ring/30',
        variant === 'pill' &&
          'h-9.5 rounded-md px-4 text-muted-foreground hover:bg-subtle hover:text-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-primary',
        variant === 'line' &&
          '-mb-px h-11 rounded-t-md border-b-2 border-transparent px-3 text-muted-foreground hover:text-foreground data-[state=active]:border-primary data-[state=active]:text-primary-soft-foreground',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({ className, ...props }: ComponentProps<typeof TabsPrimitive.Content>): ReactElement {
  return <TabsPrimitive.Content className={cn('outline-none', className)} {...props} />
}
