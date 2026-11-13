/**
 * The logger: record → enrich (bindings + AsyncLocalStorage context) → sanitize/redact → serialize
 * (one line) → bounded queue → batched, non-blocking writes to a transport.
 *
 * Contract with application code (RFC-0004 §6):
 *   - A log call is synchronous, cheap and NEVER throws, whatever it is given.
 *   - Writing happens off the hot path (setImmediate batching), one batch in flight at a time.
 *   - If the primary transport fails, logging falls back to stderr with exactly ONE warning per
 *     outage, keeps the batch (written to stderr instead), and retries the primary later.
 *   - Memory is bounded by the queue; drops are counted and reported in a later warn record.
 */
import { getContext } from './context.ts'
import { type Fields, LEVELS, type LogLevel, createRecord, toMessage } from './record.ts'
import { BoundedQueue, type QueueItem, type QueueLimits } from './queue.ts'
import { DEFAULT_SANITIZE, type SanitizeOptions, createSanitizer } from './redact.ts'
import { dayKeyOf } from './rotate.ts'
import { LINE_SEPARATOR, PARAGRAPH_SEPARATOR, serializeRecord, tryFastStringify } from './serialize.ts'
import { stderrTransport } from './transports/stderr.ts'
import type { Batch, Transport } from './transports/types.ts'

export interface LoggerOptions {
  readonly transport: Transport
  /** Used when the primary transport fails (default: stderr). */
  readonly fallback?: Transport
  readonly level?: LogLevel
  /** Redaction + safety settings; `{ redact: false }` uses the fast path (still crash-safe). */
  readonly sanitize?: Partial<SanitizeOptions>
  readonly maxRecordBytes?: number
  readonly queue?: Partial<QueueLimits>
  readonly maxBatchBytes?: number
  /** Retry the primary transport this long after a failure (default 30 s). */
  readonly retryPrimaryMs?: number
  readonly now?: () => number
  readonly bindings?: Fields
}

export interface FlushResult {
  readonly flushed: boolean
  readonly pending: number
}

export interface LoggerStats {
  readonly written: number
  readonly dropped: number
  readonly droppedByLevel: Partial<Record<LogLevel, number>>
  readonly fallbackActive: boolean
  readonly primaryFailures: number
  readonly fallbackWarnings: number
  readonly internalErrors: number
  readonly queuePeak: number
  readonly queuePeakBytes: number
  readonly queued: number
}

export interface Logger {
  trace(msg: unknown, fields?: Fields): void
  debug(msg: unknown, fields?: Fields): void
  info(msg: unknown, fields?: Fields): void
  warn(msg: unknown, fields?: Fields): void
  error(msg: unknown, fields?: Fields): void
  fatal(msg: unknown, fields?: Fields): void
  child(bindings: Fields): Logger
  /** Resolve when everything queued so far is written, or after `timeoutMs` (never hangs). */
  flush(timeoutMs?: number): Promise<FlushResult>
  /** Flush (bounded by `timeoutMs`) and close the transport. */
  close(timeoutMs?: number): Promise<FlushResult>
  stats(): LoggerStats
}

interface Core {
  readonly opts: Required<Pick<LoggerOptions, 'maxRecordBytes' | 'maxBatchBytes' | 'retryPrimaryMs'>>
  readonly minSeverity: number
  readonly redact: boolean
  readonly sanitize: (value: unknown) => unknown
  readonly queue: BoundedQueue
  readonly primary: Transport
  readonly fallback: Transport
  readonly now: () => number
  seq: number
  scheduled: boolean
  writing: boolean
  closed: boolean
  fallbackActive: boolean
  retryAt: number
  written: number
  dropped: number
  droppedByLevel: Partial<Record<LogLevel, number>>
  primaryFailures: number
  fallbackWarnings: number
  internalErrors: number
  waiters: Array<() => void>
  dayStart: number
  dayEnd: number
  dayKey: string
}

