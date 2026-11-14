/**
 * Setup progress, saved in `.strutvane/setup.json` after every step, so `npm run setup` can
 * continue exactly where a failed or skipped step left off.
 *
 * The file is git-ignored machine state: it holds the chosen options (never a secret), each step's
 * status, and how to start the installer again (`resumeWith`).
 *
 * @module
 */
import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import {
  AUTH_FEATURES,
  AUTH_MODES,
  type Answers,
  type AuthFeature,
  DATABASES,
  DESIGN_NAMES,
  type ProjectOptions,
  resolveOptions,
  STACKS,
  TEST_SETUPS,
  UI_STARTERS,
} from './options.ts'

/** The setup steps, in the order they run. */
export const STEP_IDS = ['files', 'secrets', 'ports', 'database', 'install', 'migrate', 'git'] as const
/** One of {@link STEP_IDS}. */
export type StepId = (typeof STEP_IDS)[number]

/**
 * Where a step stands:
 * - `pending`: not run yet, or waiting for an earlier step;
 * - `done`: finished (never run again on resume);
 * - `failed`: ran and failed; resume runs it again;
 * - `skipped`: the user (or the situation) skipped it; resume tries it again.
 */
export type StepStatus = 'pending' | 'done' | 'failed' | 'skipped'

/** One step's record. `note` is the last message shown for it (why it failed or was skipped). */
export interface StepRecord {
  readonly status: StepStatus
  readonly at?: string
  readonly note?: string
}

/**
 * The whole file.
 *
 * @example
 * { "version": 1, "resumeWith": ["C:/nodejs/node.exe", "C:/.../cli.ts", "--resume"],
 *   "options": { "name": "my-app", "database": "mysql", ... },
 *   "steps": { "files": { "status": "done" }, "install": { "status": "failed", "note": "..." } } }
 */
export interface SetupState {
  readonly version: 1
  /** Command + arguments that resume setup; `node strut setup` appends the project folder. */
  readonly resumeWith: readonly string[]
  /** The options without `directory` (the folder may have been moved since). */
  readonly options: Omit<ProjectOptions, 'directory'>
  readonly steps: Readonly<Record<StepId, StepRecord>>
}

/** The state file could not be used. The message says what to do. */
export class SetupStateError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SetupStateError'
  }
}

/**
 * The path of the state file inside a project.
 *
 * @example
 * statePath('C:/code/my-app') // 'C:/code/my-app/.strutvane/setup.json'
 */
export function statePath(directory: string): string {
  return join(directory, '.strutvane', 'setup.json')
}

/**
 * A fresh state: every step pending.
 *
 * @example
 * const state = initialState(options, [process.execPath, entry, '--resume'])
 */
export function initialState(options: ProjectOptions, resumeWith: readonly string[]): SetupState {
  const { directory: _directory, ...stored } = options
  const steps = Object.fromEntries(STEP_IDS.map((id) => [id, { status: 'pending' }])) as Record<StepId, StepRecord>
  return { version: 1, resumeWith, options: stored, steps }
}

/**
 * A copy of `state` with one step's record replaced (the state object itself never changes).
 *
 * @example
 * state = withStep(state, 'install', { status: 'done', at: new Date().toISOString() })
 */
export function withStep(state: SetupState, id: StepId, record: StepRecord): SetupState {
  return { ...state, steps: { ...state.steps, [id]: record } }
}

/**
 * The options stored in the state, with `directory` set to where the project is now.
 *
 * @example
 * projectOptions(state, 'C:/code/my-app').directory // 'C:/code/my-app'
 */
export function projectOptions(state: SetupState, directory: string): ProjectOptions {
  return { ...state.options, directory }
}

/**
 * Save the state atomically: write a temporary file, then rename it over the old one, so a crash
 * mid-write never leaves half a JSON file behind.
 *
 * @example
 * saveState('C:/code/my-app', state)
 */
export function saveState(directory: string, state: SetupState): void {
  const path = statePath(directory)
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.tmp`
  writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`)
  renameSync(temporary, path)
}

/**
 * Load and check the state of a project. Throws {@link SetupStateError} with a fix when the file is
 * missing or damaged.
 *
 * @example
 * const state = loadState('C:/code/my-app')
 */
