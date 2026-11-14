/**
 * `<ViewSwitch>`: Table / Board / Calendar for the invoices resource (the resource-views
 * package's switch). Links, not buttons: each view has its own URL so it can be bookmarked.
 *
 * @example
 * <ViewSwitch current="table" />
 */
import { IconCalendarMonth, IconLayoutKanban, IconTable } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import { Tooltip } from '../../components/ui/misc.tsx'
import { cn } from '../../lib/cn.ts'
import { Link } from '../../lib/router.tsx'

const VIEWS = [
  { id: 'table', label: 'Table view', to: '/invoices', icon: IconTable },
  { id: 'board', label: 'Board view', to: '/invoices/board', icon: IconLayoutKanban },
  { id: 'calendar', label: 'Calendar view', to: '/invoices/calendar', icon: IconCalendarMonth },
] as const

export function ViewSwitch({ current }: { readonly current: (typeof VIEWS)[number]['id'] }): ReactElement {
  return (
    <nav aria-label="Views" className="inline-flex shrink-0 rounded-lg bg-muted p-1">
      {VIEWS.map((view) => (
        <Tooltip key={view.id} content={view.label} side="bottom">
          <Link
            to={view.to}
            aria-label={view.label}
            aria-current={current === view.id ? 'page' : undefined}
            className={cn(
              'grid size-7.5 place-items-center rounded-md text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/30',
              current === view.id && 'bg-card text-primary-soft-foreground shadow-sm',
            )}
          >
            <view.icon aria-hidden className="size-4.5" />
          </Link>
        </Tooltip>
      ))}
    </nav>
  )
}
