/**
 * `<StatCard>`: a KPI: the total of the current window, the change against the window before
 * (with an arrow, a colour **and** words), and a sparkline.
 *
 * The trend's colour follows `positiveIs`: more revenue is good (success), more refunds is bad
 * (destructive). The words ("up 12% from the previous 30 days") carry the meaning, so colour is
 * never the only signal (WCAG 1.4.1).
 *
 * @module
 */
import { IconAlertTriangle, IconArrowDownRight, IconArrowUpRight, IconMinus, IconRefresh } from '@tabler/icons-react'
import { clsx } from 'clsx'
import { useId, type ReactElement } from 'react'
import type { ValueFormat } from '../../shared/widgets.ts'
import { formatValue, percentChange } from '../format.ts'
import { Sparkline } from './charts.tsx'

/**
 * The numbers a KPI card shows.
 *
 * @example
 * const kpi: StatValues = { current: 120, previous: 100, series: [3, 5, 4] }
 */
export interface StatValues {
  /** Total of the current window, or null when withheld (privacy) or unknown. */
  readonly current: number | null
  readonly previous: number | null
  /** One value per day of the current window, for the sparkline. */
  readonly series: readonly (number | null)[]
}

/**
 * Props of {@link StatCard}.
 *
 * @example
 * <StatCard title="New invoices" state={{ status: 'ready', values }} format="integer" periodLabel="30 days" />
 */
export interface StatCardProps {
  readonly title: string
  readonly description?: string | undefined
  readonly state: { readonly status: 'loading' } | { readonly status: 'error'; readonly message: string; readonly retry: () => void } | { readonly status: 'ready'; readonly values: StatValues }
  readonly format: ValueFormat
  /** "30 days": used in "from the previous 30 days". */
  readonly periodLabel: string
  readonly positiveIs?: 'up' | 'down' | undefined
  readonly locale?: string
}

/**
 * A KPI card.
 *
 * @example
 * <StatCard title="Revenue" state={state} format="decimal" periodLabel="30 days" positiveIs="up" />
 */
export function StatCard(props: StatCardProps): ReactElement {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className="flex h-full flex-col gap-3 rounded-xl border border-border/60 bg-card p-5 text-card-foreground shadow-card">
      <h2 id={titleId} className="text-sm font-medium text-muted-foreground">
        {props.title}
      </h2>
      {content(props)}
    </section>
  )
}

function content(props: StatCardProps): ReactElement {
  const state = props.state
  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true" className="space-y-2">
        <span className="sr-only">Loading {props.title}…</span>
        <div aria-hidden="true" className="h-8 w-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div aria-hidden="true" className="h-10 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="space-y-2 text-sm">
        <p className="flex items-center gap-2 text-destructive">
          <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          {state.message}
        </p>
        <button type="button" onClick={state.retry} className="inline-flex h-8 items-center gap-2 rounded-md border border-input px-3 font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <IconRefresh aria-hidden="true" className="size-4" />
          Retry
        </button>
      </div>
    )
  }
  const { current, previous, series } = state.values
  return (
    <>
      <p className="text-2xl font-semibold tabular-nums">{formatValue(current, props.format, props.locale)}</p>
      <Trend current={current} previous={previous} periodLabel={props.periodLabel} positiveIs={props.positiveIs ?? 'up'} />
      <Sparkline values={series} />
      {props.description === undefined ? null : <p className="text-xs text-muted-foreground">{props.description}</p>}
    </>
  )
}

/** The arrow, the percentage and the sentence. */
function Trend({ current, previous, periodLabel, positiveIs }: { readonly current: number | null; readonly previous: number | null; readonly periodLabel: string; readonly positiveIs: 'up' | 'down' }): ReactElement {
  const change = current === null || previous === null ? null : percentChange(current, previous)
  if (change === null) {
    return <p className="text-sm text-muted-foreground">{current === null ? 'Hidden to protect privacy.' : `No data for the previous ${periodLabel}.`}</p>
  }
  const rounded = Math.round(change)
  const direction = rounded > 0 ? 'up' : rounded < 0 ? 'down' : 'flat'
  const good = direction === 'flat' ? undefined : direction === positiveIs
  const Icon = direction === 'up' ? IconArrowUpRight : direction === 'down' ? IconArrowDownRight : IconMinus
  const words = direction === 'flat' ? `No change from the previous ${periodLabel}` : `${direction === 'up' ? 'Up' : 'Down'} ${Math.abs(rounded)}% from the previous ${periodLabel}`
  return (
    <p className={clsx('flex items-center gap-1 text-sm font-medium', good === true && 'text-success', good === false && 'text-destructive', good === undefined && 'text-muted-foreground')}>
      <Icon aria-hidden="true" className="size-4 shrink-0" />
      {words}
    </p>
  )
}

/**
 * Split a KPI's daily buckets (two windows, oldest first) into the card's numbers.
 *
 * Why null propagates: if any day of a window was suppressed for privacy, the window's total
 * would be a lower bound presented as a fact; better to say it's hidden.
 *
 * @example
 * statValues([1, 2, 3, 4]) // { current: 7, previous: 3, series: [3, 4] }
 */
export function statValues(values: readonly (number | null)[]): StatValues {
  const half = Math.floor(values.length / 2)
  const previousWindow = values.slice(0, half)
  const currentWindow = values.slice(half)
  const total = (window: readonly (number | null)[]): number | null => (window.some((value) => value === null) ? null : window.reduce<number>((sum, value) => sum + (value ?? 0), 0))
  return { current: total(currentWindow), previous: total(previousWindow), series: currentWindow }
}
