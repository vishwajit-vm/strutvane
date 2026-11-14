/**
 * The HTTP side: `GET /api/v1/<resource>/aggregate` as a fetch handler (`Request → Response`),
 * so it mounts on spike 12's Hono app, Vite's dev server and tests alike.
 *
 * Order of checks, and why:
 * 1. **Route and resource** → 404 for unknown, internal or `aggregates: false` resources, all with
 *    the same body, so the endpoint can't be used to discover internal tables.
 * 2. **Policy and tenancy** (`buildScope`) → 403, **before** validation: a 422 lists allowed field
 *    names, which someone without `viewAny` has no business learning.
 * 3. **Validation** → 422 with every issue at once.
 * 4. **Execution** inside the scope → 200.
 *
 * Rate limiting is not done here: in the product the route carries `throttle:aggregate` (spike
 * 12's limiter). See the README for the recommended limits.
 *
 * @module
 */
import type { Problem, ProblemIssue } from '../shared/aggregate-contract.ts'
import type { ResolvedResourceCharts } from '../shared/resolve.ts'
import { runAggregate, type AggregateExecutor } from './execute.ts'
import { buildScope, currentTenant, ScopeError, type Actor, type ChartsPolicy, type TenancyConfig } from './scope.ts'
import { validateAggregateRequest } from './validate.ts'

const ROUTE = /^\/api\/v1\/([a-z][a-z0-9_-]*)\/aggregate$/

/**
 * What the handler needs from the app.
 *
 * @example
 * const options: AggregateHandlerOptions = { charts, policies: { invoices: invoicePolicy }, executor, tenancy: { column: 'tenant_id' }, actorOf: () => user }
 */
export interface AggregateHandlerOptions {
  /** `resolveCharts(metadata, ownedFiles)`: the allow-lists and privacy settings. */
  readonly charts: ReadonlyMap<string, ResolvedResourceCharts>
  /** Policies by resource route. A resource without one is denied. */
  readonly policies: Readonly<Record<string, ChartsPolicy>>
  readonly executor: AggregateExecutor
  readonly tenancy: TenancyConfig
  /** The signed-in user for a request (`null` for guests). */
  readonly actorOf: (request: Request) => Actor | null
  /** "Now" for default windows; injected so tests are deterministic. */
  readonly now?: () => Date
  /** Unexpected errors (a bug, a dead database) go here; the client only sees a generic 500. */
  readonly onError?: (error: unknown) => void
}

/**
 * Create the aggregate endpoint.
 *
 * @example
 * const handle = createAggregateHandler(options)
 * const response = await runWithTenant(tenantId, () => handle(new Request('http://app/api/v1/invoices/aggregate?metric=count')))
 */
export function createAggregateHandler(options: AggregateHandlerOptions): (request: Request) => Promise<Response> {
  return async (request) => {
    const url = new URL(request.url)
    const route = ROUTE.exec(url.pathname)?.[1]
    const charts = route === undefined ? undefined : options.charts.get(route)
    if (charts === undefined || charts.allowList === null) {
      return problem(404, 'not_found', 'Not found', 'There is no aggregate endpoint here.')
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return problem(405, 'method_not_allowed', 'Method not allowed', 'The aggregate endpoint only answers GET.')
    }
    try {
      const scope = buildScope(charts.resource, options.policies[charts.resource.route], options.actorOf(request), options.tenancy, currentTenant())
      const validation = validateAggregateRequest(url.searchParams, charts, { now: (options.now ?? (() => new Date()))(), tenantColumn: options.tenancy === false ? false : options.tenancy.column })
      if (!validation.ok) {
        return problem(422, 'invalid_aggregate', 'Invalid aggregate request', 'Some parameters are not valid. Each issue says how to fix it.', validation.issues)
      }
      return json(200, await runAggregate(validation.plan, scope, options.executor))
    } catch (error) {
      return errorResponse(error, options.onError)
    }
  }
}

/** Map known errors to problems; hide everything else behind a generic 500. */
function errorResponse(error: unknown, onError: ((error: unknown) => void) | undefined): Response {
  if (error instanceof ScopeError) {
    if (error.status === 500) onError?.(error)
    // Server-side scope errors are configuration bugs: the details go to the log, not the client.
    return error.status === 403 ? problem(403, error.code.toLowerCase(), 'Forbidden', error.message) : problem(500, 'server_error', 'Server error', 'The aggregate could not be computed.')
  }
  // TenantScopeMissingError lands here too: a compiler bug, refused before any SQL ran. The client
  // gets the same generic 500 as for any other bug; the log gets the full message.
  onError?.(error)
  return problem(500, 'server_error', 'Server error', 'The aggregate could not be computed.')
}

function problem(status: number, code: string, title: string, detail: string, issues?: readonly ProblemIssue[]): Response {
  const body: Problem = { type: 'about:blank', title, status, code, detail, ...(issues === undefined ? {} : { issues }) }
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/problem+json' } })
}

function json(status: number, body: unknown): Response {
  // Aggregates are per user and tenant: never let a shared cache keep them.
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'private, no-store' } })
}
