/** Q9: node:sqlite works without flags on Node 24 and returns correct results for viewer queries. */
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { LogIndex } from '../src/sqlite-index.ts'
import { tempDir } from './helpers.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

describe('node:sqlite search index', () => {
  test('ingests NDJSON (skipping torn lines) and answers level / time / traceId / text queries', () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const file = join(dir, '2026-11-14.ndjson')
    const lines = [
      { time: 1000, level: 'info', msg: 'request handled', traceId: 'a' },
      { time: 2000, level: 'error', msg: 'Payment failed', traceId: 'a' },
      { time: 3000, level: 'info', msg: 'request handled', traceId: 'b' },
      { time: 4000, level: 'warn', msg: 'slow query 100%_done', traceId: 'b' },
    ]
    writeFileSync(file, `${lines.map((l) => JSON.stringify(l)).join('\n')}\n{"torn":`)
    const idx = new LogIndex(join(dir, 'idx.sqlite'))
    try {
      expect(idx.ingestFile(file)).toBe(4) // torn last line skipped, not fatal
      expect(idx.query({ level: 'error' }).map((r) => r.msg)).toEqual(['Payment failed'])
      expect(idx.query({ traceId: 'a' }).map((r) => r.time)).toEqual([2000, 1000]) // newest first
      expect(idx.query({ fromMs: 2000, toMs: 4000 }).map((r) => r.time)).toEqual([3000, 2000])
      expect(idx.query({ text: 'PAYMENT' })).toHaveLength(1) // case-insensitive
      expect(idx.query({ text: '%_' })).toHaveLength(1) // literal match: % and _ are not wildcards
      expect(idx.query({ text: '_' }).map((r) => r.msg)).toEqual(['slow query 100%_done'])
    } finally {
      idx.close()
    }
  })
})
