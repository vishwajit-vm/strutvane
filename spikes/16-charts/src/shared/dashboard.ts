/**
 * How widgets reach screens: the home dashboard, each resource's "Insights" tab, and named
 * dashboards that packages or the app add to the sidebar.
 *
 * - **Home dashboard (`/`)**: every resource's `dashboard` picks (see `resolve.ts`), for resources
 *   the user may `viewAny`, ordered by the resource's `sort` then label.
 * - **Insights tab (`/<resource>?tab=insights`)**: all of that resource's widgets.
 * - **Named dashboards (`/dashboards/<name>`)**: `defineDashboard({...})`, registered from a
 *   provider's `boot()` with `app.dashboards.add(dashboard)` (spike 12's provider pattern). Each one
 *   becomes a sidebar entry in spike 14's package-entry shape, so the sidebar code needs no change,
 *   and it is shown only with its `permission` (deny by default).
 *
 * Why widgets are always filtered by `viewAny` here: a chart is a list query in disguise. A user
 * who can't list invoices must not see "Invoices by status" either, on any dashboard. The API
 * refuses too (403); this filter only keeps the screen tidy.
 *
 * @module
 */
import type { ResolvedResourceCharts } from './resolve.ts'
import type { WidgetSpec } from './widgets.ts'

/**
 * A sidebar entry contributed by a package, in exactly the shape spike 14's `buildNavigation`
 * and spike 12's `app.navigation.add` use.
 *
 * @example
 * const item: NavigationItem = { name: 'dashboards.sales', label: 'Sales', path: '/dashboards/sales', icon: 'chart-bar', group: 'Dashboards', permission: 'dashboards.sales' }
 */
export interface NavigationItem {
  readonly name: string
  readonly label: string
  readonly path: string
  readonly icon: string
  readonly group?: string
  readonly sort?: number
  readonly permission: string
}

/**
 * A named dashboard: a title plus widget ids from any resources.
 *
 * @example
 * const sales: DashboardDefinition = defineDashboard({ name: 'sales', label: 'Sales', permission: 'dashboards.sales', widgets: ['invoices.new', 'invoices.sum-total'] })
 */
export interface DashboardDefinition {
  /** URL segment: `/dashboards/<name>`. Lowercase letters, digits and dashes. */
  readonly name: string
  readonly label: string
  /** A Tabler icon name (spike 14's icon set). Default `chart-bar`. */
  readonly icon?: string
  /** Sidebar group. Default `Dashboards`. */
  readonly group?: string
  readonly sort?: number
  /** The permission that shows the entry and the page. Required: there is no public dashboard. */
  readonly permission: string
  /** Widget ids (`<resource>.<name>`), in display order. */
  readonly widgets: readonly string[]
}

/**
 * Thrown for a dashboard definition that can't work. The message says how to fix it.
 *
 * @example
 * try { defineDashboard({ name: 'Sales!', … }) } catch (error) { console.error((error as Error).message) }
 */
export class DashboardDefinitionError extends Error {
  override readonly name = 'DashboardDefinitionError'
}

const DASHBOARD_NAME = /^[a-z][a-z0-9-]{0,48}$/

/**
 * Declare a named dashboard. Checked when it is defined (at boot), not when someone opens it.
 *
 * @example
 * export const salesDashboard = defineDashboard({
 *   name: 'sales', label: 'Sales', permission: 'dashboards.sales',
 *   widgets: ['invoices.new', 'invoices.sum-total', 'invoices.top-customer'],
 * })
 */
export function defineDashboard(definition: DashboardDefinition): DashboardDefinition {
  if (!DASHBOARD_NAME.test(definition.name)) {
    throw new DashboardDefinitionError(`Dashboard name "${definition.name}" can't be used in a URL. Use lowercase letters, digits and dashes, such as "sales-overview".`)
  }
  if (definition.permission.trim() === '') {
    throw new DashboardDefinitionError(`Dashboard "${definition.name}" needs a permission. Dashboards are never public; use something like "dashboards.${definition.name}".`)
  }
  const duplicate = definition.widgets.find((id, index) => definition.widgets.indexOf(id) !== index)
  if (duplicate !== undefined) throw new DashboardDefinitionError(`Dashboard "${definition.name}" lists "${duplicate}" twice. Remove one.`)
  return definition
}

/**
 * Sidebar entries for named dashboards (spike 14's package-entry shape).
 *
 * @example
 * dashboardNavigation([salesDashboard])[0]?.path // '/dashboards/sales'
 */
export function dashboardNavigation(dashboards: readonly DashboardDefinition[]): NavigationItem[] {
  return dashboards.map((dashboard) => ({
    name: `dashboards.${dashboard.name}`,
    label: dashboard.label,
    path: `/dashboards/${dashboard.name}`,
    icon: dashboard.icon ?? 'chart-bar',
    group: dashboard.group ?? 'Dashboards',
    ...(dashboard.sort === undefined ? {} : { sort: dashboard.sort }),
    permission: dashboard.permission,
  }))
}

/**
 * The home dashboard's widgets for this user.
 *
 * @example
 * homeDashboardWidgets(resolved, (resource) => user.can('viewAny', resource))
 */
export function homeDashboardWidgets(resolved: ReadonlyMap<string, ResolvedResourceCharts>, canViewAny: (resource: string) => boolean): WidgetSpec[] {
  return [...resolved.values()]
    .filter((charts) => canViewAny(charts.resource.route))
    .sort((a, b) => a.sort - b.sort || a.resource.label.plural.localeCompare(b.resource.label.plural))
    .flatMap((charts) => charts.dashboard)
}

/**
 * A named dashboard's widgets for this user. Unknown ids are skipped (and reported through
 * `onMissing`, so a stale dashboard shows what it can instead of failing whole).
 *
 * @example
 * dashboardWidgets(salesDashboard, resolved, canViewAny, (id) => logger.warn(`missing widget ${id}`))
 */
export function dashboardWidgets(
  dashboard: DashboardDefinition,
  resolved: ReadonlyMap<string, ResolvedResourceCharts>,
  canViewAny: (resource: string) => boolean,
  onMissing: (id: string) => void = () => undefined,
): WidgetSpec[] {
  return dashboard.widgets.flatMap((id) => {
    const widget = findWidget(resolved, id)
    if (widget === undefined) onMissing(id)
    return widget !== undefined && canViewAny(widget.resource) ? [widget] : []
  })
}

/** Find a widget by its id across every resource. */
function findWidget(resolved: ReadonlyMap<string, ResolvedResourceCharts>, id: string): WidgetSpec | undefined {
  for (const charts of resolved.values()) {
    const widget = charts.widgets.find((candidate) => candidate.id === id)
    if (widget !== undefined) return widget
  }
  return undefined
}
