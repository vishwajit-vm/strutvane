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
export type RecoveryChoice = 'retry' | 'skip' | 'stop' | 'sqlite'

/** Decides what to do after a failure. Absent in CI mode: then a failure stops the run. */
export type Recoverer = (failure: StepFailure, step: Step) => Promise<RecoveryChoice>

const RETRY: Choice<RecoveryChoice> = { value: 'retry', label: 'Retry', hint: 'after fixing the cause' }
const SQLITE: Choice<RecoveryChoice> = { value: 'sqlite', label: 'Continue without Docker (SQLite)', hint: 'the app starts right away' }
const SKIP: Choice<RecoveryChoice> = { value: 'skip', label: 'Skip for now', hint: 'finish later with npm run setup' }
const STOP: Choice<RecoveryChoice> = { value: 'stop', label: 'Stop here', hint: 'the project files stay' }

/**
 * The choices for one kind of failure, best first.
 *
 * @example
 * recoveryChoices('docker-missing').map((c) => c.value) // ['sqlite', 'skip', 'stop']
 */
export function recoveryChoices(kind: FailureKind): Choice<RecoveryChoice>[] {
  if (kind === 'docker-missing') return [SQLITE, SKIP, STOP]
  if (kind === 'docker-stopped') return [RETRY, SQLITE, SKIP, STOP]
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
    return answer === CANCEL ? 'stop' : answer
  }
}