export function createLogger(options: LoggerOptions): Logger {
  const sanitizeOptions: SanitizeOptions = { ...DEFAULT_SANITIZE, ...options.sanitize }
  const core: Core = {
    opts: {
      maxRecordBytes: options.maxRecordBytes ?? 32 * 1024,
      maxBatchBytes: options.maxBatchBytes ?? 256 * 1024,
      retryPrimaryMs: options.retryPrimaryMs ?? 30_000,
    },
    minSeverity: LEVELS[options.level ?? 'info'],
    redact: sanitizeOptions.redact,
    sanitize: createSanitizer(sanitizeOptions),
    queue: new BoundedQueue({ maxRecords: options.queue?.maxRecords ?? 10_000, maxBytes: options.queue?.maxBytes ?? 16 * 1024 * 1024 }),
    primary: options.transport,
    fallback: options.fallback ?? stderrTransport(),
    now: options.now ?? Date.now,
    seq: 0,
    scheduled: false,
    writing: false,
    closed: false,
    fallbackActive: false,
    retryAt: 0,
    written: 0,
    dropped: 0,
    droppedByLevel: {},
    primaryFailures: 0,
    fallbackWarnings: 0,
    internalErrors: 0,
    waiters: [],
    dayStart: 0,
    dayEnd: -1,
    dayKey: '',
  }
  return makeLogger(core, options.bindings ?? {})
}

function makeLogger(core: Core, bindings: Fields): Logger {
  const log = (level: LogLevel, msg: unknown, fields?: Fields): void => {
    try {
      const severity = LEVELS[level]
      if (severity < core.minSeverity || core.closed) return
      const time = core.now()
      const record = createRecord(level, toMessage(msg), bindings, getContext(), fields, time)
      let line: string
      if (core.redact) {
        line = serializeRecord(core.sanitize(record) as Record<string, unknown>, core.opts.maxRecordBytes)
      } else {
        const fast = tryFastStringify(record)
        line =
          fast !== undefined && fast.length * 3 <= core.opts.maxRecordBytes && !fast.includes(LINE_SEPARATOR) && !fast.includes(PARAGRAPH_SEPARATOR)
            ? `${fast}\n`
            : serializeRecord(core.sanitize(record) as Record<string, unknown>, core.opts.maxRecordBytes)
      }
      enqueue(core, line, severity, level, time)
    } catch {
      core.internalErrors++
    }
  }
  return {
    trace: (m, f) => log('trace', m, f),
    debug: (m, f) => log('debug', m, f),
    info: (m, f) => log('info', m, f),
    warn: (m, f) => log('warn', m, f),
    error: (m, f) => log('error', m, f),
    fatal: (m, f) => log('fatal', m, f),
    child: (more) => makeLogger(core, { ...bindings, ...more }),
    flush: (timeoutMs = 5_000) => flush(core, timeoutMs),
    close: async (timeoutMs = 5_000) => {
      const result = await flush(core, timeoutMs)
      core.closed = true
      await Promise.race([core.primary.close().catch(() => undefined), delay(timeoutMs)])
      return result
    },
    stats: () => ({
      written: core.written,
      dropped: core.dropped,
      droppedByLevel: { ...core.droppedByLevel },
      fallbackActive: core.fallbackActive,
      primaryFailures: core.primaryFailures,
      fallbackWarnings: core.fallbackWarnings,
      internalErrors: core.internalErrors,
      queuePeak: core.queue.peakRecords,
      queuePeakBytes: core.queue.peakBytes,
      queued: core.queue.size,
    }),
  }
}

function dayKeyFor(core: Core, time: number): string {
  if (time >= core.dayStart && time < core.dayEnd) return core.dayKey
  core.dayKey = dayKeyOf(time)
  core.dayStart = Date.parse(`${core.dayKey}T00:00:00.000Z`)
  core.dayEnd = core.dayStart + 86_400_000
  return core.dayKey
}

