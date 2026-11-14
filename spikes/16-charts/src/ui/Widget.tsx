/**
 * `<Widget>`: one {@link WidgetSpec}, live: it fetches its aggregate, labels the keys, and renders
 * the right card and chart. Dashboards are just a grid of these.
 *
 * @module
 */
import { clsx } from 'clsx'
import { useEffect, useMemo, useState, type ReactElement } from 'react'
import type { AggregateQuery, AggregateResult, DateInterval } from '../shared/aggregate-contract.ts'
import type { AppMetadata, ResourceMetadata } from '../shared/metadata.ts'
import type { WidgetSpec } from '../shared/widgets.ts'
import { AreaChart, BarChart, LineChart, PieChart } from './components/charts.tsx'
import { ChartCard, type ChartState } from './components/ChartCard.tsx'
import { StatCard, statValues } from './components/StatCard.tsx'
import { AggregateRequestError, widgetQuery, type AggregateClient, type RelationLabels } from './data.ts'
import { createKeyLabeler } from './format.ts'
import { summarize, toChartData } from './series.ts'

/**
 * What every widget needs from the page.
 *
 * @example
 * const context: WidgetContext = { client, metadata, now: () => new Date(), relationLabels }
 */
export interface WidgetContext {
  readonly client: AggregateClient
  readonly metadata: AppMetadata
  readonly now: () => Date
  readonly relationLabels?: RelationLabels
  readonly locale?: string
  /** Small-group thresholds by resource, for the privacy note. */
  readonly minGroupSize?: (resource: string) => number | null
}

type Fetch = { readonly status: 'loading' } | { readonly status: 'error'; readonly message: string } | { readonly status: 'ready'; readonly result: AggregateResult; readonly labels: Readonly<Record<string, string>> }

/**
 * Fetch one aggregate (and relation labels), cancelling stale requests when the query changes.
 *
 * @example
 * const [state, retry] = useAggregate(context, 'invoices', query)
 */
export function useAggregate(context: WidgetContext, route: string, query: AggregateQuery): readonly [Fetch, () => void] {
  const [state, setState] = useState<Fetch>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const key = JSON.stringify(query)
  useEffect(() => {
    const controller = new AbortController()
    setState({ status: 'loading' })
    const run = async (): Promise<void> => {
      try {
        const result = await context.client.get(route, query, controller.signal)
        const labels = await relationTitles(context, route, result)
        if (!controller.signal.aborted) setState({ status: 'ready', result, labels })
      } catch (error) {
        if (controller.signal.aborted) return
        setState({ status: 'error', message: error instanceof AggregateRequestError ? error.message : 'Something went wrong while drawing this chart. Please try again.' })
      }
    }
    void run()
    return () => controller.abort()
    // `key` stands for `query` (a new object on every render); `attempt` re-runs on Retry.
  }, [context, route, key, attempt])
  return [state, () => setAttempt((value) => value + 1)] as const
}

/** Titles for relation groups, via the app's resolver. A failure leaves ids as "#7", never breaks the chart. */
async function relationTitles(context: WidgetContext, route: string, result: AggregateResult): Promise<Readonly<Record<string, string>>> {
  if (result.meta.groupKind !== 'relation' || context.relationLabels === undefined || result.meta.groupBy === null) return {}
  const field = resourceOf(context.metadata, route)?.fields.find((candidate) => candidate.name === result.meta.groupBy)
  const target = context.metadata.resources.find((resource) => resource.table === field?.references)
  const ids = result.data.map((bucket) => bucket.key).filter((key) => !key.startsWith('__'))
  if (target === undefined || ids.length === 0) return {}
  try {
    return await context.relationLabels(target.route, ids)
  } catch {
    return {}
  }
}

/**
 * Render one widget.
 *
 * @example
 * <Widget widget={spec} context={context} />
 */
