/**
 * A small in-memory API with spike 10's HTTP contract, for the dev server and fast UI tests.
 *
 *   GET    /api/:resource                 list (page, perPage, search, sort, filter[...])
 *   GET    /api/:resource/:id             one row by id
 *   GET    /api/:resource/by-slug/:slug   one row by slug
 *   POST   /api/:resource                 create
 *   PATCH  /api/:resource/:id             partial update
 *   DELETE /api/:resource/:id             delete (soft when the table soft deletes)
 *   POST   /api/:resource/:id/restore     extension: undo a soft delete
 *
 * It is a plain `(Request) => Promise<Response>` function: the Vite dev server mounts it, and
 * tests call it directly, with no network and no ports.
 *
 * @module
 */
import type { AppMetadata, ResourceMetadata } from '../shared/metadata.ts'
import { parseListQuery } from './list-query.ts'
import { jsonResponse, problemResponse, validationProblem } from './problem.ts'
import { MemoryTable, type Row, type WriteResult } from './store.ts'

/**
 * A fetch-style request handler.
 *
 * @example
 * const response = await api.handle(new Request('http://local/api/posts'))
 */
export interface MockApi {
  handle(request: Request): Promise<Response>
  /** Direct access to a table, for seeding and assertions in tests. */
  table(name: string): MemoryTable | undefined
}

/**
 * Options for {@link createMockApi}.
 *
 * @example
 * createMockApi(metadata, { now: () => new Date('2026-11-14T09:00:00Z') })
 */
export interface MockApiOptions {
  /** The clock for timestamps; injected so tests are deterministic. */
  readonly now?: () => Date
  /** Optional latency in milliseconds, so the dev server shows loading states. */
  readonly delayMs?: number
}

/** Same body limit as spike 10. */
const MAX_BODY_BYTES = 64 * 1024

/**
 * Build the mock API for every resource in the metadata.
 *
 * @example
 * const api = createMockApi(metadata)
 * await api.handle(new Request('http://local/api/posts?search=hello'))
 */
export function createMockApi(metadata: AppMetadata, options: MockApiOptions = {}): MockApi {
  const now = options.now ?? (() => new Date())
  const tables = new Map<string, MemoryTable>()
  const lookup = (table: string): MemoryTable | undefined => tables.get(table)
  for (const resource of metadata.resources) tables.set(resource.table, new MemoryTable(resource, lookup, now))
  const byRoute = new Map(metadata.resources.map((resource) => [resource.route, resource]))

  const handle = async (request: Request): Promise<Response> => {
    if (options.delayMs !== undefined) await new Promise((resolve) => setTimeout(resolve, options.delayMs))
    try {
      return await route(request, byRoute, lookup)
    } catch {
      return problemResponse(500, 'internal_error', 'Something went wrong', 'The server hit an unexpected error. It has been logged; please try again.')
    }
  }
  return { handle, table: lookup }
}

/** Dispatch one request. Kept as a flat list of URL shapes so each route is easy to find. */
async function route(request: Request, byRoute: ReadonlyMap<string, ResourceMetadata>, lookup: (table: string) => MemoryTable | undefined): Promise<Response> {
  const url = new URL(request.url)
  const parts = url.pathname.split('/').filter((part) => part !== '')
  if (parts[0] !== 'api' || parts[1] === undefined) return routeNotFound()
  const resource = byRoute.get(parts[1])
  const table = resource === undefined ? undefined : lookup(resource.table)
  if (resource === undefined || table === undefined) {
    return problemResponse(404, 'unknown_resource', 'Unknown resource', `There is no resource called "${decodeURIComponent(parts[1])}".`)
  }
  const [, , first, second, third] = parts
  const method = request.method.toUpperCase()

  if (first === undefined) {
    if (method === 'GET') return listRows(table, url.searchParams)
    if (method === 'POST') return withJsonBody(request, (body) => writeResponse(table.create(body), 201))
    return routeNotFound()
  }
  if (first === 'by-slug' && second !== undefined && third === undefined && method === 'GET') return showBySlug(table, decodeURIComponent(second))
  if (second === 'restore' && third === undefined && method === 'POST') return restoreRow(table, first)
  if (second !== undefined) return routeNotFound()

  const id = parseId(first)
  if (method === 'GET') return id === undefined ? badId() : showRow(table, id)
  if (method === 'PATCH') return id === undefined ? badId() : withJsonBody(request, (body) => writeResponse(table.update(id, body), 200, () => notFound(table.resource, `id ${id}`)))
  if (method === 'DELETE') return id === undefined ? badId() : table.delete(id) ? new Response(null, { status: 204 }) : notFound(table.resource, `id ${id}`)
  return routeNotFound()
}

function listRows(table: MemoryTable, query: URLSearchParams): Response {
  const parsed = parseListQuery(table.resource, query)
  return parsed.ok ? jsonResponse(table.list(parsed.request)) : validationProblem(parsed.issues)
}

function showRow(table: MemoryTable, id: number): Response {
  const row = table.findBy(table.resource.primaryKey, id)
  return row === undefined ? notFound(table.resource, `id ${id}`) : jsonResponse({ data: row })
}

function showBySlug(table: MemoryTable, slug: string): Response {
  const resource = table.resource
  if (resource.slug === undefined) {
    return problemResponse(404, 'no_slug', 'No slugs here', `${resource.label.plural} don't have a slug column, so look them up by id instead: /api/${resource.route}/42.`)
  }
  const row = table.findBy(resource.slug.field, slug)
  return row === undefined ? notFound(resource, `slug "${slug}"`) : jsonResponse({ data: row })
}

function restoreRow(table: MemoryTable, rawId: string): Response {
  const id = parseId(rawId)
  if (id === undefined) return badId()
  if (!table.resource.softDeletes) {
    return problemResponse(404, 'no_soft_deletes', 'Nothing to restore', `${table.resource.label.plural} are deleted for good, so they cannot be restored.`)
  }
  const row = table.restore(id)
  return row === undefined ? notFound(table.resource, `id ${id} in the trash`) : jsonResponse({ data: row })
}

/** Read and parse a JSON body, refusing large or broken bodies the way spike 10 does. */
async function withJsonBody(request: Request, use: (body: unknown) => Response): Promise<Response> {
  const text = await request.text()
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    return problemResponse(413, 'payload_too_large', 'Request too large', `Send at most ${MAX_BODY_BYTES} bytes.`)
  }
  let body: unknown
  try {
    body = JSON.parse(text) as unknown
  } catch {
    return problemResponse(400, 'invalid_json', 'Invalid JSON', "The request body isn't valid JSON. Check for a missing quote or comma.")
  }
  return use(body)
}

function writeResponse(result: WriteResult | undefined, status: 200 | 201, missing?: () => Response): Response {
  if (result === undefined) return missing?.() ?? problemResponse(404, 'not_found', 'Not found', 'That row no longer exists.')
  return result.ok ? jsonResponse({ data: result.row satisfies Row }, status) : validationProblem(result.issues)
}

function parseId(raw: string): number | undefined {
  const id = Number(raw)
  return /^\d+$/.test(raw) && Number.isSafeInteger(id) && id > 0 ? id : undefined
}

function notFound(resource: ResourceMetadata, what: string): Response {
  return problemResponse(404, 'not_found', 'Not found', `No ${resource.label.singular.toLowerCase()} has ${what}.`)
}

function badId(): Response {
  return problemResponse(400, 'invalid_id', 'Invalid id', 'Ids are positive whole numbers, for example /api/posts/42.')
}

function routeNotFound(): Response {
  return problemResponse(404, 'route_not_found', 'Not found', 'There is no endpoint at this address.')
}
