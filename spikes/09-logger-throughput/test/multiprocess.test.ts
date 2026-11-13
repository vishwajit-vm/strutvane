/**
 * Q6: several processes logging to the same directory (node cluster, PM2, multiple containers on a
 * shared volume). Real child processes, real files.
 */
import { spawn } from 'node:child_process'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'
import { tempDir } from './helpers.ts'

const writer = fileURLToPath(new URL('./fixtures/child-writer.ts', import.meta.url))
const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function runWriters(dir: string, mode: 'shared' | 'tagged', procs: number, count: number, maxFileBytes: number): Promise<void> {
  return Promise.all(
    Array.from(
      { length: procs },
      (_, id) =>
        new Promise<void>((resolve, reject) => {
          const child = spawn(process.execPath, [writer, dir, mode, String(id), String(count), String(maxFileBytes)], { stdio: ['ignore', 'pipe', 'inherit'] })
          child.once('exit', (code) => (code === 0 ? resolve() : reject(new Error(`writer ${id} exited ${code}`))))
        }),
    ),
  ).then(() => undefined)
}

interface Scan {
  files: string[]
  lines: number
  torn: number
  perProc: Map<number, Set<number>>
  oversize: number
}

function scan(dir: string, maxFileBytes: number): Scan {
  const files = readdirSync(dir).filter((f) => f.endsWith('.ndjson'))
  const perProc = new Map<number, Set<number>>()
  let lines = 0
  let torn = 0
  let oversize = 0
  for (const f of files) {
    if (statSync(join(dir, f)).size > maxFileBytes) oversize++
    for (const line of readFileSync(join(dir, f), 'utf8').split('\n')) {
      if (!line) continue
      lines++
      try {
        const r = JSON.parse(line) as { proc: number; i: number }
        if (!perProc.has(r.proc)) perProc.set(r.proc, new Set())
        perProc.get(r.proc)?.add(r.i)
      } catch {
        torn++
      }
    }
  }
  return { files, lines, torn, perProc, oversize }
}

const PROCS = 4
const COUNT = 20_000

describe('multiple processes, one log directory', () => {
  test('tagged per-process files (the chosen design): no torn lines, nothing lost, size cap respected', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const cap = 256 * 1024
    await runWriters(dir, 'tagged', PROCS, COUNT, cap)
    const s = scan(dir, cap)
    expect(s.torn).toBe(0)
    expect(s.oversize).toBe(0)
    for (let p = 0; p < PROCS; p++) expect(s.perProc.get(p)?.size).toBe(COUNT)
    expect(s.lines).toBe(PROCS * COUNT)
    console.log(`[multiprocess:tagged] ${PROCS} procs × ${COUNT} lines → ${s.files.length} files, torn=0, oversize=0`)
  })

  test('shared file, no size rotation: O_APPEND batches (≤ 256 KB) stayed whole on this OS (observed; the design does not rely on it)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const cap = 1024 * 1024 * 1024
    await runWriters(dir, 'shared', PROCS, COUNT, cap)
    const s = scan(dir, cap)
    console.log(`[multiprocess:shared] files=${s.files.length} lines=${s.lines} torn=${s.torn} per-proc=${[...s.perProc.values()].map((v) => v.size).join('/')} (${process.platform})`)
    // Observed on Windows (FILE_APPEND_DATA) for whole-line batches up to 256 KB. Not guaranteed by
    // POSIX for large writes or by network file systems, which is one reason tagged files are chosen.
    expect(s.torn).toBe(0)
    for (let p = 0; p < PROCS; p++) expect(s.perProc.get(p)?.size).toBe(COUNT)
  })

  test('shared file WITH size rotation: processes disagree about parts (why shared files are rejected)', async () => {
    const { dir, cleanup } = tempDir()
    cleanups.push(cleanup)
    const cap = 256 * 1024
    await runWriters(dir, 'shared', PROCS, COUNT, cap)
    const s = scan(dir, cap)
    console.log(`[multiprocess:shared+rotation] files=${s.files.length} oversize=${s.oversize} torn=${s.torn} lines=${s.lines}`)
    // Each process tracks the file size on its own, so files overshoot the cap.
    expect(s.oversize).toBeGreaterThan(0)
  })
})
