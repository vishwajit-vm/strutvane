/**
 * Q3: logging never throws into application code, and the app keeps running when the disk, the
 * directory or a transport fails. Expected: fallback to stderr with ONE warning per outage, no lost
 * batches, counters exposed, recovery when the primary comes back.
 */
import { writeFileSync, rmSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'
import { createLogger } from '../src/logger.ts'
import { rotatingFileTransport } from '../src/rotate.ts'
import { ownFileWriter } from '../src/transports/file.ts'
import { stderrTransport } from '../src/transports/stderr.ts'
import type { Transport } from '../src/transports/types.ts'
import { captureStream, failingWriter, readLogDir, sleep, tempDir } from './helpers.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function setup(transport: Transport, retryPrimaryMs = 30_000) {
  const cap = captureStream()
  const log = createLogger({ transport, fallback: stderrTransport(cap.stream), retryPrimaryMs })
  return { log, cap }
}

describe('disk and directory failures', () => {
  test('disk full (ENOSPC): one warning, records go to stderr, app unaffected', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const { log, cap } = setup(rotatingFileTransport({ dir, writer: failingWriter('ENOSPC'), retentionDays: 0 }))
    for (let i = 0; i < 500; i++) expect(() => log.info('order placed', { i })).not.toThrow()
    await log.flush()
    for (let i = 0; i < 500; i++) log.error('still failing', { i })
    await log.flush()
    const lines = cap.lines()
    const warnings = lines.filter((l) => String(l.msg).startsWith('logs: primary transport'))
    expect(warnings).toHaveLength(1) // exactly ONE warning for the whole outage
    expect((warnings[0]?.error as { code?: string }).code).toBe('ENOSPC')
    expect(lines.filter((l) => l.msg === 'order placed')).toHaveLength(500) // nothing lost
    expect(lines.filter((l) => l.msg === 'still failing')).toHaveLength(500)
    const s = log.stats()
    expect(s.fallbackActive).toBe(true)
    expect(s.fallbackWarnings).toBe(1)
    expect(s.internalErrors).toBe(0)
  })

  test('a persistent outage retried many times still produces exactly ONE warning', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    // Retry the primary every 5 ms: the disk keeps failing on every retry.
    const { log, cap } = setup(rotatingFileTransport({ dir, writer: failingWriter('ENOSPC'), retentionDays: 0 }), 5)
    for (let round = 0; round < 10; round++) {
      log.error('during outage', { round })
      await log.flush()
      await sleep(10) // past the retry interval, so the next batch retries the primary
    }
    expect(log.stats().primaryFailures).toBeGreaterThan(5) // it really retried, and failed, many times
    expect(cap.lines().filter((l) => String(l.msg).startsWith('logs: primary transport'))).toHaveLength(1)
    expect(log.stats().fallbackWarnings).toBe(1)
    expect(cap.lines().filter((l) => l.msg === 'during outage')).toHaveLength(10) // nothing lost
  })

  test('log directory is a FILE (not writable as a directory): fallback, then recovery when fixed', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const logDir = join(dir, 'logs')
    writeFileSync(logDir, 'not a directory') // mkdir/open will fail (EEXIST/ENOTDIR)
    const { log, cap } = setup(rotatingFileTransport({ dir: logDir, writer: ownFileWriter, retentionDays: 0 }), 50)
    log.info('before fix')
    await log.flush()
    expect(cap.lines().filter((l) => String(l.msg).startsWith('logs: primary transport'))).toHaveLength(1)
    // Operator fixes the problem: the path becomes a real directory.
    rmSync(logDir)
    mkdirSync(logDir)
    await sleep(80) // past retryPrimaryMs
    log.info('after fix')
    await log.flush()
    expect(log.stats().fallbackActive).toBe(false) // recovered automatically
    const files = readLogDir(logDir)
    expect(files.flatMap((f) => f.records).map((r) => r.msg)).toEqual(['after fix'])
    expect(cap.lines().map((l) => l.msg)).toContain('before fix')
    await log.close()
  })

  test('directory deleted at runtime: next file open recreates it (rotation path)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const logDir = join(dir, 'logs')
    let now = Date.parse('2026-11-14T23:59:59.000Z')
    const log = createLogger({ transport: rotatingFileTransport({ dir: logDir, writer: ownFileWriter, retentionDays: 0, now: () => now }), now: () => now })
    log.info('day one')
    await log.flush()
    await log.close() // releases the handle so the directory can be deleted on Windows too
    rmSync(logDir, { recursive: true, force: true })
    const log2 = createLogger({ transport: rotatingFileTransport({ dir: logDir, writer: ownFileWriter, retentionDays: 0, now: () => now }), now: () => now })
    now += 2_000 // next day
    log2.info('day two')
    await log2.close()
    expect(readLogDir(logDir).map((f) => f.file)).toEqual(['2026-11-15.ndjson'])
  })
})

