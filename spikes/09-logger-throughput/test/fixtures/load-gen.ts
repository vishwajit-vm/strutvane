/**
 * Load generator for the event-loop benchmark (separate process, so it does not disturb the
 * server's event loop measurement).
 *   node test/fixtures/load-gen.ts <port> <durationMs> <concurrency>
 * Prints `{ requests, errors, rps }` as JSON.
 */
import { Agent, request } from 'node:http'

const port = Number(process.argv[2])
const durationMs = Number(process.argv[3] ?? 3000)
const concurrency = Number(process.argv[4] ?? 32)
const agent = new Agent({ keepAlive: true, maxSockets: concurrency })
const deadline = Date.now() + durationMs
let requests = 0
let errors = 0

function one(): Promise<void> {
  return new Promise((resolve) => {
    const req = request({ host: '127.0.0.1', port, path: '/api/v1/invoices', agent }, (res) => {
      res.resume()
      res.on('end', () => {
        if (res.statusCode === 200) requests++
        else errors++
        resolve()
      })
    })
    req.on('error', () => {
      errors++
      resolve()
    })
    req.end()
  })
}

async function worker(): Promise<void> {
  while (Date.now() < deadline) await one()
}

await Promise.all(Array.from({ length: concurrency }, worker))
agent.destroy()
process.stdout.write(`${JSON.stringify({ requests, errors, rps: Math.round(requests / (durationMs / 1000)) })}\n`)
