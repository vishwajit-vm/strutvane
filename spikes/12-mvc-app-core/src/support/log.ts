/**
 * The logging seam. The real framework logs through `@strutvane/logs` (redaction, rotation);
 * the spike only needs somewhere to report exceptions that isn't `console.*` (banned in package
 * code by the ecosystem rules).
 */

/**
 * Structured log fields. Never put secrets or request bodies here.
 *
 * @example
 * const context: LogContext = { route: 'posts.show', status: 500 }
 */
export type LogContext = Readonly<Record<string, unknown>>

/**
 * What the core logs through.
 *
 * @example
 * logger.error('Unhandled exception', { exception: 'TypeError', route: 'posts.index' })
 */
export interface Logger {
  info(message: string, context?: LogContext): void
  warn(message: string, context?: LogContext): void
  error(message: string, context?: LogContext): void
}

/**
 * Writes one JSON object per line to stderr. The default when the app binds nothing better.
 *
 * @example
 * new StderrLogger().info('Booted', { providers: 3 })
 */
export class StderrLogger implements Logger {
  info(message: string, context: LogContext = {}): void {
    this.#write('info', message, context)
  }

  warn(message: string, context: LogContext = {}): void {
    this.#write('warn', message, context)
  }

  error(message: string, context: LogContext = {}): void {
    this.#write('error', message, context)
  }

  #write(level: string, message: string, context: LogContext): void {
    process.stderr.write(`${JSON.stringify({ time: new Date().toISOString(), level, message, ...context })}\n`)
  }
}

/**
 * Keeps entries in memory. Tests bind it to assert on what was reported.
 *
 * @example
 * const logger = new MemoryLogger()
 * logger.error('boom')
 * logger.entries[0]?.message // 'boom'
 */
export class MemoryLogger implements Logger {
  readonly entries: { level: string; message: string; context: LogContext }[] = []

  info(message: string, context: LogContext = {}): void {
    this.entries.push({ level: 'info', message, context })
  }

  warn(message: string, context: LogContext = {}): void {
    this.entries.push({ level: 'warn', message, context })
  }

  error(message: string, context: LogContext = {}): void {
    this.entries.push({ level: 'error', message, context })
  }
}