export function Widget({ widget, context }: { readonly widget: WidgetSpec; readonly context: WidgetContext }): ReactElement {
  const [interval, setInterval] = useState<DateInterval | undefined>(undefined)
  // `now` is read once per mount and interval change: a re-render must not shift the window.
  const query = useMemo(() => widgetQuery(widget, context.now(), interval), [widget, context, interval])
  const [fetched, retry] = useAggregate(context, widget.resource, query)
  const resource = resourceOf(context.metadata, widget.resource)
  if (widget.kind === 'stat') {
    const state = fetched.status === 'ready' ? { status: 'ready' as const, values: statValues(fetched.result.data.map((bucket) => bucket.values['value'] ?? null)) } : fetched.status === 'error' ? { ...fetched, retry } : fetched
    const days = Math.floor((widget.range?.last ?? 60) / 2)
    return <StatCard title={widget.title} description={widget.description} state={state} format={widget.format} periodLabel={`${days} days`} positiveIs={widget.positiveIs} {...locale(context)} />
  }
  const chartState = toChartState(fetched, retry, widget, resource, context)
  const isDate = widget.query.interval !== undefined
  return (
    <ChartCard
      title={widget.title}
      description={widget.description}
      state={chartState}
      format={widget.format}
      emptyText={`No ${resource?.label.plural.toLowerCase() ?? 'records'} in this period yet.`}
      minGroupSize={context.minGroupSize?.(widget.resource)}
      groupLabel={groupLabel(widget, resource, interval)}
      actions={isDate ? <IntervalSwitch value={interval ?? widget.query.interval ?? 'month'} onChange={setInterval} label={widget.title} /> : null}
      {...locale(context)}
    >
      {(data, summary) => {
        const props = { data, title: widget.title, summary, format: widget.format, ...locale(context) }
        switch (widget.kind) {
          case 'line':
            return <LineChart {...props} />
          case 'area':
            return <AreaChart {...props} />
          case 'pie':
          case 'donut':
            return <PieChart {...props} donut={widget.kind === 'donut'} />
          case 'bar':
            return <BarChart {...props} stacked={widget.stacked === true} layout={widget.layout ?? 'vertical'} />
          case 'stat':
            // Unreachable (stat cards returned above); TypeScript can't narrow inside this callback.
            return null
        }
      }}
    </ChartCard>
  )
}

function toChartState(fetched: Fetch, retry: () => void, widget: WidgetSpec, resource: ResourceMetadata | undefined, context: WidgetContext): ChartState {
  if (fetched.status !== 'ready') return fetched.status === 'error' ? { ...fetched, retry } : fetched
  const { result } = fetched
  const keyLabel = createKeyLabeler({ kind: result.meta.groupKind, interval: result.meta.interval, relationLabels: fetched.labels, ...locale(context) })
  const seriesLabel = createKeyLabeler({ kind: 'category', ...locale(context) })
  const seriesName = (key: string): string => (key === 'value' ? valueLabel(widget, resource) : seriesLabel(key))
  const data = toChartData(result, keyLabel, seriesName)
  return { status: 'ready', data, summary: summarize(data, widget.title, widget.format, context.locale) }
}

/** The single series' name: "Invoices", "Sum of Total", "Average Salary". */
function valueLabel(widget: WidgetSpec, resource: ResourceMetadata | undefined): string {
  const field = resource?.fields.find((candidate) => candidate.name === widget.query.field)?.label ?? widget.query.field ?? ''
  if (widget.query.metric === 'sum') return `Total ${field.toLowerCase()}`
  if (widget.query.metric === 'avg') return `Average ${field.toLowerCase()}`
  return resource?.label.plural ?? 'Records'
}

function groupLabel(widget: WidgetSpec, resource: ResourceMetadata | undefined, interval: DateInterval | undefined): string {
  const chosen = interval ?? widget.query.interval
  if (chosen !== undefined) return chosen === 'day' ? 'Day' : chosen === 'week' ? 'Week' : 'Month'
  const field = resource?.fields.find((candidate) => candidate.name === widget.query.groupBy)
  return field?.label ?? 'Group'
}

/**
 * Day / Week / Month, as a group of toggle buttons (one pressed). Changing it refetches with the
 * default window for that interval (30 days, 12 weeks, 12 months).
 *
 * @example
 * <IntervalSwitch value="month" onChange={setInterval} label="Invoices over time" />
 */
export function IntervalSwitch({ value, onChange, label }: { readonly value: DateInterval; readonly onChange: (interval: DateInterval) => void; readonly label: string }): ReactElement {
  const options: readonly (readonly [DateInterval, string])[] = [
    ['day', 'Day'],
    ['week', 'Week'],
    ['month', 'Month'],
  ]
  return (
    <div role="group" aria-label={`${label}: interval`} className="inline-flex rounded-md bg-muted p-0.5">
      {options.map(([option, text]) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={clsx(
            'h-7 rounded-[calc(var(--radius)-0.125rem)] px-2.5 text-xs font-medium transition-colors duration-(--duration-fast) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
            value === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

function resourceOf(metadata: AppMetadata, route: string): ResourceMetadata | undefined {
  return metadata.resources.find((resource) => resource.route === route)
}

function locale(context: WidgetContext): { locale?: string } {
  return context.locale === undefined ? {} : { locale: context.locale }
}
