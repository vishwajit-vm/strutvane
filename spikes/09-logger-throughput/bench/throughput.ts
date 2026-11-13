/**
 * Q1 benchmark: Strutvane pipeline vs pino, JSON to a real file.
 *   node bench/throughput.ts            (median of 3 runs per scenario)
 *   RUNS=5 SMALL=300000 node bench/throughput.ts
 */
import { cpus, platform, release } from 'node:os'
import { type Impl, median, runScenario, type Size } from './scenarios.ts'

const RUNS = Number(process.env.RUNS ?? 3)
const N: Record<Size, number> = { small: Number(process.env.SMALL ?? 200_000), medium: Number(process.env.MEDIUM ?? 50_000) }

const rows: string[] = []
const fmt = (n: number, d = 0): string => n.toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d })

console.log(`Node ${process.version} · ${platform()} ${release()} · ${cpus()[0]?.model ?? 'cpu'} × ${cpus().length} · median of ${RUNS}`)
for (const size of ['small', 'medium'] as const) {
  for (const redact of [false, true]) {
    const base = await median(() => runScenario('pino', size, redact, N[size]), RUNS)
    for (const impl of ['pino', 'strutvane-own', 'strutvane-sonic'] as Impl[]) {
      const r = impl === 'pino' ? base : await median(() => runScenario(impl, size, redact, N[size]), RUNS)
      const ratio = r.ms / base.ms
      rows.push(
        `| ${size} | ${redact ? 'yes' : 'no'} | ${impl} | ${fmt(r.records)} | ${fmt(r.ms)} ms | ${fmt(r.recordsPerSec)} | ${fmt(r.mbPerSec, 1)} | ${fmt(ratio, 2)}× |`,
      )
    }
  }
}
console.log('\n| record | redaction | implementation | records | time | records/s | MB/s | time vs pino |')
console.log('|---|---|---|---|---|---|---|---|')
for (const r of rows) console.log(r)
