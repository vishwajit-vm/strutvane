/**
 * Auto-suggested charts: what a sensible analyst would draw first, from `resources.json` alone.
 *
 * For each (non-internal) resource, in this order:
 *
 * | id | when | chart |
 * |---|---|---|
 * | `<r>.new` | has `created_at` | KPI: new rows in the last 30 days, trend vs the 30 before, sparkline |
 * | `<r>.per-period` | has `created_at` | area: rows per month (the card can switch day / week / month) |
 * | `<r>.by-<enum or boolean>` | per category field | donut (≤ 6 groups) or bar |
 * | `<r>.per-period-by-<first enum>` | `created_at` + an enum | stacked bars: rows per month split by that enum |
 * | `<r>.sum-<decimal>` | per decimal/double field, with a date | bars: sum per month |
 * | `<r>.avg-<decimal>` | same | line: average per month |
 * | `<r>.top-<relation>` | per belongsTo field | horizontal bars: top 10 related rows by count |
 *
 * Suggestions are pure and deterministic (same metadata → same list, same order), which is what
 * lets `charts:sync` report "new suggestion" by comparing ids with the lock file.
 *
 * Why integers are not summed by default: integer columns are as often codes or positions
 * (`position`, `year`) as amounts. Decimals almost always are amounts. Integers can still be
 * charted from an owned file.
 *
 * @module
 */
import { capabilitiesOf, DEFAULT_TENANT_COLUMN, type ResourceCapabilities } from './capabilities.ts'
import type { AppMetadata, FieldMetadata, ResourceMetadata } from './metadata.ts'
import type { WidgetSpec } from './widgets.ts'

/** Pie and donut charts stop being readable past this many slices; bars take over. */
const MAX_SLICES = 6
/** Default window of time-series suggestions. */
const DEFAULT_MONTHS = 12

/**
 * Suggest charts for one resource.
 *
 * @example
 * suggestCharts(metadata, invoices).map((widget) => widget.id)
 * // ['invoices.new', 'invoices.per-period', 'invoices.by-status', 'invoices.by-paid', …]
 */
export function suggestCharts(metadata: AppMetadata, resource: ResourceMetadata, tenantColumn: string | false = DEFAULT_TENANT_COLUMN): WidgetSpec[] {
  const capabilities = capabilitiesOf(metadata, resource, tenantColumn)
  const field = (name: string): FieldMetadata | undefined => resource.fields.find((candidate) => candidate.name === name)
  const created = capabilities.date.includes('created_at') ? 'created_at' : undefined
  return [
    ...timeSuggestions(resource, created),
    ...categorySuggestions(resource, capabilities, field),
    ...splitSuggestion(resource, capabilities, created, field),
    ...amountSuggestions(resource, capabilities, created, field),
    ...relationSuggestions(metadata, resource, capabilities),
  ]
}

/** KPI card and rows per period, both from `created_at`. */
function timeSuggestions(resource: ResourceMetadata, created: string | undefined): WidgetSpec[] {
  if (created === undefined) return []
  const plural = resource.label.plural
  return [
    {
      id: `${resource.route}.new`,
      resource: resource.route,
      kind: 'stat',
      size: 'sm',
      format: 'integer',
      title: `New ${plural.toLowerCase()}`,
      description: 'Last 30 days, compared with the 30 days before.',
      // 60 daily buckets: the card sums the last 30 and compares them with the 30 before.
      query: { metric: 'count', groupBy: created, interval: 'day' },
      range: { last: 60, unit: 'day' },
      positiveIs: 'up',
    },
    {
      id: `${resource.route}.per-period`,
      resource: resource.route,
      kind: 'area',
      size: 'lg',
      format: 'integer',
      title: `${plural} over time`,
      description: `New ${plural.toLowerCase()} per month.`,
      query: { metric: 'count', groupBy: created, interval: 'month' },
      range: { last: DEFAULT_MONTHS, unit: 'month' },
    },
  ]
}

/** Counts per enum option or per yes/no. */
function categorySuggestions(resource: ResourceMetadata, capabilities: ResourceCapabilities, field: (name: string) => FieldMetadata | undefined): WidgetSpec[] {
  return capabilities.category.map((name) => {
    const groups = field(name)?.kind === 'boolean' ? 2 : (field(name)?.options?.length ?? 0)
    return {
      id: `${resource.route}.by-${name}`,
      resource: resource.route,
      kind: groups <= MAX_SLICES ? 'donut' : 'bar',
      size: 'md',
      format: 'integer',
      title: `${resource.label.plural} by ${labelOf(field(name), name).toLowerCase()}`,
      query: { metric: 'count', groupBy: name },
    }
  })
}

/** One stacked bar chart: rows per month split by the first enum (the most common "status"). */
function splitSuggestion(resource: ResourceMetadata, capabilities: ResourceCapabilities, created: string | undefined, field: (name: string) => FieldMetadata | undefined): WidgetSpec[] {
  const firstEnum = capabilities.category.find((name) => field(name)?.kind === 'enum')
  if (created === undefined || firstEnum === undefined) return []
  return [
    {
      id: `${resource.route}.per-period-by-${firstEnum}`,
      resource: resource.route,
      kind: 'bar',
      size: 'lg',
      format: 'integer',
      stacked: true,
      title: `${resource.label.plural} per month by ${labelOf(field(firstEnum), firstEnum).toLowerCase()}`,
      query: { metric: 'count', groupBy: created, interval: 'month', splitBy: firstEnum },
      range: { last: DEFAULT_MONTHS, unit: 'month' },
    },
  ]
}

/** Sum and average per month of every decimal/double column. */
function amountSuggestions(resource: ResourceMetadata, capabilities: ResourceCapabilities, created: string | undefined, field: (name: string) => FieldMetadata | undefined): WidgetSpec[] {
  if (created === undefined) return []
  const amounts = capabilities.numeric.filter((name) => field(name)?.kind === 'decimal' || field(name)?.kind === 'double')
  return amounts.flatMap((name): WidgetSpec[] => {
    const label = labelOf(field(name), name)
    const base = { resource: resource.route, format: 'decimal' as const, range: { last: DEFAULT_MONTHS, unit: 'month' as const } }
    return [
      { ...base, id: `${resource.route}.sum-${name}`, kind: 'bar', size: 'lg', title: `${label} per month`, description: `Sum of ${label.toLowerCase()}.`, query: { metric: 'sum', field: name, groupBy: created, interval: 'month' } },
      { ...base, id: `${resource.route}.avg-${name}`, kind: 'line', size: 'lg', title: `Average ${label.toLowerCase()} per month`, query: { metric: 'avg', field: name, groupBy: created, interval: 'month' } },
    ]
  })
}

/** Top 10 related rows (customers, authors) by number of rows here. */
function relationSuggestions(metadata: AppMetadata, resource: ResourceMetadata, capabilities: ResourceCapabilities): WidgetSpec[] {
  return capabilities.relation.map((relation) => {
    const target = metadata.resources.find((candidate) => candidate.route === relation.resource)
    const targetPlural = target?.label.plural ?? relation.relation
    return {
      id: `${resource.route}.top-${relation.relation}`,
      resource: resource.route,
      kind: 'bar',
      layout: 'horizontal',
      size: 'md',
      format: 'integer',
      title: `Top ${targetPlural.toLowerCase()} by ${resource.label.plural.toLowerCase()}`,
      query: { metric: 'count', groupBy: relation.field, limit: 10 },
    }
  })
}

/** The field label without a trailing " id" ("Customer", not "Customer id"). */
function labelOf(field: FieldMetadata | undefined, name: string): string {
  return field?.label ?? name
}
