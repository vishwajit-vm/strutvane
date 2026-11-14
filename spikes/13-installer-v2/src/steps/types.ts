/**
 * The contract every setup step follows, so the runner can show progress, save state, offer
 * recovery and resume, without knowing what any step does.
 *
 * @module
 */
import type { ProjectOptions } from '../options.ts'
import type { PortProbe } from '../ports.ts'
import type { Reporter } from '../reporter.ts'
import type { StepId } from '../setup-state.ts'
import type { Spawner } from '../spawn.ts'

/**
 * What kind of failure happened. The kind decides which recovery choices the user gets:
 * - `docker-missing`: the docker CLI is not installed → Use SQLite / Skip / Stop
 * - `docker-stopped`: installed but the engine is not running → Retry / Use SQLite / Skip
 * - `install-failed`, `database-unreachable`, `git-identity`, `command-failed` → Retry / Skip / Stop
 */
export type FailureKind =
  | 'docker-missing'
  | 'docker-stopped'
  | 'install-failed'
  | 'database-unreachable'
  | 'git-identity'
  | 'command-failed'

/**
 * A failure, explained for people: what went wrong, how to fix it, and the evidence.
 *
 * @example
 * { kind: 'docker-stopped', message: 'Docker is installed but not running.',
 *   hint: 'Start Docker Desktop, then choose Retry.' }
 */
export interface StepFailure {
  readonly kind: FailureKind
  /** What went wrong, in one sentence. */
  readonly message: string
  /** What to do about it. */
  readonly hint: string
  /** The last lines of the command's output, when they help. */
  readonly details?: readonly string[]
}

/**
 * A value to show the user exactly once at the end (the first admin's one-time password). It is
 * never saved to setup.json or written to the log.
 *
 * @example
 * { label: 'Password', value: 'q7Vd-3kPz-Xm2c-8RtL' }
 */
export interface ShowOnce {
  readonly label: string
  readonly value: string
}

/**
 * How a step ended.
 *
 * @example
 * return { status: 'done', message: 'Dependencies installed with npm (added 1 package)' }
 */
export type StepOutcome =
  | { readonly status: 'done'; readonly message: string; readonly showOnce?: ShowOnce }
  | { readonly status: 'skipped'; readonly reason: string }
  | { readonly status: 'failed'; readonly failure: StepFailure }

/**
 * Everything a step may use. All outside effects (programs, ports, clock) come through here, so
 * tests replace them with fakes.
 */
export interface StepContext {
  /** The project folder (absolute). */
  readonly directory: string
  /** The current options (they can change mid-run, e.g. after "Use SQLite instead"). */
  readonly options: ProjectOptions
  readonly spawn: Spawner
  /** The node executable that runs us; npm and `strut.js` run with it. */
  readonly execPath: string
  /** npm's `npm-cli.js` (throws NpmNotFoundError when npm is missing). */
  readonly npmCli: () => string
  /** The container CLI (`docker`, or `STRUT_CONTAINER_CLI`). */
  readonly dockerCommand: string
  readonly isPortFree: PortProbe
  /** The setup log every command appends to (`.strutvane/logs/setup-<time>.log`). */
  readonly logFile: string
  readonly sleep: (ms: number) => Promise<void>
  readonly reporter: Reporter
  readonly generateSecret: () => string
  readonly generatePassword: () => string
  /**
   * A first-admin password the user typed (masked, or STRUT_ADMIN_PASSWORD in CI). Memory only:
   * never in a file. `undefined` = generate one. A resumed setup never has it (it was not saved),
   * so it falls back to a generated password, shown once.
   */
  readonly typedAdminPassword: string | undefined
  /** The host user on Linux (the app container runs as this user); `undefined` elsewhere. */
  readonly hostUser: { readonly uid: number; readonly gid: number } | undefined
}

/**
 * One setup step.
 *
 * @example
 * const step: Step = { id: 'install', title: 'Installing dependencies with npm', needs: () => ['files'],
 *   applies: () => true, run: async (context) => ({ status: 'done', message: '...' }) }
 */
export interface Step {
  readonly id: StepId
  /** Shown while the step runs, e.g. "Installing dependencies with npm". */
  readonly title: string
  /** Steps that must be done first (they can depend on the mode); otherwise this one waits. */
  readonly needs: (options: ProjectOptions) => readonly StepId[]
  /** `false` when the options do not ask for this step (e.g. git with `--no-git`). */
  readonly applies: (options: ProjectOptions) => boolean
  readonly run: (context: StepContext) => Promise<StepOutcome>
}

/**
 * Build a failed outcome in one line.
 *
 * @example
 * return failed('docker-missing', 'Docker is not installed.', 'Install Docker Desktop, or use SQLite.')
 */
export function failed(kind: FailureKind, message: string, hint: string, details?: readonly string[]): StepOutcome {
  const failure: StepFailure = details === undefined ? { kind, message, hint } : { kind, message, hint, details }
  return { status: 'failed', failure }
}
