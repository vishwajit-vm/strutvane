/**
 * The browser side of the aggregate contract: build the request for a widget (relative ranges
 * become UTC dates), call the endpoint, and turn any failure into one friendly sentence.
 *
 * @module
 */
import { aggregateUrl, type AggregateQuery, type AggregateResult, type DateInterval } from '../shared/aggregate-contract.ts'
import { addBuckets, dateKey, startOfBucket } from '../shared/dates.ts'
import type { RelativeRange, WidgetSpec } from '../shared/widgets.ts'

/**
 * A failed aggregate request, with a message fit to show in the card.
 *
 * @example
 * try { await client.get('invoices', query) } catch (error) { if (error instanceof AggregateRequestError) show(error.message) }
 */
export class AggregateRequestError extends Error {
  override readonly name = 'AggregateRequestError'
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * Fetches aggregates. Transport-injected, so tests and the demo pass their own `fetch`.
 *
 * @example
 * const client = createAggregateClient()
 * const result = await client.get('invoices', { metric: 'count', groupBy: 'status' })
 */
export interface AggregateClient {
  get(route: string, query: AggregateQuery, signal?: AbortSignal): Promise<AggregateResult>
}

/**
 * Create a client on `fetch` (or any function with its shape).
 *
 * @example
 * const client = createAggregateClient((input, init) => fetch(input, { ...init, credentials: 'same-origin' }))
 */
export function createAggregateClient(transport: (input: string, init: RequestInit) => Promise<Response> = (input, init) => fetch(input, init), base = '/api/v1'): AggregateClient {
  return {
    async get(route, query, signal) {
      let response: Response
      try {
        response = await transport(aggregateUrl(route, query, base), { headers: { accept: 'application/json' }, ...(signal === undefined ? {} : { signal }) })
      } catch (error) {
        if (signal?.aborted === true) throw error
        throw new AggregateRequestError(0, "Couldn't reach the server. Check your connection and try again.")
      }
      if (!response.ok) throw new AggregateRequestError(response.status, await problemMessage(response))
      return (await response.json()) as AggregateResult
    },
  }
}

/** The problem's detail and first issue, or a generic sentence (a proxy's HTML 502 page has neither). */
async function problemMessage(response: Response): Promise<string> {
  if (response.status === 403) return "You don't have access to these numbers."
  try {
    const body: unknown = await response.json()
    if (typeof body === 'object' && body !== null && 'detail' in body && typeof body.detail === 'string') {
      const issues = 'issues' in body && Array.isArray(body.issues) ? body.issues : []
      const first: unknown = issues[0]
      const issue = typeof first === 'object' && first !== null && 'message' in first && typeof first.message === 'string' ? ` ${first.message}` : ''
      return response.status >= 500 ? 'The server had a problem computing this chart. Please try again.' : `${body.detail}${issue}`
    }
  } catch {
    // Not JSON: fall through to the generic message.
  }
  return 'The server had a problem computing this chart. Please try again.'
}

/** Default window per interval when the card's interval switch changes it. */
const DEFAULT_RANGES: Readonly<Record<DateInterval, RelativeRange>> = {
  day: { last: 30, unit: 'day' },
  week: { last: 12, unit: 'week' },
  month: { last: 12, unit: 'month' },
}

/**
 * The query a widget sends: its query, with the relative range turned into UTC `from`/`to`, and
 * an optional interval override from the card's switch.
 *
 * @example
 * widgetQuery(perMonth, new Date('2026-11-14T12:00:00Z'))
 * // { metric: 'count', groupBy: 'created_at', interval: 'month', from: '2025-12-01', to: '2026-12-01' }
 */
export function widgetQuery(widget: WidgetSpec, now: Date, interval?: DateInterval): AggregateQuery {
  const chosen = interval ?? widget.query.interval
  const range = interval !== undefined ? DEFAULT_RANGES[interval] : widget.range
  if (range === undefined || chosen === undefined) return widget.query
  return { ...widget.query, interval: chosen, ...rangeDates(range, now) }
}

/**
 * `{ last: 12, unit: 'month' }` → the 12 whole months ending with the current one, in UTC.
 *
 * @example
 * rangeDates({ last: 30, unit: 'day' }, new Date('2026-11-14T12:00:00Z')) // { from: '2026-10-16', to: '2026-11-15' }
 */
export function rangeDates(range: RelativeRange, now: Date): { readonly from: string; readonly to: string } {
  const to = addBuckets(startOfBucket(now, range.unit), range.unit, 1)
  return { from: dateKey(addBuckets(to, range.unit, -range.last)), to: dateKey(to) }
}

/**
 * Resolves related ids to titles (customer 7 → "Acme Ltd"). The product uses spike 14's list
 * endpoint (`filter[id][in]=…`), which applies the related resource's own policy: ids the user
 * may not view simply stay "#7".
 *
 * @example
 * const labels: RelationLabels = async (resource, ids) => ({ '7': 'Acme Ltd' })
 */
export type RelationLabels = (resource: string, ids: readonly string[]) => Promise<Readonly<Record<string, string>>>
