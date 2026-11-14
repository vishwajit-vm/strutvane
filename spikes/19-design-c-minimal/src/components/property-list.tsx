/**
 * PropertyList: label/value pairs as a description list (`<dl>`), the standard way Crisp shows
 * a record's fields in the detail page's side panel and in the drawer.
 *
 * Labels sit in a fixed 112 px column in the muted colour; values take the rest, so a column of
 * properties reads as a clean two-column grid at any width.
 *
 * @example <PropertyList items={[{ label: 'Status', value: <InvoiceStatusBadge status="paid" /> }]} />
 */
import type { ReactNode } from 'react'
import { cn } from '../lib/cn.ts'

export interface Property {
  label: string
  value: ReactNode
}

export function PropertyList({ items, className }: { items: readonly Property[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-0 text-sm', className)}>
      {items.map((item) => (
        <div key={item.label} className="col-span-2 grid grid-cols-subgrid items-center py-1.5">
          <dt className="text-fg-subtle">{item.label}</dt>
          <dd className="min-w-0 text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
