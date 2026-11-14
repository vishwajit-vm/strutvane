/**
 * `ui:sync` with real files: read the migrate output, plan, then write safely.
 *
 * Failure handling, named up front:
 * - **Owned file appeared between plan and write** (an editor saved it, a teammate's pull): the
 *   write uses the `wx` flag, so it fails instead of overwriting, and the file is reported as kept.
 * - **Crash half-way through a machine write:** machine files are written to a temp file and
 *   renamed, so `ui.gen.ts` is either the old or the new version, never half of one.
 * - **Unchanged output:** not rewritten, so Vite's watcher and editors do not see a change.
 * - **Wrong or missing resources.json:** a {@link SyncError} with the command that fixes it.
 *
 * @module
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { MetadataError, parseAppMetadata, type AppMetadata } from '../shared/metadata.ts'
import { planUiSync, type SyncReport } from './plan.ts'
import { LOCK_FILE, OWNED_DIR, parseLock, RESOURCES_FILE } from './render.ts'

/**
 * Options for {@link runUiSync}.
 *
 * @example
 * runUiSync('my-app', { dryRun: true })
 */
export interface SyncOptions {
  /** Plan and report, but write nothing (`ui:sync --dry-run`). */
  readonly dryRun?: boolean
}

/**
 * The outcome of a sync run.
 *
 * @example
 * const result = runUiSync('my-app')
 * result.written // ['.strutvane/ui.gen.ts', 'resources/ui/posts.ui.ts']
 */
export interface SyncResult {
  readonly report: SyncReport
  /** Files actually written, relative to the app root. Empty on a dry run or when nothing changed. */
  readonly written: readonly string[]
}

/**
 * A friendly, expected failure (the CLI prints the message and exits 1, without a stack trace).
 *
 * @example
 * throw new SyncError('No .strutvane/resources.json here. Run `sv migrate` first.')
 */
export class SyncError extends Error {
  override readonly name = 'SyncError'
}

/**
 * Run `ui:sync` for the app at `appRoot`.
 *
 * @example
 * const { report } = runUiSync(process.cwd())
 * console.log(formatReport(report))
 */
export function runUiSync(appRoot: string, options: SyncOptions = {}): SyncResult {
  const metadata = readMetadata(appRoot)
  const lock = parseLock(readIfExists(join(appRoot, LOCK_FILE)))
  const plan = planUiSync({ metadata, lock, ownedSources: readOwnedSources(appRoot) })
  if (options.dryRun === true) return { report: plan.report, written: [] }

  const written: string[] = []
  const kept: string[] = []
  for (const [path, text] of plan.ownedWrites) {
    if (createOnce(join(appRoot, path), text)) written.push(path)
    else kept.push(path)
  }
  for (const [path, text] of plan.machineWrites) {
    if (writeIfChanged(join(appRoot, path), text)) written.push(path)
  }
  // A file that appeared after planning was kept, so it was not "scaffolded" by this run.
  const report = { ...plan.report, scaffolded: plan.report.scaffolded.filter((path) => !kept.includes(path)) }
  return { report, written }
}

function readMetadata(appRoot: string): AppMetadata {
  const path = join(appRoot, RESOURCES_FILE)
  const text = readIfExists(path)
  if (text === undefined) throw new SyncError(`There is no ${RESOURCES_FILE} in ${appRoot}. Run \`sv migrate\` first; it writes that file.`)
  try {
    return parseAppMetadata(JSON.parse(text))
  } catch (error) {
    if (error instanceof MetadataError) throw new SyncError(error.message)
    throw new SyncError(`${RESOURCES_FILE} is not valid JSON. Run \`sv migrate\` again to rewrite it.`)
  }
}

/** Every `*.ui.ts` file in the owned folder, by app-relative path. */
function readOwnedSources(appRoot: string): Map<string, string> {
  const directory = join(appRoot, OWNED_DIR)
  const sources = new Map<string, string>()
  if (!existsSync(directory)) return sources
  for (const name of readdirSync(directory).sort()) {
    if (name.endsWith('.ui.ts')) sources.set(`${OWNED_DIR}/${name}`, readFileSync(join(directory, name), 'utf8'))
  }
  return sources
}

/** Create a file only if it does not exist. Returns `false` (and writes nothing) if it does. */
function createOnce(path: string, text: string): boolean {
  mkdirSync(dirname(path), { recursive: true })
  try {
    writeFileSync(path, text, { flag: 'wx' })
    return true
  } catch (error) {
    if (isNodeError(error) && error.code === 'EEXIST') return false
    throw error
  }
}

/** Atomic write (temp file + rename), skipped when the content is already identical. */
function writeIfChanged(path: string, text: string): boolean {
  if (readIfExists(path) === text) return false
  mkdirSync(dirname(path), { recursive: true })
  const temp = `${path}.${process.pid}.tmp`
  try {
    writeFileSync(temp, text)
    renameSync(temp, path)
  } finally {
    // After a successful rename the temp file is gone; after a failure, clean it up.
    rmSync(temp, { force: true })
  }
  return true
}

function readIfExists(path: string): string | undefined {
  try {
    return readFileSync(path, 'utf8')
  } catch (error) {
    if (isNodeError(error) && error.code === 'ENOENT') return undefined
    throw error
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error
}
