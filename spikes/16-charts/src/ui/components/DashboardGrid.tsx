/**
 * `<DashboardGrid>`: the responsive grid widgets sit in (DESIGN.md §3 "Grid": `gap-6`; KPI cards
 * 1 → 2 → 4 per row; charts 2/3 + 1/3 on wide screens).
 *
 * A 12-column grid on extra-large screens, 6 columns from `sm`, one column on phones:
 *
 * | size | phone | sm (6) | xl (12) |
 * |---|---|---|---|
 * | `sm` (KPI) | full | half | quarter |
 * | `md` | full | full | third |
 * | `lg` | full | full | two thirds |
 * | `full` | full | full | full |
 *
 * @module
 */
import type { ReactElement, ReactNode } from 'react'
import type { WidgetSize } from '../../shared/widgets.ts'

/** Literal class names, so Tailwind's scanner sees every one of them. */
const SPANS: Readonly<Record<WidgetSize, string>> = {
  sm: 'sm:col-span-3 xl:col-span-3',
  md: 'sm:col-span-6 xl:col-span-4',
  lg: 'sm:col-span-6 xl:col-span-8',
  full: 'sm:col-span-6 xl:col-span-12',
}

/**
 * The grid.
 *
 * @example
 * <DashboardGrid label="Overview"><WidgetSlot size="sm">…</WidgetSlot></DashboardGrid>
 */
export function DashboardGrid({ label, children }: { readonly label: string; readonly children: ReactNode }): ReactElement {
  return (
    <div role="list" aria-label={label} className="grid grid-cols-1 gap-6 sm:grid-cols-6 xl:grid-cols-12">
      {children}
    </div>
  )
}

/**
 * One cell of the grid, sized for its widget.
 *
 * @example
 * <WidgetSlot size="lg"><ChartCard … /></WidgetSlot>
 */
export function WidgetSlot({ size, children }: { readonly size: WidgetSize; readonly children: ReactNode }): ReactElement {
  return (
    <div role="listitem" className={`min-w-0 ${SPANS[size]}`}>
      {children}
    </div>
  )
}
