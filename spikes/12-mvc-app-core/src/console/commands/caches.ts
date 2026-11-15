/**
 * The `optimize` family, like artisan's: `config:cache/clear`, `route:cache/clear`,
 * `event:cache/clear/list`, and `optimize` / `optimize:clear` for all of them at once.
 *
 * Every cache is encrypted with `APP_KEY` and stamped with the code fingerprint, so a cache built
 * with another key or from other code is ignored at boot with a warning (never silently used).
 */
import { CacheManagerToken, defaultCacheManager, type CacheManager } from '../../cache/store.ts'
import { discoverListeners } from '../../events/registry.ts'
import type { Application } from '../../foundation/application.ts'
import { clearCache, writeCache, type CacheKind } from '../../foundation/bootstrap-cache.ts'
import { encodeConfigTree, routeManifest } from '../../foundation/cached-boot.ts'
import type { ConfigRepository } from '../../foundation/config.ts'
import { Keyring, KeyringToken } from '../../security/keyring.ts'
import { StrutvaneError } from '../../support/errors.ts'
import { defineCommand, type Output } from '../command.ts'
import { renderTable } from '../table.ts'

/** The keyring of a config that may not have booted. */
function keyringOf(config: ConfigRepository): Keyring {
  return Keyring.from(String(config.get('app.key')), config.has('app.previous_keys') ? String(config.get('app.previous_keys')) : '')
}

/**
 * Refuse config that JSON can't hold exactly (functions, `undefined`, `NaN`, class instances):
 * cached, it would come back different, and the app would behave differently from the files.
 */
function assertCacheable(value: unknown, path: string): void {
  // `undefined` (an optional env var that is not set) is kept by encodeConfigTree.
  if (value === undefined || value === null || typeof value === 'string' || typeof value === 'boolean') return
  if (typeof value === 'number' && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertCacheable(item, `${path}.${index}`))
    return
  }
  if (typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, item] of Object.entries(value)) assertCacheable(item, path === '' ? key : `${path}.${key}`)
    return
  }
  throw new StrutvaneError('CONFIG_NOT_CACHEABLE', `config("${path}") is a ${typeof value === 'object' ? 'class instance' : typeof value}, which can't be cached.`, 'Config values must be plain data (strings, numbers, booleans, arrays, objects). Move code into a provider.')
}

/**
 * Write the config cache from the real config files.
 *
 * @example
 * cacheConfig(app, new Date())
 */
export function cacheConfig(app: Application, now: Date): void {
  const config = app.loadFreshConfig()
  assertCacheable(config.all, '')
  writeCache(app.basePath, 'config', keyringOf(config), encodeConfigTree(config.all), now)
}

/**
 * Write the route cache from the booted app's checked route table.
 *
 * @example
 * cacheRoutes(app, new Date())
 */
export function cacheRoutes(app: Application, now: Date): number {
  const manifest = routeManifest(app.routes, (route) => app.routeMiddleware(route))
  writeCache(app.basePath, 'routes', app.make(KeyringToken), manifest, now)
  return manifest.routes.length
}

/**
 * Scan app/listeners and write the events cache.
 *
 * @example
 * await cacheEvents(app, new Date())
 */
export async function cacheEvents(app: Application, now: Date): Promise<number> {
  const entries = await discoverListeners(app.basePath)
  writeCache(app.basePath, 'events', keyringOf(app.loadFreshConfig()), entries, now)
  return entries.length
}

function cleared(output: Output, kind: CacheKind, label: string, removed: boolean): void {
  output.line(removed ? `  ✔ ${label} cache cleared (bootstrap/cache/${kind}.json).` : `  · ${label} cache was not cached.`)
}

/** The app's cache manager, without needing a booted app. */
export function cacheManagerOf(app: Application): CacheManager {
  return app.container.has(CacheManagerToken) ? app.make(CacheManagerToken) : defaultCacheManager(app.basePath)
}

