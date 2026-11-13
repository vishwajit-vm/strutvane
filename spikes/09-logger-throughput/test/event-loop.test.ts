/**
 * Q2 (as a regression test): logging every request under load adds < 5 ms to the event loop's
 * p99 delay. Separate server and load-generator processes. Full table: `node bench/event-loop.ts`.
 */
import { describe, expect, test } from 'vitest'
import { type ElResult, medianBy, runEventLoop } from '../bench/event-loop-harness.ts'

describe('event loop stays responsive while logging', () => {
  test('p99 event-loop delay added by logging every request is < 5 ms', async () => {
    const runs = async (mode: 'none' | 'strutvane'): Promise<ElResult> => {
      const r: ElResult[] = []
      for (let i = 0; i < 3; i++) r.push(await runEventLoop(mode, 2_000, 64))
      return medianBy(r, (x) => x.p99)
    }
    const none = await runs('none')
    const logged = await runs('strutvane')
    console.log(`[event-loop] none p99=${none.p99} ms (${none.rps} req/s) · strutvane p99=${logged.p99} ms (${logged.rps} req/s) · added ${(logged.p99 - none.p99).toFixed(2)} ms`)
    expect(none.errors + logged.errors).toBe(0)
    expect(logged.p99 - none.p99).toBeLessThan(5)
  })
})
