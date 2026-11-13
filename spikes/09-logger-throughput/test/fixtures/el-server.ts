/**
 * HTTP server used by the event-loop benchmark/test (Q2). Runs in its own process.
 *   node test/fixtures/el-server.ts <mode: none|strutvane|pino> <logDir>
 * Prints `PORT <n>` when listening. Control endpoints:
 *   GET /__start  → reset + enable the event-loop delay histogram
 *   GET /__stats  → { p50, p99, max, mean } in ms, requests served, logger stats
 * Every other request: enrich context, do a little work, log one ~1 KB record, respond JSON.
 */
import { createServer } from 'node:http'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import pino from 'pino'
import { mediumFields } from '../../bench/scenarios.ts'
import { runWithContext } from '../../src/context.ts'
import { createLogger, type Logger } from '../../src/logger.ts'
import { rotatingFileTransport } from '../../src/rotate.ts'
import { ownFileWriter } from '../../src/transports/file.ts'

const mode = process.argv[2] ?? 'none'
const dir = process.argv[3] ?? '.'

let ours: Logger | undefined
let theirs: pino.Logger | undefined
if (mode === 'strutvane') {
  ours = createLogger({ transport: rotatingFileTransport({ dir, writer: ownFileWriter, retentionDays: 0 }), sanitize: { redact: true } })
} else if (mode === 'pino') {
  theirs = pino({ base: null, redact: { paths: ['headers.authorization', 'headers.cookie', 'body.password'], censor: '[REDACTED]' } }, pino.destination({ dest: join(dir, 'pino.ndjson'), sync: false, minLength: 4096 }))
}

const histogram = monitorEventLoopDelay({ resolution: 1 })
let served = 0
const payload = JSON.stringify({ data: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item ${i}`, amount: i * 10.5 })) })

const server = createServer((req, res) => {
  if (req.url === '/__start') {
    histogram.reset()
    histogram.enable()
    served = 0
    res.end('ok')
    return
  }
  if (req.url === '/__stats') {
    histogram.disable()
    const ms = (n: number): number => Math.round((n / 1e6) * 100) / 100
    res.setHeader('content-type', 'application/json')
    res.end(JSON.stringify({ p50: ms(histogram.percentile(50)), p99: ms(histogram.percentile(99)), max: ms(histogram.max), mean: ms(histogram.mean), served, logger: ours?.stats() }))
    return
  }
  served++
  runWithContext({ requestId: `req_${served}`, traceId: '4bf92f3577b34da6a3ce929d0e0e4736', tenantId: 'acme' }, () => {
    const fields = mediumFields(served)
    if (ours) ours.info('request handled', fields)
    else if (theirs) theirs.info(fields, 'request handled')
    res.setHeader('content-type', 'application/json')
    res.end(payload)
  })
})

server.listen(0, '127.0.0.1', () => {
  const address = server.address()
  if (address && typeof address === 'object') process.stdout.write(`PORT ${address.port}\n`)
})
