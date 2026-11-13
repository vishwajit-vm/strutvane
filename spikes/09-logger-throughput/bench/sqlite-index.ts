/**
 * Q9 benchmark: node:sqlite as a search index over NDJSON log files.
 *   node bench/sqlite-index.ts      (LINES=200000 by default)
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { LogIndex } from '../src/sqlite-index.ts'

const LINES = Number(process.env.LINES ?? 200_000)
const dir = mkdtempSync(join(tmpdir(), 'sv-idx-'))
try {
  const start = Date.parse('2026-11-14T00:00:00Z')
  const levels = ['debug', 'info', 'info', 'info', 'warn', 'error']
  let text = ''
  for (let i = 0; i < LINES; i++) {
    text += `${JSON.stringify({ time: start + i * 400, level: levels[i % levels.length], msg: i % 997 === 0 ? 'Payment failed' : 'request handled', traceId: `t${Math.floor(i / 5)}`, route: '/api/v1/invoices', status: 200 })}\n`
  }
  const file = join(dir, '2026-11-14.ndjson')
  writeFileSync(file, text)

  const idx = new LogIndex(join(dir, 'index.sqlite'))
  let t = performance.now()
  const n = idx.ingestFile(file)
  const ingestMs = performance.now() - t
  const time = (label: string, fn: () => unknown[]): string => {
    fn()
    const t0 = performance.now()
    const rows = fn()
    return `| ${label} | ${(performance.now() - t0).toFixed(2)} ms | ${rows.length} |`
  }
  console.log(`\nnode:sqlite index over ${n.toLocaleString('en-US')} lines (${(Buffer.byteLength(text) / 1048576).toFixed(1)} MB): ingest ${Math.round(ingestMs)} ms = ${Math.round(n / (ingestMs / 1000)).toLocaleString('en-US')} lines/s`)
  console.log('| query | time | rows |')
  console.log('|---|---|---|')
  console.log(time('level = error, newest 100', () => idx.query({ level: 'error' })))
  console.log(time('time window (1 hour), newest 100', () => idx.query({ fromMs: start + 3_600_000, toMs: start + 7_200_000 })))
  console.log(time('traceId = t12345 (all lines of one request)', () => idx.query({ traceId: 't12345' })))
  console.log(time('text "payment failed" (substring scan)', () => idx.query({ text: 'payment failed', limit: 1000 })))
  t = performance.now()
  idx.close()
} finally {
  rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}
