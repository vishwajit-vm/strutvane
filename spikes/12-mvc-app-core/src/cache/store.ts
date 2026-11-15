/**
 * The application cache, Laravel's `Cache` facade, small: named stores behind one interface.
 * `file` (the default, shared by every process of the app) lives in `storage/framework/cache/data`;
 * `memory` lives for one process. `node strut cache:clear [--store=…]` and `cache:forget <key>`
 * work on these. A shared Redis or database store is a driver behind the same interface.
 *
 * File names are SHA-256 hashes of the keys, so a key like `../../.env` can never become a path.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { token } from '../foundation/container.ts'
import { parseJsonSafely } from '../security/safe-json.ts'
import { removeFile, writeFileAtomic } from '../support/atomic-write.ts'

/**
 * A cache store.
 *
 * @example
 * await store.put('stats', { posts: 3 }, 60)
 */
export interface CacheStore {
  get(key: string, now: Date): unknown
  /** `ttlSeconds` undefined means "until forgotten". */
  put(key: string, value: unknown, now: Date, ttlSeconds?: number): void
  /** `true` when the key existed. */
  forget(key: string): boolean
  /** Remove everything; returns how many entries were removed. */
  flush(): number
}

interface Entry {
  readonly value: unknown
  readonly expiresAt: number | null
}

/**
 * The per-process store.
 *
 * @example
 * new MemoryCacheStore()
 */
export class MemoryCacheStore implements CacheStore {
  readonly #entries = new Map<string, Entry>()

  get(key: string, now: Date): unknown {
    const entry = this.#entries.get(key)
    if (entry === undefined || (entry.expiresAt !== null && entry.expiresAt <= now.getTime())) return undefined
    return entry.value
  }

  put(key: string, value: unknown, now: Date, ttlSeconds?: number): void {
    this.#entries.set(key, { value, expiresAt: ttlSeconds === undefined ? null : now.getTime() + ttlSeconds * 1000 })
  }

  forget(key: string): boolean {
    return this.#entries.delete(key)
  }

  flush(): number {
    const count = this.#entries.size
    this.#entries.clear()
    return count
  }
}

/** The file store's folder, relative to the app. */
export const FILE_CACHE_FOLDER = join('storage', 'framework', 'cache', 'data')

/**
 * The file store: one JSON file per key, written atomically.
 *
 * @example
 * new FileCacheStore('/srv/blog')
 */
export class FileCacheStore implements CacheStore {
  readonly #folder: string

  constructor(basePath: string) {
    this.#folder = join(basePath, FILE_CACHE_FOLDER)
  }

  get(key: string, now: Date): unknown {
    const path = this.#path(key)
    if (!existsSync(path)) return undefined
    try {
      const entry = parseJsonSafely(readFileSync(path, 'utf8'), { maxDepth: 64, maxKeys: 100_000 })
      // A file edited by hand into something else is a miss, never a crash.
      if (typeof entry !== 'object' || entry === null || !('expiresAt' in entry) || !('value' in entry)) return undefined
      if (typeof entry.expiresAt === 'number' && entry.expiresAt <= now.getTime()) return undefined
      return entry.value
    } catch {
      return undefined
    }
  }

  put(key: string, value: unknown, now: Date, ttlSeconds?: number): void {
    const entry: Entry = { value, expiresAt: ttlSeconds === undefined ? null : now.getTime() + ttlSeconds * 1000 }
    writeFileAtomic(this.#path(key), JSON.stringify(entry))
  }

  forget(key: string): boolean {
    return removeFile(this.#path(key))
  }

  flush(): number {
    if (!existsSync(this.#folder)) return 0
    return readdirSync(this.#folder)
      .filter((name) => name.endsWith('.json'))
      .filter((name) => removeFile(join(this.#folder, name))).length
  }

  #path(key: string): string {
    return join(this.#folder, `${createHash('sha256').update(key).digest('hex')}.json`)
  }
}

/**
 * The named stores of an app.
 *
 * @example
 * app.make(CacheManagerToken).store('file').flush()
 */
export class CacheManager {
  readonly #stores: ReadonlyMap<string, CacheStore>
  readonly defaultStore: string

  constructor(stores: ReadonlyMap<string, CacheStore>, defaultStore: string) {
    this.#stores = stores
    this.defaultStore = defaultStore
  }

  /** Store names, for errors and help. */
  get names(): readonly string[] {
    return [...this.#stores.keys()]
  }

  /**
   * A store by name (the default when omitted), or `undefined`.
   *
   * @example
   * manager.store('memory')
   */
  store(name: string = this.defaultStore): CacheStore | undefined {
    return this.#stores.get(name)
  }
}

/**
 * The default stores for an app at `basePath`.
 *
 * @example
 * defaultCacheManager('/srv/blog').store()?.put('k', 1, new Date())
 */
export function defaultCacheManager(basePath: string): CacheManager {
  return new CacheManager(new Map<string, CacheStore>([['file', new FileCacheStore(basePath)], ['memory', new MemoryCacheStore()]]), 'file')
}

/**
 * The container token for the cache manager.
 *
 * @example
 * app.make(CacheManagerToken)
 */
export const CacheManagerToken = token<CacheManager>('CacheManager')
