/**
 * The HTTP client the screens use. It speaks spike 10's API (plus the mock's restore extension)
 * and turns every failure into an {@link ApiError} carrying an RFC 9457 problem.
 *
 * Why a `transport` function: the browser passes `fetch`; tests pass a Hono app's `fetch` or the
 * mock's handler, so the same client runs against spike 10 in-process with no network or ports.
 *
 * @module
 */
import type { ResourceMetadata } from '../../shared/metadata.ts'
import { toQueryString, type ListParams } from './list-params.ts'

/**
 * A row as the API returns it.
 *
 * @example
 * const row: ApiRow = { id: 1, title: 'Hello', price: '12.50' }
 */
export type ApiRow = Readonly<Record<string, unknown>>

/**
 * One page of a list, with Laravel-style paginator numbers (spike 10's `meta`).
 *
 * @example
 * const page: ListPage = { data: [], meta: { page: 1, perPage: 25, total: 0, lastPage: 1, from: null, to: null } }
 */
export interface ListPage {
  readonly data: readonly ApiRow[]
  readonly meta: { readonly page: number; readonly perPage: number; readonly total: number; readonly lastPage: number; readonly from: number | null; readonly to: number | null }
}

/**
 * One problem with one field, from a 422 response.
 *
 * @example
 * const issue: FieldIssue = { field: 'title', code: 'required', message: 'Title is required.' }
 */
export interface FieldIssue {
  readonly field: string
  readonly code: string
  readonly message: string
}

/**
 * A failed request, always with a well-formed problem, whatever the server sent (HTML from a
 * proxy, an empty body, nothing at all when offline).
 *
 * @example
 * try { await api.create(posts, body) } catch (error) { if (error instanceof ApiError) error.issues }
 */
export class ApiError extends Error {
  override readonly name = 'ApiError'
  /** HTTP status, or 0 when the server could not be reached. */
  readonly status: number
  readonly code: string
  readonly title: string
  readonly issues: readonly FieldIssue[]

  constructor(status: number, code: string, title: string, detail: string, issues: readonly FieldIssue[] = []) {
    super(detail)
    this.status = status
    this.code = code
    this.title = title
    this.issues = issues
  }
}

/**
 * Sends a request and returns the response; `fetch` in the browser.
 *
 * @example
 * const transport: Transport = (request) => fetch(request)
 */
export type Transport = (request: Request) => Promise<Response>

/**
 * Everything the screens can ask the API.
 *
 * @example
 * const page = await api.list(posts, { page: 1, perPage: 25, search: '', sort: '-created_at', filters: {}, trashed: 'without' })
 */
export interface ApiClient {
  list(resource: ResourceMetadata, params: ListParams): Promise<ListPage>
  /** One row by its route key: the slug when the resource has one (`/by-slug/hello`), else the id. */
  findByRouteKey(resource: ResourceMetadata, key: string): Promise<ApiRow>
  findById(resource: ResourceMetadata, id: number): Promise<ApiRow>
  create(resource: ResourceMetadata, body: Readonly<Record<string, unknown>>): Promise<ApiRow>
  update(resource: ResourceMetadata, id: number, body: Readonly<Record<string, unknown>>): Promise<ApiRow>
  remove(resource: ResourceMetadata, id: number): Promise<void>
  restore(resource: ResourceMetadata, id: number): Promise<ApiRow>
}

/**
 * Options for {@link createApiClient}.
 *
 * @example
 * createApiClient({ baseUrl: `${location.origin}/api` })
 */
export interface ApiClientOptions {
  /** Absolute URL of the API root, for example `https://app.test/api`. */
  readonly baseUrl: string
  readonly transport?: Transport
}

