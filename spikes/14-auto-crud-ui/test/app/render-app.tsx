/**
 * Render the whole app (router, providers, generated registry) against an in-process API, and
 * record every request so tests can assert the exact wire format.
 */
import { QueryClient } from '@tanstack/react-query'
import { createMemoryHistory, type RouterHistory } from '@tanstack/react-router'
import { render, screen, type RenderResult } from '@testing-library/react'
import userEvent, { type UserEvent } from '@testing-library/user-event'
import { metadata as generatedMetadata, ownedUi } from '../../example/.strutvane/ui.gen.ts'
import { createApiClient, type Transport } from '../../src/app/api/client.ts'
import { App } from '../../src/app/App.tsx'
import type { Role } from '../../src/app/auth/session.tsx'
import { buildRegistry, type UiRegistryRuntime } from '../../src/app/registry.tsx'
import { createMockApi, type MockApi } from '../../src/mock-api/mock-api.ts'
import { seedBlog } from '../../src/mock-api/seed.ts'
import type { AppMetadata } from '../../src/shared/metadata.ts'

/** A fixed clock, so created_at values are predictable. */
export const NOW = new Date('2026-11-14T09:00:00.000Z')

/** One request the UI sent. */
export interface RecordedRequest {
  readonly method: string
  readonly url: URL
  readonly body: unknown
}

/** Options for {@link renderApp}. */
export interface RenderAppOptions {
  /** Start at this URL path. */
  readonly path: string
  /** Signed-in role; `null` for signed out. Default: admin. */
  readonly role?: Role | null
  /** Metadata to use (default: the example app's generated metadata). */
  readonly metadata?: AppMetadata
  /** Seed the demo data (default true). */
  readonly seed?: boolean
  /** Replace the transport (to simulate errors or delays); receives the mock's handler. */
  readonly transport?: (mock: MockApi) => Transport
}

/** What a test gets back. */
export interface RenderedApp extends RenderResult {
  readonly mock: MockApi
  readonly requests: RecordedRequest[]
  readonly history: RouterHistory
  readonly user: UserEvent
  readonly registry: UiRegistryRuntime
}

/**
 * Render the app at a path.
 *
 * @example
 * const app = renderApp({ path: '/posts' })
 * await screen.findByRole('heading', { name: 'Posts' })
 */
export function renderApp(options: RenderAppOptions): RenderedApp {
  const metadata = options.metadata ?? generatedMetadata
  const mock = createMockApi(metadata, { now: () => NOW })
  if (options.seed !== false) seedBlog(mock)
  const requests: RecordedRequest[] = []
  const base = options.transport?.(mock) ?? ((request: Request) => mock.handle(request))
  const transport: Transport = async (request) => {
    const body = request.method === 'GET' || request.method === 'DELETE' ? undefined : await request.clone().text().then((text) => (text === '' ? undefined : (JSON.parse(text) as unknown)))
    requests.push({ method: request.method, url: new URL(request.url), body })
    return base(request)
  }
  const registry = buildRegistry(metadata, ownedUi)
  const history = createMemoryHistory({ initialEntries: [options.path] })
  const role = options.role === undefined ? 'admin' : options.role
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } })
  const result = render(
    <App
      api={createApiClient({ baseUrl: 'http://test.local/api', transport })}
      registry={registry}
      history={history}
      initialUser={role === null ? null : { email: 'tester@example.com', role }}
      queryClient={queryClient}
    />,
  )
  return { ...result, mock, requests, history, user: userEvent.setup(), registry }
}

/**
 * The query parameters of the last list request to a resource, as a plain object.
 *
 * @example
 * lastListQuery(app.requests, 'posts') // { page: '1', perPage: '25', sort: '-created_at' }
 */
export function lastListQuery(requests: readonly RecordedRequest[], route: string): Record<string, string> {
  const last = requests.filter((request) => request.method === 'GET' && request.url.pathname === `/api/${route}`).at(-1)
  return last === undefined ? {} : Object.fromEntries(last.url.searchParams)
}

/**
 * Wait for the posts table (or any resource's) to show its first data row.
 *
 * @example
 * await waitForTable('Posts')
 */
export async function waitForTable(caption: string): Promise<HTMLElement> {
  return screen.findByRole('table', { name: caption })
}
