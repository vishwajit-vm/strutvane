/**
 * Tabs with an underline indicator: the active tab gets the foreground colour and a 2 px line,
 * inactive tabs stay muted. Arrow keys move between tabs (Radix, automatic activation).
 *
 * @example
 * <Tabs.Root value={tab} onValueChange={setTab}>
 *   <TabsList aria-label="Invoice sections"><TabsTrigger value="overview">Overview</TabsTrigger></TabsList>
 *   <Tabs.Content value="overview">…</Tabs.Content>
 * </Tabs.Root>
 */
import { Tabs as TabsPrimitive } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '../../lib/cn.ts'

export const Tabs = TabsPrimitive

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  // The baseline is an inset shadow, not a border, so the list can scroll sideways on phones
  // (overflow-x) without clipping the 2 px indicator or growing a vertical scrollbar.
  return (
    <TabsPrimitive.List
      className={cn('scroll-quiet relative flex items-center gap-5 overflow-x-auto overflow-y-hidden shadow-[inset_0_-1px_0_var(--border)]', className)}
      {...props}
    />
  )
}

export function TabsTrigger({ className, count, children, ...props }: ComponentProps<typeof TabsPrimitive.Trigger> & { count?: number; children: ReactNode }) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative inline-flex h-10 shrink-0 cursor-pointer items-center gap-1.5 border-b-2 border-transparent text-sm font-medium text-fg-muted transition-colors duration-150',
        'hover:text-fg data-[state=active]:border-fg data-[state=active]:text-fg',
        className,
      )}
      {...props}
    >
      {children}
      {count !== undefined && <span className="rounded-sm bg-subtle px-1.5 text-xs tabular text-fg-muted">{count}</span>}
    </TabsPrimitive.Trigger>
  )
}
