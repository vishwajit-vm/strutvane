/**
 * The small interface the questions talk to, so tests can answer them without a terminal.
 *
 * Why an interface: `@clack/prompts` needs a real TTY. Tests use a scripted prompter
 * (test/helpers/fake-prompter.ts) and the installer uses {@link import('./clack-prompter.ts').clackPrompter}.
 * Every question carries a stable `id`, so a test script says "answer `database` with `sqlite`"
 * instead of depending on the question order or wording.
 *
 * @module
 */

/** Returned by a {@link Prompter} when the user cancels (Ctrl+C or Esc). */
export const CANCEL: unique symbol = Symbol('cancel')
/** The type of {@link CANCEL}. */
export type Cancel = typeof CANCEL

/**
 * One option in a select or multiselect.
 *
 * @example
 * const sqlite: Choice<'sqlite'> = { value: 'sqlite', label: 'SQLite', hint: 'zero setup' }
 */
export interface Choice<T extends string> {
  readonly value: T
  readonly label: string
  readonly hint?: string
}

/**
 * What the installer needs from a prompt library. Labels stay at 74 characters or fewer so they fit
 * an 80-column terminal (the Laravel Prompts rule).
 *
 * @example
 * const db = await prompter.select({ id: 'database', message: 'Which database?', options, initialValue: 'mysql' })
 */
export interface Prompter {
  /** Free text, checked by `validate` (return a message to reject, `undefined` to accept). */
  text(question: {
    readonly id: string
    readonly message: string
    readonly placeholder: string
    readonly validate: (value: string) => string | undefined
  }): Promise<string | Cancel>
  /** Secret text: typed characters are masked and never echoed back. */
  password(question: { readonly id: string; readonly message: string }): Promise<string | Cancel>
  /** Pick one. */
  select<T extends string>(question: {
    readonly id: string
    readonly message: string
    readonly options: readonly Choice<T>[]
    readonly initialValue: T
  }): Promise<T | Cancel>
  /** Pick any number (including none). */
  multiselect<T extends string>(question: {
    readonly id: string
    readonly message: string
    readonly options: readonly Choice<T>[]
    readonly initialValues: readonly T[]
  }): Promise<T[] | Cancel>
  /** Yes or no. */
  confirm(question: {
    readonly id: string
    readonly message: string
    readonly initialValue: boolean
  }): Promise<boolean | Cancel>
  /** A boxed note, used for the review screen and the final summary. */
  note(title: string, lines: readonly string[]): void
  /** A one-line notice (for example, why a question was answered for the user). */
  info(message: string): void
}

/**
 * The user cancelled a question. Before the files are written this means "nothing was created".
 *
 * @example
 * if (answer === CANCEL) throw new CancelledError()
 */
export class CancelledError extends Error {
  constructor() {
    super('Cancelled. Nothing was created.')
    this.name = 'CancelledError'
  }
}

/**
 * Unwrap an answer, turning a cancel into {@link CancelledError}.
 *
 * Why a helper: every question would otherwise repeat the same `if (x === CANCEL) throw` line.
 *
 * @example
 * const name = answerOrThrow(await prompter.text({ ... }))
 */
export function answerOrThrow<T>(value: T | Cancel): T {
  if (value === CANCEL) throw new CancelledError()
  return value
}
