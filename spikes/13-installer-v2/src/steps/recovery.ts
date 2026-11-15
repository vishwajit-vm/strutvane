/**
 * What the user can do when a step fails, by kind of failure, and the prompt that asks.
 *
 * Why choices depend on the kind: "Retry" is pointless when Docker is not installed, and "Use
 * SQLite instead" only makes sense for Docker problems.
 *
 * @module
 */
import { CANCEL, type Choice, type Prompter } from '../prompter.ts'
import type { FailureKind, Step, StepFailure } from './types.ts'

/** A recovery decision. `sqlite` switches the project to SQLite and runs the step again. */
export type RecoveryChoice = 'retry' | 'skip' | 'stop' | 'sqlite' | 'own-server' | 'start-docker' | 'edit-connection'

/** Decides what to do after a failure. Absent in CI mode: then a failure stops the run. */
export type Recoverer = (failure: StepFailure, step: Step) => Promise<RecoveryChoice>

const RETRY: Choice<RecoveryChoice> = { value: 'retry', label: 'Retry', hint: 'after fixing the cause' }
const SQLITE: Choice<RecoveryChoice> = { value: 'sqlite', label: 'Use SQLite instead (no server at all)', hint: 'the app starts right away' }
const OWN_SERVER: Choice<RecoveryChoice> = {
  value: 'own-server',
  label: 'Use my own database server',
  hint: 'XAMPP, WAMP, MAMP, Laragon, Postgres.app, a local install or a remote server',
}
const START_DOCKER: Choice<RecoveryChoice> = { value: 'start-docker', label: 'Start or install Docker, then continue', hint: 'shows how, then waits for you' }
const EDIT_CONNECTION: Choice<RecoveryChoice> = { value: 'edit-connection', label: 'Change the connection details', hint: 'host, port, user, password' }
const SKIP: Choice<RecoveryChoice> = { value: 'skip', label: 'Skip for now', hint: 'finish later with npm run setup' }
const STOP: Choice<RecoveryChoice> = { value: 'stop', label: 'Stop here', hint: 'the project files stay' }

/**
 * The choices for one kind of failure, best first.
 *
 * @example
 * recoveryChoices('docker-missing').map((c) => c.value) // ['sqlite', 'skip', 'stop']
 */
export function recoveryChoices(kind: FailureKind): Choice<RecoveryChoice>[] {
  // Docker is never required: your own server first, then Docker, then SQLite (blueprint §2.1).
  if (kind === 'docker-missing' || kind === 'docker-stopped') return [OWN_SERVER, START_DOCKER, SQLITE, RETRY, SKIP, STOP]
  if (kind === 'database-connection') return [EDIT_CONNECTION, RETRY, SKIP, STOP]
  return [RETRY, SKIP, STOP]
}

/**
 * A {@link Recoverer} that asks with the prompter. Cancelling (Ctrl+C) means "stop".
 *
 * @example
 * const recover = promptRecoverer(clackPrompter)
 */
export function promptRecoverer(prompter: Prompter): Recoverer {
  return async (failure, step) => {
    const choices = recoveryChoices(failure.kind)
    const first = choices[0] ?? STOP
    const answer = await prompter.select({
      id: `recover:${step.id}`,
      message: 'How do you want to continue?',
      options: choices,
      initialValue: first.value,
    })
    if (answer === CANCEL) return 'stop'
    if (answer !== 'start-docker') return answer
    // Say how, then wait until the user says Docker runs; the step is then simply retried.
    prompter.info(
      failure.kind === 'docker-missing'
        ? 'Install Docker Desktop from https://docs.docker.com/get-docker/ (Windows: the WSL2 backend), start it, and wait until it says "running".'
        : 'Start Docker Desktop (or: sudo systemctl start docker) and wait until it says "running".',
    )
    const ready = await prompter.confirm({ id: `docker-ready:${step.id}`, message: 'Is Docker running now?', initialValue: true })
    return ready === CANCEL ? 'stop' : 'retry'
  }
}
