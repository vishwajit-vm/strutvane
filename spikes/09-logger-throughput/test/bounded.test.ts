/**
 * Q4: under a burst faster than the disk, memory stays bounded, low-priority records are dropped
 * first, warn/error records are kept, and the drop count is reported in a later record.
 */
import { describe, expect, test } from 'vitest'
import { createLogger } from '../src/logger.ts'
import { BoundedQueue, type QueueItem } from '../src/queue.ts'
import { LEVELS, type LogLevel } from '../src/record.ts'
import { memoryTransport } from './helpers.ts'

let seq = 0
const item = (level: LogLevel, bytes = 100): QueueItem => ({ seq: seq++, line: 'x', bytes, severity: LEVELS[level], level, dayKey: '2026-11-14' })

describe('BoundedQueue policy', () => {
  test('never exceeds maxRecords / maxBytes', () => {
    const q = new BoundedQueue({ maxRecords: 100, maxBytes: 5_000 })
    for (let i = 0; i < 10_000; i++) q.push(item(i % 7 === 0 ? 'error' : 'info', 10 + (i % 90)))
    expect(q.peakRecords).toBeLessThanOrEqual(100)
    expect(q.peakBytes).toBeLessThanOrEqual(5_000)
  })

  test('drops LOW first; IMPORTANT records evict the oldest LOW record', () => {
    const q = new BoundedQueue({ maxRecords: 3, maxBytes: 1e9 })
    q.push(item('info'))
    q.push(item('debug'))
    q.push(item('info'))
    expect(q.push(item('info'))).toBe('dropped') // incoming low is dropped when full
    expect(q.push(item('error'))).toBe('evicted-other') // important evicts the oldest low
    const batch = q.takeBatch(1e9)
    expect(batch.map((b) => b.level)).toEqual(['debug', 'info', 'error']) // input order preserved
    expect(q.takeDropped()).toEqual({ info: 2 })
  })

  test('a queue full of IMPORTANT records still stays bounded (oldest important dropped)', () => {
    const q = new BoundedQueue({ maxRecords: 2, maxBytes: 1e9 })
    q.push(item('error'))
    q.push(item('warn'))
    expect(q.push(item('fatal'))).toBe('evicted-other')
    expect(q.size).toBe(2)
    expect(q.takeDropped()).toEqual({ error: 1 })
  })

  test('a batch never mixes UTC days', () => {
    const q = new BoundedQueue({ maxRecords: 10, maxBytes: 1e9 })
    q.push({ ...item('info'), dayKey: '2026-11-14' })
    q.push({ ...item('info'), dayKey: '2026-11-15' })
    expect(q.takeBatch(1e9)).toHaveLength(1)
    expect(q.takeBatch(1e9)[0]?.dayKey).toBe('2026-11-15')
  })
})

describe('logger under a burst with a slow transport', () => {
  test('keeps every warn/error, drops info, reports drops, memory stays flat', async () => {
    const slow = memoryTransport({ delayMs: 20 }) // much slower than the burst
    const log = createLogger({ transport: slow, queue: { maxRecords: 1_000, maxBytes: 4 * 1024 * 1024 }, sanitize: { redact: false } })
    const big = { payload: 'z'.repeat(1_000) } // ~1 KB records
    const heapBefore = process.memoryUsage().heapUsed

    for (let i = 0; i < 100_000; i++) {
      if (i % 100 === 0) log.error('important', { i })
      else log.info('noise', { i, ...big })
    }
    const heapAfterBurst = process.memoryUsage().heapUsed
    const s1 = log.stats()
    expect(s1.queuePeak).toBeLessThanOrEqual(1_000) // bounded by records
    expect(s1.queuePeakBytes).toBeLessThanOrEqual(4 * 1024 * 1024) // and by bytes

    const r = await log.flush(30_000)
    expect(r.flushed).toBe(true)
    const lines = slow.text().trim().split('\n').map((l) => JSON.parse(l) as { level: string; msg: string; dropped?: Record<string, number> })
    expect(lines.filter((l) => l.msg === 'important')).toHaveLength(1_000) // all 1,000 errors kept
    const dropNotes = lines.filter((l) => l.msg.startsWith('logs: dropped'))
    expect(dropNotes.length).toBeGreaterThan(0) // drops reported in a later record
    const reported = dropNotes.reduce((a, l) => a + (l.dropped?.info ?? 0), 0)
    expect(reported).toBe(log.stats().droppedByLevel.info)
    expect(log.stats().droppedByLevel.error ?? 0).toBe(0)
    // 99,000 × ~1 KB would be ~100 MB if unbounded; the queue holds at most 4 MB.
    expect(heapAfterBurst - heapBefore).toBeLessThan(40 * 1024 * 1024)
    console.log(`[bounded] heap delta during burst: ${((heapAfterBurst - heapBefore) / 1048576).toFixed(1)} MB; dropped info: ${log.stats().droppedByLevel.info}; queue peak ${s1.queuePeak}`)
  })
})
