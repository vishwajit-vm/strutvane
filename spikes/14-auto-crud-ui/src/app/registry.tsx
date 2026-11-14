/**
 * The app's view of its resources: the generated metadata, combined with the developer-owned
 * settings, resolved once and shared through React context.
 *
 * This is where "migrate → a new screen and sidebar entry" happens at runtime: `ui.gen.ts` lists
 * the new table, `resolveResourceUi` gives it defaults, and every screen reads from here.
 *
 * @module
 */
import { createContext, useContext, type ReactElement, type ReactNode } from 'react'
import type { ResourceUi } from '../shared/define-ui.ts'
import type { ApiClient } from './api/client.ts'
import { isInternalResource } from '../shared/exposure.ts'
import type { AppMetadata } from '../shared/metadata.ts'
import { resolveResourceUi, type ResolvedResourceUi } from '../shared/resolve-ui.ts'

/**
 * All resolved resources, with lookups by table name and by URL route.
 *
 * @example
 * registry.byRoute.get('posts')?.label.plural // 'Posts'
 */
export interface UiRegistryRuntime {
  readonly resources: readonly ResolvedResourceUi[]
  readonly byName: ReadonlyMap<string, ResolvedResourceUi>
  readonly byRoute: ReadonlyMap<string, ResolvedResourceUi>
}

/**
 * Resolve every resource from the generated metadata and the owned settings.
 *
 * @example
 * import { metadata, ownedUi } from '../../example/.strutvane/ui.gen.ts'
 * const registry = buildRegistry(metadata, ownedUi)
 */
export function buildRegistry(metadata: AppMetadata, ownedUi: Readonly<Record<string, ResourceUi>>): UiRegistryRuntime {
  // Defence in depth: even a hand-edited ui.gen.ts cannot put an internal table on screen.
  const resources = metadata.resources.filter((resource) => !isInternalResource(resource)).map((resource) => resolveResourceUi(resource, ownedUi[resource.table]?.config))
  return {
    resources,
    byName: new Map(resources.map((resource) => [resource.name, resource])),
    byRoute: new Map(resources.map((resource) => [resource.metadata.route, resource])),
  }
}

const RegistryContext = createContext<UiRegistryRuntime | null>(null)

/**
 * Provide the registry to the screens.
 *
 * @example
 * <RegistryProvider registry={buildRegistry(metadata, ownedUi)}><App /></RegistryProvider>
 */
export function RegistryProvider({ registry, children }: { readonly registry: UiRegistryRuntime; readonly children: ReactNode }): ReactElement {
  return <RegistryContext.Provider value={registry}>{children}</RegistryContext.Provider>
}

/**
 * Read the registry.
 *
 * @example
 * const { resources } = useRegistry()
 */
export function useRegistry(): UiRegistryRuntime {
  const registry = useContext(RegistryContext)
  if (registry === null) throw new Error('useRegistry() needs a <RegistryProvider> above it.')
  return registry
}

const ApiContext = createContext<ApiClient | null>(null)

/**
 * Provide the API client.
 *
 * @example
 * <ApiProvider client={createApiClient({ baseUrl })}><App /></ApiProvider>
 */
export function ApiProvider({ client, children }: { readonly client: ApiClient; readonly children: ReactNode }): ReactElement {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>
}

/**
 * Read the API client.
 *
 * @example
 * const api = useApi()
 */
export function useApi(): ApiClient {
  const client = useContext(ApiContext)
  if (client === null) throw new Error('useApi() needs an <ApiProvider> above it.')
  return client
}
