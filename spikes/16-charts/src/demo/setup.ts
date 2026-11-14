/**
 * The demo app's wiring, as an app would write it: resolve the generated metadata with the owned
 * chart files, register a named dashboard (what a package provider's `boot()` would do), and say
 * who may see what.
 *
 * @module
 */
import { metadata, ownedCharts } from '../../example/.strutvane/charts.gen.ts'
import { dashboardNavigation, dashboardWidgets, defineDashboard, homeDashboardWidgets, type DashboardDefinition, type NavigationItem } from '../shared/dashboard.ts'
import { resolveCharts } from '../shared/resolve.ts'
import type { WidgetSpec } from '../shared/widgets.ts'

/** Every resource's charts, resolved once (the same call the server makes). */
export const resolved = resolveCharts(metadata, ownedCharts)

export { metadata }

/**
 * A named dashboard, as a billing package would add it with `app.dashboards.add(...)`.
 *
 * @example
 * salesDashboard.widgets // ['invoices.revenue', …]
 */
export const salesDashboard: DashboardDefinition = defineDashboard({
  name: 'sales',
  label: 'Sales',
  icon: 'chart-bar',
  permission: 'dashboards.sales',
  widgets: ['invoices.revenue', 'invoices.new', 'customers.new', 'invoices.sum-total', 'invoices.top-customer', 'customers.by-country', 'invoices.per-period-by-status'],
})

/** The demo user is an admin: they may list every resource and open the sales dashboard. */
export const canViewAny = (resource: string): boolean => resolved.has(resource)
export const can = (permission: string): boolean => permission.startsWith('dashboards.')

/**
 * A page of the demo: the home dashboard, a resource's insights, or a named dashboard.
 *
 * @example
 * const page: DemoPage = { id: 'home', label: 'Dashboard', title: 'Dashboard', widgets: [] }
 */
export interface DemoPage {
  readonly id: string
  readonly label: string
  readonly title: string
  readonly group?: string
  readonly icon: string
  readonly widgets: readonly WidgetSpec[]
}

/** The sidebar: Dashboard, one "Insights" entry per resource with widgets, then named dashboards. */
export function demoPages(): DemoPage[] {
  const insights = [...resolved.values()]
    .filter((charts) => charts.widgets.length > 0 && canViewAny(charts.resource.route))
    .sort((a, b) => a.sort - b.sort)
    .map((charts) => ({ id: charts.resource.route, label: charts.resource.label.plural, title: `${charts.resource.label.singular} insights`, group: 'Insights', icon: 'chart-line', widgets: charts.widgets }))
  const named = dashboardNavigation([salesDashboard])
    .filter((item: NavigationItem) => can(item.permission))
    .map((item) => ({ id: item.name, label: item.label, title: `${item.label} dashboard`, icon: item.icon, ...(item.group === undefined ? {} : { group: item.group }), widgets: dashboardWidgets(salesDashboard, resolved, canViewAny) }))
  return [{ id: 'home', label: 'Dashboard', title: 'Dashboard', icon: 'dashboard', widgets: homeDashboardWidgets(resolved, canViewAny) }, ...insights, ...named]
}
