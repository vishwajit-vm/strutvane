/**
 * `<App>`: every provider in one place (query cache, API client, resource registry, session,
 * theme, router). The browser entry and the tests both render this, with different inputs.
 *
 * @module
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, type RouterHistory } from '@tanstack/react-router'
import { useState, type ReactElement } from 'react'
import type { ApiClient } from './api/client.ts'
import { SessionProvider, type SessionUser } from './auth/session.tsx'
import { ApiProvider, RegistryProvider, type UiRegistryRuntime } from './registry.tsx'
import { createAppRouter } from './router.tsx'
import { ToastProvider } from './components/ui/toast.tsx'
import { ThemeProvider } from './theme/theme.tsx'

/**
 * Props of {@link App}.
 *
 * @example
 * const props: AppProps = { api, registry }
 */
export interface AppProps {
  readonly api: ApiClient
  readonly registry: UiRegistryRuntime
  /** Tests pass a memory history and a signed-in user; the browser passes neither. */
  readonly history?: RouterHistory
  readonly initialUser?: SessionUser | null
  /** Tests pass a client with retries off, so an error shows at once. */
  readonly queryClient?: QueryClient
}

/**
 * The whole admin app.
 *
 * @example
 * createRoot(element).render(<App api={createApiClient({ baseUrl })} registry={buildRegistry(metadata, ownedUi)} />)
 */
export function App({ api, registry, history, initialUser, queryClient }: AppProps): ReactElement {
  // Created once per mount: a new client per render would drop the cache.
  const [client] = useState(() => queryClient ?? new QueryClient({ defaultOptions: { queries: { staleTime: 10_000, retry: 1 } } }))
  const [router] = useState(() => createAppRouter(history))
  return (
    <QueryClientProvider client={client}>
      <ApiProvider client={api}>
        <RegistryProvider registry={registry}>
          <SessionProvider {...(initialUser === undefined ? {} : { initialUser })}>
            <ThemeProvider>
              <ToastProvider>
                <RouterProvider router={router} />
              </ToastProvider>
            </ThemeProvider>
          </SessionProvider>
        </RegistryProvider>
      </ApiProvider>
    </QueryClientProvider>
  )
}