function enqueue(core: Core, line: string, severity: number, level: LogLevel, time: number): void {
  const item: QueueItem = {
    seq: core.seq++,
    line,
    // Exact for ASCII (the vast majority of log lines); upper-bounded otherwise.
    bytes: isAscii(line) ? line.length : Buffer.byteLength(line),
    severity,
    level,
    dayKey: dayKeyFor(core, time),
  }
  core.queue.push(item)
  schedule(core)
}

function isAscii(s: string): boolean {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional ASCII range check
  return /^[\x00-\x7F]*$/.test(s)
}

function schedule(core: Core): void {
  if (core.scheduled || core.writing) return
  core.scheduled = true
  setImmediate(() => {
    core.scheduled = false
    void pump(core)
  })
}

async function pump(core: Core): Promise<void> {
  if (core.writing) return
  core.writing = true
  try {
    for (;;) {
      const items = core.queue.takeBatch(core.opts.maxBatchBytes)
      if (items.length === 0) break
      const first = items[0] as QueueItem
      let text = ''
      let bytes = 0
      const droppedNow = core.queue.takeDropped()
      if (droppedNow) {
        const total = Object.values(droppedNow).reduce((a, b) => a + (b ?? 0), 0)
        core.dropped += total
        for (const [lvl, n] of Object.entries(droppedNow)) {
          const k = lvl as LogLevel
          core.droppedByLevel[k] = (core.droppedByLevel[k] ?? 0) + (n ?? 0)
        }
        const meta = `${JSON.stringify({ time: core.now(), level: 'warn', msg: `logs: dropped ${total} records (queue full)`, dropped: droppedNow })}\n`
        text += meta
        bytes += meta.length
      }
      for (const it of items) {
        text += it.line
        bytes += it.bytes
      }
      await deliver(core, { text, bytes, records: items.length, dayKey: first.dayKey })
      core.written += items.length
    }
  } catch {
    core.internalErrors++
  } finally {
    core.writing = false
    if (core.queue.size > 0) schedule(core)
    else {
      const waiters = core.waiters
      core.waiters = []
      for (const w of waiters) w()
    }
  }
}

async function deliver(core: Core, batch: Batch): Promise<void> {
  const usePrimary = !core.fallbackActive || core.now() >= core.retryAt
  if (usePrimary) {
    try {
      await callTransport(core.primary, batch)
      if (core.fallbackActive) core.fallbackActive = false // recovered
      return
    } catch (error) {
      core.primaryFailures++
      core.retryAt = core.now() + core.opts.retryPrimaryMs
      if (!core.fallbackActive) {
        core.fallbackActive = true
        core.fallbackWarnings++
        const warning = `${JSON.stringify({
          time: core.now(),
          level: 'warn',
          msg: `logs: primary transport "${core.primary.name}" failed; writing to ${core.fallback.name} until it recovers`,
          error: describe(error),
        })}\n`
        await callTransport(core.fallback, { text: warning, bytes: warning.length, records: 1, dayKey: batch.dayKey }).catch(() => undefined)
      }
    }
  }
  await callTransport(core.fallback, batch).catch(() => {
    core.internalErrors++
  })
}

/** Call a transport so that a synchronous throw becomes a rejection. */
function callTransport(t: Transport, batch: Batch): Promise<void> {
  try {
    return Promise.resolve(t.write(batch))
  } catch (error) {
    return Promise.reject(error)
  }
}

function describe(error: unknown): Record<string, unknown> {
  if (error instanceof Error) return { type: error.name, message: error.message, code: (error as { code?: unknown }).code }
  return { message: String(error) }
}

function flush(core: Core, timeoutMs: number): Promise<FlushResult> {
  if (!core.writing && !core.scheduled && core.queue.size === 0) return Promise.resolve({ flushed: true, pending: 0 })
  return new Promise<FlushResult>((resolve) => {
    let done = false
    const finish = (flushed: boolean): void => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ flushed, pending: core.queue.size })
    }
    const timer = setTimeout(() => finish(false), timeoutMs)
    timer.unref?.()
    core.waiters.push(() => finish(true))
    schedule(core)
  })
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => {
    const t = setTimeout(r, ms)
    t.unref?.()
  })
}
