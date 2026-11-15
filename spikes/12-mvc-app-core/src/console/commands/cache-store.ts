/**
 * `node strut cache:clear [--store=file]` and `cache:forget <key> [--store=file]`: the
 * application cache (not the bootstrap caches; those are `optimize:clear`).
 */
import { StrutvaneError } from '../../support/errors.ts'
import { closestMatch } from '../../support/str.ts'
import type { Application } from '../../foundation/application.ts'
import type { CacheStore } from '../../cache/store.ts'
import { defineCommand } from '../command.ts'
import { cacheManagerOf } from './caches.ts'

function storeNamed(app: Application, name: string | undefined): { readonly name: string; readonly store: CacheStore } {
  const manager = cacheManagerOf(app)
  const chosen = name ?? manager.defaultStore
  const store = manager.store(chosen)
  if (store !== undefined) return { name: chosen, store }
  const suggestion = closestMatch(chosen, manager.names)
  throw new StrutvaneError('UNKNOWN_CACHE_STORE', `There is no "${chosen}" cache store.`, suggestion === undefined ? `Stores: ${manager.names.join(', ')}.` : `Did you mean "${suggestion}"?`)
}

/** `node strut cache:clear`. */
export const cacheClearCommand = defineCommand({
  name: 'cache:clear',
  description: 'Flush the application cache',
  needsBoot: false,
  options: { store: { type: 'string', description: 'The store to flush (default: the default store)' } },
  run({ app, options, output }) {
    const { name, store } = storeNamed(app, options.store)
    const count = store.flush()
    output.line(`  ✔ Application cache cleared: ${count} entr${count === 1 ? 'y' : 'ies'} removed from the "${name}" store.`)
  },
})

/** `node strut cache:forget <key>`. */
export const cacheForgetCommand = defineCommand({
  name: 'cache:forget',
  description: 'Remove one key from the application cache',
  needsBoot: false,
  arguments: [{ name: 'key', description: 'The cache key', required: true }],
  options: { store: { type: 'string', description: 'The store (default: the default store)' } },
  run({ app, args, options, output }) {
    const key = args[0] ?? ''
    const { name, store } = storeNamed(app, options.store)
    output.line(store.forget(key) ? `  ✔ Removed "${key}" from the "${name}" store.` : `  · "${key}" was not in the "${name}" store.`)
  },
})