/** `node strut config:cache`. */
export const configCacheCommand = defineCommand({
  name: 'config:cache',
  description: 'Cache the configuration (encrypted with APP_KEY)',
  needsBoot: false,
  help: ['After this, changes to .env are not seen until you run config:cache again (or config:clear).'],
  run({ app, output, now }) {
    cacheConfig(app, now())
    output.line('  ✔ Configuration cached (bootstrap/cache/config.json, encrypted with APP_KEY).')
  },
})

/** `node strut config:clear`. */
export const configClearCommand = defineCommand({
  name: 'config:clear',
  description: 'Remove the configuration cache',
  needsBoot: false,
  run({ app, output }) {
    cleared(output, 'config', 'Configuration', clearCache(app.basePath, 'config'))
  },
})

/** `node strut route:cache`. */
export const routeCacheCommand = defineCommand({
  name: 'route:cache',
  description: 'Cache the checked route table so boot can skip the route checks',
  run({ app, output, now }) {
    const count = cacheRoutes(app, now())
    output.line(`  ✔ ${count} routes cached (bootstrap/cache/routes.json).`)
  },
})

/** `node strut route:clear`. */
export const routeClearCommand = defineCommand({
  name: 'route:clear',
  description: 'Remove the route cache',
  needsBoot: false,
  run({ app, output }) {
    cleared(output, 'routes', 'Route', clearCache(app.basePath, 'routes'))
  },
})

/** `node strut event:cache`. */
export const eventCacheCommand = defineCommand({
  name: 'event:cache',
  description: 'Discover listeners in app/listeners and cache the list',
  needsBoot: false,
  async run({ app, output, now }) {
    const count = await cacheEvents(app, now())
    output.line(`  ✔ ${count} listener${count === 1 ? '' : 's'} cached (bootstrap/cache/events.json).`)
  },
})

/** `node strut event:clear`. */
export const eventClearCommand = defineCommand({
  name: 'event:clear',
  description: 'Remove the events cache',
  needsBoot: false,
  run({ app, output }) {
    cleared(output, 'events', 'Event', clearCache(app.basePath, 'events'))
  },
})

/** `node strut event:list`. */
export const eventListCommand = defineCommand({
  name: 'event:list',
  description: 'List every event and its listeners',
  options: { json: { type: 'boolean', description: 'Print JSON for scripts and agents' } },
  run({ app, options, output }) {
    const events = app.events.list()
    if (options.json) {
      output.line(JSON.stringify(events, null, 2))
      return
    }
    if (events.length === 0) {
      output.line('  No listeners. Add a *.listener.ts file in app/listeners.')
      return
    }
    output.line(renderTable(['Event', 'Listeners'], events.map((event) => [event.event, event.listeners.join(', ')])))
  },
})

/** `node strut optimize`. */
export const optimizeCommand = defineCommand({
  name: 'optimize',
  description: 'Cache the config, routes and events in one go',
  async run({ app, output, now }) {
    cacheConfig(app, now())
    const routes = cacheRoutes(app, now())
    const listeners = await cacheEvents(app, now())
    output.line(`  ✔ Cached: configuration, ${routes} routes, ${listeners} listener${listeners === 1 ? '' : 's'}.`)
  },
})

/** `node strut optimize:clear`. */
export const optimizeClearCommand = defineCommand({
  name: 'optimize:clear',
  description: 'Remove every bootstrap cache and clear the application cache',
  needsBoot: false,
  run({ app, output }) {
    cleared(output, 'config', 'Configuration', clearCache(app.basePath, 'config'))
    cleared(output, 'routes', 'Route', clearCache(app.basePath, 'routes'))
    cleared(output, 'events', 'Event', clearCache(app.basePath, 'events'))
    const store = cacheManagerOf(app).store()
    output.line(`  ✔ Application cache cleared (${store?.flush() ?? 0} entries).`)
  },
})
