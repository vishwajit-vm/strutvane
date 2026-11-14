/**
 * Turn `resources.json` + suggestions + an owned `charts.ts` into what actually runs: the widget
 * list, the dashboard picks, the privacy setting and the server's allow-list.
 *
 * The same function runs in the browser (to draw) and on the server (to validate requests), so the
 * two can never disagree. Everything is re-checked here at runtime even though owned files are
 * type-checked, because a stale registry (no `charts:sync` after a migrate) or plain JS could
 * still name a dropped or secret column. Anything invalid is **dropped and reported**: an unknown
 * name never widens what the endpoint accepts (fail closed).
 *
 * @module
 */
import { capabilitiesOf, DEFAULT_TENANT_COLUMN, type ResourceCapabilities } from './capabilities.ts'
import { isAuto, type RawChartsConfig, type RawCustomWidget, type ResourceCharts } from './define-charts.ts'
import { isInternalResource } from './exposure.ts'
import type { AppMetadata, ResourceMetadata } from './metadata.ts'
import { suggestCharts } from './suggest.ts'
import type { WidgetSpec } from './widgets.ts'

/** Allowed small-group thresholds. 1 would suppress nothing; above 100 nothing would show. */
const MIN_GROUP_SIZE_RANGE = { min: 2, max: 100 } as const
/** Used when an owned file sets an invalid threshold: a typo must never switch protection off. */
const FALLBACK_MIN_GROUP_SIZE = 10
/** Longest KPI window, in days (two windows must fit the server's bucket cap). */
const MAX_STAT_DAYS = 180

/**
 * Which fields the aggregate endpoint accepts for one resource.
 *
 * @example
 * allowList.numeric.has('total') // true
 * allowList.relation.get('customer_id') // 'customers'
 */
export interface AggregateAllowList {
  readonly numeric: ReadonlySet<string>
  readonly date: ReadonlySet<string>
  readonly category: ReadonlySet<string>
  /** belongsTo field → the related resource's route. */
  readonly relation: ReadonlyMap<string, string>
}

/**
 * Everything charts need about one resource, resolved.
 *
 * @example
 * const invoices = resolved.get('invoices')
 * invoices?.widgets.map((widget) => widget.id)
 */
export interface ResolvedResourceCharts {
  readonly resource: ResourceMetadata
  /** `null` when `aggregates: false`: the endpoint answers 404 for this resource. */
  readonly allowList: AggregateAllowList | null
  readonly widgets: readonly WidgetSpec[]
  readonly dashboard: readonly WidgetSpec[]
  /** Small-group suppression threshold, or `null` when off. */
  readonly minGroupSize: number | null
  readonly sort: number
  /** Friendly descriptions of everything that was dropped, for `charts:sync` and dev logs. */
  readonly issues: readonly string[]
}

/**
 * Options for {@link resolveCharts}.
 *
 * @example
 * const options: ResolveOptions = { tenantColumn: 'team_id' }
 */
export interface ResolveOptions {
  /** The app's tenant column (`false` for single-tenant apps). Default `tenant_id`. */
  readonly tenantColumn?: string | false
}

/**
 * Resolve every non-internal resource. Owned files for unknown or internal resources are reported
 * and ignored.
 *
 * @example
 * const charts = resolveCharts(metadata, [invoicesCharts, employeesCharts])
 * charts.get('employees')?.minGroupSize // 5
 */
export function resolveCharts(metadata: AppMetadata, owned: readonly ResourceCharts[], options: ResolveOptions = {}): Map<string, ResolvedResourceCharts> {
  const result = new Map<string, ResolvedResourceCharts>()
  for (const resource of metadata.resources) {
    if (isInternalResource(resource)) continue
    const file = owned.find((candidate) => candidate.resource === resource.route)
    result.set(resource.route, resolveResource(metadata, resource, file?.config ?? {}, options))
  }
  return result
}

/**
 * Resolve one resource.
 *
 * @example
 * resolveResource(metadata, invoices, { widgets: auto() }).widgets.length // 9
 */
export function resolveResource(metadata: AppMetadata, resource: ResourceMetadata, config: RawChartsConfig, options: ResolveOptions = {}): ResolvedResourceCharts {
  const issues: string[] = []
  const capabilities = capabilitiesOf(metadata, resource, options.tenantColumn ?? DEFAULT_TENANT_COLUMN)
  const allowList = resolveAllowList(resource, capabilities, config.aggregates, issues)
  const suggestions = suggestCharts(metadata, resource, options.tenantColumn ?? DEFAULT_TENANT_COLUMN)
  const widgets = allowList === null ? [] : resolveWidgets(resource, suggestions, allowList, config.widgets, issues)
  return {
    resource,
    allowList,
    widgets,
    dashboard: resolveDashboard(resource, widgets, config.dashboard, issues),
    minGroupSize: resolveMinGroupSize(resource, config.privacy?.minGroupSize, issues),
    sort: config.sort ?? resource.sidebar.order,
    issues,
  }
}

