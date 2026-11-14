/**
 * `node strut charts:sync`: run after every migrate (the `schema.migrated` hook, like spike 14's
 * `ui:sync`). It reads `.strutvane/resources.json` and writes:
 *
 * | File | Owner | When |
 * |---|---|---|
 * | `.strutvane/charts.gen.ts` | machine | every sync (atomic, skipped when unchanged) |
 * | `.strutvane/charts.lock.json` | machine, committed | every sync |
 * | `resources/charts/<route>.charts.ts` | developer | **once**, for a new resource; `wx` create-once, never overwritten or recreated |
 *
 * Regenerated suggestions therefore never overwrite edits: `auto()` lists pick new suggestions up
 * by themselves at runtime, and explicit lists get a report line instead of a rewrite.
 *
 * @module
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { DEFAULT_TENANT_COLUMN } from '../shared/capabilities.ts'
import { isInternalResource } from '../shared/exposure.ts'
import { parseAppMetadata, type AppMetadata } from '../shared/metadata.ts'
import { suggestCharts } from '../shared/suggest.ts'
import { readOwnedCharts } from './owned-reader.ts'
import { chartableResources, ownedPath, renderLock, renderOwnedFile, renderRegistry, type ChartsLock } from './render.ts'

const RESOURCES_JSON = '.strutvane/resources.json'
const REGISTRY = '.strutvane/charts.gen.ts'
const LOCK = '.strutvane/charts.lock.json'

/**
 * What one sync did and has to say.
 *
 * @example
 * const result = syncCharts('my-app')
 * console.log(result.report.join('\n'))
 */
export interface SyncResult {
  /** Paths (relative to the app) that were written. */
  readonly written: readonly string[]
  /** Human-readable lines: `+` done, `!` needs your attention, `-` skipped, `?` could not check. */
  readonly report: readonly string[]
}

/**
 * Options for {@link syncCharts}.
 *
 * @example
 * syncCharts('my-app', { dryRun: true })
 */
export interface SyncOptions {
  /** Report only; write nothing. */
  readonly dryRun?: boolean
  readonly tenantColumn?: string | false
}

/**
 * Thrown when the app has no usable resources.json. The message says what to run.
 *
 * @example
 * try { syncCharts('.') } catch (error) { if (error instanceof SyncError) console.error(error.message) }
 */
export class SyncError extends Error {
  override readonly name = 'SyncError'
}

/**
 * Sync chart files for an app directory.
 *
 * @example
 * syncCharts('example').report
 * // ['+ New chart file resources/charts/invoices.charts.ts (9 suggestions)', …]
 */
export function syncCharts(appDir: string, options: SyncOptions = {}): SyncResult {
  const tenantColumn = options.tenantColumn ?? DEFAULT_TENANT_COLUMN
  const metadata = readMetadata(appDir)
  const lock = readLock(appDir)
  const report: string[] = []
  const written: string[] = []
  const write = (path: string, text: string, createOnly: boolean): void => {
    if (options.dryRun === true) return
    if (createOnly ? createOnce(join(appDir, path), text) : writeIfChanged(join(appDir, path), text)) written.push(path)
  }

  for (const resource of metadata.resources.filter(isInternalResource)) report.push(`- Skipped internal table ${resource.table}: it never gets charts or an aggregate endpoint.`)
  const owned = new Set<string>()
  for (const resource of chartableResources(metadata)) {
    const suggestions = suggestCharts(metadata, resource, tenantColumn).map((widget) => widget.id)
    const path = ownedPath(resource.route)
    const previous = lock?.suggestions[resource.route]
    if (existsSync(join(appDir, path))) {
      owned.add(resource.route)
      checkOwnedFile(path, readFileSync(join(appDir, path), 'utf8'), suggestions, previous, report)
    } else if (suggestions.length > 0 && (previous === undefined || previous.length === 0)) {
      // A new resource, or one that just got its first suggestion: scaffold its owned file, once.
      write(path, renderOwnedFile(resource), true)
      owned.add(resource.route)
      report.push(`+ New chart file ${path} (${suggestions.length} suggestions).`)
    } else if (previous !== undefined && previous.length > 0) {
      // It had suggestions (so a file was scaffolded) and the file is gone: the developer deleted it.
      report.push(`! ${path} was deleted. Its resource now uses the defaults; it is not recreated.`)
    }
  }
  reportOrphans(appDir, metadata, report)
  write(REGISTRY, renderRegistry(metadata, owned, tenantColumn), false)
  write(LOCK, renderLock(metadata, tenantColumn), false)
  return { written, report }
}

