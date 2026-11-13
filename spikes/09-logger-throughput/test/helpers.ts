import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareLogFiles } from '../src/rotate.ts'
import type { Batch, FileWriter, FileWriterFactory, Transport } from '../src/transports/types.ts'

/** A fresh temp directory; returns it and a cleanup function. */
export function tempDir(prefix = 'sv-logs-'): { dir: string; cleanup: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return { dir, cleanup: () => rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }) }
}

/** Parse every NDJSON file in `dir` (sorted by name). Throws on any torn/invalid line. */
export function readLogDir(dir: string): Array<{ file: string; records: Array<Record<string, unknown>> }> {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.ndjson'))
    .sort(compareLogFiles)
    .map((file) => {
      const text = readFileSync(join(dir, file), 'utf8')
      if (text.length > 0 && !text.endsWith('\n')) throw new Error(`${file}: last line is not terminated`)
      const records = text
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l, i) => {
          try {
            return JSON.parse(l) as Record<string, unknown>
          } catch {
            throw new Error(`${file}:${i + 1}: torn or invalid line: ${l.slice(0, 120)}`)
          }
        })
      return { file, records }
    })
}

/** In-memory transport that records batches (optionally slow or failing). */
export function memoryTransport(opts: { delayMs?: number } = {}): Transport & { batches: Batch[]; text: () => string } {
  const batches: Batch[] = []
  return {
    name: 'memory',
    batches,
    text: () => batches.map((b) => b.text).join(''),
    async write(batch: Batch): Promise<void> {
      if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs))
      batches.push(batch)
    },
    async close(): Promise<void> {},
  }
}

/** A stream stand-in that captures what the stderr fallback writes. */
export function captureStream(): { stream: { write(chunk: string): boolean }; lines: () => Array<Record<string, unknown>> } {
  let text = ''
  return {
    stream: {
      write(chunk: string): boolean {
        text += chunk
        return true
      },
    },
    lines: () =>
      text
        .split('\n')
        .filter((l) => l.length > 0)
        .map((l) => JSON.parse(l) as Record<string, unknown>),
  }
}

/** A file writer factory whose writes fail with a given errno code (e.g. ENOSPC = disk full). */
export function failingWriter(code: string, after = 0): FileWriterFactory {
  let writes = 0
  return async (): Promise<FileWriter> => ({
    async append(): Promise<void> {
      writes++
      if (writes > after) throw Object.assign(new Error(`${code}: simulated`), { code })
    },
    async close(): Promise<void> {},
  })
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
