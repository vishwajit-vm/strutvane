/**
 * Q5: daily files + size cap rotate with no lost or duplicated lines across boundaries; retention
 * deletes only old log files; a concurrent tail reader (the viewer's live tail) never consumes a
 * torn line during rotation, as long as it only consumes complete lines.
 */
import { open, readdir, stat } from 'node:fs/promises'
import { writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createLogger } from '../src/logger.ts'
import { applyRetention, compareLogFiles, rotatingFileTransport } from '../src/rotate.ts'
import { ownFileWriter, sonicBoomWriter } from '../src/transports/file.ts'
import { readLogDir, tempDir } from './helpers.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

/** A live-tail reader: polls every file, consumes only complete lines, parses each one. */
function startTailReader(dir: string) {
  const offsets = new Map<string, number>()
  const partial = new Map<string, string>()
  const seen: number[] = []
  let parseErrors = 0
  let midLineReads = 0
  let stopped = false
  const loop = (async () => {
    while (!stopped) {
      for (const name of (await readdir(dir).catch(() => [] as string[])).filter((n) => n.endsWith('.ndjson')).sort(compareLogFiles)) {
        const path = join(dir, name)
        const size = (await stat(path).catch(() => undefined))?.size ?? 0
        const from = offsets.get(name) ?? 0
        if (size <= from) continue
        const fh = await open(path, 'r')
        try {
          const buf = Buffer.alloc(size - from)
          const { bytesRead } = await fh.read(buf, 0, buf.length, from)
          offsets.set(name, from + bytesRead)
          const text = (partial.get(name) ?? '') + buf.subarray(0, bytesRead).toString('utf8')
          const cut = text.lastIndexOf('\n')
          if (cut !== text.length - 1) midLineReads++ // the read ended inside a line (normal while writing)
          partial.set(name, text.slice(cut + 1)) // keep the incomplete tail for the next poll
          for (const line of text.slice(0, cut + 1).split('\n')) {
            if (!line) continue
            try {
              seen.push((JSON.parse(line) as { i: number }).i)
            } catch {
              parseErrors++
            }
          }
        } finally {
          await fh.close()
        }
      }
      await new Promise((r) => setTimeout(r, 1))
    }
  })()
  return {
    seen,
    async stop() {
      // One last pass after the writer finished.
      await new Promise((r) => setTimeout(r, 30))
      stopped = true
      await loop
      return { parseErrors, midLineReads, leftover: [...partial.values()].join('') }
    },
  }
}

describe.each([
  ['own writer', ownFileWriter],
  ['sonic-boom writer', sonicBoomWriter],
])('rotation (%s)', (_name, writer) => {
  test('day + size rotation: every line exactly once, in the right day file, parts within the cap', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    let now = Date.parse('2026-11-14T23:59:58.000Z')
    const maxFileBytes = 64 * 1024
    const log = createLogger({
      transport: rotatingFileTransport({ dir, writer, maxFileBytes, retentionDays: 0, now: () => now }),
      now: () => now,
      sanitize: { redact: false },
      maxBatchBytes: 16 * 1024,
      // Large queue: this test is about rotation correctness, so nothing may be dropped (asserted below).
      queue: { maxRecords: 100_000, maxBytes: 64 * 1024 * 1024 },
    })
    const reader = startTailReader(dir)
    const N = 20_000
    for (let i = 0; i < N; i++) {
      if (i === N / 2) now += 4_000 // crosses midnight into 2026-11-15
      log.info('rotating', { i, pad: 'p'.repeat(40) })
      if (i % 500 === 0) await new Promise((r) => setImmediate(r))
    }
    await log.close()
    const tail = await reader.stop()
    expect(log.stats().dropped).toBe(0)

    const files = readLogDir(dir) // throws on any torn line in the final files
    const all = files.flatMap((f) => f.records.map((r) => r.i as number))
    expect(all).toHaveLength(N)
    expect(new Set(all).size).toBe(N) // no duplicates, nothing lost
    for (const f of files) {
      const day = f.file.slice(0, 10)
      for (const r of f.records) expect(new Date(r.time as number).toISOString().slice(0, 10)).toBe(day)
      expect((await stat(join(dir, f.file))).size).toBeLessThanOrEqual(maxFileBytes)
    }
    expect(files.map((f) => f.file).some((n) => n.startsWith('2026-11-14-'))).toBe(true) // size parts happened
    expect(files.map((f) => f.file).some((n) => n.startsWith('2026-11-15'))).toBe(true) // day rotation happened
    // The live tail saw every line once and never parsed a torn line.
    expect(tail.parseErrors).toBe(0)
    expect(tail.leftover).toBe('')
    expect(reader.seen.length).toBe(N)
    expect(new Set(reader.seen).size).toBe(N)
    console.log(`[rotation:${_name}] files=${files.length} midLineReads=${tail.midLineReads} (reads that ended inside a line, handled by consuming complete lines only)`)
  })
})