/** Compare an owned file with the current suggestions and the lock. */
function checkOwnedFile(path: string, source: string, suggestions: readonly string[], previous: readonly string[] | undefined, report: string[]): void {
  const shape = readOwnedCharts(path, source)
  for (const problem of shape.problems) report.push(`? ${problem}`)
  const fresh = previous === undefined ? [] : suggestions.filter((id) => !previous.includes(id))
  for (const id of fresh) {
    if (shape.widgets.kind === 'explicit') report.push(`! New suggestion ${id} is NOT shown: widgets in ${path} is an explicit list. Add '${id}' to show it.`)
    else if (shape.widgets.kind !== 'unreadable') report.push(`+ New suggestion ${id} is shown (widgets: auto()).`)
  }
  const named = [...(shape.widgets.kind === 'auto' || shape.widgets.kind === 'explicit' ? shape.widgets.named : []), ...shape.dashboardIds]
  for (const id of new Set(named)) {
    if (!suggestions.includes(id) && !isCustomId(source, id)) report.push(`! ${path} names '${id}', which is no longer a suggestion (was a column dropped?). TypeScript reports it too.`)
  }
}

/** A dashboard entry may name a hand-made chart's id, which appears as `id: '…'` in the file. */
function isCustomId(source: string, id: string): boolean {
  return source.includes(`id: '${id}'`) || source.includes(`id: "${id}"`)
}

/** Owned files whose resource is gone or became internal: kept, and reported. */
function reportOrphans(appDir: string, metadata: AppMetadata, report: string[]): void {
  const directory = join(appDir, 'resources/charts')
  if (!existsSync(directory)) return
  const routes = new Set(chartableResources(metadata).map((resource) => resource.route))
  for (const file of readdirSync(directory).sort()) {
    const route = file.endsWith('.charts.ts') ? file.slice(0, -'.charts.ts'.length) : undefined
    if (route !== undefined && !routes.has(route)) report.push(`! Orphaned: resources/charts/${file} has no resource "${route}" any more. It is kept; delete it if the table is gone for good.`)
  }
}

function readMetadata(appDir: string): AppMetadata {
  const path = join(appDir, RESOURCES_JSON)
  if (!existsSync(path)) throw new SyncError(`No ${RESOURCES_JSON} in ${appDir}. Run \`node strut migrate\` first; it writes the file charts:sync reads.`)
  try {
    return parseAppMetadata(JSON.parse(readFileSync(path, 'utf8')))
  } catch (error) {
    throw new SyncError(`${RESOURCES_JSON} could not be read (${error instanceof Error ? error.message : String(error)}). Run \`node strut migrate\` to rewrite it.`)
  }
}

/** A missing or damaged lock is treated as "first sync": safe, because owned files are never overwritten. */
function readLock(appDir: string): ChartsLock | undefined {
  try {
    const value: unknown = JSON.parse(readFileSync(join(appDir, LOCK), 'utf8'))
    if (typeof value === 'object' && value !== null && 'version' in value && value.version === 1 && 'suggestions' in value && typeof value.suggestions === 'object' && value.suggestions !== null) {
      return value as ChartsLock
    }
  } catch {
    // Missing or not JSON: fall through.
  }
  return undefined
}

/** Create a file only if it doesn't exist (`wx`): the one write that may touch owned code. */
function createOnce(path: string, text: string): boolean {
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(path, text, { flag: 'wx' })
    return true
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'EEXIST') return false
    throw error
  }
}

/** Atomic write (temp file + rename), skipped when the content is identical. */
function writeIfChanged(path: string, text: string): boolean {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(temp, text)
    renameWithRetry(temp, path)
  } finally {
    rmSync(temp, { force: true })
  }
  return true
}

/** Windows error codes that mean "someone else has the file open for a moment". */
const TRANSIENT = new Set(['EPERM', 'EBUSY', 'EACCES'])

/**
 * Rename, retrying briefly on Windows' transient sharing errors.
 *
 * Why: on Windows, replacing a file that an antivirus scanner, the search indexer or an editor
 * has just opened fails with EPERM for a few milliseconds (the full test suite hit it about one
 * run in four). Five tries over ~150 ms ride it out; a real permission problem still throws.
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(from, to)
      return
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : ''
      if (!TRANSIENT.has(code) || attempt >= 5) throw error
      // A synchronous pause: the generator is synchronous, and this only runs after a failure.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 10)
    }
  }
}