/** `auto()` = every capability; a list = its intersection with the capabilities. */
function resolveAllowList(resource: ResourceMetadata, capabilities: ResourceCapabilities, config: RawChartsConfig['aggregates'], issues: string[]): AggregateAllowList | null {
  if (config === false) return null
  const relations = new Map(capabilities.relation.map((relation) => [relation.field, relation.resource]))
  if (config === undefined || isAuto(config)) {
    return { numeric: new Set(capabilities.numeric), date: new Set(capabilities.date), category: new Set(capabilities.category), relation: relations }
  }
  const numeric = keepKnown(resource, config.numeric ?? [], capabilities.numeric, 'aggregates.numeric', issues)
  const groupable = [...capabilities.date, ...capabilities.category, ...relations.keys()]
  const groupBy = new Set(keepKnown(resource, config.groupBy ?? [], groupable, 'aggregates.groupBy', issues))
  return {
    numeric: new Set(numeric),
    date: new Set(capabilities.date.filter((name) => groupBy.has(name))),
    category: new Set(capabilities.category.filter((name) => groupBy.has(name))),
    relation: new Map([...relations].filter(([name]) => groupBy.has(name))),
  }
}

/** Names that exist in `allowed`; the others become issues. */
function keepKnown(resource: ResourceMetadata, names: readonly string[], allowed: readonly string[], where: string, issues: string[]): string[] {
  for (const name of names) {
    if (!allowed.includes(name)) issues.push(`${resource.route}: ${where} names "${name}", which can't be charted (unknown, secret, or the wrong type). It is ignored.`)
  }
  return names.filter((name) => allowed.includes(name))
}

/** Suggestions (`auto`) or the explicit list, each checked against the allow-list. */
function resolveWidgets(resource: ResourceMetadata, suggestions: readonly WidgetSpec[], allowList: AggregateAllowList, config: RawChartsConfig['widgets'], issues: string[]): WidgetSpec[] {
  const allowedSuggestions = suggestions.filter((widget) => usesOnlyAllowed(widget, allowList))
  if (config === undefined || isAuto(config)) {
    const except = new Set(isAuto(config) ? config.except : [])
    return orderBy(
      allowedSuggestions.filter((widget) => !except.has(widget.id)),
      isAuto(config) ? config.order : [],
    )
  }
  const widgets: WidgetSpec[] = []
  for (const entry of config) {
    const widget = typeof entry === 'string' ? findSuggestion(resource, suggestions, allowList, entry, issues) : customWidget(resource, entry, allowList, issues)
    if (widget === undefined) continue
    if (widgets.some((existing) => existing.id === widget.id)) {
      issues.push(`${resource.route}: two widgets share the id "${widget.id}". The second one is ignored; give it its own id.`)
      continue
    }
    widgets.push(widget)
  }
  return widgets
}

function findSuggestion(resource: ResourceMetadata, suggestions: readonly WidgetSpec[], allowList: AggregateAllowList, id: string, issues: string[]): WidgetSpec | undefined {
  const widget = suggestions.find((candidate) => candidate.id === id)
  if (widget === undefined) {
    issues.push(`${resource.route}: "${id}" is not a current suggestion (was a column dropped?). Remove it from widgets, or run \`node strut charts:sync\` to see the current ids.`)
    return undefined
  }
  if (!usesOnlyAllowed(widget, allowList)) {
    issues.push(`${resource.route}: "${id}" uses a field that aggregates doesn't allow. Allow the field or remove the widget.`)
    return undefined
  }
  return widget
}

/** Convert and validate a hand-made widget. */
function customWidget(resource: ResourceMetadata, raw: RawCustomWidget, allowList: AggregateAllowList, issues: string[]): WidgetSpec | undefined {
  const problem = customWidgetProblem(resource, raw, allowList)
  if (problem !== undefined) {
    issues.push(`${resource.route}: widget "${raw.id}" ${problem} It is not shown.`)
    return undefined
  }
  const common = {
    id: raw.id,
    resource: resource.route,
    title: raw.title,
    ...(raw.description === undefined ? {} : { description: raw.description }),
    format: raw.format ?? (raw.metric === 'count' ? 'integer' : 'decimal'),
  } as const
  if (raw.kind === 'stat') {
    const days = raw.days ?? 30
    return {
      ...common,
      kind: 'stat',
      size: 'sm',
      query: { metric: raw.metric, ...(raw.field === undefined ? {} : { field: raw.field }), groupBy: raw.date ?? '', interval: 'day' },
      range: { last: days * 2, unit: 'day' },
      positiveIs: raw.positiveIs ?? 'up',
    }
  }
  return {
    ...common,
    kind: raw.kind,
    size: raw.size ?? 'md',
    query: {
      metric: raw.metric,
      ...(raw.field === undefined ? {} : { field: raw.field }),
      ...(raw.groupBy === undefined ? {} : { groupBy: raw.groupBy }),
      ...(raw.interval === undefined ? {} : { interval: raw.interval }),
      ...(raw.splitBy === undefined ? {} : { splitBy: raw.splitBy }),
      ...(raw.limit === undefined ? {} : { limit: raw.limit }),
    },
    ...(raw.range === undefined ? {} : { range: raw.range }),
    ...(raw.stacked === undefined ? {} : { stacked: raw.stacked }),
    ...(raw.layout === undefined ? {} : { layout: raw.layout }),
  }
}