export function loadState(directory: string): SetupState {
  const path = statePath(directory)
  if (!existsSync(path)) {
    throw new SetupStateError(
      `${path} was not found, so there is no setup to resume here. Run this inside a project made by create-strutvane.`,
    )
  }
  let raw: unknown
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    throw new SetupStateError(`${path} is damaged (not valid JSON). Delete it and run: npm run setup`)
  }
  return checkState(raw, directory, path)
}

/** Check the parsed JSON field by field; never trust its shape. */
function checkState(raw: unknown, directory: string, path: string): SetupState {
  const damaged = (what: string) =>
    new SetupStateError(`${path} is damaged (${what}). Delete it and run: npm run setup`)
  if (!isRecord(raw) || raw['version'] !== 1) throw damaged('unknown version')
  const resumeWith = raw['resumeWith']
  if (!Array.isArray(resumeWith) || !resumeWith.every((part) => typeof part === 'string')) {
    throw damaged('resumeWith')
  }
  const options = raw['options']
  if (!isRecord(options)) throw damaged('options')
  let resolved: ProjectOptions
  try {
    // resolveOptions re-applies every rule, so a hand-edited file cannot sneak in a bad combination.
    resolved = resolveOptions(answersFrom(options), dirname(directory))
  } catch (error) {
    throw damaged(error instanceof Error ? error.message : 'options')
  }
  const steps = raw['steps']
  if (!isRecord(steps)) throw damaged('steps')
  const records = Object.fromEntries(STEP_IDS.map((id) => [id, stepRecord(steps[id])])) as Record<StepId, StepRecord>
  const { directory: _directory, ...stored } = resolved
  return { version: 1, resumeWith: resumeWith.filter((p): p is string => typeof p === 'string'), options: stored, steps: records }
}

/** Read one step record; anything unexpected counts as "pending" (safe: the step runs again). */
function stepRecord(value: unknown): StepRecord {
  if (!isRecord(value)) return { status: 'pending' }
  const status = value['status']
  const known: readonly StepStatus[] = ['pending', 'done', 'failed', 'skipped']
  const match = known.find((s) => s === status)
  const note = value['note']
  return typeof note === 'string' ? { status: match ?? 'pending', note } : { status: match ?? 'pending' }
}

/** Rebuild typed answers from stored JSON, keeping only valid values. */
function answersFrom(options: Record<string, unknown>): Answers {
  const pick = <T extends string>(value: unknown, allowed: readonly T[]): T | undefined =>
    allowed.find((choice) => choice === value)
  const bool = (value: unknown): boolean | undefined => (typeof value === 'boolean' ? value : undefined)
  const features = Array.isArray(options['features'])
    ? options['features']
        .map((f) => pick(f, AUTH_FEATURES))
        .filter((f): f is AuthFeature => f !== undefined)
    : undefined
  const answers: { -readonly [K in keyof Answers]: Answers[K] } = {}
  const set = <K extends keyof Answers>(key: K, value: Answers[K] | undefined) => {
    if (value !== undefined) answers[key] = value
  }
  set('name', typeof options['name'] === 'string' ? options['name'] : undefined)
  set('stack', pick(options['stack'], STACKS))
  set('ui', pick(options['ui'], UI_STARTERS))
  // Older setup.json files have no design: resolveOptions then falls back to the default.
  set('design', pick(options['design'], DESIGN_NAMES))
  set('auth', pick(options['auth'], AUTH_MODES))
  set('features', features)
  set('teams', bool(options['teams']))
  set('database', pick(options['database'], DATABASES))
  set('docker', bool(options['docker']))
  const connection = options['connection']
  if (isRecord(connection)) {
    set('dbHost', typeof connection['host'] === 'string' ? connection['host'] : undefined)
    set('dbPort', typeof connection['port'] === 'number' ? connection['port'] : undefined)
    set('dbName', typeof connection['database'] === 'string' ? connection['database'] : undefined)
    set('dbUser', typeof connection['username'] === 'string' ? connection['username'] : undefined)
  }
  set('testing', pick(options['testing'], TEST_SETUPS))
  set('git', bool(options['git']))
  return answers
}

/** Is this a plain JSON object? */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
