/**
 * `<ChartCard>`: the frame every chart widget sits in: a titled card (DESIGN.md §4 Card) with the
 * four states (loading, error, empty, ready), the data-table fallback, and the privacy note.
 *
 * Why the states live here and not in each chart: every chart then gets the same skeleton, the
 * same "Retry", the same empty message and the same table, and a chart component only ever draws
 * real data.
 *
 * @module
 */
import { IconAlertTriangle, IconChartBar, IconLock, IconRefresh, IconTable } from '@tabler/icons-react'
import { clsx } from 'clsx'
import { useId, useState, type ReactElement, type ReactNode } from 'react'
import type { ValueFormat } from '../../shared/widgets.ts'
import type { ChartData } from '../series.ts'
import { DataTable } from './DataTable.tsx'

/**
 * What the card shows.
 *
 * @example
 * const state: ChartState = { status: 'error', message: 'The server had a problem…', retry }
 */
export type ChartState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string; readonly retry: () => void }
  | { readonly status: 'ready'; readonly data: ChartData; readonly summary: string }

/**
 * Props of {@link ChartCard}.
 *
 * @example
 * <ChartCard title="Invoices by status" state={state} format="integer" emptyText="No invoices yet.">{(data, summary) => <PieChart … />}</ChartCard>
 */
export interface ChartCardProps {
  readonly title: string
  readonly description?: string | undefined
  readonly state: ChartState
  readonly format: ValueFormat
  /** Shown when every value is zero ("No invoices in this period"). */
  readonly emptyText: string
  /** Header controls, such as the interval switch. */
  readonly actions?: ReactNode
  /** Small-group threshold, for the privacy note ("fewer than 5 records"). */
  readonly minGroupSize?: number | null | undefined
  /** Header for the first table column ("Month", "Status"). */
  readonly groupLabel?: string
  readonly locale?: string
  /** Draws the chart for ready, non-empty data. */
  readonly children: (data: ChartData, summary: string) => ReactNode
}

/**
 * A chart in a card, with states and a keyboard-reachable "Show table" toggle.
 *
 * @example
 * <ChartCard title="New invoices" state={{ status: 'loading' }} format="integer" emptyText="No invoices yet.">{() => null}</ChartCard>
 */
export function ChartCard(props: ChartCardProps): ReactElement {
  const titleId = useId()
  const [showTable, setShowTable] = useState(false)
  const ready = props.state.status === 'ready' && !props.state.data.empty
  return (
    <section aria-labelledby={titleId} className="flex h-full flex-col rounded-xl border border-border/60 bg-card text-card-foreground shadow-card">
      <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-semibold">
            {props.title}
          </h2>
          {props.description === undefined ? null : <p className="text-sm text-muted-foreground">{props.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {props.actions}
          {ready ? (
            <button type="button" aria-pressed={showTable} onClick={() => setShowTable((value) => !value)} className={iconButton(showTable)}>
              {showTable ? <IconChartBar aria-hidden="true" className="size-4" /> : <IconTable aria-hidden="true" className="size-4" />}
              <span className="sr-only">{showTable ? `Show ${props.title} as a chart` : `Show ${props.title} as a table`}</span>
            </button>
          ) : null}
        </div>
      </header>
      <div className="flex-1 p-5">{body(props, showTable)}</div>
    </section>
  )
}

function body(props: ChartCardProps, showTable: boolean): ReactNode {
  const state = props.state
  if (state.status === 'loading') {
    return (
      <div role="status" aria-busy="true" className="space-y-3">
        <span className="sr-only">Loading {props.title}…</span>
        <div aria-hidden="true" className="h-4 w-1/3 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div aria-hidden="true" className="h-48 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      </div>
    )
  }
  if (state.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-lg bg-destructive-soft p-4 text-sm">
        <p className="flex items-center gap-2 font-medium text-destructive">
          <IconAlertTriangle aria-hidden="true" className="size-4 shrink-0" />
          {state.message}
        </p>
        <button type="button" onClick={state.retry} className="inline-flex h-8 items-center gap-2 rounded-md border border-input bg-card px-3 font-medium hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
          <IconRefresh aria-hidden="true" className="size-4" />
          Retry
        </button>
      </div>
    )
  }
  if (state.data.empty) {
    return (
      <div role="status" className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <IconChartBar aria-hidden="true" className="size-7" stroke={1.5} />
        <p>{props.emptyText}</p>
      </div>
    )
  }
  return (
    <figure className="space-y-3">
      {showTable ? null : props.children(state.data, state.summary)}
      <DataTable data={state.data} caption={props.title} groupLabel={props.groupLabel ?? 'Group'} format={props.format} visible={showTable} {...(props.locale === undefined ? {} : { locale: props.locale })} />
      {state.data.suppressedCells > 0 ? (
        <figcaption className="flex items-center gap-2 text-xs text-muted-foreground">
          <IconLock aria-hidden="true" className="size-3.5 shrink-0" />
          Groups with fewer than {props.minGroupSize ?? 'a few'} records are hidden to protect privacy.
        </figcaption>
      ) : null}
    </figure>
  )
}

/** A 32 px icon toggle with a visible pressed state and the focus ring. */
function iconButton(pressed: boolean): string {
  return clsx(
    'inline-flex size-8 items-center justify-center rounded-md border border-input transition-colors duration-(--duration-fast) hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
    pressed ? 'bg-primary-soft text-primary-soft-foreground' : 'bg-card text-muted-foreground',
  )
}