describe('live tail reader', () => {
  test('a half-written last line is held back until it is complete (never parsed torn)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const path = join(dir, '2026-11-14.ndjson')
    writeFileSync(path, `${JSON.stringify({ i: 0 })}\n{"i":`) // second line is only half written
    const reader = startTailReader(dir)
    await new Promise((r) => setTimeout(r, 40))
    expect(reader.seen).toEqual([0]) // the partial line is NOT consumed
    writeFileSync(path, `${JSON.stringify({ i: 0 })}\n{"i":1}\n`) // writer completes the line
    const result = await reader.stop()
    expect(result.parseErrors).toBe(0)
    expect(reader.seen).toEqual([0, 1])
  })
})

describe('file ordering', () => {
  test('chronological order is day, tag, then part NUMBER (string sort is wrong)', () => {
    const names = ['2026-11-14-10.ndjson', '2026-11-15.ndjson', '2026-11-14.ndjson', '2026-11-14-2.ndjson', '2026-11-14-1.ndjson']
    expect([...names].sort()).not.toEqual([...names].sort(compareLogFiles)) // proves plain sort is wrong
    expect([...names].sort(compareLogFiles)).toEqual(['2026-11-14.ndjson', '2026-11-14-1.ndjson', '2026-11-14-2.ndjson', '2026-11-14-10.ndjson', '2026-11-15.ndjson'])
  })
})

describe('restart behaviour', () => {
  test('after a restart, logging continues in the newest part that still has room', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const now = Date.parse('2026-11-14T10:00:00.000Z')
    writeFileSync(join(dir, '2026-11-14.ndjson'), `${JSON.stringify({ i: -1 })}\n`.repeat(2_000)) // full
    const log = createLogger({ transport: rotatingFileTransport({ dir, writer: ownFileWriter, maxFileBytes: 16 * 1024, retentionDays: 0, now: () => now }), now: () => now })
    log.info('after restart', { i: 0 })
    await log.close()
    expect(readLogDir(dir).find((f) => f.file === '2026-11-14-1.ndjson')?.records[0]?.msg).toBe('after restart')
  })
})

describe('retention', () => {
  test('deletes only Strutvane log files older than N days', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const names = [
      '2026-09-01.ndjson', // old
      '2026-09-01-3.ndjson', // old part
      '2026-09-14.w123.ndjson', // old tagged writer
      '2026-09-16.ndjson', // within 60 days of 2026-11-14
      '2026-11-14.ndjson', // today
      'notes.txt', // unrelated
      '2026-09-01.ndjson.bak', // unrelated (not our pattern)
    ]
    for (const n of names) writeFileSync(join(dir, n), 'x\n')
    const deleted = await applyRetention(dir, 60, Date.parse('2026-11-14T12:00:00Z'))
    expect(deleted.sort()).toEqual(['2026-09-01-3.ndjson', '2026-09-01.ndjson', '2026-09-14.w123.ndjson'])
    for (const keep of ['2026-09-16.ndjson', '2026-11-14.ndjson', 'notes.txt', '2026-09-01.ndjson.bak']) expect(existsSync(join(dir, keep))).toBe(true)
  })
})
