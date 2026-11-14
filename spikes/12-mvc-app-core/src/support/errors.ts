/**
 * The friendly error every part of the core throws for developer mistakes (bad config, a typo in
 * a route, a missing binding). It always says what went wrong *and* how to fix it.
 */

/**
 * A developer-facing error with a stable code and a fix-it hint.
 *
 * Why a class of its own: the CLI and the exception handler print `message` plus `hint` without a
 * stack trace for these, because the stack of a config typo only adds noise.
 *
 * @example
 * throw new StrutvaneError('UNKNOWN_MIDDLEWARE', 'No middleware is called "auht".', 'Did you mean "auth"?')
 */
export class StrutvaneError extends Error {
  /** A stable, grep-able code such as `UNKNOWN_MIDDLEWARE`. */
  readonly code: string
  /** One sentence on how to fix it. */
  readonly hint: string

  constructor(code: string, message: string, hint: string) {
    super(message)
    this.name = 'StrutvaneError'
    this.code = code
    this.hint = hint
  }

  /**
   * The message and the hint together, ready to print.
   *
   * @example
   * console.error(error.describe()) // "No middleware is called "auht".\n  → Did you mean "auth"?"
   */
  describe(): string {
    return `${this.message}\n  → ${this.hint}`
  }
}
