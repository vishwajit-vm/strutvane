/**
 * Shutdown scenarios for Q7 (real child process).
 *   node test/fixtures/shutdown-child.ts <dir> <scenario> <count>
 * scenarios:
 *   signal-emit   log `count` records to a slow writer, then deliver SIGTERM to the handler
 *                 (process.emit — Windows cannot deliver a catchable SIGTERM from outside)
 *   signal-real   log, print READY, wait for a real SIGTERM from the parent (Linux/macOS)
 *   before-exit   log and simply let the process end (beforeExit path)
 *   hung          primary transport never resolves; shutdown must still exit within the timeout
 */
import { createLogger } from '../../src/logger.ts'
import { rotatingFileTransport } from '../../src/rotate.ts'
import { registerShutdownFlush } from '../../src/shutdown.ts'
import { ownFileWriter } from '../../src/transports/file.ts'
import type { FileWriterFactory, Transport } from '../../src/transports/types.ts'

const [dir = '.', scenario = 'signal-emit', count = '5000'] = process.argv.slice(2)

/** A writer that is slow on purpose, so records are still queued when shutdown starts. */
const slowWriter: FileWriterFactory = async (path) => {
  const inner = await ownFileWriter(path)
  return {
    async append(text: string, bytes: number): Promise<void> {
      await new Promise((r) => setTimeout(r, 2))
      await inner.append(text, bytes)
    },
    close: () => inner.close(),
  }
}

const hung: Transport = { name: 'hung', write: () => new Promise<void>(() => {}), async close() {} }

const transport: Transport = scenario === 'hung' ? hung : rotatingFileTransport({ dir, writer: slowWriter, retentionDays: 0 })
const log = createLogger({ transport, sanitize: { redact: false }, maxBatchBytes: 8 * 1024, queue: { maxRecords: 100_000, maxBytes: 64 * 1024 * 1024 } })
registerShutdownFlush(log, { timeoutMs: scenario === 'hung' ? 300 : 10_000 })

const n = Number(count)
for (let i = 0; i < n; i++) log.info('shutdown-test', { i })

if (scenario === 'signal-emit' || scenario === 'hung') {
  process.emit('SIGTERM', 'SIGTERM')
} else if (scenario === 'signal-real') {
  process.stdout.write('READY\n')
  setInterval(() => {}, 1000) // stay alive until the signal arrives
}
// before-exit: nothing else to do; the event loop drains and 'beforeExit' fires.
