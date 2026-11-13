/**
 * The typed API client: generated TYPES (`client.gen/schema.d.ts`, from openapi-typescript) +
 * the `openapi-fetch` runtime (an npm dependency, ~6 kB) + Strutvane's list-query serializer.
 *
 * Why a custom query serializer: OpenAPI's `deepObject` style defines only ONE nesting level, so no
 * generic serializer can produce `filter[status][in]=sent&filter[status][in]=paid`. The client uses
 * the SAME `serializeListParams` whose output the server's `parseListQuery` accepts, so the two
 * cannot drift. It is configured once here; call sites stay plain, fully type-checked calls.
 *
 * @example
 * const api = createApiClient({ baseUrl: 'https://api.example.com' })
 * const { data, error } = await api.GET('/invoices', {
 *   params: { query: { filter: { status: { in: ['sent', 'paid'] } }, sort: ['-amount'], page: { size: 10 } } },
 * })
 *
 * @module
 */
import createClient, { type Client } from 'openapi-fetch'
import type { paths } from './client.gen/schema.d.ts'
import { type ListParams, serializeListParams } from './list-query.ts'

/** The fully typed client for this API. */
export type ApiClient = Client<paths>

/** Options for {@link createApiClient}. */
export interface ApiClientOptions {
  /** Base URL of the API. */
  readonly baseUrl: string
  /** Custom fetch (tests pass the in-process app; browsers and Node use the global fetch). */
  readonly fetch?: (request: Request) => Promise<Response>
}

/** Create the typed client. */
export function createApiClient(options: ApiClientOptions): ApiClient {
  return createClient<paths>({
    baseUrl: options.baseUrl,
    querySerializer: (query) => serializeListParams(query as ListParams),
    ...(options.fetch ? { fetch: options.fetch } : {}),
  })
}
