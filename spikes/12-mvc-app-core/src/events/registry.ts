/**
 * Events and listeners, with Laravel 11's discovery: every `app/listeners/*.listener.ts` file
 * exporting a class with `static readonly event = 'post.published'` and a `handle(payload)`
 * method is a listener. `node strut event:cache` writes the discovered list to
 * `bootstrap/cache/events.json` so production skips the folder scan; `event:list` shows it.
 *
 * Listener modules are imported on first dispatch, not at boot, so a cached app boots without
 * loading listener code it may never need.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { StrutvaneError } from '../support/errors.ts'

/**
 * A listener class.
 *
 * @example
 * export class LogPostPublished {
 *   static readonly event = 'post.published'
 *   handle(payload: unknown): void { … }
 * }
 */
export interface ListenerClass {
  readonly event: string
  readonly name: string
  new (): { handle(payload: unknown): void | Promise<void> }
}

/**
 * Where a discovered listener lives: a file relative to the app and the export name.
 *
 * @example
 * const entry: ListenerEntry = { event: 'post.published', file: 'app/listeners/log-post-published.listener.ts', exportName: 'LogPostPublished' }
 */
export interface ListenerEntry {
  readonly event: string
  readonly file: string
  readonly exportName: string
}

/** The folder discovery scans, relative to the app. */
export const LISTENERS_FOLDER = join('app', 'listeners')

/**
 * Scan `app/listeners` and import each `*.listener.ts` to find its listener classes.
 *
 * @example
 * const entries = await discoverListeners('/srv/blog')
 */
export async function discoverListeners(basePath: string): Promise<ListenerEntry[]> {
  const entries: ListenerEntry[] = []
  for (const file of listenerFiles(join(basePath, LISTENERS_FOLDER))) {
    const module: Record<string, unknown> = await import(pathToFileURL(file).href)
    for (const [exportName, value] of Object.entries(module)) {
      if (isListenerClass(value)) entries.push({ event: value.event, file: relative(basePath, file).split(sep).join('/'), exportName })
    }
  }
  return entries.sort((a, b) => a.event.localeCompare(b.event) || a.file.localeCompare(b.file))
}

function listenerFiles(folder: string): string[] {
  if (!existsSync(folder)) return []
  return readdirSync(folder)
    .flatMap((name) => {
      const path = join(folder, name)
      return statSync(path).isDirectory() ? listenerFiles(path) : name.endsWith('.listener.ts') || name.endsWith('.listener.js') ? [path] : []
    })
    .sort()
}

function isListenerClass(value: unknown): value is ListenerClass {
  return typeof value === 'function' && 'event' in value && typeof value.event === 'string' && typeof (value.prototype as { handle?: unknown } | undefined)?.handle === 'function'
}

/**
 * Checks a cached listener list (it came from a file, so it is checked like input).
 *
 * @example
 * isListenerList(JSON.parse(text)) // true
 */
export function isListenerList(value: unknown): value is ListenerEntry[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === 'object' && entry !== null && typeof entry.event === 'string' && typeof entry.file === 'string' && typeof entry.exportName === 'string' && !entry.file.includes('..'))
}

/**
 * The app's event registry: discovered (or cached) listeners plus explicit `listen()` calls.
 *
 * @example
 * await app.events.dispatch('post.published', { id: 7 })
 */
export class EventRegistry {
  readonly #basePath: string
  readonly #entries: ListenerEntry[] = []
  readonly #explicit = new Map<string, ListenerClass[]>()

  constructor(basePath: string) {
    this.#basePath = basePath
  }

  /** Replace the discovered entries (boot does this from the cache or a scan). */
  useDiscovered(entries: readonly ListenerEntry[]): void {
    this.#entries.splice(0, this.#entries.length, ...entries)
  }

  /**
   * Register a listener by hand (from a provider).
   *
   * @example
   * app.events.listen(SendInvoice)
   */
  listen(listener: ListenerClass): void {
    this.#explicit.set(listener.event, [...(this.#explicit.get(listener.event) ?? []), listener])
  }

  /**
   * Every event and its listeners, for `event:list`.
   *
   * @example
   * app.events.list() // [{ event: 'post.published', listeners: ['LogPostPublished (app/listeners/…)'] }]
   */
  list(): { readonly event: string; readonly listeners: readonly string[] }[] {
    const events = new Map<string, string[]>()
    for (const entry of this.#entries) events.set(entry.event, [...(events.get(entry.event) ?? []), `${entry.exportName} (${entry.file})`])
    for (const [event, listeners] of this.#explicit) events.set(event, [...(events.get(event) ?? []), ...listeners.map((listener) => listener.name)])
    return [...events].sort(([a], [b]) => a.localeCompare(b)).map(([event, listeners]) => ({ event, listeners }))
  }

  /**
   * Run every listener of an event, in order.
   *
   * @example
   * await app.events.dispatch('post.published', { id: post.id })
   */
  async dispatch(event: string, payload: unknown): Promise<void> {
    for (const entry of this.#entries.filter((candidate) => candidate.event === event)) {
      const module: Record<string, unknown> = await import(pathToFileURL(join(this.#basePath, entry.file)).href)
      const listener = module[entry.exportName]
      if (!isListenerClass(listener)) throw new StrutvaneError('LISTENER_MOVED', `${entry.exportName} is no longer a listener in ${entry.file}.`, 'Run `node strut event:cache` again (or event:clear).')
      await new listener().handle(payload)
    }
    for (const listener of this.#explicit.get(event) ?? []) await new listener().handle(payload)
  }
}