/**
 * Build the API client.
 *
 * @example
 * const api = createApiClient({ baseUrl: 'http://test.local/api', transport: (request) => app.fetch(request) })
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const transport = options.transport ?? ((request: Request) => fetch(request))
  const base = options.baseUrl.replace(/\/+$/, '')
  const url = (resource: ResourceMetadata, path = ''): string => `${base}/${resource.route}${path}`

  const send = async (method: string, target: string, body?: unknown): Promise<unknown> => {
    let response: Response
    try {
      const init: RequestInit = body === undefined ? { method } : { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }
      response = await transport(new Request(target, { ...init, headers: { accept: 'application/json', ...(init.headers ?? {}) } }))
    } catch {
      throw new ApiError(0, 'network_error', 'No connection', 'The server could not be reached. Check your connection and try again.')
    }
    if (!response.ok) throw await problemFrom(response)
    return response.status === 204 ? undefined : readJson(response)
  }

  return {
    list: async (resource, params) => toListPage(await send('GET', `${url(resource)}?${toQueryString(params)}`)),
    findByRouteKey: async (resource, key) => {
      const path = resource.slug === undefined ? `/${encodeURIComponent(key)}` : `/by-slug/${encodeURIComponent(key)}`
      return toRow(await send('GET', url(resource, path)))
    },
    findById: async (resource, id) => toRow(await send('GET', url(resource, `/${id}`))),
    create: async (resource, body) => toRow(await send('POST', url(resource), body)),
    update: async (resource, id, body) => toRow(await send('PATCH', url(resource, `/${id}`), body)),
    remove: async (resource, id) => {
      await send('DELETE', url(resource, `/${id}`))
    },
    restore: async (resource, id) => toRow(await send('POST', url(resource, `/${id}/restore`))),
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown
  } catch {
    throw new ApiError(response.status, 'invalid_response', 'Unexpected response', 'The server sent something that is not JSON. Try again in a moment.')
  }
}

/**
 * Read a problem+json body defensively: malformed issues are dropped, and anything that is not a
 * problem becomes a generic one based on the status. Never throws while reading.
 */
async function problemFrom(response: Response): Promise<ApiError> {
  let body: unknown
  try {
    body = (await response.json()) as unknown
  } catch {
    body = undefined
  }
  const record = isRecord(body) ? body : {}
  const code = typeof record['code'] === 'string' ? record['code'] : `http_${response.status}`
  const title = typeof record['title'] === 'string' ? record['title'] : 'Request failed'
  // Server errors never show internal details; everything else shows the server's friendly text.
  const detail = response.status >= 500 || typeof record['detail'] !== 'string' ? fallbackDetail(response.status) : record['detail']
  const issues = Array.isArray(record['issues']) ? record['issues'].filter(isIssue) : []
  return new ApiError(response.status, code, title, detail, issues)
}

function fallbackDetail(status: number): string {
  if (status === 404) return 'This record does not exist, or you do not have access to it.'
  if (status === 403) return 'You do not have permission to do that.'
  if (status >= 500) return 'The server had a problem. Please try again; if it keeps happening, tell your administrator.'
  return 'The request could not be completed. Please try again.'
}

function toListPage(value: unknown): ListPage {
  if (!isRecord(value) || !Array.isArray(value['data']) || !isRecord(value['meta'])) throw unexpectedShape()
  const meta = value['meta']
  const number = (key: string): number => (typeof meta[key] === 'number' ? meta[key] : 0)
  const nullableNumber = (key: string): number | null => (typeof meta[key] === 'number' ? meta[key] : null)
  return {
    data: value['data'].filter(isRecord),
    meta: { page: number('page'), perPage: number('perPage'), total: number('total'), lastPage: Math.max(1, number('lastPage')), from: nullableNumber('from'), to: nullableNumber('to') },
  }
}

function toRow(value: unknown): ApiRow {
  if (!isRecord(value) || !isRecord(value['data'])) throw unexpectedShape()
  return value['data']
}

function unexpectedShape(): ApiError {
  return new ApiError(200, 'invalid_response', 'Unexpected response', 'The server answered in a format this screen does not understand.')
}

function isIssue(value: unknown): value is FieldIssue {
  return isRecord(value) && typeof value['field'] === 'string' && typeof value['code'] === 'string' && typeof value['message'] === 'string'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
