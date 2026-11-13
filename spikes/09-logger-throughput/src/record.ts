/**
 * Log levels and the shape of one log record.
 *
 * Severities are numeric (pino-compatible) so the queue can compare them cheaply. The record is a
 * plain object; field order on disk is `time, level, msg, …bindings, …context, …fields`.
 */

export const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 } as const
export type LogLevel = keyof typeof LEVELS
export const LEVEL_NAMES: readonly LogLevel[] = ['trace', 'debug', 'info', 'warn', 'error', 'fatal']

/** Structured fields attached to one log call. */
export type Fields = Readonly<Record<string, unknown>>

/** Keys the pipeline owns. A user field with one of these names is kept under `_<name>` instead. */
const RESERVED = new Set(['time', 'level', 'msg'])

/** Severity at or above which records are "important" (kept when the queue must drop). */
export const IMPORTANT_SEVERITY: number = LEVELS.warn

/**
 * Build a record object. Never throws: reading a hostile `fields` object is wrapped by the caller's
 * sanitizer; here we only copy own enumerable keys defensively.
 */
export function createRecord(
  level: LogLevel,
  msg: string,
  bindings: Fields,
  context: Fields | undefined,
  fields: Fields | undefined,
  time: number,
): Record<string, unknown> {
  const record: Record<string, unknown> = { time, level, msg }
  assign(record, bindings)
  if (context) assign(record, context)
  if (fields) assign(record, fields)
  return record
}

function assign(target: Record<string, unknown>, source: Fields): void {
  let keys: string[]
  try {
    keys = Object.keys(source)
  } catch {
    target._fieldsError = 'unreadable fields object'
    return
  }
  for (const key of keys) {
    let value: unknown
    try {
      value = source[key]
    } catch {
      value = '[Unreadable]'
    }
    target[RESERVED.has(key) ? `_${key}` : key] = value
  }
}

/** Coerce any value passed as a message into a string without throwing. */
export function toMessage(value: unknown): string {
  if (typeof value === 'string') return value
  try {
    return String(value)
  } catch {
    return '[unprintable message]'
  }
}
