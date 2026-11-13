/**
 * Throughput scenarios shared by `bench/throughput.ts` and `test/throughput.test.ts`.
 *
 * Fairness rules:
 *   - Both loggers enrich every record with the same request context from AsyncLocalStorage
 *     (pino via `mixin`), write epoch-ms time and JSON lines to a real file.
 *   - Both yield to the event loop every `YIELD_EVERY` records, like a server between requests.
 *     (A tight synchronous loop is a burst test, covered by Q4 — not a throughput test.)
 *   - Time is measured from the first log call until every byte is handed to the OS.
 */
import { mkdtempSync, rmSync, statSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import pino from 'pino'
import { runWithContext } from '../src/context.ts'
import { createLogger } from '../src/logger.ts'
import { rotatingFileTransport } from '../src/rotate.ts'
import { ownFileWriter, sonicBoomWriter } from '../src/transports/file.ts'

export const YIELD_EVERY = 1_000
const CONTEXT = { requestId: 'req_8f3a2c', traceId: '4bf92f3577b34da6a3ce929d0e0e4736', tenantId: 'acme', actorId: 'usr_42' }

export type Size = 'small' | 'medium'
export type Impl = 'pino' | 'strutvane-own' | 'strutvane-sonic'

export function smallFields(i: number): Record<string, unknown> {
  return { route: '/api/v1/invoices', status: 200, ms: i % 97 }
}

/** ≈1 KB, with values that redaction must catch (header credentials, a password field). */
export function mediumFields(i: number): Record<string, unknown> {
  return {
    method: 'POST',
    route: '/api/v1/invoices',
    status: 201,
    ms: i % 211,
    user: { id: `usr_${i % 1000}`, email: 'ann@example.com', roles: ['accountant', 'viewer'] },
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
      accept: 'application/json',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c3JfNDIifQ.c2lnbmF0dXJlLWJ5dGVz',
      cookie: 'sid=s%3Aabcdef0123456789.signature',
    },
    body: { number: `INV-${i}`, amount: 1250.5, currency: 'EUR', password: 'hunter2-should-never-appear' },
    items: Array.from({ length: 8 }, (_, k) => ({ sku: `SKU-${k}`, qty: k + 1, price: 9.99 + k })),
  }
}

export interface Result {
  impl: Impl
  size: Size
  redact: boolean
  records: number
  ms: number
  recordsPerSec: number
  mbPerSec: number
  bytes: number
}

function dirBytes(dir: string): number {
  return readdirSync(dir).reduce((sum, f) => sum + statSync(join(dir, f)).size, 0)
}

const yieldNow = (): Promise<void> => new Promise((r) => setImmediate(r))

export async function runScenario(impl: Impl, size: Size, redact: boolean, records: number): Promise<Result> {
  const dir = mkdtempSync(join(tmpdir(), 'sv-bench-'))
  const fields = size === 'small' ? smallFields : mediumFields
  try {
    let ms: number
    if (impl === 'pino') {
      const dest = pino.destination({ dest: join(dir, 'pino.ndjson'), sync: false, minLength: 4096 })
      const logger = pino(
        {
          base: null,
          mixin: () => ({ ...CONTEXT }),
          ...(redact ? { redact: { paths: ['headers.authorization', 'headers.cookie', 'body.password', '*.password'], censor: '[REDACTED]' } } : {}),
        },
        dest,
      )
      const start = performance.now()
      await runWithContext(CONTEXT, async () => {
        for (let i = 0; i < records; i++) {
          logger.info(fields(i), 'request handled')
          if (i % YIELD_EVERY === YIELD_EVERY - 1) await yieldNow()
        }
      })
      await new Promise<void>((resolve) => {
        dest.flush(() => {
          dest.end()
          resolve()
        })
      })
      ms = performance.now() - start
    } else {
      const logger = createLogger({
        transport: rotatingFileTransport({
          dir,
          writer: impl === 'strutvane-own' ? ownFileWriter : sonicBoomWriter,
          retentionDays: 0,
          maxFileBytes: 4 * 1024 * 1024 * 1024,
        }),
        sanitize: { redact },
        queue: { maxRecords: 50_000, maxBytes: 64 * 1024 * 1024 },
      })
      const start = performance.now()
      await runWithContext(CONTEXT, async () => {
        for (let i = 0; i < records; i++) {
          logger.info('request handled', fields(i))
          if (i % YIELD_EVERY === YIELD_EVERY - 1) await yieldNow()
        }
      })
      const result = await logger.close(60_000)
      ms = performance.now() - start
      const stats = logger.stats()
      if (!result.flushed || stats.dropped > 0 || stats.written !== records) {
        throw new Error(`incomplete run: ${JSON.stringify({ result, stats })}`)
      }
    }
    // Let async writers release the file before measuring and deleting (Windows).
    await new Promise((r) => setTimeout(r, 50))
    const bytes = dirBytes(dir)
    return { impl, size, redact, records, ms, recordsPerSec: records / (ms / 1000), mbPerSec: bytes / 1048576 / (ms / 1000), bytes }
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

export async function median(fn: () => Promise<Result>, runs: number): Promise<Result> {
  // One discarded warm-up run per implementation, so neither side pays JIT warm-up in the result.
  await fn()
  const results: Result[] = []
  for (let i = 0; i < runs; i++) results.push(await fn())
  results.sort((a, b) => a.ms - b.ms)
  return results[Math.floor(results.length / 2)] as Result
}
