/**
 * Q1 (as a regression test): Strutvane's pipeline stays within 2× of pino's time to write the same
 * records to a file, with and without redaction. Full numbers: `node bench/throughput.ts`.
 */
import { describe, expect, test } from 'vitest'
import { median, runScenario } from '../bench/scenarios.ts'

const cases = [
  ['small', false, 50_000],
  ['small', true, 50_000],
  ['medium', true, 10_000],
] as const

describe('throughput vs pino (median of 3, after warm-up)', () => {
  test.each(cases)('%s records, redaction=%s: within 2× of pino', async (size, redact, n) => {
    const pino = await median(() => runScenario('pino', size, redact, n), 3)
    const ours = await median(() => runScenario('strutvane-own', size, redact, n), 3)
    const ratio = ours.ms / pino.ms
    console.log(`[throughput] ${size} redact=${redact}: pino ${Math.round(pino.recordsPerSec).toLocaleString('en-US')}/s · strutvane ${Math.round(ours.recordsPerSec).toLocaleString('en-US')}/s · time ratio ${ratio.toFixed(2)}×`)
    expect(ratio).toBeLessThanOrEqual(2)
  })
})
