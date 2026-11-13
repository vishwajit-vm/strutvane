/**
 * Q7: on shutdown, queued records are flushed within a deadline; a hung transport cannot block
 * shutdown beyond that deadline. Real child processes.
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { readLogDir, tempDir } from './helpers.ts'

const child = fileURLToPath(new URL('./fixtures/shutdown-child.ts', import.meta.url))
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function run(dir: string, scenario: string, count: number, onReady?: (kill: () => void) => void): Promise<{ code: number | null; signal: string | null; ms: number }> {
  return new Promise((resolve) => {
    const started = performance.now()
    const p = spawn(process.execPath, [child, dir, scenario, String(count)], { stdio: ['ignore', 'pipe', 'pipe'] })
    p.stdout.on('data', (d: Buffer) => {
      if (onReady && d.toString().includes('READY')) onReady(() => p.kill('SIGTERM'))
    })
    p.once('exit', (code, signal) => resolve({ code, signal, ms: performance.now() - started }))
  })
}

const countRecords = (dir: string): number => readLogDir(dir).flatMap((f) => f.records).filter((r) => r.msg === 'shutdown-test').length

describe('shutdown flush', () => {
  test('SIGTERM handler: every queued record is written before exit (exit code 143)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const r = await run(dir, 'signal-emit', 20_000)
    expect(r.code).toBe(143)
    expect(countRecords(dir)).toBe(20_000)
  })

  test.skipIf(process.platform === 'win32')('a REAL SIGTERM from outside flushes too (Linux/macOS)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const r = await run(dir, 'signal-real', 20_000, (kill) => kill())
    expect(r.code).toBe(143)
    expect(countRecords(dir)).toBe(20_000)
  })

  test.runIf(process.platform === 'win32')('Windows: SIGTERM from outside is TerminateProcess and cannot be caught (documented limitation)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const r = await run(dir, 'signal-real', 20_000, (kill) => kill())
    // Killed without running any handler: not exit code 143, and (usually) records are lost.
    expect(r.code).not.toBe(143)
    console.log(`[shutdown:windows] external SIGTERM → code=${r.code} signal=${r.signal}, records on disk=${countRecords(dir)}/20000`)
  })

  test('beforeExit: a process that just ends still writes everything', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const r = await run(dir, 'before-exit', 20_000)
    expect(r.code).toBe(0)
    expect(countRecords(dir)).toBe(20_000)
  })

  test('a hung transport cannot block shutdown beyond the deadline', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const r = await run(dir, 'hung', 1_000)
    expect(r.code).toBe(143) // the signal exit code survives a hung transport
    expect(r.ms).toBeGreaterThanOrEqual(300) // it really waited for the deadline (no silent early exit)
    expect(r.ms).toBeLessThan(5_000) // …and did not hang (generous slack for process start-up)
    console.log(`[shutdown:hung] exited in ${Math.round(r.ms)} ms with a never-resolving transport (deadline 300 ms + process start-up)`)
  })
})
