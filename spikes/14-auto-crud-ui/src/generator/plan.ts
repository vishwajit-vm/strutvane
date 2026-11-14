/**
 * `ui:sync` as a pure function: given the metadata, the previous lock and the owned files that
 * exist, decide what to write and what to tell the developer. No file system here, so every rule
 * is tested without touching disk; `sync.ts` does the I/O.
 *
 * The three rules that matter:
 * 1. Owned files are written **only** for tables that are new and have no file yet. Never again.
 * 2. `auto()` lists pick up new columns by themselves (at runtime); the report just says so.
 * 3. Explicit lists are never rewritten; new columns are **reported**, and names that no longer
 *    exist are reported (they are also a type error, through the generated registry).
 *
 * @module
 */
import { defaultColumns, defaultFilterFields, defaultFormFields } from '../shared/defaults.ts'
import { isInternalResource } from '../shared/exposure.ts'
import type { AppMetadata, FieldMetadata, ResourceMetadata } from '../shared/metadata.ts'
import { readOwnedFile, SELECTION_KEYS, type SelectionKey, type SelectionShape } from './owned-reader.ts'
import { GEN_FILE, LOCK_FILE, ownedFilePath, renderGenFile, renderLock, renderOwnedFile, typedFieldNames, type UiLock } from './render.ts'

/**
 * Inputs to {@link planUiSync}.
 *
 * @example
 * planUiSync({ metadata, lock: undefined, ownedSources: new Map() })
 */
export interface PlanInput {
  readonly metadata: AppMetadata
  /** The lock from the last sync, or `undefined` on the first run (or when it was lost). */
  readonly lock: UiLock | undefined
  /** Owned files that exist today, by path relative to the app root. */
  readonly ownedSources: ReadonlyMap<string, string>
}

/**
 * A column the developer should know about.
 *
 * @example
 * const note: ColumnNote = { table: 'posts', file: 'resources/ui/posts.ui.ts', list: 'columns', field: 'subtitle' }
 */
export interface ColumnNote {
  readonly table: string
  readonly file: string
  readonly list: SelectionKey
  readonly field: string
}

/**
 * Everything `ui:sync` has to say after a run.
 *
 * @example
 * report.scaffolded // ['resources/ui/posts.ui.ts']
 */
export interface SyncReport {
  /** Owned files created by this run (new tables). */
  readonly scaffolded: readonly string[]
  /** New columns that appear by themselves, because the list is `auto()`. */
  readonly addedAutomatically: readonly ColumnNote[]
  /** New columns NOT shown, because the developer wrote an explicit list. Never added silently. */
  readonly notInExplicitList: readonly ColumnNote[]
  /** Names an owned file still uses that the schema no longer has (a type error until fixed). */
  readonly missingFields: readonly ColumnNote[]
  /** Existing tables whose owned file was deleted: they use the defaults; nothing is recreated. */
  readonly missingOwnedFiles: readonly string[]
  /** Owned files of tables that no longer exist: kept, but they no longer type-check. */
  readonly orphanedOwnedFiles: readonly string[]
  /** Parts of owned files the static reader could not interpret (checks were skipped there). */
  readonly unreadable: readonly string[]
  /** Internal tables (sessions, tokens, jobs, ...) that never get a screen (security review F-01). */
  readonly skippedInternal: readonly string[]
}

/**
 * The outcome of planning: files to write and the report.
 *
 * @example
 * plan.ownedWrites.get('resources/ui/posts.ui.ts') // the scaffold text
 */
export interface SyncPlan {
  /** Owned files to create. Written with "fail if it exists", never overwritten. */
  readonly ownedWrites: ReadonlyMap<string, string>
  /** Machine-owned files to (re)write: the registry and the lock. */
  readonly machineWrites: ReadonlyMap<string, string>
  readonly report: SyncReport
}

/** The `auto()` default of each list, used to decide whether a new column would be shown. */
const DEFAULTS: Readonly<Record<SelectionKey, (resource: ResourceMetadata) => FieldMetadata[]>> = {
  columns: defaultColumns,
  form: defaultFormFields,
  filters: defaultFilterFields,
}

/**
 * Plan a sync.
 *
 * @example
 * const plan = planUiSync({ metadata, lock, ownedSources })
 * for (const [path, text] of plan.ownedWrites) writeFileSync(path, text, { flag: 'wx' })
 */
