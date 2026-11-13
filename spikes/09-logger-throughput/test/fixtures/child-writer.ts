/**
 * One writer process for the multi-process test (Q6).
 *   node test/fixtures/child-writer.ts <dir> <shared|tagged> <id> <count> <maxFileBytes>
 * `shared`: every process appends to the same daily file (O_APPEND).
 * `tagged`: each process writes its own file (`YYYY-MM-DD.w<id>.ndjson`).
 */
import { createLogger } from '../../src/logger.ts'
import { rotatingFileTransport } from '../../src/rotate.ts'
import { ownFileWriter } from '../../src/transports/file.ts'

const [dir = '.', mode = 'shared', id = '0', count = '1000', maxFileBytes = String(30 * 1024 * 1024)] = process.argv.slice(2)
const log = createLogger({
  transport: rotatingFileTransport({ dir, writer: ownFileWriter, retentionDays: 0, maxFileBytes: Number(maxFileBytes), ...(mode === 'tagged' ? { tag: `w${id}` } : {}) }),
  sanitize: { redact: false },
  queue: { maxRecords: 100_000, maxBytes: 128 * 1024 * 1024 },
})
const n = Number(count)
for (let i = 0; i < n; i++) {
  log.info('multi-process', { proc: Number(id), i, pad: 'q'.repeat(60 + (i % 200)) })
  if (i % 200 === 199) await new Promise((r) => setImmediate(r))
}
const result = await log.close(30_000)
process.stdout.write(`${JSON.stringify({ id, result, stats: log.stats() })}\n`)