describe('transport failures', () => {
  test('a transport that throws synchronously never reaches the caller', async () => {
    const bad: Transport = {
      name: 'sync-thrower',
      write() {
        throw new Error('boom (sync)')
      },
      async close() {},
    }
    const { log, cap } = setup(bad)
    expect(() => log.warn('hello')).not.toThrow()
    await log.flush()
    expect(cap.lines().map((l) => l.msg)).toContain('hello')
    expect(log.stats().primaryFailures).toBe(1)
  })

  test('a transport that rejects never reaches the caller', async () => {
    const bad: Transport = { name: 'rejecter', write: () => Promise.reject(new Error('boom (async)')), async close() {} }
    const { log, cap } = setup(bad)
    log.info('a')
    log.info('b')
    await log.flush()
    expect(cap.lines().map((l) => l.msg)).toEqual(expect.arrayContaining(['a', 'b']))
  })

  test('even a broken fallback stream cannot crash the app', async () => {
    const bad: Transport = { name: 'rejecter', write: () => Promise.reject(new Error('x')), async close() {} }
    const log = createLogger({
      transport: bad,
      fallback: stderrTransport({
        write() {
          throw new Error('stderr is gone too')
        },
      }),
    })
    expect(() => log.error('nowhere to go')).not.toThrow()
    const r = await log.flush()
    expect(r.flushed).toBe(true)
  })
})

describe('hostile values', () => {
  test('circular, BigInt, Error cause chains, throwing getters, Proxies, huge values: no throw, valid one-line JSON', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const log = createLogger({ transport: rotatingFileTransport({ dir, writer: ownFileWriter, retentionDays: 0 }), maxRecordBytes: 32 * 1024 })

    const circular: Record<string, unknown> = { name: 'loop' }
    circular.self = circular
    const root = new Error('top', { cause: new TypeError('middle', { cause: new RangeError('bottom') }) })
    const cyclicCause = new Error('a')
    ;(cyclicCause as { cause?: unknown }).cause = cyclicCause
    const throwingGetter = Object.defineProperty({}, 'bad', {
      enumerable: true,
      get() {
        throw new Error('getter exploded')
      },
    })
    const hostileProxy = new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('ownKeys exploded')
        },
      },
    )
    const huge: Record<string, number> = {}
    for (let i = 0; i < 100_000; i++) huge[`k${i}`] = i
    const deep: Record<string, unknown> = {}
    let cur = deep
    for (let i = 0; i < 1000; i++) {
      cur.next = {}
      cur = cur.next as Record<string, unknown>
    }

    const cases: Array<[string, unknown]> = [
      ['circular', { circular }],
      ['bigint', { big: 2n ** 70n }],
      ['error chain', { err: root }],
      ['cyclic cause', { err: cyclicCause }],
      ['aggregate', { err: new AggregateError([new Error('x'), new Error('y')], 'many') }],
      ['getter', throwingGetter],
      ['proxy', { p: hostileProxy }],
      ['huge object', { huge }],
      ['huge string', { s: 'x'.repeat(10_000_000) }],
      ['deep', { deep }],
      ['misc', { fn: () => 1, sym: Symbol('s'), nan: Number.NaN, inf: Infinity, date: new Date(0), bad: new Date('x'), buf: Buffer.alloc(16), map: new Map([['a', 1]]), set: new Set([1, 2]), undef: undefined }],
      ['toJSON throws', { t: { toJSON: () => { throw new Error('nope') } } }],
    ]
    for (const [name, fields] of cases) {
      expect(() => log.error(name, fields as Record<string, unknown>)).not.toThrow()
    }
    expect(() => log.info(undefined as unknown as string)).not.toThrow()
    expect(() => log.info({ toString: () => { throw new Error('x') } } as unknown as string)).not.toThrow()
    await log.close()

    const records = readLogDir(dir).flatMap((f) => f.records) // throws on any invalid line
    expect(records).toHaveLength(cases.length + 2)
    const byMsg = Object.fromEntries(records.map((r) => [r.msg, r]))
    expect(JSON.stringify(byMsg.circular)).toContain('[Circular]')
    expect((byMsg.bigint as { big: string }).big).toBe((2n ** 70n).toString())
    expect(JSON.stringify(byMsg['error chain'])).toContain('bottom')
    expect(JSON.stringify(byMsg['cyclic cause'])).toContain('[Circular]')
    expect(JSON.stringify(byMsg.getter)).toContain('[Unreadable]')
    expect(log.stats().internalErrors).toBe(0)
  })

  test('a record bigger than maxRecordBytes becomes a small marker record', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const log = createLogger({ transport: rotatingFileTransport({ dir, writer: ownFileWriter, retentionDays: 0 }), maxRecordBytes: 4096, sanitize: { maxStringLength: 1_000_000 } })
    log.info('too big', { blob: 'y'.repeat(100_000) })
    await log.close()
    const [record] = readLogDir(dir).flatMap((f) => f.records)
    expect(record?.truncated).toBe(true)
    expect(record?.originalBytes).toBeGreaterThan(100_000)
  })
})