/** The first rule a hand-made widget breaks, as the end of a sentence, or `undefined`. */
function customWidgetProblem(resource: ResourceMetadata, raw: RawCustomWidget, allowList: AggregateAllowList): string | undefined {
  if (!raw.id.startsWith(`${resource.route}.`)) return `needs an id that starts with "${resource.route}.".`
  if (raw.metric !== 'count' && (raw.field === undefined || !allowList.numeric.has(raw.field))) return `sums or averages "${raw.field ?? '(nothing)'}", which is not an allowed numeric field.`
  if (raw.metric === 'count' && raw.field !== undefined) return 'counts rows, so it takes no field.'
  if (raw.kind === 'stat') {
    if (raw.metric === 'avg') return 'is a KPI card, which can show count or sum, not avg.'
    if (raw.date === undefined || !allowList.date.has(raw.date)) return `needs a date field for its window, and "${raw.date ?? '(none)'}" is not an allowed date.`
    if (raw.days !== undefined && (!Number.isInteger(raw.days) || raw.days < 1 || raw.days > MAX_STAT_DAYS)) return `has days: ${raw.days}; use a whole number from 1 to ${MAX_STAT_DAYS}.`
    return undefined
  }
  if (raw.groupBy !== undefined && groupKind(allowList, raw.groupBy) === undefined) return `groups by "${raw.groupBy}", which is not an allowed group field.`
  if ((raw.interval !== undefined) !== (raw.groupBy !== undefined && allowList.date.has(raw.groupBy))) return 'needs an interval exactly when it groups by a date.'
  if (raw.splitBy !== undefined && (!allowList.category.has(raw.splitBy) || raw.splitBy === raw.groupBy)) return `splits by "${raw.splitBy}"; splitBy must be another enum or boolean field.`
  return undefined
}

function groupKind(allowList: AggregateAllowList, name: string): 'date' | 'category' | 'relation' | undefined {
  if (allowList.date.has(name)) return 'date'
  if (allowList.category.has(name)) return 'category'
  return allowList.relation.has(name) ? 'relation' : undefined
}

/** Does every field a widget's query names appear in the allow-list? */
function usesOnlyAllowed(widget: WidgetSpec, allowList: AggregateAllowList): boolean {
  const { field, groupBy, splitBy } = widget.query
  if (field !== undefined && !allowList.numeric.has(field)) return false
  if (groupBy !== undefined && groupKind(allowList, groupBy) === undefined) return false
  return splitBy === undefined || allowList.category.has(splitBy)
}

/** Default dashboard: the KPI card and the first category chart, when they exist. */
function resolveDashboard(resource: ResourceMetadata, widgets: readonly WidgetSpec[], config: RawChartsConfig['dashboard'], issues: string[]): WidgetSpec[] {
  if (config === false) return []
  if (config === undefined || isAuto(config)) {
    const defaults = [widgets.find((widget) => widget.kind === 'stat'), widgets.find((widget) => widget.id.startsWith(`${resource.route}.by-`))]
    const picked = defaults.filter((widget): widget is WidgetSpec => widget !== undefined)
    const except = new Set(isAuto(config) ? config.except : [])
    return orderBy(
      picked.filter((widget) => !except.has(widget.id)),
      isAuto(config) ? config.order : [],
    )
  }
  return config.flatMap((id) => {
    const widget = widgets.find((candidate) => candidate.id === id)
    if (widget === undefined) issues.push(`${resource.route}: dashboard names "${id}", which is not one of this resource's widgets. Add it to widgets first.`)
    return widget === undefined ? [] : [widget]
  })
}

function resolveMinGroupSize(resource: ResourceMetadata, value: number | undefined, issues: string[]): number | null {
  if (value === undefined) return null
  if (Number.isInteger(value) && value >= MIN_GROUP_SIZE_RANGE.min && value <= MIN_GROUP_SIZE_RANGE.max) return value
  issues.push(
    `${resource.route}: privacy.minGroupSize is ${value}; use a whole number from ${MIN_GROUP_SIZE_RANGE.min} to ${MIN_GROUP_SIZE_RANGE.max}. Using ${FALLBACK_MIN_GROUP_SIZE} until it is fixed.`,
  )
  return FALLBACK_MIN_GROUP_SIZE
}

/** Put `first` ids at the front, in that order; keep the rest in their original order. */
function orderBy(widgets: readonly WidgetSpec[], first: readonly string[]): WidgetSpec[] {
  const head = first.flatMap((id) => widgets.filter((widget) => widget.id === id))
  return [...head, ...widgets.filter((widget) => !first.includes(widget.id))]
}
