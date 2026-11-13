/**
 * Q2 benchmark: event-loop delay under HTTP load with logging off / Strutvane / pino.
 *   node bench/event-loop.ts            (median of 3 runs × 5 s, 64 concurrent connections)
 */
import { type ElResult, medianBy, runEventLoop } from './event-loop-harness.ts'

const RUNS = Number(process.env.RUNS ?? 3)
const DURATION = Number(process.env.DURATION ?? 5_000)
const CONCURRENCY = Number(process.env.CONCURRENCY ?? 64)

const results: ElResult[] = []
for (const mode of ['none', 'strutvane', 'pino'] as const) {
  const runs: ElResult[] = []
  for (let i = 0; i < RUNS; i++) runs.push(await runEventLoop(mode, DURATION, CONCURRENCY))
  results.push(medianBy(runs, (r) => r.p99))
}
const base = results[0] as ElResult
console.log(`\nEvent-loop delay under load (${CONCURRENCY} connections, ${DURATION / 1000} s, median of ${RUNS} by p99)`)
console.log('| logging | req/s | p50 | p99 | max | p99 added vs none | errors |')
console.log('|---|---|---|---|---|---|---|')
for (const r of results) {
  console.log(`| ${r.mode} | ${r.rps.toLocaleString('en-US')} | ${r.p50} ms | ${r.p99} ms | ${r.max} ms | ${(r.p99 - base.p99).toFixed(2)} ms | ${r.errors} |`)
}
