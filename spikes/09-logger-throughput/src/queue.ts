/**
 * Bounded, priority-aware queue of serialized log lines.
 *
 * Guarantees (RFC-0004 §6, "log flooding"):
 *   - It never holds more than `maxRecords` items or `maxBytes` bytes.
 *   - When full, LOW records (trace/debug/info) are dropped first; IMPORTANT records (warn and up)
 *     evict the oldest LOW record. Only when the whole queue is IMPORTANT is the oldest IMPORTANT
 *     record dropped (so the queue stays bounded no matter what).
 *   - Drops are counted per level so the logger can report them in a later record.
 *   - Output order equals input order (two FIFOs, merged by sequence number on drain).
 */
import { IMPORTANT_SEVERITY, type LogLevel } from './record.ts'

export interface QueueItem {
  readonly seq: number
  readonly line: string
  readonly bytes: number
  readonly severity: number
  readonly level: LogLevel
  /** UTC day of the record (`YYYY-MM-DD`): a batch never mixes days (rotation correctness). */
  readonly dayKey: string
}

export interface QueueLimits {
  readonly maxRecords: number
  readonly maxBytes: number
}

class Fifo {
  private items: QueueItem[] = []
  private head = 0
  get length(): number {
    return this.items.length - this.head
  }
  push(item: QueueItem): void {
    this.items.push(item)
  }
  peek(): QueueItem | undefined {
    return this.items[this.head]
  }
  shift(): QueueItem | undefined {
    const item = this.items[this.head]
    if (item === undefined) return undefined
    this.items[this.head] = undefined as unknown as QueueItem // release for GC
    this.head++
    if (this.head > 1024 && this.head * 2 > this.items.length) {
      this.items = this.items.slice(this.head)
      this.head = 0
    }
    return item
  }
}

export type PushResult = 'queued' | 'dropped' | 'evicted-other'

export class BoundedQueue {
  private readonly low = new Fifo()
  private readonly high = new Fifo()
  private bytes = 0
  /** Records dropped since the last `takeDropped()`, per level. */
  private dropped: Partial<Record<LogLevel, number>> = {}
  /** High-water mark, for tests and stats. */
  peakRecords = 0
  peakBytes = 0

  private readonly limits: QueueLimits

  constructor(limits: QueueLimits) {
    this.limits = limits
  }

  get size(): number {
    return this.low.length + this.high.length
  }
  get byteSize(): number {
    return this.bytes
  }

  push(item: QueueItem): PushResult {
    let result: PushResult = 'queued'
    while (this.size >= this.limits.maxRecords || this.bytes + item.bytes > this.limits.maxBytes) {
      if (this.size === 0) {
        // A single item bigger than the byte budget (cannot happen with maxRecordBytes ≤ maxBytes).
        this.count(item.level)
        return 'dropped'
      }
      const important = item.severity >= IMPORTANT_SEVERITY
      if (!important && this.low.length === 0 && this.high.length > 0) {
        // Queue full of important records: drop the incoming low record.
        this.count(item.level)
        return 'dropped'
      }
      if (!important) {
        // Drop the incoming low record rather than an older one (oldest context is kept).
        this.count(item.level)
        return 'dropped'
      }
      const victim = this.low.length > 0 ? this.low.shift() : this.high.shift()
      if (victim) {
        this.bytes -= victim.bytes
        this.count(victim.level)
        result = 'evicted-other'
      }
    }
    ;(item.severity >= IMPORTANT_SEVERITY ? this.high : this.low).push(item)
    this.bytes += item.bytes
    if (this.size > this.peakRecords) this.peakRecords = this.size
    if (this.bytes > this.peakBytes) this.peakBytes = this.bytes
    return result
  }

  /**
   * Remove and return the oldest items, in input order, up to `maxBytes` (at least one item), all
   * belonging to the same `dayKey` as the oldest item.
   */
  takeBatch(maxBytes: number): QueueItem[] {
    const out: QueueItem[] = []
    let total = 0
    let day: string | undefined
    for (;;) {
      const a = this.low.peek()
      const b = this.high.peek()
      const next = a && b ? (a.seq < b.seq ? a : b) : (a ?? b)
      if (!next) break
      if (day === undefined) day = next.dayKey
      else if (next.dayKey !== day) break
      if (out.length > 0 && total + next.bytes > maxBytes) break
      ;(next === a ? this.low : this.high).shift()
      this.bytes -= next.bytes
      total += next.bytes
      out.push(next)
    }
    return out
  }

  /** Drop counts since the last call (and reset them). */
  takeDropped(): Partial<Record<LogLevel, number>> | undefined {
    const d = this.dropped
    if (Object.keys(d).length === 0) return undefined
    this.dropped = {}
    return d
  }

  private count(level: LogLevel): void {
    this.dropped[level] = (this.dropped[level] ?? 0) + 1
  }
}
