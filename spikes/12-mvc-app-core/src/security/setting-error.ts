/**
 * The error each security area's resolver throws with *all* the problems it found. The settings
 * collector gathers them from every area into one boot error, so a developer fixes everything
 * in one go instead of one restart per mistake.
 */

/**
 * Every problem one area found.
 *
 * @example
 * throw new SecuritySettingError(['cors: "*" can\'t be combined with credentials: true'])
 */
export class SecuritySettingError extends Error {
  readonly problems: readonly string[]

  constructor(problems: readonly string[]) {
    super(problems.join('; '))
    this.name = 'SecuritySettingError'
    this.problems = problems
  }
}

/**
 * Throw a {@link SecuritySettingError} when an area found problems.
 *
 * @example
 * failIfAny(problems) // no-op for []
 */
export function failIfAny(problems: readonly string[]): void {
  if (problems.length > 0) throw new SecuritySettingError(problems)
}
