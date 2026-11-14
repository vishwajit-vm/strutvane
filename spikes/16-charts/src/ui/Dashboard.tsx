/**
 * `<Dashboard>`: a grid of live widgets. Used for the home dashboard, a resource's "Insights" tab
 * and named package dashboards alike; which widgets appear is decided by `dashboard.ts`.
 *
 * @module
 */
import { IconLayoutDashboard } from '@tabler/icons-react'
import type { ReactElement } from 'react'
import type { WidgetSpec } from '../shared/widgets.ts'
import { DashboardGrid, WidgetSlot } from './components/DashboardGrid.tsx'
import { Widget, type WidgetContext } from './Widget.tsx'

/**
 * Props of {@link Dashboard}.
 *
 * @example
 * <Dashboard label="Overview" widgets={homeDashboardWidgets(resolved, canViewAny)} context={context} />
 */
export interface DashboardProps {
  /** The grid's accessible name ("Overview", "Invoice insights"). */
  readonly label: string
  readonly widgets: readonly WidgetSpec[]
  readonly context: WidgetContext
}

/**
 * Render widgets in the responsive grid, or a friendly empty state.
 *
 * @example
 * <Dashboard label="Sales" widgets={widgets} context={context} />
 */
export function Dashboard({ label, widgets, context }: DashboardProps): ReactElement {
  if (widgets.length === 0) {
    return (
      <div role="status" className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
        <IconLayoutDashboard aria-hidden="true" className="size-7" stroke={1.5} />
        <p>No charts here yet. Add widgets in resources/charts/*.charts.ts, or ask for access to more data.</p>
      </div>
    )
  }
  return (
    <DashboardGrid label={label}>
      {widgets.map((widget) => (
        <WidgetSlot key={widget.id} size={widget.size}>
          <Widget widget={widget} context={context} />
        </WidgetSlot>
      ))}
    </DashboardGrid>
  )
}
