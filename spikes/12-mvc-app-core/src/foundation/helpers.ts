/**
 * Friendly helpers, Laravel's `config()` and `app()`, without facades: they are plain functions
 * you import, fully typed, and they read the *current* app (see `context.ts`), so nothing is a
 * global singleton.
 */
import type { ConfigRegistry } from '../registry.ts'
import type { ConfigPath, ConfigValue } from './config.ts'
import { currentApplication, type ApplicationScope } from './context.ts'
import { ClockToken } from './tokens.ts'

/**
 * Read a config value by dot path. The key and the return type come from the app's config files.
 *
 * @example
 * config('app.name')  // string
 * config('app.debug') // boolean
 * config('app.nmae')  // compile error
 */
export function config<TKey extends ConfigPath<ConfigRegistry> & string>(key: TKey): ConfigValue<ConfigRegistry, TKey> {
  // The repository was built from the same files the registry types come from.
  return currentApplication('config()').config.get(key) as ConfigValue<ConfigRegistry, TKey>
}

/**
 * The current time from the app's clock, Laravel's `now()`. Tests freeze it by binding
 * `ClockToken`, so timestamps written through it are deterministic.
 *
 * @example
 * await post.update({ published_at: now() })
 */
export function now(): Date {
  return currentApplication('now()').container.make(ClockToken)()
}

/**
 * The current application (container, config, URLs).
 *
 * @example
 * const db = app().container.make(ConnectionToken)
 */
export function app(): ApplicationScope {
  return currentApplication('app()')
}