export function planUiSync(input: PlanInput): SyncPlan {
  const report = emptyReport()
  const ownedWrites = new Map<string, string>()
  const imported: { table: string; path: string }[] = []
  // Internal tables are dropped before anything else, so no later step can expose them.
  const resources = input.metadata.resources.filter((resource) => !isInternalResource(resource))
  report.skippedInternal.push(...input.metadata.resources.filter(isInternalResource).map((resource) => resource.table))
  const metadata: AppMetadata = { ...input.metadata, resources }

  for (const resource of resources) {
    const path = ownedFilePath(resource)
    const source = input.ownedSources.get(path)
    const previousFields = input.lock?.resources[resource.table]
    if (source === undefined) {
      if (previousFields === undefined) {
        ownedWrites.set(path, renderOwnedFile(resource))
        report.scaffolded.push(path)
        imported.push({ table: resource.table, path })
      } else {
        report.missingOwnedFiles.push(path)
      }
      continue
    }
    imported.push({ table: resource.table, path })
    checkOwnedFile(resource, path, source, previousFields, report)
  }

  report.orphanedOwnedFiles.push(...orphanedFiles(metadata, input.ownedSources))
  const machineWrites = new Map([
    [GEN_FILE, renderGenFile(metadata, imported)],
    [LOCK_FILE, renderLock(metadata)],
  ])
  return { ownedWrites, machineWrites, report }
}

/** Compare one existing owned file with the schema and record what the developer should know. */
function checkOwnedFile(resource: ResourceMetadata, path: string, source: string, previousFields: readonly string[] | undefined, report: MutableReport): void {
  const shape = readOwnedFile(path, source)
  report.unreadable.push(...shape.problems)
  const known = new Set(typedFieldNames(resource))
  // Without a lock nothing counts as "new": we cannot know, and guessing would be noise.
  const newFields = previousFields === undefined ? new Set<string>() : new Set([...known].filter((name) => !previousFields.includes(name)))

  for (const list of SELECTION_KEYS) {
    const selection = shape.selections[list]
    for (const field of referencedNames(selection)) {
      if (!known.has(field)) report.missingFields.push({ table: resource.table, file: path, list, field })
    }
    const wouldShow = DEFAULTS[list](resource).filter((field) => newFields.has(field.name))
    for (const field of wouldShow) {
      const note = { table: resource.table, file: path, list, field: field.name }
      if (selection.kind === 'explicit') report.notInExplicitList.push(note)
      else if (selection.kind !== 'unreadable' && !isExcluded(selection, field.name)) report.addedAutomatically.push(note)
    }
  }
}

/** Every field name an owned list mentions (explicit names, or `except`/`order` inside auto()). */
function referencedNames(selection: SelectionShape): readonly string[] {
  switch (selection.kind) {
    case 'explicit':
      return selection.fields
    case 'auto':
      return [...selection.except, ...selection.order]
    case 'default':
    case 'unreadable':
      return []
  }
}

function isExcluded(selection: SelectionShape, field: string): boolean {
  return selection.kind === 'auto' && selection.except.includes(field)
}

/** Owned files whose table is gone. Only files that look like owned files (`*.ui.ts`) count. */
function orphanedFiles(metadata: AppMetadata, ownedSources: ReadonlyMap<string, string>): string[] {
  const current = new Set(metadata.resources.map(ownedFilePath))
  return [...ownedSources.keys()].filter((path) => !current.has(path)).sort()
}

/** The report while it is being filled in (plain arrays), returned as the read-only {@link SyncReport}. */
interface MutableReport extends SyncReport {
  readonly scaffolded: string[]
  readonly addedAutomatically: ColumnNote[]
  readonly notInExplicitList: ColumnNote[]
  readonly missingFields: ColumnNote[]
  readonly missingOwnedFiles: string[]
  readonly orphanedOwnedFiles: string[]
  readonly unreadable: string[]
  readonly skippedInternal: string[]
}

function emptyReport(): MutableReport {
  return { scaffolded: [], addedAutomatically: [], notInExplicitList: [], missingFields: [], missingOwnedFiles: [], orphanedOwnedFiles: [], unreadable: [], skippedInternal: [] }
}
