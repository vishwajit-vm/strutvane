/**
 * The step runner: runs the setup steps in order, shows progress, saves `.strutvane/setup.json`
 * after every change, offers recovery on failure, and resumes where an earlier run stopped.
 *
 * Rules:
 * - a `done` step never runs again (resume continues after it);
 * - a step whose `needs` are not all done waits (stays `pending`) and says what it waits for;
 * - in CI mode (no recoverer) the first failure stops the run; the rest stays `pending`;
 * - interactively the user picks Retry / Use SQLite / Skip / Stop (see recovery.ts);
 * - the state is saved after every step, so a crash or Ctrl+C loses at most the running step.
 *
 * @module
 */
import { type SetupState, STEP_IDS, type StepId, projectOptions, withStep } from '../setup-state.ts'
import type { Reporter } from '../reporter.ts'
import type { ProjectOptions } from '../options.ts'
import { teamsNote } from '../options.ts'
import { databaseStep } from './database.ts'
import { gitStep } from './git.ts'
import { installStep } from './install.ts'
import { migrateStep } from './migrate.ts'
import { portsStep } from './ports.ts'
import type { Recoverer } from './recovery.ts'
import { secretsStep } from './secrets.ts'
import { switchToSqlite } from './sqlite-fallback.ts'
import type { ShowOnce, Step, StepContext, StepFailure, StepOutcome } from './types.ts'

/**
 * The setup steps after "files", in order. "database" comes before "install" because in Docker
 * mode npm runs inside the app container, which "database" starts.
 *
 * @example
 * SETUP_STEPS.map((s) => s.id) // ['secrets', 'ports', 'database', 'install', 'migrate', 'git']
 */
export const SETUP_STEPS: readonly Step[] = [secretsStep, portsStep, databaseStep, installStep, migrateStep, gitStep]

/** What the runner needs from its caller. */
export interface RunnerSettings {
  readonly directory: string
  readonly reporter: Reporter
  /** Builds the step context for the current options (they can change after "Use SQLite"). */
  readonly context: (options: ProjectOptions) => StepContext
  /** Asks what to do after a failure; `undefined` in CI mode (stop at the first failure). */
  readonly recover: Recoverer | undefined
  /** Persists the state (tests keep it in memory). */
  readonly save: (state: SetupState) => void
  /** Timestamps for the state file. */
  readonly now: () => Date
  /** The steps to run (tests may pass fakes). Default: {@link SETUP_STEPS}. */
  readonly steps?: readonly Step[]
}

/**
 * How the run ended.
 *
 * @example
 * if (!result.complete) reporter.warn(`Unfinished: ${result.unfinished.join(', ')}`)
 */
export interface RunResult {
  readonly state: SetupState
  /** Every step is done. */
  readonly complete: boolean
  /** Steps not done, in order. */
  readonly unfinished: readonly StepId[]
  /** Values to show once at the end (never saved): the new admin's one-time password. */
  readonly showOnce: readonly ShowOnce[]
}

/**
 * Run every step that is not done yet.
 *
 * @example
 * const result = await runSteps(state, settings)
 * process.exitCode = result.complete ? EXIT.ok : EXIT.incomplete
 */
export async function runSteps(initial: SetupState, settings: RunnerSettings): Promise<RunResult> {
  let state = initial
  const showOnce: ShowOnce[] = []
  const record = (id: StepId, status: 'pending' | 'done' | 'failed' | 'skipped', note?: string) => {
    const at = settings.now().toISOString()
    state = withStep(state, id, note === undefined ? { status, at } : { status, at, note })
    settings.save(state)
  }

  const steps = settings.steps ?? SETUP_STEPS
  // Steps the options did not ask for (git with --no-git) count as done up front, so a run that
  // stops early never lists them as "not done".
  for (const step of steps) {
    if (state.steps[step.id].status !== 'done' && !step.applies(projectOptions(state, settings.directory))) {
      record(step.id, 'done', 'not chosen')
    }
  }

  for (const step of steps) {
    if (state.steps[step.id].status === 'done') continue
    const waiting = step.needs(projectOptions(state, settings.directory)).filter((id) => state.steps[id].status !== 'done')
    if (waiting.length > 0) {
      const reason = `${step.title}: waiting for ${waiting.join(', ')} (run npm run setup when fixed)`
      settings.reporter.step(step.title).skipped(reason)
      record(step.id, 'pending', reason)
      continue
    }
    const stop = await runOne(step, settings, () => state, (next) => {
      state = next
      settings.save(state)
    }, record, (value) => showOnce.push(value))
    if (stop) break
  }
  return summarise(state, showOnce)
}

/**
 * Run one step until it is done, skipped or the run stops. Returns `true` to stop the whole run.
 * `getState`/`setState` let the SQLite fallback replace the options mid-step.
 */
async function runOne(
  step: Step,
  settings: RunnerSettings,
  getState: () => SetupState,
  setState: (state: SetupState) => void,
  record: (id: StepId, status: 'pending' | 'done' | 'failed' | 'skipped', note?: string) => void,
  remember: (value: ShowOnce) => void,
): Promise<boolean> {
  for (;;) {
    const progress = settings.reporter.step(step.title)
    const outcome = await runSafely(step, settings.context(projectOptions(getState(), settings.directory)))
    if (outcome.status === 'done') {
      progress.done(outcome.message)
      if (outcome.showOnce !== undefined) remember(outcome.showOnce)
      record(step.id, 'done', outcome.message)
      return false
    }
    if (outcome.status === 'skipped') {
      progress.skipped(outcome.reason)
      record(step.id, 'skipped', outcome.reason)
      return false
    }
    progress.failed(outcome.failure.message)
    explain(settings.reporter, outcome.failure)
    if (settings.recover === undefined) {
      record(step.id, 'failed', `${outcome.failure.message} ${outcome.failure.hint}`)
      return true // CI mode: stop at the first failure
    }
    const choice = await settings.recover(outcome.failure, step)
    if (choice === 'retry') continue
    if (choice === 'sqlite') {
      setState(switchToSqlite(settings.directory, getState()))
      settings.reporter.info('Switched to SQLite without Docker: .env now points at database/database.sqlite.')
      const note = teamsNote(getState().options.teams, 'sqlite')
      if (note !== undefined) settings.reporter.info(note)
      continue
    }
    if (choice === 'skip') {
      record(step.id, 'skipped', outcome.failure.message)
      return false
    }
    record(step.id, 'failed', outcome.failure.message)
    return true
  }
}

/** Run a step, turning an unexpected exception into a readable failure instead of a crash. */
async function runSafely(step: Step, context: StepContext): Promise<StepOutcome> {
  try {
    return await step.run(context)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return {
      status: 'failed',
      failure: {
        kind: 'command-failed',
        message: `${step.title} stopped unexpectedly: ${message}`,
        hint: `Please report this with the log at ${context.logFile}. Then run: npm run setup`,
      },
    }
  }
}

/** Print the hint and the evidence under a failed step. */
function explain(reporter: Reporter, failure: StepFailure): void {
  for (const line of failure.details ?? []) reporter.info(`  ${line}`)
  reporter.warn(failure.hint)
}

/** Which steps are not done. */
function summarise(state: SetupState, showOnce: readonly ShowOnce[]): RunResult {
  const unfinished = STEP_IDS.filter((id) => state.steps[id].status !== 'done')
  return { state, complete: unfinished.length === 0, unfinished, showOnce }
}
